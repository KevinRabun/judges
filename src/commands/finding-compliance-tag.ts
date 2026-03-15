import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-compliance-tag ─────────────────────────────────────────
   Tag findings with compliance framework identifiers (SOC2, HIPAA,
   PCI-DSS, GDPR, etc.) based on rule patterns and severity.
   Users maintain their own mapping files — no data leaves the host.
   ─────────────────────────────────────────────────────────────────── */

interface ComplianceMapping {
  framework: string;
  controls: { pattern: string; controlId: string; description: string }[];
}

interface TaggedFinding {
  ruleId: string;
  title: string;
  severity: string;
  tags: { framework: string; controlId: string; description: string }[];
}

const DEFAULT_MAPPINGS: ComplianceMapping[] = [
  {
    framework: "SOC2",
    controls: [
      { pattern: "auth", controlId: "CC6.1", description: "Logical access security" },
      { pattern: "crypto", controlId: "CC6.7", description: "Encryption of data" },
      { pattern: "injection", controlId: "CC7.1", description: "System monitoring" },
      { pattern: "secret", controlId: "CC6.1", description: "Credential management" },
    ],
  },
  {
    framework: "PCI-DSS",
    controls: [
      { pattern: "injection", controlId: "6.5.1", description: "Injection flaws" },
      { pattern: "xss", controlId: "6.5.7", description: "Cross-site scripting" },
      { pattern: "crypto", controlId: "3.4", description: "Render PAN unreadable" },
      { pattern: "auth", controlId: "8.2", description: "Authentication management" },
    ],
  },
  {
    framework: "GDPR",
    controls: [
      { pattern: "pii", controlId: "Art.25", description: "Data protection by design" },
      { pattern: "log", controlId: "Art.30", description: "Records of processing" },
      { pattern: "crypto", controlId: "Art.32", description: "Security of processing" },
    ],
  },
];

function loadMappings(mappingPath: string | undefined): ComplianceMapping[] {
  if (mappingPath && existsSync(mappingPath)) {
    try {
      return JSON.parse(readFileSync(mappingPath, "utf-8")) as ComplianceMapping[];
    } catch {
      console.log("Warning: could not parse mapping file, using defaults");
    }
  }
  return DEFAULT_MAPPINGS;
}

function tagFindings(verdict: TribunalVerdict, mappings: ComplianceMapping[]): TaggedFinding[] {
  const results: TaggedFinding[] = [];

  for (const f of verdict.findings ?? []) {
    const tags: TaggedFinding["tags"] = [];
    const ruleIdLower = f.ruleId.toLowerCase();
    const titleLower = f.title.toLowerCase();

    for (const mapping of mappings) {
      for (const ctrl of mapping.controls) {
        if (ruleIdLower.includes(ctrl.pattern) || titleLower.includes(ctrl.pattern)) {
          tags.push({ framework: mapping.framework, controlId: ctrl.controlId, description: ctrl.description });
        }
      }
    }

    results.push({ ruleId: f.ruleId, title: f.title, severity: f.severity, tags });
  }

  results.sort((a, b) => b.tags.length - a.tags.length);
  return results;
}

export function runFindingComplianceTag(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-compliance-tag [options]

Tag findings with compliance framework identifiers.

Options:
  --report <path>      Path to verdict JSON
  --mapping <path>     Path to custom compliance mapping JSON
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

  const mappingIdx = argv.indexOf("--mapping");
  const mappingPath = mappingIdx !== -1 && argv[mappingIdx + 1] ? join(process.cwd(), argv[mappingIdx + 1]) : undefined;

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const mappings = loadMappings(mappingPath);
  const tagged = tagFindings(data, mappings);

  if (format === "json") {
    console.log(JSON.stringify(tagged, null, 2));
    return;
  }

  const withTags = tagged.filter((t) => t.tags.length > 0);
  console.log(`\n=== Compliance Tags (${withTags.length} tagged of ${tagged.length} findings) ===\n`);

  if (withTags.length === 0) {
    console.log("No findings matched compliance patterns.");
    return;
  }

  for (const entry of withTags) {
    console.log(`  ${entry.severity.toUpperCase().padEnd(9)} ${entry.ruleId}`);
    console.log(`           ${entry.title}`);
    for (const tag of entry.tags) {
      console.log(`           [${tag.framework}] ${tag.controlId} — ${tag.description}`);
    }
    console.log();
  }
}
