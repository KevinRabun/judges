import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { TribunalVerdict } from "../types.js";

/* ── finding-patch-chain ────────────────────────────────────────────
   Link patches across findings by identifying findings that have
   patches and grouping them by application order and dependency.
   Helps developers apply fixes in the correct sequence.
   ─────────────────────────────────────────────────────────────────── */

interface PatchEntry {
  ruleId: string;
  title: string;
  severity: string;
  hasPatch: boolean;
  patchPreview: string;
  lineNumbers: number[];
}

interface PatchGroup {
  groupId: number;
  label: string;
  entries: PatchEntry[];
  applyOrder: string;
}

function buildPatchChains(verdict: TribunalVerdict): PatchGroup[] {
  const findings = verdict.findings ?? [];
  const withPatches: PatchEntry[] = [];
  const withoutPatches: PatchEntry[] = [];

  for (const f of findings) {
    const entry: PatchEntry = {
      ruleId: f.ruleId,
      title: f.title,
      severity: f.severity,
      hasPatch: f.patch !== undefined && f.patch !== null,
      patchPreview: f.patch !== undefined && f.patch !== null ? String(f.patch).slice(0, 80) : "",
      lineNumbers: f.lineNumbers ?? [],
    };

    if (entry.hasPatch) withPatches.push(entry);
    else withoutPatches.push(entry);
  }

  // Sort patches by line number (earliest first) for safe application order
  withPatches.sort((a, b) => {
    const aFirst = a.lineNumbers.length > 0 ? a.lineNumbers[0] : Infinity;
    const bFirst = b.lineNumbers.length > 0 ? b.lineNumbers[0] : Infinity;
    return bFirst - aFirst; // Apply from bottom up to avoid line shifts
  });

  const groups: PatchGroup[] = [];

  if (withPatches.length > 0) {
    groups.push({
      groupId: 1,
      label: "Patchable findings (apply bottom-up)",
      entries: withPatches,
      applyOrder: "Apply from highest line number to lowest to avoid line shifts",
    });
  }

  if (withoutPatches.length > 0) {
    groups.push({
      groupId: groups.length + 1,
      label: "Manual fixes required",
      entries: withoutPatches,
      applyOrder: "Fix in any order — no auto-patches available",
    });
  }

  return groups;
}

export function runFindingPatchChain(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: judges finding-patch-chain [options]

Link and order patches across findings for safe application.

Options:
  --report <path>      Path to verdict JSON
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

  if (!existsSync(reportPath)) {
    console.log(`No report found at: ${reportPath}`);
    return;
  }

  const data = JSON.parse(readFileSync(reportPath, "utf-8")) as TribunalVerdict;
  const groups = buildPatchChains(data);

  if (format === "json") {
    console.log(JSON.stringify(groups, null, 2));
    return;
  }

  const totalPatched = groups.filter((g) => g.label.includes("Patchable")).reduce((s, g) => s + g.entries.length, 0);
  const totalManual = groups.filter((g) => g.label.includes("Manual")).reduce((s, g) => s + g.entries.length, 0);

  console.log(`\n=== Patch Chain (${totalPatched} patchable, ${totalManual} manual) ===\n`);

  for (const group of groups) {
    console.log(`  Group #${group.groupId}: ${group.label}`);
    console.log(`  Order: ${group.applyOrder}\n`);

    for (const e of group.entries) {
      const lines = e.lineNumbers.length > 0 ? ` (L${e.lineNumbers.join(",")})` : "";
      console.log(`    [${e.severity.toUpperCase()}] ${e.ruleId}${lines}`);
      console.log(`           ${e.title}`);
      if (e.patchPreview) {
        console.log(`           Patch: ${e.patchPreview}...`);
      }
    }
    console.log();
  }
}
