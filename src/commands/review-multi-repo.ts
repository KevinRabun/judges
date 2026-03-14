/**
 * Review-multi-repo — Review across multiple repositories.
 */

import { existsSync } from "fs";
import { execSync } from "child_process";
import { basename } from "path";

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewMultiRepo(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-multi-repo — Review across multiple repositories

Usage:
  judges review-multi-repo scan   --repos <dir1,dir2,...> [options]
  judges review-multi-repo status --repos <dir1,dir2,...>
  judges review-multi-repo summary --repos <dir1,dir2,...> [--format json]

Subcommands:
  scan       Run reviews across specified repositories
  status     Show review status per repository
  summary    Aggregate summary across repositories

Options:
  --repos <list>     Comma-separated repository directories (required)
  --extensions <ext> File extensions to review (default: .ts,.js,.py)
  --format json      JSON output
  --help, -h         Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const reposStr = args.find((_a: string, i: number) => args[i - 1] === "--repos");
  if (!reposStr) {
    console.error("Error: --repos required");
    process.exitCode = 1;
    return;
  }

  const repos = reposStr
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "text";

  if (sub === "scan") {
    const exts = args.find((_a: string, i: number) => args[i - 1] === "--extensions") || ".ts,.js,.py";
    const extList = exts.split(",").map((e) => e.trim());

    console.log(`\nMulti-Repo Scan:`);
    console.log("═".repeat(65));

    for (const repo of repos) {
      if (!existsSync(repo)) {
        console.log(`  ✗ ${repo} — not found`);
        continue;
      }

      const name = basename(repo);
      let fileCount: number;
      try {
        const files = execSync(`git -C "${repo}" ls-files`, { encoding: "utf-8" }).split("\n").filter(Boolean);
        fileCount = files.filter((f) => extList.some((ext) => f.endsWith(ext))).length;
      } catch {
        console.log(`  ✗ ${name} — not a git repository`);
        continue;
      }

      // Check for .judges directory
      const hasConfig = existsSync(`${repo}/.judges`) || existsSync(`${repo}/.judgesrc`);
      const configStatus = hasConfig ? "configured" : "unconfigured";

      console.log(`  ✓ ${name.padEnd(25)} ${String(fileCount).padStart(5)} files  [${configStatus}]`);
    }
    console.log("═".repeat(65));
  } else if (sub === "status") {
    interface RepoStatus {
      name: string;
      path: string;
      exists: boolean;
      hasConfig: boolean;
      lastCommit: string;
      branch: string;
    }

    const statuses: RepoStatus[] = [];

    for (const repo of repos) {
      const name = basename(repo);
      if (!existsSync(repo)) {
        statuses.push({ name, path: repo, exists: false, hasConfig: false, lastCommit: "", branch: "" });
        continue;
      }

      const hasConfig = existsSync(`${repo}/.judges`) || existsSync(`${repo}/.judgesrc`);
      let lastCommit = "";
      let branch = "";
      try {
        lastCommit = execSync(`git -C "${repo}" log -1 --format=%ci`, { encoding: "utf-8" }).trim().slice(0, 10);
        branch = execSync(`git -C "${repo}" rev-parse --abbrev-ref HEAD`, { encoding: "utf-8" }).trim();
      } catch {
        /* not a git repo */
      }

      statuses.push({ name, path: repo, exists: true, hasConfig, lastCommit, branch });
    }

    if (format === "json") {
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }

    console.log(`\nMulti-Repo Status:`);
    console.log("═".repeat(70));
    for (const s of statuses) {
      if (!s.exists) {
        console.log(`  ✗ ${s.name.padEnd(22)} NOT FOUND`);
      } else {
        const cfg = s.hasConfig ? "✓" : "✗";
        console.log(`  ✓ ${s.name.padEnd(22)} ${s.branch.padEnd(12)} last: ${s.lastCommit}  config: ${cfg}`);
      }
    }
    console.log("═".repeat(70));
  } else if (sub === "summary") {
    let totalFiles = 0;
    let configuredCount = 0;

    const repoSummaries: { name: string; files: number; configured: boolean }[] = [];

    for (const repo of repos) {
      if (!existsSync(repo)) continue;
      const name = basename(repo);
      const hasConfig = existsSync(`${repo}/.judges`) || existsSync(`${repo}/.judgesrc`);
      if (hasConfig) configuredCount++;

      let fileCount = 0;
      try {
        const files = execSync(`git -C "${repo}" ls-files`, { encoding: "utf-8" }).split("\n").filter(Boolean);
        fileCount = files.length;
      } catch {
        /* skip */
      }
      totalFiles += fileCount;
      repoSummaries.push({ name, files: fileCount, configured: hasConfig });
    }

    if (format === "json") {
      console.log(JSON.stringify({ repos: repoSummaries.length, configured: configuredCount, totalFiles }, null, 2));
      return;
    }

    console.log(`\nMulti-Repo Summary:`);
    console.log("═".repeat(55));
    console.log(`  Repositories: ${repoSummaries.length}`);
    console.log(`  Configured:   ${configuredCount}`);
    console.log(`  Total files:  ${totalFiles}`);
    console.log("═".repeat(55));
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
