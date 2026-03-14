/**
 * Review-annotation — Add annotations to review result files.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Annotation {
  id: string;
  targetFile: string;
  ruleId: string;
  note: string;
  author: string;
  createdAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function annotationFile(): string {
  return join(process.cwd(), ".judges", "annotations.json");
}

function loadAnnotations(): Annotation[] {
  const f = annotationFile();
  if (!existsSync(f)) return [];
  try {
    return JSON.parse(readFileSync(f, "utf-8"));
  } catch {
    return [];
  }
}

function saveAnnotations(annotations: Annotation[]): void {
  const f = annotationFile();
  const d = dirname(f);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  writeFileSync(f, JSON.stringify(annotations, null, 2));
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewAnnotation(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-annotation — Annotate review results

Usage:
  judges review-annotation add    --file <path> --rule <ruleId> --note <text> [--author <name>]
  judges review-annotation list   [--file <path>] [--rule <ruleId>]
  judges review-annotation remove --id <id>
  judges review-annotation clear  [--file <path>]
  judges review-annotation export [--format json]

Options:
  --file <path>      Target result file
  --rule <ruleId>    Rule ID to annotate
  --note <text>      Annotation text
  --author <name>    Author name (default: anonymous)
  --id <id>          Annotation ID for removal
  --format json      JSON output
  --help, -h         Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const annotations = loadAnnotations();

  if (sub === "add") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file") || "";
    const rule = args.find((_a: string, i: number) => args[i - 1] === "--rule") || "";
    const note = args.find((_a: string, i: number) => args[i - 1] === "--note");
    const author = args.find((_a: string, i: number) => args[i - 1] === "--author") || "anonymous";
    if (!note) {
      console.error("Error: --note required");
      process.exitCode = 1;
      return;
    }

    const id = `ann-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    annotations.push({ id, targetFile: file, ruleId: rule, note, author, createdAt: new Date().toISOString() });
    saveAnnotations(annotations);
    console.log(`Annotation added: ${id}`);
  } else if (sub === "list") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file");
    const rule = args.find((_a: string, i: number) => args[i - 1] === "--rule");

    let filtered = annotations;
    if (file) filtered = filtered.filter((a) => a.targetFile === file);
    if (rule) filtered = filtered.filter((a) => a.ruleId === rule);

    if (filtered.length === 0) {
      console.log("No annotations found.");
      return;
    }

    console.log(`\nAnnotations (${filtered.length}):`);
    console.log("═".repeat(65));
    for (const a of filtered) {
      console.log(`  [${a.id}] ${a.ruleId || "(any)"}  by ${a.author}  ${a.createdAt.slice(0, 10)}`);
      console.log(`    ${a.note}`);
    }
    console.log("═".repeat(65));
  } else if (sub === "remove") {
    const id = args.find((_a: string, i: number) => args[i - 1] === "--id");
    if (!id) {
      console.error("Error: --id required");
      process.exitCode = 1;
      return;
    }
    const filtered = annotations.filter((a) => a.id !== id);
    if (filtered.length === annotations.length) {
      console.error(`Annotation "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    saveAnnotations(filtered);
    console.log(`Removed annotation: ${id}`);
  } else if (sub === "clear") {
    const file = args.find((_a: string, i: number) => args[i - 1] === "--file");
    if (file) {
      const filtered = annotations.filter((a) => a.targetFile !== file);
      saveAnnotations(filtered);
      console.log(`Cleared annotations for: ${file}`);
    } else {
      saveAnnotations([]);
      console.log("All annotations cleared.");
    }
  } else if (sub === "export") {
    const format = args.find((_a: string, i: number) => args[i - 1] === "--format") || "json";
    if (format === "json") {
      console.log(JSON.stringify(annotations, null, 2));
    } else {
      for (const a of annotations) {
        console.log(`${a.id}\t${a.ruleId}\t${a.author}\t${a.note}`);
      }
    }
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
