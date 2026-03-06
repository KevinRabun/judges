import type { Finding, AnalyzeContext } from "../types.js";
import {
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
  isIaCTemplate,
  testCode,
  isLikelyAnalysisCode,
} from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCybersecurity(code: string, language: string, context?: AnalyzeContext): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CYBER";
  const lang = getLangFamily(language);

  // Analysis code references XSS, innerHTML, and credential patterns in regex
  // for detection purposes — these are not actual vulnerabilities.
  if (isLikelyAnalysisCode(code)) return findings;

  // ── AST context (optional — makes detection scope-aware) ──────────────────
  const ast = context?.ast;
  const astImports = new Set(
    (ast?.imports ?? []).map((i) => {
      const parts = i.split("/");
      return (i.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]).toLowerCase();
    }),
  );
  const astFunctions = ast?.functions ?? [];

  // eval() / exec() usage (multi-language)
  const evalLines = getLangLineNumbers(code, language, LP.EVAL_USAGE);
  if (evalLines.length > 0) {
    // AST scope analysis: lower confidence when eval is inside a build/config/codegen
    // utility function with no user-input parameters
    let evalConfidence = 0.95;
    if (astFunctions.length > 0) {
      const evalInSafe = evalLines.every((ln) => {
        const fn = astFunctions.find((f) => ln >= f.startLine && ln <= f.endLine);
        if (!fn) return false;
        return /^(?:compile|codegen|build|generate|transform|transpile|parse|serialize)/i.test(fn.name);
      });
      if (evalInSafe) evalConfidence = 0.7;
    }
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Dangerous eval()/exec() usage",
      description:
        "eval(), exec(), or dynamic code compilation executes arbitrary code and is a primary vector for code injection attacks.",
      lineNumbers: evalLines,
      recommendation:
        "Remove eval() entirely. Use JSON.parse() for data parsing (JS/TS), ast.literal_eval (Python), or a proper expression parser.",
      reference: "OWASP Code Injection — CWE-94",
      suggestedFix: LP.isJsTs(lang) ? "Replace eval(expr) with JSON.parse(expr) or a safe parser." : undefined,
      confidence: evalConfidence,
    });
  }

  // innerHTML / dangerouslySetInnerHTML / v-html / [innerHTML]
  const innerHTMLPattern = /\.innerHTML\s*=|dangerouslySetInnerHTML|v-html\s*=|\[innerHTML\]\s*=/gi;
  const innerHTMLLines = getLineNumbers(code, innerHTMLPattern);
  if (innerHTMLLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential XSS via innerHTML",
      description:
        "Setting innerHTML, dangerouslySetInnerHTML, v-html, or [innerHTML] can lead to Cross-Site Scripting (XSS) if the content includes unsanitized user input.",
      lineNumbers: innerHTMLLines,
      recommendation:
        "Use textContent for plain text, or use a sanitization library (DOMPurify) before inserting HTML. In React, avoid dangerouslySetInnerHTML unless content is sanitized.",
      reference: "OWASP XSS Prevention — CWE-79",
      suggestedFix:
        "Sanitize with DOMPurify: el.innerHTML = DOMPurify.sanitize(untrustedHtml); or use textContent for plain text.",
      confidence: 0.9,
    });
  }

  // Command injection risk (multi-language)
  const cmdLines = getLangLineNumbers(code, language, LP.COMMAND_INJECTION);
  const filteredCmdLines = cmdLines.filter((lineNumber) => {
    const index = lineNumber - 1;
    const context = code
      .split("\n")
      .slice(Math.max(0, index - 3), index + 4)
      .join("\n");

    const dangerousSink =
      /\b(?:exec|execSync|spawn|spawnSync|system|popen|passthru|shell_exec|proc_open|Runtime\.getRuntime\(\)\.exec|subprocess\.(?:Popen|run|call)|os\.system|exec\.Command|ProcessBuilder)\s*\(|`[^`]*#\{/i;
    const safeSink = /\bexecFile\s*\(/i;
    const untrustedInput =
      /(?:req\.|request\.|params[\[.]|query\.|body\.|argv|input|user|prompt|command|\$_(?:GET|POST|REQUEST|COOKIE|SERVER|FILES)\[|call\.(?:parameters|receive)|r\.(?:URL|FormValue|Body|Form))/i;
    const unsafeConstruction =
      /(?:\+\s*\w|\$\{[^}]+\}|#\{[^}]+\}|\.concat\s*\(|\.join\s*\(|shell\s*:\s*true|\.\s*\$\w+|%[sdvq]|fmt\.Sprintf)/i;

    return (
      dangerousSink.test(context) &&
      !safeSink.test(context) &&
      untrustedInput.test(context) &&
      unsafeConstruction.test(context)
    );
  });

  if (filteredCmdLines.length > 0) {
    // AST: boost confidence when the command injection is inside a route handler
    // (function with decorators like @app.route or HTTP method names)
    let cmdConfidence = 0.9;
    if (astFunctions.length > 0) {
      const inRouteHandler = filteredCmdLines.some((ln) => {
        const fn = astFunctions.find((f) => ln >= f.startLine && ln <= f.endLine);
        if (!fn) return false;
        return (
          fn.decorators?.some((d) => /route|get|post|put|delete|patch|api_view/i.test(d)) ||
          /handler|controller|endpoint|route/i.test(fn.name)
        );
      });
      if (inRouteHandler) cmdConfidence = 0.95;
    }
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential command injection",
      description:
        "Shell commands are constructed with string concatenation/interpolation, allowing an attacker to inject arbitrary OS commands if user input is included.",
      lineNumbers: filteredCmdLines,
      recommendation:
        "Use execFile() with an argument array instead of exec(). Never concatenate user input into shell commands. Validate and sanitize all inputs.",
      reference: "OWASP Command Injection — CWE-78",
      suggestedFix:
        "Replace exec(cmd) with execFile('program', [arg1, arg2]) to prevent shell interpretation of user input.",
      confidence: cmdConfidence,
    });
  }

  // Disabled TLS / certificate validation (multi-language)
  const tlsLines = getLangLineNumbers(code, language, LP.TLS_DISABLED);
  if (tlsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "TLS certificate validation disabled",
      description:
        "TLS certificate verification is explicitly disabled, making the application vulnerable to man-in-the-middle (MITM) attacks.",
      lineNumbers: tlsLines,
      recommendation:
        "Never disable TLS certificate validation in production. Use proper CA certificates. If using self-signed certs in development, use a CA bundle instead.",
      reference: "CWE-295: Improper Certificate Validation",
      suggestedFix:
        "Remove rejectUnauthorized: false and NODE_TLS_REJECT_UNAUTHORIZED='0'. Use valid CA certificates instead.",
      confidence: 0.9,
    });
  }

  // Insecure CORS (multi-language)
  const corsLines = getLangLineNumbers(code, language, LP.CORS_WILDCARD);
  // Also detect CORS origin reflection: setting Access-Control-Allow-Origin to the request origin
  const corsReflectionLines: number[] = [];
  {
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      if (
        /Access-Control-Allow-Origin/i.test(line) &&
        /(?:req\.headers\.origin|request\.headers|origin|headers\[)/i.test(line) &&
        !/["']\*["']/.test(line) // not a wildcard (already handled)
      ) {
        corsReflectionLines.push(i + 1);
      }
    }
  }
  const allCorsLines = [...new Set([...corsLines, ...corsReflectionLines])].sort((a, b) => a - b);
  if (allCorsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Overly permissive CORS configuration",
      description:
        "CORS is configured to allow all origins ('*') or reflects the request origin, which may allow malicious websites to make cross-origin requests to your API.",
      lineNumbers: allCorsLines,
      recommendation:
        "Restrict CORS to specific trusted origins. If credentials are used, '*' is not allowed by browsers anyway — be explicit about allowed origins.",
      reference: "OWASP CORS Misconfiguration — CWE-942",
      suggestedFix:
        "Restrict CORS origins: app.use(cors({ origin: ['https://app.example.com'], credentials: true })); never use origin: '*' with credentials.",
      confidence: 0.85,
    });
  }

  // Prototype pollution risk
  // NOTE: Object.assign({}, ...) is intentionally excluded — creating a new
  // empty object as the target is a safe shallow-clone pattern, not pollution.
  const protoPattern = /\.__proto__|lodash\.merge|_\.merge|deepmerge|Object\.keys[^\n]*forEach[^\n]*\[/gi;
  const protoLines = getLineNumbers(code, protoPattern);
  if (protoLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potential prototype pollution risk",
      description:
        "Direct __proto__ access or unchecked Object.assign/deep merge with user-controlled data can lead to prototype pollution attacks.",
      lineNumbers: protoLines,
      recommendation:
        "Use Object.create(null) for map-like objects, validate keys against a whitelist, and use Map instead of plain objects for dynamic keys.",
      reference: "CWE-1321: Improperly Controlled Modification of Object Prototype Attributes",
      suggestedFix:
        "Prevent prototype pollution: use Map for dynamic keys, or validate: if (key === '__proto__' || key === 'constructor') throw new Error('invalid key');",
      confidence: 0.85,
    });
  }

  // Disabled linter/type-checker rules (multi-language)
  const disableLines = getLangLineNumbers(code, language, LP.LINTER_DISABLE, { skipComments: false });
  if (disableLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Linter/type-checker suppression directives found",
      description:
        "Code contains directives to suppress linter or type-checker warnings. While sometimes necessary, these can mask real security or quality issues.",
      lineNumbers: disableLines,
      recommendation:
        "Review each suppression directive to ensure it's justified. Add a comment explaining why the suppression is necessary. Remove any that were added simply to silence warnings.",
      reference: "Secure Coding Best Practices",
      suggestedFix:
        "Add justification comments: // eslint-disable-next-line no-explicit-any -- legacy API returns untyped response, tracked in JIRA-1234.",
      confidence: 0.85,
    });
  }

  // XML External Entity (XXE) injection
  const xxePatterns =
    /DocumentBuilder|SAXParser(?:Factory)?|XMLReader|DOMParser|etree\.(?:parse|XML|fromstring|XMLParser)|xml\.sax|parseXML|lxml\.etree|XmlReader|XmlDocument|LIBXML_NOENT/gi;
  const xxeLines = getLineNumbers(code, xxePatterns);
  if (xxeLines.length > 0) {
    // Strip comments before checking for protection to avoid false positives
    // from comments like "// Missing: FEATURE_SECURE_PROCESSING"
    const codeWithoutComments = code
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/#[^\n]*/g, "");
    const hasProtection =
      /disallow-doctype-decl|FEATURE_SECURE_PROCESSING|resolve_entities\s*=\s*False|DtdProcessing\.Prohibit|LIBXML_NONET|defusedxml/gi.test(
        codeWithoutComments,
      );
    if (!hasProtection) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "XML parsing without XXE protection",
        description:
          "XML is parsed without visible protection against XML External Entity (XXE) injection, which can lead to file disclosure, SSRF, or denial of service.",
        lineNumbers: xxeLines,
        recommendation:
          "Disable external entity resolution and DTD processing in your XML parser. Use defusedxml in Python. Set FEATURE_SECURE_PROCESSING in Java.",
        reference: "OWASP XXE — CWE-611",
        suggestedFix:
          "Disable DTDs: factory.setFeature('http://apache.org/xml/features/disallow-doctype-decl', true); or use defusedxml in Python.",
        confidence: 0.85,
      });
    }
  }

  // LDAP injection (multi-language)
  const ldapPatterns =
    /ldap\.search|ldap_search|DirectorySearcher|LdapTemplate|ldap\.bind|python-ldap|go-ldap|novell\.directory|DirContext|InitialDirContext|NamingEnumeration/gi;
  const ldapLines = getLineNumbers(code, ldapPatterns);
  // Also detect LDAP filter string concatenation: "(uid=" + username + ")"
  const ldapFilterConcat: number[] = [];
  {
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      if (/["']\s*\(\s*&?\s*\(\s*(?:uid|cn|sAMAccountName|userPassword|mail)\s*=\s*["']\s*\+/i.test(line)) {
        ldapFilterConcat.push(i + 1);
      }
      // Also match ctx.search with string concatenation for filter
      if (/\.search\s*\(/i.test(line) && /\+\s*\w/.test(line)) {
        const ctx = codeLines.slice(Math.max(0, i - 5), Math.min(codeLines.length, i + 2)).join("\n");
        if (/(?:ldap|DirContext|InitialDirContext|NamingContext|uid|dn|filter)/i.test(ctx)) {
          ldapFilterConcat.push(i + 1);
        }
      }
    }
  }
  const allLdapLines = [...new Set([...ldapLines, ...ldapFilterConcat])].sort((a, b) => a - b);
  if (allLdapLines.length > 0) {
    const hasLdapSanitation = testCode(code, /escape|sanitize|ldap_escape|filter_format/gi);
    if (!hasLdapSanitation) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential LDAP injection",
        description:
          "LDAP queries are constructed without visible input sanitization, potentially allowing LDAP injection attacks.",
        lineNumbers: allLdapLines,
        recommendation:
          "Escape special LDAP characters in user input. Use parameterized LDAP queries or the ldap_escape function.",
        reference: "OWASP LDAP Injection — CWE-90",
        suggestedFix:
          "Escape LDAP input: const safe = input.replace(/[\\*()\\\\\x00]/g, c => '\\\\' + c.charCodeAt(0).toString(16)); use ldap_escape or parameterized filters.",
        confidence: 0.85,
      });
    }
  }

  // Server-Side Request Forgery (SSRF) (multi-language)
  const ssrfPatterns =
    /(?:fetch|axios|http\.get|requests\.get|urllib|HttpClient|WebClient|curl|reqwest|http\.NewRequest|httpx|aiohttp)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|url\s*=)/gi;
  const ssrfLines = getLineNumbers(code, ssrfPatterns);
  if (ssrfLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential Server-Side Request Forgery (SSRF)",
      description:
        "User input is used to construct a URL for server-side requests, allowing attackers to access internal services, cloud metadata endpoints, or arbitrary external resources.",
      lineNumbers: ssrfLines,
      recommendation:
        "Validate and whitelist allowed URLs/domains. Block access to internal IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.169.254). Use a URL parser to verify the host.",
      reference: "OWASP SSRF — CWE-918",
      suggestedFix:
        "Validate URLs against an allowlist: const url = new URL(input); if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error('blocked');",
      confidence: 0.85,
    });
  }

  // Open redirect (multi-language)
  const redirectPatterns =
    /(?:res\.redirect|Response\.Redirect|redirect|HttpResponseRedirect|header\s*\(\s*["']Location|http\.Redirect|c\.Redirect)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|url\s*=)/gi;
  const redirectLines = getLineNumbers(code, redirectPatterns);
  if (redirectLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potential open redirect",
      description:
        "User-controlled input is used in a redirect URL, which can be exploited for phishing attacks by redirecting users to malicious sites.",
      lineNumbers: redirectLines,
      recommendation:
        "Validate redirect URLs against a whitelist of allowed domains. Use relative paths or map redirect targets to predefined safe URLs.",
      reference: "OWASP Open Redirect — CWE-601",
      suggestedFix:
        "Validate redirect target: const url = new URL(target, req.baseUrl); if (!ALLOWED_HOSTS.includes(url.hostname)) return res.redirect('/'); res.redirect(url.toString());",
      confidence: 0.85,
    });
  }

  // ReDoS (Regular Expression Denial of Service) (multi-language)
  const regexPatterns =
    /(?:new\s+RegExp|re\.compile|Regex\.new|Pattern\.compile|regexp\.Compile|Regex\()\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|user)/gi;
  const regexLines = getLineNumbers(code, regexPatterns);
  if (regexLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "User input in RegExp — ReDoS risk",
      description:
        "User input is used to construct a regular expression, which can cause catastrophic backtracking (ReDoS) with crafted input, hanging the server.",
      lineNumbers: regexLines,
      recommendation:
        "Never use user input in RegExp without escaping. Use safe-regex or re2 for untrusted patterns. Set timeouts on regex operations.",
      reference: "CWE-1333: Inefficient Regular Expression Complexity",
      suggestedFix:
        "Escape user input for regex: const escaped = input.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); or use the re2 library for safe regex execution.",
      confidence: 0.85,
    });
  }

  // Template injection (SSTI)
  const templatePatterns = /render_template_string|nunjucks\.renderString|Handlebars\.compile\s*\(|ERB\.new\s*\(/gi;
  const templateLines = getLineNumbers(code, templatePatterns);
  const filteredTemplateLines = templateLines.filter((lineNumber) => {
    const index = lineNumber - 1;
    const context = code
      .split("\n")
      .slice(Math.max(0, index - 3), index + 4)
      .join("\n");

    const templateSink = /(?:render_template_string|nunjucks\.renderString|Handlebars\.compile\s*\(|ERB\.new\s*\()/i;
    const untrustedInput = /(?:req\.|request\.|params\.|query\.|body\.|input|user)/i;

    return templateSink.test(context) && untrustedInput.test(context);
  });

  if (filteredTemplateLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential Server-Side Template Injection (SSTI)",
      description:
        "User input appears to be passed directly to template rendering, allowing attackers to execute arbitrary code via template syntax.",
      lineNumbers: filteredTemplateLines,
      recommendation:
        "Never pass user input as template source. Use templates only from trusted files with parameterized data. Enable sandboxing if available.",
      reference: "OWASP SSTI — CWE-1336",
      suggestedFix:
        "Use precompiled templates from files: nunjucks.render('template.njk', { data }) instead of renderString(userInput).",
      confidence: 0.9,
    });
  }

  // CRLF injection / HTTP header injection
  const crlfPatterns =
    /(?:setHeader|writeHead|res\.set|response\.header|header\s*\()\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input)/gi;
  const crlfLines = getLineNumbers(code, crlfPatterns);
  if (crlfLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potential HTTP header injection",
      description:
        "User input may be used in HTTP response headers, allowing CRLF injection to set arbitrary headers or split responses.",
      lineNumbers: crlfLines,
      recommendation: "Strip \\r\\n characters from any user input used in headers. Validate and encode header values.",
      reference: "CWE-113: Improper Neutralization of CRLF Sequences",
      suggestedFix:
        "Sanitize header values: const safe = value.replace(/[\\r\\n]/g, ''); res.setHeader('X-Custom', safe);",
      confidence: 0.8,
    });
  }

  // Missing security headers (multi-language)
  const hasHelmet =
    /helmet|X-Content-Type-Options|Content-Security-Policy|X-Frame-Options|Strict-Transport-Security|X-XSS-Protection|SecurityHeaders|secure_headers/gi.test(
      code,
    );
  // AST: also check imports for security header libraries
  const hasSecurityHeaderImport =
    astImports.has("helmet") ||
    astImports.has("secure-headers") ||
    astImports.has("django-security") ||
    astImports.has("flask-talisman") ||
    astImports.has("fastify-helmet");
  const hasServer =
    /app\.(listen|use)|createServer|express\(\)|Flask\(|Django|WebApplication|Startup|actix.web|gin\.Default|SpringBoot|@RestController|http\.ListenAndServe/gi.test(
      code,
    );
  if (hasServer && !hasHelmet && !hasSecurityHeaderImport) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No security headers configured",
      description:
        "HTTP server code does not configure security headers (CSP, X-Frame-Options, HSTS, etc.), leaving it vulnerable to clickjacking, XSS, and other attacks.",
      recommendation:
        "Use helmet (Express), django-security middleware, or manually set: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security.",
      reference: "OWASP Security Headers — CWE-693",
      suggestedFix:
        "Add helmet middleware: import helmet from 'helmet'; app.use(helmet()); — sets CSP, HSTS, X-Frame-Options, and other security headers automatically.",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  // Insecure session configuration (multi-language)
  const sessionPatterns =
    /session\s*\(\s*\{|express-session|SessionMiddleware|session_config|SessionOptions|gorilla\/sessions|actix.session|HttpSession/gi;
  const sessionLines = getLineNumbers(code, sessionPatterns);
  if (sessionLines.length > 0) {
    const hasSecureSession = testCode(code, /secure\s*:\s*true|HttpOnly|sameSite/gi);
    if (!hasSecureSession) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Insecure session configuration",
        description:
          "Session middleware is configured without secure cookie settings, making sessions vulnerable to hijacking.",
        lineNumbers: sessionLines,
        recommendation:
          "Configure sessions with secure: true, httpOnly: true, sameSite: 'strict', and a reasonable maxAge. Use a server-side session store.",
        reference: "OWASP Session Management — CWE-614",
        suggestedFix:
          "Set secure cookie flags: session({ cookie: { secure: true, httpOnly: true, sameSite: 'strict', maxAge: 3600000 } })",
        confidence: 0.8,
      });
    }
  }

  // Weak password requirements
  const passwordValidation = /password.*(?:length|min|max|regex|pattern|require)/gi;
  const hasPasswordInput = testCode(code, /password|passwd|pwd/gi);
  const hasAuthRoutes = testCode(code, /(?:register|signup|sign-up|createUser|changePassword|resetPassword)/gi);
  if (hasAuthRoutes && hasPasswordInput && !passwordValidation.test(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No password complexity validation",
      description:
        "Authentication endpoints handle passwords but no password complexity rules (minimum length, character requirements) are visible.",
      recommendation:
        "Enforce minimum 8-character passwords with complexity requirements. Use NIST SP 800-63B guidelines. Check against breached password databases (Have I Been Pwned).",
      reference: "NIST SP 800-63B — CWE-521",
      suggestedFix:
        "Add password validation: if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) throw new Error('Password too weak'); check HaveIBeenPwned API.",
      confidence: 0.7,
    });
  }

  // Hardcoded admin/backdoor accounts
  const backdoorPatterns =
    /(?:admin|root|superuser|backdoor)\s*[:=]\s*["'][^"']+["'].*(?:password|passwd|pwd)|(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["'].*(?:admin|root|superuser)/gi;
  const backdoorLines = getLineNumbers(code, backdoorPatterns);
  if (backdoorLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded admin/backdoor credentials",
      description:
        "Hardcoded admin or superuser credentials create a permanent backdoor. These are trivially discovered by examining the source code.",
      lineNumbers: backdoorLines,
      recommendation:
        "Remove hardcoded credentials. Use environment-based configuration and initial setup scripts for admin accounts.",
      reference: "CWE-798: Use of Hard-coded Credentials",
      suggestedFix:
        "Move credentials to environment variables: const adminPass = process.env.ADMIN_PASSWORD; and provision via secrets manager.",
      confidence: 0.95,
    });
  }

  // Missing rate limiting on auth endpoints
  // Suppress when the file is primarily code-analysis / evaluator logic (many regex .test() calls)
  const authAnalysisTestCount = (code.match(/\.test\s*\(/g) || []).length;
  const isAuthAnalysisCode = authAnalysisTestCount >= 8;
  const authEndpoints = getLineNumbers(code, /(?:login|signin|sign-in|authenticate|password|token)\s*['",:]/gi).filter(
    (ln) => {
      // Exclude middleware/facade/decorator patterns that use auth keywords safely
      const line = code.split("\n")[ln - 1] || "";
      return !/middleware\s*\(|Auth::|@auth|->auth\(\)|auth_required|authorize|authorization|authenticated|authenticate_user/i.test(
        line,
      );
    },
  );
  const hasRateLimit = testCode(code, /rate.?limit|throttle|limiter|brute/gi);
  if (authEndpoints.length > 0 && !hasRateLimit && !isIaCTemplate(code) && !isAuthAnalysisCode) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Authentication endpoints without rate limiting",
      description:
        "Authentication-related code exists without visible rate limiting, making it vulnerable to brute-force and credential stuffing attacks.",
      lineNumbers: authEndpoints.slice(0, 5),
      recommendation:
        "Implement rate limiting on login/auth endpoints. Use progressive delays, account lockouts, or CAPTCHA after failed attempts.",
      reference: "OWASP Brute Force — CWE-307",
      suggestedFix:
        "Add auth rate limiting: app.use('/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 5 })); lock account after 10 failures.",
      confidence: 0.7,
    });
  }
  // Weak Content-Security-Policy directives
  const cspValuePattern = /Content-Security-Policy|contentSecurityPolicy|csp\s*[:=]/gi;
  const cspPresent = testCode(code, cspValuePattern);
  if (cspPresent) {
    const cspWeakDirectives = /unsafe-inline|unsafe-eval|script-src\s+['"]?\s*\*/gi;
    const cspWeakLines = getLineNumbers(code, cspWeakDirectives);
    if (cspWeakLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Weak Content-Security-Policy directives",
        description:
          "CSP includes 'unsafe-inline', 'unsafe-eval', or wildcard script-src which significantly weakens XSS protection. These permissive directives are often added to suppress browser warnings during development.",
        lineNumbers: cspWeakLines,
        recommendation:
          "Remove 'unsafe-inline' and 'unsafe-eval'. Use nonce or hash-based CSP for inline scripts (e.g. 'nonce-<random>'). Restrict script-src to explicitly trusted domains.",
        reference: "OWASP CSP Cheat Sheet — CWE-693",
        suggestedFix:
          "Strengthen CSP: Content-Security-Policy: default-src 'self'; script-src 'nonce-{random}'; style-src 'self'; img-src 'self' data:; — remove unsafe-inline/unsafe-eval.",
        confidence: 0.85,
      });
    }
  }

  // Insecure WebSocket (ws://) connections
  const wsInsecurePattern = /["'`]ws:\/\//gi;
  const wsInsecureLines = getLineNumbers(code, wsInsecurePattern);
  if (wsInsecureLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Insecure WebSocket connection (ws://)",
      description:
        "WebSocket connections use unencrypted ws:// protocol. Data transmitted over ws:// can be intercepted or tampered with by network adversaries.",
      lineNumbers: wsInsecureLines,
      recommendation:
        "Use wss:// (WebSocket Secure) for all WebSocket connections. Ensure the server has a valid TLS certificate.",
      reference: "CWE-319: Cleartext Transmission of Sensitive Information",
      suggestedFix:
        "Replace ws:// with wss://: const socket = new WebSocket('wss://api.example.com/ws'); ensure your server has TLS configured.",
      confidence: 0.9,
    });
  }

  // NoSQL injection via direct user input in database queries
  const nosqlDirectPattern =
    /(?:\.find|\.findOne|\.deleteOne|\.deleteMany|\.updateOne|\.updateMany|\.aggregate|\.countDocuments)\s*\(\s*(?:req\.body|req\.query|request\.body|request\.json|request\.data)/gi;
  const nosqlDirectLines = getLineNumbers(code, nosqlDirectPattern);
  if (nosqlDirectLines.length > 0) {
    // AST: boost confidence when inside a request handler function
    let nosqlConfidence = 0.9;
    if (astFunctions.length > 0) {
      const inHandler = nosqlDirectLines.some((ln) => {
        const fn = astFunctions.find((f) => ln >= f.startLine && ln <= f.endLine);
        if (!fn) return false;
        return (
          fn.decorators?.some((d) => /route|get|post|put|delete|api_view/i.test(d)) ||
          /handler|controller|endpoint|route|api/i.test(fn.name)
        );
      });
      if (inHandler) nosqlConfidence = 0.95;
    }
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "NoSQL injection via unsanitized user input",
      description:
        "Database query methods receive raw request body/query parameters directly. Attackers can inject MongoDB operators ($gt, $ne, $regex) to bypass authentication or exfiltrate data.",
      lineNumbers: nosqlDirectLines,
      recommendation:
        "Never pass req.body or req.query directly to database queries. Validate and sanitize input fields individually. Use a schema validator (Joi, Zod) or ORM methods that parameterize queries.",
      reference: "OWASP NoSQL Injection — CWE-943",
      suggestedFix:
        "Validate input with a schema: const { email } = schema.parse(req.body); db.collection.find({ email });",
      confidence: nosqlConfidence,
    });
  }

  // Mass assignment / over-posting — passing raw request body to ORM create/update
  // Use [^,)]* instead of .* to avoid O(n²) backtracking; drop \s* after , to avoid overlap with [^,)]*
  const massAssignPattern =
    /(?:\.create|\.update|\.findOneAndUpdate|\.findByIdAndUpdate|\.insertOne|Object\.assign)\s*\(\s*(?:[^,)]*,)*(?:req\.body|request\.body|request\.data|request\.json)/gi;
  const massAssignLines = getLineNumbers(code, massAssignPattern);
  if (massAssignLines.length > 0) {
    const hasFieldWhitelist = testCode(
      code,
      /(?:pick|allowedFields|whitelist|permit|only|pluck|select)\s*\(|\{\s*\w+\s*:\s*req\.body\.\w+/gi,
    );
    if (!hasFieldWhitelist) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Mass assignment via raw request body",
        description:
          "Raw request body is passed directly to ORM create/update methods without field whitelisting. Attackers can set unintended fields (e.g., isAdmin, role) by including extra properties in the request.",
        lineNumbers: massAssignLines,
        recommendation:
          "Destructure only allowed fields from req.body: const { name, email } = req.body. Use DTOs, Zod schemas, or pick() utilities to whitelist fields before database operations.",
        reference: "OWASP Mass Assignment — CWE-915",
        suggestedFix:
          "Destructure allowed fields: const { name, email } = req.body; await Model.create({ name, email });",
        confidence: 0.85,
      });
    }
  }

  // Cloud metadata endpoints and hardcoded internal IPs
  const cloudMetaPattern = /169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200/gi;
  const cloudMetaLines = getLineNumbers(code, cloudMetaPattern);
  if (cloudMetaLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Cloud metadata endpoint reference",
      description:
        "Code references cloud provider metadata endpoints (169.254.169.254, metadata.google.internal). These are primary SSRF exploitation targets that can leak instance credentials and secrets.",
      lineNumbers: cloudMetaLines,
      recommendation:
        "Remove hardcoded metadata URLs. Use cloud SDK methods to retrieve credentials and metadata. Enable IMDSv2 (AWS) to require session tokens for metadata access.",
      reference: "CWE-918: Server-Side Request Forgery (SSRF)",
      suggestedFix:
        "Block metadata IPs in SSRF guards: if (resolvedHost === '169.254.169.254') throw new Error('metadata endpoint blocked');",
      confidence: 0.95,
    });
  }

  // Insecure cryptographic mode (ECB)
  const ecbPattern =
    /aes[_-]?\d*[_-]?ecb|AES\.MODE_ECB|CipherMode\.ECB|Cipher\.getInstance\s*\(\s*["']AES\/ECB|\.Mode\s*=\s*CipherMode\.ECB|modes\.ECB/gi;
  const ecbLines = getLineNumbers(code, ecbPattern);
  if (ecbLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Insecure encryption mode (ECB)",
      description:
        "ECB (Electronic Codebook) mode preserves patterns in plaintext — identical blocks produce identical ciphertext, making it unsuitable for secure encryption.",
      lineNumbers: ecbLines,
      recommendation:
        "Use AES-GCM (authenticated encryption) or AES-CBC with HMAC. GCM is preferred as it provides both confidentiality and integrity. Always use a unique IV/nonce per encryption.",
      reference: "CWE-327: Use of Broken Crypto Algorithm",
      suggestedFix:
        "Replace ECB with AES-GCM: crypto.createCipheriv('aes-256-gcm', key, crypto.randomBytes(12)) with a unique IV per encryption.",
      confidence: 0.9,
    });
  }

  // ── SQL Injection (multi-language) — string concatenation / interpolation in SQL context ──
  const sqlInjLines = getLangLineNumbers(code, language, LP.SQL_INJECTION);
  if (sqlInjLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential SQL injection via string concatenation",
      description:
        "SQL queries are constructed using string concatenation or interpolation with potentially untrusted input, allowing attackers to manipulate queries.",
      lineNumbers: sqlInjLines,
      recommendation:
        "Use parameterized queries or prepared statements. Never concatenate user input into SQL strings.",
      reference: "OWASP SQL Injection — CWE-89",
      suggestedFix:
        "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId]) instead of string concatenation.",
      confidence: 0.95,
    });
  } else {
    // Fallback: detect SQL string construction via template interpolation or concatenation
    // Catches both direct patterns (query(`SELECT ${x}`)) and indirect ones (const sql = `SELECT ${x}`)
    const sqlFallbackLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Skip comment lines
      if (/^\s*(?:\/\/|\/\*|\*[\s/]|\*$|#(?![![])|"""|'''|<!--)/.test(line)) continue;
      const sqlKeywords = line.match(/\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INTO|VALUES|SET)\b/gi) || [];
      // Require 2+ SQL keywords to distinguish real SQL from UI labels like "Select ${user.name}"
      if (sqlKeywords.length < 2) continue;
      const hasInterpolation =
        /\$\{/.test(line) || // JS/TS template literal interpolation
        /\$"[^"]*\{/.test(line) || // C# string interpolation ($"...{var}...")
        /\+\s*\w/.test(line) || // String concatenation
        /f["']/.test(line) || // Python f-string
        /\.format\s*\(/.test(line) || // Python .format() / C# String.Format
        /String\.format/i.test(line) || // Java String.format
        /fmt\.Sprintf/i.test(line) || // Go fmt.Sprintf
        /%[sdvq]/.test(line) || // printf-style
        /#\{[^}]+\}/.test(line) || // Ruby string interpolation
        /["'].*\$[a-zA-Z_]\w*/.test(line) || // Kotlin/PHP $var inside string (excludes PostgreSQL $1)
        /\\\([^)]+\)/.test(line) || // Swift string interpolation \(var)
        /format!\s*\(\s*["'].*\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(line); // Rust format! building SQL
      if (hasInterpolation) {
        sqlFallbackLines.push(i + 1);
      }
    }
    if (sqlFallbackLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Potential SQL injection via string concatenation",
        description:
          "SQL queries appear to include dynamically concatenated or interpolated values, which may allow SQL injection if user input is included.",
        lineNumbers: sqlFallbackLines,
        recommendation:
          "Use parameterized queries or prepared statements. Never concatenate variables into SQL strings.",
        reference: "OWASP SQL Injection — CWE-89",
        suggestedFix:
          "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId]) instead of string concatenation.",
        confidence: 0.9,
      });
    }
  }

  // ── Server-side XSS — unsanitized output in HTTP responses ──
  {
    const ssXssPattern =
      /(?:res\.send|res\.write|response\.write|response\.send|resp\.getWriter|fmt\.Fprint|HttpResponse)\s*\(.*(?:\+\s*(?:req\.|request\.|params\.|query\.)|\$\{.*(?:req\.|request\.|query|params))/gi;
    const ssXssLines = getLineNumbers(code, ssXssPattern);
    // Also check multi-line: response method on one line with user input concat
    const lines = code.split("\n");
    const multiLineXssLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:res\.send|res\.write|response\.write|fmt\.Fprint)\s*\(/i.test(line)) {
        const ctx = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (/(?:req\.|request\.|params\.|query\.)/i.test(ctx) && /\+|`[^`]*\$\{|\.format\s*\(|Sprintf/i.test(ctx)) {
          multiLineXssLines.push(i + 1);
        }
      }
    }
    const allXssLines = [...new Set([...ssXssLines, ...multiLineXssLines])].sort((a, b) => a - b);
    if (allXssLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential server-side XSS via unsanitized response output",
        description:
          "User input is concatenated into an HTTP response without sanitization, allowing reflected Cross-Site Scripting (XSS) attacks.",
        lineNumbers: allXssLines,
        recommendation:
          "Sanitize all user input before including in responses. Use template engines with auto-escaping or HTML encoding functions.",
        reference: "OWASP XSS Prevention — CWE-79",
        suggestedFix:
          "Encode output: res.send(escapeHtml(userInput)) or use a template engine with auto-escaping enabled.",
        confidence: 0.9,
      });
    }
  }

  // ── Path Traversal — file operations with user input ──
  {
    const pathTravPattern =
      /(?:readFile|readFileSync|createReadStream|readdir|stat|access|open|unlink|writeFile|writeFileSync|os\.ReadFile|os\.Open|ioutil\.ReadFile|File\.read|file_get_contents)\s*\(.*(?:\+\s*(?:req\.|request\.|params\.|query\.)|`[^`]*\$\{.*(?:req\.|request\.|params\.|query\.))/gi;
    const pathTravLines = getLineNumbers(code, pathTravPattern);
    // Also multi-line: file read with user input in context
    const pathTravMultiLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Standard Node.js / Go file operations with user input on same line
      if (
        /(?:readFile|readFileSync|createReadStream|open|os\.ReadFile|os\.Open|ioutil\.ReadFile)\s*\(/i.test(line) &&
        /(?:req\.|request\.|params\.|query\.)/i.test(line) &&
        /\+/i.test(line)
      ) {
        pathTravMultiLines.push(i + 1);
        continue;
      }
      // Multi-language path traversal: file operations with user-controlled path in context
      const ctx = codeLines.slice(Math.max(0, i - 3), i + 4).join("\n");
      const hasFileOp =
        /(?:File\.(?:join|read|new|open)|send_file|filepath\.Join|http\.ServeFile|Path\.Combine|File\.ReadAll|respondFile|ServeContent|file_get_contents|os\.path\.join)\s*\(/i.test(
          line,
        ) ||
        /\bnew\s+File\s*\(/i.test(line) ||
        /File\s*\(\s*[""][^""]*\$/i.test(line); // Kotlin File("/path/$var")
      const hasUserInput =
        /(?:params\[|params\.|request\.|req\.|query\.|call\.parameters|\$_(?:GET|POST|REQUEST)\[|r\.URL|r\.FormValue|\[Http(?:Get|Post|Put|Delete|Patch)\s*\(|ResponseWriter|flask\.request)/i.test(
          ctx,
        );
      if (hasFileOp && hasUserInput) {
        pathTravMultiLines.push(i + 1);
      }
    }
    const allPathTravLines = [...new Set([...pathTravLines, ...pathTravMultiLines])].sort((a, b) => a - b);
    if (allPathTravLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Potential path traversal via user input in file operations",
        description:
          "File system operations use paths that include user-controlled input, allowing attackers to read or write arbitrary files using ../sequences.",
        lineNumbers: allPathTravLines,
        recommendation:
          "Validate and sanitize file paths. Use path.resolve() or path.normalize() and ensure the resolved path is within an allowed directory. Reject paths containing '..'.",
        reference: "OWASP Path Traversal — CWE-22",
        suggestedFix:
          "Validate paths: const safePath = path.resolve(BASE_DIR, userInput); if (!safePath.startsWith(BASE_DIR)) throw new Error('path traversal blocked');",
        confidence: 0.9,
      });
    }
  }

  // ── Unsafe Deserialization (multi-language) ──
  const deserLines = getLangLineNumbers(code, language, LP.UNSAFE_DESERIALIZATION);
  if (deserLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Unsafe deserialization of untrusted data",
      description:
        "Deserializing data from untrusted sources can lead to remote code execution (RCE). Attackers can craft malicious serialized payloads to execute arbitrary code.",
      lineNumbers: deserLines,
      recommendation:
        "Never deserialize untrusted data. Use safe alternatives: JSON for data exchange, schema validation before processing. Avoid pickle, ObjectInputStream, Marshal with untrusted input.",
      reference: "OWASP Deserialization — CWE-502",
      suggestedFix:
        "Replace unsafe deserialization with JSON parsing and schema validation. Python: use json.loads() instead of pickle.loads(). Java: use JSON libraries instead of ObjectInputStream.",
      confidence: 0.9,
    });
  }

  // ── Enhanced SSRF — multi-line variable tracking ──
  if (ssrfLines.length === 0) {
    // If the single-line SSRF regex didn't match, check multi-line patterns:
    // fetch(variable) where variable was assigned from req.* in surrounding lines
    const cLines = code.split("\n");
    const ssrfMultiLines: number[] = [];
    for (let i = 0; i < cLines.length; i++) {
      const line = cLines[i];
      const fetchMatch = line.match(
        /(?:fetch|axios|http\.get|requests\.get|urllib|HttpClient|WebClient|reqwest|http\.NewRequest|httpx|aiohttp)\s*\(\s*(\w+)/i,
      );
      if (fetchMatch) {
        const varName = fetchMatch[1];
        // Check surrounding lines for assignment from user input
        const start = Math.max(0, i - 10);
        const ctx = cLines.slice(start, i).join("\n");
        const assignPattern = new RegExp(
          `(?:const|let|var|:=)?\\s*${varName}\\s*[:=]\\s*.*(?:req\\.|request\\.|params\\.|query\\.|body\\.|input|url)`,
          "i",
        );
        if (assignPattern.test(ctx)) {
          ssrfMultiLines.push(i + 1);
        }
      }
    }
    if (ssrfMultiLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential Server-Side Request Forgery (SSRF)",
        description:
          "A URL from user input is passed to a server-side HTTP client via a variable, allowing attackers to access internal services or cloud metadata endpoints.",
        lineNumbers: ssrfMultiLines,
        recommendation:
          "Validate and whitelist allowed URLs/domains. Block access to internal IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.169.254). Use a URL parser to verify the host.",
        reference: "OWASP SSRF — CWE-918",
        suggestedFix:
          "Validate URLs against an allowlist: const url = new URL(input); if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error('blocked');",
        confidence: 0.85,
      });
    }
  }

  // ── Timing attack — non-constant-time comparison of secrets ──
  {
    const timingLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Check for string comparison (===, ==) involving secret/signature/token/hmac/hash
      if (
        /(?:signature|secret|token|hmac|hash|digest|apikey|api_key)\s*(?:===?|!==?)\s*\w+|^\s*if\s*\(.*(?:signature|secret|token|hmac|hash|digest)\s*(?:===?|!==?)/i.test(
          line,
        )
      ) {
        const ctx = codeLines.slice(Math.max(0, i - 5), Math.min(codeLines.length, i + 6)).join("\n");
        // Only flag if no constant-time comparison (crypto.timingSafeEqual, hmac.equal, etc.)
        if (
          !/timingSafeEqual|constantTimeCompare|hmac\.Equal|secure_compare|constant_time_compare|compare_digest/i.test(
            ctx,
          )
        ) {
          timingLines.push(i + 1);
        }
      }
    }
    if (timingLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Non-constant-time comparison of secrets",
        description:
          "Secrets, signatures, or tokens are compared using standard equality operators (===, ==) which are vulnerable to timing attacks. An attacker can determine the correct value byte-by-byte by measuring response time.",
        lineNumbers: timingLines,
        recommendation:
          "Use constant-time comparison: crypto.timingSafeEqual() (Node.js), hmac.Equal() (Go), hmac.compare_digest() (Python), or MessageDigest.isEqual() (Java).",
        reference: "CWE-208: Observable Timing Discrepancy",
        suggestedFix: "Replace === comparison with: crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));",
        confidence: 0.85,
      });
    }
  }

  // ── Unsafe Rust code — unsafe blocks without safety documentation ──
  if (lang === "rust") {
    const unsafeLines = getLineNumbers(code, /\bunsafe\s*\{/g);
    if (unsafeLines.length > 0) {
      const hasSafetyDoc = testCode(code, /\/\/\s*SAFETY:|\/\/\s*UNSAFE:|#\[allow\(unsafe_code\)\]/gi);
      if (!hasSafetyDoc) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Unsafe code block without safety documentation",
          description:
            "Unsafe code bypasses Rust's safety guarantees (bounds checking, lifetime tracking). Undocumented unsafe blocks are high-risk for memory safety bugs.",
          lineNumbers: unsafeLines,
          recommendation:
            "Minimize unsafe code. Document safety invariants with // SAFETY: comments. Consider safe alternatives. Review for buffer overflows and dangling pointers.",
          reference: "CWE-119 / CWE-787: Buffer Overflow / Out-of-bounds Write",
          suggestedFix:
            "Add safety documentation: // SAFETY: <explain why this is safe> above each unsafe block, and minimize the scope of unsafe.",
          confidence: 0.85,
        });
      }
    }
  }

  // ── Insecure HTTP URLs for sensitive operations ──
  {
    const httpUrlLines = getLineNumbers(
      code,
      /["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^"'`\s]+(?:auth|login|password|token|payment|charge|api|secret)/gi,
    );
    if (httpUrlLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Sensitive operations over insecure HTTP",
        description:
          "Sensitive operations (authentication, payment, API calls) use unencrypted HTTP URLs, exposing data to network interception.",
        lineNumbers: httpUrlLines,
        recommendation:
          "Use HTTPS for all sensitive operations. Replace http:// with https:// and enforce TLS for all API communication.",
        reference: "CWE-319: Cleartext Transmission of Sensitive Information",
        suggestedFix: "Replace http:// with https:// for all sensitive endpoints.",
        confidence: 0.85,
      });
    }
  }

  // ── Framework-specific security rules ─────────────────────────────────────

  // ── PHP/Ruby Reflected XSS — echo/print with user input ──
  {
    const xssReflectLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // PHP: echo/print with $_GET/$_POST directly
      if (/\b(?:echo|print)\b/i.test(line) && /\$_(?:GET|POST|REQUEST|COOKIE)\[/i.test(line)) {
        xssReflectLines.push(i + 1);
        continue;
      }
      // PHP: echo with variable that was assigned from user input in context
      if (/\b(?:echo|print)\b.*\$/i.test(line) && lang === "php") {
        const ctx = codeLines.slice(Math.max(0, i - 5), i).join("\n");
        if (/\$_(?:GET|POST|REQUEST)\[/i.test(ctx)) {
          xssReflectLines.push(i + 1);
          continue;
        }
      }
      // Ruby ERB: raw, html_safe, or <%== (unescaped output)
      if (/\braw\s+@?\w+|\.html_safe\b|<%==?\s/i.test(line)) {
        const ctx = codeLines.slice(Math.max(0, i - 5), i + 1).join("\n");
        if (/params\[|request\.|@\w+/i.test(ctx)) {
          xssReflectLines.push(i + 1);
        }
      }
    }
    if (xssReflectLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Reflected XSS via unsanitized user input in output",
        description:
          "User input is directly included in HTML output without sanitization, allowing Cross-Site Scripting (XSS) attacks.",
        lineNumbers: xssReflectLines,
        recommendation:
          "Sanitize all user input before output. Use htmlspecialchars() in PHP or ERB's default escaping (<%= %>) in Ruby.",
        reference: "OWASP XSS — CWE-79",
        suggestedFix:
          "PHP: echo htmlspecialchars($input, ENT_QUOTES, 'UTF-8'); Ruby: use <%= %> (escaped) instead of raw/html_safe.",
        confidence: 0.9,
      });
    }
  }

  // ── Server-Side Template Injection (SSTI) ──
  {
    const sstiLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Jinja2/Flask: render_template_string, Environment().from_string with user input
      if (/(?:render_template_string|from_string|Template)\s*\(/i.test(line)) {
        const ctx = codeLines.slice(Math.max(0, i - 5), i + 1).join("\n");
        if (/(?:request\.|params\.|user|input|args\.get)/i.test(ctx)) {
          sstiLines.push(i + 1);
        }
      }
      // Express/Node: rendering user-controlled template strings
      if (/\.render\s*\(.*(?:req\.|request\.)/i.test(line)) {
        sstiLines.push(i + 1);
      }
      // Python format string injection: user-controlled string.format()
      if (/\.format\s*\(/i.test(line)) {
        const ctx = codeLines.slice(Math.max(0, i - 5), i + 1).join("\n");
        if (/(?:request\.(?:args|form|values|data|get)|params\[|input\s*\()/i.test(ctx)) {
          sstiLines.push(i + 1);
        }
      }
    }
    if (sstiLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Potential Server-Side Template Injection (SSTI)",
        description:
          "User input is used to construct or render templates, which could allow attackers to execute arbitrary code on the server.",
        lineNumbers: sstiLines,
        recommendation:
          "Never pass user input to template rendering functions. Use render_template with pre-defined templates instead of render_template_string.",
        reference: "OWASP SSTI — CWE-1336",
        suggestedFix: "Use render_template('page.html', data=user_data) instead of render_template_string(user_input).",
        confidence: 0.9,
      });
    }
  }

  // ── Open Redirect — redirecting to user-controlled URL ──
  {
    const openRedirectLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      if (
        /(?:redirect|redirect_to|res\.redirect|response\.redirect|sendRedirect|header\s*\(\s*["']Location)/i.test(line)
      ) {
        const ctx = codeLines.slice(Math.max(0, i - 5), i + 1).join("\n");
        if (
          /(?:req\.|request\.|params\[|params\.|query\.|body\.|\$_GET|\$_POST|args\.get)/i.test(ctx) &&
          !/(?:url\.startsWith|startswith|whitelist|allowlist|allowed_hosts|validate_url|safe_redirect)/i.test(ctx)
        ) {
          openRedirectLines.push(i + 1);
        }
      }
    }
    if (openRedirectLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential open redirect vulnerability",
        description:
          "The application redirects to a URL derived from user input without validation, which can be used for phishing attacks.",
        lineNumbers: openRedirectLines,
        recommendation:
          "Validate redirect URLs against a whitelist of allowed domains. Use relative paths or verify the URL starts with your domain.",
        reference: "OWASP Unvalidated Redirects — CWE-601",
        suggestedFix:
          "Validate redirects: const url = new URL(target, baseUrl); if (url.origin !== baseUrl) throw new Error('blocked');",
        confidence: 0.85,
      });
    }
  }

  // ── Mass assignment — unfiltered request body passed to ORM/model ──
  {
    const massAssignLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Ruby: Model.create(params) or update(params) without permit/strong_parameters
      if (/\.(?:create|update|new|assign_attributes)\s*\(\s*params(?:\[|\.)/i.test(line)) {
        const ctx = codeLines.slice(Math.max(0, i - 10), i + 1).join("\n");
        if (!/\.permit\s*\(|strong_parameters|require\s*\(/i.test(ctx)) {
          massAssignLines.push(i + 1);
        }
      }
      // Python Django/DRF: form.save() with all fields, or Model(**request.data)
      if (/\*\*request\.(?:data|POST|json|body)/i.test(line)) {
        massAssignLines.push(i + 1);
      }
      // Python setattr in loop with request data — mass assignment
      if (/setattr\s*\(/i.test(line)) {
        const ctx = codeLines.slice(Math.max(0, i - 8), Math.min(codeLines.length, i + 3)).join("\n");
        if (/(?:for\s+\w+.*in\s+|request\.|\.items\(\)|\.data|\.POST|\.json)/i.test(ctx)) {
          massAssignLines.push(i + 1);
        }
      }
      // JS/TS: Model.create(req.body) / Object.assign(model, req.body)
      if (
        /(?:\.create|\.update|Object\.assign|Object\.keys.*forEach)\s*\(.*(?:req\.body|request\.body)/i.test(line) &&
        !/(?:pick|omit|whitelist|allowlist|\{[^}]+\}\s*=)/i.test(line)
      ) {
        massAssignLines.push(i + 1);
      }
    }
    if (massAssignLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential mass assignment vulnerability",
        description:
          "Request data is directly passed to model creation/update without field filtering, allowing attackers to set privileged fields.",
        lineNumbers: massAssignLines,
        recommendation:
          "Explicitly whitelist allowed fields. Use strong parameters (Ruby), serializers (Python), or DTOs (Java/C#).",
        reference: "CWE-915: Mass Assignment",
        suggestedFix:
          "Whitelist fields: const { name, email } = req.body; Ruby: params.require(:user).permit(:name, :email).",
        confidence: 0.85,
      });
    }
  }

  // ── Weak Cryptography — static IV, ECB mode, short keys ──
  {
    const weakCryptoLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Static/hardcoded IV
      if (/(?:static\s*IV|iv\s*=\s*\[?\s*["']|iv\s*:=\s*\[\]byte\s*\()/i.test(line)) {
        weakCryptoLines.push(i + 1);
      }
      // ECB mode (any language)
      if (/\bECB\b|NewCipher\s*\(|cipher\.NewCFBEncrypter\s*\(.*static/i.test(line)) {
        weakCryptoLines.push(i + 1);
      }
    }
    if (weakCryptoLines.length > 0) {
      // Don't duplicate if weak-crypto is already detected by the pattern-based check
      const existingCryptoFinding = findings.some(
        (f) => f.title.includes("Weak cryptographic") || f.title.includes("ECB"),
      );
      if (!existingCryptoFinding) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Weak cryptographic configuration",
          description:
            "Static IVs, ECB mode, or other weak cryptographic configurations are used, reducing the confidentiality of encrypted data.",
          lineNumbers: weakCryptoLines,
          recommendation:
            "Use a random IV for each encryption operation. Use AES-GCM or AES-CBC (never ECB). Use keys of at least 256 bits.",
          reference: "CWE-327: Use of Broken Crypto Algorithm",
          suggestedFix:
            "Generate random IV: crypto.randomBytes(16) (Node.js), os.urandom(16) (Python), SecureRandom (Java).",
          confidence: 0.85,
        });
      }
    }
  }

  // ── Regex DoS (ReDoS) — super-linear regex patterns ──
  {
    const redosLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Detect common ReDoS patterns: nested quantifiers, overlapping alternations
      // Check in regex constructor calls
      if (/(?:new\s+RegExp|re\.compile|Regex|Pattern\.compile)\s*\(/i.test(line)) {
        if (/[+*]\s*\)\s*[+*]|(?:\.\*){2,}|\([^)]*[+*][^)]*\)\s*[+*]/.test(line)) {
          redosLines.push(i + 1);
        }
      }
      // Also check regex literals and raw strings for nested quantifiers
      if (/\/[^/]+\/|r["'][^"']+["']|re\.compile\s*\(/.test(line)) {
        if (/\([^)]*[+*][^)]*\)\s*[+*]|\(\?\:[^)]*[+*][^)]*\)\s*[+*]/.test(line)) {
          redosLines.push(i + 1);
        }
      }
      // Detect dangerous patterns like ([a-zA-Z]+)* or (\w+)* even in variable assignments
      if (/\([^)]*(?:\[[^\]]+\]|\\[wdsDWS])\+\)\s*[*+]/.test(line)) {
        redosLines.push(i + 1);
      }
      // User input passed directly to regex constructor
      if (
        /(?:new\s+RegExp|re\.compile|Regex|Pattern\.compile)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|user)/i.test(
          line,
        )
      ) {
        redosLines.push(i + 1);
      }
    }
    if (redosLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Potential Regular Expression Denial of Service (ReDoS)",
        description:
          "User input is used in regex construction or a regex with nested quantifiers is used, which could cause catastrophic backtracking.",
        lineNumbers: redosLines,
        recommendation:
          "Validate and escape user input before using in regex. Avoid nested quantifiers. Consider using a linear-time regex engine.",
        reference: "CWE-1333: Inefficient Regular Expression Complexity",
        suggestedFix: "Escape user input: new RegExp(input.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'))",
        confidence: 0.8,
      });
    }
  }

  // ── PHP File Inclusion (LFI/RFI) ──
  {
    const fileInclusionLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // Match include/require with any PHP variable on the same line (covers $var, "str" . $var, etc.)
      if (
        /\b(?:include|require|include_once|require_once)\b/i.test(line) &&
        /\$\w+/.test(line) &&
        !/^\s*(?:\/\/|#|\*)/.test(line)
      ) {
        fileInclusionLines.push(i + 1);
      }
    }
    if (fileInclusionLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Potential PHP file inclusion vulnerability (LFI/RFI)",
        description:
          "PHP include/require uses a variable path, which may allow attackers to include arbitrary local or remote files.",
        lineNumbers: fileInclusionLines,
        recommendation: "Use a whitelist of allowed files. Never pass user input directly to include/require.",
        reference: "OWASP File Inclusion — CWE-98",
        suggestedFix:
          "Whitelist: $allowed = ['header', 'footer']; if (in_array($page, $allowed)) { include \"$page.php\"; }",
        confidence: 0.9,
      });
    }
  }

  // ── Insecure WebView — loading untrusted content with JS enabled ──
  {
    const webviewLines: number[] = [];
    const codeLines = code.split("\n");
    const hasJSEnabled = /(?:javaScriptEnabled|setJavaScriptEnabled\s*\(\s*true|JavaScriptMode\.unrestricted)/i.test(
      code,
    );
    if (hasJSEnabled) {
      for (let i = 0; i < codeLines.length; i++) {
        const line = codeLines[i];
        if (
          /(?:loadUrl|loadData|evaluateJavascript|addJavascriptInterface)\s*\(/i.test(line) &&
          /(?:\+|\$\{|\$\w+|user|input|params|intent)/i.test(line)
        ) {
          webviewLines.push(i + 1);
        }
      }
    }
    // Also detect WebView with JavaScript enabled + loading external/user content
    if (hasJSEnabled) {
      const hasUntrustedLoad = /loadUrl\s*\(|url\s*=.*(?:intent|getStringExtra|params|query)/i.test(code);
      if (hasUntrustedLoad && webviewLines.length === 0) {
        const jsEnabledLine = getLineNumbers(
          code,
          /javaScriptEnabled|setJavaScriptEnabled\s*\(\s*true|JavaScriptMode\.unrestricted/gi,
        );
        webviewLines.push(...jsEnabledLine);
      }
    }
    if (webviewLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Insecure WebView configuration",
        description:
          "WebView has JavaScript enabled and loads untrusted content, which could allow XSS or code execution attacks.",
        lineNumbers: webviewLines,
        recommendation:
          "Disable JavaScript in WebViews unless absolutely necessary. Validate all URLs loaded in WebViews.",
        reference: "CWE-749: Exposed Dangerous Method or Function",
        suggestedFix: "Validate WebView URLs against a whitelist and disable JavaScript when not needed.",
        confidence: 0.8,
      });
    }
  }

  // Debug mode enabled in production-ready code
  const debugLines = getLangLineNumbers(code, language, LP.FRAMEWORK_DEBUG_MODE);
  if (debugLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Debug mode enabled",
      description:
        "Debug mode is explicitly enabled, which exposes detailed error messages, stack traces, and potentially source code to attackers in production.",
      lineNumbers: debugLines,
      recommendation:
        "Disable debug mode for production deployments. Use environment variables to toggle debug (e.g. DEBUG=false, FLASK_DEBUG=0).",
      reference: "CWE-215: Insertion of Sensitive Information Into Debugging Code",
      suggestedFix:
        "Set debug mode based on environment: app.run(debug=os.environ.get('FLASK_DEBUG', '0') == '1') or remove .UseDeveloperExceptionPage() in production.",
      confidence: 0.85,
    });
  }

  // Weak or short secret keys in framework config
  const secretKeyLines = getLangLineNumbers(code, language, LP.FRAMEWORK_SECRET_KEY);
  if (secretKeyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Weak or hardcoded secret key",
      description:
        "A framework secret key is hardcoded with a short or predictable value. This key is used to sign sessions, CSRF tokens, or JWTs — a weak key allows forgery.",
      lineNumbers: secretKeyLines,
      recommendation:
        "Use a cryptographically random secret of at least 32 bytes. Load from environment variable or secrets manager, never commit to source control.",
      reference: "CWE-321: Use of Hard-coded Cryptographic Key",
      suggestedFix:
        "Generate strong secret: python -c 'import secrets; print(secrets.token_hex(32))' and load via env: SECRET_KEY = os.environ['SECRET_KEY']",
      confidence: 0.9,
    });
  }

  // Mass assignment / over-posting (framework-specific)
  const fwMassAssignLines = getLangLineNumbers(code, language, LP.FRAMEWORK_MASS_ASSIGNMENT);
  if (fwMassAssignLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential mass assignment vulnerability",
      description:
        "Request body is directly passed to create/update operations without field whitelisting. Attackers can set admin flags, prices, or other privileged fields.",
      lineNumbers: fwMassAssignLines,
      recommendation:
        "Explicitly pick allowed fields from the request body. Use DTOs, validation schemas (Joi, Zod), or framework-specific binding whitelists.",
      reference: "CWE-915: Improperly Controlled Modification of Dynamically-Determined Object Attributes",
      suggestedFix:
        "Whitelist fields: const { name, email } = req.body; await User.create({ name, email }); instead of User.create(req.body).",
      confidence: 0.8,
    });
  }

  // ── Kubernetes YAML security: privileged containers, host networking ──
  {
    const k8sPrivilegedLines: number[] = [];
    const k8sHostNetLines: number[] = [];
    const k8sRunAsRootLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      const line = codeLines[i];
      // privileged: true in securityContext
      if (/^\s*privileged\s*:\s*true/i.test(line)) {
        k8sPrivilegedLines.push(i + 1);
      }
      // hostNetwork: true
      if (/^\s*hostNetwork\s*:\s*true/i.test(line)) {
        k8sHostNetLines.push(i + 1);
      }
      // runAsUser: 0 (root)
      if (/^\s*runAsUser\s*:\s*0\s*$/i.test(line)) {
        k8sRunAsRootLines.push(i + 1);
      }
    }
    const allK8sLines = [...new Set([...k8sPrivilegedLines, ...k8sHostNetLines, ...k8sRunAsRootLines])].sort(
      (a, b) => a - b,
    );
    // Only emit if the file looks like K8s manifest (has kind: or apiVersion:)
    const isK8sManifest = /^\s*(?:kind|apiVersion)\s*:/im.test(code) || /securityContext\s*:/i.test(code);
    if (allK8sLines.length > 0 && isK8sManifest) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Insecure Kubernetes pod/container configuration",
        description:
          "Kubernetes manifest has insecure settings: privileged containers, host networking, or running as root. These disable container isolation.",
        lineNumbers: allK8sLines,
        recommendation:
          "Set privileged: false, runAsNonRoot: true, readOnlyRootFilesystem: true, and drop all capabilities. Avoid hostNetwork: true.",
        reference: "CIS Kubernetes Benchmark: Pod Security",
        suggestedFix:
          "Set securityContext: { privileged: false, runAsNonRoot: true, allowPrivilegeEscalation: false, readOnlyRootFilesystem: true }",
        confidence: 0.95,
      });
    }
    // Also detect Docker run commands with --privileged in any language
    if (k8sPrivilegedLines.length === 0) {
      const dockerPrivLines: number[] = [];
      for (let i = 0; i < codeLines.length; i++) {
        if (/docker\s+run\s+.*--privileged/i.test(codeLines[i])) {
          dockerPrivLines.push(i + 1);
        }
      }
      if (dockerPrivLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "critical",
          title: "Docker container running in privileged mode",
          description:
            "Docker run command uses --privileged, giving the container full host access and disabling all security boundaries.",
          lineNumbers: dockerPrivLines,
          recommendation: "Remove --privileged. Use specific capabilities (--cap-add) only as needed.",
          reference: "CIS Docker Benchmark: Container Runtime",
          suggestedFix:
            "Replace --privileged with granular capabilities: docker run --cap-add NET_ADMIN instead of --privileged.",
          confidence: 0.95,
        });
      }
    }
  }

  return findings;
}
