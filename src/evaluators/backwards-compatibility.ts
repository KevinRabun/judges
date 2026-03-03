import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, testCode } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeBackwardsCompatibility(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "COMPAT";
  const _lang = getLangFamily(language);

  // No API versioning (multi-language route detection)
  const routeLines = getLangLineNumbers(code, language, LP.HTTP_ROUTE);
  const hasApiRoutes = routeLines.length > 0 && /\/api\//i.test(code);
  const hasVersioning = testCode(code, /\/api\/v\d|\/v\d\/|api-version|x-api-version|accept-version/gi);
  if (hasApiRoutes && !hasVersioning) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "API endpoints without versioning",
      description:
        "API routes are defined under /api/ without a version prefix (e.g., /api/v1/). Without versioning, any changes to the API risk breaking existing consumers.",
      recommendation:
        "Add version prefixes to API routes: /api/v1/users. This allows old and new versions to coexist during migration. Use URL, header, or query param versioning.",
      reference: "API Versioning Best Practices / RESTful API Design",
      suggestedFix:
        "Replace `/api/` prefixes with `/api/v1/` in all route definitions and add a versioning middleware or router namespace.",
      confidence: 0.7,
    });
  }

  // Deprecated API indicators without deprecation headers
  const hasDeprecated = testCode(code, /deprecated|@deprecated|obsolete|legacy/gi);
  const hasDeprecationHeader = testCode(code, /Deprecation|Sunset|X-Deprecated/gi);
  if (hasDeprecated && !hasDeprecationHeader) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Deprecated code without API deprecation headers",
      description:
        "Code is marked as deprecated in comments or annotations but no HTTP deprecation headers (Deprecation, Sunset) are set. API consumers won't know features are being retired.",
      recommendation:
        "Set HTTP Deprecation and Sunset headers on deprecated endpoints. Document alternatives. Communicate timeline to consumers.",
      reference: "RFC 8594: The Sunset HTTP Header / API Lifecycle Management",
      suggestedFix:
        "Add `res.set('Deprecation', 'true')` and `res.set('Sunset', '<date>')` headers to each deprecated endpoint's response.",
      confidence: 0.75,
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
      description:
        "Fields are deleted from objects before sending responses. If this is an API response, removing previously available fields is a breaking change.",
      lineNumbers: deleteLines,
      recommendation:
        "Instead of deleting fields, use a response DTO/mapper that explicitly selects which fields to include. Version the API when removing fields.",
      reference: "Backwards-Compatible API Evolution",
      suggestedFix:
        "Replace `delete obj.field` with a DTO mapper (e.g., `pick(obj, ['allowed', 'fields'])`) so removed fields are controlled by the versioned schema.",
      confidence: 0.8,
    });
  }

  // Response type changes (sending different structures)
  const _mixedResponsePattern = /res\.json\s*\(\s*(?:\{|\[)/g;
  const responseLines = getLineNumbers(code, /res\.json\s*\(/g);
  if (responseLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Multiple response formats — verify contract consistency",
      description: `Found ${responseLines.length} response points. Verify that all endpoints follow a consistent response envelope (e.g., { data, error, meta }). Inconsistent response shapes are a compatibility hazard.`,
      lineNumbers: responseLines.slice(0, 5),
      recommendation:
        "Use a consistent response envelope across all endpoints. Define response schemas (OpenAPI/Swagger) to enforce contracts.",
      reference: "API Contract Design / JSON:API Specification",
      suggestedFix:
        "Wrap all `res.json()` calls in a shared helper like `sendResponse(res, { data, meta })` to enforce a uniform envelope.",
      confidence: 0.75,
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
      description:
        "Package version indicates a pre-release or 0.x version. Consumers may not know what compatibility guarantees exist.",
      lineNumbers: packageVersionLines,
      recommendation:
        "Document backwards compatibility policy. Use semver: major bumps for breaking changes, minor for features, patch for fixes.",
      reference: "Semantic Versioning (semver.org)",
      suggestedFix:
        "Promote the version to a stable `1.0.0` (or higher) once the API is production-ready, and add a CHANGELOG documenting compatibility guarantees.",
      confidence: 0.9,
    });
  }

  // Renamed or removed exports
  const commentedExportPattern = /\/\/\s*export\s+(?:function|class|const|let|type|interface)\s+\w+/g;
  const commentedExportLines = getLineNumbers(code, commentedExportPattern, { skipComments: false });
  if (commentedExportLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Commented-out exports may indicate removed API surface",
      description: `Found ${commentedExportLines.length} commented-out export(s). If these were previously published, removing them is a breaking change for consumers.`,
      lineNumbers: commentedExportLines,
      recommendation:
        "Re-export removed symbols as deprecated wrappers. Mark them @deprecated with a migration guide. Remove only in the next major version.",
      reference: "Semantic Versioning / API Deprecation Lifecycle",
      suggestedFix:
        "Uncomment the export and re-export it as a thin deprecated wrapper (e.g., `/** @deprecated Use newName instead */ export const oldName = newName;`).",
      confidence: 0.8,
    });
  }

  // Changed function signatures — optional to required parameter
  const requiredAfterOptionalPattern = /\w+\?:\s*\w+[^)]*,\s*\w+\s*:\s*\w+/g;
  const sigChangeLines = getLineNumbers(code, requiredAfterOptionalPattern);
  if (sigChangeLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Function signature with required params after optional — potential breaking change",
      description:
        "Required parameters placed after optional parameters can break callers who relied on positional arguments.",
      lineNumbers: sigChangeLines,
      recommendation:
        "Keep required parameters before optional ones. Use options objects for functions with many parameters to allow adding fields without breaking callers.",
      reference: "API Design: Function Signature Evolution",
      suggestedFix:
        "Reorder parameters so all required params precede optional ones, or refactor to accept a single options object (e.g., `fn(opts: { required: string; optional?: number })`).",
      confidence: 0.75,
    });
  }

  // Enum/union type removals
  const enumPattern = /enum\s+\w+\s*\{[^}]*\}/g;
  const enumMatches = code.match(enumPattern) || [];
  const hasDeprecatedEnumComment = testCode(code, /\/\/.*deprecated.*enum|\/\*.*removed.*value/gi);
  if (enumMatches.length > 0 && hasDeprecatedEnumComment) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Enum value changes may break consumers",
      description:
        "Enums with deprecated or removed values detected. Removing enum values is a breaking change for anything serializing or deserializing these values.",
      recommendation:
        "Never remove enum values in minor releases. Mark values as deprecated. If numeric, keep the slot allocated. Provide migration mapping for removed values.",
      reference: "Breaking Changes in Enums / Protocol Buffers Reserved Fields",
      suggestedFix:
        "Keep the deprecated enum value with a `/** @deprecated */` annotation and add a `reserved` comment for its numeric slot instead of deleting it.",
      confidence: 0.75,
    });
  }

  // Changing HTTP methods on endpoints (POST mapping doing DELETE work, etc.)
  const deleteViaPostPattern = /app\.post\s*\([^)]*(?:delete|remove|destroy)/gi;
  const deleteViaPostLines = getLineNumbers(code, deleteViaPostPattern);
  if (deleteViaPostLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "HTTP method mismatch — destructive action via POST",
      description:
        "Destructive operations (delete, remove) are exposed via POST instead of DELETE. If these were originally DELETE endpoints, the method change breaks REST clients.",
      lineNumbers: deleteViaPostLines,
      recommendation:
        "Use appropriate HTTP methods: DELETE for removal, PUT/PATCH for updates. If migrating methods, keep the old method working during a deprecation period.",
      reference: "RESTful API Design / HTTP Method Semantics",
      suggestedFix:
        "Change `app.post('/resource', deleteHandler)` to `app.delete('/resource', deleteHandler)` and keep the old POST route temporarily for backwards compatibility.",
      confidence: 0.8,
    });
  }

  // Breaking serialization changes (renaming JSON fields)
  const fieldRenamePattern = /\/\/\s*(?:renamed|was|previously|old name|formerly)\s*[:=]?\s*\w+/gi;
  const fieldRenameLines = getLineNumbers(code, fieldRenamePattern, { skipComments: false });
  if (fieldRenameLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "medium",
      title: "Possible field rename — breaking serialization change",
      description: `Found ${fieldRenameLines.length} comment(s) suggesting renamed fields. Renaming JSON response fields breaks API clients that depend on the old names.`,
      lineNumbers: fieldRenameLines,
      recommendation:
        "Include both old and new field names during a transition period. Mark the old field as deprecated. Remove only in the next major version.",
      reference: "API Versioning / Backwards-Compatible JSON Evolution",
      suggestedFix:
        "Emit both the old and new field names in responses (e.g., `{ oldName: value, newName: value }`) until the next major version removes the old name.",
      confidence: 0.75,
    });
  }

  return findings;
}
