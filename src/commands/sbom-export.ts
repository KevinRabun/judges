/**
 * SBOM export — generates Software Bill of Materials in
 * CycloneDX-compatible JSON from project manifests.
 *
 * All data from local project files.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, basename } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface SbomComponent {
  type: "library" | "framework" | "application";
  name: string;
  version: string;
  purl: string;
  scope: "required" | "optional";
  licenses: string[];
}

interface SbomDocument {
  bomFormat: "CycloneDX";
  specVersion: string;
  version: number;
  metadata: {
    timestamp: string;
    component: { type: string; name: string; version: string };
    tools: Array<{ name: string; version: string }>;
  };
  components: SbomComponent[];
}

// ─── Parsers ────────────────────────────────────────────────────────────────

function parsePackageJson(): SbomComponent[] {
  if (!existsSync("package.json")) return [];
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const components: SbomComponent[] = [];
    for (const [name, ver] of Object.entries(pkg.dependencies || {})) {
      components.push({
        type: "library",
        name,
        version: String(ver).replace(/^[\^~>=<]+/, ""),
        purl: `pkg:npm/${name.replace("/", "%2F")}@${String(ver).replace(/^[\^~>=<]+/, "")}`,
        scope: "required",
        licenses: [],
      });
    }
    for (const [name, ver] of Object.entries(pkg.devDependencies || {})) {
      components.push({
        type: "library",
        name,
        version: String(ver).replace(/^[\^~>=<]+/, ""),
        purl: `pkg:npm/${name.replace("/", "%2F")}@${String(ver).replace(/^[\^~>=<]+/, "")}`,
        scope: "optional",
        licenses: [],
      });
    }
    return components;
  } catch {
    return [];
  }
}

function parseRequirements(): SbomComponent[] {
  if (!existsSync("requirements.txt")) return [];
  try {
    const lines = readFileSync("requirements.txt", "utf-8").split("\n");
    const components: SbomComponent[] = [];
    for (const line of lines) {
      const match = /^([a-zA-Z0-9_-]+)==(.+)/.exec(line.trim());
      if (match) {
        components.push({
          type: "library",
          name: match[1],
          version: match[2],
          purl: `pkg:pypi/${match[1]}@${match[2]}`,
          scope: "required",
          licenses: [],
        });
      }
    }
    return components;
  } catch {
    return [];
  }
}

function parseGoMod(): SbomComponent[] {
  if (!existsSync("go.mod")) return [];
  try {
    const lines = readFileSync("go.mod", "utf-8").split("\n");
    const components: SbomComponent[] = [];
    for (const line of lines) {
      const match = /^\s+([\w./\-@]+)\s+(v[\d.]+)/.exec(line);
      if (match) {
        components.push({
          type: "library",
          name: match[1],
          version: match[2],
          purl: `pkg:golang/${match[1]}@${match[2]}`,
          scope: "required",
          licenses: [],
        });
      }
    }
    return components;
  } catch {
    return [];
  }
}

function buildSbom(): SbomDocument {
  const projectName = existsSync("package.json")
    ? JSON.parse(readFileSync("package.json", "utf-8")).name || basename(process.cwd())
    : basename(process.cwd());

  const projectVersion = existsSync("package.json")
    ? JSON.parse(readFileSync("package.json", "utf-8")).version || "0.0.0"
    : "0.0.0";

  const components = [...parsePackageJson(), ...parseRequirements(), ...parseGoMod()];

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: "application", name: projectName, version: projectVersion },
      tools: [{ name: "@kevinrabun/judges", version: "3.48.0" }],
    },
    components,
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-sbom";

export function runSbomExport(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges sbom-export — Generate Software Bill of Materials

Usage:
  judges sbom-export
  judges sbom-export --save
  judges sbom-export --summary

Options:
  --save                Save SBOM to ${STORE}/sbom.json
  --summary             Show component summary only
  --format json         JSON output (default for SBOM)
  --help, -h            Show this help

Supports: package.json, requirements.txt, go.mod
`);
    return;
  }

  const sbom = buildSbom();

  if (argv.includes("--save")) {
    if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "sbom.json"), JSON.stringify(sbom, null, 2));
    console.log(`  SBOM saved to ${STORE}/sbom.json (${sbom.components.length} components)`);
    return;
  }

  if (argv.includes("--summary")) {
    const required = sbom.components.filter((c) => c.scope === "required").length;
    const optional = sbom.components.filter((c) => c.scope === "optional").length;
    const types = new Map<string, number>();
    for (const c of sbom.components) {
      const ecosystem = c.purl.split(":")[1]?.split("/")[0] || "unknown";
      types.set(ecosystem, (types.get(ecosystem) || 0) + 1);
    }

    console.log(`\n  SBOM Summary — ${sbom.metadata.component.name}@${sbom.metadata.component.version}`);
    console.log(`  ──────────────────────────`);
    console.log(`    Total components: ${sbom.components.length}`);
    console.log(`    Required: ${required}  Optional: ${optional}`);
    for (const [eco, count] of types) console.log(`    ${eco}: ${count}`);
    console.log(`\n  Run --save to export full CycloneDX SBOM\n`);
    return;
  }

  // Default: print full SBOM
  console.log(JSON.stringify(sbom, null, 2));
}
