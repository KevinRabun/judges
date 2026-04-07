/**
 * VS Code External Benchmark Runner
 *
 * Provides a QuickPick-based UI for selecting and running external benchmarks
 * (OpenSSF CVE, Martian Code Review, etc.) from within VS Code.
 *
 * Uses child_process to invoke `judges external-benchmark` CLI commands,
 * keeping the extension decoupled from the core benchmark modules.
 */

import * as vscode from "vscode";
import { existsSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SuiteInfo {
  suiteId: string;
  suiteName: string;
  suiteUrl: string;
  defaultRepoPath: string;
  description: string;
  validatePath: (repoPath: string) => boolean;
}

// ─── Output Channel ─────────────────────────────────────────────────────────

let _channel: vscode.OutputChannel | undefined;

function log(msg: string): void {
  if (!_channel) _channel = vscode.window.createOutputChannel("Judges External Benchmark");
  _channel.appendLine(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

// ─── Available Suites ───────────────────────────────────────────────────────

const AVAILABLE_SUITES: SuiteInfo[] = [
  {
    suiteId: "openssf-cve",
    suiteName: "OpenSSF CVE Benchmark",
    suiteUrl: "https://github.com/ossf-cve-benchmark/ossf-cve-benchmark",
    defaultRepoPath: "../ossf-cve-benchmark",
    description: "200+ real-world JS/TS CVEs with pre-patch and post-patch commits",
    validatePath: (p) => existsSync(join(p, "CVEs")),
  },
  {
    suiteId: "martian-code-review",
    suiteName: "Martian Code Review Bench",
    suiteUrl: "https://github.com/withmartian/code-review-benchmark",
    defaultRepoPath: "../code-review-benchmark",
    description: "50 PRs from 5 open-source projects (Python, Go, TS, Ruby, Java) with golden comments",
    validatePath: (p) => existsSync(join(p, "offline", "golden_comments")),
  },
];

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function runExternalBenchmarkUI(token: vscode.CancellationToken, storageUri?: vscode.Uri): Promise<void> {
  if (!_channel) _channel = vscode.window.createOutputChannel("Judges External Benchmark");
  _channel.show(true);

  // Step 0: Choose evaluation mode
  const modePick = await vscode.window.showQuickPick(
    [
      {
        label: "$(rocket) LLM Evaluation (Layer 2)",
        description: "recommended",
        detail:
          "Fetch real PR diffs from GitHub and evaluate with the LLM judge — produces meaningful code-review scores",
        mode: "llm" as const,
      },
      {
        label: "$(zap) Deterministic Evaluation (Layer 1)",
        description: "fast",
        detail:
          "Run pattern-based evaluators only — limited for code-review benchmarks that require semantic understanding",
        mode: "l1" as const,
      },
    ],
    { placeHolder: "Select evaluation mode", ignoreFocusOut: true },
  );

  if (!modePick || token.isCancellationRequested) return;
  const evaluationMode = modePick.mode;

  // Step 1: Show QuickPick for suite selection
  const suiteItems = AVAILABLE_SUITES.map((s) => ({
    label: s.suiteName,
    description: s.suiteId,
    detail: s.description,
    suite: s,
  }));

  // Add "Run All" option
  const allOption = {
    label: "$(checklist) Run All Suites",
    description: "all",
    detail: "Run all available external benchmarks and produce a composite scorecard",
    suite: undefined as SuiteInfo | undefined,
  };

  const pick = await vscode.window.showQuickPick([allOption, ...suiteItems], {
    placeHolder: "Select an external benchmark suite to run",
    ignoreFocusOut: true,
  });

  if (!pick || token.isCancellationRequested) return;

  const selectedSuites = pick.suite ? [pick.suite] : AVAILABLE_SUITES;

  // Step 2: For each suite, ask for the repo path
  const suiteConfigs: Array<{ suite: SuiteInfo; repoPath: string }> = [];

  for (const suite of selectedSuites) {
    if (token.isCancellationRequested) return;

    // Try default path first
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const defaultPath = resolve(workspaceRoot, suite.defaultRepoPath);

    if (existsSync(defaultPath)) {
      suiteConfigs.push({ suite, repoPath: defaultPath });
      log(`Found ${suite.suiteName} at default path: ${defaultPath}`);
      continue;
    }

    // Ask user to locate the repo
    const action = await vscode.window.showInformationMessage(
      `${suite.suiteName} repo not found at ${defaultPath}`,
      "Browse...",
      "Skip",
    );

    if (action === "Browse...") {
      const uris = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: `Select ${suite.suiteName} Repo`,
        title: `Locate the ${suite.suiteId} repository`,
      });

      if (uris && uris.length > 0) {
        suiteConfigs.push({ suite, repoPath: uris[0].fsPath });
      } else {
        log(`Skipped ${suite.suiteName} — no repo path provided`);
      }
    } else {
      log(`Skipped ${suite.suiteName}`);
    }
  }

  if (suiteConfigs.length === 0) {
    vscode.window.showWarningMessage("Judges: No benchmark suites selected or repos found.");
    return;
  }

  // Step 3: Run benchmarks
  log(`\n${"═".repeat(60)}`);
  log(
    `Running ${suiteConfigs.length} external benchmark suite(s) [${evaluationMode === "llm" ? "LLM L2" : "Deterministic L1"}]`,
  );
  log(`${"═".repeat(60)}\n`);

  // ── LLM Evaluation Mode ──
  if (evaluationMode === "llm") {
    const { runLlmBenchmark } = await import("./llm-benchmark-runner");

    for (const { suite, repoPath } of suiteConfigs) {
      if (token.isCancellationRequested) break;

      log(`\n━━━ ${suite.suiteName} (LLM L2) ━━━`);
      log(`Repo: ${repoPath}`);

      try {
        let cases: any[];

        if (suite.suiteId === "openssf-cve") {
          // OpenSSF: load pre-prepared cases from benchmarks/openssf-l2-cases.json
          const { readFileSync, existsSync: fsExists } = await import("fs");
          const { resolve: pathResolve } = await import("path");
          const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
          const casesPath = pathResolve(workspaceRoot, "benchmarks", "openssf-l2-cases.json");

          if (!fsExists(casesPath)) {
            log(`  ⚠️ OpenSSF L2 cases not found at ${casesPath}`);
            log(`  Run: npx tsx scripts/prepare-openssf-l2-cases.ts`);
            continue;
          }

          cases = JSON.parse(readFileSync(casesPath, "utf-8"));
          log(`Loaded ${cases.length} pre-prepared CVE cases`);
        } else {
          // Martian: fetch PR diffs and convert on the fly
          log(`Fetching PR diffs from GitHub and converting to benchmark cases...`);
          // @ts-expect-error — export added in current release, dist types may be stale
          const { convertMartianToBenchmarkCases } = await import("@kevinrabun/judges/api");
          cases = convertMartianToBenchmarkCases(repoPath);
          log(`Converted ${cases.length} PRs into benchmark cases`);
        }

        if (cases.length === 0) {
          log(`  ⚠️ No cases could be converted — skipping`);
          continue;
        }

        log(`Starting LLM evaluation of ${cases.length} cases...`);
        const result = await runLlmBenchmark(
          token,
          (p) => {
            log(`  [${p.completed}/${p.total}] ${p.message}`);
          },
          storageUri!,
          undefined, // use default model
          cases, // pass external cases
          suite.suiteId, // unique file prefix per benchmark
        );

        log(`\n  ✅ ${suite.suiteName} LLM evaluation complete`);
        if (result.snapshot) {
          log(`  F1 Score:  ${(result.snapshot.f1Score * 100).toFixed(1)}%`);
          log(`  Precision: ${(result.snapshot.precision * 100).toFixed(1)}%`);
          log(`  Recall:    ${(result.snapshot.recall * 100).toFixed(1)}%`);
        }

        // Open the report
        const doc = await vscode.workspace.openTextDocument({
          content: result.reportMarkdown,
          language: "markdown",
        });
        await vscode.window.showTextDocument(doc, { preview: true });

        const f1 = result.snapshot ? `F1: ${(result.snapshot.f1Score * 100).toFixed(1)}%` : "";
        vscode.window.showInformationMessage(`Judges: ${suite.suiteName} LLM benchmark complete. ${f1}`);
      } catch (error) {
        log(`  ❌ ${suite.suiteName} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return;
  }

  // ── Deterministic (L1) Mode ──
  interface SuiteResult {
    suite: SuiteInfo;
    precision: number;
    recall: number;
    f1Score: number;
    detectionRate: number;
    totalItems: number;
    evaluatedItems: number;
    skippedItems: number;
    perCategory?: Record<string, { total: number; detected: number; rate: number }>;
  }

  const allResults: SuiteResult[] = [];

  for (const { suite, repoPath } of suiteConfigs) {
    if (token.isCancellationRequested) break;

    log(`\n━━━ ${suite.suiteName} ━━━`);
    log(`Repo: ${repoPath}`);

    try {
      // Run via CLI command and capture JSON output
      const cmd = `npx judges external-benchmark run --suite ${suite.suiteId} --repo "${repoPath}" --format json`;
      log(`Running: ${cmd}`);

      const output = execSync(cmd, {
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
        timeout: 600_000, // 10 min max
        stdio: "pipe",
        env: { ...process.env, FORCE_COLOR: "0" },
      }).toString();

      // Parse the JSON result from stdout (may have non-JSON prefix lines)
      const jsonMatch = output.match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        allResults.push({
          suite,
          precision: result.precision ?? 0,
          recall: result.recall ?? 0,
          f1Score: result.f1Score ?? 0,
          detectionRate: result.detectionRate ?? 0,
          totalItems: result.totalItems ?? 0,
          evaluatedItems: result.evaluatedItems ?? 0,
          skippedItems: result.skippedItems ?? 0,
          perCategory: result.perCategory,
        });

        log(`\n  ✅ ${suite.suiteName} complete`);
        log(`  Detection Rate: ${((result.detectionRate ?? 0) * 100).toFixed(1)}%`);
        log(`  Precision:      ${((result.precision ?? 0) * 100).toFixed(1)}%`);
        log(`  Recall:         ${((result.recall ?? 0) * 100).toFixed(1)}%`);
        log(`  F1 Score:       ${((result.f1Score ?? 0) * 100).toFixed(1)}%`);
      } else {
        log(`  ⚠️ Could not parse JSON output from benchmark`);
        for (const line of output.split("\n").slice(-10)) {
          log(`  > ${line}`);
        }
      }
    } catch (error) {
      log(`  ❌ ${suite.suiteName} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (token.isCancellationRequested) {
    log("\nBenchmark cancelled.");
    return;
  }

  // Step 4: Generate composite report
  if (allResults.length > 0) {
    const reportLines: string[] = [];
    reportLines.push("# External Benchmark Scorecard");
    reportLines.push("");
    reportLines.push(`**Date:** ${new Date().toISOString()}`);
    reportLines.push("");

    if (allResults.length > 1) {
      // Aggregate
      let totalItems = 0;
      let evaluatedItems = 0;
      let wPrecSum = 0;
      let wRecSum = 0;
      for (const r of allResults) {
        totalItems += r.totalItems;
        evaluatedItems += r.evaluatedItems;
        wPrecSum += r.precision * r.evaluatedItems;
        wRecSum += r.recall * r.evaluatedItems;
      }
      const wPrec = evaluatedItems > 0 ? wPrecSum / evaluatedItems : 0;
      const wRec = evaluatedItems > 0 ? wRecSum / evaluatedItems : 0;
      const wF1 = wPrec + wRec > 0 ? (2 * wPrec * wRec) / (wPrec + wRec) : 0;

      reportLines.push("## Aggregate");
      reportLines.push("");
      reportLines.push("| Metric | Value |");
      reportLines.push("|--------|-------|");
      reportLines.push(`| Total Items | ${totalItems} |`);
      reportLines.push(`| Evaluated | ${evaluatedItems} |`);
      reportLines.push(`| Weighted Precision | ${(wPrec * 100).toFixed(1)}% |`);
      reportLines.push(`| Weighted Recall | ${(wRec * 100).toFixed(1)}% |`);
      reportLines.push(`| Weighted F1 | ${(wF1 * 100).toFixed(1)}% |`);
      reportLines.push("");
    }

    reportLines.push("## Per-Suite Results");
    reportLines.push("");
    reportLines.push("| Suite | Items | Detection Rate | Precision | Recall | F1 |");
    reportLines.push("|-------|-------|---------------|-----------|--------|-----|");
    for (const r of allResults) {
      reportLines.push(
        `| ${r.suite.suiteName} | ${r.evaluatedItems}/${r.totalItems} ` +
          `| ${(r.detectionRate * 100).toFixed(1)}% ` +
          `| ${(r.precision * 100).toFixed(1)}% ` +
          `| ${(r.recall * 100).toFixed(1)}% ` +
          `| ${(r.f1Score * 100).toFixed(1)}% |`,
      );
    }
    reportLines.push("");

    // Per-suite detail with category breakdowns
    for (const r of allResults) {
      reportLines.push(`## ${r.suite.suiteName}`);
      reportLines.push("");
      reportLines.push(`**Source:** ${r.suite.suiteUrl}`);
      reportLines.push(`**Items:** ${r.evaluatedItems} evaluated, ${r.skippedItems} skipped`);
      reportLines.push("");

      if (r.perCategory && Object.keys(r.perCategory).length > 0) {
        reportLines.push("| Category | Total | Detected | Rate |");
        reportLines.push("|----------|-------|----------|------|");
        const entries = Object.entries(r.perCategory).sort((a, b) => b[1].total - a[1].total);
        for (const [cat, data] of entries.slice(0, 20)) {
          reportLines.push(`| ${cat} | ${data.total} | ${data.detected} | ${(data.rate * 100).toFixed(0)}% |`);
        }
        reportLines.push("");
      }
    }

    const reportMarkdown = reportLines.join("\n");

    // Open report in editor
    const doc = await vscode.workspace.openTextDocument({
      content: reportMarkdown,
      language: "markdown",
    });
    await vscode.window.showTextDocument(doc, { preview: true });

    const f1Summary = allResults.map((r) => `${r.suite.suiteName}: F1=${(r.f1Score * 100).toFixed(1)}%`).join(", ");
    vscode.window.showInformationMessage(`Judges: External benchmark complete. ${f1Summary}`);
  }
}
