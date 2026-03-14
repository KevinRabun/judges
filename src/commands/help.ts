/**
 * `judges help [topic]` — contextual help and getting-started guides.
 *
 * Provides quick, actionable guidance for each major capability area.
 * Run without arguments to see all available topics.
 */

// ─── Topic Registry ─────────────────────────────────────────────────────────

interface HelpTopic {
  title: string;
  summary: string;
  body: string;
}

const TOPICS: Record<string, HelpTopic> = {
  "getting-started": {
    title: "Getting Started",
    summary: "First steps with Judges Panel",
    body: `
  Quick Start
  ───────────
  1. Evaluate a single file:
       judges eval server.ts

  2. Scan an entire directory:
       judges eval src/

  3. Generate a config file:
       judges init

  4. Use a preset for CI:
       judges eval src/ --preset security

  5. Auto-fix findings:
       judges eval src/ --fix

  Common Flags
  ────────────
    --format json|sarif|html|markdown   Output format
    --fix                               Apply auto-fix patches
    --baseline .judges-baseline.json    Suppress known findings
    --incremental                       Cache results for unchanged files
    --changed-only                      Only scan git-changed files
    --quiet                             Suppress progress output
    --explain                           Show CWE/OWASP context for findings
`,
  },

  feedback: {
    title: "Feedback & False Positive Reporting",
    summary: "How to improve accuracy with feedback",
    body: `
  Providing Feedback
  ──────────────────
  Feedback trains Judges to reduce false positives over time.

  CLI:
    judges feedback add --rule SEC-001 --verdict fp --comment "Not exploitable"
    judges feedback add --rule AUTH-003 --verdict tp
    judges feedback list
    judges feedback stats

  VS Code:
    Click the thumbs-up/down icons on any finding's code action menu.
    Feedback is stored in .judges-feedback.json in your workspace.

  Verdicts:
    tp         True positive (real issue)
    fp         False positive (not a real issue)
    wontfix    Acknowledged but won't fix

  Your feedback is stored locally and never sent externally.
  Configure a DataAdapter in .judgesrc to share feedback with your team.
`,
  },

  calibration: {
    title: "Calibration & Confidence Tuning",
    summary: "How to tune judge accuracy for your codebase",
    body: `
  Auto-Calibration
  ────────────────
    judges tune             Run auto-calibration on your feedback data
    judges tune --dry-run   Preview what would change

  Calibration Dashboard
  ─────────────────────
    judges calibration-dashboard          Open interactive HTML dashboard
    judges calibration-dashboard --output report.html

  How It Works
  ────────────
  Judges uses your feedback (tp/fp verdicts) to adjust confidence thresholds
  per rule. Rules with many false positives get their confidence reduced;
  rules with consistent true positives are boosted.

  Team Sharing
  ────────────
  Calibration profiles are stored in .judges-calibration.json.
  Commit this to your repo so team members benefit from shared tuning.
`,
  },

  ci: {
    title: "CI/CD Integration",
    summary: "Setting up Judges in CI pipelines",
    body: `
  Generate CI Config
  ──────────────────
    judges ci-templates              Show all available templates
    judges ci-templates --github     GitHub Actions workflow
    judges ci-templates --gitlab     GitLab CI config
    judges ci-templates --azure      Azure Pipelines config
    judges ci-templates --bitbucket  Bitbucket Pipelines config

  Recommended CI Setup
  ────────────────────
  1. Create a baseline to suppress existing findings:
       judges baseline create --dir src/

  2. Run incremental scans in PRs:
       judges eval src/ --changed-only --fail-on-findings --format sarif

  3. Upload SARIF to GitHub Code Scanning:
       - uses: github/codeql-action/upload-sarif@v3
         with:
           sarif_file: judges-report.sarif.json

  Environment Variables
  ─────────────────────
    JUDGES_CACHE_DIR    Custom cache directory (default: .judges-cache)
    JUDGES_NO_COLOR     Disable colored output
    JUDGES_CONFIG       Path to .judgesrc config file
`,
  },

  presets: {
    title: "Presets & Configuration",
    summary: "Using and composing evaluation presets",
    body: `
  Available Presets
  ────────────────
    judges eval --preset security       Security-focused evaluation
    judges eval --preset quality        Code quality focus
    judges eval --preset compliance     Compliance & governance
    judges eval --preset full           All judges enabled

  List All Presets
  ────────────────
    judges config presets

  Composing Presets
  ────────────────
  In .judgesrc, you can compose multiple presets:
    {
      "presets": ["security", "quality"],
      "disabledRules": ["DOC-001"],
      "minSeverity": "medium"
    }

  Custom Config (.judgesrc)
  ────────────────────────
    judges init                    Generate a starter .judgesrc
    judges config validate         Validate your config
    judges doctor                  Diagnose configuration issues
`,
  },

  plugins: {
    title: "Plugins & Custom Rules",
    summary: "Extending Judges with custom rules and plugins",
    body: `
  Creating a Plugin
  ─────────────────
    judges scaffold-plugin my-rules    Generate a plugin template

  Plugin Structure
  ────────────────
    my-rules/
      package.json        # name, version, "judges-plugin" keyword
      index.js            # exports { rules: [...] }

  Installing Plugins
  ──────────────────
  Add to .judgesrc:
    {
      "plugins": ["@myorg/judges-plugin-custom"]
    }

  Community Patterns
  ──────────────────
    judges community-patterns          Browse community rule patterns

  See docs/plugin-guide.md for the full authoring guide.
`,
  },

  "data-adapter": {
    title: "Data Adapters (Team Storage)",
    summary: "Configure external storage for team-wide sharing",
    body: `
  What Are Data Adapters?
  ──────────────────────
  By default, Judges stores feedback, findings, and metrics as local JSON
  files. Data Adapters let your team share this data via your own backend.

  Judges never hosts or processes your data — you bring your own storage.

  Configuration (.judgesrc)
  ────────────────────────
  Local filesystem (default):
    {
      "dataAdapter": { "type": "filesystem" }
    }

  HTTP backend (your own API):
    {
      "dataAdapter": {
        "type": "http",
        "url": "https://your-team-api.example.com/judges",
        "headers": {
          "Authorization": "Bearer \${JUDGES_API_TOKEN}"
        }
      }
    }

  Environment variables in header values are resolved automatically.
  The HTTP adapter uses standard REST endpoints:
    GET  /feedback       Load feedback store
    PUT  /feedback       Save feedback store
    GET  /findings       Load finding store
    PUT  /findings       Save finding store
`,
  },

  "security-ids": {
    title: "CWE & OWASP Identifiers",
    summary: "How findings map to CWE and OWASP standards",
    body: `
  Structured Security IDs
  ──────────────────────
  Every finding is automatically enriched with CWE and OWASP identifiers
  based on its rule prefix and specific rule ID.

  Examples:
    SEC-001  →  CWE-89 (SQL Injection), OWASP A03:2021
    AUTH-001 →  CWE-798 (Hard-coded Credentials), OWASP A07:2021
    XSS-*    →  CWE-79 (Cross-site Scripting), OWASP A03:2021
    SSRF-*   →  CWE-918 (Server-Side Request Forgery), OWASP A10:2021

  These IDs appear in:
    - SARIF output (as rule tags)
    - JSON output (cweIds / owaspIds fields)
    - The --explain flag output
    - VS Code extension hover details

  Use --format sarif for tool integration with GitHub Code Scanning,
  SonarQube, Snyk, and other platforms that consume CWE/OWASP data.
`,
  },

  metrics: {
    title: "Metrics & ROI Tracking",
    summary: "Measuring the value Judges provides",
    body: `
  Quick Metrics
  ─────────────
    judges metrics                    Summary to stdout
    judges metrics --format json      Machine-readable output
    judges metrics --since 30d        Last 30 days only

  Visual Dashboard
  ────────────────
    judges metrics-dashboard                  Generate HTML dashboard
    judges metrics-dashboard --output dash.html

  What's Tracked
  ─────────────
    - Findings detected / fixed / open / false-positive
    - Auto-fix adoption rate
    - Estimated time saved (conservative industry averages)
    - Trend direction (improving / stable / degrading)
    - Fix rates by severity

  All metrics are computed from local data. Configure a DataAdapter
  to aggregate metrics across your team (see: judges help data-adapter).
`,
  },
};

// ─── Runner ─────────────────────────────────────────────────────────────────

export function runHelp(argv: string[]): void {
  const topic = argv.find((a, i) => i > 2 && !a.startsWith("-"))?.toLowerCase();

  if (!topic) {
    printTopicList();
    return;
  }

  const entry = TOPICS[topic];
  if (!entry) {
    console.error(`  Unknown help topic: "${topic}"\n`);
    printTopicList();
    process.exit(1);
  }

  console.log("");
  console.log(`  ${entry.title}`);
  console.log(`  ${"─".repeat(entry.title.length)}`);
  console.log(entry.body);
}

function printTopicList(): void {
  console.log("");
  console.log("  Judges Panel — Help Topics");
  console.log("  ──────────────────────────");
  console.log("");

  const maxKey = Math.max(...Object.keys(TOPICS).map((k) => k.length));
  for (const [key, { summary }] of Object.entries(TOPICS)) {
    console.log(`    judges help ${key.padEnd(maxKey)}   ${summary}`);
  }
  console.log("");
}
