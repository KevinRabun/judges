/**
 * Review-tenant-config — Manage per-tenant/team configuration profiles.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TenantProfile {
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdAt: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewTenantConfig(argv: string[]): void {
  const dirIdx = argv.indexOf("--dir");
  const nameIdx = argv.indexOf("--name");
  const setIdx = argv.indexOf("--set");
  const formatIdx = argv.indexOf("--format");
  const configDir = dirIdx >= 0 ? argv[dirIdx + 1] : join(process.cwd(), ".judges-tenants");
  const tenantName = nameIdx >= 0 ? argv[nameIdx + 1] : undefined;
  const setValue = setIdx >= 0 ? argv[setIdx + 1] : undefined;
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-tenant-config — Manage team configuration profiles

Usage:
  judges review-tenant-config [--dir <path>] [--name <tenant>]
                              [--set <key=value>] [--format table|json]

Options:
  --dir <path>       Config directory (default: .judges-tenants/)
  --name <tenant>    Tenant/team name
  --set <key=value>  Set a config key for the named tenant
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  // List all tenants
  if (!tenantName) {
    if (!existsSync(configDir)) {
      console.log("No tenant configs found. Use --name <tenant> to create one.");
      return;
    }

    const files = readdirSync(configDir) as unknown as string[];
    const profiles: TenantProfile[] = [];
    for (const file of files) {
      if (typeof file === "string" && file.endsWith(".json")) {
        try {
          const profile = JSON.parse(readFileSync(join(configDir, file), "utf-8")) as TenantProfile;
          profiles.push(profile);
        } catch {
          // skip invalid files
        }
      }
    }

    if (format === "json") {
      console.log(JSON.stringify(profiles, null, 2));
      return;
    }

    console.log(`\nTenant Configurations: ${profiles.length} profile(s)`);
    console.log("═".repeat(55));
    for (const p of profiles) {
      console.log(`  ${p.name.padEnd(20)} ${p.description}`);
      console.log(`  ${"".padEnd(20)} Created: ${p.createdAt}`);
    }
    if (profiles.length === 0) {
      console.log("  No tenant profiles found.");
    }
    console.log("═".repeat(55));
    return;
  }

  // Set a value
  if (setValue) {
    const eqPos = setValue.indexOf("=");
    if (eqPos < 0) {
      console.error("Error: --set requires key=value format");
      process.exitCode = 1;
      return;
    }
    const key = setValue.substring(0, eqPos);
    const val = setValue.substring(eqPos + 1);

    const filePath = join(configDir, `${tenantName}.json`);
    let profile: TenantProfile;
    if (existsSync(filePath)) {
      profile = JSON.parse(readFileSync(filePath, "utf-8")) as TenantProfile;
    } else {
      profile = {
        name: tenantName,
        description: `Configuration for ${tenantName}`,
        config: {},
        createdAt: new Date().toISOString().split("T")[0],
      };
    }
    profile.config[key] = val;
    writeFileSync(filePath, JSON.stringify(profile, null, 2));
    console.log(`Set ${key}=${val} for tenant "${tenantName}"`);
    return;
  }

  // Show tenant
  const filePath = join(configDir, `${tenantName}.json`);
  if (!existsSync(filePath)) {
    console.error(`Error: no config found for tenant "${tenantName}"`);
    console.error("Use --set <key=value> to create one.");
    process.exitCode = 1;
    return;
  }

  const profile = JSON.parse(readFileSync(filePath, "utf-8")) as TenantProfile;
  if (format === "json") {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }

  console.log(`\nTenant: ${profile.name}`);
  console.log(`Description: ${profile.description}`);
  console.log(`Created: ${profile.createdAt}`);
  console.log("─".repeat(40));
  for (const [k, v] of Object.entries(profile.config)) {
    console.log(`  ${k}: ${String(v)}`);
  }
}
