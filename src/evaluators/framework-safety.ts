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

  // ── JS/TS Frameworks ──────────────────────────────────────────────────────
  if (lang === "javascript" || lang === "typescript") {
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
        if (
          lastErrorMw >= 0 &&
          i > lastErrorMw &&
          /app\.(?:get|post|put|patch|delete|all)\s*\(\s*["']/i.test(lines[i])
        ) {
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
  } // end JS/TS frameworks

  // ── Django / Flask (Python) ───────────────────────────────────────────────
  if (lang === "python") {
    const hasDjango = testCode(code, /from\s+django\b|import\s+django\b/i);
    const hasFlask = testCode(code, /from\s+flask\b|import\s+flask\b/i);
    const hasFastAPI = testCode(code, /from\s+fastapi\b|import\s+fastapi\b/i);

    // Django: DEBUG = True in production-like settings
    if (hasDjango) {
      const debugTrueLines = getLineNumbers(code, /^\s*DEBUG\s*=\s*True\b/gm);
      if (debugTrueLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Django DEBUG=True — must be False in production",
          description:
            "DEBUG=True exposes stack traces, SQL queries, and full settings to end users on error pages. This leaks secrets and internal architecture details.",
          lineNumbers: debugTrueLines,
          recommendation:
            "Set DEBUG = False in production settings. Use environment variables: DEBUG = os.environ.get('DEBUG', 'False') == 'True'.",
          reference: "Django Settings — https://docs.djangoproject.com/en/5.0/ref/settings/#debug",
          confidence: 0.9,
        });
      }

      // Django: ALLOWED_HOSTS = ['*']
      const wildcardHostLines = getLineNumbers(code, /ALLOWED_HOSTS\s*=\s*\[\s*["']\*["']\s*\]/gm);
      if (wildcardHostLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Django ALLOWED_HOSTS=['*'] — host header injection risk",
          description:
            "Wildcard ALLOWED_HOSTS disables host header validation, enabling cache poisoning and password-reset email poisoning attacks.",
          lineNumbers: wildcardHostLines,
          recommendation: "Set ALLOWED_HOSTS to specific domains: ALLOWED_HOSTS = ['example.com', 'www.example.com'].",
          reference: "Django ALLOWED_HOSTS — https://docs.djangoproject.com/en/5.0/ref/settings/#allowed-hosts",
          confidence: 0.9,
        });
      }

      // Django: raw SQL queries (SQL injection via string formatting)
      const rawSqlLines = getLineNumbers(
        code,
        /\.raw\s*\(\s*f["']|\.raw\s*\(\s*["'].*%s|\.extra\s*\(\s*(?:where|select)\s*=|cursor\.execute\s*\(\s*f["']|cursor\.execute\s*\(\s*["'].*%/gm,
      );
      if (rawSqlLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Django raw SQL with string interpolation — SQL injection",
          description:
            "Raw SQL queries use f-strings or % formatting with user data. Django's ORM parameterizes queries automatically; raw queries with string formatting bypass this protection.",
          lineNumbers: rawSqlLines,
          recommendation:
            "Use parameterized queries: Model.objects.raw('SELECT * FROM t WHERE id = %s', [user_id]) or use the ORM.",
          reference:
            "Django SQL Injection — https://docs.djangoproject.com/en/5.0/topics/security/#sql-injection-protection",
          confidence: 0.9,
        });
      }

      // Django: SECRET_KEY hardcoded
      const secretKeyLines = getLineNumbers(code, /^\s*SECRET_KEY\s*=\s*["'][^"']{8,}["']/gm);
      if (secretKeyLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Django SECRET_KEY hardcoded — credential exposure",
          description:
            "SECRET_KEY is hardcoded in source code. This key is used for session signing, CSRF tokens, and cryptographic operations. If leaked, attackers can forge sessions.",
          lineNumbers: secretKeyLines,
          recommendation:
            "Load from environment: SECRET_KEY = os.environ['SECRET_KEY']. Never commit secrets to version control.",
          reference: "Django SECRET_KEY — https://docs.djangoproject.com/en/5.0/ref/settings/#secret-key",
          confidence: 0.9,
        });
      }

      // Django: @csrf_exempt decorator
      const csrfExemptLines = getLineNumbers(code, /@csrf_exempt/gm);
      if (csrfExemptLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Django @csrf_exempt — CSRF protection disabled",
          description:
            "CSRF protection is explicitly disabled on this view. Attackers can trick authenticated users into executing unintended actions via crafted forms on malicious sites.",
          lineNumbers: csrfExemptLines,
          recommendation:
            "Remove @csrf_exempt and ensure CSRF tokens are included in forms. For APIs, use Django REST Framework's session or token authentication which handles CSRF differently.",
          reference: "Django CSRF — https://docs.djangoproject.com/en/5.0/ref/csrf/",
          confidence: 0.9,
        });
      }

      // Django: |safe template filter
      const safeFilterLines = getLineNumbers(code, /\{\{.*\|\s*safe\s*\}\}/gm);
      if (safeFilterLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Django |safe filter — XSS vulnerability",
          description:
            "The |safe template filter marks content as safe for HTML rendering, bypassing Django's auto-escaping. If the content includes user input, this is an XSS vector.",
          lineNumbers: safeFilterLines,
          recommendation:
            "Remove |safe and let Django auto-escape. If raw HTML is needed, sanitize with bleach or django-bleach before marking safe.",
          reference: "Django Templates — https://docs.djangoproject.com/en/5.0/ref/templates/builtins/#safe",
          confidence: 0.85,
        });
      }
    }

    // Flask: app.run(debug=True)
    if (hasFlask) {
      const flaskDebugLines = getLineNumbers(code, /app\.run\s*\([^)]*debug\s*=\s*True/gm);
      if (flaskDebugLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Flask debug mode enabled — remote code execution risk",
          description:
            "Flask's debug mode exposes an interactive debugger with code execution capabilities. The Werkzeug debugger allows arbitrary Python execution if the debugger PIN is guessed or leaked.",
          lineNumbers: flaskDebugLines,
          recommendation:
            "Never use debug=True in production. Use environment variables: app.run(debug=os.environ.get('FLASK_DEBUG', False)).",
          reference: "Flask Security — https://flask.palletsprojects.com/en/3.0.x/debugging/",
          confidence: 0.95,
        });
      }

      // Flask: render_template_string with user input
      const renderStringLines = getLineNumbers(code, /render_template_string\s*\(/gm);
      if (renderStringLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Flask render_template_string — server-side template injection (SSTI)",
          description:
            "render_template_string evaluates Jinja2 templates from dynamic strings. If user input reaches the template string, attackers can execute arbitrary Python code via SSTI (e.g., {{config}}). ",
          lineNumbers: renderStringLines,
          recommendation:
            "Use render_template with file-based templates instead. Never pass user input into template strings.",
          reference: "Flask SSTI — https://flask.palletsprojects.com/en/3.0.x/api/#flask.render_template_string",
          confidence: 0.9,
        });
      }

      // Flask: SECRET_KEY hardcoded
      const flaskSecretLines = getLineNumbers(
        code,
        /app\.(?:secret_key|config\s*\[\s*["']SECRET_KEY["']\s*\])\s*=\s*["'][^"']{4,}["']/gm,
      );
      if (flaskSecretLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Flask SECRET_KEY hardcoded — session forgery risk",
          description:
            "SECRET_KEY is hardcoded in source code. This key signs session cookies. If leaked, attackers can forge authenticated sessions for any user.",
          lineNumbers: flaskSecretLines,
          recommendation:
            "Load from environment: app.secret_key = os.environ['SECRET_KEY']. Use python-dotenv for development.",
          reference: "Flask Sessions — https://flask.palletsprojects.com/en/3.0.x/quickstart/#sessions",
          confidence: 0.9,
        });
      }

      // Flask: Markup() or |safe with user data
      const markupLines = getLineNumbers(code, /Markup\s*\(\s*f["']|Markup\s*\(\s*.*\+/gm);
      if (markupLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Flask Markup() with string interpolation — XSS risk",
          description:
            "Markup() marks strings as safe HTML. Using f-strings or concatenation with user data inside Markup() bypasses Jinja2's auto-escaping.",
          lineNumbers: markupLines,
          recommendation:
            "Use Markup.escape() for user data, or avoid Markup() entirely — let Jinja2 auto-escape: {{ variable }}.",
          reference: "Flask Markup — https://markupsafe.palletsprojects.com/en/2.1.x/",
          confidence: 0.85,
        });
      }
    }

    // FastAPI: no dependency injection for auth
    if (hasFastAPI) {
      const routeNoDepLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (isCommentLine(lines[i])) continue;
        // Route decorator without Depends(...)
        if (/^@(?:app|router)\.(?:get|post|put|delete|patch)\s*\(/i.test(lines[i].trim())) {
          // Check if function has Depends() parameter within next 5 lines
          const funcLines = lines.slice(i, Math.min(i + 6, lines.length)).join(" ");
          if (/(?:async\s+)?def\s+\w+/.test(funcLines) && !/Depends\s*\(/.test(funcLines)) {
            // Check if it looks like it needs auth (has db access, returns sensitive data)
            const bodyEnd = Math.min(i + 20, lines.length);
            const bodyChunk = lines.slice(i, bodyEnd).join(" ");
            if (/(?:session|db|database|query|update|delete|password|email|user)/i.test(bodyChunk)) {
              routeNoDepLines.push(i + 1);
            }
          }
        }
      }
      if (routeNoDepLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "FastAPI route with data access but no dependency injection for auth",
          description:
            "Route handlers access database or sensitive data without a Depends() parameter for authentication. FastAPI's dependency injection system should enforce auth at the route level.",
          lineNumbers: routeNoDepLines,
          recommendation:
            "Add auth dependency: async def endpoint(current_user: User = Depends(get_current_user)). Use OAuth2PasswordBearer or similar.",
          reference: "FastAPI Security — https://fastapi.tiangolo.com/tutorial/security/",
          confidence: 0.7,
          isAbsenceBased: true,
        });
      }
    }
  }

  // ── Spring Boot (Java) ────────────────────────────────────────────────────
  if (lang === "java") {
    const hasSpring = testCode(
      code,
      /import\s+org\.springframework\b|@SpringBootApplication|@RestController|@Controller/i,
    );

    if (hasSpring) {
      // Spring: CSRF disabled
      const csrfDisabledLines = getLineNumbers(
        code,
        /\.csrf\s*\(\s*\)\s*\.disable\s*\(\s*\)|csrf\s*\.\s*disable\s*\(\s*\)/gm,
      );
      if (csrfDisabledLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Spring Security CSRF protection disabled",
          description:
            "CSRF protection is explicitly disabled in Spring Security configuration. For browser-based applications, this allows cross-site request forgery attacks.",
          lineNumbers: csrfDisabledLines,
          recommendation:
            'Keep CSRF enabled for browser-based apps. If this is a purely stateless API with token auth, document the decision. For REST APIs, consider using csrf().ignoringRequestMatchers("/api/**").',
          reference: "Spring CSRF — https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html",
          confidence: 0.85,
        });
      }

      // Spring: @Query with string concatenation (SQL injection)
      const queryInjectionLines = getLineNumbers(
        code,
        /@Query\s*\(\s*["'].*\+\s*|@Query\s*\(\s*["'].*\$\{|nativeQuery\s*=\s*true[^)]*\+/gm,
      );
      if (queryInjectionLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Spring @Query with string concatenation — SQL injection",
          description:
            "JPA @Query annotation uses string concatenation or interpolation to build SQL. This bypasses JPA's parameterized query protection and enables SQL injection.",
          lineNumbers: queryInjectionLines,
          recommendation:
            'Use parameterized queries with ?1, ?2 or :paramName placeholders: @Query("SELECT u FROM User u WHERE u.name = :name").',
          reference: "Spring Data JPA — https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html",
          confidence: 0.9,
        });
      }

      // Spring: @CrossOrigin("*") — permissive CORS
      const corsWildcardLines = getLineNumbers(
        code,
        /@CrossOrigin\s*\(\s*(?:["']\*["']|origins\s*=\s*["']\*["'])\s*\)/gm,
      );
      if (corsWildcardLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: 'Spring @CrossOrigin("*") — permissive CORS',
          description:
            "Wildcard CORS allows any origin to make authenticated requests. Combined with credentials, this enables cross-origin data theft.",
          lineNumbers: corsWildcardLines,
          recommendation: 'Restrict origins to specific domains: @CrossOrigin(origins = "https://app.example.com").',
          reference: "Spring CORS — https://docs.spring.io/spring-framework/reference/web/webmvc-cors.html",
          confidence: 0.9,
        });
      }

      // Spring: @RequestMapping without method restriction
      const requestMappingNoMethodLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (isCommentLine(lines[i])) continue;
        if (/@RequestMapping\s*\(\s*["']/.test(lines[i]) && !/method\s*=/.test(lines[i])) {
          requestMappingNoMethodLines.push(i + 1);
        }
      }
      if (requestMappingNoMethodLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Spring @RequestMapping without HTTP method — accepts all methods",
          description:
            "@RequestMapping without method restriction responds to GET, POST, PUT, DELETE, and all other HTTP methods. This expands the attack surface unnecessarily.",
          lineNumbers: requestMappingNoMethodLines,
          recommendation:
            'Use specific annotations: @GetMapping, @PostMapping, @PutMapping, @DeleteMapping. Or specify method: @RequestMapping(value="/path", method=RequestMethod.GET).',
          reference: "Spring MVC — https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html",
          confidence: 0.85,
        });
      }

      // Spring: Exposing entity directly in REST response (data leak)
      const entityInResponseLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (isCommentLine(lines[i])) continue;
        // Method returning @Entity-annotated class directly
        if (
          /public\s+(?:ResponseEntity<)?(?:List<)?(?:User|Account|Customer|Admin|Employee|Person)\b/.test(lines[i]) &&
          /@(?:Get|Post|Put|Delete)Mapping|@RequestMapping/.test(lines.slice(Math.max(0, i - 3), i).join(" "))
        ) {
          entityInResponseLines.push(i + 1);
        }
      }
      if (entityInResponseLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Spring REST endpoint returns JPA entity directly — data exposure risk",
          description:
            "REST endpoints return JPA entity objects directly, which may include sensitive fields (passwords, internal IDs, audit timestamps) that shouldn't be exposed to clients.",
          lineNumbers: entityInResponseLines,
          recommendation:
            "Use DTOs (Data Transfer Objects) or @JsonIgnore to control serialized fields. Consider Spring's @JsonView for different serialization profiles.",
          reference:
            "Spring REST Best Practices — https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html",
          confidence: 0.75,
          isAbsenceBased: true,
        });
      }

      // Spring: Actuator endpoints exposed without security
      const actuatorLines = getLineNumbers(code, /management\.endpoints\.web\.exposure\.include\s*=\s*\*/gm);
      if (actuatorLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Spring Boot Actuator — all endpoints exposed",
          description:
            "All actuator endpoints are exposed (include=*), including /env, /heapdump, /beans which leak secrets, memory contents, and internal configuration.",
          lineNumbers: actuatorLines,
          recommendation:
            "Expose only needed endpoints: management.endpoints.web.exposure.include=health,info,metrics. Secure with Spring Security.",
          reference: "Spring Actuator — https://docs.spring.io/spring-boot/reference/actuator/endpoints.html",
          confidence: 0.95,
        });
      }
    }
  }

  // ── ASP.NET Core (C#) ─────────────────────────────────────────────────────
  if (lang === "csharp") {
    const hasAspNet = testCode(
      code,
      /using\s+Microsoft\.AspNetCore\b|WebApplication\b|IApplicationBuilder\b|\[ApiController\]|\[HttpGet|MapGet|MapPost/i,
    );

    if (hasAspNet) {
      // ASP.NET: CORS wildcard
      const corsAnyLines = getLineNumbers(code, /\.AllowAnyOrigin\s*\(\s*\)|WithOrigins\s*\(\s*["']\*["']\s*\)/gm);
      if (corsAnyLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "ASP.NET Core CORS allows any origin",
          description:
            "CORS policy is configured with AllowAnyOrigin() or wildcard. This allows any website to make authenticated cross-origin requests to your API.",
          lineNumbers: corsAnyLines,
          recommendation:
            'Restrict to specific origins: builder.WithOrigins("https://app.example.com"). Never combine AllowAnyOrigin with AllowCredentials.',
          reference: "ASP.NET CORS — https://learn.microsoft.com/aspnet/core/security/cors",
          confidence: 0.9,
        });
      }

      // ASP.NET: Anti-forgery disabled
      const antiForgeryOffLines = getLineNumbers(
        code,
        /\[IgnoreAntiforgeryToken\]|\[ValidateAntiForgeryToken\s*\(\s*false\s*\)\]|options\.SuppressAntiforgery/gm,
      );
      if (antiForgeryOffLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "ASP.NET anti-forgery token validation disabled",
          description:
            "Anti-forgery (CSRF) token validation is disabled for this endpoint. Browser-based clients are vulnerable to cross-site request forgery attacks.",
          lineNumbers: antiForgeryOffLines,
          recommendation:
            "Remove [IgnoreAntiforgeryToken] for browser-facing endpoints. For pure API endpoints with bearer token auth, document the exception.",
          reference: "ASP.NET Anti-forgery — https://learn.microsoft.com/aspnet/core/security/anti-request-forgery",
          confidence: 0.85,
        });
      }

      // ASP.NET: SQL injection via string interpolation
      const sqlInjectionLines = getLineNumbers(
        code,
        /(?:ExecuteSqlRaw|FromSqlRaw|SqlQuery)\s*\(\s*\$"|\.ExecuteReader\s*\(\s*\$"|SqlCommand\s*\(\s*\$"/gm,
      );
      if (sqlInjectionLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "ASP.NET raw SQL with string interpolation — SQL injection",
          description:
            'Raw SQL methods use C# string interpolation ($""), which embeds user input directly. EF Core\'s FromSqlInterpolated automatically parameterizes; FromSqlRaw does not.',
          lineNumbers: sqlInjectionLines,
          recommendation:
            'Use FromSqlInterpolated() which auto-parameterizes: context.Users.FromSqlInterpolated($"SELECT * FROM Users WHERE Id = {id}").',
          reference: "EF Core Raw SQL — https://learn.microsoft.com/ef/core/querying/sql-queries",
          confidence: 0.9,
        });
      }

      // ASP.NET: Exception details exposed
      const devExceptionLines = getLineNumbers(code, /app\.UseDeveloperExceptionPage\s*\(\s*\)/gm);
      if (devExceptionLines.length > 0) {
        const isConditional = testCode(
          code,
          /if\s*\(\s*(?:app\.Environment\.IsDevelopment|env\.IsDevelopment)\s*\(\s*\)\s*\)[^}]*UseDeveloperExceptionPage/,
        );
        if (!isConditional) {
          findings.push({
            ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
            severity: "high",
            title: "ASP.NET UseDeveloperExceptionPage without environment check",
            description:
              "Developer exception page is enabled unconditionally. In production, this exposes stack traces, source code, and environment variables to users.",
            lineNumbers: devExceptionLines,
            recommendation:
              "Wrap in environment check: if (app.Environment.IsDevelopment()) { app.UseDeveloperExceptionPage(); }",
            reference: "ASP.NET Error Handling — https://learn.microsoft.com/aspnet/core/fundamentals/error-handling",
            confidence: 0.85,
          });
        }
      }

      // ASP.NET: Hardcoded connection strings
      const connStringLines = getLineNumbers(
        code,
        /["'](?:Server|Data Source)\s*=\s*[^"']*;.*(?:Password|Pwd)\s*=\s*[^"']*["']/gm,
      );
      if (connStringLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "ASP.NET hardcoded connection string with credentials",
          description:
            "Database connection string with embedded password is hardcoded in source code. This exposes database credentials if the code is committed to version control.",
          lineNumbers: connStringLines,
          recommendation:
            'Use configuration: builder.Configuration.GetConnectionString("DefaultConnection"). Store secrets in Azure Key Vault or user-secrets for development.',
          reference: "ASP.NET Configuration — https://learn.microsoft.com/aspnet/core/fundamentals/configuration",
          confidence: 0.9,
        });
      }

      // ASP.NET: [AllowAnonymous] on sensitive endpoints
      const allowAnonLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/\[AllowAnonymous\]/.test(lines[i])) {
          // Check if next few lines have sensitive operation names
          const chunk = lines.slice(i, Math.min(i + 5, lines.length)).join(" ");
          if (/(?:Delete|Update|Admin|Create|Modify|Write|Upload|Execute)/i.test(chunk)) {
            allowAnonLines.push(i + 1);
          }
        }
      }
      if (allowAnonLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "ASP.NET [AllowAnonymous] on sensitive operation",
          description:
            "[AllowAnonymous] allows unauthenticated access to endpoints that perform write, delete, or admin operations. This likely bypasses intended authorization.",
          lineNumbers: allowAnonLines,
          recommendation:
            'Remove [AllowAnonymous] and use [Authorize] with appropriate roles: [Authorize(Roles = "Admin")].',
          reference: "ASP.NET Authorization — https://learn.microsoft.com/aspnet/core/security/authorization/simple",
          confidence: 0.8,
        });
      }
    }
  }

  // ── Gin / Echo / Fiber (Go) ───────────────────────────────────────────────
  if (lang === "go") {
    const hasGin = testCode(code, /["']github\.com\/gin-gonic\/gin["']|gin\.Default\s*\(\s*\)|gin\.New\s*\(\s*\)/i);
    const hasEcho = testCode(code, /["']github\.com\/labstack\/echo["']|echo\.New\s*\(\s*\)/i);
    const hasFiber = testCode(code, /["']github\.com\/gofiber\/fiber["']|fiber\.New\s*\(\s*\)/i);

    if (hasGin || hasEcho || hasFiber) {
      // Go: Binding without validation
      const bindNoValidateLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (isCommentLine(lines[i])) continue;
        if (/\.(?:Bind|ShouldBind|BindJSON|ShouldBindJSON)\s*\(/.test(lines[i])) {
          // Check for validate tag usage
          const bodyEnd = Math.min(i + 10, lines.length);
          const bodyChunk = lines.slice(i, bodyEnd).join(" ");
          if (!/validate\.Struct|binding:"required|validator\.Validate/.test(bodyChunk)) {
            bindNoValidateLines.push(i + 1);
          }
        }
      }
      if (bindNoValidateLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Go HTTP binding without input validation",
          description:
            'Request data is bound to structs without validation. Without struct tag validation (binding:"required") or explicit validator calls, malformed or malicious input may proceed unchecked.',
          lineNumbers: bindNoValidateLines,
          recommendation:
            'Use struct tags: `json:"name" binding:"required,min=1,max=100"` with ShouldBindJSON, or validate explicitly with go-playground/validator.',
          reference: "Gin Validation — https://gin-gonic.com/docs/examples/binding-and-validation/",
          confidence: 0.75,
          isAbsenceBased: true,
        });
      }

      // Go: SQL query string building
      const goSqlInjectionLines = getLineNumbers(
        code,
        /(?:db\.(?:Query|Exec|QueryRow)|tx\.(?:Query|Exec|QueryRow))\s*\(\s*(?:fmt\.Sprintf|.*\+\s*)/gm,
      );
      if (goSqlInjectionLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Go SQL query with string formatting — SQL injection",
          description:
            "SQL queries use fmt.Sprintf or string concatenation to embed values. Go's database/sql library supports parameterized queries ($1, ?) that prevent SQL injection.",
          lineNumbers: goSqlInjectionLines,
          recommendation: 'Use parameterized queries: db.Query("SELECT * FROM users WHERE id = $1", userID).',
          reference: "Go database/sql — https://pkg.go.dev/database/sql",
          confidence: 0.9,
        });
      }

      // Go: Gin TrustedProxies not configured
      if (hasGin) {
        const hasTrustedProxies = testCode(code, /\.SetTrustedProxies\s*\(|TrustedProxies/i);
        const hasProxyHint = testCode(code, /proxy|nginx|loadbalanc|X-Forwarded|CDN/i);
        if (!hasTrustedProxies && hasProxyHint) {
          findings.push({
            ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
            severity: "medium",
            title: "Gin TrustedProxies not configured — IP spoofing risk",
            description:
              "Gin router doesn't configure SetTrustedProxies() despite proxy references. Without this, any client can spoof X-Forwarded-For to bypass IP-based security.",
            lineNumbers: [1],
            recommendation:
              'Set trusted proxies: router.SetTrustedProxies([]string{"10.0.0.0/8"}) or router.SetTrustedProxies(nil) to disable header reading.',
            reference: "Gin Trusted Proxies — https://gin-gonic.com/docs/quickstart/#don-t-trust-all-proxies",
            confidence: 0.75,
            isAbsenceBased: true,
          });
        }
      }

      // Go: Serving static files from project root
      const goStaticRootLines = getLineNumbers(code, /\.Static\s*\(\s*["']\/["']\s*,\s*["']\.["']\s*\)/gm);
      if (goStaticRootLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Go HTTP static file server at project root — file exposure",
          description:
            "Static file handler serves from the project root directory, exposing source code, .env files, go.sum, and other sensitive files.",
          lineNumbers: goStaticRootLines,
          recommendation: 'Serve from a dedicated directory: router.Static("/static", "./public").',
          confidence: 0.9,
        });
      }

      // Go: html/template with unescaped content
      const unsafeTemplateLines = getLineNumbers(code, /template\.HTML\s*\(|\.Funcs\s*\(.*"safe|"noescape"/gm);
      if (unsafeTemplateLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`, // eslint-disable-line no-useless-assignment
          severity: "high",
          title: "Go template with unsafe HTML casting — XSS risk",
          description:
            "template.HTML() casts strings to unescaped HTML, bypassing Go's template auto-escaping. If user input reaches this cast, it's an XSS vulnerability.",
          lineNumbers: unsafeTemplateLines,
          recommendation:
            "Avoid template.HTML(). Let Go's html/template auto-escape content. If raw HTML is needed, sanitize with bluemonday first.",
          reference: "Go html/template — https://pkg.go.dev/html/template",
          confidence: 0.85,
        });
      }
    }
  }

  return findings;
}
