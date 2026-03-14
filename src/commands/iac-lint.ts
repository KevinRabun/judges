/**
 * IaC lint — dedicated linting for Dockerfiles, Kubernetes
 * manifests, and Helm charts for security misconfigurations.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface IacFinding {
  file: string;
  line: number;
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  recommendation: string;
}

interface IacRule {
  id: string;
  type: "dockerfile" | "kubernetes" | "helm";
  severity: IacFinding["severity"];
  check: (content: string, lines: string[]) => Array<{ line: number; message: string }>;
  recommendation: string;
}

// ─── Rules ──────────────────────────────────────────────────────────────────

const IAC_RULES: IacRule[] = [
  // Dockerfile rules
  {
    id: "dockerfile-run-as-root",
    type: "dockerfile",
    severity: "high",
    check: (_content, lines) => {
      const hasUser = lines.some((l) => /^USER\s+(?!root)/i.test(l.trim()));
      if (!hasUser) return [{ line: 1, message: "No USER directive — container runs as root" }];
      return [];
    },
    recommendation: "Add USER directive with a non-root user",
  },
  {
    id: "dockerfile-latest-tag",
    type: "dockerfile",
    severity: "medium",
    check: (_content, lines) => {
      const results: Array<{ line: number; message: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (
          /^FROM\s+\S+:latest/i.test(lines[i].trim()) ||
          (/^FROM\s+\S+$/i.test(lines[i].trim()) && !lines[i].includes(":"))
        ) {
          results.push({ line: i + 1, message: "Using 'latest' or untagged base image" });
        }
      }
      return results;
    },
    recommendation: "Pin base image to a specific version tag",
  },
  {
    id: "dockerfile-copy-chown",
    type: "dockerfile",
    severity: "low",
    check: (_content, lines) => {
      const results: Array<{ line: number; message: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (/^COPY\s/i.test(lines[i].trim()) && !lines[i].includes("--chown")) {
          results.push({ line: i + 1, message: "COPY without --chown — files owned by root" });
        }
      }
      return results;
    },
    recommendation: "Use COPY --chown=user:group to set proper ownership",
  },
  {
    id: "dockerfile-add-url",
    type: "dockerfile",
    severity: "high",
    check: (_content, lines) => {
      const results: Array<{ line: number; message: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (/^ADD\s+https?:\/\//i.test(lines[i].trim())) {
          results.push({ line: i + 1, message: "ADD with URL — use COPY + RUN curl instead" });
        }
      }
      return results;
    },
    recommendation: "Replace ADD with RUN curl/wget + COPY for better security",
  },
  {
    id: "dockerfile-env-secret",
    type: "dockerfile",
    severity: "critical",
    check: (_content, lines) => {
      const results: Array<{ line: number; message: string }> = [];
      for (let i = 0; i < lines.length; i++) {
        if (/^ENV\s+.*(?:PASSWORD|SECRET|API_KEY|TOKEN)\s*=/i.test(lines[i].trim())) {
          results.push({ line: i + 1, message: "Secret exposed in ENV directive" });
        }
      }
      return results;
    },
    recommendation: "Use Docker secrets or runtime environment variables instead",
  },

  // Kubernetes rules
  {
    id: "k8s-privileged",
    type: "kubernetes",
    severity: "critical",
    check: (content) => {
      const results: Array<{ line: number; message: string }> = [];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/privileged:\s*true/i.test(lines[i])) {
          results.push({ line: i + 1, message: "Container running in privileged mode" });
        }
      }
      return results;
    },
    recommendation: "Set privileged: false and use specific capabilities instead",
  },
  {
    id: "k8s-host-network",
    type: "kubernetes",
    severity: "high",
    check: (content) => {
      const results: Array<{ line: number; message: string }> = [];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/hostNetwork:\s*true/i.test(lines[i])) {
          results.push({ line: i + 1, message: "Pod using host network namespace" });
        }
      }
      return results;
    },
    recommendation: "Disable hostNetwork unless absolutely required",
  },
  {
    id: "k8s-no-resource-limits",
    type: "kubernetes",
    severity: "medium",
    check: (content) => {
      if (
        /kind:\s*(?:Deployment|Pod|StatefulSet|DaemonSet)/i.test(content) &&
        !/resources:\s*\n\s+limits:/i.test(content)
      ) {
        return [{ line: 1, message: "No resource limits defined" }];
      }
      return [];
    },
    recommendation: "Add resources.limits for CPU and memory",
  },
  {
    id: "k8s-run-as-root",
    type: "kubernetes",
    severity: "high",
    check: (content) => {
      const results: Array<{ line: number; message: string }> = [];
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/runAsUser:\s*0/i.test(lines[i])) {
          results.push({ line: i + 1, message: "Container running as root (UID 0)" });
        }
      }
      return results;
    },
    recommendation: "Set runAsUser to a non-zero UID and runAsNonRoot: true",
  },
  {
    id: "k8s-no-readiness-probe",
    type: "kubernetes",
    severity: "low",
    check: (content) => {
      if (/kind:\s*Deployment/i.test(content) && !/readinessProbe:/i.test(content)) {
        return [{ line: 1, message: "No readiness probe configured" }];
      }
      return [];
    },
    recommendation: "Add readinessProbe for proper traffic management",
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

function detectFileType(filePath: string, content: string): "dockerfile" | "kubernetes" | "helm" | null {
  const name = basename(filePath).toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name.endsWith(".dockerfile")) return "dockerfile";
  if (/kind:\s*(?:Deployment|Service|Pod|StatefulSet|DaemonSet|ConfigMap|Secret|Ingress)/i.test(content))
    return "kubernetes";
  if (/apiVersion:\s*v\d|apiVersion:\s*apps\//i.test(content)) return "kubernetes";
  if (name === "chart.yaml" || name === "values.yaml") return "helm";
  return null;
}

function collectIacFiles(dir: string): string[] {
  const result: string[] = [];
  const skipDirs = new Set(["node_modules", ".git", "dist", "build"]);

  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (skipDirs.has(name)) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        const lower = name.toLowerCase();
        if (lower.includes("dockerfile") || lower.endsWith(".yaml") || lower.endsWith(".yml")) {
          result.push(full);
        }
      }
    }
  }

  walk(dir);
  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runIacLint(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges iac-lint — Lint Dockerfiles, Kubernetes manifests, and Helm charts

Usage:
  judges iac-lint [dir]
  judges iac-lint Dockerfile
  judges iac-lint k8s/ --severity critical,high

Options:
  --severity <levels>   Filter by severity (comma-separated)
  --rules               List all IaC lint rules
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List rules
  if (argv.includes("--rules")) {
    if (format === "json") {
      console.log(
        JSON.stringify(
          IAC_RULES.map(({ check: _c, ...rest }) => rest),
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  IaC Lint Rules (${IAC_RULES.length})\n  ──────────────────────────`);
      for (const r of IAC_RULES) {
        console.log(`    [${r.severity.toUpperCase().padEnd(8)}] ${r.id.padEnd(30)} (${r.type})`);
      }
      console.log("");
    }
    return;
  }

  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");

  // Collect files
  let files: string[];
  if (existsSync(target)) {
    try {
      readdirSync(target);
      files = collectIacFiles(target);
    } catch {
      files = [target];
    }
  } else {
    console.error(`  Path not found: ${target}`);
    return;
  }

  let findings: IacFinding[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const fileType = detectFileType(file, content);
    if (!fileType) continue;

    const applicableRules = IAC_RULES.filter((r) => r.type === fileType);
    const lines = content.split("\n");

    for (const rule of applicableRules) {
      const matches = rule.check(content, lines);
      for (const m of matches) {
        findings.push({
          file,
          line: m.line,
          ruleId: rule.id,
          severity: rule.severity,
          message: m.message,
          recommendation: rule.recommendation,
        });
      }
    }
  }

  if (sevFilter) {
    const allowed = sevFilter.split(",");
    findings = findings.filter((f) => allowed.includes(f.severity));
  }

  if (format === "json") {
    console.log(JSON.stringify({ findings, scannedFiles: files.length, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.log(`\n  IaC Lint — ${files.length} files scanned`);
    console.log(`  Found: ${findings.length} issues\n  ──────────────────────────`);

    if (findings.length === 0) {
      console.log(`    ✅ No IaC issues detected\n`);
      return;
    }

    for (const sev of ["critical", "high", "medium", "low"]) {
      const items = findings.filter((f) => f.severity === sev);
      if (items.length === 0) continue;
      console.log(`\n    ${sev.toUpperCase()} (${items.length})`);
      for (const f of items) {
        console.log(`      ${f.file}:${f.line} — ${f.ruleId}`);
        console.log(`        ${f.message}`);
        console.log(`        → ${f.recommendation}`);
      }
    }
    console.log("");
  }
}
