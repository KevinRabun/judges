import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeAuthentication(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "AUTH";

  // Hardcoded credentials
  const credentialPattern = /(?:password|passwd|pwd|secret|api_?key|apikey|token|auth_?token)\s*[:=]\s*["'`][^"'`]{3,}/gi;
  const credentialLines = getLineNumbers(code, credentialPattern);
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
  const weakHashPattern = /createHash\s*\(\s*["'`](?:md5|sha1|sha256)["'`]\)|(?:md5|sha1)\s*\(/gi;
  const weakHashLines = getLineNumbers(code, weakHashPattern);
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

  return findings;
}
