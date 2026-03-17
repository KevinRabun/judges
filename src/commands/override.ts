/**
 * `judges override` — Structured exception/override workflow for gating.
 *
 * When the PR gate blocks a merge, developers can log a justified override
 * rather than disabling the entire check. Overrides are tracked in an
 * auditable log (.judges-overrides.json) with required justification.
 *
 * Usage:
 *   judges override add --rule SEC-001 --reason "Mitigated by WAF" --approver "jane@co.com"
 *   judges override list                       # Show active overrides
 *   judges override revoke --rule SEC-001      # Revoke an override
 *   judges override check --file src/app.ts    # Check if findings have applicable overrides
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { matchGlobPath } from "../tools/command-safety.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Override {
  /** Rule ID being overridden (e.g. "SEC-001") or prefix (e.g. "SEC-*") */
  ruleId: string;
  /** Required: why this override is justified */
  reason: string;
  /** Who approved the override */
  approver?: string;
  /** Optional: scope to specific file paths (glob patterns) */
  filePaths?: string[];
  /** When the override was created */
  createdAt: string;
  /** Optional expiry date — override expires after this date */
  expiresAt?: string;
  /** Whether the override is currently active */
  active: boolean;
  /** When it was revoked (if applicable) */
  revokedAt?: string;
  /** Who revoked it */
  revokedBy?: string;
}

export interface OverrideStore {
  version: 1;
  overrides: Override[];
  metadata: {
    createdAt: string;
    lastUpdated: string;
  };
}

// ─── Store I/O ──────────────────────────────────────────────────────────────

const OVERRIDE_FILE = ".judges-overrides.json";

function createEmptyStore(): OverrideStore {
  const now = new Date().toISOString();
  return { version: 1, overrides: [], metadata: { createdAt: now, lastUpdated: now } };
}

export function loadOverrideStore(dir: string = "."): OverrideStore {
  const filePath = resolve(dir, OVERRIDE_FILE);
  if (!existsSync(filePath)) return createEmptyStore();
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    if (raw.version === 1 && Array.isArray(raw.overrides)) return raw as OverrideStore;
    return createEmptyStore();
  } catch {
    return createEmptyStore();
  }
}

export function saveOverrideStore(store: OverrideStore, dir: string = "."): void {
  const filePath = resolve(dir, OVERRIDE_FILE);
  const d = dirname(filePath);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
  store.metadata.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(store, null, 2) + "\n", "utf-8");
}

// ─── Override Logic ─────────────────────────────────────────────────────────

/**
 * Check if a finding's rule ID matches an active, non-expired override.
 */
export function isOverridden(ruleId: string, filePath: string | undefined, store: OverrideStore): Override | undefined {
  const now = new Date().toISOString();

  for (const o of store.overrides) {
    if (!o.active) continue;
    if (o.expiresAt && o.expiresAt < now) continue;

    // Match exact rule ID or wildcard prefix (e.g. "SEC-*")
    const matches = o.ruleId === ruleId || (o.ruleId.endsWith("-*") && ruleId.startsWith(o.ruleId.slice(0, -1)));

    if (!matches) continue;

    // If file scope is specified, check it
    if (o.filePaths && o.filePaths.length > 0 && filePath) {
      const normalizedFilePath = filePath.replace(/\\/g, "/");
      const fileMatches = o.filePaths.some((pattern) => {
        const normalizedPattern = pattern.replace(/\\/g, "/");
        if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
          return matchGlobPath(normalizedFilePath, normalizedPattern);
        }
        return normalizedFilePath === normalizedPattern || normalizedFilePath.startsWith(`${normalizedPattern}/`);
      });
      if (!fileMatches) continue;
    }

    return o;
  }
  return undefined;
}

/**
 * Apply overrides to a list of findings — returns findings with overridden
 * ones removed, plus the list of overridden findings for audit.
 */
export function applyOverrides<T extends { ruleId: string }>(
  findings: T[],
  store: OverrideStore,
  filePath?: string,
): { active: T[]; overridden: Array<{ finding: T; override: Override }> } {
  const active: T[] = [];
  const overridden: Array<{ finding: T; override: Override }> = [];

  for (const f of findings) {
    const match = isOverridden(f.ruleId, filePath, store);
    if (match) {
      overridden.push({ finding: f, override: match });
    } else {
      active.push(f);
    }
  }

  return { active, overridden };
}

// ─── CLI Command ────────────────────────────────────────────────────────────

