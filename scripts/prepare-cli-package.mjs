import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const cliRoot = resolve(repoRoot, "packages", "judges-cli");
const sourceDist = resolve(repoRoot, "dist");
const targetDist = resolve(cliRoot, "dist");

if (!existsSync(sourceDist)) {
  console.error("prepare-cli-package: root dist/ does not exist. Run the root build first.");
  process.exit(1);
}

rmSync(targetDist, { recursive: true, force: true });
mkdirSync(targetDist, { recursive: true });
cpSync(sourceDist, targetDist, { recursive: true });

// Copy agents and skills into the CLI package so it is self-contained
for (const dir of ["agents", "skills"]) {
  const src = resolve(repoRoot, dir);
  const dest = resolve(cliRoot, dir);
  if (existsSync(src)) {
    rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    console.log(`Copied ${dir}/ into CLI package`);
  }
}

// Sync CLI package version from root package.json
const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const cliPkgPath = resolve(cliRoot, "package.json");
const cliPkg = JSON.parse(readFileSync(cliPkgPath, "utf8"));
if (cliPkg.version !== rootPkg.version) {
  cliPkg.version = rootPkg.version;
  writeFileSync(cliPkgPath, JSON.stringify(cliPkg, null, 2) + "\n");
  console.log(`Synced CLI package version to ${rootPkg.version}`);
}

console.log(`Prepared CLI package runtime in ${cliRoot}`);