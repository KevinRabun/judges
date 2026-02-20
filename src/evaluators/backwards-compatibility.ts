import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeBackwardsCompatibility(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "COMPAT";

  // No API versioning
  const hasApiRoutes = /app\.(get|post|put|delete|patch)\s*\(\s*["'`]\/api\//gi.test(code);
  const hasVersioning = /\/api\/v\d|\/v\d\/|api-version|x-api-version|accept-version/gi.test(code);
  if (hasApiRoutes && !hasVersioning) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "API endpoints without versioning",
      description: "API routes are defined under /api/ without a version prefix (e.g., /api/v1/). Without versioning, any changes to the API risk breaking existing consumers.",
      recommendation: "Add version prefixes to API routes: /api/v1/users. This allows old and new versions to coexist during migration. Use URL, header, or query param versioning.",
      reference: "API Versioning Best Practices / RESTful API Design",
    });
  }

  // Deprecated API indicators without deprecation headers
  const hasDeprecated = /deprecated|@deprecated|obsolete|legacy/gi.test(code);
  const hasDeprecationHeader = /Deprecation|Sunset|X-Deprecated/gi.test(code);
  if (hasDeprecated && !hasDeprecationHeader) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Deprecated code without API deprecation headers",
      description: "Code is marked as deprecated in comments or annotations but no HTTP deprecation headers (Deprecation, Sunset) are set. API consumers won't know features are being retired.",
      recommendation: "Set HTTP Deprecation and Sunset headers on deprecated endpoints. Document alternatives. Communicate timeline to consumers.",
      reference: "RFC 8594: The Sunset HTTP Header / API Lifecycle Management",
    });
  }

  // Direct field deletion in response objects
  const deleteFieldPattern = /delete\s+\w+\.\w+/gi;
  const deleteLines = getLineNumbers(code, deleteFieldPattern);
  if (deleteLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Field deletion could break consumers",
      description: "Fields are deleted from objects before sending responses. If this is an API response, removing previously available fields is a breaking change.",
      lineNumbers: deleteLines,
      recommendation: "Instead of deleting fields, use a response DTO/mapper that explicitly selects which fields to include. Version the API when removing fields.",
      reference: "Backwards-Compatible API Evolution",
    });
  }

  // Response type changes (sending different structures)
  const mixedResponsePattern = /res\.json\s*\(\s*(?:\{|\[)/g;
  const responseLines = getLineNumbers(code, /res\.json\s*\(/g);
  if (responseLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Multiple response formats — verify contract consistency",
      description: `Found ${responseLines.length} response points. Verify that all endpoints follow a consistent response envelope (e.g., { data, error, meta }). Inconsistent response shapes are a compatibility hazard.`,
      lineNumbers: responseLines.slice(0, 5),
      recommendation: "Use a consistent response envelope across all endpoints. Define response schemas (OpenAPI/Swagger) to enforce contracts.",
      reference: "API Contract Design / JSON:API Specification",
    });
  }

  // No semver in package version
  const packageVersionPattern = /"version"\s*:\s*"(?:0\.0\.|[^"]*-alpha|[^"]*-beta)/gi;
  const packageVersionLines = getLineNumbers(code, packageVersionPattern);
  if (packageVersionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Pre-release version — backwards compatibility expectations unclear",
      description: "Package version indicates a pre-release or 0.x version. Consumers may not know what compatibility guarantees exist.",
      lineNumbers: packageVersionLines,
      recommendation: "Document backwards compatibility policy. Use semver: major bumps for breaking changes, minor for features, patch for fixes.",
      reference: "Semantic Versioning (semver.org)",
    });
  }

  return findings;
}
