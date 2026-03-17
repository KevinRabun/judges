import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
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

console.log(`Prepared CLI package runtime in ${targetDist}`);