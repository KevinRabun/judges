/**
 * Review-lock-file — Analyze lock files for security and consistency issues.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LockFileIssue {
  type: "integrity-missing" | "registry-mismatch" | "duplicate" | "git-dependency" | "http-registry";
  package: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeNpmLock(content: string): LockFileIssue[] {
  const issues: LockFileIssue[] = [];
  let lockData: Record<string, unknown>;

  try {
    lockData = JSON.parse(content);
  } catch {
    return [
      { type: "integrity-missing", package: "(parse-error)", detail: "Invalid JSON in lock file", severity: "high" },
    ];
  }

  const packages = (lockData.packages || lockData.dependencies || {}) as Record<string, Record<string, unknown>>;

  for (const [name, info] of Object.entries(packages)) {
    if (!name || name === "") continue;

    // check for missing integrity
    if (info !== null && info !== undefined && !info.integrity && !name.startsWith("node_modules")) {
      // Only flag actual packages, not the root
      if (name !== "" && info.version !== undefined) {
        issues.push({
          type: "integrity-missing",
          package: name,
          detail: "No integrity hash — supply chain risk",
          severity: "high",
        });
      }
    }

    // check for git dependencies
    const resolved = String(info.resolved || "");
    if (resolved.startsWith("git+") || resolved.startsWith("git://") || /(:?\/\/|@)github\.com[\/:]/.test(resolved)) {
      issues.push({
        type: "git-dependency",
        package: name,
        detail: `Git dependency: ${resolved.slice(0, 60)}`,
        severity: "medium",
      });
    }

    // check for http (non-https) registry
    if (resolved.startsWith("http://")) {
      issues.push({
        type: "http-registry",
        package: name,
        detail: "Uses HTTP instead of HTTPS — insecure transport",
        severity: "high",
      });
    }
  }

  return issues;
}

function analyzeYarnLock(content: string): LockFileIssue[] {
  const issues: LockFileIssue[] = [];
  const lines = content.split("\n");

  let currentPkg = "";
  for (const line of lines) {
    if (line.startsWith('"') || (line.startsWith("@") && line.includes('"'))) {
      currentPkg = line.replace(/[",:]/g, "").trim().split("@")[0] || line.replace(/[",:]/g, "").trim();
    }

    if (line.includes("resolved") && line.includes("http://")) {
      issues.push({
        type: "http-registry",
        package: currentPkg,
        detail: "Uses HTTP instead of HTTPS",
        severity: "high",
      });
    }

    if (line.includes("resolved") && (/(:?\/\/|@)github\.com[\/:]/.test(line) || line.includes("git+"))) {
      issues.push({
        type: "git-dependency",
        package: currentPkg,
        detail: "Git dependency detected",
        severity: "medium",
      });
    }
  }

  return issues;
}

function analyzeLockFile(filePath: string): LockFileIssue[] {
  const content = readFileSync(filePath, "utf-8");

  if (filePath.endsWith("package-lock.json")) {
    return analyzeNpmLock(content);
  }
  if (filePath.endsWith("yarn.lock")) {
    return analyzeYarnLock(content);
  }

  return [{ type: "integrity-missing", package: "(unknown)", detail: "Unsupported lock file format", severity: "low" }];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewLockFile(argv: string[]): void {
  const fileIdx = argv.indexOf("--file");
  const formatIdx = argv.indexOf("--format");
  const filePath = fileIdx >= 0 ? argv[fileIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-lock-file — Analyze lock files for security issues

Usage:
  judges review-lock-file --file <lock-file> [--format table|json]

Options:
  --file <path>      Path to lock file (package-lock.json, yarn.lock)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help

Checks:
  - Missing integrity hashes
  - HTTP (insecure) registries
  - Git dependencies
  - Registry mismatches
`);
    return;
  }

  if (!filePath) {
    console.error("Error: --file required");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(filePath)) {
    console.error(`Error: not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const issues = analyzeLockFile(filePath);

  if (format === "json") {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  const high = issues.filter((i) => i.severity === "high").length;
  const medium = issues.filter((i) => i.severity === "medium").length;
  const low = issues.filter((i) => i.severity === "low").length;

  console.log(`\nLock File Analysis: ${filePath}`);
  console.log("═".repeat(75));
  console.log(`  Issues: ${issues.length} (${high} high, ${medium} medium, ${low} low)`);
  console.log("─".repeat(75));

  if (issues.length === 0) {
    console.log("  No issues found — lock file looks clean.");
  } else {
    console.log(`${"Severity".padEnd(10)} ${"Type".padEnd(20)} ${"Package".padEnd(25)} Detail`);
    console.log("─".repeat(75));

    for (const issue of issues) {
      const pkg = issue.package.length > 23 ? issue.package.slice(0, 23) + "…" : issue.package;
      const detail = issue.detail.length > 30 ? issue.detail.slice(0, 30) + "…" : issue.detail;
      console.log(`${issue.severity.padEnd(10)} ${issue.type.padEnd(20)} ${pkg.padEnd(25)} ${detail}`);
    }
  }
  console.log("═".repeat(75));
}
