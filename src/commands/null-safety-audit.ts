/**
 * Null safety audit — identify null/undefined dereference risks, missing
 * guards, and inconsistent nullability patterns.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NullRisk {
  file: string;
  line: number;
  risk: string;
  severity: "high" | "medium" | "low";
  suggestion: string;
}

// ─── File Collection ────────────────────────────────────────────────────────

const CODE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go"]);

function collectFiles(dir: string, max = 300): string[] {
  const files: string[] = [];
  function walk(d: string): void {
    if (files.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const e of entries) {
      if (files.length >= max) return;
      if (e.startsWith(".") || e === "node_modules" || e === "dist" || e === "build") continue;
      const full = join(d, e);
      try {
        if (statSync(full).isDirectory()) walk(full);
        else if (CODE_EXTS.has(extname(full))) files.push(full);
      } catch {
        /* skip */
      }
    }
  }
  walk(dir);
  return files;
}

// ─── Analysis ───────────────────────────────────────────────────────────────

function analyzeFile(filepath: string): NullRisk[] {
  const risks: NullRisk[] = [];
  let content: string;
  try {
    content = readFileSync(filepath, "utf-8");
  } catch {
    return risks;
  }

  const lines = content.split("\n");
  const ext = extname(filepath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Non-null assertion operator (TypeScript !)
    if ((ext === ".ts" || ext === ".tsx") && /\w+!\.\w+/.test(line) && !/\/\//.test(line.split("!.")[0])) {
      risks.push({
        file: filepath,
        line: i + 1,
        risk: "Non-null assertion operator (!.)",
        severity: "medium",
        suggestion: "Replace with optional chaining (?.) or null check",
      });
    }

    // Chained property access without optional chaining
    if (/\w+\.\w+\.\w+\.\w+/.test(line) && !/\?\./.test(line) && !/import|from|require|\/\/|console/.test(line)) {
      // Check if any intermediate could be null
      if (/(?:result|response|data|item|user|config|options|params|body|payload)\.\w+\.\w+/.test(line)) {
        risks.push({
          file: filepath,
          line: i + 1,
          risk: "Deep property access without null check",
          severity: "medium",
          suggestion: "Use optional chaining (?.) for potentially null chains",
        });
      }
    }

    // Array access without bounds check
    if (/\w+\[\d+\]/.test(line) && !/length|\.at\(|slice|\/\//.test(line)) {
      const block = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (!/length|bounds|check|if\s*\(|\.at\(/i.test(block)) {
        risks.push({
          file: filepath,
          line: i + 1,
          risk: "Array index access without bounds check",
          severity: "low",
          suggestion: "Check array length or use .at() with null check",
        });
      }
    }

    // Equality comparison with null using == instead of ===
    if (/==\s*null\b/.test(line) && !/===\s*null/.test(line) && !/!==?\s*null/.test(line)) {
      // == null catches both null and undefined in JS/TS, which is actually intentional in many cases
      // Only flag if there's inconsistency
    }

    // Return type could be null but not documented (TypeScript)
    if ((ext === ".ts" || ext === ".tsx") && /\):\s*\w+\s*\{/.test(line)) {
      const funcBlock = lines.slice(i, Math.min(i + 20, lines.length)).join("\n");
      if (
        /return\s+null\b|return\s+undefined\b/.test(funcBlock) &&
        !/\|\s*null|\|\s*undefined|Maybe|Optional/.test(line)
      ) {
        risks.push({
          file: filepath,
          line: i + 1,
          risk: "Function returns null but type doesn't declare it",
          severity: "high",
          suggestion: "Add | null or | undefined to return type",
        });
      }
    }

    // Unsafe JSON.parse without try/catch
    if (/JSON\.parse\s*\(/.test(line)) {
      const block = lines.slice(Math.max(0, i - 5), Math.min(i + 5, lines.length)).join("\n");
      if (!/try|catch|error/i.test(block)) {
        risks.push({
          file: filepath,
          line: i + 1,
          risk: "JSON.parse without error handling",
          severity: "high",
          suggestion: "Wrap in try/catch — malformed input causes runtime crash",
        });
      }
    }

    // Destructuring without defaults
    if (/const\s*\{[^}]+\}\s*=\s*\w+/.test(line) && !/=\s*\{/.test(line.split("=").slice(2).join("="))) {
      const source = line.match(/=\s*(\w+)/)?.[1];
      if (source && /result|response|data|args|params|options|config/i.test(source)) {
        const block = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (!/if\s*\(|&&|nullish|\?\?|optional/i.test(block)) {
          risks.push({
            file: filepath,
            line: i + 1,
            risk: "Destructuring potentially null value",
            severity: "medium",
            suggestion: "Add defaults or null check: const { x = default } = source ?? {}",
          });
        }
      }
    }

    // parseInt/parseFloat without NaN check
    if (/(?:parseInt|parseFloat|Number)\s*\(/.test(line)) {
      const block = lines.slice(i, Math.min(i + 3, lines.length)).join("\n");
      if (!/isNaN|Number\.isFinite|Number\.isNaN|isFinite/i.test(block)) {
        risks.push({
          file: filepath,
          line: i + 1,
          risk: "Number parsing without NaN check",
          severity: "low",
          suggestion: "Check for NaN after parsing: if (Number.isNaN(result))",
        });
      }
    }

    // Python-specific: using dict[key] instead of dict.get(key)
    if (ext === ".py" && /\w+\[\s*['"][^'"]+['"]\s*\]/.test(line)) {
      if (!/get\(|in\s+\w+|try|KeyError/i.test(lines.slice(Math.max(0, i - 2), i + 1).join("\n"))) {
        risks.push({
          file: filepath,
          line: i + 1,
          risk: "Dict access without KeyError guard",
          severity: "medium",
          suggestion: "Use dict.get(key, default) or check with 'in'",
        });
      }
    }
  }

  return risks;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runNullSafetyAudit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges null-safety-audit — Identify null/undefined dereference risks

Usage:
  judges null-safety-audit [dir]
  judges null-safety-audit src/ --format json

Options:
  [dir]                 Directory to scan (default: .)
  --format json         JSON output
  --help, -h            Show this help

Checks: non-null assertions, deep property chains, array bounds, undocumented null returns,
JSON.parse without try/catch, destructuring null values, NaN checks.
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const dir = argv.find((a) => !a.startsWith("-") && argv.indexOf(a) > 0) || ".";

  const files = collectFiles(dir);
  const allRisks: NullRisk[] = [];
  for (const f of files) allRisks.push(...analyzeFile(f));

  const highCount = allRisks.filter((r) => r.severity === "high").length;
  const medCount = allRisks.filter((r) => r.severity === "medium").length;
  const score = Math.max(0, 100 - highCount * 8 - medCount * 3);

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          risks: allRisks,
          score,
          summary: { high: highCount, medium: medCount, total: allRisks.length },
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    const badge = score >= 80 ? "✅ SAFE" : score >= 50 ? "⚠️  RISKS" : "❌ UNSAFE";
    console.log(`\n  Null Safety: ${badge} (${score}/100)\n  ──────────────────────────`);

    if (allRisks.length === 0) {
      console.log("    No null safety risks detected.\n");
      return;
    }

    for (const r of allRisks.slice(0, 25)) {
      const icon = r.severity === "high" ? "🔴" : r.severity === "medium" ? "🟡" : "🔵";
      console.log(`    ${icon} ${r.risk}`);
      console.log(`        ${r.file}:${r.line}`);
      console.log(`        → ${r.suggestion}`);
    }
    if (allRisks.length > 25) console.log(`    ... and ${allRisks.length - 25} more`);

    console.log(`\n    Total: ${allRisks.length} | High: ${highCount} | Medium: ${medCount} | Score: ${score}/100\n`);
  }
}
