// ─── Deps Command ────────────────────────────────────────────────────────────
// Analyze project dependencies for supply-chain risks and vulnerabilities.
//
// Usage:
//   judges deps .                              # analyze current directory
//   judges deps --file package.json            # analyze specific manifest
//   judges deps /path/to/project --format json # JSON output
// ──────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join, basename } from "path";
import { analyzeDependencies } from "../evaluators/index.js";
import type { DependencyVerdict } from "../types.js";

const MANIFEST_FILES = new Set([
  "package.json",
  "requirements.txt",
  "Pipfile",
  "pyproject.toml",
  "Gemfile",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "pubspec.yaml",
]);

// ─── CLI Entry Point ────────────────────────────────────────────────────────

export function parseDepsArgs(argv: string[]): { path: string; format: string } {
  let path = ".";
  let format = "text";

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        path = argv[++i];
        break;
      case "--format":
      case "-o":
        format = argv[++i];
        break;
      default:
        if (!arg.startsWith("-")) path = arg;
        break;
    }
  }

  return { path, format };
}

function discoverManifests(dirPath: string): string[] {
  const abs = resolve(dirPath);
  if (!existsSync(abs)) return [];

  // If it's a file, return it directly
  try {
    const entries = readdirSync(abs, { withFileTypes: true });
    const manifests: string[] = [];
    for (const entry of entries) {
      if (entry.isFile() && MANIFEST_FILES.has(entry.name)) {
        manifests.push(join(abs, entry.name));
      }
    }
    return manifests;
  } catch {
    // Not a directory — treat as a single file
    if (existsSync(abs)) return [abs];
    return [];
  }
}

export function runDeps(argv: string[]): void {
  const args = parseDepsArgs(argv);
  const manifests = discoverManifests(args.path);

  if (manifests.length === 0) {
    console.error(`No dependency manifest files found in: ${resolve(args.path)}`);
    console.error(`Supported: ${[...MANIFEST_FILES].join(", ")}`);
    process.exit(1);
  }

  const allVerdicts: Array<{ file: string; verdict: DependencyVerdict }> = [];
  let totalFindings = 0;
  let worstScore = 100;

  for (const manifest of manifests) {
    const content = readFileSync(manifest, "utf-8");
    const verdict = analyzeDependencies(content, basename(manifest));
    totalFindings += verdict.findings.length;
    if (verdict.score < worstScore) worstScore = verdict.score;
    allVerdicts.push({ file: manifest, verdict });
  }

  if (args.format === "json") {
    console.log(
      JSON.stringify(
        {
          manifests: allVerdicts.map((v) => ({
            file: v.file,
            totalDependencies: v.verdict.totalDependencies,
            findings: v.verdict.findings,
            score: v.verdict.score,
            verdict: v.verdict.verdict,
            summary: v.verdict.summary,
          })),
          totalFindings,
          worstScore,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║          Judges Panel — Dependency Analysis                  ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");

    for (const { file, verdict } of allVerdicts) {
      const icon = verdict.verdict === "pass" ? "✅" : verdict.verdict === "warning" ? "⚠️ " : "❌";
      console.log(`  ${icon} ${file}`);
      console.log(`     ${verdict.totalDependencies} dependencies, score ${verdict.score}/100`);
      for (const f of verdict.findings) {
        console.log(`     [${f.severity.toUpperCase().padEnd(8)}] ${f.ruleId}: ${f.title}`);
      }
      console.log("");
    }

    console.log(
      `  Total: ${totalFindings} finding(s) across ${allVerdicts.length} manifest(s), worst score: ${worstScore}/100`,
    );
    console.log("");
  }

  process.exit(totalFindings > 0 && worstScore < 50 ? 1 : 0);
}
