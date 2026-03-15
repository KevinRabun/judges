/**
 * Review-permission-model — Define role-based permissions for Judges features.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  permissions: string[];
}

interface PermissionStore {
  roles: Role[];
  lastUpdated: string;
}

const DEFAULT_ROLES: Role[] = [
  {
    id: "viewer",
    name: "Viewer",
    permissions: ["view-reports", "view-findings", "view-dashboard"],
  },
  {
    id: "reviewer",
    name: "Reviewer",
    permissions: [
      "view-reports",
      "view-findings",
      "view-dashboard",
      "add-annotations",
      "dismiss-findings",
      "run-reviews",
    ],
  },
  {
    id: "admin",
    name: "Admin",
    permissions: [
      "view-reports",
      "view-findings",
      "view-dashboard",
      "add-annotations",
      "dismiss-findings",
      "run-reviews",
      "configure-judges",
      "manage-policies",
      "manage-gates",
      "manage-roles",
      "manage-webhooks",
    ],
  },
];

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewPermissionModel(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-permissions.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-permission-model — Define role-based permissions

Usage:
  judges review-permission-model [--store <path>] [--init]
    [--add-role <json>] [--remove-role <id>] [--check <role> --action <perm>]
    [--format table|json]

Options:
  --store <path>       Permission store (default: .judges-permissions.json)
  --init               Initialize with default roles
  --add-role <json>    Add or update a role
  --remove-role <id>   Remove a role by id
  --check <role>       Check if role has a permission
  --action <perm>      Permission to check
  --format <fmt>       Output format: table (default), json
  --help, -h           Show this help
`);
    return;
  }

  // Init with defaults
  if (argv.includes("--init")) {
    const store: PermissionStore = {
      roles: DEFAULT_ROLES,
      lastUpdated: new Date().toISOString().split("T")[0],
    };
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Permission model initialized at: ${storePath}`);
    return;
  }

  let store: PermissionStore;
  if (existsSync(storePath)) {
    store = JSON.parse(readFileSync(storePath, "utf-8")) as PermissionStore;
  } else {
    store = { roles: [], lastUpdated: new Date().toISOString().split("T")[0] };
  }

  // Add role
  const addIdx = argv.indexOf("--add-role");
  if (addIdx >= 0) {
    const role = JSON.parse(argv[addIdx + 1]) as Role;
    const existingIdx = store.roles.findIndex((r) => r.id === role.id);
    if (existingIdx >= 0) {
      store.roles[existingIdx] = role;
    } else {
      store.roles.push(role);
    }
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Role "${role.id}" saved.`);
    return;
  }

  // Remove role
  const removeIdx = argv.indexOf("--remove-role");
  if (removeIdx >= 0) {
    const id = argv[removeIdx + 1];
    store.roles = store.roles.filter((r) => r.id !== id);
    store.lastUpdated = new Date().toISOString().split("T")[0];
    writeFileSync(storePath, JSON.stringify(store, null, 2));
    console.log(`Role "${id}" removed.`);
    return;
  }

  // Check permission
  const checkIdx = argv.indexOf("--check");
  const actionIdx = argv.indexOf("--action");
  if (checkIdx >= 0 && actionIdx >= 0) {
    const roleId = argv[checkIdx + 1];
    const action = argv[actionIdx + 1];
    const role = store.roles.find((r) => r.id === roleId);

    if (role === undefined) {
      console.error(`Role "${roleId}" not found.`);
      process.exitCode = 1;
      return;
    }

    const allowed = role.permissions.includes(action);
    if (format === "json") {
      console.log(JSON.stringify({ role: roleId, action, allowed }, null, 2));
    } else {
      console.log(`${allowed ? "ALLOWED" : "DENIED"}: ${roleId} → ${action}`);
    }
    return;
  }

  // List roles
  if (format === "json") {
    console.log(JSON.stringify(store, null, 2));
    return;
  }

  console.log(`\nPermission Model`);
  console.log("═".repeat(60));

  if (store.roles.length === 0) {
    console.log("  No roles defined. Use --init for defaults or --add-role.");
  } else {
    for (const r of store.roles) {
      console.log(`  ${r.id.padEnd(15)} ${r.name}`);
      console.log(`    Permissions: ${r.permissions.join(", ")}`);
    }
  }

  console.log("═".repeat(60));
}
