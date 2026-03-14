/**
 * Boundary enforce — validate architectural module boundaries and enforce
 * import/dependency rules.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, extname, relative, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BoundaryViolation {
  file: string;
  line: number;
  from: string;
  to: string;
  severity: "high" | "medium" | "low";
  detail: string;
}

interface BoundaryRule {
  layer: string;
  allowedDeps: string[];
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs"]);

function collectFiles(dir: string, max = 400): string[] {
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
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Boundary Definition ────────────────────────────────────────────────────

function loadBoundaryConfig(dir: string): BoundaryRule[] | null {
  const configPath = join(dir, ".boundaries.json");
  if (existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, "utf-8");
      return JSON.parse(content) as BoundaryRule[];
    } catch {
      /* fall through */
    }
  }
  return null;
}

function inferLayers(dir: string): BoundaryRule[] {
  const rules: BoundaryRule[] = [];

  // Common architectural layers
  const layerHierarchy: { dirs: string[]; level: number }[] = [
    { dirs: ["domain", "core", "model", "entities"], level: 0 },
    { dirs: ["application", "services", "use-cases", "usecases"], level: 1 },
    { dirs: ["infrastructure", "infra", "adapters", "repositories"], level: 2 },
    { dirs: ["presentation", "ui", "views", "pages", "components"], level: 3 },
    { dirs: ["api", "controllers", "routes", "handlers"], level: 3 },
  ];

  const foundLayers: { name: string; level: number }[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir) as unknown as string[];
  } catch {
    return rules;
  }

  for (const e of entries) {
    const full = join(dir, e);
    try {
      if (!statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }

    for (const lh of layerHierarchy) {
      if (lh.dirs.includes(e.toLowerCase())) {
        foundLayers.push({ name: e, level: lh.level });
      }
    }
  }

  // Inner layers should not depend on outer layers
  for (const layer of foundLayers) {
    const allowed = foundLayers.filter((l) => l.level <= layer.level).map((l) => l.name);
    rules.push({ layer: layer.name, allowedDeps: allowed });
  }

  return rules;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function getLayer(filepath: string, dir: string): string | null {
  const rel = relative(dir, filepath).replace(/\\/g, "/");
  const parts = rel.split("/");
  return parts.length > 1 ? parts[0] : null;
}

function analyzeImports(filepath: string, dir: string, rules: BoundaryRule[]): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const fromLayer = getLayer(filepath, dir);
  if (!fromLayer) return violations;

  const rule = rules.find((r) => r.layer === fromLayer);
  if (!rule) return violations;

  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return violations;
  }

  const lines = content.split("\n");
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;

  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null;
    importRegex.lastIndex = 0;
    while ((match = importRegex.exec(lines[i])) !== null) {
      const importPath = match[1];
      if (!importPath.startsWith(".")) continue; // Skip external modules

      const resolved = join(dirname(filepath), importPath).replace(/\\/g, "/");
      const importedRel = relative(dir, resolved).replace(/\\/g, "/");
      const toLayer = importedRel.split("/")[0];

      if (toLayer && toLayer !== fromLayer && !rule.allowedDeps.includes(toLayer)) {
        violations.push({
          file: relative(dir, filepath).replace(/\\/g, "/"),
          line: i + 1,
          from: fromLayer,
          to: toLayer,
          severity: "high",
          detail: `${fromLayer} → ${toLayer} violates boundary (allowed: ${rule.allowedDeps.join(", ")})`,
        });
      }
    }
  }

  return violations;
}

// Additional heuristic checks
function checkCommonViolations(filepath: string, dir: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const rel = relative(dir, filepath).replace(/\\/g, "/");
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return violations;
  }

  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // UI importing DB/ORM directly
    if (/\b(?:components?|pages?|views?|ui)\//i.test(rel)) {
      if (/(?:prisma|sequelize|typeorm|mongoose|knex|pg\b|mysql|sqlite)/i.test(line) && /import|require/.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          from: "UI",
          to: "Database",
          severity: "high",
          detail: "UI layer importing database library directly — use a service/repository layer",
        });
      }
    }

    // Test code importing test internals from src
    if (/\b(?:src|lib)\//i.test(rel) && !/__test__|\.test\.|\.spec\./i.test(rel)) {
      if (/import.*(?:jest|vitest|mocha|chai|sinon)/.test(line) && !/devDependencies/.test(line)) {
        violations.push({
          file: rel,
          line: i + 1,
          from: "source",
          to: "test-framework",
          severity: "medium",
          detail: "Production code importing test framework",
        });
      }
    }
  }

  return violations;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runBoundaryEnforce(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges boundary-enforce — Validate architectural module boundaries

Usage:
  judges boundary-enforce [dir]
  judges boundary-enforce src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Config: Create .boundaries.json with rules:
  [{"layer": "domain", "allowedDeps": ["domain"]},
   {"layer": "services", "allowedDeps": ["domain", "services"]}]

Without config, layers are inferred from directory structure.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const configRules = loadBoundaryConfig(dir);
  const rules = configRules || inferLayers(dir);
  const usingConfig = configRules !== null;

  const files = collectFiles(dir);
  const violations: BoundaryViolation[] = [];

  for (const f of files) {
    violations.push(...analyzeImports(f, dir, rules));
    violations.push(...checkCommonViolations(f, dir));
  }

  const score = Math.max(0, 100 - violations.length * 5);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          violations,
          rules,
          usingConfig,
          score,
          summary: { files: files.length, violations: violations.length, layers: rules.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = violations.length === 0 ? "✅ CLEAN" : violations.length <= 3 ? "⚠️  MINOR" : "❌ ERODED";
    console.log(`\n  Boundary Enforcement: ${badge} (${score}/100)\n  ──────────────────────────────`);
    console.log(
      `    Config: ${usingConfig ? ".boundaries.json" : "inferred from directories"} | Layers: ${rules.length} | Files: ${files.length}\n`,
    );

    if (rules.length > 0) {
      console.log("    Layers:");
      for (const r of rules) {
        console.log(`      📦 ${r.layer} → can depend on: ${r.allowedDeps.join(", ")}`);
      }
      console.log();
    }

    if (violations.length === 0) {
      console.log("    No boundary violations detected.\n");
      return;
    }

    for (const v of violations.slice(0, 20)) {
      const icon = v.severity === "high" ? "🔴" : v.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${v.from} → ${v.to}`);
      console.log(`        ${v.file}:${v.line}`);
      console.log(`        ${v.detail}`);
    }
    if (violations.length > 20) console.log(`    ... and ${violations.length - 20} more`);

    console.log(`\n    Violations: ${violations.length} | Score: ${score}/100\n`);
  }
}
