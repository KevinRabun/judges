import { readFileSync, existsSync } from "fs";
import { join } from "path";

/* ── review-config-health ───────────────────────────────────────────
   Assess Judges configuration health by checking for common
   misconfigurations, missing settings, and optimization opportunities.
   All analysis runs locally on the workspace.
   ─────────────────────────────────────────────────────────────────── */

interface HealthCheck {
  check: string;
  status: "healthy" | "warning" | "error";
  detail: string;
  suggestion: string;
}

function assessHealth(projectDir: string): HealthCheck[] {
  const checks: HealthCheck[] = [];

  // Check for config file
  const configPaths = [".judgesrc", ".judgesrc.json", "judges.config.json"];
  const foundConfig = configPaths.find((p) => existsSync(join(projectDir, p)));

  if (!foundConfig) {
    checks.push({
      check: "Config file",
      status: "error",
      detail: "No configuration file found",
      suggestion: "Run `judges init` to create a configuration file",
    });
  } else {
    try {
      const raw = readFileSync(join(projectDir, foundConfig), "utf-8");
      const cfg = JSON.parse(raw) as Record<string, unknown>;

      checks.push({
        check: "Config file",
        status: "healthy",
        detail: `Found ${foundConfig}`,
        suggestion: "",
      });

      // Check preset
      if (!cfg["preset"]) {
        checks.push({
          check: "Preset configured",
          status: "warning",
          detail: "No preset defined",
          suggestion: "Add a preset like 'security', 'quality', or 'full' for optimized defaults",
        });
      } else {
        checks.push({
          check: "Preset configured",
          status: "healthy",
          detail: `Preset: ${String(cfg["preset"])}`,
          suggestion: "",
        });
      }

      // Check minSeverity
      if (!cfg["minSeverity"]) {
        checks.push({
          check: "Minimum severity",
          status: "warning",
          detail: "No minSeverity set — all severities reported",
          suggestion: "Set minSeverity to 'low' or 'medium' to reduce noise",
        });
      } else {
        checks.push({
          check: "Minimum severity",
          status: "healthy",
          detail: `minSeverity: ${String(cfg["minSeverity"])}`,
          suggestion: "",
        });
      }

      // Check disabled judges
      const disabled = cfg["disabledJudges"];
      if (Array.isArray(disabled) && disabled.length > 5) {
        checks.push({
          check: "Disabled judges",
          status: "warning",
          detail: `${disabled.length} judges disabled`,
          suggestion: "Consider using a different preset instead of disabling many judges",
        });
      } else {
        checks.push({
          check: "Disabled judges",
          status: "healthy",
          detail: Array.isArray(disabled) ? `${disabled.length} disabled` : "None disabled",
          suggestion: "",
        });
      }

      // Check rule overrides
      const overrides = cfg["ruleOverrides"];
      if (overrides && typeof overrides === "object") {
        const count = Object.keys(overrides).length;
        checks.push({
          check: "Rule overrides",
          status: count > 20 ? "warning" : "healthy",
          detail: `${count} rule overrides`,
          suggestion: count > 20 ? "Many overrides — consider adjusting preset instead" : "",
        });
      }
    } catch {
      checks.push({
        check: "Config parseable",
        status: "error",
        detail: `Config file ${foundConfig} has syntax errors`,
        suggestion: "Fix JSON syntax in the config file",
      });
    }
  }

  // Check .judges directory
  const judgesDir = join(projectDir, ".judges");
  if (!existsSync(judgesDir)) {
    checks.push({
      check: "Judges directory",
      status: "warning",
      detail: "No .judges directory found",
      suggestion: "Run a review to create the .judges directory with results",
    });
  } else {
    checks.push({
      check: "Judges directory",
      status: "healthy",
      detail: ".judges directory exists",
      suggestion: "",
    });
  }

  // Check .gitignore includes .judges
  const gitignorePath = join(projectDir, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".judges")) {
      checks.push({
        check: "Gitignore",
        status: "warning",
        detail: ".judges not in .gitignore",
        suggestion: "Add .judges/ to .gitignore to avoid committing review artifacts",
      });
    } else {
      checks.push({
        check: "Gitignore",
        status: "healthy",
        detail: ".judges directory excluded from git",
        suggestion: "",
      });
    }
  }

  return checks;
}

export function runReviewConfigHealth(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges review-config-health [options]

Assess configuration health and suggest improvements.

Options:
  --dir <path>         Project directory (default: current)
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const dirIdx = argv.indexOf("--dir");
  const projectDir = dirIdx !== -1 && argv[dirIdx + 1] ? join(process.cwd(), argv[dirIdx + 1]) : process.cwd();

  const checks = assessHealth(projectDir);

  if (format === "json") {
    console.log(JSON.stringify(checks, null, 2));
    return;
  }

  const errors = checks.filter((c) => c.status === "error").length;
  const warnings = checks.filter((c) => c.status === "warning").length;
  const healthy = checks.filter((c) => c.status === "healthy").length;

  console.log(`\n=== Config Health (${healthy} healthy, ${warnings} warnings, ${errors} errors) ===\n`);

  for (const c of checks) {
    const icon = c.status === "healthy" ? "✓" : c.status === "warning" ? "!" : "✗";
    console.log(`  ${icon} ${c.check}: ${c.detail}`);
    if (c.suggestion) {
      console.log(`    → ${c.suggestion}`);
    }
  }
}
