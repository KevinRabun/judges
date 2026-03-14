/**
 * Review-env-check — Verify review environment prerequisites.
 */

import { existsSync } from "fs";
import { execSync } from "child_process";

// ─── Checks ─────────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

function checkNode(): CheckResult {
  try {
    const ver = process.version;
    const major = parseInt(ver.slice(1).split(".")[0], 10);
    if (major >= 18) return { name: "Node.js", status: "pass", message: `${ver} (>= 18 required)` };
    return { name: "Node.js", status: "fail", message: `${ver} — upgrade to >= 18` };
  } catch {
    return { name: "Node.js", status: "fail", message: "Not found" };
  }
}

function checkGit(): CheckResult {
  try {
    const ver = execSync("git --version", { encoding: "utf-8", timeout: 5000 }).trim();
    return { name: "Git", status: "pass", message: ver };
  } catch {
    return { name: "Git", status: "warn", message: "Not found (optional for diff features)" };
  }
}

function checkConfigFile(): CheckResult {
  const candidates = [".judgesrc", ".judgesrc.json", ".judgesrc.yaml", "judgesrc.config.js"];
  for (const c of candidates) {
    if (existsSync(c)) return { name: "Config file", status: "pass", message: c };
  }
  return { name: "Config file", status: "warn", message: "No config found (using defaults)" };
}

function checkCacheDir(): CheckResult {
  if (existsSync(".judges")) return { name: "Cache directory", status: "pass", message: ".judges/ exists" };
  return { name: "Cache directory", status: "warn", message: ".judges/ not found (will be created on first run)" };
}

function checkDiskSpace(): CheckResult {
  try {
    const os = process.platform;
    if (os === "win32") {
      const out = execSync("wmic logicaldisk get freespace", { encoding: "utf-8", timeout: 5000 });
      const lines = out
        .trim()
        .split("\n")
        .filter((l) => l.trim().length > 0);
      if (lines.length > 1) {
        const free = parseInt(lines[1].trim(), 10);
        const mb = Math.round(free / 1024 / 1024);
        if (mb > 100) return { name: "Disk space", status: "pass", message: `${mb} MB free` };
        return { name: "Disk space", status: "warn", message: `${mb} MB free (low)` };
      }
    }
    return { name: "Disk space", status: "pass", message: "Check skipped" };
  } catch {
    return { name: "Disk space", status: "pass", message: "Check skipped" };
  }
}

function checkPackageJson(): CheckResult {
  if (existsSync("package.json")) return { name: "package.json", status: "pass", message: "Found" };
  return { name: "package.json", status: "warn", message: "Not found" };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewEnvCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-env-check — Verify review environment prerequisites

Usage:
  judges review-env-check [options]

Options:
  --strict          Fail on warnings too
  --format json     JSON output
  --help, -h        Show this help

Checks: Node.js version, Git, config file, cache dir, disk space, package.json.
`);
    return;
  }

  const strict = argv.includes("--strict");
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const checks: CheckResult[] = [
    checkNode(),
    checkGit(),
    checkConfigFile(),
    checkCacheDir(),
    checkDiskSpace(),
    checkPackageJson(),
  ];

  const failures = checks.filter((c) => c.status === "fail");
  const warnings = checks.filter((c) => c.status === "warn");
  const ok = failures.length === 0 && (!strict || warnings.length === 0);

  if (format === "json") {
    console.log(JSON.stringify({ checks, ok, failures: failures.length, warnings: warnings.length }, null, 2));
    if (!ok) process.exitCode = 1;
    return;
  }

  console.log("\nEnvironment Check:");
  console.log("═".repeat(55));
  for (const c of checks) {
    const icon = c.status === "pass" ? "PASS" : c.status === "warn" ? "WARN" : "FAIL";
    console.log(`  [${icon}] ${c.name.padEnd(18)} ${c.message}`);
  }
  console.log("═".repeat(55));
  console.log(
    `  Result: ${ok ? "Environment ready" : "Issues found"} (${failures.length} failures, ${warnings.length} warnings)`,
  );

  if (!ok) process.exitCode = 1;
}
