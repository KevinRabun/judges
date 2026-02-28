// ─── Dependency / Supply-chain Analysis ───────────────────────────────────────
// Parses manifest files (package.json, requirements.txt, Cargo.toml, etc.)
// and detects supply-chain risks such as unpinned versions, typosquatting,
// and misclassified dev dependencies.
// ──────────────────────────────────────────────────────────────────────────────

import type { DependencyVerdict, DependencyEntry, Finding } from "../types.js";
import { calculateScore, deriveVerdict } from "./shared.js";

/**
 * Parse a manifest file and analyze dependencies for supply-chain risks.
 */
export function analyzeDependencies(manifest: string, manifestType: string): DependencyVerdict {
  const dependencies: DependencyEntry[] = [];
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "SUPPLY";

  // Parse manifest based on type
  if (manifestType === "package.json") {
    try {
      const pkg = JSON.parse(manifest);
      for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
        dependencies.push({
          name,
          version: String(version),
          isDev: false,
          source: manifestType,
        });
      }
      for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
        dependencies.push({
          name,
          version: String(version),
          isDev: true,
          source: manifestType,
        });
      }
    } catch {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Invalid package.json",
        description: "Failed to parse package.json. The file may be malformed.",
        recommendation: "Validate and fix the JSON structure.",
      });
    }
  } else if (manifestType === "requirements.txt") {
    for (const line of manifest.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*(?:[>=<~!]+\s*(.+))?$/);
      if (match) {
        dependencies.push({
          name: match[1],
          version: match[2] ?? "*",
          isDev: false,
          source: manifestType,
        });
      }
    }
  } else if (manifestType === "Cargo.toml") {
    // Match [dependencies] section up to the next [section] header or EOF
    const depSection = manifest.match(/\[dependencies\]\s*\n([\s\S]*?)(?=\n\s*\[|\s*$)/)?.[1];
    if (depSection) {
      for (const line of depSection.split("\n")) {
        // Simple: name = "version"
        const simple = line.match(/^(\w[\w-]*)\s*=\s*"([^"]+)"/);
        if (simple) {
          dependencies.push({
            name: simple[1],
            version: simple[2],
            isDev: false,
            source: manifestType,
          });
          continue;
        }
        // Inline table: name = { version = "...", ... }
        const table = line.match(/^(\w[\w-]*)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
        if (table) {
          dependencies.push({
            name: table[1],
            version: table[2],
            isDev: false,
            source: manifestType,
          });
        }
      }
    }
  } else if (manifestType === "go.mod") {
    for (const line of manifest.split("\n")) {
      const match = line.trim().match(/^([\w./\-@]+)\s+(v[\d.]+(?:-[\w.]+)?)/);
      if (match) {
        dependencies.push({
          name: match[1],
          version: match[2],
          isDev: false,
          source: manifestType,
        });
      }
    }
  } else if (manifestType === "pom.xml") {
    const depRegex =
      /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?(?:<version>([^<]*)<\/version>)?[\s\S]*?<\/dependency>/g;
    let m;
    while ((m = depRegex.exec(manifest)) !== null) {
      dependencies.push({
        name: `${m[1]}:${m[2]}`,
        version: m[3] ?? "managed",
        isDev: false,
        source: manifestType,
      });
    }
  } else if (manifestType === "csproj") {
    const pkgRegex = /<PackageReference\s+Include="([^"]+)"\s+Version="([^"]*)"/g;
    let m;
    while ((m = pkgRegex.exec(manifest)) !== null) {
      dependencies.push({
        name: m[1],
        version: m[2],
        isDev: false,
        source: manifestType,
      });
    }
  }

  // Supply-chain analysis rules
  // Wildcard / unpinned versions
  const unpinned = dependencies.filter(
    (d) =>
      d.version === "*" ||
      d.version === "latest" ||
      /^\^/.test(d.version) ||
      /^~/.test(d.version) ||
      />=/.test(d.version),
  );
  if (unpinned.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unpinned dependency versions",
      description: `${unpinned.length} dependencies use unpinned/loose version ranges: ${unpinned
        .slice(0, 5)
        .map((d) => `${d.name}@${d.version}`)
        .join(", ")}. This can lead to unexpected breaking changes and supply-chain attacks.`,
      recommendation: "Pin dependencies to exact versions or use a lockfile (package-lock.json, Cargo.lock, go.sum).",
      reference: "Supply Chain Security Best Practices",
    });
  }

  // Too many dependencies
  if (dependencies.filter((d) => !d.isDev).length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Large number of production dependencies",
      description: `${dependencies.filter((d) => !d.isDev).length} production dependencies detected. Each dependency increases attack surface and maintenance burden.`,
      recommendation: "Audit dependencies regularly. Remove unused packages. Consider inlining small utilities.",
      reference: "Dependency Minimization Best Practices",
    });
  }

  // Known risky package name patterns (typosquatting indicators)
  const knownPrefixes = ["lodash", "express", "react", "vue", "angular", "axios", "moment"];
  const suspicious = dependencies.filter((d) =>
    knownPrefixes.some((p) => d.name !== p && d.name.startsWith(p) && d.name.length <= p.length + 3),
  );
  if (suspicious.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potentially typosquatted package names",
      description: `Suspicious package names detected that are similar to popular packages: ${suspicious.map((d) => d.name).join(", ")}. These may be typosquatting attempts.`,
      recommendation: "Verify these package names are intentional and not typos of well-known packages.",
      reference: "NPM Typosquatting / Supply Chain Attacks",
    });
  }

  // Dev dependencies in production flag
  const devInProd = dependencies.filter(
    (d) => !d.isDev && /test|jest|mocha|chai|sinon|eslint|prettier|typescript|ts-node|nodemon/i.test(d.name),
  );
  if (devInProd.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Development tools in production dependencies",
      description: `The following look like dev tools but are listed as production dependencies: ${devInProd.map((d) => d.name).join(", ")}. This inflates deployment size and attack surface.`,
      recommendation: "Move development tools to devDependencies (or equivalent dev scope).",
    });
  }

  // No lockfile hint
  if (manifestType === "package.json" && !manifest.includes("lockfileVersion")) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "info",
      title: "Reminder: ensure a lockfile is committed",
      description:
        "This analysis is based on the manifest. Ensure a lockfile (package-lock.json, yarn.lock) is committed for reproducible builds.",
      recommendation: "Commit your lockfile to version control. Run npm ci in CI/CD instead of npm install.",
    });
  }

  const score = calculateScore(findings);
  const verdict = deriveVerdict(findings, score);

  return {
    totalDependencies: dependencies.length,
    findings,
    dependencies,
    score,
    verdict,
    summary: `Dependency analysis: ${dependencies.length} dependencies, ${findings.length} findings, score ${score}/100 — ${verdict.toUpperCase()}`,
  };
}
