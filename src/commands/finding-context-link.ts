import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-context-link ───────────────────────────────────────────
   Link findings to relevant documentation and context based on
   rule IDs and categories. Generates useful reference links from
   a local documentation index. No external data sent.
   ─────────────────────────────────────────────────────────────────── */

interface DocReference {
  category: string;
  title: string;
  path: string;
}

interface LinkedFinding {
  ruleId: string;
  title: string;
  severity: string;
  references: DocReference[];
}

const DEFAULT_DOC_INDEX: Record<string, DocReference[]> = {
  injection: [
    { category: "OWASP", title: "Injection Prevention", path: "docs/owasp-injection.md" },
    { category: "CWE", title: "CWE-89 SQL Injection", path: "docs/cwe-89.md" },
  ],
  xss: [
    { category: "OWASP", title: "XSS Prevention", path: "docs/owasp-xss.md" },
    { category: "CWE", title: "CWE-79 Cross-Site Scripting", path: "docs/cwe-79.md" },
  ],
  auth: [
    { category: "OWASP", title: "Authentication Best Practices", path: "docs/owasp-auth.md" },
    { category: "CWE", title: "CWE-287 Improper Authentication", path: "docs/cwe-287.md" },
  ],
  crypto: [
    { category: "OWASP", title: "Cryptographic Failures", path: "docs/owasp-crypto.md" },
    { category: "CWE", title: "CWE-327 Broken Crypto", path: "docs/cwe-327.md" },
  ],
  access: [
    { category: "OWASP", title: "Broken Access Control", path: "docs/owasp-access.md" },
    { category: "CWE", title: "CWE-284 Access Control", path: "docs/cwe-284.md" },
  ],
  quality: [{ category: "Guide", title: "Code Quality Guidelines", path: "docs/quality-guide.md" }],
};

function loadDocIndex(indexPath: string | undefined): Record<string, DocReference[]> {
  if (indexPath && existsSync(indexPath)) {
    try {
      return JSON.parse(readFileSync(indexPath, "utf-8")) as Record<string, DocReference[]>;
    } catch {
      console.log("Warning: could not parse doc index, using defaults");
    }
  }
  return DEFAULT_DOC_INDEX;
}

function linkFindings(verdict: TribunalVerdict, docIndex: Record<string, DocReference[]>): LinkedFinding[] {
  const results: LinkedFinding[] = [];

  for (const f of verdict.findings ?? []) {
    const combined = (f.ruleId + " " + f.title).toLowerCase();
    const refs: DocReference[] = [];

    for (const [keyword, docs] of Object.entries(docIndex)) {
      if (combined.includes(keyword)) {
        for (const doc of docs) refs.push(doc);
      }
    }

    results.push({ ruleId: f.ruleId, title: f.title, severity: f.severity, references: refs });
  }

  results.sort((a, b) => b.references.length - a.references.length);
  return results;
}

export function runFindingContextLink(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-context-link [options]

Link findings to relevant documentation.

Options:
  --report <path>      Path to verdict JSON
  --docs <path>        Path to custom documentation index JSON
  --format <fmt>       Output format: table (default) or json
  -h, --help           Show this help message`);
    return;
  }

  const formatIdx = argv.indexOf("--format");
  const format = formatIdx !== -1 && argv[formatIdx + 1] ? argv[formatIdx + 1] : "table";

  const reportIdx = argv.indexOf("--report");
  const reportPath =
    reportIdx !== -1 && argv[reportIdx + 1]
      ? join(process.cwd(), argv[reportIdx + 1])
      : join(process.cwd(), ".judges", "last-verdict.json");

  const docsIdx = argv.indexOf("--docs");
  const docsPath = docsIdx !== -1 && argv[docsIdx + 1] ? join(process.cwd(), argv[docsIdx + 1]) : undefined;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const docIndex = loadDocIndex(docsPath);
  const linked = linkFindings(data, docIndex);

  if (format === "json") {
    console.log(JSON.stringify(linked, null, 2));
    return;
  }

  const withRefs = linked.filter((l) => l.references.length > 0);
  console.log(`\n=== Context Links (${withRefs.length} linked of ${linked.length} findings) ===\n`);

  for (const entry of withRefs) {
    console.log(`  [${entry.severity.toUpperCase()}] ${entry.ruleId}: ${entry.title}`);
    for (const ref of entry.references) {
      console.log(`    [${ref.category}] ${ref.title} — ${ref.path}`);
    }
    console.log();
  }
}
