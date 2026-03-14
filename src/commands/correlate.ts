/**
 * Finding correlation — link related findings, identify root causes,
 * and detect systemic patterns across evaluations.
 *
 * Stored locally in .judges-correlations.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CorrelationLink {
  findingA: string;
  findingB: string;
  relationship: "same-root-cause" | "related" | "prerequisite" | "duplicate";
  notes?: string;
  createdAt: string;
}

interface RootCause {
  id: string;
  title: string;
  description: string;
  relatedFindings: string[];
  severity: "critical" | "high" | "medium" | "low";
  createdAt: string;
}

interface CorrelationDb {
  links: CorrelationLink[];
  rootCauses: RootCause[];
}

const CORRELATION_FILE = ".judges-correlations.json";

// ─── Core ───────────────────────────────────────────────────────────────────

function loadDb(): CorrelationDb {
  if (!existsSync(CORRELATION_FILE)) return { links: [], rootCauses: [] };
  return JSON.parse(readFileSync(CORRELATION_FILE, "utf-8"));
}

function saveDb(db: CorrelationDb): void {
  writeFileSync(CORRELATION_FILE, JSON.stringify(db, null, 2));
}

export function linkFindings(
  findingA: string,
  findingB: string,
  relationship: CorrelationLink["relationship"],
  notes?: string,
): CorrelationLink {
  const db = loadDb();
  // Avoid duplicates
  const existing = db.links.find(
    (l) => (l.findingA === findingA && l.findingB === findingB) || (l.findingA === findingB && l.findingB === findingA),
  );
  if (existing) {
    existing.relationship = relationship;
    existing.notes = notes;
    saveDb(db);
    return existing;
  }

  const link: CorrelationLink = {
    findingA,
    findingB,
    relationship,
    notes,
    createdAt: new Date().toISOString(),
  };
  db.links.push(link);
  saveDb(db);
  return link;
}

export function addRootCause(
  title: string,
  description: string,
  severity: RootCause["severity"],
  findingIds: string[],
): RootCause {
  const db = loadDb();
  const rootCause: RootCause = {
    id: `RC-${Date.now()}`,
    title,
    description,
    relatedFindings: findingIds,
    severity,
    createdAt: new Date().toISOString(),
  };
  db.rootCauses.push(rootCause);
  saveDb(db);
  return rootCause;
}

export function autoCorrelate(findings: Finding[]): CorrelationLink[] {
  const newLinks: CorrelationLink[] = [];
  const db = loadDb();

  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      const a = findings[i];
      const b = findings[j];

      // Same rule → likely related
      if (a.ruleId === b.ruleId) {
        const link: CorrelationLink = {
          findingA: `${a.ruleId}:${a.title}`,
          findingB: `${b.ruleId}:${b.title}`,
          relationship: "related",
          notes: "Same rule ID",
          createdAt: new Date().toISOString(),
        };
        newLinks.push(link);
      }

      // Same line range → possibly duplicate
      if (
        a.lineNumbers &&
        b.lineNumbers &&
        a.lineNumbers.length > 0 &&
        b.lineNumbers.length > 0 &&
        a.lineNumbers[0] === b.lineNumbers[0]
      ) {
        const link: CorrelationLink = {
          findingA: `${a.ruleId}:${a.title}`,
          findingB: `${b.ruleId}:${b.title}`,
          relationship: "duplicate",
          notes: `Same line: ${a.lineNumbers[0]}`,
          createdAt: new Date().toISOString(),
        };
        newLinks.push(link);
      }
    }
  }

  db.links.push(...newLinks);
  saveDb(db);
  return newLinks;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCorrelate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges correlate — Finding correlation and root-cause analysis

Usage:
  judges correlate --link <findingA> <findingB> --relationship related
  judges correlate --root-cause "Missing input validation" --severity high --findings "F1,F2,F3"
  judges correlate --auto                     Auto-correlate from results
  judges correlate --graph                    Show correlation graph
  judges correlate --root-causes              List root causes
  judges correlate --stats                    Correlation statistics

Options:
  --link <A> <B>           Link two findings
  --relationship <type>    same-root-cause | related | prerequisite | duplicate
  --notes <text>           Optional notes on the link
  --root-cause <title>     Create a root cause
  --description <text>     Root cause description
  --severity <level>       Root cause severity
  --findings <csv>         Comma-separated finding IDs
  --auto                   Auto-correlate findings
  --graph                  Show relationship graph
  --root-causes            List all root causes
  --stats                  Show statistics
  --format json            JSON output
  --help, -h               Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Link findings
  const linkIdx = argv.indexOf("--link");
  if (linkIdx >= 0 && argv[linkIdx + 1] && argv[linkIdx + 2]) {
    const findingA = argv[linkIdx + 1];
    const findingB = argv[linkIdx + 2];
    const rel =
      (argv.find((_a: string, i: number) => argv[i - 1] === "--relationship") as CorrelationLink["relationship"]) ||
      "related";
    const notes = argv.find((_a: string, i: number) => argv[i - 1] === "--notes");

    const link = linkFindings(findingA, findingB, rel, notes);
    if (format === "json") {
      console.log(JSON.stringify(link, null, 2));
    } else {
      console.log(`  ✅ Linked: ${findingA} ↔ ${findingB} (${rel})`);
    }
    return;
  }

  // Root cause
  const rootTitle = argv.find((_a: string, i: number) => argv[i - 1] === "--root-cause");
  if (rootTitle) {
    const desc = argv.find((_a: string, i: number) => argv[i - 1] === "--description") || rootTitle;
    const severity =
      (argv.find((_a: string, i: number) => argv[i - 1] === "--severity") as RootCause["severity"]) || "medium";
    const findingsStr = argv.find((_a: string, i: number) => argv[i - 1] === "--findings") || "";
    const findingIds = findingsStr.split(",").filter(Boolean);

    const rc = addRootCause(rootTitle, desc, severity, findingIds);
    if (format === "json") {
      console.log(JSON.stringify(rc, null, 2));
    } else {
      console.log(`  ✅ Root cause created: ${rc.id} — ${rc.title} (${rc.severity})`);
      console.log(`     Related findings: ${rc.relatedFindings.length}`);
    }
    return;
  }

  // Auto correlate
  if (argv.includes("--auto")) {
    const resultsFile = ".judges-results.json";
    if (!existsSync(resultsFile)) {
      console.error("  ❌ No .judges-results.json found. Run an evaluation first.");
      return;
    }
    try {
      const data = JSON.parse(readFileSync(resultsFile, "utf-8"));
      const findings: Finding[] = Array.isArray(data) ? data : data.findings || [];
      const links = autoCorrelate(findings);
      console.log(`  ✅ Auto-correlated ${links.length} link(s) from ${findings.length} findings`);
    } catch {
      console.error("  ❌ Failed to parse results file");
    }
    return;
  }

  const db = loadDb();

  // Root causes list
  if (argv.includes("--root-causes")) {
    if (format === "json") {
      console.log(JSON.stringify(db.rootCauses, null, 2));
    } else if (db.rootCauses.length === 0) {
      console.log("\n  No root causes identified.\n");
    } else {
      console.log(`\n  Root Causes (${db.rootCauses.length})\n  ────────────`);
      for (const rc of db.rootCauses) {
        console.log(
          `    [${rc.severity.toUpperCase()}] ${rc.id} — ${rc.title} (${rc.relatedFindings.length} findings)`,
        );
      }
      console.log("");
    }
    return;
  }

  // Stats
  if (argv.includes("--stats")) {
    const stats = {
      totalLinks: db.links.length,
      rootCauses: db.rootCauses.length,
      byRelationship: {
        related: db.links.filter((l) => l.relationship === "related").length,
        duplicate: db.links.filter((l) => l.relationship === "duplicate").length,
        sameRootCause: db.links.filter((l) => l.relationship === "same-root-cause").length,
        prerequisite: db.links.filter((l) => l.relationship === "prerequisite").length,
      },
    };
    if (format === "json") {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(`
  Correlation Statistics
  ──────────────────────
  Total links:       ${stats.totalLinks}
  Root causes:       ${stats.rootCauses}
  Related:           ${stats.byRelationship.related}
  Duplicates:        ${stats.byRelationship.duplicate}
  Same root cause:   ${stats.byRelationship.sameRootCause}
  Prerequisites:     ${stats.byRelationship.prerequisite}
`);
    }
    return;
  }

  // Default: graph view
  if (db.links.length === 0 && db.rootCauses.length === 0) {
    console.log("\n  No correlations. Use --link or --auto to start.\n");
    return;
  }
  if (format === "json") {
    console.log(JSON.stringify(db, null, 2));
  } else {
    console.log(
      `\n  Correlation Graph (${db.links.length} links, ${db.rootCauses.length} root causes)\n  ────────────────────`,
    );
    for (const l of db.links.slice(0, 20)) {
      const arrow = l.relationship === "prerequisite" ? "→" : "↔";
      console.log(`    ${l.findingA} ${arrow} ${l.findingB} [${l.relationship}]`);
    }
    if (db.links.length > 20) console.log(`    ... and ${db.links.length - 20} more`);
    console.log("");
  }
}
