import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeCybersecurity(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CYBER";

  // eval() / exec() usage (multi-language)
  const evalPattern = /\beval\s*\(|exec\s*\(.*(?:req\.|request\.|input|user)|Function\s*\(\s*["'`]|compile\s*\(\s*(?:req|input|user)/gi;
  const evalLines = getLineNumbers(code, evalPattern);
  if (evalLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Dangerous eval()/exec() usage",
      description: "eval(), exec(), or dynamic code compilation executes arbitrary code and is a primary vector for code injection attacks.",
      lineNumbers: evalLines,
      recommendation: "Remove eval() entirely. Use JSON.parse() for data parsing, or a proper expression parser if dynamic evaluation is truly needed.",
      reference: "OWASP Code Injection — CWE-94",
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
      description: "Setting innerHTML, dangerouslySetInnerHTML, v-html, or [innerHTML] can lead to Cross-Site Scripting (XSS) if the content includes unsanitized user input.",
      lineNumbers: innerHTMLLines,
      recommendation: "Use textContent for plain text, or use a sanitization library (DOMPurify) before inserting HTML. In React, avoid dangerouslySetInnerHTML unless content is sanitized.",
      reference: "OWASP XSS Prevention — CWE-79",
    });
  }

  // Command injection risk (multi-language)
  const cmdPattern = /(?:exec|spawn|execSync|spawnSync|execFile|child_process|subprocess|os\.system|os\.popen|Runtime\.exec|ProcessBuilder|Process\.Start|system\s*\(|popen\s*\(|shell_exec|passthru|proc_open)\s*\(.*(?:\+|`|\$\{|%s|\.format)/gi;
  const cmdLines = getLineNumbers(code, cmdPattern);
  if (cmdLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential command injection",
      description: "Shell commands are constructed with string concatenation/interpolation, allowing an attacker to inject arbitrary OS commands if user input is included.",
      lineNumbers: cmdLines,
      recommendation: "Use execFile() with an argument array instead of exec(). Never concatenate user input into shell commands. Validate and sanitize all inputs.",
      reference: "OWASP Command Injection — CWE-78",
    });
  }

  // Disabled TLS / certificate validation
  const tlsRejectPattern = /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true|ssl_verify\s*=\s*false|ServerCertificateValidationCallback\s*=.*true|CURLOPT_SSL_VERIFYPEER.*false|verify_ssl\s*=\s*false/gi;
  const tlsLines = getLineNumbers(code, tlsRejectPattern);
  if (tlsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "TLS certificate validation disabled",
      description: "TLS certificate verification is explicitly disabled, making the application vulnerable to man-in-the-middle (MITM) attacks.",
      lineNumbers: tlsLines,
      recommendation: "Never disable TLS certificate validation in production. Use proper CA certificates. If using self-signed certs in development, use a CA bundle instead.",
      reference: "CWE-295: Improper Certificate Validation",
    });
  }

  // Insecure CORS
  const corsPattern = /(?:Access-Control-Allow-Origin|cors)\s*[:({]\s*['"]\*/gi;
  const corsLines = getLineNumbers(code, corsPattern);
  if (corsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Overly permissive CORS configuration",
      description: "CORS is configured to allow all origins ('*'), which may allow malicious websites to make cross-origin requests to your API.",
      lineNumbers: corsLines,
      recommendation: "Restrict CORS to specific trusted origins. If credentials are used, '*' is not allowed by browsers anyway — be explicit about allowed origins.",
      reference: "OWASP CORS Misconfiguration — CWE-942",
    });
  }

  // Prototype pollution risk
  const protoPattern = /\.__proto__|Object\.assign\s*\(\s*\{\}|lodash\.merge|_\.merge|deepmerge|Object\.keys.*forEach.*\[/gi;
  const protoLines = getLineNumbers(code, protoPattern);
  if (protoLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potential prototype pollution risk",
      description: "Direct __proto__ access or unchecked Object.assign/deep merge with user-controlled data can lead to prototype pollution attacks.",
      lineNumbers: protoLines,
      recommendation: "Use Object.create(null) for map-like objects, validate keys against a whitelist, and use Map instead of plain objects for dynamic keys.",
      reference: "CWE-1321: Improperly Controlled Modification of Object Prototype Attributes",
    });
  }

  // Disabled linter/type-checker rules
  const disablePattern = /(?:eslint-disable|tslint:disable|@ts-ignore|@ts-nocheck|nosec|noinspection|noqa|type:\s*ignore|#\s*pragma\s+no\s+cover)/gi;
  const disableLines = getLineNumbers(code, disablePattern);
  if (disableLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Linter/type-checker suppression directives found",
      description: "Code contains directives to suppress linter or type-checker warnings. While sometimes necessary, these can mask real security or quality issues.",
      lineNumbers: disableLines,
      recommendation: "Review each suppression directive to ensure it's justified. Add a comment explaining why the suppression is necessary. Remove any that were added simply to silence warnings.",
      reference: "Secure Coding Best Practices",
    });
  }

  // XML External Entity (XXE) injection
  const xxePatterns = /DocumentBuilder|SAXParser|XMLReader|DOMParser|etree\.parse|xml\.sax|parseXML|lxml\.etree|XmlReader|XmlDocument|LIBXML_NOENT/gi;
  const xxeLines = getLineNumbers(code, xxePatterns);
  if (xxeLines.length > 0) {
    const hasProtection = /disallow-doctype-decl|FEATURE_SECURE_PROCESSING|resolve_entities\s*=\s*False|DtdProcessing\.Prohibit|LIBXML_NONET/gi.test(code);
    if (!hasProtection) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "XML parsing without XXE protection",
        description: "XML is parsed without visible protection against XML External Entity (XXE) injection, which can lead to file disclosure, SSRF, or denial of service.",
        lineNumbers: xxeLines,
        recommendation: "Disable external entity resolution and DTD processing in your XML parser. Use defusedxml in Python. Set FEATURE_SECURE_PROCESSING in Java.",
        reference: "OWASP XXE — CWE-611",
      });
    }
  }

  // LDAP injection
  const ldapPatterns = /ldap\.search|ldap_search|DirectorySearcher|LdapTemplate|ldap\.bind/gi;
  const ldapLines = getLineNumbers(code, ldapPatterns);
  if (ldapLines.length > 0) {
    const hasLdapSanitation = /escape|sanitize|ldap_escape|filter_format/gi.test(code);
    if (!hasLdapSanitation) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Potential LDAP injection",
        description: "LDAP queries are constructed without visible input sanitization, potentially allowing LDAP injection attacks.",
        lineNumbers: ldapLines,
        recommendation: "Escape special LDAP characters in user input. Use parameterized LDAP queries or the ldap_escape function.",
        reference: "OWASP LDAP Injection — CWE-90",
      });
    }
  }

  // Server-Side Request Forgery (SSRF)
  const ssrfPatterns = /(?:fetch|axios|http\.get|requests\.get|urllib|HttpClient|WebClient|curl)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|url\s*=)/gi;
  const ssrfLines = getLineNumbers(code, ssrfPatterns);
  if (ssrfLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential Server-Side Request Forgery (SSRF)",
      description: "User input is used to construct a URL for server-side requests, allowing attackers to access internal services, cloud metadata endpoints, or arbitrary external resources.",
      lineNumbers: ssrfLines,
      recommendation: "Validate and whitelist allowed URLs/domains. Block access to internal IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.169.254). Use a URL parser to verify the host.",
      reference: "OWASP SSRF — CWE-918",
    });
  }

  // Open redirect
  const redirectPatterns = /(?:res\.redirect|Response\.Redirect|redirect|HttpResponseRedirect|header\s*\(\s*["']Location)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|url\s*=)/gi;
  const redirectLines = getLineNumbers(code, redirectPatterns);
  if (redirectLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potential open redirect",
      description: "User-controlled input is used in a redirect URL, which can be exploited for phishing attacks by redirecting users to malicious sites.",
      lineNumbers: redirectLines,
      recommendation: "Validate redirect URLs against a whitelist of allowed domains. Use relative paths or map redirect targets to predefined safe URLs.",
      reference: "OWASP Open Redirect — CWE-601",
    });
  }

  // ReDoS (Regular Expression Denial of Service)
  const regexPatterns = /new\s+RegExp\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input|user)/gi;
  const regexLines = getLineNumbers(code, regexPatterns);
  if (regexLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "User input in RegExp — ReDoS risk",
      description: "User input is used to construct a regular expression, which can cause catastrophic backtracking (ReDoS) with crafted input, hanging the server.",
      lineNumbers: regexLines,
      recommendation: "Never use user input in RegExp without escaping. Use safe-regex or re2 for untrusted patterns. Set timeouts on regex operations.",
      reference: "CWE-1333: Inefficient Regular Expression Complexity",
    });
  }

  // Template injection (SSTI)
  const templatePatterns = /render_template_string|Template\(.*(?:req|request|input|user)|Jinja2|nunjucks\.renderString|Handlebars\.compile\s*\(.*(?:req|input)|ERB\.new\s*\(.*(?:params|request)/gi;
  const templateLines = getLineNumbers(code, templatePatterns);
  if (templateLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential Server-Side Template Injection (SSTI)",
      description: "User input appears to be passed directly to template rendering, allowing attackers to execute arbitrary code via template syntax.",
      lineNumbers: templateLines,
      recommendation: "Never pass user input as template source. Use templates only from trusted files with parameterized data. Enable sandboxing if available.",
      reference: "OWASP SSTI — CWE-1336",
    });
  }

  // CRLF injection / HTTP header injection
  const crlfPatterns = /(?:setHeader|writeHead|res\.set|response\.header|header\s*\()\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input)/gi;
  const crlfLines = getLineNumbers(code, crlfPatterns);
  if (crlfLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Potential HTTP header injection",
      description: "User input may be used in HTTP response headers, allowing CRLF injection to set arbitrary headers or split responses.",
      lineNumbers: crlfLines,
      recommendation: "Strip \\r\\n characters from any user input used in headers. Validate and encode header values.",
      reference: "CWE-113: Improper Neutralization of CRLF Sequences",
    });
  }

  // Missing security headers
  const hasHelmet = /helmet|X-Content-Type-Options|Content-Security-Policy|X-Frame-Options|Strict-Transport-Security|X-XSS-Protection/gi.test(code);
  const hasServer = /app\.(listen|use)|createServer|express\(\)|Flask\(|Django|WebApplication|Startup/gi.test(code);
  if (hasServer && !hasHelmet) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No security headers configured",
      description: "HTTP server code does not configure security headers (CSP, X-Frame-Options, HSTS, etc.), leaving it vulnerable to clickjacking, XSS, and other attacks.",
      recommendation: "Use helmet (Express), django-security middleware, or manually set: Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security.",
      reference: "OWASP Security Headers — CWE-693",
    });
  }

  // Insecure session configuration
  const sessionPatterns = /session\s*\(\s*\{|express-session|SessionMiddleware|session_config/gi;
  const sessionLines = getLineNumbers(code, sessionPatterns);
  if (sessionLines.length > 0) {
    const hasSecureSession = /secure\s*:\s*true|HttpOnly|sameSite/gi.test(code);
    if (!hasSecureSession) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Insecure session configuration",
        description: "Session middleware is configured without secure cookie settings, making sessions vulnerable to hijacking.",
        lineNumbers: sessionLines,
        recommendation: "Configure sessions with secure: true, httpOnly: true, sameSite: 'strict', and a reasonable maxAge. Use a server-side session store.",
        reference: "OWASP Session Management — CWE-614",
      });
    }
  }

  // Weak password requirements
  const passwordValidation = /password.*(?:length|min|max|regex|pattern|require)/gi;
  const hasPasswordInput = /password|passwd|pwd/gi.test(code);
  const hasAuthRoutes = /(?:register|signup|sign-up|createUser|changePassword|resetPassword)/gi.test(code);
  if (hasAuthRoutes && hasPasswordInput && !passwordValidation.test(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No password complexity validation",
      description: "Authentication endpoints handle passwords but no password complexity rules (minimum length, character requirements) are visible.",
      recommendation: "Enforce minimum 8-character passwords with complexity requirements. Use NIST SP 800-63B guidelines. Check against breached password databases (Have I Been Pwned).",
      reference: "NIST SP 800-63B — CWE-521",
    });
  }

  // Hardcoded admin/backdoor accounts
  const backdoorPatterns = /(?:admin|root|superuser|backdoor)\s*[:=]\s*["'][^"']+["'].*(?:password|passwd|pwd)|(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["'].*(?:admin|root|superuser)/gi;
  const backdoorLines = getLineNumbers(code, backdoorPatterns);
  if (backdoorLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded admin/backdoor credentials",
      description: "Hardcoded admin or superuser credentials create a permanent backdoor. These are trivially discovered by examining the source code.",
      lineNumbers: backdoorLines,
      recommendation: "Remove hardcoded credentials. Use environment-based configuration and initial setup scripts for admin accounts.",
      reference: "CWE-798: Use of Hard-coded Credentials",
    });
  }

  // Missing rate limiting on auth endpoints
  const authEndpoints = getLineNumbers(code, /(?:login|signin|sign-in|authenticate|auth|password|token)\s*['",:]/gi);
  const hasRateLimit = /rate.?limit|throttle|limiter|brute/gi.test(code);
  if (authEndpoints.length > 0 && !hasRateLimit) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Authentication endpoints without rate limiting",
      description: "Authentication-related code exists without visible rate limiting, making it vulnerable to brute-force and credential stuffing attacks.",
      lineNumbers: authEndpoints.slice(0, 5),
      recommendation: "Implement rate limiting on login/auth endpoints. Use progressive delays, account lockouts, or CAPTCHA after failed attempts.",
      reference: "OWASP Brute Force — CWE-307",
    });
  }

  return findings;
}
