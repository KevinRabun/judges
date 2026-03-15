/**
 * Review-report-archive — Archive and manage historical review reports.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "fs";
import { join, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArchiveEntry {
  filename: string;
  archivedAt: string;
  originalPath: string;
  findings: number;
  verdict: string;
}

interface ArchiveIndex {
  entries: ArchiveEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewReportArchive(argv: string[]): void {
  const archiveIdx = argv.indexOf("--archive-dir");
  const archiveDir = archiveIdx >= 0 ? argv[archiveIdx + 1] : ".judges/archive";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-report-archive — Archive review reports

Usage:
  judges review-report-archive [--archive-dir <path>] [--add <report>]
                               [--prune <days>] [--format table|json]

Options:
  --archive-dir <path>  Archive directory (default: .judges/archive)
  --add <report>        Archive a report file
  --prune <days>        Remove entries older than N days
  --format <fmt>        Output format: table (default), json
  --help, -h            Show this help
`);
    return;
  }

  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  const indexPath = join(archiveDir, "index.json");
  let index: ArchiveIndex;
  if (existsSync(indexPath)) {
    index = JSON.parse(readFileSync(indexPath, "utf-8")) as ArchiveIndex;
  } else {
    index = { entries: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add report to archive
  const addIdx = argv.indexOf("--add");
  if (addIdx >= 0) {
    const reportPath = argv[addIdx + 1];
    if (!existsSync(reportPath)) {
      console.error(`Report not found: ${reportPath}`);
      process.exitCode = 1;
      return;
    }

    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as {
      findings?: unknown[];
      overallVerdict?: string;
    };

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveFilename = `${ts}_${basename(reportPath)}`;
    const destPath = join(archiveDir, archiveFilename);

    copyFileSync(reportPath, destPath);

    const entry: ArchiveEntry = {
      filename: archiveFilename,
      archivedAt: new Date().toISOString().split("T")[0],
      originalPath: reportPath,
      findings: report.findings?.length ?? 0,
      verdict: report.overallVerdict ?? "unknown",
    };

    index.entries.push(entry);
    index.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`Archived: ${archiveFilename}`);
    return;
  }

  // Prune old entries
  const pruneIdx = argv.indexOf("--prune");
  if (pruneIdx >= 0) {
    const days = parseInt(argv[pruneIdx + 1], 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    const before = index.entries.length;
    index.entries = index.entries.filter((e) => e.archivedAt >= cutoffStr);
    index.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(indexPath, JSON.stringify(index, null, 2));
    console.log(`Pruned ${before - index.entries.length} entries older than ${days} days.`);
    return;
  }

  // List archive
  if (format === "json") {
    console.log(JSON.stringify(index, null, 2));
    return;
  }

  console.log(`\nReport Archive`);
  console.log("═".repeat(70));

  if (index.entries.length === 0) {
    console.log("  No archived reports. Use --add <report> to archive one.");
  } else {
    console.log(`  ${"Date".padEnd(12)} ${"Verdict".padEnd(10)} ${"Findings".padEnd(10)} Filename`);
    console.log("  " + "─".repeat(65));

    for (const e of index.entries) {
      console.log(
        `  ${e.archivedAt.padEnd(12)} ${e.verdict.padEnd(10)} ${String(e.findings).padEnd(10)} ${e.filename}`,
      );
    }
  }

  console.log(`\n  Total archived: ${index.entries.length}`);
  console.log("═".repeat(70));
}