export function runOverride(argv: string[]): void {
  const subcommand = argv[3] || "list";
  const store = loadOverrideStore();

  switch (subcommand) {
    case "add": {
      let ruleId = "";
      let reason = "";
      let approver = "";
      let expiresAt = "";
      const filePaths: string[] = [];

      for (let i = 4; i < argv.length; i++) {
        switch (argv[i]) {
          case "--rule":
          case "-r":
            ruleId = argv[++i] || "";
            break;
          case "--reason":
            reason = argv[++i] || "";
            break;
          case "--approver":
            approver = argv[++i] || "";
            break;
          case "--expires":
            expiresAt = argv[++i] || "";
            break;
          case "--file":
          case "-f":
            filePaths.push(argv[++i] || "");
            break;
        }
      }

      if (!ruleId) {
        console.error(
          'Error: --rule is required. Example: judges override add --rule SEC-001 --reason "Mitigated by WAF"',
        );
        process.exit(1);
      }
      if (!reason) {
        console.error("Error: --reason is required. Overrides must have a justification.");
        process.exit(1);
      }

      const override: Override = {
        ruleId,
        reason,
        approver: approver || undefined,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt || undefined,
        active: true,
      };

      store.overrides.push(override);
      saveOverrideStore(store);

      console.log("");
      console.log("  ✅ Override added:");
      console.log(`     Rule     : ${ruleId}`);
      console.log(`     Reason   : ${reason}`);
      if (approver) console.log(`     Approver : ${approver}`);
      if (expiresAt) console.log(`     Expires  : ${expiresAt}`);
      if (filePaths.length > 0) console.log(`     Scope    : ${filePaths.join(", ")}`);
      console.log("");
      break;
    }

    case "list": {
      const now = new Date().toISOString();
      const active = store.overrides.filter((o) => o.active && (!o.expiresAt || o.expiresAt >= now));
      const expired = store.overrides.filter((o) => o.active && o.expiresAt && o.expiresAt < now);
      const revoked = store.overrides.filter((o) => !o.active);

      console.log("");
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║           Judges Panel — Override Registry                  ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("");

      if (active.length === 0 && expired.length === 0 && revoked.length === 0) {
        console.log("  No overrides registered.\n");
        break;
      }

      if (active.length > 0) {
        console.log(`  Active Overrides (${active.length}):`);
        console.log("  " + "─".repeat(58));
        for (const o of active) {
          console.log(`  ${o.ruleId.padEnd(14)} ${o.reason.slice(0, 50)}`);
          if (o.approver) console.log(`${"".padEnd(16)} Approver: ${o.approver}`);
          if (o.expiresAt) console.log(`${"".padEnd(16)} Expires: ${o.expiresAt}`);
        }
        console.log("");
      }

      if (expired.length > 0) {
        console.log(`  Expired Overrides (${expired.length}):`);
        for (const o of expired) {
          console.log(`  ${o.ruleId.padEnd(14)} expired ${o.expiresAt}`);
        }
        console.log("");
      }

      if (revoked.length > 0) {
        console.log(`  Revoked Overrides (${revoked.length}):`);
        for (const o of revoked) {
          console.log(`  ${o.ruleId.padEnd(14)} revoked ${o.revokedAt || "unknown"}`);
        }
        console.log("");
      }
      break;
    }

    case "revoke": {
      let ruleId = "";
      let revokedBy = "";
      for (let i = 4; i < argv.length; i++) {
        switch (argv[i]) {
          case "--rule":
          case "-r":
            ruleId = argv[++i] || "";
            break;
          case "--by":
            revokedBy = argv[++i] || "";
            break;
        }
      }

      if (!ruleId) {
        console.error("Error: --rule is required. Example: judges override revoke --rule SEC-001");
        process.exit(1);
      }

      let revoked = 0;
      for (const o of store.overrides) {
        if (o.ruleId === ruleId && o.active) {
          o.active = false;
          o.revokedAt = new Date().toISOString();
          o.revokedBy = revokedBy || undefined;
          revoked++;
        }
      }

      if (revoked > 0) {
        saveOverrideStore(store);
        console.log(`  ✅ Revoked ${revoked} override(s) for ${ruleId}\n`);
      } else {
        console.log(`  No active overrides found for ${ruleId}\n`);
      }
      break;
    }

    case "check": {
      let filePath = "";
      for (let i = 4; i < argv.length; i++) {
        if (argv[i] === "--file" || argv[i] === "-f") filePath = argv[++i] || "";
        else if (!argv[i].startsWith("-")) filePath = argv[i];
      }

      const now = new Date().toISOString();
      const active = store.overrides.filter((o) => o.active && (!o.expiresAt || o.expiresAt >= now));

      if (active.length === 0) {
        console.log("  No active overrides.\n");
        break;
      }

      console.log(`\n  Active overrides${filePath ? ` for ${filePath}` : ""}:`);
      for (const o of active) {
        const scopeMatch =
          !o.filePaths ||
          o.filePaths.length === 0 ||
          !filePath ||
          o.filePaths.some((pattern) => matchGlobPath(filePath, pattern));
        const status = scopeMatch ? "✅ applies" : "⬜ out of scope";
        console.log(`  ${o.ruleId.padEnd(14)} ${status} — ${o.reason.slice(0, 50)}`);
      }
      console.log("");
      break;
    }

    default:
      console.error(`Unknown override subcommand: ${subcommand}`);
      console.error("Usage: judges override <add|list|revoke|check>");
      process.exit(1);
  }
}
