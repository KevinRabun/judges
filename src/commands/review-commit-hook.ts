/**
 * Review-commit-hook — Generate git commit hook configuration for Judges.
 *
 * Creates pre-commit or pre-push hook scripts that automatically
 * run Judges review on staged/changed files.
 */

import { writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";

// ─── Helpers ────────────────────────────────────────────────────────────────

const PRE_COMMIT_SCRIPT = `#!/bin/sh
# Judges Panel pre-commit hook
# Runs code review on staged files

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(ts|js|tsx|jsx|py|java|go|rs|cs|cpp|c|rb|php)$')

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "Running Judges review on staged files..."

FAILED=0
for FILE in $STAGED; do
  npx judges eval --file "$FILE" --fail-on-findings 2>/dev/null
  if [ $? -ne 0 ]; then
    FAILED=1
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "Judges found issues. Fix them or use --no-verify to skip."
  exit 1
fi

exit 0
`;

const PRE_PUSH_SCRIPT = `#!/bin/sh
# Judges Panel pre-push hook
# Runs code review on changed files before push

CHANGED=$(git diff --name-only HEAD~1 | grep -E '\\.(ts|js|tsx|jsx|py|java|go|rs|cs|cpp|c|rb|php)$')

if [ -z "$CHANGED" ]; then
  exit 0
fi

echo "Running Judges review before push..."

FAILED=0
for FILE in $CHANGED; do
  if [ -f "$FILE" ]; then
    npx judges eval --file "$FILE" --fail-on-findings 2>/dev/null
    if [ $? -ne 0 ]; then
      FAILED=1
    fi
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "Judges found issues. Fix or use --no-verify to skip."
  exit 1
fi

exit 0
`;

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCommitHook(argv: string[]): void {
  const sub = argv[0];

  if (!sub || sub === "--help" || sub === "-h") {
    console.log(`
judges review-commit-hook — Set up git hooks for Judges

Usage:
  judges review-commit-hook install [--type pre-commit|pre-push|both]
  judges review-commit-hook show    [--type pre-commit|pre-push]
  judges review-commit-hook remove  [--type pre-commit|pre-push|both]

Options:
  --type <hook>    Hook type (default: pre-commit)
  --help, -h       Show this help
`);
    return;
  }

  const args = argv.slice(1);
  const typeIdx = args.indexOf("--type");
  const hookType = typeIdx >= 0 ? args[typeIdx + 1] : "pre-commit";

  if (sub === "install") {
    const hooksDir = join(process.cwd(), ".git", "hooks");
    if (!existsSync(join(process.cwd(), ".git"))) {
      console.error("Error: not a git repository");
      process.exitCode = 1;
      return;
    }
    if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

    const types = hookType === "both" ? ["pre-commit", "pre-push"] : [hookType];
    for (const t of types) {
      const script = t === "pre-push" ? PRE_PUSH_SCRIPT : PRE_COMMIT_SCRIPT;
      const hookPath = join(hooksDir, t);
      writeFileSync(hookPath, script);
      try {
        chmodSync(hookPath, 0o755);
      } catch {
        /* Windows doesn't need chmod */
      }
      console.log(`Installed ${t} hook: ${hookPath}`);
    }
  } else if (sub === "show") {
    const script = hookType === "pre-push" ? PRE_PUSH_SCRIPT : PRE_COMMIT_SCRIPT;
    console.log(script);
  } else if (sub === "remove") {
    const hooksDir = join(process.cwd(), ".git", "hooks");
    const types = hookType === "both" ? ["pre-commit", "pre-push"] : [hookType];
    for (const t of types) {
      const hookPath = join(hooksDir, t);
      if (existsSync(hookPath)) {
        writeFileSync(hookPath, "#!/bin/sh\nexit 0\n");
        console.log(`Removed ${t} hook`);
      } else {
        console.log(`No ${t} hook found`);
      }
    }
  } else {
    console.error(`Unknown subcommand: ${sub}. Use --help for usage.`);
    process.exitCode = 1;
  }
}
