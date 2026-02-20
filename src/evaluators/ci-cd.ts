import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeCiCd(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CICD";

  // No test script
  const hasTestScript = /["']test["']\s*:\s*["'][^"']+["']/gi.test(code) ||
    /describe\s*\(|it\s*\(|test\s*\(|@Test|def\s+test_|unittest|pytest|jest|mocha|vitest/gi.test(code);
  const isSourceCode = /(?:function|class|const|let|var|import|export|def |public\s+class)/gi.test(code);
  if (isSourceCode && !hasTestScript && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No test infrastructure detected",
      description: "Source code without any testing framework, test scripts, or test functions. CI pipelines need tests to provide value — without them, CI is just 'continuous building.'",
      recommendation: "Add a test framework (Jest, Vitest, pytest, JUnit). Write tests alongside code. Configure test scripts in package.json or equivalent.",
      reference: "Continuous Integration Best Practices",
    });
  }

  // No lint configuration
  const hasLint = /eslint|prettier|tslint|stylelint|rubocop|pylint|flake8|black|rustfmt|clippy|biome/gi.test(code);
  if (isSourceCode && !hasLint && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No linting/formatting configuration detected",
      description: "No linter or formatter configuration found. Without automated code quality checks, inconsistent code style and common mistakes slip through.",
      recommendation: "Configure ESLint + Prettier (JS/TS), Black + Ruff (Python), or equivalent tools. Add lint scripts and run them in CI.",
      reference: "CI/CD Pipeline Best Practices",
    });
  }

  // process.exit in application code (not test/script)
  const processExitPattern = /process\.exit\s*\(\s*[01]\s*\)/gi;
  const processExitLines = getLineNumbers(code, processExitPattern);
  if (processExitLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "process.exit() hinders graceful CI/CD lifecycle",
      description: `Found ${processExitLines.length} process.exit() call(s). Hard exits prevent proper shutdown, skip cleanup hooks, and can cause deployment health checks to fail.`,
      lineNumbers: processExitLines,
      recommendation: "Use proper error propagation instead of process.exit(). In production, handle SIGTERM gracefully. Let the runtime manage process lifecycle.",
      reference: "12-Factor App: Disposability / Kubernetes Pod Lifecycle",
    });
  }

  // @ts-nocheck or type-checking disabled
  const tsNoCheckPattern = /@ts-nocheck|@ts-ignore|eslint-disable|tslint:disable|# type: ignore|# noqa/gi;
  const tsNoCheckLines = getLineNumbers(code, tsNoCheckPattern);
  if (tsNoCheckLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Static analysis suppression comments detected",
      description: `Found ${tsNoCheckLines.length} instance(s) of disabled type checking or linting. Suppression comments defeat the purpose of static analysis in CI.`,
      lineNumbers: tsNoCheckLines,
      recommendation: "Fix the underlying issues instead of suppressing them. If suppression is necessary, add a comment explaining why and create a tracking issue to resolve it.",
      reference: "TypeScript / ESLint Best Practices",
    });
  }

  // No build script
  const hasBuildScript = /["']build["']\s*:\s*["']/gi.test(code) ||
    /tsc|webpack|vite|rollup|esbuild|babel|make\s+build|gradle\s+build|mvn\s+package/gi.test(code);
  if (isSourceCode && !hasBuildScript && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No build script detected",
      description: "No build script or build tool configuration found. CI pipelines need reproducible builds. Without a build script, builds rely on manual or undocumented steps.",
      recommendation: "Define build scripts in package.json, Makefile, or equivalent. Ensure builds are reproducible from a clean checkout.",
      reference: "Reproducible Builds / CI/CD Best Practices",
    });
  }

  // Docker image using :latest tag
  const latestTagPattern = /FROM\s+\w+(?:\/\w+)*:latest|image:\s*\w+:latest/gi;
  const latestTagLines = getLineNumbers(code, latestTagPattern);
  if (latestTagLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Docker image using :latest tag",
      description: "Docker images reference :latest tag, which is mutable and makes builds non-reproducible. The same tag can point to different images over time.",
      lineNumbers: latestTagLines,
      recommendation: "Pin Docker images to specific versions or SHA digests: FROM node:20.11.0-alpine or FROM node@sha256:abc123...",
      reference: "Docker Best Practices / Supply Chain Security",
    });
  }

  // Dockerfile without .dockerignore
  const hasDockerfile = /^FROM\s+/gim.test(code);
  const hasDockerignore = /\.dockerignore/gi.test(code);
  const copiesEverything = /COPY\s+\.\s+\.|ADD\s+\.\s+\./gi.test(code);
  if (hasDockerfile && copiesEverything && !hasDockerignore) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Dockerfile copies everything without .dockerignore",
      description: "COPY . . or ADD . . copies the entire build context including node_modules, .git, .env, and other unnecessary files. This bloats images and may expose secrets.",
      recommendation: "Create a .dockerignore file excluding node_modules, .git, .env, test files, and build artifacts. Only copy files needed for production.",
      reference: "Docker Best Practices: .dockerignore / Multi-Stage Builds",
    });
  }

  // Dockerfile without HEALTHCHECK
  if (hasDockerfile && !/HEALTHCHECK/gi.test(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Dockerfile without HEALTHCHECK instruction",
      description: "Docker container has no HEALTHCHECK defined. Without health checks, orchestrators (Docker Compose, Kubernetes) cannot detect unhealthy containers for restart.",
      recommendation: "Add a HEALTHCHECK instruction: HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/health || exit 1. Or define health checks in docker-compose/k8s.",
      reference: "Docker HEALTHCHECK / Container Health Best Practices",
    });
  }

  // No test coverage configuration
  const hasTests = /test|jest|mocha|vitest|ava|tape|jasmine|karma/gi.test(code);
  const hasCoverage = /coverage|istanbul|nyc|c8|--coverage|coverageThreshold|coverageDirectory|lcov/gi.test(code);
  if (hasTests && !hasCoverage) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Test configuration without coverage tracking",
      description: "Test tooling is referenced but no code coverage configuration is visible. Without coverage tracking, gaps in test coverage go undetected.",
      recommendation: "Configure coverage reporting (jest --coverage, c8, nyc). Set minimum coverage thresholds. Integrate coverage reports into CI/CD pipeline.",
      reference: "Jest Coverage / Istanbul.js",
    });
  }

  // npm install instead of npm ci in CI
  const npmInstallPattern = /npm\s+install(?!\s+--save|\s+-[gDEOS]|\s+\w)/gi;
  const npmInstallLines = getLineNumbers(code, npmInstallPattern);
  const isCIConfig = /\.github\/workflows|\.gitlab-ci|jenkinsfile|\.circleci|pipeline|ci\s*:/gi.test(code);
  if (npmInstallLines.length > 0 && isCIConfig) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Using 'npm install' instead of 'npm ci' in CI",
      description: "CI configuration uses 'npm install' which may modify package-lock.json and install different versions than intended. This makes builds non-deterministic.",
      lineNumbers: npmInstallLines,
      recommendation: "Use 'npm ci' in CI/CD pipelines for clean, reproducible installs from the lockfile. Only use 'npm install' during local development.",
      reference: "npm ci Documentation / Reproducible Builds",
    });
  }

  // Running as root in Docker
  const hasRootUser = /^USER\s+root/gim.test(code);
  const hasNonRootUser = /^USER\s+(?!root)\w+/gim.test(code);
  if (hasDockerfile && !hasNonRootUser) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Docker container runs as root user",
      description: "No non-root USER instruction found in Dockerfile. Running as root inside containers increases the blast radius of container escape vulnerabilities.",
      recommendation: "Add a non-root user: RUN addgroup -S app && adduser -S app -G app, then USER app. Use the --chown flag with COPY.",
      reference: "Docker Security: Run as Non-Root / CIS Docker Benchmark",
    });
  }

  return findings;
}
