/**
 * Approve chain — define multi-stage approval workflows for
 * AI-generated code based on finding severity and code sensitivity.
 *
 * Configuration-driven. Data stored in `.judges-approvals/`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApprovalRule {
  name: string;
  pathPattern: string;
  minSeverity: string;
  requiredApprovers: number;
  roles: string[];
  autoApproveAfterHours?: number;
}

interface ApprovalRequest {
  id: string;
  file: string;
  finding: string;
  severity: string;
  matchedRule: string;
  requiredApprovers: number;
  approvals: Array<{ approver: string; role: string; timestamp: string }>;
  status: "pending" | "approved" | "blocked";
  createdAt: string;
}

interface ApprovalConfig {
  rules: ApprovalRule[];
  requests: ApprovalRequest[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const DATA_DIR = ".judges-approvals";

function ensureDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadConfig(): ApprovalConfig {
  const file = join(DATA_DIR, "config.json");
  if (!existsSync(file)) return { rules: [], requests: [] };
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return { rules: [], requests: [] };
  }
}

function saveConfig(config: ApprovalConfig): void {
  ensureDir();
  writeFileSync(join(DATA_DIR, "config.json"), JSON.stringify(config, null, 2));
}

// ─── Default Rules ──────────────────────────────────────────────────────────

const DEFAULT_RULES: ApprovalRule[] = [
  {
    name: "auth-critical",
    pathPattern: "src/auth",
    minSeverity: "critical",
    requiredApprovers: 2,
    roles: ["senior", "security-lead"],
  },
  { name: "auth-high", pathPattern: "src/auth", minSeverity: "high", requiredApprovers: 1, roles: ["senior"] },
  {
    name: "api-critical",
    pathPattern: "src/api",
    minSeverity: "critical",
    requiredApprovers: 2,
    roles: ["senior", "tech-lead"],
  },
  {
    name: "test-auto",
    pathPattern: "tests/",
    minSeverity: "medium",
    requiredApprovers: 0,
    roles: [],
    autoApproveAfterHours: 24,
  },
  { name: "default-high", pathPattern: "*", minSeverity: "high", requiredApprovers: 1, roles: ["senior"] },
];

// ─── Matching ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function matchRule(file: string, severity: string, rules: ApprovalRule[]): ApprovalRule | null {
  const sevLevel = SEVERITY_ORDER[severity] || 0;

  for (const rule of rules) {
    const ruleLevel = SEVERITY_ORDER[rule.minSeverity] || 0;
    if (sevLevel < ruleLevel) continue;

    if (rule.pathPattern === "*" || file.includes(rule.pathPattern)) {
      return rule;
    }
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runApproveChain(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges approve-chain — Multi-stage approval workflows

Usage:
  judges approve-chain --init                    Initialize with default rules
  judges approve-chain --request --file src/auth/login.ts --finding SEC-001 --severity critical
  judges approve-chain --approve <id> --approver "alice" --role senior
  judges approve-chain --status
  judges approve-chain --rules

Options:
  --init                Initialize approval config with default rules
  --request             Create an approval request
  --file <path>         File path for the request
  --finding <id>        Finding/rule ID
  --severity <level>    Finding severity
  --approve <id>        Approve a pending request
  --approver <name>     Approver name
  --role <role>         Approver role
  --status              Show all pending/approved requests
  --rules               Show configured approval rules
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const isInit = argv.includes("--init");
  const isRequest = argv.includes("--request");
  const isApprove = argv.includes("--approve");
  const isStatus = argv.includes("--status");
  const isRules = argv.includes("--rules");

  if (isInit) {
    const config = loadConfig();
    if (config.rules.length === 0) {
      config.rules = DEFAULT_RULES;
      saveConfig(config);
      console.log(`  ✅ Initialized with ${DEFAULT_RULES.length} default approval rules`);
      for (const r of DEFAULT_RULES) {
        console.log(
          `    ${r.name}: ${r.pathPattern} @ ${r.minSeverity}+ → ${r.requiredApprovers} approver(s) [${r.roles.join(", ")}]`,
        );
      }
    } else {
      console.log(`  Already initialized with ${config.rules.length} rules. Edit ${DATA_DIR}/config.json to modify.`);
    }
    return;
  }

  if (isRequest) {
    const file = argv.find((_a: string, i: number) => argv[i - 1] === "--file") || "";
    const finding = argv.find((_a: string, i: number) => argv[i - 1] === "--finding") || "";
    const severity = argv.find((_a: string, i: number) => argv[i - 1] === "--severity") || "medium";

    if (!file || !finding) {
      console.error("  --file and --finding are required");
      return;
    }

    const config = loadConfig();
    const rule = matchRule(file, severity, config.rules);

    if (!rule) {
      console.log(`  ✅ No approval required for ${file} @ ${severity}`);
      return;
    }

    if (rule.requiredApprovers === 0) {
      const hours = rule.autoApproveAfterHours || 24;
      console.log(`  ✅ Auto-approved (rule: ${rule.name}) — will clear after ${hours}h`);
      return;
    }

    const request: ApprovalRequest = {
      id: `apr-${Date.now()}`,
      file,
      finding,
      severity,
      matchedRule: rule.name,
      requiredApprovers: rule.requiredApprovers,
      approvals: [],
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    config.requests.push(request);
    saveConfig(config);
    console.log(`  📋 Approval requested: ${request.id}`);
    console.log(`    Rule: ${rule.name} | Required: ${rule.requiredApprovers} approver(s) [${rule.roles.join(", ")}]`);
    return;
  }

  if (isApprove) {
    const approveIdx = argv.indexOf("--approve") + 1;
    const requestId = argv[approveIdx] || "";
    const approver = argv.find((_a: string, i: number) => argv[i - 1] === "--approver") || "";
    const role = argv.find((_a: string, i: number) => argv[i - 1] === "--role") || "";

    if (!requestId || !approver) {
      console.error("  --approve <id> and --approver are required");
      return;
    }

    const config = loadConfig();
    const request = config.requests.find((r) => r.id === requestId);
    if (!request) {
      console.error(`  Request '${requestId}' not found`);
      return;
    }

    if (request.status === "approved") {
      console.log(`  Already approved: ${requestId}`);
      return;
    }

    request.approvals.push({ approver, role, timestamp: new Date().toISOString() });
    if (request.approvals.length >= request.requiredApprovers) {
      request.status = "approved";
    }

    saveConfig(config);
    const icon = request.status === "approved" ? "✅" : "📋";
    console.log(
      `  ${icon} ${approver} approved (${request.approvals.length}/${request.requiredApprovers}) — ${request.status}`,
    );
    return;
  }

  if (isRules) {
    const config = loadConfig();
    if (config.rules.length === 0) {
      console.log("  No rules configured. Use --init for defaults.");
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(config.rules, null, 2));
    } else {
      console.log(`\n  Approval Rules (${config.rules.length}):\n  ──────────────────────────`);
      for (const r of config.rules) {
        const auto = r.autoApproveAfterHours ? ` (auto after ${r.autoApproveAfterHours}h)` : "";
        console.log(
          `    ${r.name.padEnd(20)} ${r.pathPattern.padEnd(15)} ${r.minSeverity}+ → ${r.requiredApprovers} [${r.roles.join(", ")}]${auto}`,
        );
      }
      console.log("");
    }
    return;
  }

  if (isStatus) {
    const config = loadConfig();
    const pending = config.requests.filter((r) => r.status === "pending");
    const approved = config.requests.filter((r) => r.status === "approved");

    if (format === "json") {
      console.log(
        JSON.stringify(
          { pending, approved, total: config.requests.length, timestamp: new Date().toISOString() },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `\n  Approval Status — ${pending.length} pending, ${approved.length} approved\n  ──────────────────────────`,
      );

      if (pending.length > 0) {
        console.log("\n    Pending:");
        for (const r of pending) {
          console.log(`      ⏳ ${r.id} — ${r.file} [${r.severity}] ${r.finding}`);
          console.log(`          ${r.approvals.length}/${r.requiredApprovers} approvals (rule: ${r.matchedRule})`);
        }
      }

      if (approved.length > 0) {
        console.log("\n    Approved:");
        for (const r of approved.slice(-5)) {
          console.log(`      ✅ ${r.id} — ${r.file} [${r.severity}] ${r.finding}`);
        }
      }

      if (pending.length === 0 && approved.length === 0) {
        console.log("    No requests. Use --request to create one.");
      }
      console.log("");
    }
    return;
  }

  console.log("  Use --init, --request, --approve, --status, or --rules. See --help for details.");
}
