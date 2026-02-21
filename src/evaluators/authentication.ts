import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

function isLikelyPlaceholderCredentialValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  const exactPlaceholders = new Set([
    "test",
    "testing",
    "mock",
    "dummy",
    "example",
    "sample",
    "fake",
    "na",
    "n/a",
    "none",
    "null",
    "undefined",
    "changeme",
    "change_me",
    "replace_me",
    "replace-me",
    "your_token_here",
    "your_api_key",
    "unused",
    "not_used",
    "placeholder",
  ]);

  if (exactPlaceholders.has(normalized)) {
    return true;
  }

  if (/^(?:test|mock|dummy|sample|example|fake|placeholder|na|n\/a|unused|changeme|replace)[-_a-z0-9]*$/i.test(normalized)) {
    return true;
  }

  return false;
}

function isStrictCredentialDetectionEnabled(): boolean {
  return process.env.JUDGES_CREDENTIAL_MODE?.toLowerCase() === "strict";
}

function looksLikeRealCredentialValue(value: string): boolean {
  if (isLikelyPlaceholderCredentialValue(value)) {
    return false;
  }

  if (!isStrictCredentialDetectionEnabled()) {
    return true;
  }

  const normalized = value.trim();
  if (normalized.length < 12) {
    return false;
  }

  if (/(?:test|mock|dummy|sample|example|fake|placeholder|changeme|replace[_-]?me|unused|not[_-]?used|password|secret)/i.test(normalized)) {
    return false;
  }

  const hasLower = /[a-z]/.test(normalized);
  const hasUpper = /[A-Z]/.test(normalized);
  const hasDigit = /\d/.test(normalized);
  const hasSymbol = /[^A-Za-z0-9]/.test(normalized);
  const classCount = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (normalized.length >= 20 && classCount >= 2) {
    return true;
  }

  if (normalized.length >= 16 && classCount >= 3) {
    return true;
  }

  return false;
}

function getHardcodedCredentialLinesWithoutPlaceholders(code: string): number[] {
  const lines = code.split("\n");
  const flaggedLines: number[] = [];
  const assignmentPattern = /\b(password|passwd|pwd|secret|api_?key|apikey|token|auth_?token)\b\s*[:=]\s*["'`]([^"'`]{3,})["'`]/gi;

  const nonProductionContextPattern = /\b(?:test|tests|mock|mocks|fixture|fixtures|harness|e2e|example|sample|dummy)\b/i;
  const productionContextPattern = /\b(?:prod|production|release|deploy|deployment)\b/i;
  const isLikelyTestModule = /\b(?:describe|it|test)\s*\(/i.test(code);

  if (isLikelyTestModule && !productionContextPattern.test(code)) {
    return [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const matches = [...line.matchAll(assignmentPattern)];
    if (matches.length === 0) continue;

    const contextStart = Math.max(0, index - 2);
    const contextEnd = Math.min(lines.length, index + 3);
    const context = lines.slice(contextStart, contextEnd).join("\n");

    const isLikelyNonProductionContext =
      nonProductionContextPattern.test(context) &&
      !productionContextPattern.test(context);

    const hasRealCredential = matches.some((match) => {
      const value = match[2] ?? "";
      return looksLikeRealCredentialValue(value);
    });

    if (hasRealCredential && !isLikelyNonProductionContext) {
      flaggedLines.push(index + 1);
    }
  }

  return flaggedLines;
}

function getWeakCredentialHashLines(code: string): number[] {
  const lines = code.split("\n");
  const weakHashPattern = /createHash\s*\(\s*["'`](?:md5|sha1|sha256)["'`]\)|(?:\bmd5\b|\bsha1\b)\s*\(/gi;
  const authContextPattern = /password|passwd|pwd|credential|login|signin|signup|auth|token|session|user/i;

  const flagged: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    weakHashPattern.lastIndex = 0;
    if (!weakHashPattern.test(lines[index])) {
      continue;
    }

    const start = Math.max(0, index - 4);
    const end = Math.min(lines.length - 1, index + 4);
    const context = lines.slice(start, end + 1).join("\n");

    if (authContextPattern.test(context)) {
      flagged.push(index + 1);
    }
  }

  return flagged;
}

