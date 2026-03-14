/**
 * `judges upload` — Upload SARIF results to GitHub Code Scanning.
 *
 * Pushes evaluation results directly to GitHub's Code Scanning API,
 * making findings visible in the Security tab without needing
 * github/codeql-action/upload-sarif in CI.
 *
 * Usage:
 *   judges upload results.sarif.json                   Upload SARIF file
 *   judges upload --file results.json --repo owner/repo  Convert + upload
 *   judges upload --ref refs/heads/main --sha abc123     Specify git ref
 */

import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { resolve, basename } from "path";
import { gzipSync } from "zlib";

// ─── Types ──────────────────────────────────────────────────────────────────

interface UploadOptions {
  /** Path to SARIF file */
  sarifPath: string;
  /** GitHub repo (owner/repo) */
  repo: string;
  /** Git ref (e.g., refs/heads/main) */
  ref: string;
  /** Git commit SHA */
  commitSha: string;
  /** GitHub token */
  token: string;
}

interface UploadResult {
  success: boolean;
  id?: string;
  url?: string;
  error?: string;
}

// ─── Git Helpers ────────────────────────────────────────────────────────────

function detectGitRef(): string {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    return `refs/heads/${branch}`;
  } catch {
    return "refs/heads/main";
  }
}

function detectGitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "";
  }
}

function detectRepo(): string {
  try {
    const remote = execSync("git remote get-url origin", { encoding: "utf-8" }).trim();
    const match = remote.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    return match?.[1]?.replace(/\.git$/, "") || "";
  } catch {
    return "";
  }
}

// ─── Upload ────────────────────────────────────────────────────────────────

async function uploadSarif(options: UploadOptions): Promise<UploadResult> {
  const { sarifPath, repo, ref, commitSha, token } = options;

  if (!existsSync(sarifPath)) {
    return { success: false, error: `File not found: ${sarifPath}` };
  }

  const sarifContent = readFileSync(sarifPath, "utf-8");

  // Validate it's valid JSON
  try {
    JSON.parse(sarifContent);
  } catch {
    return { success: false, error: "Invalid JSON in SARIF file" };
  }

  // GitHub requires gzip + base64 encoding
  const compressed = gzipSync(Buffer.from(sarifContent, "utf-8"));
  const encoded = compressed.toString("base64");

  const apiUrl = `https://api.github.com/repos/${repo}/code-scanning/sarifs`;

  const body = JSON.stringify({
    commit_sha: commitSha,
    ref,
    sarif: encoded,
    tool_name: "Judges Panel",
  });

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body,
    });

    if (response.ok || response.status === 202) {
      const data = (await response.json()) as Record<string, unknown>;
      return {
        success: true,
        id: data.id as string,
        url: data.url as string,
      };
    }

    const errorData = (await response.json().catch(() => ({}))) as Record<string, string>;
    return {
      success: false,
      error: `GitHub API ${response.status}: ${errorData.message || response.statusText}`,
    };
  } catch (err) {
    return {
      success: false,
      error: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── CLI Runner ─────────────────────────────────────────────────────────────

export async function runUpload(argv: string[]): Promise<void> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges upload — Upload SARIF results to GitHub Code Scanning

Usage:
  judges upload <sarif-file>                 Upload SARIF file
  judges upload --file <sarif-file>          Upload SARIF file (alternate)
  judges upload --repo <owner/repo>          Specify target repository
  judges upload --ref <git-ref>              Git ref (default: current branch)
  judges upload --sha <commit-sha>           Git commit SHA (default: HEAD)
  judges upload --token <github-token>       GitHub token (default: GITHUB_TOKEN env)

The SARIF file is gzipped and base64-encoded before upload, as required by
the GitHub Code Scanning API.

Environment Variables:
  GITHUB_TOKEN                               GitHub API token with security_events scope

Options:
  --file <path>          Path to SARIF file
  --repo <owner/repo>    GitHub repository (auto-detected from git remote)
  --ref <ref>            Git ref (auto-detected from current branch)
  --sha <sha>            Commit SHA (auto-detected from HEAD)
  --token <token>        GitHub token (or set GITHUB_TOKEN env var)
  --help, -h             Show this help
`);
    return;
  }

  // Parse args
  const sarifPath = resolve(
    argv.find((_a, i) => argv[i - 1] === "--file") ||
      argv.find((a, i) => i > 1 && !a.startsWith("-") && a.endsWith(".json")) ||
      "",
  );

  if (!sarifPath || !existsSync(sarifPath)) {
    console.error("\n  Error: Please provide a SARIF file path.\n");
    console.error("  Usage: judges upload <sarif-file>\n");
    process.exit(1);
  }

  const repo = argv.find((_a, i) => argv[i - 1] === "--repo") || detectRepo();
  const ref = argv.find((_a, i) => argv[i - 1] === "--ref") || detectGitRef();
  const commitSha = argv.find((_a, i) => argv[i - 1] === "--sha") || detectGitSha();
  const token = argv.find((_a, i) => argv[i - 1] === "--token") || process.env.GITHUB_TOKEN || "";

  if (!repo) {
    console.error("\n  Error: Could not detect repository. Use --repo owner/repo\n");
    process.exit(1);
  }

  if (!commitSha) {
    console.error("\n  Error: Could not detect commit SHA. Use --sha <sha>\n");
    process.exit(1);
  }

  if (!token) {
    console.error("\n  Error: No GitHub token found. Set GITHUB_TOKEN env var or use --token\n");
    process.exit(1);
  }

  console.log(`\n  Uploading SARIF to GitHub Code Scanning...`);
  console.log(`  Repository: ${repo}`);
  console.log(`  Ref: ${ref}`);
  console.log(`  Commit: ${commitSha.slice(0, 7)}`);
  console.log(`  File: ${basename(sarifPath)}\n`);

  const result = await uploadSarif({ sarifPath, repo, ref, commitSha, token });

  if (result.success) {
    console.log("  ✅ SARIF uploaded successfully.");
    if (result.id) console.log(`  Analysis ID: ${result.id}`);
    console.log(`  View results: https://github.com/${repo}/security/code-scanning\n`);
  } else {
    console.error(`  ❌ Upload failed: ${result.error}\n`);
    process.exit(1);
  }
}
