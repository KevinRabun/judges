import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-owner-notify ───────────────────────────────────────────
   Generate ownership-based notification lists for findings.
   Maps findings to code owners using a local CODEOWNERS-style file
   and prepares notification summaries per owner.
   ─────────────────────────────────────────────────────────────────── */

interface OwnerMapping {
  pattern: string;
  owners: string[];
}

interface OwnerNotification {
  owner: string;
  findings: { ruleId: string; title: string; severity: string }[];
  highestSeverity: string;
}

function loadOwnerMappings(mappingPath: string): OwnerMapping[] {
  if (!existsSync(mappingPath)) return [];

  try {
    const content = readFileSync(mappingPath, "utf-8");
    // Support simple JSON format: [{ "pattern": "auth", "owners": ["@alice"] }]
    return JSON.parse(content) as OwnerMapping[];
  } catch {
    // Try CODEOWNERS-like format: pattern @owner1 @owner2
    const lines = readFileSync(mappingPath, "utf-8").split("\n");
    const mappings: OwnerMapping[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        mappings.push({ pattern: parts[0], owners: parts.slice(1) });
      }
    }
    return mappings;
  }
}

const SEVERITY_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function rankToSev(rank: number): string {
  if (rank >= 5) return "critical";
  if (rank >= 4) return "high";
  if (rank >= 3) return "medium";
  if (rank >= 2) return "low";
  return "info";
}

function buildNotifications(verdict: TribunalVerdict, mappings: OwnerMapping[]): OwnerNotification[] {
  const ownerMap = new Map<string, { findings: OwnerNotification["findings"]; maxRank: number }>();

  for (const f of verdict.findings ?? []) {
    const ruleIdLower = f.ruleId.toLowerCase();
    const titleLower = f.title.toLowerCase();
    let matched = false;

    for (const mapping of mappings) {
      if (ruleIdLower.includes(mapping.pattern.toLowerCase()) || titleLower.includes(mapping.pattern.toLowerCase())) {
        for (const owner of mapping.owners) {
          const entry = ownerMap.get(owner) ?? { findings: [], maxRank: 0 };
          entry.findings.push({ ruleId: f.ruleId, title: f.title, severity: f.severity });
          entry.maxRank = Math.max(entry.maxRank, SEVERITY_RANK[f.severity] ?? 0);
          ownerMap.set(owner, entry);
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      const entry = ownerMap.get("unassigned") ?? { findings: [], maxRank: 0 };
      entry.findings.push({ ruleId: f.ruleId, title: f.title, severity: f.severity });
      entry.maxRank = Math.max(entry.maxRank, SEVERITY_RANK[f.severity] ?? 0);
      ownerMap.set("unassigned", entry);
    }
  }

  const results: OwnerNotification[] = [];
  for (const [owner, data] of ownerMap) {
    results.push({
      owner,
      findings: data.findings,
      highestSeverity: rankToSev(data.maxRank),
    });
  }

  results.sort((a, b) => (SEVERITY_RANK[b.highestSeverity] ?? 0) - (SEVERITY_RANK[a.highestSeverity] ?? 0));
  return results;
}

export function runFindingOwnerNotify(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-owner-notify [options]

Generate ownership-based notification lists for findings.

Options:
  --report <path>      Path to verdict JSON
  --owners <path>      Path to owner mapping file (JSON or CODEOWNERS format)
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

  const ownersIdx = argv.indexOf("--owners");
  const ownersPath =
    ownersIdx !== -1 && argv[ownersIdx + 1]
      ? join(process.cwd(), argv[ownersIdx + 1])
      : join(process.cwd(), ".judges", "owners.json");

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const mappings = loadOwnerMappings(ownersPath);
  const notifications = buildNotifications(data, mappings);

  if (format === "json") {
    console.log(JSON.stringify(notifications, null, 2));
    return;
  }

  console.log(`\n=== Owner Notifications (${notifications.length} owners) ===\n`);

  if (notifications.length === 0) {
    console.log("No findings to notify about.");
    return;
  }

  for (const n of notifications) {
    console.log(`  ${n.owner} (${n.findings.length} findings, highest: ${n.highestSeverity})`);
    for (const f of n.findings) {
      console.log(`    [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
    }
    console.log();
  }
}
