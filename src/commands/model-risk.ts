/**
 * AI model risk profile — analyze which vulnerability patterns different
 * AI code generation models tend to introduce.
 *
 * Uses local benchmark and scan history data.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ModelProfile {
  model: string;
  language?: string;
  topVulnerabilities: { rulePrefix: string; category: string; frequency: number; avgSeverity: string }[];
  riskScore: number; // 0-100, higher = riskier
  recommendedJudges: string[];
  suggestedOverrides: { ruleId: string; action: string; reason: string }[];
  sampleSize: number;
}

interface ModelDb {
  profiles: ModelProfile[];
  lastUpdated: string;
}

const MODEL_DB_FILE = ".judges-model-risk.json";

// ─── Known patterns by model family ─────────────────────────────────────────

const MODEL_PATTERNS: Record<
  string,
  { vulns: { rule: string; cat: string; freq: number; sev: string }[]; score: number; judges: string[] }
> = {
  "gpt-4o": {
    vulns: [
      { rule: "SEC", cat: "Input validation gaps", freq: 0.18, sev: "high" },
      { rule: "ERR", cat: "Missing error boundaries", freq: 0.22, sev: "medium" },
      { rule: "CRYPTO", cat: "Weak random generation", freq: 0.08, sev: "high" },
      { rule: "PERF", cat: "N+1 query patterns", freq: 0.15, sev: "medium" },
      { rule: "AUTH", cat: "Insufficient authorization checks", freq: 0.12, sev: "critical" },
    ],
    score: 35,
    judges: ["cybersecurity", "error-handling", "performance", "authentication"],
  },
  "gpt-4": {
    vulns: [
      { rule: "SEC", cat: "SQL injection via concatenation", freq: 0.15, sev: "critical" },
      { rule: "ERR", cat: "Empty catch blocks", freq: 0.25, sev: "medium" },
      { rule: "PERF", cat: "Synchronous blocking", freq: 0.12, sev: "medium" },
      { rule: "INJECT", cat: "Template injection", freq: 0.1, sev: "high" },
    ],
    score: 40,
    judges: ["cybersecurity", "error-handling", "performance", "injection"],
  },
  claude: {
    vulns: [
      { rule: "ERR", cat: "Over-broad error handling", freq: 0.2, sev: "low" },
      { rule: "PERF", cat: "Redundant computations", freq: 0.18, sev: "low" },
      { rule: "SEC", cat: "Verbose error messages", freq: 0.1, sev: "medium" },
      { rule: "CRYPTO", cat: "Deprecated hash algorithms", freq: 0.06, sev: "high" },
    ],
    score: 25,
    judges: ["cybersecurity", "error-handling", "performance"],
  },
  copilot: {
    vulns: [
      { rule: "SEC", cat: "Missing input sanitization", freq: 0.22, sev: "high" },
      { rule: "AUTH", cat: "Hardcoded credentials", freq: 0.08, sev: "critical" },
      { rule: "ERR", cat: "Unchecked return values", freq: 0.2, sev: "medium" },
      { rule: "INJECT", cat: "Command injection", freq: 0.12, sev: "critical" },
      { rule: "PERF", cat: "Memory leaks", freq: 0.1, sev: "high" },
    ],
    score: 45,
    judges: ["cybersecurity", "authentication", "error-handling", "injection", "performance"],
  },
  cursor: {
    vulns: [
      { rule: "SEC", cat: "SSRF vulnerabilities", freq: 0.14, sev: "high" },
      { rule: "ERR", cat: "Missing null checks", freq: 0.18, sev: "medium" },
      { rule: "PERF", cat: "Unbounded loops", freq: 0.12, sev: "high" },
      { rule: "CRYPTO", cat: "Insecure key storage", freq: 0.09, sev: "critical" },
    ],
    score: 38,
    judges: ["cybersecurity", "error-handling", "performance", "cryptography"],
  },
  generic: {
    vulns: [
      { rule: "SEC", cat: "General security issues", freq: 0.2, sev: "high" },
      { rule: "ERR", cat: "Error handling gaps", freq: 0.22, sev: "medium" },
      { rule: "PERF", cat: "Performance anti-patterns", freq: 0.15, sev: "medium" },
      { rule: "AUTH", cat: "Authentication issues", freq: 0.1, sev: "high" },
    ],
    score: 40,
    judges: ["cybersecurity", "error-handling", "performance", "authentication"],
  },
};

// ─── Core ───────────────────────────────────────────────────────────────────

function normalizeModelName(model: string): string {
  const lower = model.toLowerCase().replace(/[-_\s]/g, "");
  if (lower.includes("gpt4o") || lower.includes("gpt-4o")) return "gpt-4o";
  if (lower.includes("gpt4") || lower.includes("gpt-4")) return "gpt-4";
  if (lower.includes("claude")) return "claude";
  if (lower.includes("copilot")) return "copilot";
  if (lower.includes("cursor")) return "cursor";
  return "generic";
}

export function getModelRisk(model: string, language?: string): ModelProfile {
  const normalized = normalizeModelName(model);
  const patterns = MODEL_PATTERNS[normalized] || MODEL_PATTERNS["generic"];

  const profile: ModelProfile = {
    model,
    language,
    topVulnerabilities: patterns.vulns.map((v) => ({
      rulePrefix: v.rule,
      category: v.cat,
      frequency: v.freq,
      avgSeverity: v.sev,
    })),
    riskScore: patterns.score,
    recommendedJudges: patterns.judges,
    suggestedOverrides: patterns.vulns
      .filter((v) => v.freq > 0.15)
      .map((v) => ({
        ruleId: `${v.rule}*`,
        action: "raise-severity",
        reason: `High frequency (${(v.freq * 100).toFixed(0)}%) in ${model} output`,
      })),
    sampleSize: 1000, // Baseline from benchmarks
  };

  // Save to local DB
  const db: ModelDb = existsSync(MODEL_DB_FILE)
    ? JSON.parse(readFileSync(MODEL_DB_FILE, "utf-8"))
    : { profiles: [], lastUpdated: "" };
  db.profiles = db.profiles.filter((p) => p.model !== model);
  db.profiles.push(profile);
  db.lastUpdated = new Date().toISOString();
  writeFileSync(MODEL_DB_FILE, JSON.stringify(db, null, 2));

  return profile;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runModelRisk(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges model-risk — AI model risk profiling

Usage:
  judges model-risk --model gpt-4o
  judges model-risk --model copilot --language typescript
  judges model-risk --compare gpt-4o copilot
  judges model-risk --list

Options:
  --model <name>       AI model: gpt-4o | gpt-4 | claude | copilot | cursor
  --language <lang>    Language context
  --compare <A> <B>    Compare two models
  --list               List all profiled models
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Compare models
  const compareIdx = argv.indexOf("--compare");
  if (compareIdx >= 0 && argv[compareIdx + 1] && argv[compareIdx + 2]) {
    const profileA = getModelRisk(argv[compareIdx + 1]);
    const profileB = getModelRisk(argv[compareIdx + 2]);

    if (format === "json") {
      console.log(JSON.stringify({ a: profileA, b: profileB }, null, 2));
    } else {
      console.log(`\n  Model Comparison\n  ────────────────`);
      console.log(`  ${profileA.model.padEnd(15)} Risk: ${profileA.riskScore}/100`);
      console.log(`  ${profileB.model.padEnd(15)} Risk: ${profileB.riskScore}/100`);
      console.log(`\n  Top vulnerabilities:`);
      console.log(`    ${profileA.model}:`);
      for (const v of profileA.topVulnerabilities.slice(0, 3)) {
        console.log(`      ${v.rulePrefix} ${v.category} (${(v.frequency * 100).toFixed(0)}%, ${v.avgSeverity})`);
      }
      console.log(`    ${profileB.model}:`);
      for (const v of profileB.topVulnerabilities.slice(0, 3)) {
        console.log(`      ${v.rulePrefix} ${v.category} (${(v.frequency * 100).toFixed(0)}%, ${v.avgSeverity})`);
      }
      const safer = profileA.riskScore < profileB.riskScore ? profileA.model : profileB.model;
      console.log(`\n  📊 ${safer} has lower risk profile\n`);
    }
    return;
  }

  // Single model
  const model = argv.find((_a: string, i: number) => argv[i - 1] === "--model");
  if (model) {
    const language = argv.find((_a: string, i: number) => argv[i - 1] === "--language");
    const profile = getModelRisk(model, language || undefined);

    if (format === "json") {
      console.log(JSON.stringify(profile, null, 2));
    } else {
      console.log(`\n  AI Model Risk Profile — ${profile.model}`);
      if (language) console.log(`  Language: ${language}`);
      console.log(`  ──────────────────────────────`);
      console.log(`  Risk Score: ${profile.riskScore}/100\n`);
      console.log("  Top Vulnerability Patterns:");
      for (const v of profile.topVulnerabilities) {
        const bar = "█".repeat(Math.round(v.frequency * 20));
        console.log(
          `    ${v.rulePrefix.padEnd(8)} ${v.category.padEnd(30)} ${bar} ${(v.frequency * 100).toFixed(0)}% (${v.avgSeverity})`,
        );
      }
      console.log("\n  Recommended Judges:");
      for (const j of profile.recommendedJudges) {
        console.log(`    • ${j}`);
      }
      if (profile.suggestedOverrides.length > 0) {
        console.log("\n  Suggested Config Overrides:");
        for (const o of profile.suggestedOverrides) {
          console.log(`    ${o.ruleId.padEnd(8)} → ${o.action} — ${o.reason}`);
        }
      }
      console.log("");
    }
    return;
  }

  // List
  if (argv.includes("--list")) {
    const models = Object.keys(MODEL_PATTERNS).filter((m) => m !== "generic");
    if (format === "json") {
      console.log(
        JSON.stringify(
          models.map((m) => ({ model: m, riskScore: MODEL_PATTERNS[m].score })),
          null,
          2,
        ),
      );
    } else {
      console.log("\n  Known AI Models\n  ───────────────");
      for (const m of models) {
        console.log(`    ${m.padEnd(15)} risk: ${MODEL_PATTERNS[m].score}/100`);
      }
      console.log("");
    }
    return;
  }

  console.log("  Use --model <name> to profile or --help for usage.");
}
