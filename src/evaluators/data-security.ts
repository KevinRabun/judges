import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeDataSecurity(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "DATA";

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
    { pattern: /(?:AZURE|MICROSOFT)_[A-Z_]*(?:KEY|SECRET|TOKEN|CONNECTION)\s*[:=]\s*["'][^"']+["']/gi, name: "Azure credential" },
    { pattern: /(?:DATABASE_URL|MONGO_URI|REDIS_URL)\s*[:=]\s*["'][^"']+["']/gi, name: "database connection URL" },
  ];

  for (const sp of secretPatterns) {
    const lines = getLineNumbers(code, sp.pattern);
    if (lines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: `Hardcoded ${sp.name} detected`,
        description: `A ${sp.name} appears to be hardcoded in the source code. This is a severe data security risk as it can be extracted from version control, build artifacts, or decompiled binaries.`,
        lineNumbers: lines,
        recommendation: `Move the ${sp.name} to a secrets manager (e.g., Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) or at minimum to environment variables. Never commit secrets to source control.`,
        reference: "OWASP: Hardcoded Credentials — CWE-798",
      });
    }
  }

  // Console/print logging of sensitive data (multi-language)
  const logSensitivePatterns = /(?:console\.\w+|print|println|printf|log\.\w+|logger\.\w+|logging\.\w+|System\.out|System\.err|fmt\.Print|puts|echo)\s*\(.*(?:password|secret|token|key|credential|ssn|credit.?card|cvv|pin_code)/gi;
  const logLines = getLineNumbers(code, logSensitivePatterns);
  if (logLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Sensitive data may be logged",
      description: "Log output appears to include sensitive data fields such as passwords, tokens, or PII. This can lead to credential exposure in log aggregation systems.",
      lineNumbers: logLines,
      recommendation: "Remove sensitive data from log statements. Use structured logging with redaction filters to automatically mask sensitive fields.",
      reference: "OWASP Logging Cheat Sheet — CWE-532",
    });
  }

  // Weak hashing (multi-language)
  const weakHashPatterns = /(?:md5|sha1|MD5|SHA1)\s*\(|MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-?1)["']\)|hashlib\.(?:md5|sha1)|Digest::(?:MD5|SHA1)|crypto\.createHash\s*\(\s*["'](?:md5|sha1)["']\)|MD5\.Create|SHA1\.Create/gi;
  const weakHashLines = getLineNumbers(code, weakHashPatterns);
  if (weakHashLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Weak hashing algorithm used",
      description: "MD5 or SHA1 is used, which are cryptographically broken for security purposes. They should not be used for password hashing, data integrity verification, or any security-sensitive context.",
      lineNumbers: weakHashLines,
      recommendation: "Use SHA-256/SHA-512 for integrity checks, or bcrypt/scrypt/argon2 for password hashing.",
      reference: "NIST SP 800-131A — CWE-328",
    });
  }

  // SQL injection risk (multi-language)
  const sqlInjectionPatterns = /(?:query|execute|exec|cursor\.execute|raw|rawQuery|createQuery)\s*\(\s*[`"'].*\$\{|(?:query|execute|exec|cursor\.execute)\s*\(\s*.*\+\s*(?:req\.|request\.|params\.|query\.|body\.|args\.|kwargs)|(?:query|execute|exec)\s*\(\s*f["']|\.format\s*\(.*(?:req\.|request\.|input)|String\.format\s*\(\s*["'](?:SELECT|INSERT|UPDATE|DELETE)/gi;
  const sqlLines = getLineNumbers(code, sqlInjectionPatterns);
  if (sqlLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential SQL injection via string concatenation",
      description: "SQL queries appear to be constructed using string interpolation or concatenation with user input, which can lead to SQL injection attacks and data breaches.",
      lineNumbers: sqlLines,
      recommendation: "Use parameterized queries or prepared statements. Never concatenate user input into SQL strings directly.",
      reference: "OWASP SQL Injection — CWE-89",
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
      description: "Non-localhost HTTP URLs are used instead of HTTPS, meaning data is transmitted in plaintext and vulnerable to interception.",
      lineNumbers: httpLines,
      recommendation: "Use HTTPS for all non-local connections to ensure data in transit is encrypted with TLS.",
      reference: "OWASP Transport Layer Protection — CWE-319",
    });
  }

  // Unsafe deserialization (multi-language)
  const deserializationPatterns = /pickle\.loads?|yaml\.load\s*\([^)]*(?!\s*Loader)|Marshal\.load|JSON\.parse\s*\(\s*(?:req|request|body|input)|ObjectInputStream|readObject\s*\(|BinaryFormatter\.Deserialize|unserialize\s*\(/gi;
  const deserLines = getLineNumbers(code, deserializationPatterns);
  if (deserLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Unsafe deserialization detected",
      description: "Deserializing untrusted data (pickle, YAML, Java ObjectInputStream, PHP unserialize, .NET BinaryFormatter) can lead to remote code execution.",
      lineNumbers: deserLines,
      recommendation: "Never deserialize untrusted data. Use safe alternatives: yaml.safe_load(), JSON instead of pickle, whitelist-based deserialization. Validate and sanitize all input before deserialization.",
      reference: "OWASP Deserialization — CWE-502",
    });
  }

  // Cookie without security flags
  const cookieNoFlagLines = getLineNumbers(code, /(?:res\.cookie|setCookie|set_cookie|SetCookie)\s*\(/gi);
  if (cookieNoFlagLines.length > 0) {
    const hasSecure = /secure\s*:\s*true|Secure/gi.test(code);
    const hasHttpOnly = /httpOnly\s*:\s*true|HttpOnly/gi.test(code);
    if (!hasSecure || !hasHttpOnly) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Cookie may lack security flags",
        description: "Cookies are set without explicit Secure, HttpOnly, or SameSite flags, making them vulnerable to interception and XSS-based theft.",
        lineNumbers: cookieNoFlagLines,
        recommendation: "Set Secure, HttpOnly, and SameSite=Strict (or Lax) flags on all cookies. Use __Host- prefix for sensitive cookies.",
        reference: "OWASP Session Management — CWE-614",
      });
    }
  }

  // JWT without verification
  const jwtNoVerifyPatterns = /jwt\.decode\s*\(|jose\.decode\s*\(|JWT\.decode\s*\(/gi;
  const jwtNoVerifyLines = getLineNumbers(code, jwtNoVerifyPatterns);
  if (jwtNoVerifyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "JWT decoded without signature verification",
      description: "JWT tokens are decoded without verifying the signature, allowing attackers to forge tokens with arbitrary claims.",
      lineNumbers: jwtNoVerifyLines,
      recommendation: "Always use jwt.verify() instead of jwt.decode(). Validate the signature, issuer, audience, and expiration claims.",
      reference: "OWASP JWT Security — CWE-345",
    });
  }

  // File upload without validation
  const fileUploadPatterns = /multer|upload|formidable|busboy|multipart|FileUpload|MultipartFile/gi;
  const fileUploadLines = getLineNumbers(code, fileUploadPatterns);
  if (fileUploadLines.length > 0) {
    const hasValidation = /mime|mimetype|content-type|extension|allowedTypes|fileFilter|accept|maxSize|fileSizeLimit/gi.test(code);
    if (!hasValidation) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "File upload without type/size validation",
        description: "File uploads are accepted without visible MIME type, extension, or size validation, allowing malicious file uploads.",
        lineNumbers: fileUploadLines,
        recommendation: "Validate file type (MIME + extension + magic bytes), enforce size limits, scan for malware, and store uploads outside the webroot.",
        reference: "OWASP Unrestricted File Upload — CWE-434",
      });
    }
  }

  // Cleartext password storage
  const cleartextPwPatterns = /password\s*[:=]\s*(?:req\.|request\.|body\.|input\.|params\.).*(?:save|insert|create|update|store|set)/gi;
  const cleartextLines = getLineNumbers(code, cleartextPwPatterns);
  if (cleartextLines.length > 0) {
    const hasHashing = /bcrypt|argon2|scrypt|pbkdf2|hashPassword|hash_password|PasswordHasher/gi.test(code);
    if (!hasHashing) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Password may be stored in cleartext",
        description: "User passwords appear to be stored without hashing. If the database is compromised, all passwords are exposed.",
        lineNumbers: cleartextLines,
        recommendation: "Hash passwords using bcrypt, argon2, or scrypt with a unique salt per password. Never store passwords in plaintext or with reversible encryption.",
        reference: "OWASP Password Storage — CWE-256",
      });
    }
  }

  // CORS with credentials and wildcard
  const corsCredLines = getLineNumbers(code, /credentials\s*:\s*true|Access-Control-Allow-Credentials/gi);
  const corsWildcard = /Access-Control-Allow-Origin.*\*|origin\s*:\s*['"]?\*/gi.test(code);
  if (corsCredLines.length > 0 && corsWildcard) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "CORS with credentials and wildcard origin",
      description: "Using Access-Control-Allow-Credentials with a wildcard origin allows any website to make authenticated requests to your API.",
      lineNumbers: corsCredLines,
      recommendation: "Never combine credentials: true with origin: '*'. Whitelist specific trusted origins.",
      reference: "OWASP CORS — CWE-942",
    });
  }

  // Missing CSRF protection
  const formPostLines = getLineNumbers(code, /app\.post\s*\(|router\.post\s*\(|@PostMapping|@RequestMapping.*POST|\.post\s*\(/gi);
  const hasCsrf = /csrf|xsrf|_token|csrfToken|antiforgery|AntiForgery|@csrf/gi.test(code);
  if (formPostLines.length > 2 && !hasCsrf) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No CSRF protection detected",
      description: "POST endpoints exist but no CSRF tokens or protection middleware is visible, making the application vulnerable to cross-site request forgery.",
      lineNumbers: formPostLines.slice(0, 5),
      recommendation: "Implement CSRF protection using tokens (csurf, django.middleware.csrf, @csrf_exempt annotations) or SameSite cookies.",
      reference: "OWASP CSRF — CWE-352",
    });
  }

  // Exposing stack traces to clients
  const stackTracePatterns = /(?:res\.(?:json|send)|response\.(?:json|send))\s*\(.*(?:stack|stackTrace|err\.message|error\.message)|traceback\.format_exc/gi;
  const stackLines = getLineNumbers(code, stackTracePatterns);
  if (stackLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Stack traces exposed to clients",
      description: "Error stack traces sent in API responses reveal internal implementation details, file paths, and library versions to attackers.",
      lineNumbers: stackLines,
      recommendation: "Return generic error messages to clients. Log detailed errors server-side only. Use different error handlers for development vs production.",
      reference: "OWASP Error Handling — CWE-209",
    });
  }

  // Hardcoded encryption keys / IVs
  const encKeyPatterns = /(?:encryption[_-]?key|aes[_-]?key|iv|initialization[_-]?vector|nonce)\s*[:=]\s*["'][^"']+["']|(?:Buffer\.from|new\s+Uint8Array)\s*\(.*(?:key|iv)/gi;
  const encKeyLines = getLineNumbers(code, encKeyPatterns);
  if (encKeyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded encryption key or IV",
      description: "Encryption keys and initialization vectors are hardcoded, making encrypted data trivially decryptable by anyone with access to the code.",
      lineNumbers: encKeyLines,
      recommendation: "Generate encryption keys securely at runtime or load from a key management service. IVs/nonces must be random and unique per encryption operation.",
      reference: "CWE-321: Use of Hard-coded Cryptographic Key",
    });
  }

  // Insecure random number generation for security
  const insecureRandPatterns = /Math\.random\s*\(\)|random\.random\s*\(|rand\s*\(|Random\(\)|new\s+Random\b/gi;
  const insecureRandLines = getLineNumbers(code, insecureRandPatterns);
  if (insecureRandLines.length > 0) {
    const nearSecurity = code.split("\n").some((line, i) => {
      if (insecureRandPatterns.test(line)) {
        const context = code.split("\n").slice(Math.max(0, i - 3), i + 3).join("\n");
        return /token|secret|password|key|nonce|salt|session|csrf|otp|verification/i.test(context);
      }
      return false;
    });
    if (nearSecurity) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Insecure random for security context",
        description: "Math.random() or similar non-cryptographic PRNGs are used in a security-sensitive context (token generation, etc.). These are predictable.",
        lineNumbers: insecureRandLines,
        recommendation: "Use crypto.randomBytes() (Node.js), secrets.token_hex() (Python), SecureRandom (Java/Ruby), or crypto.getRandomValues() (browser).",
        reference: "CWE-330: Use of Insufficiently Random Values",
      });
    }
  }

  // Path traversal risk
  const pathTraversalPatterns = /(?:readFile|writeFile|readdir|open|fopen|file_get_contents|include|require)\s*\(.*(?:req\.|request\.|params\.|query\.|body\.|input\.|args)/gi;
  const pathTravLines = getLineNumbers(code, pathTraversalPatterns);
  if (pathTravLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential path traversal via user input",
      description: "File operations use user-controlled input without apparent sanitization, allowing attackers to read/write arbitrary files using ../ sequences.",
      lineNumbers: pathTravLines,
      recommendation: "Validate and sanitize file paths. Use path.resolve() + startsWith() checks, or a whitelist of allowed paths. Never pass user input directly to file operations.",
      reference: "OWASP Path Traversal — CWE-22",
    });
  }

  // Missing encryption at rest
  const dbWritePatterns = /\.(?:save|create|insert|insertMany|insertOne|put|store)\s*\(/gi;
  const dbWriteLines = getLineNumbers(code, dbWritePatterns);
  const hasEncryption = /encrypt|cipher|aes|AES|crypto\.createCipher|DataProtect|ProtectedData/gi.test(code);
  if (dbWriteLines.length > 3 && !hasEncryption) {
    const hasSensitiveData = /(?:ssn|social_security|credit.?card|password|health|medical|financial|bank)/gi.test(code);
    if (hasSensitiveData) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Sensitive data stored without encryption",
        description: "Code stores sensitive data (medical, financial, SSN) without visible encryption-at-rest. If the database is compromised, data is exposed in plaintext.",
        lineNumbers: dbWriteLines.slice(0, 5),
        recommendation: "Use field-level encryption for sensitive data, database-level TDE (Transparent Data Encryption), or application-level encryption before storage.",
        reference: "OWASP Cryptographic Storage — CWE-311",
      });
    }
  }

  return findings;
}
