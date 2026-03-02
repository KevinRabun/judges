import type { Finding } from "../types.js";
import {
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
  looksLikeRealCredentialValue,
  isCommentLine,
} from "./shared.js";
import * as LP from "../language-patterns.js";

function getHardcodedCredentialLinesWithoutPlaceholders(code: string): number[] {
  const lines = code.split("\n");
  const flaggedLines: number[] = [];
  const assignmentPattern =
    /\b(password|passwd|pwd|secret|api_?key|apikey|token|auth_?token)\b\s*[:=]\s*["'`]([^"'`]{3,})["'`]/gi;

  const nonProductionContextPattern =
    /\b(?:test|tests|mock|mocks|fixture|fixtures|harness|e2e|example|sample|dummy)\b/i;
  const productionContextPattern = /\b(?:prod|production|release|deploy|deployment)\b/i;
  const isLikelyTestModule = /\b(?:describe|it|test)\s*\(/i.test(code);

  if (isLikelyTestModule && !productionContextPattern.test(code)) {
    return [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (isCommentLine(line)) continue;
    const matches = [...line.matchAll(assignmentPattern)];
    if (matches.length === 0) continue;

    const contextStart = Math.max(0, index - 2);
    const contextEnd = Math.min(lines.length, index + 3);
    const context = lines.slice(contextStart, contextEnd).join("\n");

    const isLikelyNonProductionContext =
      nonProductionContextPattern.test(context) && !productionContextPattern.test(context);

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
  const _lang = getLangFamily(language);

  // Hardcoded credentials
  const credentialLines = getHardcodedCredentialLinesWithoutPlaceholders(code);
  if (credentialLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded credentials in source code",
      description: `Found ${credentialLines.length} instance(s) of what appears to be hardcoded credentials. Credentials in source code are exposed in version control and cannot be rotated without redeployment.`,
      lineNumbers: credentialLines,
      recommendation:
        "Use environment variables or a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault). Never commit credentials to version control.",
      reference: "OWASP: Credential Management / CWE-798",
      suggestedFix:
        "Replace hardcoded credentials with environment variables: process.env.SECRET_NAME (Node.js), os.environ['SECRET_NAME'] (Python), or inject from a secrets manager.",
      confidence: 0.9,
    });
  }

  // No auth middleware on routes (multi-language)
  const routeLines = getLangLineNumbers(code, language, LP.HTTP_ROUTE);
  const hasRoutes = routeLines.length > 0;
  const hasAuthMiddleware =
    /(?:authenticate|authorize|requireAuth|ensureAuth|isAuthenticated|verifyToken|passport\.authenticate|jwt\.verify|auth\(\)|protect|guard|requireLogin|@login_required|@requires_auth|@Authorize|@PreAuthorize|@Secured)/gi.test(
      code,
    );
  if (hasRoutes && !hasAuthMiddleware && code.split("\n").length > 20) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "API routes without authentication middleware",
      description:
        "API endpoints are defined without any visible authentication middleware. Any client can access these endpoints without proving their identity.",
      recommendation:
        "Apply authentication middleware to routes that require it. Use framework-specific auth guards: Express middleware, Python decorators (@login_required), Java annotations (@PreAuthorize), or Go middleware.",
      reference: "OWASP API Security Top 10: API2 — Broken Authentication",
      suggestedFix:
        "Add auth middleware: app.use(authenticateJWT) (Express), @login_required (Django/Flask), @PreAuthorize (Spring), or middleware.Auth(handler) (Go).",
      confidence: 0.7,
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
      description:
        "Authentication tokens or API keys are read from query parameters. Query params appear in server logs, browser history, referrer headers, and proxy logs.",
      lineNumbers: tokenQueryLines,
      recommendation:
        "Pass tokens in the Authorization header (Bearer scheme) or in httpOnly cookies. Never use query parameters for sensitive credentials.",
      reference: "OWASP: Transport Layer Security / RFC 6750",
      suggestedFix:
        "Read tokens from the Authorization header instead: const token = req.headers.authorization?.replace('Bearer ', '');",
      confidence: 0.9,
    });
  }

  // Weak password hashing (multi-language)
  const weakHashByLang = getLangLineNumbers(code, language, LP.WEAK_HASH);
  const weakHashLines = weakHashByLang.length > 0 ? weakHashByLang : getWeakCredentialHashLines(code);
  if (weakHashLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Weak hashing algorithm for credentials",
      description:
        "MD5, SHA1, or SHA256 are fast hash algorithms unsuitable for password storage. They can be brute-forced at billions of hashes per second.",
      lineNumbers: weakHashLines,
      recommendation:
        "Use bcrypt, scrypt, or Argon2 for password hashing. These algorithms are intentionally slow and include salt by default.",
      reference: "OWASP Password Storage Cheat Sheet / NIST 800-63b",
      suggestedFix:
        "Replace with bcrypt/argon2: bcrypt.hash(password, 12) (JS), bcrypt.hashpw(password, bcrypt.gensalt()) (Python), Argon2::default().hash_password() (Rust), BCrypt.HashPassword() (C#).",
      confidence: 0.9,
    });
  }

  // No RBAC / authorization checks
  const hasRoleCheck =
    /role|permission|isAdmin|isOwner|canAccess|authorize|requiredRole|hasPermission|checkPermission/gi.test(code);
  if (hasRoutes && !hasRoleCheck && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No authorization / role-based access control detected",
      description:
        "No role or permission checks found. Without authorization, any authenticated user could access any resource, including admin functions.",
      recommendation:
        "Implement role-based access control (RBAC) or attribute-based access control (ABAC). Check permissions at each endpoint or resource access.",
      reference: "OWASP API Security Top 10: API5 — Broken Function Level Authorization",
      suggestedFix:
        "Add role-based middleware: const requireRole = (role) => (req, res, next) => { if (req.user.role !== role) return res.status(403).json({ error: 'Forbidden' }); next(); };",
      confidence: 0.7,
    });
  }

  // JWT without verification
  // This is absence-based in single-file mode: verification middleware often
  // lives in a separate file from the login/sign endpoint.
  const hasJwt = /jwt|jsonwebtoken|jose/gi.test(code);
  const hasJwtVerify = /jwt\.verify|jwtVerify|verifyToken|jose\.jwtVerify/gi.test(code);
  const hasJwtSign = /jwt\.sign|jwtSign|signToken/gi.test(code);
  if (hasJwt && hasJwtSign && !hasJwtVerify) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No JWT verification detected alongside signing",
      description:
        "JWT tokens are being created but no verification logic is visible in this file. Verification middleware may exist in another module; in project mode this finding is automatically resolved.",
      recommendation:
        "Ensure JWT tokens are verified on every request: check signature, expiration (exp), issuer (iss), and audience (aud).",
      reference: "RFC 7519: JWT / OWASP JWT Cheat Sheet",
      suggestedFix:
        "Add JWT verification: const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'myapp', audience: 'myapp' });",
      confidence: 0.55,
      isAbsenceBased: true,
      provenance: "absence-of-pattern",
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
        "TLS certificate verification is disabled, allowing man-in-the-middle attacks. Authentication credentials sent over this connection can be intercepted.",
      lineNumbers: tlsLines,
      recommendation:
        "Never disable TLS verification in production. Fix certificate issues properly. Use CA bundles for self-signed certs in development only.",
      reference: "CWE-295: Improper Certificate Validation",
      suggestedFix:
        "Remove TLS bypass: delete rejectUnauthorized:false (JS), verify=False (Python), InsecureSkipVerify:true (Go), danger_accept_invalid_certs(true) (Rust), TrustAllCerts (Java).",
      confidence: 0.9,
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
      description:
        "Session middleware is used without visible expiration settings. Sessions that never expire allow stolen session tokens to be used indefinitely.",
      recommendation:
        "Set session maxAge (e.g., 30 minutes for sensitive apps). Implement idle timeout. Invalidate sessions on password change or logout.",
      reference: "OWASP Session Management Cheat Sheet",
      suggestedFix:
        "Set session expiry: app.use(session({ cookie: { maxAge: 30 * 60 * 1000 }, rolling: true })); and invalidate sessions on password change.",
      confidence: 0.7,
    });
  }

  // Weak password policy — no complexity enforcement
  const hasUserRegistration = /register|signup|sign.?up|createUser|create.*user|new.*user/gi.test(code);
  const hasPasswordPolicy =
    /minLength|minimum.*length|password.*length|complexity|strongPassword|zxcvbn|password.*policy|password.*require/gi.test(
      code,
    );
  if (hasUserRegistration && !hasPasswordPolicy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No password complexity enforcement",
      description:
        "User registration logic without visible password policy. Users can set weak passwords like '123456' or 'password', which are trivially guessable.",
      recommendation:
        "Enforce minimum password length (12+ chars), check against known breached passwords (HaveIBeenPwned API), and use a strength estimator like zxcvbn.",
      reference: "NIST 800-63b / OWASP Password Guidelines",
      suggestedFix:
        "Enforce password policy: if (password.length < 12) throw new Error('Min 12 chars'); and check against breached passwords via the HaveIBeenPwned API.",
      confidence: 0.7,
    });
  }

  // No account lockout after failed attempts
  const hasLogin = /login|signin|sign.?in|authenticate|verifyPassword|checkPassword/gi.test(code);
  const hasLockout =
    /lockout|lock.*out|attempt|maxAttempt|failedAttempt|rateLimitLogin|brute.?force|account.*lock/gi.test(code);
  if (hasLogin && !hasLockout) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No account lockout after failed login attempts",
      description:
        "Login logic without account lockout or rate limiting. Attackers can brute-force passwords by trying unlimited login attempts.",
      recommendation:
        "Implement progressive delays or temporary lockout after 5-10 failed attempts. Use rate limiting on login endpoints. Consider CAPTCHA for repeated failures.",
      reference: "OWASP Brute Force Prevention / CWE-307",
      suggestedFix:
        "Add rate limiting and lockout: after 5 failed attempts, lock the account for 15 minutes. Use express-rate-limit on the login endpoint.",
      confidence: 0.7,
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
      description:
        "Cookies are set without Secure (HTTPS-only) or HttpOnly (no JS access) flags. This exposes cookies to interception and XSS-based theft.",
      lineNumbers: cookieLines,
      recommendation:
        "Set cookies with { secure: true, httpOnly: true, sameSite: 'strict' }. Use Secure for all auth cookies. HttpOnly prevents JavaScript access.",
      reference: "OWASP Secure Cookie Best Practices / CWE-614",
      suggestedFix:
        "Add security flags: res.cookie('session', token, { httpOnly: true, secure: true, sameSite: 'strict' });",
      confidence: 0.8,
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
      description:
        "POST endpoints with session-based auth but no CSRF tokens. Attackers can craft pages that submit forms on behalf of authenticated users.",
      recommendation:
        "Use CSRF tokens (csurf middleware, Django CSRF, Rails authenticity_token). Set SameSite=Strict on cookies. Use custom headers for API calls.",
      reference: "OWASP CSRF Prevention Cheat Sheet / CWE-352",
      suggestedFix:
        "Add CSRF middleware: app.use(csrf({ cookie: { sameSite: 'strict' } })); and include the token in forms: <input type='hidden' name='_csrf' value='{{csrfToken}}'>.",
      confidence: 0.8,
    });
  }

  // Session fixation — no session regeneration after login
  const hasLoginHandler =
    /(?:login|signin|sign.?in|authenticate)\s*(?:=|=>|\(|async)|(?:\.post|\.get|\.put)\s*\(\s*["'][^"']*(?:login|signin|sign.?in|auth)["']/gi.test(
      code,
    );
  const hasSessionUsage = /req\.session|session\[|session\./gi.test(code);
  const hasSessionRegen =
    /session\.regenerate|regenerateSession|session\.cycle|rotate.*session|new.*session|session\.create/gi.test(code);
  if (hasLoginHandler && hasSessionUsage && !hasSessionRegen && code.split("\n").length > 10) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "No session regeneration after authentication",
      description:
        "Login handler uses sessions but does not regenerate the session ID after successful authentication. This enables session fixation attacks where an attacker pre-sets the session ID.",
      recommendation:
        "Call req.session.regenerate() (Express), session.cycle() (Phoenix), or equivalent immediately after successful login. This invalidates the pre-authentication session ID.",
      reference: "OWASP Session Fixation — CWE-384",
      suggestedFix:
        "Regenerate session after login: req.session.regenerate((err) => { req.session.userId = user.id; res.redirect('/dashboard'); });",
      confidence: 0.8,
    });
  }

  // No MFA/2FA consideration in authentication flows
  const hasAuthFlow =
    /(?:login|signin|sign.?in|authenticate|password.*reset|change.*password)\s*(?:\(|=>|=|async)|(?:\.post|\.get|\.put)\s*\(\s*["'][^"']*(?:login|signin|sign.?in|auth|password)["']/gi.test(
      code,
    );
  const hasProtectedOps = /(?:transfer|payment|withdraw|approve|delete.*account|change.*email|wire|payout)/gi.test(
    code,
  );
  const hasMfa =
    /(?:mfa|2fa|two.?factor|totp|otp|authenticator|verification.?code|sms.?code|security.?code|second.?factor)/gi.test(
      code,
    );
  if ((hasAuthFlow || hasProtectedOps) && !hasMfa && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "medium",
      title: "No MFA/2FA consideration in authentication flow",
      description:
        "Authentication or sensitive operation flow with no references to multi-factor authentication. Password-only auth is insufficient for protecting high-value operations.",
      recommendation:
        "Implement or integrate MFA (TOTP, WebAuthn, SMS). At minimum, support optional MFA for users and require it for admin/sensitive operations. Consider FIDO2/WebAuthn for phishing-resistant auth.",
      reference: "NIST 800-63B / OWASP MFA Cheat Sheet",
      suggestedFix:
        "Integrate TOTP-based MFA: const verified = speakeasy.totp.verify({ secret: user.mfaSecret, token: req.body.totpCode }); and require MFA for admin and sensitive operations.",
      confidence: 0.7,
    });
  }

  return findings;
}
