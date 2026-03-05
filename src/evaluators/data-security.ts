import type { Finding } from "../types.js";
import {
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
  looksLikeRealCredentialValue,
  testCode,
  getContextWindow,
  isLikelyAnalysisCode,
} from "./shared.js";
import * as LP from "../language-patterns.js";

function lineContainsRealQuotedSecret(line: string, pattern: RegExp): boolean {
  const matches = [...line.matchAll(pattern)];
  if (matches.length === 0) return false;

  return matches.some((match) => {
    const full = match[0] ?? "";
    const quotedValueMatch = full.match(/["']([^"']+)["']/);
    if (!quotedValueMatch) return true;
    const value = quotedValueMatch[1] ?? "";
    return looksLikeRealCredentialValue(value);
  });
}

function isLikelyNonProductionContext(lines: string[], index: number): boolean {
  const contextStart = Math.max(0, index - 2);
  const contextEnd = Math.min(lines.length, index + 3);
  const context = lines.slice(contextStart, contextEnd).join("\n");

  const nonProductionSignals =
    /\b(?:describe|it|test)\s*\(|\b(?:tests?|mock|mocks|fixture|fixtures|harness|e2e|example|sample|dummy)\b/i;
  const productionSignals = /\b(?:prod|production|release|deploy|deployment)\b/i;

  return nonProductionSignals.test(context) && !productionSignals.test(context);
}

function filterNonProductionLineNumbers(code: string, lineNumbers: number[]): number[] {
  const lines = code.split("\n");
  return lineNumbers.filter((lineNumber) => !isLikelyNonProductionContext(lines, lineNumber - 1));
}

function getFilteredHardcodedSecretLines(code: string, pattern: RegExp): number[] {
  const lines = code.split("\n");
  const flaggedLines: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (lineContainsRealQuotedSecret(lines[index], pattern) && !isLikelyNonProductionContext(lines, index)) {
      flaggedLines.push(index + 1);
    }
  }

  return flaggedLines;
}

