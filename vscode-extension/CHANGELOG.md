# Changelog

All notable changes to the **Judges Panel** VS Code extension will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-03-01

### Added

- Initial release with 35 specialized judges for AI-generated code review
- Inline diagnostics (squiggly underlines) with severity-coloured markers
- Quick-fix code actions (lightbulb) for auto-fixable findings
- `Judges: Evaluate Current File` command and editor-title button
- `Judges: Auto-Fix Current File` command with bottom-to-top patch application
- `Judges: Evaluate Workspace` command with progress reporting
- `Judges: Clear Diagnostics` command
- Evaluate-on-save with configurable debounce delay
- Status-bar shield icon for one-click evaluation
- Configurable presets: strict, lenient, security-only, startup, compliance, performance
- Minimum-severity filter (critical / high / medium / low / info)
- Per-judge enable/disable via `judges.enabledJudges` setting
- Support for TypeScript, JavaScript, Python, Go, Rust, Java, C#, and C++
