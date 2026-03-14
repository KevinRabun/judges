/**
 * Review-approval — Approval workflows for review results.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApprovalEntry {
  id: string;
  reviewId: string;
  approver: string;
  status: "pending" | "approved" | "rejected";
  comment: string;
  timestamp: string;
  score: number;
}

interface ApprovalStore {
  version: string;
  entries: ApprovalEntry[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const APPROVAL_FILE = join(".judges", "approvals.json");

function loadStore(): ApprovalStore {
  if (!existsSync(APPROVAL_FILE)) return { version: "1.0.0", entries: [] };
  try {
    return JSON.parse(readFileSync(APPROVAL_FILE, "utf-8")) as ApprovalStore;
  } catch {
    return { version: "1.0.0", entries: [] };
  }
}

function saveStore(store: ApprovalStore): void {
  mkdirSync(dirname(APPROVAL_FILE), { recursive: true });
  writeFileSync(APPROVAL_FILE, JSON.stringify(store, null, 2), "utf-8");
}

function generateId(): string {
  return `apr-${Date.now().toString(36)}`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewApproval(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-approval — Approval workflows for review results

Usage:
  judges review-approval request --review rev-123 --approver alice
  judges review-approval approve --id apr-abc --comment "Looks good"
  judges review-approval reject --id apr-abc --comment "Needs fixes"
  judges review-approval list
  judges review-approval clear

Subcommands:
  request               Request approval for a review
  approve               Approve a pending request
  reject                Reject a pending request
  list                  List all approval entries
  clear                 Clear all approval data

Options:
  --review <id>         Review ID
  --approver <name>     Approver name
  --id <id>             Approval entry ID
  --comment <text>      Approval/rejection comment
  --score <n>           Review score
  --format json         JSON output
  --help, -h            Show this help

Approval data stored locally in .judges/approvals.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["request", "approve", "reject", "list", "clear"].includes(a)) || "list";
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const store = loadStore();

  if (subcommand === "request") {
    const reviewId = argv.find((_a: string, i: number) => argv[i - 1] === "--review") || "";
    const approver = argv.find((_a: string, i: number) => argv[i - 1] === "--approver") || "";
    const score = parseFloat(argv.find((_a: string, i: number) => argv[i - 1] === "--score") || "0");
    if (!reviewId || !approver) {
      console.error("Error: --review and --approver are required.");
      process.exitCode = 1;
      return;
    }
    const id = generateId();
    store.entries.push({
      id,
      reviewId,
      approver,
      status: "pending",
      comment: "",
      timestamp: new Date().toISOString(),
      score,
    });
    saveStore(store);
    console.log(`Approval request ${id} created for review ${reviewId} (approver: ${approver}).`);
    return;
  }

  if (subcommand === "approve" || subcommand === "reject") {
    const id = argv.find((_a: string, i: number) => argv[i - 1] === "--id");
    const comment = argv.find((_a: string, i: number) => argv[i - 1] === "--comment") || "";
    if (!id) {
      console.error("Error: --id is required.");
      process.exitCode = 1;
      return;
    }
    const entry = store.entries.find((e) => e.id === id);
    if (!entry) {
      console.error(`Error: Approval "${id}" not found.`);
      process.exitCode = 1;
      return;
    }
    entry.status = subcommand === "approve" ? "approved" : "rejected";
    entry.comment = comment;
    entry.timestamp = new Date().toISOString();
    saveStore(store);
    console.log(`${subcommand === "approve" ? "Approved" : "Rejected"} ${id}.`);
    return;
  }

  if (subcommand === "clear") {
    saveStore({ version: "1.0.0", entries: [] });
    console.log("Approval data cleared.");
    return;
  }

  // list
  if (store.entries.length === 0) {
    console.log("No approval entries. Use 'judges review-approval request' to start.");
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store.entries, null, 2));
    return;
  }

  const pending = store.entries.filter((e) => e.status === "pending");
  const approved = store.entries.filter((e) => e.status === "approved");
  const rejected = store.entries.filter((e) => e.status === "rejected");

  console.log("\nApproval Dashboard:");
  console.log("═".repeat(60));
  console.log(`  Pending: ${pending.length}  Approved: ${approved.length}  Rejected: ${rejected.length}`);
  console.log("═".repeat(60));

  for (const e of store.entries) {
    const icon = e.status === "approved" ? "✓" : e.status === "rejected" ? "✗" : "○";
    console.log(`  ${icon} ${e.id}  review=${e.reviewId}  approver=${e.approver}  ${e.status}`);
    if (e.comment) console.log(`    Comment: ${e.comment}`);
  }
  console.log("═".repeat(60));
}
