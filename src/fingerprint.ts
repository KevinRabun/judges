/**
 * AI Code Fingerprinting — Detect AI-generated code patterns
 *
 * Identifies patterns commonly produced by AI code generators (GitHub Copilot,
 * ChatGPT, Claude, etc.) to flag code that may need extra review.
 *
 * Signals include:
 * - Generic variable naming patterns
 * - Overly verbose/uniform comment styles
 * - Common AI boilerplate patterns
 * - Missing error handling in generated code
 * - Suspiciously complete implementations without tests
 */

import type { Finding, Severity } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AiFingerprint {
  /** Confidence that code is AI-generated (0-1) */
  aiProbability: number;
  /** Individual signals detected */
  signals: AiSignal[];
  /** Risk level based on probability */
  riskLevel: "high" | "medium" | "low" | "none";
  /** Summary text */
  summary: string;
}

export interface AiSignal {
  name: string;
  description: string;
  weight: number;
  matches: number;
  evidence?: string;
}

// ─── Signal Detectors ────────────────────────────────────────────────────────

interface SignalDetector {
  name: string;
  description: string;
  weight: number;
  detect: (code: string, language: string) => { matches: number; evidence?: string };
}

const SIGNAL_DETECTORS: SignalDetector[] = [
  {
    name: "todo-placeholder",
    description: "TODO/FIXME placeholders common in AI-generated code",
    weight: 0.15,
    detect: (code) => {
      const matches = (code.match(/\/\/\s*TODO:?\s*(implement|add|fix|handle|update)/gi) || []).length;
      return { matches, evidence: matches > 0 ? "TODO placeholders without implementation" : undefined };
    },
  },
  {
    name: "generic-naming",
    description: "Generic variable names (data, result, response, temp, item, value)",
    weight: 0.1,
    detect: (code) => {
      const generic = /\b(?:const|let|var)\s+(?:data|result|response|temp|item|value|output|input|obj|arr)\b/gi;
      const matches = (code.match(generic) || []).length;
      const lines = code.split("\n").length;
      // Only signal if ratio is high
      return { matches: matches > lines * 0.05 ? matches : 0 };
    },
  },
  {
    name: "uniform-comments",
    description: "Uniform JSDoc/docstring style on every function",
    weight: 0.12,
    detect: (code) => {
      const jsdocBlocks = (code.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
      const functions = (
        code.match(
          /(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>|(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\w+\s*)?\{)/g,
        ) || []
      ).length;
      // 100% documentation coverage is unusual
      const hasUniformDocs = functions > 2 && jsdocBlocks >= functions;
      return { matches: hasUniformDocs ? jsdocBlocks : 0 };
    },
  },
  {
    name: "example-domains",
    description: "Example domains/placeholder URLs from training data",
    weight: 0.2,
    detect: (code) => {
      const pattern = /(?:example\.com|example\.org|test\.com|localhost:(?:3000|8080|5000)|foo\.bar|acme\.com)/gi;
      const matches = (code.match(pattern) || []).length;
      return { matches, evidence: matches > 0 ? "Example domains found" : undefined };
    },
  },
  {
    name: "boilerplate-express",
    description: "Standard Express.js boilerplate patterns",
    weight: 0.08,
    detect: (code) => {
      const patterns = [
        /app\.listen\s*\(\s*(?:3000|8080|port)/i,
        /app\.use\s*\(\s*express\.json\s*\(\s*\)\s*\)/i,
        /app\.get\s*\(\s*['"]\/['"].*?Hello/i,
      ];
      const matches = patterns.filter((p) => p.test(code)).length;
      return { matches };
    },
  },
  {
    name: "error-handling-gaps",
    description: "Async code without error handling (common AI omission)",
    weight: 0.1,
    detect: (code) => {
      const asyncFns = (code.match(/async\s+(?:function\s+\w+|\w+\s*=\s*async)/g) || []).length;
      const tryCatch = (code.match(/try\s*\{/g) || []).length;
      const catchBlocks = (code.match(/\.catch\s*\(/g) || []).length;
      const unhandled = asyncFns > 0 && tryCatch + catchBlocks < asyncFns * 0.5;
      return { matches: unhandled ? asyncFns - tryCatch - catchBlocks : 0 };
    },
  },
  {
    name: "placeholder-credentials",
    description: "Placeholder API keys/tokens from AI training data",
    weight: 0.25,
    detect: (code) => {
      const pattern =
        /(?:sk-[a-zA-Z0-9]{20,}|your[_-]?api[_-]?key|REPLACE_?ME|YOUR_?TOKEN|insert[_-]?(?:key|token|secret))/gi;
      const matches = (code.match(pattern) || []).length;
      return { matches, evidence: matches > 0 ? "Placeholder credentials detected" : undefined };
    },
  },
  {
    name: "excessive-inline-comments",
    description: "Line-by-line explanatory comments (AI teaching style)",
    weight: 0.12,
    detect: (code) => {
      const lines = code.split("\n");
      const codeLines = lines.filter((l) => l.trim() && !l.trim().startsWith("//") && !l.trim().startsWith("*"));
      const commentLines = lines.filter((l) => l.trim().startsWith("//"));
      const ratio = codeLines.length > 0 ? commentLines.length / codeLines.length : 0;
      return { matches: ratio > 0.5 ? commentLines.length : 0 };
    },
  },
  {
    name: "missing-tests",
    description: "Complex implementation file without corresponding test references",
    weight: 0.08,
    detect: (code) => {
      const hasExports = /export\s+(?:function|class|const|interface|type)/g.test(code);
      const hasTestRef = /(?:describe|it|test|expect|assert|jest|mocha|vitest)\b/g.test(code);
      const isComplex = code.split("\n").length > 50;
      return { matches: hasExports && isComplex && !hasTestRef ? 1 : 0 };
    },
  },
];

// ─── Fingerprinting ──────────────────────────────────────────────────────────

/**
 * Analyze code for AI-generated patterns and return a fingerprint.
 */
export function fingerprintCode(code: string, language: string = "typescript"): AiFingerprint {
  const signals: AiSignal[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const detector of SIGNAL_DETECTORS) {
    const result = detector.detect(code, language);
    totalWeight += detector.weight;

    if (result.matches > 0) {
      matchedWeight += detector.weight;
      signals.push({
        name: detector.name,
        description: detector.description,
        weight: detector.weight,
        matches: result.matches,
        evidence: result.evidence,
      });
    }
  }

  const aiProbability = totalWeight > 0 ? Math.min(1, matchedWeight / totalWeight) : 0;
  const riskLevel: AiFingerprint["riskLevel"] =
    aiProbability >= 0.6 ? "high" : aiProbability >= 0.3 ? "medium" : aiProbability >= 0.1 ? "low" : "none";

  const summary =
    riskLevel === "none"
      ? "No significant AI-generated code signals detected."
      : `${signals.length} AI-generated code signal(s) detected (${Math.round(aiProbability * 100)}% probability).`;

  return { aiProbability, signals, riskLevel, summary };
}

/**
 * Convert AI fingerprint to findings for inclusion in evaluation results.
 */
export function fingerprintToFindings(fingerprint: AiFingerprint): Finding[] {
  if (fingerprint.riskLevel === "none") return [];

  const findings: Finding[] = [];

  if (fingerprint.riskLevel === "high" || fingerprint.riskLevel === "medium") {
    findings.push({
      ruleId: "AICS-FP-001",
      title: "Code appears to be AI-generated",
      severity: (fingerprint.riskLevel === "high" ? "medium" : "low") as Severity,
      description:
        `This code has a ${Math.round(fingerprint.aiProbability * 100)}% probability of being AI-generated. ` +
        `Signals: ${fingerprint.signals.map((s) => s.name).join(", ")}. ` +
        `AI-generated code may contain hallucinations, security vulnerabilities, or incorrect assumptions.`,
      recommendation: "Review AI-generated code carefully. Verify business logic, security patterns, and edge cases.",
      lineNumbers: [1],
    });
  }

  for (const signal of fingerprint.signals) {
    if (signal.weight >= 0.15) {
      findings.push({
        ruleId: `AICS-FP-${signal.name.toUpperCase().replace(/-/g, "")}`,
        title: signal.description,
        severity: "info" as Severity,
        description: `Detected ${signal.matches} instance(s) of "${signal.name}" pattern. ${signal.evidence || ""}`,
        recommendation: "Verify this code was intentionally written and not blindly accepted from an AI tool.",
        lineNumbers: [1],
      });
    }
  }

  return findings;
}
