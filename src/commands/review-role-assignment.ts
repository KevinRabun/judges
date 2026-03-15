/**
 * Review-role-assignment — Manage reviewer role assignments for teams.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoleAssignment {
  user: string;
  role: "viewer" | "reviewer" | "admin" | "owner";
  scope: string;
  assignedAt: string;
}

interface RoleStore {
  assignments: RoleAssignment[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRoleAssignment(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-roles.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const assignIdx = argv.indexOf("--assign");
  const assignUser = assignIdx >= 0 ? argv[assignIdx + 1] : "";
  const roleIdx = argv.indexOf("--role");
  const roleName = roleIdx >= 0 ? argv[roleIdx + 1] : "";
  const scopeIdx = argv.indexOf("--scope");
  const scope = scopeIdx >= 0 ? argv[scopeIdx + 1] : "*";
  const removeIdx = argv.indexOf("--remove");
  const removeUser = removeIdx >= 0 ? argv[removeIdx + 1] : "";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-role-assignment — Manage reviewer roles

Usage:
  judges review-role-assignment [--store <path>] [--format table|json]
  judges review-role-assignment --assign <user> --role <role> [--scope <scope>]
  judges review-role-assignment --remove <user> [--store <path>]

Options:
  --store <path>     Role store (default: .judges-roles.json)
  --assign <user>    User to assign a role
  --role <role>      Role: viewer, reviewer, admin, owner
  --scope <scope>    Scope for the role (default: *)
  --remove <user>    Remove a user's role
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  const store: RoleStore = existsSync(storePath)
    ? (JSON.parse(readFileSync(storePath, "utf-8")) as RoleStore)
    : { assignments: [], lastUpdated: new Date().toISOString() };

  if (assignUser && roleName) {
    const validRoles = ["viewer", "reviewer", "admin", "owner"];
    if (!validRoles.includes(roleName)) {
      console.error(`Invalid role: ${roleName}. Must be one of: ${validRoles.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    const existing = store.assignments.find((a) => a.user === assignUser && a.scope === scope);
    if (existing) {
      existing.role = roleName as RoleAssignment["role"];
      existing.assignedAt = new Date().toISOString();
    } else {
      store.assignments.push({
        user: assignUser,
        role: roleName as RoleAssignment["role"],
        scope,
        assignedAt: new Date().toISOString(),
      });
    }
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Assigned ${roleName} role to ${assignUser} (scope: ${scope}).`);
    return;
  }

  if (removeUser) {
    const idx = store.assignments.findIndex((a) => a.user === removeUser);
    if (idx < 0) {
      console.error(`User not found: ${removeUser}`);
      process.exitCode = 1;
      return;
    }
    store.assignments.splice(idx, 1);
    store.lastUpdated = new Date().toISOString();
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Removed role for: ${removeUser}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log("\nRole Assignments");
  console.log("═".repeat(70));

  if (store.assignments.length === 0) {
    console.log("  No role assignments.");
  } else {
    console.log(`  ${"User".padEnd(20)} ${"Role".padEnd(12)} ${"Scope".padEnd(15)} Assigned`);
    console.log("  " + "─".repeat(55));

    for (const a of store.assignments) {
      console.log(`  ${a.user.padEnd(20)} ${a.role.padEnd(12)} ${a.scope.padEnd(15)} ${a.assignedAt.slice(0, 10)}`);
    }
  }

  console.log(`\n  Total: ${store.assignments.length}`);
  console.log("═".repeat(70));
}
