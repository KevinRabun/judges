import type { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeOverEngineering(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "OVER";
  const lines = code.split("\n");
  const loc = lines.length;

  // Skip test files — they legitimately use builders / helpers
  const isTestFile = /\b(?:describe|it|test)\s*\(/i.test(code) || /\b(?:test|spec|__tests__)\b/i.test(language);
  if (isTestFile) return findings;

  // ─── OVER-001: Single-implementation abstractions ──────────────────────────
  // Detect abstract class / interface with only one implementation in the file
  const abstractDecls = getLineNumbers(code, /(?:abstract\s+class|interface\s+)\w+/g);
  const classDecls = getLineNumbers(code, /class\s+\w+\s+(?:extends|implements)\s+\w+/g);

  // In a single file, if we see ≥ 3 abstract/interface declarations but few
  // implementing classes, the abstractions are likely unnecessary.
  if (abstractDecls.length >= 3 && classDecls.length <= abstractDecls.length) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Multiple single-implementation abstractions",
      description: `Found ${abstractDecls.length} abstract classes or interfaces with at most ${classDecls.length} implementing class(es) in the same file. Each abstraction adds cognitive overhead; prefer concrete implementations until a second consumer requires polymorphism.`,
      lineNumbers: abstractDecls.slice(0, 5),
      recommendation:
        "Remove abstractions that have only one implementation. Introduce interfaces when you have two or more consumers or when crossing module boundaries.",
      reference: "YAGNI — You Aren't Gonna Need It",
      suggestedFix:
        "Inline the interface into the concrete class. Extract an interface later when a second implementation is needed.",
      confidence: 0.7,
    });
  }

  // ─── OVER-002: Trivial wrappers around builtins ──────────────────────────
  // Functions that simply delegate to a builtin with no added logic
  const wrapperPatterns =
    /(?:function|const|export\s+(?:function|const))\s+\w*(?:wrapper|wrap|helper|util)\w*\s*(?:=\s*(?:\([^)]*\)\s*=>|function)|\()/gi;
  const wrapperLines = getLineNumbers(code, wrapperPatterns);

  // Also detect trivial fetch/fs/crypto wrappers (functions that return the builtin call directly)
  const trivialDelegation =
    /(?:return\s+(?:fetch|fs\.\w+|crypto\.\w+|JSON\.(?:parse|stringify)|console\.\w+|Math\.\w+)\s*\()/g;
  const trivialLines = getLineNumbers(code, trivialDelegation);

  if (trivialLines.length >= 5) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Excessive trivial wrappers around standard APIs",
      description: `Found ${trivialLines.length} functions that simply delegate to standard library calls (fetch, fs, JSON, crypto) with no added value (no retry, caching, logging, or error handling).`,
      lineNumbers: trivialLines.slice(0, 5),
      recommendation:
        "Call the standard API directly. Wrappers are justified only when they add cross-cutting concerns (retry, circuit-breaking, telemetry, caching).",
      reference: "Rule of Three — refactoring guidance",
      suggestedFix: "Remove the wrapper function and call the standard API at each call site.",
      confidence: 0.7,
    });
  }

  // ─── OVER-003: God interfaces (10+ methods) ──────────────────────────────
  // Detect interfaces with many method signatures
  const interfaceBlocks = code.matchAll(/(?:interface|abstract\s+class)\s+(\w+)[^{]*\{([^}]{200,})\}/gs);
  const godInterfaces: { name: string; line: number; methodCount: number }[] = [];
  for (const m of interfaceBlocks) {
    const body = m[2];
    // Count method-like signatures: lines with parentheses (method signatures)
    const methodCount = (body.match(/\w+\s*\([^)]*\)\s*[;:{]/g) || []).length;
    if (methodCount >= 10) {
      const idx = code.indexOf(m[0]);
      const line = code.slice(0, idx).split("\n").length;
      godInterfaces.push({ name: m[1], line, methodCount });
    }
  }
  if (godInterfaces.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "God interface detected",
      description: `${godInterfaces.length} interface(s) with 10+ methods: ${godInterfaces
        .map((g) => `${g.name} (${g.methodCount} methods)`)
        .join(", ")}. Large interfaces violate the Interface Segregation Principle.`,
      lineNumbers: godInterfaces.map((g) => g.line),
      recommendation:
        "Split into smaller, focused interfaces that each serve a specific client. Consumers should not depend on methods they do not use.",
      reference: "SOLID — Interface Segregation Principle (ISP)",
      suggestedFix: "Extract related methods into separate interfaces (e.g., IReadable, IWritable).",
      confidence: 0.75,
    });
  }

  // ─── OVER-004: Builder/factory for simple objects ─────────────────────────
  const builderPattern = /class\s+\w*Builder\w*\s*[{<]/g;
  const factoryPattern = /class\s+\w*Factory\w*\s*[{<]/g;
  const builderLines = getLineNumbers(code, builderPattern);
  const factoryLines = getLineNumbers(code, factoryPattern);

  // Check if the built object has few fields (≤ 3 setters in the builder)
  if (builderLines.length > 0) {
    const builderMatch = code.match(/class\s+\w*Builder\w*[^}]*\}/s);
    if (builderMatch) {
      const setterCount = (builderMatch[0].match(/\bset\w+\s*\(|with\w+\s*\(/g) || []).length;
      if (setterCount <= 3) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "low",
          title: "Builder pattern for simple object",
          description: `Builder class has only ${setterCount} setter(s). For objects with ≤ 3 fields, a constructor or object literal is simpler and more readable.`,
          lineNumbers: builderLines,
          recommendation:
            "Use a constructor, factory function, or object literal. Reserve the Builder pattern for objects with many optional fields (≥ 5).",
          reference: "Effective Java, Item 2 — Consider a builder when faced with many constructor parameters",
          suggestedFix: "Replace the Builder with a plain constructor: `new Foo({ field1, field2, field3 })`.",
          confidence: 0.7,
        });
      }
    }
  }

  // ─── OVER-005: Enterprise patterns in small code ──────────────────────────
  if (loc < 500) {
    const enterprisePatterns = [
      {
        pattern: /(?:@Injectable|@Inject|Container\.get|container\.resolve|ServiceLocator|Injector)/g,
        name: "dependency injection container",
      },
      {
        pattern: /(?:EventBus|EventEmitter|MessageBroker|PubSub|EventDispatcher)(?:\s*[({<])/g,
        name: "event bus / message broker",
      },
      {
        pattern: /(?:AbstractFactory|FactoryMethod|ServiceRegistry|PluginManager)(?:\s*[({<])/g,
        name: "abstract factory / registry",
      },
    ];

    const found: { name: string; lines: number[] }[] = [];
    for (const ep of enterprisePatterns) {
      const epLines = getLineNumbers(code, ep.pattern);
      if (epLines.length > 0) {
        found.push({ name: ep.name, lines: epLines });
      }
    }

    if (found.length >= 2) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Enterprise patterns in small codebase",
        description: `File has only ${loc} lines but uses ${found.length} enterprise-grade patterns: ${found
          .map((f) => f.name)
          .join(", ")}. This adds complexity disproportionate to the code's scope.`,
        lineNumbers: found.flatMap((f) => f.lines).slice(0, 5),
        recommendation:
          "For small services (< 500 LOC), prefer direct function calls, simple module imports, and constructor parameters. Introduce DI containers and event buses only when the codebase grows to warrant them.",
        reference: "KISS Principle / Simple Design",
        suggestedFix: "Replace the container with direct constructor injection or module-level imports.",
        confidence: 0.65,
      });
    }
  }

  // ─── OVER-006: Excessive generic type parameters ──────────────────────────
  const genericHeavy = getLineNumbers(
    code,
    /<\w+(?:\s+extends\s+\w+)?,\s*\w+(?:\s+extends\s+\w+)?,\s*\w+(?:\s+extends\s+\w+)?(?:,\s*\w+(?:\s+extends\s+\w+)?)*>/g,
  );
  if (genericHeavy.length >= 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Excessive generic type parameters",
      description: `Found ${genericHeavy.length} declaration(s) with 3+ generic type parameters. Deeply parameterised types are hard to read and often indicate over-generalisation.`,
      lineNumbers: genericHeavy.slice(0, 5),
      recommendation:
        "Reduce generic parameters by using concrete types where only one instantiation exists. Extract type aliases for complex generic combinations.",
      reference: "TypeScript Handbook — Generics / Clean Code",
      suggestedFix: "Replace unused generic parameters with concrete types.",
      confidence: 0.6,
    });
  }

  return findings;
}
