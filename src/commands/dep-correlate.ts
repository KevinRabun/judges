/**
 * Dependency vulnerability correlation — cross-references
 * Judges findings with dependency versions to identify which
 * dependencies contribute the most security findings.
 *
 * All data from local files (package.json, lock files).
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DepInfo {
  name: string;
  version: string;
  type: "dependency" | "devDependency";
}

interface DepCorrelation {
  dependency: string;
  version: string;
  findingCount: number;
  findings: Array<{ ruleId: string; severity: string; title: string }>;
  riskScore: number;
  upgradeRecommendation: string;
}

interface CorrelationReport {
  correlations: DepCorrelation[];
  totalDeps: number;
  depsWithFindings: number;
  timestamp: string;
}

// ─── Dep parsing ────────────────────────────────────────────────────────────

function loadDeps(): DepInfo[] {
  const deps: DepInfo[] = [];

  // package.json (npm)
  if (existsSync("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
      for (const [name, ver] of Object.entries(pkg.dependencies || {})) {
        deps.push({ name, version: String(ver), type: "dependency" });
      }
      for (const [name, ver] of Object.entries(pkg.devDependencies || {})) {
        deps.push({ name, version: String(ver), type: "devDependency" });
      }
    } catch {
      /* skip */
    }
  }

  // requirements.txt (Python)
  if (existsSync("requirements.txt")) {
    try {
      const lines = readFileSync("requirements.txt", "utf-8").split("\n");
      for (const line of lines) {
        const match = /^([a-zA-Z0-9_-]+)==(.+)/.exec(line.trim());
        if (match) deps.push({ name: match[1], version: match[2], type: "dependency" });
      }
    } catch {
      /* skip */
    }
  }

  // go.mod (Go)
  if (existsSync("go.mod")) {
    try {
      const content = readFileSync("go.mod", "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        const match = /^\s+([\w./-]+)\s+(v[\d.]+)/.exec(line);
        if (match) deps.push({ name: match[1], version: match[2], type: "dependency" });
      }
    } catch {
      /* skip */
    }
  }

  return deps;
}

function loadFindings(): Array<{ ruleId: string; severity: string; title: string; description: string }> {
  // Try common finding output locations
  const paths = [".judges-findings.json", join(".judges-audit-trail", "trail.json"), "judges-report.json"];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (Array.isArray(data)) return data;
      if (data.findings && Array.isArray(data.findings)) return data.findings;
      if (data.events && Array.isArray(data.events)) {
        return data.events
          .filter((e: Record<string, unknown>) => e.type === "created")
          .map(
            (e: Record<string, unknown>) =>
              e.finding || { ruleId: e.findingId, severity: "medium", title: String(e.findingId), description: "" },
          );
      }
    } catch {
      /* skip */
    }
  }

  return [];
}

// ─── Correlation ────────────────────────────────────────────────────────────

const KNOWN_VULN_PATTERNS: Record<string, string[]> = {
  express: ["ssrf", "xss", "csrf", "header-injection"],
  lodash: ["prototype-pollution", "command-injection"],
  axios: ["ssrf", "redirect"],
  jsonwebtoken: ["jwt", "auth", "token"],
  helmet: ["header", "csp", "xss"],
  sequelize: ["sql-injection", "nosql"],
  mongoose: ["nosql-injection", "injection"],
  mysql: ["sql-injection", "injection"],
  pg: ["sql-injection", "injection"],
  "crypto-js": ["crypto", "weak-cipher", "weak-hash"],
  bcrypt: ["password", "hash"],
  passport: ["auth", "authentication"],
  cors: ["cors", "origin"],
  multer: ["upload", "file", "path-traversal"],
  child_process: ["command-injection", "exec"],
};

function correlate(
  deps: DepInfo[],
  findings: Array<{ ruleId: string; severity: string; title: string; description?: string }>,
): DepCorrelation[] {
  const correlations: DepCorrelation[] = [];

  for (const dep of deps) {
    const patterns = KNOWN_VULN_PATTERNS[dep.name] || [];
    const matched = findings.filter((f) => {
      const text = `${f.ruleId} ${f.title} ${f.description || ""}`.toLowerCase();
      return patterns.some((p) => text.includes(p));
    });

    if (matched.length > 0) {
      const sevWeights: Record<string, number> = { critical: 10, high: 7, medium: 4, low: 1 };
      const riskScore = matched.reduce((s, f) => s + (sevWeights[f.severity] || 2), 0);

      correlations.push({
        dependency: dep.name,
        version: dep.version,
        findingCount: matched.length,
        findings: matched.map((f) => ({ ruleId: f.ruleId, severity: f.severity, title: f.title })),
        riskScore,
        upgradeRecommendation:
          riskScore > 20 ? "Urgent upgrade recommended" : riskScore > 10 ? "Upgrade recommended" : "Monitor",
      });
    }
  }

  return correlations.sort((a, b) => b.riskScore - a.riskScore);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-dep-correlate";

export function runDepCorrelate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges dep-correlate — Dependency vulnerability correlation

Usage:
  judges dep-correlate
  judges dep-correlate --deps
  judges dep-correlate --top 5

Options:
  --deps                List detected dependencies
  --top <n>             Show top N riskiest dependencies
  --save                Save report to ${STORE}/
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const deps = loadDeps();

  // List deps only
  if (argv.includes("--deps")) {
    if (format === "json") {
      console.log(JSON.stringify(deps, null, 2));
    } else {
      console.log(`\n  Dependencies (${deps.length})\n  ──────────────────────────`);
      for (const d of deps) {
        console.log(`    ${d.name.padEnd(30)} ${d.version.padEnd(15)} ${d.type}`);
      }
      console.log("");
    }
    return;
  }

  if (deps.length === 0) {
    console.log("  No dependencies found. Supports: package.json, requirements.txt, go.mod");
    return;
  }

  const findings = loadFindings();
  const correlations = correlate(deps, findings);

  const topN = argv.find((_a: string, i: number) => argv[i - 1] === "--top");
  const limit = topN ? parseInt(topN, 10) : correlations.length;

  const report: CorrelationReport = {
    correlations: correlations.slice(0, limit),
    totalDeps: deps.length,
    depsWithFindings: correlations.length,
    timestamp: new Date().toISOString(),
  };

  // Save
  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "correlation-report.json"), JSON.stringify(report, null, 2));
    console.log(`  Saved to ${STORE}/correlation-report.json`);
  }

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Dependency Vulnerability Correlation`);
    console.log(`  Total dependencies: ${report.totalDeps}  With correlated findings: ${report.depsWithFindings}`);
    console.log(`  ──────────────────────────`);

    if (report.correlations.length === 0) {
      console.log(`    ✅ No dependency-finding correlations detected`);
      if (findings.length === 0) console.log(`    (No findings data found — run a scan first)`);
      console.log("");
      return;
    }

    for (const c of report.correlations) {
      console.log(`\n    ${c.dependency}@${c.version}  Risk: ${c.riskScore}  Findings: ${c.findingCount}`);
      console.log(`    Recommendation: ${c.upgradeRecommendation}`);
      for (const f of c.findings.slice(0, 3)) {
        console.log(`      - [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
      }
      if (c.findings.length > 3) console.log(`      ... and ${c.findings.length - 3} more`);
    }
    console.log("");
  }
}
