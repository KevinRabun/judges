import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, testCode } from "./shared.js";
import * as LP from "../language-patterns.js";

/**
 * General Security Posture evaluator.
 *
 * Produces SEC-prefixed findings for broad security anti-patterns:
 * insecure data flows, weak cryptography, missing security controls,
 * and unsafe code patterns across all supported languages.
 *
 * Complements domain-specific judges (CYBER, AUTH, DATA) by providing
 * a holistic security assessment.
 */
export function analyzeSecurity(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "SEC";
  const lang = getLangFamily(language);
  const lines = code.split("\n");

  // ── SEC-001: Untrusted input in database query construction ────────────
  // Broad pattern: SQL keywords + string interpolation/concatenation
  {
    const sqlDataFlowLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // SQL keyword on a line with interpolation or concat
      if (/\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|SET|VALUES|INTO|JOIN|ORDER\s+BY|GROUP\s+BY)\b/i.test(line)) {
        if (
          /\$\{/.test(line) || // template literal interpolation
          /\+\s*\w/.test(line) || // string concatenation
          /f["']/.test(line) || // Python f-string
          /\.format\s*\(/.test(line) || // Python .format()
          /String\.format/i.test(line) || // Java String.format
          /fmt\.Sprintf/i.test(line) || // Go fmt.Sprintf
          /%s/.test(line) // printf-style interpolation
        ) {
          sqlDataFlowLines.push(i + 1);
        }
      }
    }
    if (sqlDataFlowLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Untrusted input flows into database query construction",
        description:
          "Database queries are built using dynamic string operations (concatenation, interpolation, or formatting) which can introduce injection vulnerabilities when user-controlled data is included.",
        lineNumbers: sqlDataFlowLines,
        recommendation:
          "Use parameterized queries or prepared statements exclusively. Separate SQL structure from data values.",
        reference: "CWE-89",
        suggestedFix:
          "Replace string building with parameterized queries: db.query('SELECT * FROM t WHERE id = $1', [id]).",
        confidence: 0.9,
      });
    }
  }

  // ── SEC-002: Weak cryptographic algorithm for sensitive operations ──────
  {
    const weakCryptoLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /\b(?:md5|sha1|sha-1|DES|RC4|RC2|Blowfish)\b/i.test(line) &&
        /\b(?:password|passwd|hash|digest|crypt|sign|verify|secret|token|credential)\b/i.test(line)
      ) {
        weakCryptoLines.push(i + 1);
      }
      // Also catch createHash('md5') or hashlib.md5() near password context
      if (
        /(?:createHash|hashlib\.|MessageDigest\.getInstance|Hash(?:Algorithm)?)\s*\(\s*['"]?(?:md5|sha-?1)['"]?\s*\)/i.test(
          line,
        )
      ) {
        const ctx = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join("\n");
        if (/password|passwd|credential|secret|user/i.test(ctx)) {
          weakCryptoLines.push(i + 1);
        }
      }
    }
    const uniqueLines = [...new Set(weakCryptoLines)].sort((a, b) => a - b);
    if (uniqueLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Weak cryptographic algorithm used for sensitive operations",
        description:
          "A cryptographically weak algorithm (MD5, SHA-1, DES, RC4) is used in a security-sensitive context. These algorithms have known collision or brute-force vulnerabilities.",
        lineNumbers: uniqueLines,
        recommendation:
          "Use bcrypt, scrypt, or Argon2 for password hashing. Use SHA-256+ or AES-256-GCM for general cryptographic operations.",
        reference: "CWE-327 / CWE-328",
        suggestedFix:
          "Replace MD5/SHA1 with bcrypt for passwords: await bcrypt.hash(password, 12). For general hashing use SHA-256.",
        confidence: 0.9,
      });
    }
  }

  // ── SEC-003: Uncontrolled file system access with dynamic paths ─────────
  {
    const fsAccessLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /\b(?:readFile|readFileSync|createReadStream|writeFile|writeFileSync|readdir|unlink|stat|access|open|sendFile|fs\.\w+)\s*\(/i.test(
          line,
        ) ||
        /\b(?:os\.(?:Open|ReadFile)|ioutil\.ReadFile|File\.(?:read|open|new)|file_get_contents|fopen)\s*\(/i.test(line)
      ) {
        // Check if user input is involved (exclude compound identifiers like InputDir, userHome)
        const ctx = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 2)).join("\n");
        if (
          /(?:req\.|request\.|params\.|query\.|body\.|args\.|argv|\binput\s*[=:\[.(]|\buser\s*[=:\[.(])/i.test(ctx) &&
          /(?:\+|`[^`]*\$\{|\.format|path\.join|Path\.Combine|filepath\.Join|os\.path\.join)/i.test(ctx)
        ) {
          fsAccessLines.push(i + 1);
        }
      }
    }
    if (fsAccessLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Uncontrolled file system access with dynamic path construction",
        description:
          "File system operations use paths constructed from external input without validation, potentially allowing access to arbitrary files via directory traversal sequences.",
        lineNumbers: fsAccessLines,
        recommendation:
          "Validate and canonicalize file paths. Ensure resolved paths stay within an allowed base directory. Reject paths containing '..' sequences.",
        reference: "CWE-22 / CWE-73",
        suggestedFix:
          "Validate: const safe = path.resolve(BASE, userInput); if (!safe.startsWith(BASE)) throw new Error('blocked');",
        confidence: 0.9,
      });
    }
  }

  // ── SEC-004: Sensitive data transmitted over unencrypted channel ────────
  {
    const httpInsecureLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/["'`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|example\.com|test)[^"'`\s]+/i.test(line)) {
        const ctx = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 3)).join("\n");
        if (
          /\b(?:fetch|axios|request|http\.get|requests\.|urllib|HttpClient|curl|api|auth|login|password|token|payment|secret|key|credential)\b/i.test(
            ctx,
          )
        ) {
          httpInsecureLines.push(i + 1);
        }
      }
    }
    if (httpInsecureLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Sensitive data transmitted over unencrypted channel",
        description:
          "HTTP (non-TLS) URLs are used in contexts involving sensitive operations or data. Network traffic can be intercepted by attackers on the same network.",
        lineNumbers: httpInsecureLines,
        recommendation:
          "Use HTTPS for all production endpoints. Enforce TLS for any communication involving authentication, tokens, or sensitive data.",
        reference: "CWE-319 / CWE-523",
        suggestedFix: "Replace http:// with https:// for all production endpoints.",
        confidence: 0.85,
      });
    }
  }

  // ── SEC-005: API endpoint without input validation or sanitization ──────
  {
    const hasEndpoints =
      testCode(code, /app\.(?:get|post|put|patch|delete)\s*\(/gi) ||
      testCode(code, /@(?:app\.route|Get|Post|Put|Patch|Delete|RequestMapping)\b/gi) ||
      testCode(code, /router\.(?:get|post|put|patch|delete)\s*\(/gi) ||
      testCode(code, /func\s+\w+\s*\(\s*w\s+http\.ResponseWriter/gi);
    const hasValidation =
      testCode(code, /\b(?:joi|zod|yup|ajv|validate|validator|class-validator|express-validator)\b/gi) ||
      testCode(
        code,
        /\b(?:parseInt|parseFloat|Number\(|isNaN|typeof\s+\w+\s*[!=]==?\s*["'](?:string|number|boolean)["'])\b/gi,
      ) ||
      testCode(code, /\b(?:Schema|schema|ValidationError|validate|sanitize|escape|trim)\b/gi) ||
      testCode(code, /\.(?:required|min|max|length|email|url|uuid|regex|pattern|matches)\s*\(/gi) ||
      // Pydantic / FastAPI / Django form/serializer validation
      testCode(
        code,
        /\b(?:BaseModel|Field\s*\(|EmailStr|HttpUrl|constr|conint|confloat|Serializer|Form\b|ModelForm\b)\b/gi,
      );

    if (hasEndpoints && !hasValidation && lines.length > 10) {
      // Find the endpoint handler lines
      const endpointLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/app\.(?:get|post|put|patch|delete)\s*\(|router\.(?:get|post|put|patch|delete)\s*\(/i.test(lines[i])) {
          endpointLines.push(i + 1);
        }
      }
      if (endpointLines.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "API endpoint processes external input without validation",
          description:
            "Endpoint handlers accept and use external input (request body, query parameters, URL parameters) without any visible input validation or sanitization.",
          lineNumbers: endpointLines,
          recommendation:
            "Add input validation using a schema library (Joi, Zod, Yup) or built-in validation. Validate types, ranges, formats, and lengths for all input fields.",
          reference: "CWE-20: Improper Input Validation",
          suggestedFix:
            "Add schema validation: const schema = z.object({ field: z.string().min(1).max(100) }); const data = schema.parse(req.body);",
          confidence: 0.7,
        });
      }
    }
  }

  // ── SEC-006: Missing essential security middleware ──────────────────────
  {
    const hasExpress = testCode(code, /express\(\)|require\s*\(\s*['"]express['"]\s*\)|from\s+['"]express['"]/gi);
    const hasHelmet = testCode(code, /helmet\b/gi);
    const hasCors = testCode(code, /\bcors\b/gi);
    const hasCsrf = testCode(code, /csrf|csurf/gi);
    const hasRateLimit = testCode(code, /rate.?limit/gi);

    if (hasExpress && !hasHelmet && lines.length > 10) {
      const expressLines: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (/express\(\)|require\s*\(\s*['"]express['"]\)/i.test(lines[i])) {
          expressLines.push(i + 1);
        }
      }
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Web framework missing essential security hardening",
        description:
          "Express/Node.js application does not use security middleware (Helmet) to set protective HTTP headers (CSP, HSTS, X-Frame-Options, etc.)." +
          (!hasCors ? " CORS configuration is also missing." : "") +
          (!hasCsrf ? " CSRF protection is not configured." : "") +
          (!hasRateLimit ? " Rate limiting is not configured." : ""),
        lineNumbers: expressLines.length > 0 ? expressLines : undefined,
        recommendation:
          "Add helmet() middleware for security headers, CORS configuration, CSRF protection, and rate limiting.",
        reference: "OWASP Secure Headers Project",
        suggestedFix:
          "Add: app.use(helmet()); app.use(cors({ origin: ALLOWED_ORIGINS })); app.use(csrf()); app.use(rateLimit({ windowMs: 15*60*1000, max: 100 }));",
        confidence: 0.75,
      });
    }
  }

  // ── SEC-007: Server-side request to user-controlled URL ────────────────
  {
    const ssrfLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Direct: fetch(req.query.url) / axios.get(req.body.url)
      if (
        /\b(?:fetch|axios|http\.get|https\.get|requests\.get|urllib|HttpClient|WebClient|reqwest|httpx|aiohttp)\s*\(/i.test(
          line,
        ) &&
        /(?:req\.|request\.|params\.|query\.|body\.|args\.|input)/i.test(line)
      ) {
        ssrfLines.push(i + 1);
      }
      // Indirect: variable assigned from req, then used in fetch
      if (/\b(?:fetch|axios|http\.get|https\.get|requests\.get|requests\.request)\s*\(\s*(\w+)/i.test(line)) {
        const match = line.match(/\b(?:fetch|axios|http\.get|requests\.get)\s*\(\s*(\w+)/i);
        if (match) {
          const varName = match[1];
          if (varName && !/^['"`]/.test(varName) && varName !== "undefined" && varName !== "null") {
            const ctx = lines.slice(Math.max(0, i - 10), i).join("\n");
            const assignRe = new RegExp(
              `(?:const|let|var|\\w+)\\s*${varName}\\s*[:=]\\s*.*(?:req\\.|request\\.|params\\.|query\\.|body\\.|args\\.|input|url)`,
              "i",
            );
            if (assignRe.test(ctx)) {
              ssrfLines.push(i + 1);
            }
          }
        }
      }
    }
    const uniqueSsrf = [...new Set(ssrfLines)].sort((a, b) => a - b);
    if (uniqueSsrf.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Server-side HTTP request to user-controlled destination",
        description:
          "A URL derived from user input is passed to a server-side HTTP client, allowing attackers to probe internal services, cloud metadata endpoints (169.254.169.254), or exfiltrate data.",
        lineNumbers: uniqueSsrf,
        recommendation:
          "Validate URLs against an allowlist of permitted domains. Block internal/private IP ranges. Use a URL parser to verify the scheme and host before making requests.",
        reference: "CWE-918",
        suggestedFix:
          "Validate: const url = new URL(input); if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error('blocked');",
        confidence: 0.85,
      });
    }
  }

  // ── SEC-008: Unsafe recursive object merge allowing property injection ──
  {
    const mergeLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Object.assign, spread, _.merge, _.extend, deep merge with user input
      if (
        /(?:Object\.assign|deepMerge|deepExtend|_\.merge|_\.extend|_\.defaultsDeep|lodash\.merge|merge\(|extend\()\s*\(/i.test(
          line,
        ) &&
        /(?:req\.|request\.|body\.|params\.|query\.|input|user)/i.test(line)
      ) {
        mergeLines.push(i + 1);
      }
      // Recursive property assignment from user input
      if (/\[.*(?:req\.|request\.|body\.|input|key|prop)\s*\]/i.test(line) && /\s*=\s*/.test(line)) {
        const ctx = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 3)).join("\n");
        if (/\b(?:for|while|forEach|Object\.keys|Object\.entries)\b/i.test(ctx)) {
          mergeLines.push(i + 1);
        }
      }
    }
    if (mergeLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Unsafe recursive object merge allowing property injection",
        description:
          "User-controlled input is merged into objects via recursive merge/extend operations, allowing attackers to inject __proto__, constructor, or prototype properties to modify object behavior globally.",
        lineNumbers: mergeLines,
        recommendation:
          "Use a merge function that blocks prototype keys. Validate/whitelist allowed properties before merging. Freeze prototypes where possible.",
        reference: "CWE-1321",
        suggestedFix:
          "Filter dangerous keys: const safeData = Object.fromEntries(Object.entries(input).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k)));",
        confidence: 0.85,
      });
    }
  }

  // ── SEC-009: Token verification without algorithm restriction ───────────
  {
    const jwtLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/jwt\.verify|jwt\.decode|jose\.jwtVerify|jsonwebtoken/i.test(line)) {
        const ctx = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 5)).join("\n");
        // Check if algorithms is specified in options
        if (!/algorithms\s*[=:]/.test(ctx) && !/algorithm\s*[=:]/.test(ctx)) {
          jwtLines.push(i + 1);
        }
        // Check for 'none' algorithm explicitly allowed
        if (/['"]none['"]/i.test(ctx)) {
          jwtLines.push(i + 1);
        }
      }
      // Java/C# JWT verification without algorithm check
      if (/JwtParser|JWTVerifier|TokenValidationParameters|JwtSecurityTokenHandler/i.test(line)) {
        const ctx = lines.slice(i, Math.min(lines.length, i + 8)).join("\n");
        if (!/(?:algorithms|signatureAlgorithm|ValidAlgorithms)\s*[=:]/i.test(ctx)) {
          jwtLines.push(i + 1);
        }
      }
    }
    const uniqueJwt = [...new Set(jwtLines)].sort((a, b) => a - b);
    if (uniqueJwt.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Token verification without algorithm restriction",
        description:
          "JWT/token verification does not restrict the allowed signing algorithms. This can allow 'none' algorithm attacks where an attacker submits unsigned tokens that are accepted as valid.",
        lineNumbers: uniqueJwt,
        recommendation:
          "Always specify allowed algorithms explicitly: jwt.verify(token, secret, { algorithms: ['HS256'] }). Never allow the 'none' algorithm.",
        reference: "CWE-345 / CWE-347",
        suggestedFix: "Add algorithm restriction: jwt.verify(token, secret, { algorithms: ['HS256'] });",
        confidence: 0.9,
      });
    }
  }

  // ── SEC-010: Direct user input in data modification without field filtering ──
  {
    const massAssignLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // req.body spread into DB operations
      if (
        /(?:\.create|\.update\w*|\.insert|\.findOneAndUpdate|\.updateOne|\.save|\.set|Model\.\w+|db\.\w+)\s*\(/i.test(
          line,
        ) &&
        /(?:req\.body|request\.body|\.\.\.req\.body|\.\.\.request\.body|\breq\.body\b)/i.test(line)
      ) {
        massAssignLines.push(i + 1);
      }
      // Spread in object literal for DB
      if (/\{\s*\.\.\.req\.body|\{\s*\.\.\.request\.body/i.test(line)) {
        const ctx = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
        if (/(?:\.create|\.update|\.save|query|Model)/i.test(ctx)) {
          massAssignLines.push(i + 1);
        }
      }
    }
    const uniqueMass = [...new Set(massAssignLines)].sort((a, b) => a - b);
    if (uniqueMass.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Direct user input in data modification without field filtering",
        description:
          "Request body is passed directly to database create/update operations without field whitelisting. Attackers can inject unexpected fields (isAdmin, role, price) to escalate privileges.",
        lineNumbers: uniqueMass,
        recommendation:
          "Explicitly pick allowed fields: const { name, email } = req.body; Model.update({ name, email }). Use DTOs or validation schemas.",
        reference: "CWE-915",
        suggestedFix: "Whitelist fields: const { name, email } = req.body; await Model.update({ name, email });",
        confidence: 0.85,
      });
    }
  }

  // ── SEC-011: Unvalidated redirect destination ──────────────────────────
  {
    const redirectLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /(?:res\.redirect|response\.redirect|Response\.Redirect|redirect\(|sendRedirect|header\s*\(\s*['"]Location)/i.test(
          line,
        ) &&
        /(?:req\.|request\.|params\.|query\.|body\.|args\.|input|url)/i.test(line)
      ) {
        redirectLines.push(i + 1);
      }
      // Indirect: redirect with a variable from user input
      if (/(?:res\.redirect|response\.redirect|redirect)\s*\(\s*(\w+)/i.test(line)) {
        const match = line.match(/(?:res\.redirect|response\.redirect|redirect)\s*\(\s*(\w+)/i);
        if (match) {
          const varName = match[1];
          if (
            varName &&
            !/^['"`]/.test(varName) &&
            varName !== "undefined" &&
            varName !== "null" &&
            varName.length > 1
          ) {
            const ctx = lines.slice(Math.max(0, i - 8), i).join("\n");
            const assignRe = new RegExp(
              `(?:const|let|var)?\\s*${varName}\\s*[:=]\\s*.*(?:req\\.|request\\.|query\\.|params\\.|body\\.)`,
              "i",
            );
            if (assignRe.test(ctx)) {
              redirectLines.push(i + 1);
            }
          }
        }
      }
    }
    const uniqueRedirect = [...new Set(redirectLines)].sort((a, b) => a - b);
    if (uniqueRedirect.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Unvalidated redirect to user-controlled destination",
        description:
          "HTTP redirect uses a URL derived from user input without validation. Attackers can redirect users to phishing sites or malicious pages.",
        lineNumbers: uniqueRedirect,
        recommendation:
          "Validate redirect URLs against an allowlist of permitted destinations. Only allow relative paths or known domains.",
        reference: "CWE-601",
        suggestedFix:
          "Validate: const url = new URL(target, req.headers.origin); if (!ALLOWED_HOSTS.includes(url.hostname)) throw new Error('blocked');",
        confidence: 0.85,
      });
    }
  }

  // ── SEC-012: Non-constant-time secret comparison ───────────────────────
  {
    const timingLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        /(?:===?|!==?)\s*(?:signature|secret|token|hmac|hash|digest|apiKey|api_key|expected|computed)/i.test(line) ||
        /(?:signature|secret|token|hmac|hash|digest|apiKey|api_key|expected|computed)\s*(?:===?|!==?)/i.test(line)
      ) {
        const ctx = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 6)).join("\n");
        if (
          !/timingSafeEqual|constantTimeCompare|hmac\.Equal|secure_compare|constant_time_compare|compare_digest|MessageDigest\.isEqual/i.test(
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
        title: "Non-constant-time comparison of cryptographic material",
        description:
          "Secrets, tokens, or signatures are compared using standard equality operators which leak timing information. Attackers can determine correct values byte-by-byte by measuring response time differences.",
        lineNumbers: timingLines,
        recommendation:
          "Use constant-time comparison functions: crypto.timingSafeEqual() (Node.js), hmac.Equal() (Go), hmac.compare_digest() (Python).",
        reference: "CWE-208",
        suggestedFix: "Replace === with: crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));",
        confidence: 0.85,
      });
    }
  }

  // ── SEC-013: XML processing without entity restriction ─────────────────
  {
    const xxeLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Java: DocumentBuilderFactory, SAXParserFactory, XMLInputFactory without setFeature
      if (/(?:DocumentBuilderFactory|SAXParserFactory|XMLInputFactory|XMLReader|TransformerFactory)\.new/i.test(line)) {
        const ctx = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
        if (
          !/setFeature\s*\(.*(?:FEATURE_SECURE_PROCESSING|XMLConstants\.FEATURE_SECURE_PROCESSING|disallow-doctype-decl|external-general-entities)/i.test(
            ctx,
          ) &&
          !/setProperty.*ACCESS_EXTERNAL/i.test(ctx)
        ) {
          xxeLines.push(i + 1);
        }
      }
      // Python: xml.etree, lxml without defused
      if (/(?:ElementTree\.parse|etree\.parse|minidom\.parse|xml\.sax\.parse|lxml\.etree)\s*\(/i.test(line)) {
        const fullCode = lines.join("\n");
        if (!/defusedxml|defused/i.test(fullCode)) {
          xxeLines.push(i + 1);
        }
      }
      // C#: XmlReader, XmlDocument without DtdProcessing.Prohibit
      if (/(?:XmlReader\.Create|XmlDocument\(\)|XDocument\.Load)\b/i.test(line)) {
        const ctx = lines.slice(i, Math.min(lines.length, i + 8)).join("\n");
        if (!/DtdProcessing\.Prohibit|DtdProcessing\s*=\s*DtdProcessing\.Prohibit|ProhibitDtd/i.test(ctx)) {
          xxeLines.push(i + 1);
        }
      }
    }
    if (xxeLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "XML processing without external entity restriction",
        description:
          "XML parsers are used without disabling external entity resolution, enabling XXE attacks that can read local files, perform SSRF, or cause denial of service.",
        lineNumbers: xxeLines,
        recommendation:
          "Disable external entity processing: set FEATURE_SECURE_PROCESSING, disallow-doctype-decl, or use defusedxml (Python). In C#, set DtdProcessing.Prohibit.",
        reference: "CWE-611",
        suggestedFix:
          "Java: factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true); Python: import defusedxml.ElementTree as ET",
        confidence: 0.9,
      });
    }
  }

  // ── SEC-014: Unsafe memory operations without safety documentation ─────
  if (lang === "rust") {
    const unsafeLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (/\bunsafe\s*\{/.test(lines[i])) {
        unsafeLines.push(i + 1);
      }
    }
    if (unsafeLines.length > 0) {
      const fullCode = lines.join("\n");
      if (!/\/\/\s*SAFETY\s*:|\/\/\s*UNSAFE\s*:/i.test(fullCode)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Unsafe memory operations without safety invariant documentation",
          description:
            "Unsafe code blocks bypass memory safety guarantees without documenting the safety invariants that must hold. This risks buffer overflows, use-after-free, and data races.",
          lineNumbers: unsafeLines,
          recommendation:
            "Document safety invariants with // SAFETY: comments. Minimize unsafe scope. Prefer safe abstractions where possible.",
          reference: "CWE-119 / CWE-787",
          suggestedFix: "Add: // SAFETY: <explain why this is safe> above each unsafe block.",
          confidence: 0.85,
        });
      }
    }
  }

  // ── SEC-015: Deserialization of untrusted data ─────────────────────────
  {
    const deserLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Python pickle/yaml/marshal
      if (/\b(?:pickle\.loads?|yaml\.(?:load|unsafe_load)|marshal\.loads?)\s*\(/i.test(line)) {
        deserLines.push(i + 1);
      }
      // Java ObjectInputStream
      if (/\b(?:ObjectInputStream|XMLDecoder|readObject|readUnshared)\b/i.test(line)) {
        deserLines.push(i + 1);
      }
      // PHP unserialize
      if (/\bunserialize\s*\(/i.test(line)) {
        deserLines.push(i + 1);
      }
      // Ruby Marshal.load
      if (/\bMarshal\.load\b/i.test(line)) {
        deserLines.push(i + 1);
      }
      // .NET BinaryFormatter
      if (/\bBinaryFormatter\.Deserialize\b/i.test(line)) {
        deserLines.push(i + 1);
      }
    }
    if (deserLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Deserialization of data from untrusted sources",
        description:
          "Unsafe deserialization functions (pickle, ObjectInputStream, Marshal, BinaryFormatter) process data that may originate from untrusted sources, enabling remote code execution.",
        lineNumbers: deserLines,
        recommendation:
          "Never deserialize untrusted data. Use JSON for data exchange with schema validation. Avoid pickle, ObjectInputStream, Marshal for user-facing inputs.",
        reference: "CWE-502",
        suggestedFix:
          "Replace with safe alternatives: JSON with schema validation, data transfer objects, or type-safe serialization formats.",
        confidence: 0.9,
      });
    }
  }

  return findings;
}