export function analyzeAuthentication(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "AUTH";
  const lang = getLangFamily(language);

  // Hardcoded credentials
  const credentialLines = getHardcodedCredentialLinesWithoutPlaceholders(code);
  if (credentialLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded credentials in source code",
      description: `Found ${credentialLines.length} instance(s) of what appears to be hardcoded credentials. Credentials in source code are exposed in version control and cannot be rotated without redeployment.`,
      lineNumbers: credentialLines,
      recommendation: "Use environment variables or a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault). Never commit credentials to version control.",
      reference: "OWASP: Credential Management / CWE-798",
    });
  }

  // No auth middleware on routes
  const hasRoutes = /app\.(get|post|put|delete|patch)\s*\(\s*["'`]/gi.test(code);
  const hasAuthMiddleware = /(?:authenticate|authorize|requireAuth|ensureAuth|isAuthenticated|verifyToken|passport\.authenticate|jwt\.verify|auth\(\)|protect|guard|requireLogin)/gi.test(code);
  if (hasRoutes && !hasAuthMiddleware && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "API routes without authentication middleware",
      description: "API endpoints are defined without any visible authentication middleware. Any client can access these endpoints without proving their identity.",
      recommendation: "Apply authentication middleware to routes that require it. Use app.use(authMiddleware) for global protection or per-route middleware for selective protection.",
      reference: "OWASP API Security Top 10: API2 — Broken Authentication",
    });
  }

  // Token in query parameters
  const tokenQueryPattern = /req\.query\.(?:token|api_?key|auth|secret|password|access_token)/gi;
  const tokenQueryLines = getLineNumbers(code, tokenQueryPattern);
  if (tokenQueryLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Sensitive tokens passed in query parameters",
      description: "Authentication tokens or API keys are read from query parameters. Query params appear in server logs, browser history, referrer headers, and proxy logs.",
      lineNumbers: tokenQueryLines,
      recommendation: "Pass tokens in the Authorization header (Bearer scheme) or in httpOnly cookies. Never use query parameters for sensitive credentials.",
      reference: "OWASP: Transport Layer Security / RFC 6750",
    });
  }

  // Weak password hashing
  const weakHashLines = getWeakCredentialHashLines(code);
  if (weakHashLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Weak hashing algorithm for credentials",
      description: "MD5, SHA1, or SHA256 are fast hash algorithms unsuitable for password storage. They can be brute-forced at billions of hashes per second.",
      lineNumbers: weakHashLines,
      recommendation: "Use bcrypt, scrypt, or Argon2 for password hashing. These algorithms are intentionally slow and include salt by default.",
      reference: "OWASP Password Storage Cheat Sheet / NIST 800-63b",
    });
  }

  // No RBAC / authorization checks
  const hasRoleCheck = /role|permission|isAdmin|isOwner|canAccess|authorize|requiredRole|hasPermission|checkPermission/gi.test(code);
  if (hasRoutes && !hasRoleCheck && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No authorization / role-based access control detected",
      description: "No role or permission checks found. Without authorization, any authenticated user could access any resource, including admin functions.",
      recommendation: "Implement role-based access control (RBAC) or attribute-based access control (ABAC). Check permissions at each endpoint or resource access.",
      reference: "OWASP API Security Top 10: API5 — Broken Function Level Authorization",
    });
  }

  // JWT without verification
  const hasJwt = /jwt|jsonwebtoken|jose/gi.test(code);
  const hasJwtVerify = /jwt\.verify|jwtVerify|verifyToken|jose\.jwtVerify/gi.test(code);
  const hasJwtSign = /jwt\.sign|jwtSign|signToken/gi.test(code);
  if (hasJwt && hasJwtSign && !hasJwtVerify) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "JWT tokens signed but never verified",
      description: "JWT tokens are being created but no verification logic is visible. Tokens could be tampered with or forged without the server detecting it.",
      recommendation: "Always verify JWT tokens on every request: check signature, expiration (exp), issuer (iss), and audience (aud).",
      reference: "RFC 7519: JWT / OWASP JWT Cheat Sheet",
    });
  }

  // Disabled TLS / certificate validation
  const tlsDisabledPattern = /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["'`]?0|rejectUnauthorized\s*:\s*false|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true/gi;
  const tlsLines = getLineNumbers(code, tlsDisabledPattern);
  if (tlsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "TLS certificate validation disabled",
      description: "TLS certificate verification is disabled, allowing man-in-the-middle attacks. Authentication credentials sent over this connection can be intercepted.",
      lineNumbers: tlsLines,
      recommendation: "Never disable TLS verification in production. Fix certificate issues properly. Use CA bundles for self-signed certs in development only.",
      reference: "CWE-295: Improper Certificate Validation",
    });
  }

  // No session expiration / no token expiry
  const hasSession = /session|express-session|cookie-session|SessionMiddleware/gi.test(code);
  const hasExpiry = /maxAge|expires|expiresIn|exp:|ttl|timeout.*session|cookie.*max/gi.test(code);
  if (hasSession && !hasExpiry) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Sessions without expiration configured",
      description: "Session middleware is used without visible expiration settings. Sessions that never expire allow stolen session tokens to be used indefinitely.",
      recommendation: "Set session maxAge (e.g., 30 minutes for sensitive apps). Implement idle timeout. Invalidate sessions on password change or logout.",
      reference: "OWASP Session Management Cheat Sheet",
    });
  }

  // Weak password policy — no complexity enforcement
  const hasUserRegistration = /register|signup|sign.?up|createUser|create.*user|new.*user/gi.test(code);
  const hasPasswordPolicy = /minLength|minimum.*length|password.*length|complexity|strongPassword|zxcvbn|password.*policy|password.*require/gi.test(code);
  if (hasUserRegistration && !hasPasswordPolicy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No password complexity enforcement",
      description: "User registration logic without visible password policy. Users can set weak passwords like '123456' or 'password', which are trivially guessable.",
      recommendation: "Enforce minimum password length (12+ chars), check against known breached passwords (HaveIBeenPwned API), and use a strength estimator like zxcvbn.",
      reference: "NIST 800-63b / OWASP Password Guidelines",
    });
  }

  // No account lockout after failed attempts
  const hasLogin = /login|signin|sign.?in|authenticate|verifyPassword|checkPassword/gi.test(code);
  const hasLockout = /lockout|lock.*out|attempt|maxAttempt|failedAttempt|rateLimitLogin|brute.?force|account.*lock/gi.test(code);
  if (hasLogin && !hasLockout) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No account lockout after failed login attempts",
      description: "Login logic without account lockout or rate limiting. Attackers can brute-force passwords by trying unlimited login attempts.",
      recommendation: "Implement progressive delays or temporary lockout after 5-10 failed attempts. Use rate limiting on login endpoints. Consider CAPTCHA for repeated failures.",
      reference: "OWASP Brute Force Prevention / CWE-307",
    });
  }

  // Cookie without Secure and HttpOnly flags
  const cookiePattern = /(?:cookie|Cookie|set-cookie|setCookie|res\.cookie)\s*\(/gi;
  const cookieLines = getLineNumbers(code, cookiePattern);
  const hasSecureFlags = /secure\s*:\s*true|httpOnly\s*:\s*true|HttpOnly|Secure/g.test(code);
  if (cookieLines.length > 0 && !hasSecureFlags) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Cookies set without Secure/HttpOnly flags",
      description: "Cookies are set without Secure (HTTPS-only) or HttpOnly (no JS access) flags. This exposes cookies to interception and XSS-based theft.",
      lineNumbers: cookieLines,
      recommendation: "Set cookies with { secure: true, httpOnly: true, sameSite: 'strict' }. Use Secure for all auth cookies. HttpOnly prevents JavaScript access.",
      reference: "OWASP Secure Cookie Best Practices / CWE-614",
    });
  }

  // No CSRF protection
  const hasFormPost = /app\.post\s*\(|method\s*=\s*["']POST/gi.test(code);
  const hasCsrf = /csrf|csurf|xsrf|_token|csrfToken|antiForgery|X-CSRF|X-XSRF/gi.test(code);
  if (hasFormPost && !hasCsrf && hasSession) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No CSRF protection on form submissions",
      description: "POST endpoints with session-based auth but no CSRF tokens. Attackers can craft pages that submit forms on behalf of authenticated users.",
      recommendation: "Use CSRF tokens (csurf middleware, Django CSRF, Rails authenticity_token). Set SameSite=Strict on cookies. Use custom headers for API calls.",
      reference: "OWASP CSRF Prevention Cheat Sheet / CWE-352",
    });
  }

  return findings;
}
