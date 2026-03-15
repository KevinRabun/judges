/**
 * Review-language-profile — Analyze review findings distribution by language.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LanguageStat {
  language: string;
  fileCount: number;
  findingCount: number;
  avgFindings: number;
  topRules: string[];
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewLanguageProfile(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : ".judges/reports";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-language-profile — Analyze findings by language

Usage:
  judges review-language-profile [--dir <path>] [--format table|json]

Options:
  --dir <path>     Reports directory (default: .judges/reports)
  --format <fmt>   Output format: table (default), json
  --help, -h       Show this help
`);
    return;
  }

  if (!existsSync(dir)) {
    console.log(`Reports directory not found: ${dir}`);
    console.log("Run reviews first to generate report data.");
    return;
  }

  const files = (readdirSync(dir) as unknown as string[]).filter((f: string) => f.endsWith(".json"));
  const langMap: Record<string, { files: number; findings: number; rules: Record<string, number> }> = {};

  for (const file of files) {
    const content = JSON.parse(readFileSync(join(dir, file), "utf-8")) as {
      language?: string;
      findings?: { ruleId: string }[];
    };

    const lang = content.language ?? "unknown";
    if (langMap[lang] === undefined) {
      langMap[lang] = { files: 0, findings: 0, rules: {} };
    }

    langMap[lang].files++;
    const findings = content.findings ?? [];
    langMap[lang].findings += findings.length;

    for (const f of findings) {
      langMap[lang].rules[f.ruleId] = (langMap[lang].rules[f.ruleId] ?? 0) + 1;
    }
  }

  const stats: LanguageStat[] = Object.entries(langMap).map(([language, data]) => {
    const sortedRules = Object.entries(data.rules)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([rule]) => rule);

    return {
      language,
      fileCount: data.files,
      findingCount: data.findings,
      avgFindings: data.files > 0 ? Math.round((data.findings / data.files) * 10) / 10 : 0,
      topRules: sortedRules,
    };
  });

  stats.sort((a, b) => b.findingCount - a.findingCount);

  if (format === "json") {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(`\nLanguage Profile`);
  console.log("═".repeat(70));
  console.log(`  ${"Language".padEnd(15)} ${"Files".padEnd(8)} ${"Findings".padEnd(10)} ${"Avg".padEnd(8)} Top Rules`);
  console.log("  " + "─".repeat(65));

  for (const s of stats) {
    console.log(
      `  ${s.language.padEnd(15)} ${String(s.fileCount).padEnd(8)} ${String(s.findingCount).padEnd(10)} ${String(s.avgFindings).padEnd(8)} ${s.topRules.join(", ")}`,
    );
  }

  console.log("═".repeat(70));
}
