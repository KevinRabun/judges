When reviewing pull requests in this repository:

1. Read the latest `judges-pr-report` artifact/check output first.
2. Prioritize CRITICAL and HIGH findings before medium/low issues.
3. Include relevant rule IDs in remediation guidance (for example: `DATA-001`, `CYBER-004`, `AUTH-002`).
4. If findings conflict, prefer security/compliance/sovereignty judges over style-only guidance.
5. Recommend concrete, minimal fixes and ask for re-run of Judges workflow after significant changes.
6. When no findings are present, still confirm coverage of authentication, data handling, and error paths.
