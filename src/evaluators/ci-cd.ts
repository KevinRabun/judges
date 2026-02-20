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

  return findings;
}
