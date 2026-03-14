/**
 * Periodic report builder — weekly/daily digest generation
 * with trend summaries, comparisons, and distribution.
 *
 * Stored locally in .judges-digest.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DigestSnapshot {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
  resolved: number;
  newFindings: number;
}

interface DigestConfig {
  frequency: "daily" | "weekly" | "monthly";
  recipients?: string[];
  includeResolved: boolean;
  includeTrends: boolean;
}

interface DigestDb {
  snapshots: DigestSnapshot[];
  config: DigestConfig;
}

const DIGEST_FILE = ".judges-digest.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(): DigestDb {
  if (!existsSync(DIGEST_FILE))
    return {
      snapshots: [],
      config: { frequency: "weekly", includeResolved: true, includeTrends: true },
    };
  return JSON.parse(readFileSync(DIGEST_FILE, "utf-8"));
}

function saveDb(db: DigestDb): void {
  writeFileSync(DIGEST_FILE, JSON.stringify(db, null, 2));
}

export function addSnapshot(snapshot: Omit<DigestSnapshot, "date">): DigestSnapshot {
  const db = loadDb();
  const entry: DigestSnapshot = { ...snapshot, date: new Date().toISOString().split("T")[0] };
  db.snapshots.push(entry);
  saveDb(db);
  return entry;
}

function generateDigestReport(db: DigestDb, period: string): string {
  const lines: string[] = [];
  const now = new Date();
  let cutoff: Date;

  switch (period) {
    case "daily":
      cutoff = new Date(now.getTime() - 86400000);
      break;
    case "weekly":
      cutoff = new Date(now.getTime() - 7 * 86400000);
      break;
    case "monthly":
      cutoff = new Date(now.getTime() - 30 * 86400000);
      break;
    default:
      cutoff = new Date(now.getTime() - 7 * 86400000);
  }

  const recent = db.snapshots.filter((s) => new Date(s.date) >= cutoff);
  const older = db.snapshots.filter((s) => new Date(s.date) < cutoff);

  lines.push(`# Judges Digest — ${period.charAt(0).toUpperCase() + period.slice(1)} Report`);
  lines.push(`> Generated: ${now.toISOString()}\n`);

  if (recent.length === 0) {
    lines.push("No data for this period. Use `judges digest --snapshot` to record findings.\n");
    return lines.join("\n");
  }

  const latest = recent[recent.length - 1];
  lines.push("## Current Status");
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Critical | ${latest.critical} |`);
  lines.push(`| High     | ${latest.high} |`);
  lines.push(`| Medium   | ${latest.medium} |`);
  lines.push(`| Low      | ${latest.low} |`);
  lines.push(`| **Total** | **${latest.total}** |`);
  lines.push("");

  if (db.config.includeTrends && recent.length >= 2) {
    const first = recent[0];
    const delta = latest.total - first.total;
    const arrow = delta > 0 ? "📈" : delta < 0 ? "📉" : "➡️";
    lines.push("## Trend");
    lines.push(`- Period: ${first.date} → ${latest.date}`);
    lines.push(`- Change: ${delta > 0 ? "+" : ""}${delta} findings ${arrow}`);
    lines.push(`- New:     ${recent.reduce((s, r) => s + r.newFindings, 0)}`);
    lines.push(`- Resolved: ${recent.reduce((s, r) => s + r.resolved, 0)}`);
    lines.push("");
  }

  if (db.config.includeResolved && older.length > 0) {
    const prevTotal = older[older.length - 1].total;
    lines.push("## Comparison with Previous Period");
    lines.push(`- Previous total: ${prevTotal}`);
    lines.push(`- Current total:  ${latest.total}`);
    lines.push(`- Net change:     ${latest.total - prevTotal}`);
    lines.push("");
  }

  // Sparkline-style chart
  if (recent.length >= 3) {
    lines.push("## Trend Chart");
    const max = Math.max(...recent.map((r) => r.total), 1);
    for (const s of recent) {
      const bar = "█".repeat(Math.max(1, Math.round((s.total / max) * 30)));
      lines.push(`  ${s.date}  ${bar} ${s.total}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runDigest(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges digest — Periodic finding digest and trend reports

Usage:
  judges digest --snapshot --critical 2 --high 5 --medium 10 --low 3 --resolved 4 --new 3
  judges digest --generate weekly
  judges digest --generate daily --output report.md
  judges digest --configure --frequency weekly
  judges digest --history
  judges digest --stats

Options:
  --snapshot             Record a point-in-time snapshot
    --critical <n>       Critical count
    --high <n>           High count
    --medium <n>         Medium count
    --low <n>            Low count
    --resolved <n>       Resolved since last snapshot
    --new <n>            New findings since last snapshot
  --generate <period>    Generate digest: daily | weekly | monthly
  --output <file>        Write report to file
  --configure            Update digest configuration
    --frequency <freq>   daily | weekly | monthly
  --history              Show snapshot history
  --stats                Summary statistics
  --format json          JSON output
  --help, -h             Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Record snapshot
  if (argv.includes("--snapshot")) {
    const getNum = (flag: string): number => {
      const val = argv.find((_a: string, i: number) => argv[i - 1] === flag);
      return val ? parseInt(val, 10) : 0;
    };

    const snapshot = addSnapshot({
      critical: getNum("--critical"),
      high: getNum("--high"),
      medium: getNum("--medium"),
      low: getNum("--low"),
      total: getNum("--critical") + getNum("--high") + getNum("--medium") + getNum("--low"),
      resolved: getNum("--resolved"),
      newFindings: getNum("--new"),
    });

    if (format === "json") {
      console.log(JSON.stringify(snapshot, null, 2));
    } else {
      console.log(
        `  ✅ Snapshot recorded: ${snapshot.date} — ${snapshot.total} findings (${snapshot.newFindings} new, ${snapshot.resolved} resolved)`,
      );
    }
    return;
  }

  // Generate digest
  const period = argv.find((_a: string, i: number) => argv[i - 1] === "--generate");
  if (period) {
    const db = loadDb();
    const report = generateDigestReport(db, period);
    const outputFile = argv.find((_a: string, i: number) => argv[i - 1] === "--output");
    if (outputFile) {
      writeFileSync(outputFile, report);
      console.log(`  ✅ Digest written to ${outputFile}`);
    } else {
      console.log(report);
    }
    return;
  }

  // Configure
  if (argv.includes("--configure")) {
    const db = loadDb();
    const freq = argv.find((_a: string, i: number) => argv[i - 1] === "--frequency") as
      | DigestConfig["frequency"]
      | undefined;
    if (freq) db.config.frequency = freq;
    saveDb(db);
    console.log(`  ✅ Digest configured: frequency=${db.config.frequency}`);
    return;
  }

  const db = loadDb();

  // History
  if (argv.includes("--history")) {
    if (format === "json") {
      console.log(JSON.stringify(db.snapshots, null, 2));
    } else if (db.snapshots.length === 0) {
      console.log("\n  No snapshots. Use --snapshot to record.\n");
    } else {
      console.log(`\n  Snapshot History (${db.snapshots.length})\n  ─────────────────`);
      for (const s of db.snapshots.slice(-20)) {
        console.log(
          `    ${s.date}  C:${s.critical} H:${s.high} M:${s.medium} L:${s.low} (${s.total} total, +${s.newFindings} -${s.resolved})`,
        );
      }
      console.log("");
    }
    return;
  }

  // Stats
  if (argv.includes("--stats") || db.snapshots.length > 0) {
    if (db.snapshots.length === 0) {
      console.log("\n  No digest data. Use --snapshot to start tracking.\n");
      return;
    }
    const latest = db.snapshots[db.snapshots.length - 1];
    const totalResolved = db.snapshots.reduce((s, snap) => s + snap.resolved, 0);
    const totalNew = db.snapshots.reduce((s, snap) => s + snap.newFindings, 0);
    if (format === "json") {
      console.log(JSON.stringify({ latest, totalResolved, totalNew, snapshots: db.snapshots.length }, null, 2));
    } else {
      console.log(`
  Digest Summary
  ──────────────
  Snapshots:      ${db.snapshots.length}
  Latest total:   ${latest.total} (${latest.date})
  Total resolved: ${totalResolved}
  Total new:      ${totalNew}
  Net change:     ${totalNew - totalResolved}
  Frequency:      ${db.config.frequency}
`);
    }
    return;
  }

  console.log("\n  No digest data. Use --snapshot to start tracking, then --generate to create reports.\n");
}
