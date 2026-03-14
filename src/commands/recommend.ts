/**
 * Rule recommendations — analyze project stack and suggest which
 * judges/rules are most relevant.
 *
 * Uses local file analysis only — no external services.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, extname } from "path";
import { defaultRegistry } from "../judge-registry.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StackSignal {
  framework: string;
  confidence: number;
  detectedVia: string;
}

export interface JudgeRecommendation {
  judgeId: string;
  relevance: "high" | "medium" | "low";
  reason: string;
  estimatedCoverage: string;
}

// ─── Stack Detection ────────────────────────────────────────────────────────

const FRAMEWORK_SIGNALS: Array<{
  framework: string;
  files: string[];
  deps: string[];
}> = [
  { framework: "React", files: [], deps: ["react", "react-dom", "next", "@remix-run/react"] },
  { framework: "Next.js", files: ["next.config.js", "next.config.mjs", "next.config.ts"], deps: ["next"] },
  { framework: "Express", files: [], deps: ["express"] },
  { framework: "FastAPI", files: [], deps: ["fastapi", "uvicorn"] },
  { framework: "Django", files: ["manage.py", "settings.py"], deps: ["django"] },
  { framework: "Spring Boot", files: ["pom.xml", "build.gradle"], deps: ["spring-boot"] },
  { framework: "Rails", files: ["Gemfile", "config/routes.rb"], deps: ["rails"] },
  { framework: "Terraform", files: [], deps: [] },
  { framework: "Kubernetes", files: [], deps: [] },
  { framework: "Docker", files: ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"], deps: [] },
  { framework: "Vue", files: [], deps: ["vue", "nuxt"] },
  { framework: "Angular", files: ["angular.json"], deps: ["@angular/core"] },
  { framework: "Svelte", files: ["svelte.config.js"], deps: ["svelte", "@sveltejs/kit"] },
  { framework: "Flask", files: [], deps: ["flask"] },
  { framework: "Go", files: ["go.mod", "go.sum"], deps: [] },
  { framework: "Rust", files: ["Cargo.toml"], deps: [] },
];

function scanDirectory(dir: string, depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".") || entry === "node_modules" || entry === "vendor" || entry === "dist") continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isFile()) files.push(entry);
        else if (stat.isDirectory())
          files.push(...scanDirectory(full, depth + 1, maxDepth).map((f) => `${entry}/${f}`));
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
  return files;
}

function detectLanguages(files: string[]): Record<string, number> {
  const extMap: Record<string, string> = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".java": "Java",
    ".go": "Go",
    ".rs": "Rust",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".rb": "Ruby",
    ".tf": "Terraform",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".sql": "SQL",
    ".sh": "Shell",
    ".ps1": "PowerShell",
  };
  const counts: Record<string, number> = {};
  for (const f of files) {
    const ext = extname(f);
    const lang = extMap[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + 1;
  }
  return counts;
}

export function detectStack(dir = "."): StackSignal[] {
  const files = scanDirectory(dir);
  const signals: StackSignal[] = [];

  // Check for framework config files
  for (const fw of FRAMEWORK_SIGNALS) {
    for (const file of fw.files) {
      if (files.includes(file) || existsSync(join(dir, file))) {
        signals.push({ framework: fw.framework, confidence: 0.9, detectedVia: `config file: ${file}` });
      }
    }
  }

  // Check package.json dependencies
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const fw of FRAMEWORK_SIGNALS) {
        for (const dep of fw.deps) {
          if (allDeps[dep]) {
            const existing = signals.find((s) => s.framework === fw.framework);
            if (!existing) {
              signals.push({ framework: fw.framework, confidence: 0.85, detectedVia: `package.json: ${dep}` });
            }
          }
        }
      }
    } catch {
      /* skip */
    }
  }

  // Check for Terraform files
  if (files.some((f) => f.endsWith(".tf"))) {
    signals.push({ framework: "Terraform", confidence: 0.95, detectedVia: "*.tf files" });
  }

  // Check for Kubernetes manifests
  if (files.some((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
    for (const f of files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      try {
        const content = readFileSync(join(dir, f), "utf-8").slice(0, 500);
        if (content.includes("apiVersion:") && content.includes("kind:")) {
          signals.push({ framework: "Kubernetes", confidence: 0.9, detectedVia: `manifest: ${f}` });
          break;
        }
      } catch {
        /* skip */
      }
    }
  }

  return signals;
}

// ─── Recommendation Engine ──────────────────────────────────────────────────

const JUDGE_FRAMEWORK_MAP: Record<string, string[]> = {
  react: ["xss-judge", "frontend-judge"],
  "next.js": ["xss-judge", "ssr-judge", "frontend-judge"],
  express: ["injection-judge", "auth-judge", "ssrf-judge"],
  fastapi: ["injection-judge", "auth-judge", "python-judge"],
  django: ["injection-judge", "auth-judge", "python-judge"],
  "spring boot": ["injection-judge", "auth-judge", "java-judge"],
  terraform: ["iac-judge", "secrets-judge"],
  kubernetes: ["iac-judge", "container-judge"],
  docker: ["container-judge", "secrets-judge"],
};

export function getRecommendations(dir = "."): JudgeRecommendation[] {
  const stack = detectStack(dir);
  const files = scanDirectory(dir);
  const languages = detectLanguages(files);
  const allJudges = defaultRegistry.getJudges().map((j) => j.id);
  const recommendations: JudgeRecommendation[] = [];
  const seen = new Set<string>();

  // Framework-specific recommendations
  for (const signal of stack) {
    const matching = JUDGE_FRAMEWORK_MAP[signal.framework.toLowerCase()] || [];
    for (const judgeId of matching) {
      if (seen.has(judgeId)) continue;
      // Check if this judge actually exists
      const actual = allJudges.find((j) => j.includes(judgeId.replace("-judge", "")));
      if (actual) {
        seen.add(actual);
        recommendations.push({
          judgeId: actual,
          relevance: "high",
          reason: `${signal.framework} detected (${signal.detectedVia}). This judge covers common ${signal.framework} patterns.`,
          estimatedCoverage: "80-90%",
        });
      }
    }
  }

  // Language-based recommendations
  const topLang = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [lang, count] of topLang) {
    const percentage = Math.round((count / files.length) * 100);
    if (percentage < 5) continue;

    for (const jId of allJudges) {
      if (seen.has(jId)) continue;
      if (jId.toLowerCase().includes(lang.toLowerCase().replace(/[#+]/g, ""))) {
        seen.add(jId);
        recommendations.push({
          judgeId: jId,
          relevance: "medium",
          reason: `${lang} is ${percentage}% of your codebase (${count} files).`,
          estimatedCoverage: "60-80%",
        });
      }
    }
  }

  // Universal judges everyone should use
  const universalJudges = ["security", "secrets", "error", "performance"];
  for (const keyword of universalJudges) {
    for (const jId of allJudges) {
      if (seen.has(jId)) continue;
      if (jId.toLowerCase().includes(keyword)) {
        seen.add(jId);
        recommendations.push({
          judgeId: jId,
          relevance: "medium",
          reason: `Universal ${keyword} rules apply to all codebases.`,
          estimatedCoverage: "70-85%",
        });
      }
    }
  }

  return recommendations.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.relevance] - order[b.relevance];
  });
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRecommend(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges recommend — Analyze project and recommend judges

Usage:
  judges recommend                   Analyze current directory
  judges recommend --dir /path       Analyze specific directory
  judges recommend --stack-only      Only show detected stack

Options:
  --dir <path>         Directory to analyze (default: .)
  --stack-only         Only show detected frameworks
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((_a: string, i: number) => argv[i - 1] === "--dir") || ".";

  if (argv.includes("--stack-only")) {
    const stack = detectStack(dir);
    if (format === "json") {
      console.log(JSON.stringify(stack, null, 2));
    } else if (stack.length === 0) {
      console.log("\n  No frameworks detected.\n");
    } else {
      console.log("\n  Detected Stack\n  ──────────────");
      for (const s of stack) {
        console.log(`    ${s.framework.padEnd(16)} (${(s.confidence * 100).toFixed(0)}%) via ${s.detectedVia}`);
      }
      console.log("");
    }
    return;
  }

  const recs = getRecommendations(dir);
  const stack = detectStack(dir);

  if (format === "json") {
    console.log(JSON.stringify({ stack, recommendations: recs }, null, 2));
    return;
  }

  console.log("\n  Project Analysis\n  ────────────────");

  if (stack.length > 0) {
    console.log("\n  Detected stack:");
    for (const s of stack) {
      console.log(`    ${s.framework.padEnd(16)} (${(s.confidence * 100).toFixed(0)}%) via ${s.detectedVia}`);
    }
  }

  if (recs.length === 0) {
    console.log("\n  No specific recommendations. All judges are applicable.\n");
    return;
  }

  console.log(`\n  Recommended Judges (${recs.length}):\n`);
  for (const r of recs) {
    const icon = r.relevance === "high" ? "🟢" : r.relevance === "medium" ? "🟡" : "⚪";
    console.log(`    ${icon} ${r.judgeId.padEnd(25)} [${r.relevance}] coverage: ${r.estimatedCoverage}`);
    console.log(`       ${r.reason}`);
  }
  console.log("");
}
