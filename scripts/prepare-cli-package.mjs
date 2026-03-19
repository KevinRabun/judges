import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const sourceDist = resolve(repoRoot, "dist");
const targetDist = resolve(repoRoot, "packages", "judges-cli", "dist");

if (!existsSync(sourceDist)) {
  console.error("prepare-cli-package: root dist/ does not exist. Run the root build first.");
  process.exit(1);
}

rmSync(targetDist, { recursive: true, force: true });
mkdirSync(targetDist, { recursive: true });
cpSync(sourceDist, targetDist, { recursive: true });

// Sync CLI package version from root package.json
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const cliPkgPath = resolve(repoRoot, "packages", "judges-cli", "package.json");
const cliPkg = JSON.parse(readFileSync(cliPkgPath, "utf8"));
if (cliPkg.version !== rootPkg.version) {
  cliPkg.version = rootPkg.version;
  writeFileSync(cliPkgPath, JSON.stringify(cliPkg, null, 2) + "\n");
  console.log(`Synced CLI package version to ${rootPkg.version}`);
}

console.log(`Prepared CLI package runtime in ${targetDist}`);