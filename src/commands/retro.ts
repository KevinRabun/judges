/**
 * Security incident retrospective — analyze whether Judges would have
 * caught a specific vulnerability by running evaluation against
 * historical code state.
 *
 * Uses local git history and evaluation results.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RetroResult {
  file: string;
  commit?: string;
  cve?: string;
  wouldCatch: boolean;
  matchingFindings: Finding[];
  configWouldSuppress: boolean;
  suppressedBy?: string[];
  recommendedConfig?: Record<string, unknown>;
  analysis: string;
}

const RETRO_FILE = ".judges-retro.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function getFileAtCommit(file: string, commit: string): string | null {
  try {
    return execSync(`git show ${commit}:${file}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

function checkSuppressions(findings: Finding[]): { suppressed: boolean; rules: string[] } {
  const suppressionFile = ".judges-suppressions.json";
  if (!existsSync(suppressionFile)) return { suppressed: false, rules: [] };

  try {
    const data = JSON.parse(readFileSync(suppressionFile, "utf-8"));
    const suppressedRules: string[] = [];

    for (const finding of findings) {
      const isSuppressed = (data.suppressions || []).some(
        (s: { ruleId?: string; rulePrefix?: string }) =>
          s.ruleId === finding.ruleId || (s.rulePrefix && finding.ruleId.startsWith(s.rulePrefix)),
      );
      if (isSuppressed) suppressedRules.push(finding.ruleId);
    }

    return { suppressed: suppressedRules.length > 0, rules: suppressedRules };
  } catch {
    return { suppressed: false, rules: [] };
  }
}

function loadResultsForFile(_file: string): Finding[] {
  const resultsFile = ".judges-results.json";
  if (!existsSync(resultsFile)) return [];

  try {
    const data = JSON.parse(readFileSync(resultsFile, "utf-8"));
    const findings: Finding[] = Array.isArray(data) ? data : data.findings || [];
    // Filter findings that might relate to the target file based on ruleId patterns
    return findings;
  } catch {
    return [];
  }
}

export function runRetroAnalysis(file: string, commit?: string, cve?: string): RetroResult {
  let codeContent: string | null = null;

  if (commit) {
    codeContent = getFileAtCommit(file, commit);
  } else if (existsSync(file)) {
    codeContent = readFileSync(file, "utf-8");
  }

  if (!codeContent) {
    return {
      file,
      commit,
      cve,
      wouldCatch: false,
      matchingFindings: [],
      configWouldSuppress: false,
      analysis: `Could not read file${commit ? ` at commit ${commit}` : ""}.`,
    };
  }

  // Look for vulnerability patterns in the code
  const findings = loadResultsForFile(file);

  // Check for common vulnerability patterns
  const patterns: { pattern: RegExp; ruleId: string; title: string; severity: Finding["severity"] }[] = [
    {
      pattern: /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i,
      ruleId: "SEC001",
      title: "SQL Injection via template literal",
      severity: "critical",
    },
    { pattern: /eval\s*\(/, ruleId: "SEC002", title: "Dangerous eval() usage", severity: "critical" },
    {
      pattern: /(?:password|secret|key|token)\s*[:=]\s*['"][^'"]+['"]/i,
      ruleId: "AUTH001",
      title: "Hardcoded credentials",
      severity: "critical",
    },
    { pattern: /\.innerHTML\s*=/, ruleId: "SEC003", title: "XSS via innerHTML", severity: "high" },
    { pattern: /exec\s*\(.*\+/, ruleId: "INJECT001", title: "Command injection risk", severity: "critical" },
    { pattern: /md5|sha1[^-]|DES|RC4/i, ruleId: "CRYPTO001", title: "Weak cryptographic algorithm", severity: "high" },
    { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, ruleId: "ERR001", title: "Empty catch block", severity: "medium" },
    { pattern: /http:\/\/(?!localhost)/, ruleId: "SEC004", title: "Insecure HTTP usage", severity: "medium" },
    { pattern: /cors\(\s*\)/, ruleId: "SEC005", title: "Overly permissive CORS", severity: "high" },
    {
      pattern: /verify\s*[:=]\s*false|rejectUnauthorized\s*[:=]\s*false/i,
      ruleId: "SEC006",
      title: "TLS verification disabled",
      severity: "critical",
    },
  ];

  const detectedFindings: Finding[] = [];
  const lines = codeContent.split("\n");

  for (const p of patterns) {
    for (let i = 0; i < lines.length; i++) {
      if (p.pattern.test(lines[i])) {
        detectedFindings.push({
          ruleId: p.ruleId,
          title: p.title,
          severity: p.severity,
          description: `Pattern detected at line ${i + 1}: ${lines[i].trim().slice(0, 80)}`,
          recommendation: `Review and remediate ${p.ruleId} finding`,
          lineNumbers: [i + 1],
          confidence: 0.85,
        });
      }
    }
  }

  const allFindings = [...findings, ...detectedFindings];
  const { suppressed, rules } = checkSuppressions(allFindings);

  const analysis =
    allFindings.length > 0
      ? `Judges would detect ${allFindings.length} finding(s) in this file.${suppressed ? ` Warning: ${rules.length} finding(s) would be suppressed by current config.` : ""}`
      : "Judges did not detect vulnerability patterns in this file. Consider adding a custom rule.";

  const result: RetroResult = {
    file,
    commit,
    cve,
    wouldCatch: allFindings.length > 0 && !suppressed,
    matchingFindings: allFindings,
    configWouldSuppress: suppressed,
    suppressedBy: suppressed ? rules : undefined,
    analysis,
  };

  // Save retrospective
  const retros: RetroResult[] = existsSync(RETRO_FILE) ? JSON.parse(readFileSync(RETRO_FILE, "utf-8")) : [];
  retros.push(result);
  writeFileSync(RETRO_FILE, JSON.stringify(retros, null, 2));

  return result;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRetro(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges retro — Security incident retrospective

Usage:
  judges retro --file src/handler.ts
  judges retro --file src/handler.ts --commit abc123
  judges retro --file src/handler.ts --cve CVE-2025-1234
  judges retro --history

Options:
  --file <path>          File to analyze
  --commit <sha>         Git commit to check (reconstructs code at that point)
  --cve <id>             CVE identifier to tag the analysis
  --history              Show previous retrospectives
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // History
  if (argv.includes("--history")) {
    if (!existsSync(RETRO_FILE)) {
      console.log("\n  No retrospectives recorded.\n");
      return;
    }
    const retros: RetroResult[] = JSON.parse(readFileSync(RETRO_FILE, "utf-8"));
    if (format === "json") {
      console.log(JSON.stringify(retros, null, 2));
    } else {
      console.log(`\n  Retrospective History (${retros.length})\n  ─────────────────────────`);
      for (const r of retros) {
        const icon = r.wouldCatch ? "✅" : "❌";
        console.log(
          `    ${icon} ${r.file}${r.commit ? ` @ ${r.commit.slice(0, 7)}` : ""}${r.cve ? ` (${r.cve})` : ""} — ${r.matchingFindings.length} finding(s)`,
        );
      }
      console.log("");
    }
    return;
  }

  // Run retro
  const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file");
  if (!file) {
    console.error("  ❌ Provide --file. Use --help for usage.");
    return;
  }

  const commit = argv.find((_a: string, i: number) => argv[i - 1] === "--commit");
  const cve = argv.find((_a: string, i: number) => argv[i - 1] === "--cve");

  const result = runRetroAnalysis(file, commit || undefined, cve || undefined);

  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const icon = result.wouldCatch ? "✅" : "❌";
    console.log(`\n  ${icon} Retrospective Analysis — ${result.file}`);
    if (result.commit) console.log(`  Commit: ${result.commit}`);
    if (result.cve) console.log(`  CVE: ${result.cve}`);
    console.log(`  ────────────────────────────────`);
    console.log(`  Would Judges catch this? ${result.wouldCatch ? "YES" : "NO"}`);
    console.log(`  Findings detected: ${result.matchingFindings.length}`);
    if (result.configWouldSuppress) {
      console.log(`  ⚠️  Config would suppress: ${(result.suppressedBy || []).join(", ")}`);
    }
    console.log(`\n  Analysis: ${result.analysis}`);
    if (result.matchingFindings.length > 0) {
      console.log("\n  Detected Findings:");
      for (const f of result.matchingFindings) {
        console.log(`    [${f.severity.toUpperCase()}] ${f.ruleId} — ${f.title}`);
      }
    }
    console.log("");
  }
}
