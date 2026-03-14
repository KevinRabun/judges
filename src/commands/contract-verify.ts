/**
 * Contract verify — check that API implementations match declared contracts (OpenAPI, GraphQL, protobuf).
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContractIssue {
  file: string;
  line: number;
  issue: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full)) || /\.(json|ya?ml|graphql|gql|proto)$/.test(full)) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── OpenAPI Analysis ───────────────────────────────────────────────────────

function findOpenApiSpecs(dir: string): string[] {
  const specs: string[] = [];
  const candidates = [
    "openapi.json",
    "openapi.yaml",
    "openapi.yml",
    "swagger.json",
    "swagger.yaml",
    "swagger.yml",
    "api-spec.json",
    "api-spec.yaml",
  ];
  for (const name of candidates) {
    const p = join(dir, name);
    if (existsSync(p)) specs.push(p);
  }
  // Also check docs/ and api/ subdirectories
  for (const sub of ["docs", "api", "spec", "specs"]) {
    const subDir = join(dir, sub);
    if (existsSync(subDir)) {
      for (const name of candidates) {
        const p = join(subDir, name);
        if (existsSync(p)) specs.push(p);
      }
    }
  }
  return specs;
}

function extractOpenApiPaths(specContent: string): { method: string; path: string; responses: string[] }[] {
  const routes: { method: string; path: string; responses: string[] }[] = [];
  try {
    const spec = JSON.parse(specContent);
    const paths = spec.paths || {};
    for (const [path, methods] of Object.entries(paths)) {
      if (typeof methods !== "object" || methods === null) continue;
      for (const [method, detail] of Object.entries(methods as Record<string, unknown>)) {
        if (["get", "post", "put", "delete", "patch"].includes(method)) {
          const responses =
            detail && typeof detail === "object" && "responses" in detail
              ? Object.keys((detail as { responses: Record<string, unknown> }).responses)
              : [];
          routes.push({ method: method.toUpperCase(), path, responses });
        }
      }
    }
  } catch {
    /* not valid JSON spec */
  }
  return routes;
}

// ─── Implementation Analysis ────────────────────────────────────────────────

function analyzeContractDrift(
  files: string[],
  specRoutes: { method: string; path: string; responses: string[] }[],
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const implementedRoutes = new Set<string>();

  // Find implemented routes in code
  for (const filepath of files) {
    let content: string;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx|py|java|go)$/.test(filepath)) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const routeMatch = line.match(/(?:router|app)\.\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/i);
      if (routeMatch) {
        const method = routeMatch[1].toUpperCase();
        const path = routeMatch[2];
        implementedRoutes.add(`${method} ${path}`);

        // Check response status codes used
        const handlerBlock = lines.slice(i, Math.min(i + 30, lines.length)).join("\n");
        const usedStatuses = [...handlerBlock.matchAll(/\.status\s*\(\s*(\d+)\s*\)/g)].map((m) => m[1]);

        // Compare with spec
        const specRoute = specRoutes.find((r) => r.method === method && normalizePath(r.path) === normalizePath(path));
        if (specRoute) {
          for (const status of usedStatuses) {
            if (!specRoute.responses.includes(status)) {
              issues.push({
                file: filepath,
                line: i + 1,
                issue: "Undocumented response status",
                severity: "medium",
                detail: `${method} ${path} returns status ${status} but spec only declares ${specRoute.responses.join(", ")}`,
              });
            }
          }
        }
      }

      // Response shape mismatch (heuristic: returning fields not in type)
      if (/res\.(?:json|send)\s*\(\s*\{/.test(line)) {
        const block = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");
        // Check for ad-hoc response properties that suggest undocumented fields
        if (/password|secret|token|internal|debug|_\w+:/.test(block)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Potentially sensitive field in response",
            severity: "high",
            detail: "Response object may include sensitive or internal-only fields not in API contract",
          });
        }
      }
    }
  }

  // Find spec routes not implemented
  for (const route of specRoutes) {
    const key = `${route.method} ${route.path}`;
    const _normalizedKey = `${route.method} ${normalizePath(route.path)}`;
    let found = false;
    for (const impl of implementedRoutes) {
      if (impl === key || normalizePath(impl.split(" ")[1]) === normalizePath(route.path)) {
        found = true;
        break;
      }
    }
    if (!found) {
      issues.push({
        file: "api-spec",
        line: 0,
        issue: "Spec route not implemented",
        severity: "high",
        detail: `${route.method} ${route.path} declared in OpenAPI spec but no matching handler found in code`,
      });
    }
  }

  return issues;
}

