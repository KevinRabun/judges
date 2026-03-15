import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-fix-playbook ───────────────────────────────────────────
   Generate fix playbooks for common finding patterns. Maps findings
   to step-by-step remediation guides based on rule categories.
   All playbook content is generated locally from rule metadata.
   ─────────────────────────────────────────────────────────────────── */

interface PlaybookStep {
  step: number;
  action: string;
  detail: string;
}

interface PlaybookEntry {
  ruleId: string;
  title: string;
  severity: string;
  category: string;
  steps: PlaybookStep[];
}

const CATEGORY_PLAYBOOKS: Record<string, PlaybookStep[]> = {
  injection: [
    { step: 1, action: "Identify input source", detail: "Trace the user-controlled input to the vulnerable sink" },
    { step: 2, action: "Apply parameterization", detail: "Replace string concatenation with parameterized queries" },
    { step: 3, action: "Add input validation", detail: "Validate and sanitize input at the boundary" },
    { step: 4, action: "Test with payloads", detail: "Verify fix with common injection payloads" },
  ],
  auth: [
    { step: 1, action: "Review auth flow", detail: "Map the authentication and authorization paths" },
    { step: 2, action: "Enforce least privilege", detail: "Ensure minimal required permissions are granted" },
    { step: 3, action: "Add session validation", detail: "Verify session tokens are properly validated" },
    { step: 4, action: "Audit access logs", detail: "Check access logs for unauthorized attempts" },
  ],
  crypto: [
    { step: 1, action: "Identify weak algorithms", detail: "Find deprecated or weak cryptographic algorithms" },
    { step: 2, action: "Upgrade to modern standards", detail: "Replace with AES-256, SHA-256+, or stronger" },
    { step: 3, action: "Rotate keys", detail: "Generate new keys and rotate existing ones" },
    { step: 4, action: "Verify implementation", detail: "Test encryption/decryption round-trips" },
  ],
  quality: [
    { step: 1, action: "Locate code smell", detail: "Identify the specific quality issue in the code" },
    { step: 2, action: "Refactor", detail: "Apply appropriate refactoring pattern" },
    { step: 3, action: "Add tests", detail: "Write unit tests to cover the refactored code" },
    { step: 4, action: "Code review", detail: "Have the change reviewed for correctness" },
  ],
  default: [
    { step: 1, action: "Analyze finding", detail: "Understand the root cause and severity" },
    { step: 2, action: "Plan remediation", detail: "Determine the most appropriate fix approach" },
    { step: 3, action: "Implement fix", detail: "Apply the fix following best practices" },
    { step: 4, action: "Verify fix", detail: "Run tests and confirm the issue is resolved" },
  ],
};

function categorize(ruleId: string, title: string): string {
  const combined = (ruleId + " " + title).toLowerCase();
  if (combined.includes("injection") || combined.includes("sql") || combined.includes("xss")) return "injection";
  if (combined.includes("auth") || combined.includes("permission") || combined.includes("access")) return "auth";
  if (combined.includes("crypto") || combined.includes("encrypt") || combined.includes("hash")) return "crypto";
  if (combined.includes("quality") || combined.includes("smell") || combined.includes("complexity")) return "quality";
  return "default";
}

function generatePlaybooks(verdict: TribunalVerdict): PlaybookEntry[] {
  const results: PlaybookEntry[] = [];

  for (const f of verdict.findings ?? []) {
    const category = categorize(f.ruleId, f.title);
    const steps = CATEGORY_PLAYBOOKS[category] ?? CATEGORY_PLAYBOOKS["default"];

    results.push({
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      category,
      steps,
    });
  }

  return results;
}

export function runFindingFixPlaybook(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-fix-playbook [options]

Generate fix playbooks for findings.

Options:
  --report <path>      Path to verdict JSON
  --format <fmt>       Output format: table (default), json, or markdown
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

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const playbooks = generatePlaybooks(data);

  if (format === "json") {
    console.log(JSON.stringify(playbooks, null, 2));
    return;
  }

  if (format === "markdown") {
    for (const pb of playbooks) {
      console.log(`## ${pb.ruleId} — ${pb.title}\n`);
      console.log(`**Severity:** ${pb.severity} | **Category:** ${pb.category}\n`);
      for (const s of pb.steps) {
        console.log(`${s.step}. **${s.action}**: ${s.detail}`);
      }
      console.log();
    }
    return;
  }

  console.log(`\n=== Fix Playbooks (${playbooks.length} findings) ===\n`);

  for (const pb of playbooks) {
    console.log(`  [${pb.severity.toUpperCase()}] ${pb.ruleId}: ${pb.title}`);
    console.log(`  Category: ${pb.category}`);
    for (const s of pb.steps) {
      console.log(`    ${s.step}. ${s.action} — ${s.detail}`);
    }
    console.log();
  }
}
