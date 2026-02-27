import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCiCd(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CICD";
  const lang = getLangFamily(language);

  // No test script (multi-language test detection)
  const hasTestScript = /["']test["']\s*:\s*["'][^"']+["']/gi.test(code) ||
    getLangLineNumbers(code, language, LP.TEST_FUNCTION).length > 0 ||
    /jest|mocha|vitest|unittest|pytest|xunit|nunit/gi.test(code);
  const isSourceCode = /(?:function|class|const|let|var|import|export|def |public\s+class)/gi.test(code);
  if (isSourceCode && !hasTestScript && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No test infrastructure detected",
      description: "Source code without any testing framework, test scripts, or test functions. CI pipelines need tests to provide value — without them, CI is just 'continuous building.'",
      recommendation: "Add a test framework (Jest, Vitest, pytest, JUnit). Write tests alongside code. Configure test scripts in package.json or equivalent.",
      reference: "Continuous Integration Best Practices",
      suggestedFix: "Add a `\"test\": \"jest\"` (or equivalent) script to `package.json` and create a first test file, e.g., `src/__tests__/example.test.ts`.",
      confidence: 0.7,
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
      suggestedFix: "Add a `\"lint\": \"eslint .\"` script to `package.json` and create an `.eslintrc` (or `eslint.config.js`) configuration file.",
      confidence: 0.7,
    });
  }

  // Hard process exit in application code (multi-language)
  const processExitLines = getLangLineNumbers(code, language, LP.PANIC_UNWRAP);
  if (processExitLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hard process termination hinders graceful CI/CD lifecycle",
      description: `Found ${processExitLines.length} hard exit call(s) (e.g., process.exit, sys.exit, panic!, System.exit, os.Exit). Hard exits prevent proper shutdown, skip cleanup hooks, and can cause deployment health checks to fail.`,
      lineNumbers: processExitLines,
      recommendation: "Use proper error propagation instead of hard exits. In production, handle SIGTERM gracefully. Let the runtime manage process lifecycle.",
      reference: "12-Factor App: Disposability / Kubernetes Pod Lifecycle",
      suggestedFix: "Replace `process.exit(1)` with `throw new Error('reason')` and register a `process.on('SIGTERM', …)` handler for graceful shutdown.",
      confidence: 0.85,
    });
  }

  // Static analysis suppression comments (multi-language)
  const tsNoCheckLines = getLangLineNumbers(code, language, LP.LINTER_DISABLE);
  if (tsNoCheckLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Static analysis suppression comments detected",
      description: `Found ${tsNoCheckLines.length} instance(s) of disabled type checking or linting. Suppression comments defeat the purpose of static analysis in CI.`,
      lineNumbers: tsNoCheckLines,
      recommendation: "Fix the underlying issues instead of suppressing them. If suppression is necessary, add a comment explaining why and create a tracking issue to resolve it.",
      reference: "TypeScript / ESLint Best Practices",
      suggestedFix: "Remove the `// @ts-ignore` or `// eslint-disable` comment and fix the underlying type error or lint violation directly.",
      confidence: 0.9,
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
      suggestedFix: "Add a `\"build\": \"tsc\"` (or `vite build`, `webpack`, etc.) script to `package.json` so CI can run `npm run build`.",
      confidence: 0.7,
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
      suggestedFix: "Replace `FROM node:latest` with a pinned version such as `FROM node:20.11.0-alpine` or a SHA digest.",
      confidence: 0.9,
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
      suggestedFix: "Create a `.dockerignore` file containing `node_modules`, `.git`, `.env`, and `*.test.*` to exclude unnecessary files from the build context.",
      confidence: 0.8,
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
      suggestedFix: "Add `HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/health || exit 1` before the final `CMD` instruction in the Dockerfile.",
      confidence: 0.7,
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
      suggestedFix: "Add `--coverage` to the test script (e.g., `\"test\": \"jest --coverage\"`) and set a `coverageThreshold` in the Jest/Vitest config.",
      confidence: 0.7,
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
      suggestedFix: "Replace `npm install` with `npm ci` in the CI workflow step to ensure a clean, lockfile-based install.",
      confidence: 0.9,
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
      suggestedFix: "Add `RUN addgroup -S app && adduser -S app -G app` then `USER app` before the `CMD` instruction in the Dockerfile.",
      confidence: 0.7,
    });
  }

  return findings;
}
