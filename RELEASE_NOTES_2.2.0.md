# Judges Panel v2.2.0

## Highlights

- Public repository reports now prioritize findings by weighted risk (`severity × confidence × fixability`) so high-signal issues surface first.
- Report output now clusters duplicate findings into root-cause groups, reducing noise and improving triage speed.
- Highest-risk finding entries now include richer actionability data:
  - risk score
  - occurrence and affected-file counts
  - confidence (when available)
  - suggested fix snippet (when provided)
- Shared markdown output now consistently orders findings by priority in tribunal and single-judge detail sections.

## Workflow and CI improvements

- Daily autofix workflow now targets public repositories under `KevinRabun` by default, with support for explicit single-repo override.
- Nightly runtime was reduced by:
  - lowering default repo throughput (`MAX_REPOS_PER_DAY=2`)
  - skipping total-findings pre-scan by default (`INCLUDE_TOTAL_FINDINGS_SCAN=false`)
- Added support for token-based GitHub auth in CI paths and streamlined PR review reporting flow.

## Documentation updates

- README now documents risk ranking and root-cause clustering behavior in `evaluate_public_repo_report`.

## Validation

- Build: `npm run build` ✅
- Tests: `npm test` ✅ (`421` passed, `0` failed)

## Upgrade notes

- No breaking API changes.
- Existing consumers can adopt v2.2.0 without code changes.
- To tune report strictness, continue using `minConfidence`, `includeAstFindings`, and `credentialMode` options.
