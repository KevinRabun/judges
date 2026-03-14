/**
 * Commit hygiene — audit commit messages and diff structure for
 * AI-generated code submission quality.
 */

import { execSync } from "child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CommitIssue {
  hash: string;
  message: string;
  kind: string;
  detail: string;
  severity: "high" | "medium" | "low";
}

// ─── Patterns ───────────────────────────────────────────────────────────────

const VAGUE_MESSAGES = [
  /^update(d)?\s*(code|files?|stuff)?$/i,
  /^fix(ed)?\s*(it|bug|stuff|things?)?$/i,
  /^changes?$/i,
  /^wip$/i,
  /^misc$/i,
  /^\.+$/,
  /^temp$/i,
  /^asdf/i,
  /^test$/i,
];

const CONVENTIONAL_REGEX = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?:\s/;

// ─── Analysis ───────────────────────────────────────────────────────────────

function getCommits(
  count: number,
): Array<{ hash: string; message: string; files: number; insertions: number; deletions: number }> {
  try {
    const log = execSync(`git log --oneline -${count} --format="%H|%s"`, { encoding: "utf-8", timeout: 10000 });
    const commits: Array<{ hash: string; message: string; files: number; insertions: number; deletions: number }> = [];

    for (const line of log.trim().split("\n")) {
      if (!line) continue;
      const [hash, ...msgParts] = line.split("|");
      const message = msgParts.join("|");
      let files = 0,
        insertions = 0,
        deletions = 0;

      try {
        const stat = execSync(`git diff --shortstat ${hash}^ ${hash}`, { encoding: "utf-8", timeout: 5000 });
        const fm = stat.match(/(\d+)\s+files?\s+changed/);
        const im = stat.match(/(\d+)\s+insertions?/);
        const dm = stat.match(/(\d+)\s+deletions?/);
        if (fm) files = parseInt(fm[1]);
        if (im) insertions = parseInt(im[1]);
        if (dm) deletions = parseInt(dm[1]);
      } catch {
        /* first commit or error */
      }

      commits.push({ hash: hash.substring(0, 8), message, files, insertions, deletions });
    }

    return commits;
  } catch {
    return [];
  }
}

function analyzeCommits(
  commits: Array<{ hash: string; message: string; files: number; insertions: number; deletions: number }>,
  requireConventional: boolean,
): CommitIssue[] {
  const issues: CommitIssue[] = [];

  for (const c of commits) {
    // Vague message check
    if (VAGUE_MESSAGES.some((r) => r.test(c.message.trim()))) {
      issues.push({
        hash: c.hash,
        message: c.message,
        kind: "vague-message",
        detail: "Commit message is too vague — describe what and why",
        severity: "medium",
      });
    }

    // Conventional commit check
    if (requireConventional && !CONVENTIONAL_REGEX.test(c.message)) {
      issues.push({
        hash: c.hash,
        message: c.message,
        kind: "non-conventional",
        detail: "Missing conventional commit prefix (feat:, fix:, etc.)",
        severity: "low",
      });
    }

    // Message length
    if (c.message.length < 10) {
      issues.push({
        hash: c.hash,
        message: c.message,
        kind: "short-message",
        detail: `Message only ${c.message.length} chars — too short to be descriptive`,
        severity: "low",
      });
    }

    if (c.message.length > 100) {
      issues.push({
        hash: c.hash,
        message: c.message,
        kind: "long-subject",
        detail: `Subject line is ${c.message.length} chars — keep under 72`,
        severity: "low",
      });
    }

    // Oversized diff
    if (c.files > 20) {
      issues.push({
        hash: c.hash,
        message: c.message,
        kind: "oversized-diff",
        detail: `${c.files} files changed — consider splitting into atomic commits`,
        severity: "high",
      });
    }

    if (c.insertions + c.deletions > 1000) {
      issues.push({
        hash: c.hash,
        message: c.message,
        kind: "massive-change",
        detail: `${c.insertions}+ / ${c.deletions}- lines — too large for effective review`,
        severity: "high",
      });
    }

    // Merge commit detection (simple)
    if (/^Merge\s+(branch|pull)/i.test(c.message)) {
      // Not an issue per se, but track for stats
    }
  }

  return issues.sort((a, b) => {
    const sev: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return sev[b.severity] - sev[a.severity];
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCommitHygiene(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges commit-hygiene — Audit commit message and diff quality

Usage:
  judges commit-hygiene
  judges commit-hygiene --count 50
  judges commit-hygiene --conventional
  judges commit-hygiene --format json

Options:
  --count <n>          Number of recent commits to analyze (default: 20)
  --conventional       Require conventional commit format
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const count = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--count") || "20");
  const requireConventional = argv.includes("--conventional");

  const commits = getCommits(count);
  if (commits.length === 0) {
    console.log("  No commits found. Ensure you're in a git repository.");
    return;
  }

  const issues = analyzeCommits(commits, requireConventional);

  if (format === "json") {
    console.log(JSON.stringify({ commits: commits.length, issues, timestamp: new Date().toISOString() }, null, 2));
  } else {
    console.log(
      `\n  Commit Hygiene — ${commits.length} commits analyzed, ${issues.length} issue(s)\n  ──────────────────────────`,
    );

    if (issues.length === 0) {
      console.log("  ✅ All commits look clean");
    } else {
      for (const issue of issues.slice(0, 30)) {
        const icon = issue.severity === "high" ? "🔴" : issue.severity === "medium" ? "🟡" : "⚪";
        console.log(`    ${icon} ${issue.hash} "${issue.message.substring(0, 50)}"`);
        console.log(`        ${issue.detail}`);
      }
      if (issues.length > 30) console.log(`\n    ... and ${issues.length - 30} more`);
    }

    // Summary stats
    const avgSize = commits.reduce((s, c) => s + c.insertions + c.deletions, 0) / commits.length;
    console.log(`\n    Avg change size: ${Math.round(avgSize)} lines/commit`);
    console.log(
      `    Issues: ${issues.filter((i) => i.severity === "high").length} high, ${issues.filter((i) => i.severity === "medium").length} medium, ${issues.filter((i) => i.severity === "low").length} low\n`,
    );
  }
}
