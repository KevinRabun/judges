/**
 * Finding-annotation-layer — Add contextual annotations to findings.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Finding } from "../types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Annotation {
  ruleId: string;
  note: string;
  author: string;
  type: "context" | "false-positive" | "accepted-risk" | "defer";
  createdAt: string;
}

interface AnnotationStore {
  annotations: Annotation[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runFindingAnnotationLayer(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-annotations.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges finding-annotation-layer — Add annotations to findings

Usage:
  judges finding-annotation-layer [--store <path>]
    [--annotate <ruleId> --note <text> --author <name> --type <type>]
    [--report <path>] [--remove <ruleId>] [--format table|json]

Options:
  --store <path>     Annotation store (default: .judges-annotations.json)
  --annotate <rule>  Add annotation for ruleId
  --note <text>      Annotation text
  --author <name>    Author name
  --type <type>      Type: context, false-positive, accepted-risk, defer
  --report <path>    Overlay annotations onto report findings
  --remove <rule>    Remove annotations for ruleId
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  let store: AnnotationStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as AnnotationStore;
  } else {
    store = { annotations: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add annotation
  const annotateIdx = argv.indexOf("--annotate");
  if (annotateIdx >= 0) {
    const ruleId = argv[annotateIdx + 1];
    const noteIdx = argv.indexOf("--note");
    const authorIdx = argv.indexOf("--author");
    const typeIdx = argv.indexOf("--type");

    const annotation: Annotation = {
      ruleId,
      note: noteIdx >= 0 ? argv[noteIdx + 1] : "",
      author: authorIdx >= 0 ? argv[authorIdx + 1] : "unknown",
      type: (typeIdx >= 0 ? argv[typeIdx + 1] : "context") as Annotation["type"],
      createdAt: new Date().toISOString().split("T")[0],
    };

    store.annotations.push(annotation);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Annotation added for: ${ruleId}`);
    return;
  }

  // Remove annotations
  const removeIdx = argv.indexOf("--remove");
  if (removeIdx >= 0) {
    const ruleId = argv[removeIdx + 1];
    const before = store.annotations.length;
    store.annotations = store.annotations.filter((a) => a.ruleId !== ruleId);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Removed ${before - store.annotations.length} annotation(s) for: ${ruleId}`);
    return;
  }

  // Overlay on report
  const reportIdx = argv.indexOf("--report");
  if (reportIdx >= 0) {
    const reportPath = argv[reportIdx + 1];
    if (!existsSync(reportPath)) {
      console.error(`Report not found: ${reportPath}`);
      process.exitCode = 1;
      return;
    }

    const report = JSON.parse(readFileSync(reportPath, "utf-8")) as { findings?: Finding[] };
    const findings = report.findings ?? [];

    const annotated = findings.map((f) => {
      const matching = store.annotations.filter((a) => a.ruleId === f.ruleId);
      return {
        ruleId: f.ruleId,
        title: f.title,
        severity: f.severity,
        annotations: matching,
      };
    });

    if (format === "json") {
      console.log(JSON.stringify(annotated, null, 2));
      return;
    }

    console.log(`\nAnnotated Findings`);
    console.log("═".repeat(65));

    for (const af of annotated) {
      console.log(`  ${af.ruleId} [${af.severity}] — ${af.title}`);
      if (af.annotations.length > 0) {
        for (const a of af.annotations) {
          console.log(`    [${a.type}] ${a.note} (by ${a.author}, ${a.createdAt})`);
        }
      } else {
        console.log("    (no annotations)");
      }
    }

    console.log("═".repeat(65));
    return;
  }

  // List all annotations
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nFinding Annotations`);
  console.log("═".repeat(65));

  if (store.annotations.length === 0) {
    console.log("  No annotations. Use --annotate <ruleId> to add one.");
  } else {
    for (const a of store.annotations) {
      console.log(`  ${a.ruleId.padEnd(25)} [${a.type}]`);
      console.log(`    ${a.note} — ${a.author} (${a.createdAt})`);
    }
  }

  console.log("═".repeat(65));
}