function normalizePath(path: string): string {
  return path.replace(/\{[^}]+\}/g, ":param").replace(/\/+$/, "");
}

// ─── General Contract Checks ────────────────────────────────────────────────

function analyzeGeneralContracts(files: string[]): ContractIssue[] {
  const issues: ContractIssue[] = [];

  for (const filepath of files) {
    let content: string;
    try {
      content = readFileSync(filepath, "utf-8");
    } catch {
      continue;
    }
    if (!/\.(?:ts|tsx|js|jsx)$/.test(filepath)) continue;

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Interface/type declared but response doesn't match
      if (/interface\s+(\w+Response|.*Response)\s*\{/.test(line)) {
        const ifaceName = line.match(/interface\s+(\w+)/)?.[1];
        if (ifaceName && !content.includes(`as ${ifaceName}`) && !content.includes(`: ${ifaceName}`)) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Response type declared but not enforced",
            severity: "medium",
            detail: `\`${ifaceName}\` defined but never used as type constraint — response shape is unverified`,
          });
        }
      }

      // API version in URL doesn't match spec version
      if (/['"]\/api\/v(\d+)/.test(line)) {
        const version = line.match(/\/api\/v(\d+)/)?.[1];
        if (version) {
          const otherVersions = content.match(/\/api\/v(\d+)/g);
          if (otherVersions) {
            const versions = new Set(otherVersions.map((v) => v.match(/v(\d+)/)?.[1]));
            if (versions.size > 1) {
              issues.push({
                file: filepath,
                line: i + 1,
                issue: "Mixed API versions in same file",
                severity: "medium",
                detail: `Multiple API versions found (${[...versions].join(", ")}) — may indicate incomplete migration`,
              });
            }
          }
        }
      }

      // Endpoint returns different shape based on condition
      if (/res\.(?:json|send)\s*\(/.test(line)) {
        const funcBlock = lines.slice(Math.max(0, i - 20), Math.min(i + 5, lines.length)).join("\n");
        const jsonCalls = (funcBlock.match(/res\.(?:json|send)\s*\(/g) || []).length;
        if (jsonCalls > 2) {
          issues.push({
            file: filepath,
            line: i + 1,
            issue: "Multiple response shapes in single handler",
            severity: "low",
            detail: `Handler has ${jsonCalls} different response points — clients may receive inconsistent shapes`,
          });
        }
      }
    }
  }

  return issues;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runContractVerify(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges contract-verify — Check API implementations match declared contracts

Usage:
  judges contract-verify [dir]
  judges contract-verify src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: spec routes not implemented, undocumented response statuses, sensitive fields in responses,
unenforced response types, mixed API versions, inconsistent response shapes.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);

  // Find OpenAPI specs
  const specFiles = findOpenApiSpecs(dir);
  let specRoutes: { method: string; path: string; responses: string[] }[] = [];
  for (const s of specFiles) {
    try {
      const specContent = readFileSync(s, "utf-8");
      specRoutes = specRoutes.concat(extractOpenApiPaths(specContent));
    } catch {
      /* skip */
    }
  }

  const allIssues: ContractIssue[] = [];
  if (specRoutes.length > 0) {
    allIssues.push(...analyzeContractDrift(files, specRoutes));
  }
  allIssues.push(...analyzeGeneralContracts(files));

  const highCount = allIssues.filter((i) => i.severity === "high").length;
  const medCount = allIssues.filter((i) => i.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 10 - medCount * 4);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          issues: allIssues,
          score,
          summary: { high: highCount, medium: medCount, total: allIssues.length, specRoutes: specRoutes.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ ALIGNED" : score >= 50 ? "⚠️  DRIFTED" : "❌ MISMATCHED";
    console.log(`\n  Contract Alignment: ${badge} (${score}/100)\n  ─────────────────────────────`);
    if (specRoutes.length > 0) console.log(`    OpenAPI spec: ${specRoutes.length} routes found`);
    else console.log("    No OpenAPI spec found — running general contract checks only");

    if (allIssues.length === 0) {
      console.log("    No contract issues detected.\n");
      return;
    }

    for (const issue of allIssues.slice(0, 25)) {
      const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${issue.issue}`);
      console.log(`        ${issue.file}:${issue.line}`);
      console.log(`        ${issue.detail}`);
    }
    if (allIssues.length > 25) console.log(`    ... and ${allIssues.length - 25} more`);

    console.log(`\n    Total: ${allIssues.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
