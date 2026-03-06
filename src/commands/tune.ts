/**
 * `judges tune` — Analyze your project and suggest optimal .judgesrc.json configuration.
 *
 * Runs an initial evaluation on a sample of project files, then recommends:
 * - Which preset best fits your project
 * - Rules to disable based on consistent FP patterns
 * - Severity overrides for noisy rules
 * - Framework-specific settings
 *
 * Usage:
 *   judges tune                        # Analyze current directory
 *   judges tune --dir ./src            # Analyze specific directory
 *   judges tune --apply                # Write .judgesrc.json automatically
 *   judges tune --max-files 20         # Limit sample size
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { resolve, extname, join } from "path";
import { evaluateWithTribunal } from "../evaluators/index.js";
import { PRESETS } from "../presets.js";
import type { Finding, JudgesConfig, RuleOverride, Severity } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TuneArgs {
  dir: string;
  apply: boolean;
  maxFiles: number;
  verbose: boolean;
}

interface FrameworkSignal {
  framework: string;
  preset: string;
  confidence: number;
}

interface TuneRecommendation {
  preset: string | undefined;
  detectedFramework: string | undefined;
  disabledRules: string[];
  severityOverrides: Record<string, RuleOverride>;
  disabledJudges: string[];
  statsMessage: string;
  config: JudgesConfig;
}

// ─── Language Detection ─────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".cs": "csharp",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".tf": "terraform",
  ".hcl": "terraform",
  ".bicep": "bicep",
  ".sh": "bash",
};

function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath.toLowerCase());
  if (filePath.toLowerCase().includes("dockerfile")) return "dockerfile";
  return EXT_TO_LANG[ext];
}

// ─── Framework Detection ────────────────────────────────────────────────────

function detectFramework(dir: string): FrameworkSignal | undefined {
  const signals: FrameworkSignal[] = [];

  // Check package.json for JS/TS frameworks
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps["next"]) signals.push({ framework: "Next.js", preset: "nextjs", confidence: 0.95 });
      if (deps["react"] && !deps["next"]) signals.push({ framework: "React", preset: "react", confidence: 0.9 });
      if (deps["express"]) signals.push({ framework: "Express", preset: "express", confidence: 0.9 });
      if (deps["fastify"]) signals.push({ framework: "Express", preset: "express", confidence: 0.8 });
      if (deps["koa"]) signals.push({ framework: "Express", preset: "express", confidence: 0.7 });
    } catch {
      // Invalid package.json
    }
  }

  // Check for Python frameworks
  const reqPath = join(dir, "requirements.txt");
  const pyprojectPath = join(dir, "pyproject.toml");
  const pipfilePath = join(dir, "Pipfile");

  const pythonManifests = [reqPath, pyprojectPath, pipfilePath].filter(existsSync);
  for (const manifest of pythonManifests) {
    try {
      const content = readFileSync(manifest, "utf-8").toLowerCase();
      if (content.includes("fastapi")) signals.push({ framework: "FastAPI", preset: "fastapi", confidence: 0.9 });
      if (content.includes("django")) signals.push({ framework: "Django", preset: "django", confidence: 0.9 });
      if (content.includes("flask")) signals.push({ framework: "FastAPI", preset: "fastapi", confidence: 0.7 });
    } catch {
      // ignore
    }
  }

  // Check for Java frameworks
  const pomPath = join(dir, "pom.xml");
  const gradlePath = join(dir, "build.gradle");
  const gradleKtsPath = join(dir, "build.gradle.kts");

  for (const manifest of [pomPath, gradlePath, gradleKtsPath].filter(existsSync)) {
    try {
      const content = readFileSync(manifest, "utf-8").toLowerCase();
      if (content.includes("spring-boot") || content.includes("spring.boot"))
        signals.push({ framework: "Spring Boot", preset: "spring-boot", confidence: 0.9 });
    } catch {
      // ignore
    }
  }

  // Check for Ruby frameworks
  const gemfilePath = join(dir, "Gemfile");
  if (existsSync(gemfilePath)) {
    try {
      const content = readFileSync(gemfilePath, "utf-8").toLowerCase();
      if (content.includes("rails")) signals.push({ framework: "Rails", preset: "rails", confidence: 0.9 });
    } catch {
      // ignore
    }
  }

  // Check for Terraform
  const hasTfFiles = existsSync(dir) && readdirSync(dir).some((f) => f.endsWith(".tf"));
  if (hasTfFiles) signals.push({ framework: "Terraform", preset: "terraform", confidence: 0.85 });

  // Check for Kubernetes
  const hasK8sFiles =
    existsSync(dir) &&
    readdirSync(dir).some((f) => {
      if (!f.endsWith(".yaml") && !f.endsWith(".yml")) return false;
      try {
        const content = readFileSync(join(dir, f), "utf-8");
        return /apiVersion:\s/.test(content) && /kind:\s/.test(content);
      } catch {
        return false;
      }
    });
  if (hasK8sFiles) signals.push({ framework: "Kubernetes", preset: "kubernetes", confidence: 0.8 });

  // Return highest confidence signal
  signals.sort((a, b) => b.confidence - a.confidence);
  return signals[0];
}

// ─── File Collection ────────────────────────────────────────────────────────

function collectSampleFiles(dir: string, maxFiles: number): Array<{ path: string; content: string; lang: string }> {
  const files: Array<{ path: string; content: string; lang: string }> = [];
  const skipDirs = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    ".venv",
    "venv",
    "target",
    "bin",
    "obj",
    "vendor",
    ".terraform",
  ]);

  function walk(dirPath: string, depth: number): void {
    if (depth > 5 || files.length >= maxFiles) return;

    try {
      const entries = readdirSync(dirPath);
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.startsWith(".")) continue;
        if (skipDirs.has(entry)) continue;

        const fullPath = join(dirPath, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (stat.isFile() && stat.size < 100_000) {
            const lang = detectLanguage(fullPath);
            if (lang) {
              try {
                const content = readFileSync(fullPath, "utf-8");
                if (content.trim().length > 10) {
                  files.push({ path: fullPath, content, lang });
                }
              } catch {
                // Binary file or read error
              }
            }
          }
        } catch {
          // Permission error
        }
      }
    } catch {
      // Can't read directory
    }
  }

  walk(dir, 0);
  return files;
}

// ─── Analysis & Recommendation ──────────────────────────────────────────────

function analyzeFindings(
  allFindings: Array<{ file: string; finding: Finding }>,
  totalFiles: number,
): TuneRecommendation {
  const ruleCount: Record<string, number> = {};
  const judgeCount: Record<string, number> = {};
  const ruleSeverity: Record<string, Severity[]> = {};

  for (const { finding } of allFindings) {
    ruleCount[finding.ruleId] = (ruleCount[finding.ruleId] || 0) + 1;
    ruleSeverity[finding.ruleId] = ruleSeverity[finding.ruleId] || [];
    ruleSeverity[finding.ruleId].push(finding.severity);

    // Extract judge name from ruleId (e.g., "SEC-001" → "security")
    const parts = finding.ruleId.split("-");
    if (parts.length > 1) {
      const judgePrefix = parts[0];
      judgeCount[judgePrefix] = (judgeCount[judgePrefix] || 0) + 1;
    }
  }

  // Identify rules that fire on >50% of files (likely FP or style preference)
  const disabledRules: string[] = [];
  const severityOverrides: Record<string, RuleOverride> = {};
  const threshold = Math.max(totalFiles * 0.5, 3);

  for (const [ruleId, count] of Object.entries(ruleCount)) {
    if (count >= threshold) {
      // If it fires on >80% of files, disable it entirely
      if (count >= totalFiles * 0.8) {
        disabledRules.push(ruleId);
      } else {
        // Downgrade to info
        severityOverrides[ruleId] = { severity: "info" };
      }
    }
  }

  // Identify judges with very low signal (many findings but all low/info)
  const disabledJudges: string[] = [];

  const statsMessage = `Analyzed ${totalFiles} files, found ${allFindings.length} findings across ${Object.keys(ruleCount).length} rules`;

  const config: JudgesConfig = {};
  if (disabledRules.length > 0) config.disabledRules = disabledRules;
  if (Object.keys(severityOverrides).length > 0) config.ruleOverrides = severityOverrides;
  if (disabledJudges.length > 0) config.disabledJudges = disabledJudges;

  return {
    preset: undefined,
    detectedFramework: undefined,
    disabledRules,
    severityOverrides,
    disabledJudges,
    statsMessage,
    config,
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function parseTuneArgs(argv: string[]): TuneArgs {
  const args: TuneArgs = {
    dir: process.cwd(),
    apply: false,
    maxFiles: 15,
    verbose: false,
  };

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--dir":
      case "-d":
        args.dir = resolve(argv[++i]);
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--max-files":
        args.maxFiles = parseInt(argv[++i], 10);
        break;
      case "--verbose":
      case "-v":
        args.verbose = true;
        break;
      default:
        if (!arg.startsWith("-")) {
          args.dir = resolve(arg);
        }
        break;
    }
  }

  return args;
}

export function runTune(argv: string[]): void {
  const args = parseTuneArgs(argv);

  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║              Judges Panel — Tune                            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Analyzing: ${args.dir}`);
  console.log(`  Sample size: up to ${args.maxFiles} files`);
  console.log("");

  // 1. Detect framework
  const framework = detectFramework(args.dir);
  if (framework) {
    console.log(
      `  🔍 Detected framework: ${framework.framework} (confidence: ${Math.round(framework.confidence * 100)}%)`,
    );
    console.log(`     Recommended preset: ${framework.preset}`);
  } else {
    console.log("  🔍 No specific framework detected");
  }
  console.log("");

  // 2. Collect sample files
  const files = collectSampleFiles(args.dir, args.maxFiles);
  if (files.length === 0) {
    console.log("  ⚠️  No source files found to analyze.");
    process.exit(0);
  }
  console.log(`  📂 Found ${files.length} files to analyze`);

  // 3. Run evaluation on sample
  console.log("  ⏳ Running evaluation...");
  const allFindings: Array<{ file: string; finding: Finding }> = [];

  for (const file of files) {
    try {
      const result = evaluateWithTribunal(file.content, file.lang);
      for (const finding of result.findings) {
        allFindings.push({ file: file.path, finding });
      }
    } catch {
      // Skip files that fail evaluation
    }
  }

  console.log(`  ✅ Found ${allFindings.length} findings`);
  console.log("");

  // 4. Generate recommendations
  const rec = analyzeFindings(allFindings, files.length);
  rec.detectedFramework = framework?.framework;
  rec.preset = framework?.preset;

  // Merge framework preset config
  if (rec.preset && PRESETS[rec.preset]) {
    const presetConfig = PRESETS[rec.preset].config;
    rec.config = {
      preset: rec.preset,
      ...rec.config,
      disabledJudges: [...new Set([...(presetConfig.disabledJudges || []), ...(rec.config.disabledJudges || [])])],
    };
  }

  // 5. Display recommendations
  console.log("  ─── Recommendations ───────────────────────────────────────");
  console.log("");
  console.log(`  ${rec.statsMessage}`);
  console.log("");

  if (rec.preset) {
    console.log(`  📋 Preset: "${rec.preset}"`);
  }

  if (rec.disabledRules.length > 0) {
    console.log(`  🔇 Disable noisy rules (fire on >80% of files):`);
    for (const rule of rec.disabledRules) {
      console.log(`     - ${rule}`);
    }
  }

  if (Object.keys(rec.severityOverrides).length > 0) {
    console.log(`  📉 Downgrade rules to info (fire on >50% of files):`);
    for (const [rule, override] of Object.entries(rec.severityOverrides)) {
      console.log(`     - ${rule} → ${override.severity ?? "info"}`);
    }
  }

  if ((rec.config.disabledJudges || []).length > 0) {
    console.log(`  ⏭️  Disabled judges (from preset + analysis):`);
    for (const judge of rec.config.disabledJudges || []) {
      console.log(`     - ${judge}`);
    }
  }

  console.log("");

  // 6. Build final .judgesrc.json
  const judgesrc: Record<string, unknown> = {};
  if (rec.config.preset) judgesrc.preset = rec.config.preset;
  if ((rec.config.disabledRules || []).length > 0) judgesrc.disabledRules = rec.config.disabledRules;
  if (Object.keys(rec.config.ruleOverrides || {}).length > 0) judgesrc.ruleOverrides = rec.config.ruleOverrides;
  if ((rec.config.disabledJudges || []).length > 0) judgesrc.disabledJudges = rec.config.disabledJudges;
  if ((rec.config.languages || []).length > 0) judgesrc.languages = rec.config.languages;

  const configJson = JSON.stringify(judgesrc, null, 2);

  console.log("  📄 Recommended .judgesrc.json:");
  console.log("");
  for (const line of configJson.split("\n")) {
    console.log(`     ${line}`);
  }
  console.log("");

  if (args.apply) {
    const outputPath = join(args.dir, ".judgesrc.json");
    if (existsSync(outputPath)) {
      console.log(`  ⚠️  ${outputPath} already exists — writing to .judgesrc.tuned.json instead`);
      writeFileSync(join(args.dir, ".judgesrc.tuned.json"), configJson + "\n", "utf-8");
      console.log(`  ✅ Written to ${join(args.dir, ".judgesrc.tuned.json")}`);
    } else {
      writeFileSync(outputPath, configJson + "\n", "utf-8");
      console.log(`  ✅ Written to ${outputPath}`);
    }
  } else {
    console.log("  💡 Run `judges tune --apply` to write this config automatically.");
  }

  console.log("");
}
