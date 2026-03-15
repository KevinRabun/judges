/**
 * Review-cicd-integrate — Generate CI/CD integration configs for Judges.
 */

import { writeFileSync } from "fs";

// ─── Templates ──────────────────────────────────────────────────────────────

const TEMPLATES: Record<string, { filename: string; content: string }> = {
  "github-actions": {
    filename: ".github/workflows/judges.yml",
    content: `name: Judges Code Review
on: [pull_request]
jobs:
  judges-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npx @kevinrabun/judges eval --file \${{ github.event.pull_request.head.sha }} --format sarif --fail-on-findings
`,
  },
  "gitlab-ci": {
    filename: ".gitlab-ci.yml",
    content: `judges-review:
  stage: test
  image: node:20
  script:
    - npx @kevinrabun/judges eval --format sarif --fail-on-findings
  only:
    - merge_requests
`,
  },
  "azure-pipelines": {
    filename: "azure-pipelines-judges.yml",
    content: `trigger:
  - main
pool:
  vmImage: 'ubuntu-latest'
steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
  - script: npx @kevinrabun/judges eval --format sarif --fail-on-findings
    displayName: 'Run Judges Review'
`,
  },
  jenkins: {
    filename: "Jenkinsfile-judges",
    content: `pipeline {
    agent any
    stages {
        stage('Judges Review') {
            steps {
                sh 'npx @kevinrabun/judges eval --format sarif --fail-on-findings'
            }
        }
    }
}
`,
  },
};

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCicdIntegrate(argv: string[]): void {
  const platformIdx = argv.indexOf("--platform");
  const outIdx = argv.indexOf("--out");
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-cicd-integrate — Generate CI/CD integration configs

Usage:
  judges review-cicd-integrate --platform <name> [--out <path>]
                               [--format table|json]

Options:
  --platform <name>  CI/CD platform: github-actions, gitlab-ci, azure-pipelines, jenkins
  --out <path>       Write config to file (default: print to stdout)
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  // List platforms
  if (platformIdx < 0) {
    const platforms = Object.keys(TEMPLATES);
    if (format === "json") {
      console.log(JSON.stringify({ platforms }, null, 2));
    } else {
      console.log(`\nAvailable CI/CD Platforms:`);
      console.log("═".repeat(40));
      for (const p of platforms) {
        const t = TEMPLATES[p];
        console.log(`  ${p.padEnd(20)} → ${t.filename}`);
      }
      console.log("\nUse --platform <name> to generate config.");
      console.log("═".repeat(40));
    }
    return;
  }

  const platform = argv[platformIdx + 1];
  const template = TEMPLATES[platform];

  if (template === undefined) {
    console.error(`Unknown platform: ${platform}`);
    console.error(`Available: ${Object.keys(TEMPLATES).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (outIdx >= 0) {
    const outPath = argv[outIdx + 1];
    writeFileSync(outPath, template.content);
    console.log(`Config written to: ${outPath}`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(template, null, 2));
    return;
  }

  console.log(`\n--- ${template.filename} ---`);
  console.log(template.content);
}
