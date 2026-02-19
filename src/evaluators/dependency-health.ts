import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeDependencyHealth(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "DEPS";
  let ruleNum = 1;

  // Detect wildcard version ranges
  const wildcardLines: number[] = [];
  lines.forEach((line, i) => {
    if (/["']\s*\*\s*["']|["']\s*latest\s*["']/i.test(line) && /["']\w+["']\s*:/i.test(line)) {
      wildcardLines.push(i + 1);
    }
  });
  if (wildcardLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Wildcard or 'latest' dependency version",
      description: "Using '*' or 'latest' for dependency versions means any version can be installed, including ones with breaking changes or vulnerabilities.",
      lineNumbers: wildcardLines,
      recommendation: "Pin dependencies to specific versions or use caret (^) ranges at minimum. Use a lockfile (package-lock.json, yarn.lock).",
      reference: "Dependency Management Best Practices",
    });
  }

  // Detect importing from deprecated or risky packages
  const riskyPkgLines: number[] = [];
  const riskyPackages = /require\s*\(\s*["'](request|moment|underscore|bower|left-pad|event-stream)["']\)|from\s+["'](request|moment|underscore|bower|left-pad|event-stream)["']/i;
  lines.forEach((line, i) => {
    if (riskyPkgLines.length < 10 && riskyPackages.test(line)) {
      riskyPkgLines.push(i + 1);
    }
  });
  if (riskyPkgLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Deprecated or unmaintained package import",
      description: "Importing from packages that are deprecated, unmaintained, or have known supply chain issues.",
      lineNumbers: riskyPkgLines,
      recommendation: "Replace deprecated packages: moment->date-fns/luxon, request->node-fetch/axios, underscore->lodash-es or native methods.",
      reference: "npm deprecation notices / package health scores",
    });
  }

  // Detect excessive dependencies for simple tasks
  const importLines: number[] = [];
  lines.forEach((line, i) => {
    if (/^import\s|^const\s.*=\s*require\s*\(/i.test(line.trim())) {
      importLines.push(i + 1);
    }
  });
  if (importLines.length > 20 && lines.length < 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "High import-to-code ratio",
      description: `File has ${importLines.length} imports but only ${lines.length} lines. This suggests over-reliance on external packages for simple tasks.`,
      lineNumbers: importLines.slice(0, 5),
      recommendation: "Evaluate whether all dependencies are necessary. Consider implementing simple utilities natively to reduce the dependency tree.",
      reference: "Dependency Minimization / Supply Chain Security",
    });
  }

  // Detect relative import depth issues
  const deepImportLines: number[] = [];
  lines.forEach((line, i) => {
    if (/from\s+["']\.\.\/.+\.\.\/.+\.\.\//i.test(line) || /require\s*\(\s*["']\.\.\/.+\.\.\/.+\.\.\//i.test(line)) {
      deepImportLines.push(i + 1);
    }
  });
  if (deepImportLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Deeply nested relative imports",
      description: "Imports with many '../' levels are fragile and hard to read. They break easily when files are moved.",
      lineNumbers: deepImportLines,
      recommendation: "Configure path aliases (tsconfig paths, webpack aliases, babel module resolver) for cleaner imports.",
      reference: "TypeScript Path Mapping / Module Resolution",
    });
  }

  // Detect multiple packages for same purpose (e.g., multiple HTTP clients)
  const httpClients = new Set<string>();
  const httpClientLines: number[] = [];
  lines.forEach((line, i) => {
    const clients = ["axios", "node-fetch", "got", "request", "superagent", "undici"];
    for (const client of clients) {
      if (new RegExp(`["']${client}["']`).test(line)) {
        httpClients.add(client);
        httpClientLines.push(i + 1);
      }
    }
  });
  if (httpClients.size > 1) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Multiple HTTP client libraries detected",
      description: `Found ${httpClients.size} different HTTP client libraries (${[...httpClients].join(", ")}). This inflates bundle size and creates inconsistency.`,
      lineNumbers: httpClientLines,
      recommendation: "Standardize on a single HTTP client library across the project. Wrap it in an abstraction if needed.",
      reference: "Dependency Consolidation",
    });
  }

  // Detect too-broad version ranges
  const broadVersionLines: number[] = [];
  lines.forEach((line, i) => {
    if (/["']\s*>=?\s*\d/i.test(line) && /["']\w+["']\s*:/i.test(line)) {
      broadVersionLines.push(i + 1);
    }
  });
  if (broadVersionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Overly broad dependency version range",
      description: "Using >= version ranges allows major version upgrades that may include breaking changes.",
      lineNumbers: broadVersionLines,
      recommendation: "Use caret (^) for minor updates or tilde (~) for patch updates. Avoid >= ranges in production dependencies.",
      reference: "Semantic Versioning / npm Version Ranges",
    });
  }

  // Detect missing lockfile indicators
  const isPackageJson = /["']name["']\s*:\s*["']|["']version["']\s*:\s*["']\d/i.test(code);
  if (isPackageJson) {
    const hasEngines = /["']engines["']\s*:/i.test(code);
    if (!hasEngines) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Missing engines field in package.json",
        description: "No engines field specifying required Node.js version. Different Node versions may have incompatible behavior.",
        recommendation: "Add an 'engines' field to specify minimum Node.js and npm versions: \"engines\": { \"node\": \">=18.0.0\" }.",
        reference: "package.json engines field",
      });
    }
  }

  // Detect importing specific vs barrel imports
  const barrelImportLines: number[] = [];
  lines.forEach((line, i) => {
    if (/import\s+\{[^}]{100,}\}\s+from/i.test(line)) {
      barrelImportLines.push(i + 1);
    }
    if (/import\s+\*\s+as\s+\w+\s+from\s+["'](?!.*node_modules)/i.test(line)) {
      barrelImportLines.push(i + 1);
    }
  });
  if (barrelImportLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Barrel imports may prevent tree-shaking",
      description: "Importing everything from a barrel file or using 'import *' can prevent tree-shaking and increase bundle size.",
      lineNumbers: barrelImportLines,
      recommendation: "Import directly from specific module files instead of barrel/index files for better tree-shaking.",
      reference: "Tree Shaking / Module Bundling",
    });
  }

  // Detect dev dependencies in production code paths
  const devDepLines: number[] = [];
  lines.forEach((line, i) => {
    if (/require\s*\(\s*["'](?:jest|mocha|chai|sinon|enzyme|@testing-library|nyc|istanbul|prettier|eslint)["']\)/i.test(line)) {
      // Check if this is not a test file
      if (!/\.test\.|\.spec\.|__tests__|__mocks__/i.test(code.slice(0, 50))) {
        devDepLines.push(i + 1);
      }
    }
  });
  if (devDepLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Dev dependency imported in production code",
      description: "Test/dev dependencies are imported in what appears to be production code, which will fail if devDependencies aren't installed.",
      lineNumbers: devDepLines,
      recommendation: "Move test imports to test files. Ensure devDependencies are only used in test/config files.",
      reference: "npm devDependencies vs dependencies",
    });
  }

  // Detect packages with known supply chain risks
  const supplyChainLines: number[] = [];
  lines.forEach((line, i) => {
    if (/postinstall|preinstall|install.*script/i.test(line) && /["']scripts["']/i.test(lines.slice(Math.max(0, i - 5), i).join("\n"))) {
      supplyChainLines.push(i + 1);
    }
  });
  if (supplyChainLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Install lifecycle scripts detected",
      description: "postinstall/preinstall scripts can execute arbitrary code and are a common supply chain attack vector.",
      lineNumbers: supplyChainLines,
      recommendation: "Audit install scripts carefully. Use --ignore-scripts flag and allowlists. Consider using npm audit signatures.",
      reference: "Supply Chain Security / npm install scripts",
    });
  }

  return findings;
}
