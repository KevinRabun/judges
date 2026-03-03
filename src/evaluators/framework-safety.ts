import type { Finding } from "../types.js";
import { getLineNumbers, getLangFamily, isCommentLine, testCode } from "./shared.js";

/**
 * Framework-specific deep safety rules.
 *
 * Detects misuse patterns unique to popular frameworks that generic rules miss:
 * - React: hook violations, unsafe lifecycle, XSS via dangerouslySetInnerHTML
 * - Express/Koa/Fastify: middleware ordering, body-parser pitfalls, error middleware
 * - Next.js: SSR data leaks, getServerSideProps security, API route exposure
 * - Angular: bypassSecurityTrust, template injection, zone.js anti-patterns
 * - Vue: v-html without sanitization, computed vs watch misuse
 */
export function analyzeFrameworkSafety(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  let ruleNum = 1;
  const prefix = "FW";
  const lang = getLangFamily(language);

  if (lang !== "javascript" && lang !== "typescript") return findings;

  // ── React Hook Violations ────────────────────────────────────────────────

  // Conditional hook call — breaks Rules of Hooks
  const conditionalHookLines: number[] = [];
  let inConditional = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (/\bif\s*\(|\bswitch\s*\(|\?\s*$/.test(line)) inConditional++;
    if (
      inConditional > 0 &&
      /\buse(?:State|Effect|Memo|Callback|Ref|Context|Reducer|LayoutEffect|ImperativeHandle|DebugValue)\s*\(/i.test(
        line,
      )
    ) {
      conditionalHookLines.push(i + 1);
    }
    if (/^\s*\}/.test(line) && inConditional > 0) inConditional--;
  }
  if (conditionalHookLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "React hook called conditionally — Rules of Hooks violation",
      description:
        "Hooks must be called at the top level of a React component/custom hook, never inside conditions, loops, or nested functions. Conditional hooks cause stale state and render crashes.",
      lineNumbers: conditionalHookLines,
      recommendation:
        "Move hook calls to the top level of the component. Use the hook's value conditionally instead of calling the hook conditionally.",
      reference: "React Rules of Hooks — https://react.dev/reference/rules/rules-of-hooks",
      suggestedFix:
        "Move the hook call outside the if block: const [value, setValue] = useState(initial); then use value conditionally.",
      confidence: 0.9,
    });
  }

  // Hook inside loop
  const hookInLoopLines: number[] = [];
  let inLoop = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (/\bfor\s*\(|\bwhile\s*\(|\.forEach\s*\(|\.map\s*\(/.test(line)) inLoop++;
    if (inLoop > 0 && /\buse(?:State|Effect|Memo|Callback|Ref|Context|Reducer)\s*\(/i.test(line)) {
      hookInLoopLines.push(i + 1);
    }
    if (/^\s*\}/.test(line) && inLoop > 0) inLoop--;
  }
  if (hookInLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "React hook called inside a loop — Rules of Hooks violation",
      description:
        "Hooks must not be called inside loops. The number of hook calls must be the same on every render. Looped hooks cause unpredictable state corruption.",
      lineNumbers: hookInLoopLines,
      recommendation:
        "Extract the looped logic into a child component that uses its own hooks, or restructure to call hooks at the top level with array state.",
      reference: "React Rules of Hooks — https://react.dev/reference/rules/rules-of-hooks",
      confidence: 0.9,
    });
  }

  // useEffect with missing cleanup for subscriptions/timers
  const effectNoCleanupLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    if (/\buseEffect\s*\(\s*\(\s*\)\s*=>\s*\{/.test(lines[i])) {
      const effectBody = lines.slice(i, Math.min(lines.length, i + 20)).join("\n");
      const hasSubscription =
        /addEventListener|subscribe|setInterval|setTimeout|\.on\(|\.listen\(|socket\.|EventSource|WebSocket/.test(
          effectBody,
        );
      const hasCleanup =
        /return\s*\(\s*\)\s*=>|return\s*\(\)\s*=>|return\s+function|removeEventListener|unsubscribe|clearInterval|clearTimeout|\.off\(|\.close\(/.test(
          effectBody,
        );
      if (hasSubscription && !hasCleanup) {
        effectNoCleanupLines.push(i + 1);
      }
    }
  }
  if (effectNoCleanupLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "useEffect subscribes without cleanup — memory leak risk",
      description:
        "useEffect sets up event listeners, timers, or subscriptions but does not return a cleanup function. On unmount or re-render, old subscriptions accumulate, causing memory leaks.",
      lineNumbers: effectNoCleanupLines,
      recommendation:
        "Return a cleanup function from useEffect that removes listeners/clears timers: return () => { window.removeEventListener('resize', handler); };",
      reference: "React useEffect cleanup — https://react.dev/reference/react/useEffect",
      suggestedFix:
        "Add cleanup: useEffect(() => { const id = setInterval(fn, 1000); return () => clearInterval(id); }, []);",
      confidence: 0.85,
    });
  }

  // useEffect with object/array literal as dependency → infinite re-render
  const effectObjDepLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    if (/\buseEffect\s*\(/.test(lines[i]) || /\buseMemo\s*\(/.test(lines[i]) || /\buseCallback\s*\(/.test(lines[i])) {
      const ctx = lines.slice(i, Math.min(lines.length, i + 5)).join(" ");
      // Matches dep arrays containing inline object/array literals: [{ ... }] or [[ ... ]]
      if (/\],\s*\[(?:[^\]]*\{[^}]*\}|[^\]]*\[[^\]]*\])/.test(ctx)) {
        effectObjDepLines.push(i + 1);
      }
    }
  }
  if (effectObjDepLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Inline object/array in hook dependency array — infinite re-render",
      description:
        "Object or array literals in useEffect/useMemo/useCallback dependency arrays create new references every render, causing the hook to fire on every render cycle.",
      lineNumbers: effectObjDepLines,
      recommendation:
        "Extract the object/array to a useMemo or define it outside the component. Compare by primitive values or use a stable reference.",
      reference: "React hook dependency array — https://react.dev/reference/react/useEffect",
      confidence: 0.8,
    });
  }

  // setState in useEffect without dependency guard → infinite loop
  const setStateInEffectLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    if (/\buseEffect\s*\(\s*\(\s*\)\s*=>\s*\{/.test(lines[i])) {
      const effectCtx = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
      const hasSetState = /\bset\w+\s*\(/.test(effectCtx);
      const hasDeps = /\],\s*\[/.test(effectCtx) || /\}\s*,\s*\[\s*\]/.test(effectCtx);
      if (hasSetState && !hasDeps) {
        setStateInEffectLines.push(i + 1);
      }
    }
  }
  if (setStateInEffectLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "setState in useEffect without dependency array — potential infinite loop",
      description:
        "Calling setState inside a useEffect with no dependency array causes the component to re-render, which re-runs the effect, which calls setState again — infinite loop.",
      lineNumbers: setStateInEffectLines,
      recommendation:
        "Add a dependency array to useEffect. Use an empty array [] for mount-only effects, or specify the values that should trigger re-run.",
      reference: "React useEffect — https://react.dev/reference/react/useEffect",
      confidence: 0.8,
    });
  }

  // ── Express/Koa/Fastify Middleware Rules ─────────────────────────────────

  // Error-handling middleware position (Express error middleware must be last)
  const expressErrorMwLines: number[] = [];
  const hasExpressApp = testCode(
    code,
    /\bexpress\s*\(\s*\)|require\s*\(\s*["']express["']\s*\)|from\s+["']express["']/i,
  );
  if (hasExpressApp) {
    let lastErrorMw = -1;
    let hasRouteAfterErrorMw = false;
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      // Express error middleware: app.use((err, req, res, next) => {})
      if (
        /app\.use\s*\(\s*(?:function\s*\(\s*err|(?:\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\))|(?:\(\s*error\s*,\s*req\s*,\s*res\s*,\s*next\s*\)))/i.test(
          lines[i],
        )
      ) {
        lastErrorMw = i;
      }
      // Route registered after error middleware
      if (lastErrorMw >= 0 && i > lastErrorMw && /app\.(?:get|post|put|patch|delete|all)\s*\(\s*["']/i.test(lines[i])) {
        hasRouteAfterErrorMw = true;
        expressErrorMwLines.push(i + 1);
      }
    }
    if (hasRouteAfterErrorMw && lastErrorMw >= 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Express error middleware registered before routes",
        description:
          "Express error-handling middleware (4-parameter function) is registered before route handlers. Routes added after it won't have their errors caught, leading to unhandled rejections.",
        lineNumbers: [lastErrorMw + 1, ...expressErrorMwLines],
        recommendation:
          "Move error-handling middleware to after all route registrations: first register all routes, then app.use(errorHandler).",
        reference: "Express Error Handling — https://expressjs.com/en/guide/error-handling.html",
        suggestedFix:
          "Move app.use((err, req, res, next) => { ... }) to the very end, after all app.get/post/put/delete routes.",
        confidence: 0.9,
      });
    }

    // CORS before auth middleware (information leak)
    let corsLine = -1;
    let authLine = -1;
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (/app\.use\s*\(\s*cors\s*\(/i.test(lines[i]) && corsLine < 0) corsLine = i;
      if (/app\.use\s*\(.*(?:passport|auth|jwt|bearer|session)\b/i.test(lines[i]) && authLine < 0) authLine = i;
    }

    // Body parser without size limit
    const bodyParserNoLimitLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (/(?:express\.json|bodyParser\.json|express\.urlencoded|bodyParser\.urlencoded)\s*\(\s*\)/i.test(lines[i])) {
        bodyParserNoLimitLines.push(i + 1);
      }
    }
    if (bodyParserNoLimitLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Express body parser without size limit — DoS risk",
        description:
          "Body parser middleware is configured without a payload size limit. Attackers can send extremely large request bodies to exhaust server memory.",
        lineNumbers: bodyParserNoLimitLines,
        recommendation:
          "Set a limit: express.json({ limit: '1mb' }) or express.urlencoded({ limit: '1mb', extended: true }).",
        reference: "Express Body Parser — https://expressjs.com/en/api.html#express.json",
        suggestedFix: "Add limit: app.use(express.json({ limit: '1mb' }));",
        confidence: 0.9,
      });
    }

    // Express static serving from project root
    const staticRootLines = getLineNumbers(
      code,
      /express\.static\s*\(\s*(?:__dirname|["']\.\/?["']|["']\.\.\/?\/?["']|process\.cwd\(\))\s*\)/gi,
    );
    if (staticRootLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Express.static serves project root or parent — file exposure risk",
        description:
          "express.static is configured to serve the project root directory. This exposes source code, .env files, package.json, and other sensitive files to the internet.",
        lineNumbers: staticRootLines,
        recommendation:
          "Serve a dedicated directory: express.static(path.join(__dirname, 'public')). Never serve the project root.",
        reference: "Express Static Files — https://expressjs.com/en/starter/static-files.html",
        suggestedFix: "Change to: app.use(express.static(path.join(__dirname, 'public')));",
        confidence: 0.95,
      });
    }

    // Missing helmet() or security headers middleware
    const hasHelmet = testCode(code, /helmet\s*\(|require\s*\(\s*["']helmet["']\)|from\s+["']helmet["']/i);
    const hasRoutes = testCode(code, /app\.(?:get|post|put|patch|delete)\s*\(\s*["']/i);
    if (!hasHelmet && hasRoutes) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Express app without helmet() — missing security headers",
        description:
          "No security headers middleware (helmet) detected in Express app. Without it, responses lack X-Content-Type-Options, X-Frame-Options, CSP, and other defensive headers.",
        lineNumbers: [1],
        recommendation:
          "Install and use helmet: npm install helmet, then app.use(helmet()). This sets 11 security headers with sensible defaults.",
        reference: "Helmet.js — https://helmetjs.github.io/",
        suggestedFix: "Add: import helmet from 'helmet'; app.use(helmet());",
        confidence: 0.8,
      });
    }

    // Trust proxy not set when behind reverse proxy
    const hasTrustProxy = testCode(code, /app\.set\s*\(\s*["']trust proxy["']|trustProxy|trust_proxy/i);
    const hasRateLimit = testCode(code, /rateLimit|rate-limit|express-rate-limit/i);
    const hasProxy = testCode(code, /nginx|reverse.?proxy|load.?balanc|X-Forwarded/i);
    if (!hasTrustProxy && (hasRateLimit || hasProxy)) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Express 'trust proxy' not configured behind reverse proxy",
        description:
          "Rate limiting and IP-based security won't work correctly behind a reverse proxy without 'trust proxy'. All requests appear from 127.0.0.1, making per-IP rate limiting ineffective.",
        lineNumbers: [1],
        recommendation:
          "Set app.set('trust proxy', 1) when behind one proxy, or 'trust proxy' to the number of proxies in the chain.",
        reference: "Express trust proxy — https://expressjs.com/en/guide/behind-proxies.html",
        confidence: 0.75,
      });
    }
  }

  // ── Next.js SSR Security ────────────────────────────────────────────────

  // getServerSideProps leaking secrets to client
  const gssp = /export\s+(?:async\s+)?function\s+getServerSideProps|getStaticProps/;
  if (gssp.test(code)) {
    const serverPropLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (gssp.test(lines[i])) {
        const fnBody = lines.slice(i, Math.min(lines.length, i + 30)).join("\n");
        // Checks if secrets/env vars are returned in props without filtering
        if (/process\.env\.\w+/.test(fnBody) && /return\s*\{[^}]*props\s*:/i.test(fnBody)) {
          const propReturn = fnBody.match(/props\s*:\s*\{([^}]*)\}/);
          if (propReturn && /process\.env|secret|key|token|password|api_key/i.test(propReturn[1])) {
            serverPropLines.push(i + 1);
          }
        }
      }
    }
    if (serverPropLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Next.js getServerSideProps leaks secrets to client props",
        description:
          "Server-side environment variables or secrets are passed directly in getServerSideProps/getStaticProps return props. These values are serialized into the page HTML and visible to anyone.",
        lineNumbers: serverPropLines,
        recommendation:
          "Never pass secrets, API keys, or sensitive env vars in props. Use them server-side only and return sanitized results.",
        reference: "Next.js Data Fetching — https://nextjs.org/docs/basic-features/data-fetching",
        suggestedFix:
          "Use secrets server-side only: const data = await fetch(url, { headers: { Authorization: process.env.API_KEY } }); return { props: { data } };",
        confidence: 0.9,
      });
    }
  }

  // Next.js API routes without authentication checks
  const nextApiRoutePattern =
    /export\s+(?:default\s+)?(?:async\s+)?function\s+handler|export\s+(?:default\s+)?(?:async\s+)?\(\s*req\s*(?::\s*\w+)?\s*,\s*res\s*(?::\s*\w+)?\s*\)/;
  const isNextApiRoute =
    /pages\/api\/|app\/api\//i.test(language) ||
    (testCode(code, nextApiRoutePattern) && testCode(code, /NextApiRequest|NextRequest/i));
  if (isNextApiRoute) {
    const hasAuthCheck =
      /getSession|getServerSession|getToken|auth\(\)|withAuth|requireAuth|session\?\.user|req\.headers\.authorization|Bearer/i.test(
        code,
      );
    if (!hasAuthCheck) {
      const handlerLine = lines.findIndex((l) => nextApiRoutePattern.test(l));
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Next.js API route without authentication check",
        description:
          "API route handler does not check for user session, auth token, or authorization. This endpoint is publicly accessible to anyone who knows the URL.",
        lineNumbers: [Math.max(1, handlerLine + 1)],
        recommendation:
          "Add authentication: const session = await getServerSession(req, res, authOptions); if (!session) return res.status(401).json({ error: 'Unauthorized' });",
        reference: "Next.js API Routes Auth — https://nextjs.org/docs/authentication",
        suggestedFix:
          "Add auth guard: if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' });",
        confidence: 0.8,
      });
    }
  }

  // ── Angular Security ──────────────────────────────────────────────────────

  // bypassSecurityTrustHtml/Url/ResourceUrl/Style/Script
  const bypassLines = getLineNumbers(code, /bypassSecurityTrust(?:Html|Url|ResourceUrl|Style|Script)\s*\(/gi);
  if (bypassLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Angular DomSanitizer bypass — XSS risk",
      description:
        "bypassSecurityTrustHtml/Url/Script explicitly disables Angular's built-in XSS protection. If the input contains user-controlled data, this creates a direct XSS vulnerability.",
      lineNumbers: bypassLines,
      recommendation:
        "Avoid bypassing the sanitizer. If you must render dynamic HTML, sanitize it first with DOMPurify or validate against a strict whitelist. Document why the bypass is necessary.",
      reference: "Angular Security — https://angular.io/guide/security",
      suggestedFix:
        "Use DOMPurify before bypass: this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(userHtml));",
      confidence: 0.95,
    });
  }

  // ── Vue Security ──────────────────────────────────────────────────────────

  // v-html with dynamic data
  const vHtmlLines = getLineNumbers(code, /v-html\s*=\s*["'](?!\s*$)/gi);
  if (vHtmlLines.length > 0) {
    const hasVueSanitize = testCode(code, /DOMPurify|sanitize|xss|purify/i);
    if (!hasVueSanitize) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Vue v-html without sanitization — XSS vulnerability",
        description:
          "v-html renders raw HTML content. If the data source includes user input, this is a direct XSS vector. Unlike interpolation ({{ }}), v-html does not escape content.",
        lineNumbers: vHtmlLines,
        recommendation:
          "Sanitize with DOMPurify before using v-html, or use text interpolation {{ }} wherever possible. Consider vue-sanitize or vue-dompurify-html.",
        reference: "Vue Security — https://vuejs.org/guide/best-practices/security.html",
        suggestedFix:
          'Sanitize: computed: { safeHtml() { return DOMPurify.sanitize(this.rawHtml); } } and use v-html="safeHtml".',
        confidence: 0.85,
      });
    }
  }

  // ── General Framework Patterns ────────────────────────────────────────────

  // Inline arrow functions in JSX event handlers (re-render performance)
  const inlineHandlerLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    if (/\bon\w+=\{(?:\(\)\s*=>|\(\w+\)\s*=>|function\s*\()/.test(lines[i])) {
      inlineHandlerLines.push(i + 1);
    }
  }
  if (inlineHandlerLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Excessive inline arrow functions in JSX event handlers",
      description: `${inlineHandlerLines.length} inline arrow functions in JSX event handlers detected. Each creates a new function on every render, preventing React.memo optimizations on child components.`,
      lineNumbers: inlineHandlerLines.slice(0, 5),
      recommendation:
        "Extract handlers using useCallback or define methods outside JSX: const handleClick = useCallback(() => { ... }, [deps]);",
      reference: "React Performance — https://react.dev/reference/react/useCallback",
      confidence: 0.75,
    });
  }

  // React key prop using array index in dynamic lists
  const keyIndexLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isCommentLine(lines[i])) continue;
    if (
      /key\s*=\s*\{\s*(?:index|i|idx|key)\s*\}/.test(lines[i]) &&
      /\.map\s*\(/.test(lines[Math.max(0, i - 5)] + lines.slice(Math.max(0, i - 5), i).join(" "))
    ) {
      keyIndexLines.push(i + 1);
    }
  }
  if (keyIndexLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "React key prop using array index — may cause render bugs",
      description:
        "Using array index as React key causes issues when items are reordered, added, or removed. React associates state with wrong components, leading to subtle UI bugs.",
      lineNumbers: keyIndexLines,
      recommendation:
        "Use a stable unique identifier as key: key={item.id} instead of key={index}. If items have no natural id, generate one during data creation.",
      reference: "React Keys — https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key",
      confidence: 0.8,
    });
  }

  // React state mutation instead of immutable update
  const stateMutationLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    // Detect patterns like: state.items.push(...), state.count++, state.obj.field = ...
    if (
      /\bstate\.\w+\.(?:push|pop|shift|unshift|splice|sort|reverse)\s*\(/.test(line) ||
      /\bstate\.\w+\s*(?:\+\+|--)/.test(line) ||
      /\bstate\.\w+\.\w+\s*=\s*/.test(line)
    ) {
      stateMutationLines.push(i + 1);
    }
  }
  if (stateMutationLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Direct state mutation instead of immutable update",
      description:
        "State object is mutated directly (push, splice, assignment). React/Redux won't detect the change, causing stale renders and bugs. State updates must be immutable.",
      lineNumbers: stateMutationLines,
      recommendation:
        "Use immutable patterns: setState(prev => ({ ...prev, items: [...prev.items, newItem] })) or use immer/structuredClone for complex updates.",
      reference: "React Updating State — https://react.dev/learn/updating-objects-in-state",
      suggestedFix:
        "Replace state.items.push(x) with setItems(prev => [...prev, x]); or use immer: produce(state, draft => { draft.items.push(x); });",
      confidence: 0.85,
    });
  }

  // dangerouslySetInnerHTML without sanitization
  const dangerousHtmlLines = getLineNumbers(code, /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/gi);
  if (dangerousHtmlLines.length > 0) {
    const hasSanitizer = testCode(code, /DOMPurify|sanitize|purify|xss|sanitizeHtml/i);
    if (!hasSanitizer) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "critical",
        title: "dangerouslySetInnerHTML without DOMPurify — XSS vulnerability",
        description:
          "dangerouslySetInnerHTML injects raw HTML without any sanitization detected in scope. This is a direct XSS vector if the data includes user input.",
        lineNumbers: dangerousHtmlLines,
        recommendation:
          "Always sanitize with DOMPurify: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}. Better yet, use a Markdown renderer or React component tree instead of raw HTML.",
        reference:
          "React DOM Elements — https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html",
        suggestedFix: "Add DOMPurify: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(htmlContent) }}",
        confidence: 0.95,
      });
    }
  }

  return findings;
}