export function analyzeDataSecurity(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "DATA";
  const _lang = getLangFamily(language);

  // Analysis code references PII/secret/credential keywords in regex patterns
  // for detection purposes — these are not real sensitive data.
  if (isLikelyAnalysisCode(code)) return findings;

  // Hardcoded secrets (multi-language)
  const secretPatterns = [
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/gi, name: "password" },
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][^"']+["']/gi, name: "API key" },
    { pattern: /(?:secret|token)\s*[:=]\s*["'][^"']+["']/gi, name: "secret/token" },
    { pattern: /(?:connection[_-]?string)\s*[:=]\s*["'][^"']+["']/gi, name: "connection string" },
    { pattern: /(?:private[_-]?key)\s*[:=]\s*["'][^"']+["']/gi, name: "private key" },
    { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/gi, name: "embedded private key" },
    { pattern: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*["'][^"']+["']/gi, name: "AWS credential" },
    { pattern: /AKIA[0-9A-Z]{16}/g, name: "AWS access key ID" },
    { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, name: "GitHub token" },
    { pattern: /xox[bprs]-[0-9a-zA-Z-]{10,}/g, name: "Slack token" },
    { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: "OpenAI/Stripe secret key" },
    { pattern: /(?:SG\.)[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g, name: "SendGrid API key" },
    { pattern: /(?:bearer|authorization)\s*[:=]\s*["'][^"']{20,}["']/gi, name: "hardcoded auth token" },
    {
      pattern: /(?:AZURE|MICROSOFT)_[A-Z_]*(?:KEY|SECRET|TOKEN|CONNECTION)\s*[:=]\s*["'][^"']+["']/gi,
      name: "Azure credential",
    },
    { pattern: /(?:DATABASE_URL|MONGO_URI|REDIS_URL)\s*[:=]\s*["'][^"']+["']/gi, name: "database connection URL" },
  ];

  const filteredQuotedSecretNames = new Set([
    "password",
    "API key",
    "secret/token",
    "connection string",
    "private key",
    "AWS credential",
    "hardcoded auth token",
    "Azure credential",
    "database connection URL",
  ]);

  for (const sp of secretPatterns) {
    const baseLines = filteredQuotedSecretNames.has(sp.name)
      ? getFilteredHardcodedSecretLines(code, sp.pattern)
      : getLineNumbers(code, sp.pattern);
    const lines = filterNonProductionLineNumbers(code, baseLines);
    if (lines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: `Hardcoded ${sp.name} detected`,
        description: `A ${sp.name} appears to be hardcoded in the source code. This is a severe data security risk as it can be extracted from version control, build artifacts, or decompiled binaries.`,
        lineNumbers: lines,
        recommendation: `Move the ${sp.name} to a secrets manager (e.g., Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) or at minimum to environment variables. Never commit secrets to source control.`,
        reference: "OWASP: Hardcoded Credentials — CWE-798",
        suggestedFix: `Replace hardcoded ${sp.name} with an environment variable: process.env.SECRET_NAME or inject from a secrets manager at runtime.`,
        confidence: 0.9,
      });
    }
  }

  // Console/print logging of sensitive data (multi-language)
  const logSensitivePatterns =
    /(?:console\.\w+|print|println|printf|log\.\w+|logger\.\w+|logging\.\w+|System\.out|System\.err|fmt\.Print|puts|echo)\s*\(.*(?:password|secret|token|key|credential|ssn|credit.?card|cvv|pin_code)/gi;
  const logLines = getLineNumbers(code, logSensitivePatterns);
  if (logLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Sensitive data may be logged",
      description:
        "Log output appears to include sensitive data fields such as passwords, tokens, or PII. This can lead to credential exposure in log aggregation systems.",
      lineNumbers: logLines,
      recommendation:
        "Remove sensitive data from log statements. Use structured logging with redaction filters to automatically mask sensitive fields.",
      reference: "OWASP Logging Cheat Sheet — CWE-532",
      suggestedFix:
        "Remove sensitive fields from log calls or redact them: logger.info('User login', { userId: user.id }) instead of logging passwords/tokens.",
      confidence: 0.85,
    });
  }

  // Weak hashing (multi-language)
  const weakHashLines = getLangLineNumbers(code, language, LP.WEAK_HASH);
  if (weakHashLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Weak hashing algorithm used",
      description:
        "MD5 or SHA1 is used, which are cryptographically broken for security purposes. They should not be used for password hashing, data integrity verification, or any security-sensitive context.",
      lineNumbers: weakHashLines,
      recommendation: "Use SHA-256/SHA-512 for integrity checks, or bcrypt/scrypt/argon2 for password hashing.",
      reference: "NIST SP 800-131A — CWE-328",
      suggestedFix:
        "Replace MD5/SHA1 with SHA-256 for integrity, or bcrypt/argon2 for passwords: crypto.createHash('sha256') or await bcrypt.hash(password, 12).",
      confidence: 0.9,
    });
  }

  // SQL injection risk (multi-language)
  const sqlLines = getLangLineNumbers(code, language, LP.SQL_INJECTION);
  if (sqlLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential SQL injection via string concatenation",
      description:
        "SQL queries appear to be constructed using string interpolation or concatenation with user input, which can lead to SQL injection attacks and data breaches.",
      lineNumbers: sqlLines,
      recommendation:
        "Use parameterized queries or prepared statements. Never concatenate user input into SQL strings directly.",
      reference: "OWASP SQL Injection — CWE-89",
      suggestedFix:
        "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId]) instead of string concatenation.",
      confidence: 0.95,
    });
  }

  // No encryption in HTTP calls
  const httpPatterns = /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/gi;
  const httpLines = getLineNumbers(code, httpPatterns);
  if (httpLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unencrypted HTTP connection",
      description:
        "Non-localhost HTTP URLs are used instead of HTTPS, meaning data is transmitted in plaintext and vulnerable to interception.",
      lineNumbers: httpLines,
      recommendation: "Use HTTPS for all non-local connections to ensure data in transit is encrypted with TLS.",
      reference: "OWASP Transport Layer Protection — CWE-319",
      suggestedFix: "Replace http:// with https:// for all non-localhost URLs to encrypt data in transit.",
      confidence: 0.9,
    });
  }

  // Unsafe deserialization (multi-language)
  const deserLines = getLangLineNumbers(code, language, LP.UNSAFE_DESERIALIZATION);
  if (deserLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Unsafe deserialization detected",
      description:
        "Deserializing untrusted data (pickle, YAML, Java ObjectInputStream, PHP unserialize, .NET BinaryFormatter) can lead to remote code execution.",
      lineNumbers: deserLines,
      recommendation:
        "Never deserialize untrusted data. Use safe alternatives: yaml.safe_load(), JSON instead of pickle, whitelist-based deserialization. Validate and sanitize all input before deserialization.",
      reference: "OWASP Deserialization — CWE-502",
      suggestedFix:
        "Replace unsafe deserialization: use yaml.safe_load() instead of yaml.load(), JSON.parse() instead of pickle/eval, or whitelist-based deserialization.",
      confidence: 0.85,
    });
  }

  // Cookie without security flags
  const cookieNoFlagLines = getLineNumbers(code, /(?:res\.cookie|setCookie|set_cookie|SetCookie)\s*\(/gi);
  if (cookieNoFlagLines.length > 0) {
    const hasSecure = testCode(code, /secure\s*:\s*true|Secure/gi);
    const hasHttpOnly = testCode(code, /httpOnly\s*:\s*true|HttpOnly/gi);
    if (!hasSecure || !hasHttpOnly) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Cookie may lack security flags",
        description:
          "Cookies are set without explicit Secure, HttpOnly, or SameSite flags, making them vulnerable to interception and XSS-based theft.",
        lineNumbers: cookieNoFlagLines,
        recommendation:
          "Set Secure, HttpOnly, and SameSite=Strict (or Lax) flags on all cookies. Use __Host- prefix for sensitive cookies.",
        reference: "OWASP Session Management — CWE-614",
        suggestedFix:
          "Add security flags: res.cookie('name', value, { secure: true, httpOnly: true, sameSite: 'strict' });",
        confidence: 0.8,
      });
    }
  }

  // JWT without verification
  const jwtNoVerifyPatterns = /jwt\.decode\s*\(|jose\.decode\s*\(|JWT\.decode\s*\(/gi;
  // Post-filter: Python's PyJWT uses jwt.decode(token, key, algorithms=[...]) for VERIFIED decode.
  // Only jwt.decode() without algorithms= or with verify_signature=False is insecure.
  const jwtCodeLines = code.split("\n");
  const jwtNoVerifyLines = getLineNumbers(code, jwtNoVerifyPatterns).filter((ln) => {
    const ctx = getContextWindow(jwtCodeLines, ln, 2);
    return !(/algorithms\s*=/.test(ctx) || /,\s*\w+\s*,\s*algorithms/.test(ctx));
  });
  if (jwtNoVerifyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "JWT decoded without signature verification",
      description:
        "JWT tokens are decoded without verifying the signature, allowing attackers to forge tokens with arbitrary claims.",
      lineNumbers: jwtNoVerifyLines,
      recommendation:
        "Always use jwt.verify() instead of jwt.decode(). Validate the signature, issuer, audience, and expiration claims.",
      reference: "OWASP JWT Security — CWE-345",
      suggestedFix:
        "Replace jwt.decode() with jwt.verify(token, secret, { algorithms: ['RS256'], issuer: 'expected-issuer' });",
      confidence: 0.9,
    });
  }

  // File upload without validation
  const fileUploadPatterns = /multer|upload|formidable|busboy|multipart|FileUpload|MultipartFile/gi;
  const fileUploadLines = getLineNumbers(code, fileUploadPatterns);
  if (fileUploadLines.length > 0) {
    const hasValidation = testCode(
      code,
      /mime|mimetype|content-type|extension|allowedTypes|fileFilter|accept|maxSize|fileSizeLimit/gi,
    );
    if (!hasValidation) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "File upload without type/size validation",
        description:
          "File uploads are accepted without visible MIME type, extension, or size validation, allowing malicious file uploads.",
        lineNumbers: fileUploadLines,
        recommendation:
          "Validate file type (MIME + extension + magic bytes), enforce size limits, scan for malware, and store uploads outside the webroot.",
        reference: "OWASP Unrestricted File Upload — CWE-434",
        suggestedFix:
          "Add file validation: multer({ fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }) with MIME type and extension checks.",
        confidence: 0.8,
      });
    }
  }

  // Cleartext password storage
  const cleartextPwPatterns =
    /password\s*[:=]\s*(?:req\.|request\.|body\.|input\.|params\.).*(?:save|insert|create|update|store|set)/gi;
  const cleartextLines = getLineNumbers(code, cleartextPwPatterns);
  if (cleartextLines.length > 0) {
    const hasHashing = testCode(code, /bcrypt|argon2|scrypt|pbkdf2|hashPassword|hash_password|PasswordHasher/gi);
    if (!hasHashing) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Password may be stored in cleartext",
        description:
          "User passwords appear to be stored without hashing. If the database is compromised, all passwords are exposed.",
        lineNumbers: cleartextLines,
        recommendation:
          "Hash passwords using bcrypt, argon2, or scrypt with a unique salt per password. Never store passwords in plaintext or with reversible encryption.",
        reference: "OWASP Password Storage — CWE-256",
        suggestedFix:
          "Hash passwords before storage: const hash = await bcrypt.hash(password, 12); and verify with await bcrypt.compare(input, hash).",
        confidence: 0.85,
      });
    }
  }

  // CORS with credentials and wildcard
  const corsCredLines = getLineNumbers(code, /credentials\s*:\s*true|Access-Control-Allow-Credentials/gi);
  const corsWildcard = testCode(code, /Access-Control-Allow-Origin.*\*|origin\s*:\s*['"]?\*/gi);
  if (corsCredLines.length > 0 && corsWildcard) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "CORS with credentials and wildcard origin",
      description:
        "Using Access-Control-Allow-Credentials with a wildcard origin allows any website to make authenticated requests to your API.",
      lineNumbers: corsCredLines,
      recommendation: "Never combine credentials: true with origin: '*'. Whitelist specific trusted origins.",
      reference: "OWASP CORS — CWE-942",
      suggestedFix:
        "Replace origin: '*' with a specific allowlist: origin: ['https://app.example.com'] when credentials: true is used.",
      confidence: 0.9,
    });
  }

  // Missing CSRF protection
  const formPostLines = getLineNumbers(
    code,
    /app\.post\s*\(|router\.post\s*\(|@PostMapping|@RequestMapping.*POST|\.post\s*\(/gi,
  );
  const hasCsrf = testCode(code, /csrf|xsrf|_token|csrfToken|antiforgery|AntiForgery|@csrf/gi);
  if (formPostLines.length > 2 && !hasCsrf) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No CSRF protection detected",
      description:
        "POST endpoints exist but no CSRF tokens or protection middleware is visible, making the application vulnerable to cross-site request forgery.",
      lineNumbers: formPostLines.slice(0, 5),
      recommendation:
        "Implement CSRF protection using tokens (csurf, django.middleware.csrf, @csrf_exempt annotations) or SameSite cookies.",
      reference: "OWASP CSRF — CWE-352",
      suggestedFix:
        "Add CSRF middleware: app.use(csurf({ cookie: { httpOnly: true, sameSite: 'strict' } })); and include token in forms.",
      confidence: 0.7,
    });
  }

  // Exposing stack traces to clients
  const stackTracePatterns =
    /(?:res\.(?:json|send)|response\.(?:json|send))\s*\(.*(?:stack|stackTrace|err\.message|error\.message)|traceback\.format_exc/gi;
  const stackLines = getLineNumbers(code, stackTracePatterns);
  if (stackLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Stack traces exposed to clients",
      description:
        "Error stack traces sent in API responses reveal internal implementation details, file paths, and library versions to attackers.",
      lineNumbers: stackLines,
      recommendation:
        "Return generic error messages to clients. Log detailed errors server-side only. Use different error handlers for development vs production.",
      reference: "OWASP Error Handling — CWE-209",
      suggestedFix:
        "Return generic errors to clients: res.status(500).json({ error: 'Internal error', requestId }); and log details server-side only.",
      confidence: 0.85,
    });
  }

  // Hardcoded encryption keys / IVs
  // Use word boundaries around short tokens like `iv` and `nonce` to avoid
  // matching compound identifiers (e.g., LOGPRIV: "..." should not fire).
  const encKeyPatterns =
    /(?:encryption[_-]?key|aes[_-]?key|\biv\b|initialization[_-]?vector|\bnonce\b)\s*[:=]\s*["'][^"']+["']|(?:Buffer\.from|new\s+Uint8Array)\s*\(.*(?:key|\biv\b)/gi;
  const encKeyLines = filterNonProductionLineNumbers(code, getLineNumbers(code, encKeyPatterns));
  if (encKeyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded encryption key or IV",
      description:
        "Encryption keys and initialization vectors are hardcoded, making encrypted data trivially decryptable by anyone with access to the code.",
      lineNumbers: encKeyLines,
      recommendation:
        "Generate encryption keys securely at runtime or load from a key management service. IVs/nonces must be random and unique per encryption operation.",
      reference: "CWE-321: Use of Hard-coded Cryptographic Key",
      suggestedFix:
        "Load encryption keys from a KMS or env var: const key = Buffer.from(process.env.ENCRYPTION_KEY, 'base64'); and generate IVs with crypto.randomBytes(16).",
      confidence: 0.9,
    });
  }

  // Insecure random number generation for security
  const insecureRandPatterns = /Math\.random\s*\(\)|random\.random\s*\(|rand\s*\(|Random\(\)|new\s+Random\b/gi;
  const insecureRandLines = getLineNumbers(code, insecureRandPatterns);
  if (insecureRandLines.length > 0) {
    const nearSecurity = code.split("\n").some((line, i) => {
      if (insecureRandPatterns.test(line)) {
        const context = code
          .split("\n")
          .slice(Math.max(0, i - 3), i + 3)
          .join("\n");
        return /token|secret|password|key|nonce|salt|session|csrf|otp|verification/i.test(context);
      }
      return false;
    });
    if (nearSecurity) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Insecure random for security context",
        description:
          "Math.random() or similar non-cryptographic PRNGs are used in a security-sensitive context (token generation, etc.). These are predictable.",
        lineNumbers: insecureRandLines,
        recommendation:
          "Use crypto.randomBytes() (Node.js), secrets.token_hex() (Python), SecureRandom (Java/Ruby), or crypto.getRandomValues() (browser).",
        reference: "CWE-330: Use of Insufficiently Random Values",
        suggestedFix:
          "Use crypto.randomBytes(32).toString('hex') (Node.js) or crypto.getRandomValues() (browser) for security-sensitive random values.",
        confidence: 0.85,
      });
    }
  }

  // Path traversal risk
  const pathTraversalPatterns =
    /(?:readFile|writeFile|readdir|open|fopen|file_get_contents|include|require)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input\.|args)/gi;
  const pathTravLines = getLineNumbers(code, pathTraversalPatterns);
  if (pathTravLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential path traversal via user input",
      description:
        "File operations use user-controlled input without apparent sanitization, allowing attackers to read/write arbitrary files using ../ sequences.",
      lineNumbers: pathTravLines,
      recommendation:
        "Validate and sanitize file paths. Use path.resolve() + startsWith() checks, or a whitelist of allowed paths. Never pass user input directly to file operations.",
      reference: "OWASP Path Traversal — CWE-22",
      suggestedFix:
        "Sanitize file paths: const safePath = path.resolve(baseDir, userInput); if (!safePath.startsWith(baseDir)) throw new Error('Invalid path');",
      confidence: 0.85,
    });
  }

  // Missing encryption at rest
  const dbWritePatterns = /\.(?:save|create|insert|insertMany|insertOne|put|store)\s*\(/gi;
  const dbWriteLines = getLineNumbers(code, dbWritePatterns);
  const hasEncryption = testCode(code, /encrypt|cipher|aes|AES|crypto\.createCipher|DataProtect|ProtectedData/gi);
  if (dbWriteLines.length > 3 && !hasEncryption) {
    const hasSensitiveData = testCode(
      code,
      /(?:ssn|social_security|credit.?card|password|health|medical|financial|bank)/gi,
    );
    if (hasSensitiveData) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Sensitive data stored without encryption",
        description:
          "Code stores sensitive data (medical, financial, SSN) without visible encryption-at-rest. If the database is compromised, data is exposed in plaintext.",
        lineNumbers: dbWriteLines.slice(0, 5),
        recommendation:
          "Use field-level encryption for sensitive data, database-level TDE (Transparent Data Encryption), or application-level encryption before storage.",
        reference: "OWASP Cryptographic Storage — CWE-311",
        suggestedFix:
          "Encrypt sensitive fields before storage: const encrypted = crypto.createCipheriv('aes-256-gcm', key, iv).update(data); or enable database-level TDE.",
        confidence: 0.7,
      });
    }
  }

  // Secrets or tokens embedded in URL strings
  const secretInUrlPattern =
    /["'`]https?:\/\/[^"'`\s]*[?&](?:api[_-]?key|token|secret|password|auth|access[_-]?token|client[_-]?secret|api[_-]?secret)=[^&"'`\s]+/gi;
  const secretInUrlLines = getLineNumbers(code, secretInUrlPattern);
  if (secretInUrlLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Secret or token embedded in URL string",
      description:
        "API keys, tokens, or passwords are included as query parameters in URL strings. These appear in server logs, browser history, referer headers, and proxy logs.",
      lineNumbers: secretInUrlLines,
      recommendation:
        "Pass secrets via Authorization headers, request body, or environment variables — never as URL query parameters. Use SDK client libraries that handle auth properly.",
      reference: "CWE-598: Use of GET Request Method With Sensitive Query Strings",
      suggestedFix:
        "Move secrets from URL query params to the Authorization header: headers: { Authorization: `Bearer ${token}` }.",
      confidence: 0.9,
    });
  }

  // Credentials in connection strings
  const credInConnPattern =
    /["'`](?:mongodb|postgres|postgresql|mysql|redis|amqp|mssql|sqlserver):\/\/[^:]+:[^@"'`]+@/gi;
  const credInConnLines = getLineNumbers(code, credInConnPattern);
  if (credInConnLines.length > 0) {
    // Filter out obvious placeholders
    const realCredLines = credInConnLines.filter((lineNum) => {
      const line = code.split("\n")[lineNum - 1] || "";
      return !/(?:password|user|username|changeme|placeholder|example|your_)/i.test(line);
    });
    if (realCredLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Credentials embedded in database connection string",
        description:
          "Database connection strings contain inline credentials. These are committed to version control and visible to anyone with repository access.",
        lineNumbers: realCredLines,
        recommendation:
          "Use environment variables for connection strings. Use cloud-managed identity (Azure Managed Identity, AWS IAM) for passwordless authentication where possible.",
        reference: "CWE-798: Use of Hard-coded Credentials",
        suggestedFix:
          "Use environment variables for connection strings: const url = process.env.DATABASE_URL; or use managed identity for passwordless auth.",
        confidence: 0.9,
      });
    }
  }

  // Sensitive data leaked in error messages
  const sensitiveInErrorPattern =
    /(?:throw\s+new\s+\w*Error|raise\s+\w*Error|new\s+\w*Exception)\s*\([^)]*(?:password|token|secret|ssn|credit.?card|api.?key|connection.?string|private.?key)/gi;
  const sensitiveInErrorLines = getLineNumbers(code, sensitiveInErrorPattern);
  if (sensitiveInErrorLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Sensitive data referenced in error messages",
      description:
        "Error messages include references to passwords, tokens, API keys, or other sensitive data. These can leak to logs, error monitoring services, and client responses.",
      lineNumbers: sensitiveInErrorLines,
      recommendation:
        "Use generic error messages for security failures: 'Authentication failed' instead of 'Invalid password for user@email.com'. Log sensitive context server-side only at debug level.",
      reference: "CWE-209: Information Exposure Through Error Messages",
      suggestedFix:
        "Use generic error messages: throw new AppError('Authentication failed') instead of including sensitive field names or values.",
      confidence: 0.85,
    });
  }

  // Logging raw request/response bodies
  const logRawBodyPattern =
    /(?:console\.\w+|logger?\.\w+|log\.\w+|logging\.\w+)\s*\(.*(?:req\.body|request\.body|request\.data|request\.json|response\.data|res\.body)/gi;
  const logRawBodyLines = getLineNumbers(code, logRawBodyPattern);
  if (logRawBodyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "high",
      title: "Logging raw request/response bodies",
      description: `Found ${logRawBodyLines.length} location(s) logging entire HTTP request or response bodies. These may contain passwords, tokens, PII, credit card numbers, or health data that will be exposed in log aggregators.`,
      lineNumbers: logRawBodyLines,
      recommendation:
        "Log only specific, non-sensitive fields. Use structured logging with field-level redaction. Never log full request bodies — redact password, token, ssn, and creditCard fields.",
      reference: "CWE-532: Information Exposure Through Log Files",
      suggestedFix:
        "Log only metadata: logger.info({ method: req.method, url: req.url, status: res.statusCode }); instead of full request/response bodies.",
      confidence: 0.85,
    });
  }

  return findings;
}
