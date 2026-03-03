# Release & Deployment — Agent Instructions

When preparing and publishing a new release of `@kevinrabun/judges`, follow this checklist exactly. The publish workflow is automated via GitHub Actions — your job is to prepare the commit and tag.

## Overview

Publishing is triggered by pushing a **`v*` git tag** (e.g., `v3.18.1`). The [`publish-mcp.yml`](../../.github/workflows/publish-mcp.yml) workflow handles:

1. **npm publish** — builds, packs, and publishes `@kevinrabun/judges` to the npm registry with provenance
2. **GitHub Release** — creates a release from the tag with auto-generated notes
3. **MCP Registry** — publishes `server.json` to the Model Context Protocol registry via `mcp-publisher`
4. **VS Code Marketplace** — syncs the extension version from the git tag, installs the local tarball, and publishes via `vsce`

You do **not** need to run `npm publish` or `vsce publish` locally — the action does it all. Your responsibility is: version bumps, changelogs, commit, and tag.

---

## Files That Need Version Updates

Update the version string in **all four** of these files:

| File | Field(s) | Example |
|------|----------|---------|
| `package.json` | `"version"` | `"version": "3.18.1"` |
| `server.json` | `"version"` (top-level) **and** `"packages[0].version"` | Both must match |
| `vscode-extension/package.json` | `"version"` | `"version": "3.18.1"` |

> **`server.json` has two version fields** — the top-level `"version"` and `"packages[0].version"`. Both must be updated. This file has historically gone stale; always verify it.

> **`action.yml` does not contain a version string** — it is referenced by tag (e.g., `uses: KevinRabun/judges@v3.18.1`), so no edit is needed.

> The CI workflow patches `vscode-extension/package.json` at publish time from the git tag, but keep it in sync locally to avoid confusion.

---

## Changelogs That Need Updating

### 1. Root `CHANGELOG.md`

This is the primary changelog for the `@kevinrabun/judges` npm package. Add a new section **above** the previous version:

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Fixed
- Description of bug fixes

### Added / Changed / Removed
- Other changes

### Tests
- New test count, total passing count
```

Include all meaningful changes: evaluator fixes, FP reductions, new judges, CLI changes, CI fixes, removed scripts, etc.

### 2. `vscode-extension/CHANGELOG.md`

This is a separate changelog for the VS Code Marketplace listing. It should:

- Have its own `[X.Y.Z]` section matching the release version
- Summarize extension-specific changes (new commands, UI changes, diagnostics improvements)
- Reference core engine changes briefly with a link: `see [core CHANGELOG](../CHANGELOG.md) for full details`
- Previously used independent version numbers (0.2.x, 0.3.0, 0.4.0); now synced to the core version starting from 3.18.1

---

## Release Steps

### 1. Verify all tests pass

```bash
npm test
```

All tests must pass. Note the total count (e.g., "963 tests pass") for the changelog.

### 2. Bump versions

Update the version in all four locations listed above. Use a single coordinated edit to avoid partial updates.

### 3. Update both changelogs

- `CHANGELOG.md` — full detail
- `vscode-extension/CHANGELOG.md` — extension-focused summary

### 4. Commit

```bash
git add -A
git commit -m "release: vX.Y.Z"
```

> **Beware of `lint-staged`**: The project uses `husky` + `lint-staged` which runs `eslint --fix` and `prettier --write` on staged `.ts` files during commit. This can silently modify or remove code. Non-`.ts` files (JSON, Markdown) are unaffected. If a `.ts` file has an intentional lint suppression, use an `eslint-disable` comment to protect it.

### 5. Tag

```bash
git tag vX.Y.Z
```

### 6. Push commit and tag

```bash
git push origin main --tags
```

This triggers the `publish-mcp.yml` workflow, which handles npm, GitHub Release, MCP Registry, and VS Code Marketplace publishing.

### 7. Verify the workflow

Check the Actions tab on GitHub to confirm all four publish steps succeeded. Common failure modes:

- **npm 404** — the `@kevinrabun` scope or package doesn't exist yet; requires `npm publish --access public` for the first publish
- **VSCE_PAT expired** — the VS Code Marketplace Personal Access Token stored in repository secrets has expired
- **MCP Registry OIDC failure** — the `id-token: write` permission must be present in the workflow

---

## What the Publish Workflow Does (for reference)

From `publish-mcp.yml`, triggered on `push: tags: ["v*"]`:

1. **npm**: `npm ci` → `npm run build` → `npm pack` → `npm publish --provenance --access public` (skips if version already published)
2. **GitHub Release**: `gh release create` with `--generate-notes` (skips if release exists)
3. **MCP Registry**: Downloads `mcp-publisher`, authenticates via GitHub OIDC, patches `server.json` version from tag, publishes
4. **VS Code Extension**: Patches `vscode-extension/package.json` version from tag, `npm install` + installs local tarball, `vsce publish --skip-duplicate`

> The workflow patches both `server.json` and `vscode-extension/package.json` from the git tag at runtime. Local versions should still match to keep the repo consistent, but the workflow is the source of truth for published versions.

---

## Secrets Required

These must be configured in the repository's GitHub Actions secrets:

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | npm publish authentication |
| `VSCE_PAT` | VS Code Marketplace publish (Azure DevOps PAT with Marketplace scope) |
| `GITHUB_TOKEN` | Provided automatically — used for GitHub Releases and OIDC |

---

## Quick Reference: Minimal Release

```bash
# 1. Run tests
npm test

# 2. Bump versions in: package.json, server.json (×2), vscode-extension/package.json
# 3. Update: CHANGELOG.md, vscode-extension/CHANGELOG.md

# 4. Commit, tag, push
git add -A
git commit -m "release: vX.Y.Z"
git tag vX.Y.Z
git push origin main --tags

# 5. Monitor: https://github.com/KevinRabun/judges/actions
```
