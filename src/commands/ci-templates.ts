/**
 * CI/CD Template Generators — GitLab CI and Azure Pipelines.
 *
 * Used by `judges init` and can be used standalone to generate
 * CI configuration files for Judges integration.
 */

// ─── GitLab CI ──────────────────────────────────────────────────────────────

export function generateGitLabCi(failOnFindings = true): string {
  return `# Judges Panel — GitLab CI Integration
# Add this to your .gitlab-ci.yml or include it as a template.

judges-review:
  stage: test
  image: node:22-slim
  before_script:
    - npm install -g @kevinrabun/judges
  script:
    - judges report . --format markdown${failOnFindings ? " --fail-on-findings" : ""}
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  artifacts:
    reports:
      codequality: judges-report.json
    when: always
  allow_failure: ${!failOnFindings}
`;
}

// ─── Azure Pipelines ────────────────────────────────────────────────────────

export function generateAzurePipelines(failOnFindings = true): string {
  return `# Judges Panel — Azure Pipelines Integration
# Add this to your azure-pipelines.yml or use as a template.

trigger:
  branches:
    include:
      - main
      - develop

pr:
  branches:
    include:
      - main

pool:
  vmImage: "ubuntu-latest"

steps:
  - task: NodeTool@0
    inputs:
      versionSpec: "22.x"
    displayName: "Install Node.js"

  - script: npm install -g @kevinrabun/judges
    displayName: "Install Judges"

  - script: judges report . --format markdown
    displayName: "Run Judges Code Review"${
      failOnFindings
        ? `
    failOnStderr: false`
        : ""
    }

  - script: judges eval --format sarif --output judges.sarif .
    displayName: "Generate SARIF Report"
    condition: always()
${
  failOnFindings
    ? `
  - script: |
      judges report . --fail-on-findings
    displayName: "Quality Gate"`
    : ""
}
`;
}

// ─── Bitbucket Pipelines ────────────────────────────────────────────────────

export function generateBitbucketPipelines(failOnFindings = true): string {
  return `# Judges Panel — Bitbucket Pipelines Integration
# Add this to your bitbucket-pipelines.yml.

pipelines:
  pull-requests:
    "**":
      - step:
          name: Judges Code Review
          image: node:22-slim
          script:
            - npm install -g @kevinrabun/judges
            - judges report . --format markdown${failOnFindings ? " --fail-on-findings" : ""}
`;
}
