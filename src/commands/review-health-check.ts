/**
 * Review-health-check — Diagnose review system health and readiness.
 */

import { existsSync, readFileSync, statSync, readdirSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthCheck {
  component: string;
  status: "healthy" | "degraded" | "unhealthy";
  message: string;
}

// ─── Checks ─────────────────────────────────────────────────────────────────

function checkCacheHealth(): HealthCheck {
  if (!existsSync(".judges")) {
    return { component: "Cache", status: "healthy", message: "No cache dir (will be created)" };
  }
  try {
    const files = readdirSync(".judges") as unknown as string[];
    const jsonFiles = files.filter((f: string) => f.endsWith(".json"));
    const totalSize = jsonFiles.reduce((sum: number, f: string) => {
      try {
        return sum + statSync(`.judges/${f}`).size;
      } catch {
        return sum;
      }
    }, 0);
    const mb = (totalSize / 1024 / 1024).toFixed(1);
    if (totalSize > 100 * 1024 * 1024) {
      return { component: "Cache", status: "degraded", message: `${mb} MB — consider cleanup` };
    }
    return { component: "Cache", status: "healthy", message: `${jsonFiles.length} files, ${mb} MB` };
  } catch {
    return { component: "Cache", status: "unhealthy", message: "Cannot read .judges/" };
  }
}

function checkConfigHealth(): HealthCheck {
  const candidates = [".judgesrc", ".judgesrc.json", ".judgesrc.yaml"];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const content = readFileSync(c, "utf-8");
        if (c.endsWith(".json") || c === ".judgesrc") {
          JSON.parse(content);
        }
        return { component: "Config", status: "healthy", message: `Valid config: ${c}` };
      } catch {
        return { component: "Config", status: "unhealthy", message: `Invalid config: ${c}` };
      }
    }
  }
  return { component: "Config", status: "healthy", message: "Using defaults (no config file)" };
}

function checkRuntimeHealth(): HealthCheck {
  const memUsage = process.memoryUsage();
  const heapMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  if (heapMb > 500) {
    return { component: "Runtime", status: "degraded", message: `Heap: ${heapMb} MB (high)` };
  }
  return { component: "Runtime", status: "healthy", message: `Node ${process.version}, heap: ${heapMb} MB` };
}

function checkDependenciesHealth(): HealthCheck {
  if (!existsSync("node_modules")) {
    return { component: "Dependencies", status: "unhealthy", message: "node_modules not found" };
  }
  if (existsSync("package-lock.json") && existsSync("package.json")) {
    try {
      const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
      const lockContent = readFileSync("package-lock.json", "utf-8");
      const lock = JSON.parse(lockContent);
      if (pkg.version !== lock.version) {
        return { component: "Dependencies", status: "degraded", message: "Lock file version mismatch" };
      }
    } catch {
      /* ignore parse errors */
    }
  }
  return { component: "Dependencies", status: "healthy", message: "node_modules present" };
}

function checkRecentResults(): HealthCheck {
  const resultPaths = [".judges/last-results.json", "results.json", ".judges/results.json"];
  for (const p of resultPaths) {
    if (existsSync(p)) {
      try {
        const stat = statSync(p);
        const ageHours = (Date.now() - stat.mtimeMs) / 1000 / 60 / 60;
        if (ageHours > 168) {
          return {
            component: "Results",
            status: "degraded",
            message: `Last results ${Math.round(ageHours / 24)} days old`,
          };
        }
        return {
          component: "Results",
          status: "healthy",
          message: `Last run: ${stat.mtime.toISOString().slice(0, 19)}`,
        };
      } catch {
        /* ignore */
      }
    }
  }
  return { component: "Results", status: "healthy", message: "No previous results found" };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewHealthCheck(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-health-check — Diagnose review system health

Usage:
  judges review-health-check [options]

Options:
  --format json     JSON output
  --help, -h        Show this help

Checks: cache, config, runtime, dependencies, recent results.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  const checks: HealthCheck[] = [
    checkCacheHealth(),
    checkConfigHealth(),
    checkRuntimeHealth(),
    checkDependenciesHealth(),
    checkRecentResults(),
  ];

  const healthy = checks.filter((c) => c.status === "healthy").length;
  const degraded = checks.filter((c) => c.status === "degraded").length;
  const unhealthy = checks.filter((c) => c.status === "unhealthy").length;
  const overall = unhealthy > 0 ? "unhealthy" : degraded > 0 ? "degraded" : "healthy";

  if (format === "json") {
    console.log(JSON.stringify({ overall, checks, healthy, degraded, unhealthy }, null, 2));
    if (overall === "unhealthy") process.exitCode = 1;
    return;
  }

  console.log("\nSystem Health Check:");
  console.log("═".repeat(60));
  for (const c of checks) {
    const icon = c.status === "healthy" ? " OK " : c.status === "degraded" ? "WARN" : "FAIL";
    console.log(`  [${icon}] ${c.component.padEnd(16)} ${c.message}`);
  }
  console.log("═".repeat(60));
  console.log(`  Overall: ${overall.toUpperCase()} (${healthy} ok, ${degraded} degraded, ${unhealthy} unhealthy)`);

  if (overall === "unhealthy") process.exitCode = 1;
}
