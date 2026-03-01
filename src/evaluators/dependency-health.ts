import type { Finding } from "../types.js";
import { getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeDependencyHealth(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "DEPS";
  let ruleNum = 1;
  const _lang = getLangFamily(language);

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
      description:
        "Using '*' or 'latest' for dependency versions means any version can be installed, including ones with breaking changes or vulnerabilities.",
      lineNumbers: wildcardLines,
      recommendation:
        "Pin dependencies to specific versions or use caret (^) ranges at minimum. Use a lockfile (package-lock.json, yarn.lock).",
      reference: "Dependency Management Best Practices",
      suggestedFix:
        'Replace `"*"` or `"latest"` with a pinned version such as `"^2.1.0"` and run `npm install` to regenerate the lockfile.',
      confidence: 0.9,
    });
  }

  // Detect importing from deprecated or risky packages
  const riskyPkgLines: number[] = [];
  const riskyPackages =
    /require\s*\(\s*["'](request|moment|underscore|bower|left-pad|event-stream)["']\)|from\s+["'](request|moment|underscore|bower|left-pad|event-stream)["']/i;
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
      recommendation:
        "Replace deprecated packages: moment->date-fns/luxon, request->node-fetch/axios, underscore->lodash-es or native methods.",
      reference: "npm deprecation notices / package health scores",
      suggestedFix:
        "Replace the deprecated import with its modern alternative, e.g. change `require('request')` to `require('node-fetch')` or `require('axios')`.",
      confidence: 0.9,
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
      recommendation:
        "Evaluate whether all dependencies are necessary. Consider implementing simple utilities natively to reduce the dependency tree.",
      reference: "Dependency Minimization / Supply Chain Security",
      suggestedFix:
        "Remove unused imports and replace trivial utility packages (e.g. `is-odd`, `left-pad`) with inline implementations.",
      confidence: 0.75,
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
      description:
        "Imports with many '../' levels are fragile and hard to read. They break easily when files are moved.",
      lineNumbers: deepImportLines,
      recommendation:
        "Configure path aliases (tsconfig paths, webpack aliases, babel module resolver) for cleaner imports.",
      reference: "TypeScript Path Mapping / Module Resolution",
      suggestedFix:
        'Add a path alias in `tsconfig.json` (e.g. `"@src/*": ["src/*"]`) and replace deep `../../../` imports with the alias.',
      confidence: 0.85,
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
      recommendation:
        "Standardize on a single HTTP client library across the project. Wrap it in an abstraction if needed.",
      reference: "Dependency Consolidation",
      suggestedFix:
        "Pick one HTTP client (e.g. `axios` or native `fetch`) and replace all other HTTP client imports with it.",
      confidence: 0.9,
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
      recommendation:
        "Use caret (^) for minor updates or tilde (~) for patch updates. Avoid >= ranges in production dependencies.",
      reference: "Semantic Versioning / npm Version Ranges",
      suggestedFix:
        'Replace `>=` version ranges with caret ranges, e.g. change `">=3.0.0"` to `"^3.0.0"` to allow only non-breaking updates.',
      confidence: 0.85,
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
        description:
          "No engines field specifying required Node.js version. Different Node versions may have incompatible behavior.",
        recommendation:
          'Add an \'engines\' field to specify minimum Node.js and npm versions: "engines": { "node": ">=18.0.0" }.',
        reference: "package.json engines field",
        suggestedFix: 'Add `"engines": { "node": ">=18.0.0" }` to the top level of `package.json`.',
        confidence: 0.7,
      });
    }
  }

  // Detect importing specific vs barrel imports (multi-language wildcard detection)
  const barrelImportLines: number[] = [];
  const wildcardImportLines = getLangLineNumbers(code, language, LP.WILDCARD_IMPORT);
  lines.forEach((line, i) => {
    if (/import\s+\{[^}]{100,}\}\s+from/i.test(line)) {
      barrelImportLines.push(i + 1);
    }
  });
  const allBarrelLines = [...new Set([...barrelImportLines, ...wildcardImportLines])].sort((a, b) => a - b);
  if (allBarrelLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Barrel or wildcard imports may prevent tree-shaking",
      description:
        "Importing everything from a barrel file or using wildcard imports (import *, from x import *, using static *) can prevent tree-shaking and increase bundle size.",
      lineNumbers: allBarrelLines,
      recommendation:
        "Import directly from specific module files instead of barrel/index files for better tree-shaking.",
      reference: "Tree Shaking / Module Bundling",
      suggestedFix:
        "Replace wildcard or barrel imports (e.g. `import * from 'lib'`) with named imports from specific sub-modules (e.g. `import { fn } from 'lib/fn'`).",
      confidence: 0.9,
    });
  }

  // Detect dev dependencies in production code paths
  const devDepLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /require\s*\(\s*["'](?:jest|mocha|chai|sinon|enzyme|@testing-library|nyc|istanbul|prettier|eslint)["']\)/i.test(
        line,
      )
    ) {
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
      description:
        "Test/dev dependencies are imported in what appears to be production code, which will fail if devDependencies aren't installed.",
      lineNumbers: devDepLines,
      recommendation: "Move test imports to test files. Ensure devDependencies are only used in test/config files.",
      reference: "npm devDependencies vs dependencies",
      suggestedFix:
        "Remove the dev-only `require('jest')` (or similar) from this production file and move it to a `.test.ts` or `.spec.ts` file.",
      confidence: 0.85,
    });
  }

  // Detect packages with known supply chain risks
  const supplyChainLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /postinstall|preinstall|install.*script/i.test(line) &&
      /["']scripts["']/i.test(lines.slice(Math.max(0, i - 5), i).join("\n"))
    ) {
      supplyChainLines.push(i + 1);
    }
  });
  if (supplyChainLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Install lifecycle scripts detected",
      description:
        "postinstall/preinstall scripts can execute arbitrary code and are a common supply chain attack vector.",
      lineNumbers: supplyChainLines,
      recommendation:
        "Audit install scripts carefully. Use --ignore-scripts flag and allowlists. Consider using npm audit signatures.",
      reference: "Supply Chain Security / npm install scripts",
      suggestedFix:
        "Remove or audit the `postinstall`/`preinstall` script and run `npm install --ignore-scripts` to prevent automatic execution.",
      confidence: 0.9,
    });
  }

  // Potential typosquatting — misspelled popular package names
  const typosquatTargets: Record<string, string[]> = {
    lodash: ["lod-ash", "lodashs", "lodahs", "1odash", "lodash-utils"],
    axios: ["axois", "axio", "axxios", "axioss", "axious"],
    express: ["expresss", "expres", "xpress", "exress"],
    react: ["reacrt", "raect", "reactt", "reakt"],
    mongoose: ["mongose", "mongoosse", "mongooes", "mongoos"],
    chalk: ["chalks", "chalkk", "chalck"],
    commander: ["comander", "commanderr", "comanderr"],
    dotenv: ["dotnev", "dotenvs", "dotenev"],
    webpack: ["webpackk", "weback", "webpac"],
    "cross-env": ["crossenv", "cross-envv"],
    "event-stream": ["event-streams", "events-stream", "eventstream"],
    colors: ["colour", "colorsss"],
  };
  const typosquatLines: number[] = [];
  const typosquatNames: string[] = [];
  lines.forEach((line, i) => {
    const match = line.match(/(?:require\s*\(\s*["']|from\s+["'])([^"'/]+)["']/);
    if (match) {
      const pkg = match[1].toLowerCase();
      for (const [legit, squats] of Object.entries(typosquatTargets)) {
        if (squats.includes(pkg)) {
          typosquatLines.push(i + 1);
          typosquatNames.push(`"${pkg}" (likely meant "${legit}")`);
        }
      }
    }
  });
  if (typosquatLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential typosquatting package import",
      description: `Suspicious package name(s) detected: ${typosquatNames.join(", ")}. Typosquatting attacks publish malicious packages with names similar to popular ones to steal credentials, inject backdoors, or mine cryptocurrency.`,
      lineNumbers: typosquatLines,
      recommendation:
        "Verify the package name is correct. Use 'npm info <package>' to check if it's a legitimate package. Enable npm audit and consider using Socket.dev or Snyk for supply chain monitoring.",
      reference: "Supply Chain Attack — Typosquatting / CWE-1357",
      suggestedFix:
        "Correct the misspelled package name in the import statement, e.g. change `require('axois')` to `require('axios')`.",
      confidence: 0.9,
    });
  }

  // ── Known Vulnerable Version Patterns ─────────────────────────────────────
  // Detects packages at versions with well-known critical CVEs
  const knownVulnerableVersions: Array<{
    pkg: string;
    vulnPattern: RegExp;
    cve: string;
    fixed: string;
    desc: string;
  }> = [
    {
      pkg: "lodash",
      vulnPattern: /["'][\^~]?(?:4\.[0-9]\.|4\.1[0-6]\.)/,
      cve: "CVE-2021-23337",
      fixed: "4.17.21",
      desc: "Prototype pollution via template",
    },
    {
      pkg: "minimist",
      vulnPattern: /["'][\^~]?(?:0\.\d\.|1\.0\.|1\.1\.|1\.2\.[0-5])/,
      cve: "CVE-2021-44906",
      fixed: "1.2.6",
      desc: "Prototype pollution",
    },
    {
      pkg: "glob-parent",
      vulnPattern: /["'][\^~]?(?:[0-4]\.|5\.[0-1]\.)/,
      cve: "CVE-2020-28469",
      fixed: "5.1.2",
      desc: "Regular expression denial of service",
    },
    {
      pkg: "node-fetch",
      vulnPattern: /["'][\^~]?(?:[0-1]\.|2\.[0-5]\.|2\.6\.[0-6])/,
      cve: "CVE-2022-0235",
      fixed: "2.6.7",
      desc: "Exposure of sensitive information",
    },
    {
      pkg: "jsonwebtoken",
      vulnPattern: /["'][\^~]?(?:[0-7]\.|8\.[0-4]\.|8\.5\.[0-1])/,
      cve: "CVE-2022-23529",
      fixed: "9.0.0",
      desc: "Insecure key handling",
    },
    {
      pkg: "axios",
      vulnPattern: /["'][\^~]?(?:0\.\d\.|0\.1\d\.|0\.2[0-6]\.|0\.27\.[0-1])/,
      cve: "CVE-2023-45857",
      fixed: "1.6.0",
      desc: "CSRF token exposure",
    },
    {
      pkg: "express",
      vulnPattern: /["'][\^~]?(?:[0-3]\.|4\.[0-9]\.|4\.1[0-6]\.)/,
      cve: "CVE-2024-29041",
      fixed: "4.19.2",
      desc: "Open redirect",
    },
    {
      pkg: "tar",
      vulnPattern: /["'][\^~]?(?:[0-5]\.|6\.[0-1]\.[0-8])/,
      cve: "CVE-2021-37701",
      fixed: "6.1.9",
      desc: "Arbitrary file overwrite",
    },
    {
      pkg: "path-to-regexp",
      vulnPattern: /["'][\^~]?(?:[0-5]\.|6\.[0-1]\.)/,
      cve: "CVE-2024-45296",
      fixed: "6.3.0",
      desc: "ReDoS vulnerability",
    },
    {
      pkg: "xml2js",
      vulnPattern: /["'][\^~]?(?:0\.[0-3]\.|0\.4\.[0-9]|0\.4\.1\d|0\.4\.2[0-2])/,
      cve: "CVE-2023-0842",
      fixed: "0.5.0",
      desc: "Prototype pollution",
    },
    {
      pkg: "semver",
      vulnPattern: /["'][\^~]?(?:[0-6]\.|7\.[0-4]\.|7\.5\.[0-1])/,
      cve: "CVE-2022-25883",
      fixed: "7.5.2",
      desc: "ReDoS in semver parsing",
    },
    {
      pkg: "underscore",
      vulnPattern: /["'][\^~]?(?:1\.(?:[0-9]\.|1[0-2]\.|13\.[0-1]))/,
      cve: "CVE-2021-23358",
      fixed: "1.13.2",
      desc: "Arbitrary code execution via template",
    },
  ];

  if (isPackageJson) {
    const vulnLines: number[] = [];
    const vulnDetails: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (const v of knownVulnerableVersions) {
        const pkgPat = new RegExp(`["']${v.pkg}["']\\s*:\\s*${v.vulnPattern.source}`);
        if (pkgPat.test(lines[i])) {
          vulnLines.push(i + 1);
          vulnDetails.push(`${v.pkg} — ${v.cve}: ${v.desc} (fixed in ${v.fixed})`);
        }
      }
    }
    if (vulnLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Dependencies with known critical CVEs detected",
        description: `${vulnLines.length} dependency version(s) match known vulnerable ranges:\n${vulnDetails.join("\n")}`,
        lineNumbers: vulnLines,
        recommendation:
          "Upgrade affected packages to the fixed versions listed. Run 'npm audit fix' or manually update package.json.",
        reference: vulnDetails.map((d) => d.split(":")[0]).join(", "),
        suggestedFix: `Update to fixed versions: ${vulnDetails
          .map((d) => {
            const m = d.match(/(\S+)\s.*fixed in (\S+)\)/);
            return m ? `${m[1]}@${m[2]}` : d;
          })
          .join(", ")}`,
        confidence: 0.85,
      });
    }
  }

  // ── License Risk Detection ──────────────────────────────────────────────
  // Detect copyleft licenses in package.json which may require open-sourcing
  if (isPackageJson) {
    const licenseLines: number[] = [];
    const gplLicenses = /["']license["']\s*:\s*["'](GPL|AGPL|LGPL|CC-BY-SA|EUPL|OSL|SSPL|BSL|CPAL)/i;
    for (let i = 0; i < lines.length; i++) {
      if (gplLicenses.test(lines[i])) {
        licenseLines.push(i + 1);
      }
    }
    if (licenseLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Copyleft license detected — legal review required",
        description:
          "Package uses a copyleft license (GPL/AGPL/LGPL/SSPL) which may require you to release your source code under the same license.",
        lineNumbers: licenseLines,
        recommendation:
          "Review the license requirements with your legal team. AGPL requires open-sourcing server-side code. Consider replacing with permissively licensed alternatives (MIT, Apache-2.0, BSD).",
        reference: "Open Source License Compliance — SPDX",
        suggestedFix:
          "Replace the copyleft-licensed dependency with an alternative that uses a permissive license (MIT, Apache-2.0, BSD).",
        confidence: 0.8,
      });
    }
  }

  // ── Excessive Production Dependency Count ─────────────────────────────────
  if (isPackageJson) {
    const depSection = code.match(/"dependencies"\s*:\s*\{([^}]*)\}/s);
    if (depSection) {
      const depCount = (depSection[1].match(/"[^"]+"\s*:/g) || []).length;
      if (depCount > 30) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Large number of production dependencies",
          description: `${depCount} production dependencies detected. Large dependency trees increase attack surface, installation time, and maintenance burden.`,
          lineNumbers: [1],
          recommendation:
            "Audit dependencies for necessity. Remove unused packages. Consider replacing heavyweight libraries with lighter alternatives or native APIs.",
          reference: "Supply Chain Security — Dependency Minimization",
          suggestedFix: "Run `npx depcheck` to identify unused dependencies and remove them with `npm uninstall`.",
          confidence: 0.75,
        });
      }
    }
  }

  // ── Pre-release Versions in Production ────────────────────────────────────
  const prereleaseLines: number[] = [];
  if (isPackageJson) {
    const depsRegion = code.match(/"dependencies"\s*:\s*\{([^}]*)\}/s);
    if (depsRegion) {
      const depsStart = code.indexOf(depsRegion[0]);
      const depsLines = depsRegion[0].split("\n");
      const startLine = code.substring(0, depsStart).split("\n").length;
      depsLines.forEach((line, i) => {
        if (/["']\d+\.\d+\.\d+-(alpha|beta|rc|canary|next|dev|pre|snapshot)/i.test(line)) {
          prereleaseLines.push(startLine + i);
        }
      });
    }
    if (prereleaseLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "medium",
        title: "Pre-release dependency version in production",
        description: `${prereleaseLines.length} production dependencies use pre-release versions (alpha/beta/rc). Pre-release versions may have breaking changes and are not guaranteed stable.`,
        lineNumbers: prereleaseLines,
        recommendation:
          "Replace pre-release versions with stable releases. If a stable version doesn't exist yet, evaluate the risk and pin to the exact pre-release version.",
        reference: "Semantic Versioning — Pre-release versions",
        suggestedFix:
          "Pin to a stable version by removing the pre-release suffix, e.g. change `2.0.0-beta.1` to `2.0.0`.",
        confidence: 0.8,
      });
    }
  }

  return findings;
}
