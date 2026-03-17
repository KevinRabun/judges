/**
 * CI templates — generate ready-to-use CI/CD pipeline configs for
 * GitHub Actions, GitLab CI, Azure Pipelines, Bitbucket Pipelines,
 * and CircleCI. Eliminates manual YAML authoring for teams adopting Judges.
 */

// ─── Templates ──────────────────────────────────────────────────────────────

const GITHUB_ACTIONS = `# .github/workflows/judges.yml
name: Judges Code Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  judges:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install -g @kevinrabun/judges-cli
      - name: Run Judges evaluation
        run: |
          judges eval --file "src/**/*.ts" --format sarif --fail-on-findings > judges.sarif
        continue-on-error: true
      - name: Upload SARIF
        if: always()
        run: judges upload --file judges.sarif
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      - name: Post PR summary
        if: always()
        run: judges pr-summary --sarif judges.sarif --pr \${{ github.event.pull_request.number }}
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`;

const GITLAB_CI = `# .gitlab-ci.yml
judges-review:
  image: node:20
  stage: test
  script:
    - npm install -g @kevinrabun/judges-cli
    - judges eval --file "src/**/*.ts" --format sarif > judges.sarif
    - judges eval --file "src/**/*.ts" --format codeclimate > codeclimate.json
  artifacts:
    reports:
      sast: judges.sarif
      codequality: codeclimate.json
  rules:
    - if: $CI_MERGE_REQUEST_IID
`;

const AZURE_PIPELINES = `# azure-pipelines.yml
trigger:
  - main

pool:
  vmImage: "ubuntu-latest"

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "20.x"

  - script: npm install -g @kevinrabun/judges-cli
    displayName: "Install Judges"

  - script: judges eval --file "src/**/*.ts" --format sarif > judges.sarif
    displayName: "Run Judges evaluation"

  - task: PublishBuildArtifacts@1
    inputs:
      PathtoPublish: judges.sarif
      ArtifactName: judges-results
    condition: always()
`;

const BITBUCKET_PIPELINES = `# bitbucket-pipelines.yml
image: node:20

pipelines:
  pull-requests:
    "**":
      - step:
          name: Judges Code Review
          caches:
            - node
          script:
            - npm install -g @kevinrabun/judges-cli
            - judges eval --file "src/**/*.ts" --format json > judges-results.json
            - judges eval --file "src/**/*.ts" --format text
          artifacts:
            - judges-results.json
`;

const CIRCLECI = `# .circleci/config.yml
version: 2.1

jobs:
  judges-review:
    docker:
      - image: cimg/node:20.0
    steps:
      - checkout
      - run:
          name: Install Judges
          command: npm install -g @kevinrabun/judges-cli
      - run:
          name: Run evaluation
          command: judges eval --file "src/**/*.ts" --format sarif > judges.sarif
      - store_artifacts:
          path: judges.sarif
          destination: judges-results

workflows:
  review:
    jobs:
      - judges-review
`;

// ─── Template Registry ──────────────────────────────────────────────────────

export interface CiTemplate {
  id: string;
  name: string;
  file: string;
  content: string;
}

const TEMPLATES: CiTemplate[] = [
  { id: "github", name: "GitHub Actions", file: ".github/workflows/judges.yml", content: GITHUB_ACTIONS },
  { id: "gitlab", name: "GitLab CI", file: ".gitlab-ci.yml", content: GITLAB_CI },
  { id: "azure", name: "Azure Pipelines", file: "azure-pipelines.yml", content: AZURE_PIPELINES },
  { id: "bitbucket", name: "Bitbucket Pipelines", file: "bitbucket-pipelines.yml", content: BITBUCKET_PIPELINES },
  { id: "circleci", name: "CircleCI", file: ".circleci/config.yml", content: CIRCLECI },
];

export function getTemplate(id: string): CiTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function listTemplates(): CiTemplate[] {
  return TEMPLATES;
}

// ─── Auto-Detect Platform ──────────────────────────────────────────────────

function detectPlatform(): string | undefined {
  const { existsSync } = require("fs");
  if (existsSync(".github")) return "github";
  if (existsSync(".gitlab-ci.yml")) return "gitlab";
  if (existsSync("azure-pipelines.yml")) return "azure";
  if (existsSync("bitbucket-pipelines.yml")) return "bitbucket";
  if (existsSync(".circleci")) return "circleci";
  return undefined;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCiTemplate(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges ci-template — Generate CI/CD pipeline config for Judges

Usage:
  judges ci-template --platform github      Generate GitHub Actions workflow
  judges ci-template --platform gitlab      Generate GitLab CI config
  judges ci-template --platform azure       Generate Azure Pipelines config
  judges ci-template --platform bitbucket   Generate Bitbucket Pipelines config
  judges ci-template --platform circleci    Generate CircleCI config
  judges ci-template --list                 List available templates
  judges ci-template --auto                 Auto-detect platform

Options:
  --platform <id>    CI platform (github, gitlab, azure, bitbucket, circleci)
  --write            Write to the appropriate file location
  --list             List all available templates
  --auto             Auto-detect platform from repo structure
  --help, -h         Show this help
`);
    return;
  }

  if (argv.includes("--list")) {
    console.log("\n  Available CI Templates:\n");
    for (const t of TEMPLATES) {
      console.log(`    ${t.id.padEnd(12)} ${t.name.padEnd(25)} → ${t.file}`);
    }
    console.log("");
    return;
  }

  let platform = argv.find((_a: string, i: number) => argv[i - 1] === "--platform");
  if (argv.includes("--auto")) {
    platform = detectPlatform();
    if (!platform) {
      console.error("Error: could not auto-detect CI platform");
      process.exit(1);
    }
    console.log(`  Auto-detected platform: ${platform}`);
  }

  if (!platform) {
    console.error("Error: --platform <id> required. Use --list to see options.");
    process.exit(1);
  }

  const template = getTemplate(platform);
  if (!template) {
    console.error(`Error: unknown platform "${platform}". Use --list to see options.`);
    process.exit(1);
  }

  if (argv.includes("--write")) {
    const { writeFileSync, mkdirSync } = require("fs");
    const { dirname } = require("path");
    const dir = dirname(template.file);
    if (dir !== ".") mkdirSync(dir, { recursive: true });
    writeFileSync(template.file, template.content, "utf-8");
    console.log(`  ✅ Written ${template.file}`);
    return;
  }

  console.log(template.content);
}
