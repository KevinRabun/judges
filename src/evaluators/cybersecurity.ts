import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, isIaCTemplate, testCode } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCybersecurity(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CYBER";
  const lang = getLangFamily(language);

  // eval() / exec() usage (multi-language)
  const evalLines = getLangLineNumbers(code, language, LP.EVAL_USAGE);
  if (evalLines.length > 0) {
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
      confidence: 0.95,
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
      /\b(?:exec|execSync|spawn|spawnSync|system|popen|Runtime\.getRuntime\(\)\.exec|subprocess\.(?:Popen|run|call)|os\.system)\s*\(/i;
    const safeSink = /\bexecFile\s*\(/i;
    const untrustedInput = /(?:req\.|request\.|params\.|query\.|body\.|argv|input|user|prompt|command)/i;
    const unsafeConstruction = /(?:\+\s*\w|\$\{[^}]+\}|\.concat\s*\(|\.join\s*\(|shell\s*:\s*true)/i;

    return (
      dangerousSink.test(context) &&
      !safeSink.test(context) &&
      untrustedInput.test(context) &&
      unsafeConstruction.test(context)
    );
  });

  if (filteredCmdLines.length > 0) {
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
      confidence: 0.9,
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
  if (corsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Overly permissive CORS configuration",
      description:
        "CORS is configured to allow all origins ('*'), which may allow malicious websites to make cross-origin requests to your API.",
      lineNumbers: corsLines,
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
    /DocumentBuilder|SAXParser|XMLReader|DOMParser|etree\.parse|xml\.sax|parseXML|lxml\.etree|XmlReader|XmlDocument|LIBXML_NOENT/gi;
  const xxeLines = getLineNumbers(code, xxePatterns);
  if (xxeLines.length > 0) {
    const hasProtection =
      /disallow-doctype-decl|FEATURE_SECURE_PROCESSING|resolve_entities\s*=\s*False|DtdProcessing\.Prohibit|LIBXML_NONET/gi.test(
        code,
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
    /ldap\.search|ldap_search|DirectorySearcher|LdapTemplate|ldap\.bind|python-ldap|go-ldap|novell\.directory/gi;
  const ldapLines = getLineNumbers(code, ldapPatterns);
  if (ldapLines.length > 0) {
    const hasLdapSanitation = testCode(code, /escape|sanitize|ldap_escape|filter_format/gi);
    if (!hasLdapSanitation) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential LDAP injection",
        description:
          "LDAP queries are constructed without visible input sanitization, potentially allowing LDAP injection attacks.",
        lineNumbers: ldapLines,
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
  const hasServer =
    /app\.(listen|use)|createServer|express\(\)|Flask\(|Django|WebApplication|Startup|actix.web|gin\.Default|SpringBoot|@RestController|http\.ListenAndServe/gi.test(
      code,
    );
  if (hasServer && !hasHelmet) {
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
  const authEndpoints = getLineNumbers(code, /(?:login|signin|sign-in|authenticate|auth|password|token)\s*['",:]/gi);
  const hasRateLimit = testCode(code, /rate.?limit|throttle|limiter|brute/gi);
  if (authEndpoints.length > 0 && !hasRateLimit && !isIaCTemplate(code)) {
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
      confidence: 0.9,
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

  // ── Framework-specific security rules ─────────────────────────────────────

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
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
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

  return findings;
}
