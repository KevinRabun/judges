/**
 * Review-ci-integration — Generate CI pipeline configuration for Judges.
 */

import { existsSync, writeFileSync } from "fs";

// ─── Templates ──────────────────────────────────────────────────────────────

function githubActionsTemplate(): string {
  return `name: Judges Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g @kevinrabun/judges-cli
      - run: judges eval --file \${{ github.event.pull_request.head.sha }} --format sarif --output judges-report.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: judges-report.sarif
`;
}

function azurePipelinesTemplate(): string {
  return `trigger:
  branches:
    include:
      - main
  pr:
    branches:
      include:
        - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
  - script: npm install -g @kevinrabun/judges-cli
    displayName: 'Install Judges'
  - script: judges eval --format sarif --output judges-report.sarif
    displayName: 'Run Judges Review'
  - task: PublishBuildArtifacts@1
    inputs:
      pathtoPublish: judges-report.sarif
      artifactName: judges-report
`;
}

function gitlabCiTemplate(): string {
  return `judges-review:
  image: node:20
  stage: test
  script:
    - npm install -g @kevinrabun/judges-cli
    - judges eval --format sarif --output judges-report.sarif
  artifacts:
    reports:
      sast: judges-report.sarif
    paths:
      - judges-report.sarif
`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewCiIntegration(argv: string[]): void {
  const platformIdx = argv.indexOf("--platform");
  const outputIdx = argv.indexOf("--output");
  const platform = platformIdx >= 0 ? argv[platformIdx + 1] : "github";
  const outputPath = outputIdx >= 0 ? argv[outputIdx + 1] : undefined;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-ci-integration — Generate CI pipeline configuration

Usage:
  judges review-ci-integration [--platform github|azure|gitlab]
                               [--output <file>]

Options:
  --platform <type>  CI platform: github (default), azure, gitlab
  --output <path>    Write config to file
  --help, -h         Show this help
`);
    return;
  }

  let template: string;
  let defaultFile: string;

  switch (platform) {
    case "azure":
      template = azurePipelinesTemplate();
      defaultFile = "azure-pipelines.yml";
      break;
    case "gitlab":
      template = gitlabCiTemplate();
      defaultFile = ".gitlab-ci.yml";
      break;
    default:
      template = githubActionsTemplate();
      defaultFile = ".github/workflows/judges-review.yml";
      break;
  }

  if (outputPath) {
    if (existsSync(outputPath)) {
      console.error(`Error: file already exists: ${outputPath}`);
      console.error("Remove it first or choose a different path");
      process.exitCode = 1;
      return;
    }
    writeFileSync(outputPath, template);
    console.log(`CI config written to ${outputPath}`);
    return;
  }

  console.log(`\n# Judges CI Configuration (${platform})`);
  console.log(`# Suggested file: ${defaultFile}`);
  console.log("─".repeat(60));
  console.log(template);
}
