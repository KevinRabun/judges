#!/usr/bin/env tsx

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { execFileSync } from "child_process";

type FindingEntry = {
  index: number;
  severity: string;
  ruleId: string;
  title: string;
  filePath: string;
  lines: number[];
  description: string;
  recommendation: string;
};

type Verdict = "likely-true-positive" | "likely-false-positive";

type Triage = {
  finding: FindingEntry;
  verdict: Verdict;
  confidence: number;
  reason: string;
  tuning: string;
};

function parseLineNumbers(text: string): number[] {
  return text
    .split(",")
    .map((token) => Number.parseInt(token.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

function parseFindings(report: string): FindingEntry[] {
  const lines = report.split("\n");
  const findings: FindingEntry[] = [];

  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(/^### \[([A-Z]+)\] ([A-Z0-9-]+) — (.+)$/);
    if (!header) continue;

    const severity = header[1];
    const ruleId = header[2];
    const title = header[3];

    const fileLine = lines[i + 1] ?? "";
    const fileMatch = fileLine.match(/^- File: `([^`]+)`(?: \(lines ([^)]+)\))?/);
    if (!fileMatch) continue;

    const filePath = fileMatch[1];
    const parsedLines = fileMatch[2] ? parseLineNumbers(fileMatch[2]) : [];

    const description = (lines[i + 2] ?? "").replace(/^- Description:\s*/, "");
    const recommendation = (lines[i + 3] ?? "").replace(/^- Recommendation:\s*/, "");

    index += 1;
    findings.push({
      index,
      severity,
      ruleId,
      title,
      filePath,
      lines: parsedLines,
      description,
      recommendation,
    });
  }

  return findings;
}

function getLineContext(fileContent: string, targetLines: number[]): string {
  if (targetLines.length === 0) return fileContent.slice(0, 2000);

  const rows = fileContent.split("\n");
  const snippets: string[] = [];

  for (const line of targetLines.slice(0, 8)) {
    const start = Math.max(0, line - 3);
    const end = Math.min(rows.length - 1, line + 2);
    for (let i = start; i <= end; i += 1) {
      snippets.push(`${i + 1}: ${rows[i]}`);
    }
    snippets.push("---");
  }

  return snippets.join("\n");
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function isLikelyNonProdPath(filePath: string): boolean {
  return includesAny(filePath, [
    /(^|\/)(test|tests|__tests__|spec|specs|e2e)(\/|\.|$)/i,
    /\.([a-z0-9_-]*\.)?(test|tests|spec|specs|e2e)\.[a-z0-9]+$/i,
    /mock/i,
    /fixture/i,
    /(^|\/)docs(\/|$)/i,
  ]);
}

function classifyFinding(finding: FindingEntry, context: string): Omit<Triage, "finding"> {
  const filePath = finding.filePath;
  const text = `${finding.title}\n${finding.description}\n${context}`.toLowerCase();
  const nonProdPath = isLikelyNonProdPath(filePath);

  const hasPlaceholder = includesAny(text, [
    /\b(test|mock|dummy|sample|example|placeholder|changeme|replace_me|fake|not_used|unused)\b/i,
  ]);

  if (/^AUTH-/.test(finding.ruleId) && /weak hashing algorithm/.test(finding.title.toLowerCase())) {
    const passwordContext = includesAny(text, [/password|passwd|pwd|credential|login|auth/i]);
    if (!passwordContext) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.83,
        reason: "Hash usage appears unrelated to password storage/authentication.",
        tuning: "Require password/auth context within ±5 lines before raising critical severity.",
      };
    }
    return {
      verdict: "likely-true-positive",
      confidence: 0.74,
      reason: "Weak hash appears in authentication-related context.",
      tuning: "No tuning required for this case.",
    };
  }

  if ((/^AUTH-/.test(finding.ruleId) && /hardcoded credentials/.test(finding.title.toLowerCase())) ||
      (/^CFG-/.test(finding.ruleId) && /hardcoded secrets/.test(finding.title.toLowerCase())) ||
      (/^DATA-/.test(finding.ruleId) && /hardcoded/.test(finding.title.toLowerCase()))) {
    if (nonProdPath || hasPlaceholder) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.86,
        reason: "Secret-like value appears in test/mock/docs or placeholder-style context.",
        tuning: "Add path-based suppression for tests/mocks/fixtures and placeholder-value filtering.",
      };
    }
    return {
      verdict: "likely-true-positive",
      confidence: 0.82,
      reason: "Secret/credential likely embedded in non-test code path.",
      tuning: "No tuning required for this case.",
    };
  }

  if (/^COMP-/.test(finding.ruleId)) {
    if (nonProdPath) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.84,
        reason: "Compliance trigger appears in docs/util/test-like path.",
        tuning: "Require runtime data-flow indicators and ignore docs/tests by default.",
      };
    }
    const looksLikeRealSensitiveLog = includesAny(text, [/console\.|logger\.|log\.|token|authorization|password|ssn|credit.?card/i]);
    if (looksLikeRealSensitiveLog) {
      return {
        verdict: "likely-true-positive",
        confidence: 0.7,
        reason: "Sensitive-data handling/logging patterns appear in runtime code.",
        tuning: "No tuning required for this case.",
      };
    }
    return {
      verdict: "likely-false-positive",
      confidence: 0.66,
      reason: "Compliance keyword matched without strong runtime handling evidence.",
      tuning: "Require stronger sink/source correlation.",
    };
  }

  if (/^CONC-/.test(finding.ruleId)) {
    const hasLockPattern = includesAny(text, [/lock|mutex|synchronized|rwlock|monitor/i]);
    if (!hasLockPattern) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.88,
        reason: "Deadlock finding without clear lock primitive context.",
        tuning: "Require at least two lock acquisitions in same control-flow block.",
      };
    }
    return {
      verdict: "likely-true-positive",
      confidence: 0.68,
      reason: "Nested lock/mutex patterns are present and may deadlock.",
      tuning: "No tuning required for this case.",
    };
  }

  if (/^CYBER-/.test(finding.ruleId)) {
    const hasExecPattern = includesAny(text, [/\beval\b|exec\(|runtime\.getruntime\(|os\.system|process\.start/i]);
    if (!hasExecPattern || nonProdPath) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.8,
        reason: "Injection finding appears without concrete dangerous sink in runtime path.",
        tuning: "Require explicit dangerous sink + untrusted input source.",
      };
    }
    return {
      verdict: "likely-true-positive",
      confidence: 0.79,
      reason: "Dangerous execution primitive appears with plausible runtime use.",
      tuning: "No tuning required for this case.",
    };
  }

  if (/^DB-/.test(finding.ruleId)) {
    const hasSqlConcat = includesAny(text, [/select|insert|update|delete/i]) && includesAny(text, [/\+\s*\w|template|sprintf|format\(/i]);
    if (hasSqlConcat) {
      return {
        verdict: "likely-true-positive",
        confidence: 0.85,
        reason: "SQL construction pattern is consistent with injection risk.",
        tuning: "No tuning required for this case.",
      };
    }
    return {
      verdict: "likely-false-positive",
      confidence: 0.69,
      reason: "SQL injection heuristic matched but query concatenation evidence is weak.",
      tuning: "Require dynamic user input participation in SQL string expression.",
    };
  }

  if (/^ETHICS-/.test(finding.ruleId)) {
    const hasProtectedAttributeLogic = includesAny(text, [/race|gender|sex|ethnic|religion|age|nationality|disab/i]);
    if (!hasProtectedAttributeLogic || nonProdPath) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.81,
        reason: "Protected-attribute heuristic likely matched incidental strings.",
        tuning: "Require protected-attribute term AND conditional operator in executable code.",
      };
    }
    return {
      verdict: "likely-true-positive",
      confidence: 0.62,
      reason: "Demographic/protected attribute appears in branching logic context.",
      tuning: "No tuning required for this case.",
    };
  }

  if (/^LOGPRIV-|^OBS-/.test(finding.ruleId)) {
    const hasLog = includesAny(text, [/console\.|logger\.|log\.|print\(/i]);
    const hasSensitive = includesAny(text, [/token|authorization|password|secret|ssn|credit.?card/i]);
    if (hasLog && hasSensitive && !nonProdPath) {
      return {
        verdict: "likely-true-positive",
        confidence: 0.78,
        reason: "Sensitive fields appear in log context in runtime code.",
        tuning: "No tuning required for this case.",
      };
    }
    return {
      verdict: "likely-false-positive",
      confidence: 0.75,
      reason: "Sensitive logging alert appears in non-prod/example context.",
      tuning: "Require concrete log sink with sensitive variable usage.",
    };
  }

  if (/^PERF-/.test(finding.ruleId)) {
    const hasLoop = includesAny(text, [/for\s*\(|while\s*\(|for\s+\w+\s+in/i]);
    const hasQuery = includesAny(text, [/query|select|db\.|find\(|fetch\(/i]);
    if (!(hasLoop && hasQuery)) {
      return {
        verdict: "likely-false-positive",
        confidence: 0.8,
        reason: "N+1 pattern flagged without clear loop + query coupling.",
        tuning: "Require loop and DB/API query invocation in same function block.",
      };
    }
    return {
      verdict: "likely-true-positive",
      confidence: 0.67,
      reason: "Loop plus query pattern is present; N+1 risk plausible.",
      tuning: "No tuning required for this case.",
    };
  }

  return {
    verdict: nonProdPath ? "likely-false-positive" : "likely-true-positive",
    confidence: nonProdPath ? 0.62 : 0.6,
    reason: nonProdPath
      ? "Appears in non-production/test/docs style path."
      : "No strong disqualifier found from local context.",
    tuning: nonProdPath
      ? "Add test/docs/example path suppression for this rule family or downgrade severity."
      : "No specific tuning recommendation from this sample.",
  };
}

function summarize(triage: Triage[]): string {
  const tp = triage.filter((entry) => entry.verdict === "likely-true-positive");
  const fp = triage.filter((entry) => entry.verdict === "likely-false-positive");

  const byRule = new Map<string, { tp: number; fp: number }>();
  for (const entry of triage) {
    const bucket = byRule.get(entry.finding.ruleId) ?? { tp: 0, fp: 0 };
    if (entry.verdict === "likely-true-positive") bucket.tp += 1;
    else bucket.fp += 1;
    byRule.set(entry.finding.ruleId, bucket);
  }

  let md = "# Findings Triage Report\n\n";
  md += `- Total reviewed findings: **${triage.length}**\n`;
  md += `- Likely true positives: **${tp.length}**\n`;
  md += `- Likely false positives: **${fp.length}**\n\n`;

  md += "## By Rule\n\n";
  md += "| Rule | Likely TP | Likely FP |\n";
  md += "|---|---:|---:|\n";
  for (const [ruleId, counts] of [...byRule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| ${ruleId} | ${counts.tp} | ${counts.fp} |\n`;
  }
  md += "\n";

  md += "## Per-Finding Review\n\n";
  for (const entry of triage) {
    md += `### #${entry.finding.index} [${entry.finding.severity}] ${entry.finding.ruleId} — ${entry.finding.title}\n`;
    md += `- File: \`${entry.finding.filePath}\`${entry.finding.lines.length > 0 ? ` (lines ${entry.finding.lines.join(", ")})` : ""}\n`;
    md += `- Verdict: **${entry.verdict.toUpperCase()}** (confidence ${Math.round(entry.confidence * 100)}%)\n`;
    md += `- Why: ${entry.reason}\n`;
    md += `- Tuning: ${entry.tuning}\n\n`;
  }

  return md;
}

function main() {
  const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const repoUrlArg = process.argv.find((arg) => arg.startsWith("--repoUrl="));

  if (!reportArg) {
    throw new Error("Missing required --report=<path>");
  }

  const reportPath = resolve(reportArg.slice("--report=".length));
  const report = readFileSync(reportPath, "utf8");

  const commitMatch = report.match(/at commit `([a-f0-9]{40})`/i);
  if (!commitMatch) {
    throw new Error("Unable to find commit SHA in report header.");
  }

  const commit = commitMatch[1];
  const findings = parseFindings(report);
  if (findings.length === 0) {
    throw new Error("No findings found in report.");
  }

  const repoUrl = repoUrlArg
    ? repoUrlArg.slice("--repoUrl=".length)
    : "https://github.com/openclaw/openclaw";

  const sourcePath = resolve(".tmp/report-source");
  if (!existsSync(sourcePath)) {
    mkdirSync(dirname(sourcePath), { recursive: true });
    execFileSync("git", ["clone", repoUrl, sourcePath], { stdio: "pipe" });
  }

  try {
    execFileSync("git", ["fetch", "origin", commit], { cwd: sourcePath, stdio: "pipe" });
  } catch {
    // commit may already exist locally
  }
  execFileSync("git", ["checkout", "--detach", commit], { cwd: sourcePath, stdio: "pipe" });

  const triage: Triage[] = findings.map((finding) => {
    const absolute = join(sourcePath, ...finding.filePath.split("/"));
    let context = "";
    if (existsSync(absolute)) {
      const content = readFileSync(absolute, "utf8");
      context = getLineContext(content, finding.lines);
    }

    const result = classifyFinding(finding, context);
    return {
      finding,
      ...result,
    };
  });

  const outputPath = outputArg
    ? resolve(outputArg.slice("--output=".length))
    : resolve("reports/findings-triage.md");

  writeFileSync(outputPath, summarize(triage), "utf8");

  const tp = triage.filter((entry) => entry.verdict === "likely-true-positive").length;
  const fp = triage.length - tp;
  console.log(JSON.stringify({ reportPath, outputPath, total: triage.length, tp, fp }, null, 2));
}

main();
