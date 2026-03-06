// ─── Hallucinated API / Import Validation ─────────────────────────────────────
// Detects APIs, imports, methods, and patterns that are commonly hallucinated
// by AI code generators. These include non-existent standard library functions,
// fabricated npm/PyPI packages, phantom class methods, and incorrect API
// signatures that look plausible but don't exist.
//
// This evaluator uses a curated registry of known hallucination patterns
// observed across popular LLMs.
// ──────────────────────────────────────────────────────────────────────────────

import type { Finding } from "../types.js";
import { getLangFamily, isCommentLine } from "./shared.js";

// ─── Known Hallucinated APIs ────────────────────────────────────────────────

interface HallucinatedPattern {
  /** Regex to detect the hallucinated usage */
  pattern: RegExp;
  /** What the LLM generated */
  hallucinated: string;
  /** Why it's wrong */
  reason: string;
  /** What to use instead */
  fix: string;
  /** Applicable languages */
  languages: string[];
}

/**
 * Curated registry of APIs, methods, and imports that LLMs frequently
 * hallucinate. Each entry includes the incorrect pattern, an explanation,
 * and the correct alternative.
 */
const HALLUCINATED_PATTERNS: HallucinatedPattern[] = [
  // ── Node.js / JavaScript ──────────────────────────────────────────────

  // fs.readFileAsync doesn't exist — it's fs.promises.readFile
  {
    pattern: /\bfs\.readFileAsync\s*\(/,
    hallucinated: "fs.readFileAsync()",
    reason: "Node.js fs module has no readFileAsync. This is a common LLM hallucination.",
    fix: "Use fs.promises.readFile() or util.promisify(fs.readFile)().",
    languages: ["javascript", "typescript"],
  },
  // fs.writeFileAsync
  {
    pattern: /\bfs\.writeFileAsync\s*\(/,
    hallucinated: "fs.writeFileAsync()",
    reason: "Node.js fs module has no writeFileAsync.",
    fix: "Use fs.promises.writeFile() or util.promisify(fs.writeFile)().",
    languages: ["javascript", "typescript"],
  },
  // Array.prototype.flat doesn't take a callback (confusing flat with flatMap)
  {
    pattern: /\.flat\s*\(\s*(?:function|\([^)]*\)\s*=>|[a-zA-Z_]\w*\s*=>)/,
    hallucinated: ".flat(callback)",
    reason:
      "Array.flat() does not accept a callback — it only takes an optional depth number. LLMs confuse it with Array.flatMap().",
    fix: "Use .flatMap(callback) to both map and flatten, or .map(callback).flat() for two steps.",
    languages: ["javascript", "typescript"],
  },
  // Object.hasOwn is correct, but LLMs sometimes generate Object.hasOwnKey
  {
    pattern: /\bObject\.hasOwnKey\s*\(/,
    hallucinated: "Object.hasOwnKey()",
    reason: "Object.hasOwnKey() does not exist. LLMs conflate hasOwn() and hasOwnProperty().",
    fix: "Use Object.hasOwn(obj, key) (ES2022+) or Object.prototype.hasOwnProperty.call(obj, key).",
    languages: ["javascript", "typescript"],
  },
  // Promise.allResolved — doesn't exist, LLMs conflate allSettled
  {
    pattern: /\bPromise\.allResolved\s*\(/,
    hallucinated: "Promise.allResolved()",
    reason: "Promise.allResolved() does not exist. LLMs confuse it with Promise.allSettled().",
    fix: "Use Promise.allSettled() to wait for all promises regardless of outcome.",
    languages: ["javascript", "typescript"],
  },
  // String.prototype.contains — doesn't exist, it's includes
  {
    pattern: /(?<!\w)['"`]\w*['"`]\.contains\s*\(|\.contains\s*\(\s*['"`]/,
    hallucinated: "String.contains()",
    reason: "JavaScript strings have no .contains() method. LLMs port this from Java/Kotlin.",
    fix: "Use .includes() instead of .contains().",
    languages: ["javascript", "typescript"],
  },
  // fetch().body.json() — incorrect, it's fetch().then(r => r.json())
  {
    pattern: /\bfetch\s*\([^)]*\)\s*\.body\.json\s*\(/,
    hallucinated: "fetch().body.json()",
    reason: "The fetch() Response has .json() on the Response, not on .body.",
    fix: "Use const res = await fetch(url); const data = await res.json();",
    languages: ["javascript", "typescript"],
  },
  // console.debug is real, but console.log.error is hallucinated
  {
    pattern: /\bconsole\.log\.error\s*\(/,
    hallucinated: "console.log.error()",
    reason: "console.log.error() does not exist. console.log and console.error are separate methods.",
    fix: "Use console.error() for error output.",
    languages: ["javascript", "typescript"],
  },
  // require().default  — common hallucination for CJS
  {
    pattern: /\brequire\s*\([^)]+\)\.default\s*\(/,
    hallucinated: "require('module').default()",
    reason:
      "CommonJS modules typically don't have a .default export. This pattern is an LLM conflation of ESM default imports with CJS require().",
    fix: "Use const mod = require('module'); mod() directly, or switch to ESM: import mod from 'module';",
    languages: ["javascript", "typescript"],
  },

  // ── Python ────────────────────────────────────────────────────────────

  // os.exec doesn't exist — it's os.system or subprocess
  {
    pattern: /\bos\.exec\s*\(/,
    hallucinated: "os.exec()",
    reason: "Python's os module has no exec() function. LLMs hallucinate this from other languages.",
    fix: "Use subprocess.run() for command execution, or os.system() for simple cases.",
    languages: ["python"],
  },
  // string.format() used as a global function
  {
    pattern: /\bstring\.format\s*\(/,
    hallucinated: "string.format()",
    reason:
      "Python has no global string.format() function. LLMs confuse this with str.format() method or the string module.",
    fix: 'Use "template {}".format(value) or f"template {value}" (f-strings).',
    languages: ["python"],
  },
  // json.parse — doesn't exist, it's json.loads
  {
    pattern: /\bjson\.parse\s*\(/,
    hallucinated: "json.parse()",
    reason:
      "Python's json module has json.loads() and json.load(), not json.parse(). This is a JavaScript API hallucinated into Python.",
    fix: "Use json.loads(string) for strings or json.load(file) for file objects.",
    languages: ["python"],
  },
  // json.stringify — doesn't exist, it's json.dumps
  {
    pattern: /\bjson\.stringify\s*\(/,
    hallucinated: "json.stringify()",
    reason:
      "Python's json module has json.dumps() and json.dump(), not json.stringify(). This is a JavaScript API hallucinated into Python.",
    fix: "Use json.dumps(obj) for strings or json.dump(obj, file) for file output.",
    languages: ["python"],
  },
  // list.push — doesn't exist, it's list.append
  {
    pattern: /\b\w+\.push\s*\(/,
    hallucinated: "list.push()",
    reason: "Python lists have no .push() method. LLMs port this from JavaScript's Array.push().",
    fix: "Use .append(item) for single items or .extend(items) for iterables.",
    languages: ["python"],
  },
  // dict.containsKey — doesn't exist, it's `key in dict`
  {
    pattern: /\b\w+\.containsKey\s*\(/,
    hallucinated: "dict.containsKey()",
    reason: "Python dicts have no .containsKey() method. LLMs hallucinate this from Java Maps.",
    fix: "Use the `in` operator: if key in my_dict:",
    languages: ["python"],
  },
  // string.isEmpty() — doesn't exist
  {
    pattern: /\b\w+\.isEmpty\s*\(\s*\)/,
    hallucinated: "str.isEmpty()",
    reason: "Python strings have no .isEmpty() method. LLMs hallucinate this from Java/Kotlin.",
    fix: "Use `if not my_string:` or `if len(my_string) == 0:`.",
    languages: ["python"],
  },
  // asyncio.sleep used without await
  {
    pattern: /(?<!\bawait\s)asyncio\.sleep\s*\(/,
    hallucinated: "asyncio.sleep() without await",
    reason:
      "asyncio.sleep() is a coroutine and must be awaited. Without await, it creates but never executes the coroutine.",
    fix: "Use await asyncio.sleep(seconds).",
    languages: ["python"],
  },
  // requests.get().data — doesn't exist, it's .text or .json()
  {
    pattern: /\brequests\.(?:get|post|put|delete|patch)\s*\([^)]*\)\.data\b/,
    hallucinated: "requests.get().data",
    reason: "The requests library Response has .text, .json(), .content — not .data. LLMs confuse this with axios.",
    fix: "Use response.json() for parsed JSON or response.text for raw text.",
    languages: ["python"],
  },

  // ── Go ────────────────────────────────────────────────────────────────

  // strings.Contains with wrong case
  {
    pattern: /\bstrings\.contains\s*\(/,
    hallucinated: "strings.contains()",
    reason: "Go's strings package uses strings.Contains() (capital C). LLMs often use lowercase.",
    fix: "Use strings.Contains(s, substr) with capital C.",
    languages: ["go"],
  },
  // fmt.Println returning an error check that's never needed
  {
    pattern: /\berr\s*:?=\s*fmt\.Println\s*\(/,
    hallucinated: "err := fmt.Println()",
    reason:
      "While fmt.Println technically returns (n int, err error), checking its error is virtually never done and adds noise. LLMs generate this overly cautious pattern.",
    fix: "Just call fmt.Println() without error checking. Reserve error handling for I/O and network operations.",
    languages: ["go"],
  },
  // slice.append — wrong, it's append(slice, ...)
  {
    pattern: /\b\w+\.append\s*\(/,
    hallucinated: "slice.append()",
    reason: "Go uses the built-in append() function, not a method on slices. LLMs hallucinate OOP-style method calls.",
    fix: "Use slice = append(slice, element) as a built-in function.",
    languages: ["go"],
  },
  // http.HandleFunc on a ServeMux with wrong signature
  {
    pattern: /\bmux\.HandleFunc\s*\([^,]+,\s*func\s*\(\s*\w+\s+http\.Request\b/,
    hallucinated: "func(w http.Request)",
    reason: "http.Handler functions receive *http.Request (pointer), not http.Request (value). LLMs omit the pointer.",
    fix: "Use func(w http.ResponseWriter, r *http.Request) with *http.Request.",
    languages: ["go"],
  },

  // ── Java ──────────────────────────────────────────────────────────────

  // String.isEmpty() is real, but LLMs sometimes generate String.blank()
  {
    pattern: /\.blank\s*\(\s*\)/,
    hallucinated: ".blank()",
    reason: "Java has .isBlank() (Java 11+), not .blank(). LLMs truncate the method name.",
    fix: "Use .isBlank() for whitespace-only check or .isEmpty() for zero-length check.",
    languages: ["java"],
  },
  // Arrays.asList().add — this returns a fixed-size list, add throws
  {
    pattern: /\bArrays\.asList\s*\([^)]*\)\s*\.add\s*\(/,
    hallucinated: "Arrays.asList().add()",
    reason:
      "Arrays.asList() returns a fixed-size list backed by the array. Calling .add() throws UnsupportedOperationException at runtime.",
    fix: "Use new ArrayList<>(Arrays.asList(...)) to get a mutable list, or use List.of() if immutability is intended.",
    languages: ["java"],
  },
  // System.println — doesn't exist
  {
    pattern: /\bSystem\.println\s*\(/,
    hallucinated: "System.println()",
    reason: "Java has System.out.println(), not System.println(). LLMs sometimes skip the .out part.",
    fix: "Use System.out.println() for console output.",
    languages: ["java"],
  },

  // ── Rust ──────────────────────────────────────────────────────────────

  // .len() on an iterator — iterators don't have .len()
  {
    pattern: /\.iter\s*\(\s*\)\s*\.len\s*\(\s*\)/,
    hallucinated: ".iter().len()",
    reason:
      "Rust iterators don't have .len(). Only the original collection has .len(). LLMs generate this when they mean .count() or the collection's .len().",
    fix: "Use .count() on the iterator (consumes it), or call .len() directly on the collection.",
    languages: ["rust"],
  },
  // String.new() — doesn't exist, it's String::new()
  {
    pattern: /\bString\.new\s*\(\s*\)/,
    hallucinated: "String.new()",
    reason: "Rust uses :: for associated functions, not dots. String::new() is correct.",
    fix: 'Use String::new() or String::from("...").',
    languages: ["rust"],
  },

  // ── C# ────────────────────────────────────────────────────────────────

  // Console.PrintLine — doesn't exist, it's Console.WriteLine
  {
    pattern: /\bConsole\.PrintLine\s*\(/,
    hallucinated: "Console.PrintLine()",
    reason: "C# has Console.WriteLine(), not Console.PrintLine(). LLMs conflate print/write terminology.",
    fix: "Use Console.WriteLine() for output with newline.",
    languages: ["csharp"],
  },
  // string.IsEmpty — doesn't exist, it's String.IsNullOrEmpty
  {
    pattern: /\.IsEmpty\s*\(\s*\)/,
    hallucinated: ".IsEmpty()",
    reason: "C# strings have no .IsEmpty() instance method. LLMs hallucinate it from Java or Kotlin.",
    fix: "Use string.IsNullOrEmpty(s) or string.IsNullOrWhiteSpace(s) as static methods.",
    languages: ["csharp"],
  },

  // ── PHP ───────────────────────────────────────────────────────────────

  // array.push — PHP uses array_push() not OOP .push()
  {
    pattern: /\$\w+->push\s*\(/,
    hallucinated: "$array->push()",
    reason: "PHP arrays don't have a ->push() method. LLMs hallucinate OOP-style array methods from JavaScript.",
    fix: "Use array_push($array, $value) or $array[] = $value.",
    languages: ["php"],
  },
  // string.length — PHP uses strlen()
  {
    pattern: /\$\w+->length\b/,
    hallucinated: "$string->length",
    reason: "PHP strings have no ->length property. LLMs hallucinate from JavaScript.",
    fix: "Use strlen($string) for byte length or mb_strlen($string) for character length.",
    languages: ["php"],
  },

  // ── Ruby ──────────────────────────────────────────────────────────────

  // Array.new.add — Ruby uses push or <<, not add
  {
    pattern: /\.\badd\s*\([^)]*\)\s*$/m,
    hallucinated: "array.add()",
    reason: "Ruby arrays have no .add() method. LLMs hallucinate this from Java/C#.",
    fix: "Use .push(item) or the << operator: array << item.",
    languages: ["ruby"],
  },

  // ── Kotlin ────────────────────────────────────────────────────────────

  // println formatting: println("x = %d", x) — Kotlin println doesn't support formats
  {
    pattern: /\bprintln\s*\(\s*"[^"]*%[dsfx]/,
    hallucinated: 'println("format %d", val)',
    reason: "Kotlin's println() does not support printf-style formatting. LLMs confuse it with C/Java printf.",
    fix: 'Use string templates: println("x = $x") or println("x = ${expression}").',
    languages: ["kotlin"],
  },

  // ── Swift ─────────────────────────────────────────────────────────────

  // Array.count() as a method — it's a property
  {
    pattern: /\.count\s*\(\s*\)/,
    hallucinated: ".count()",
    reason: "Swift's .count is a property, not a method. Calling .count() is a compile error.",
    fix: "Use .count without parentheses: array.count.",
    languages: ["swift"],
  },

  // ── Cross-language ────────────────────────────────────────────────────

  // Fabricated npm packages — common hallucinated package names
  {
    pattern:
      /\bfrom\s+['"](?:easy-jwt|simple-crypto|auto-sanitize|quick-hash|fast-validate|node-security-utils|express-secure|react-safe-render|mongo-safe|api-guard|auth-helper|crypto-utils|secure-config|safe-eval|node-encrypt)['"]/,
    hallucinated: "Non-existent npm package import",
    reason:
      "This import references a package name commonly hallucinated by LLMs. The package either doesn't exist on npm or is a name-squatted stub.",
    fix: "Verify the package exists on npmjs.com. Use established alternatives: jose/jsonwebtoken for JWT, crypto for hashing, express-validator for validation, helmet for security headers.",
    languages: ["javascript", "typescript"],
  },
  // Fabricated Python packages
  {
    pattern:
      /^\s*(?:from|import)\s+(?:easy_jwt|simple_crypto|auto_sanitize|quick_hash|fast_validate|python_security|django_secure|flask_safe|mongo_safe|api_guard|auth_helper|crypto_utils|secure_config|safe_eval|py_encrypt)\b/,
    hallucinated: "Non-existent Python package import",
    reason:
      "This import references a package name commonly hallucinated by LLMs. The package likely doesn't exist on PyPI.",
    fix: "Verify the package exists on pypi.org. Use established alternatives: PyJWT for JWT, cryptography for crypto, flask-wtf for validation.",
    languages: ["python"],
  },
];

// ─── Suspicious Import Patterns ─────────────────────────────────────────────

/**
 * Detect imports that follow LLM hallucination patterns:
 * - Importing from packages that combine too-generic words
 * - Importing non-existent submodules from known packages
 * - Using fabricated utility function names
 */
const SUSPICIOUS_SUBMODULE_PATTERNS: Array<{
  parent: RegExp;
  invalidChild: RegExp;
  reason: string;
  languages: string[];
}> = [
  // React doesn't have these exports
  {
    parent: /\bfrom\s+['"]react['"]/,
    invalidChild: /\b(?:useRequest|useFetch|useAPI|useAuth|useSocket|useAxios|useDatabase)\b/,
    reason:
      "React does not export these hooks. They may come from third-party libraries (e.g., SWR, React Query, use-http) but LLMs often hallucinate them as built-in React hooks.",
    languages: ["javascript", "typescript"],
  },
  // Express doesn't export these
  {
    parent: /\bfrom\s+['"]express['"]/,
    invalidChild: /\b(?:validate|sanitize|authenticate|authorize|rateLimit|cors|helmet|csrf)\b/,
    reason:
      "Express does not export these functions. They are separate middleware packages (express-validator, cors, helmet, csurf, express-rate-limit).",
    languages: ["javascript", "typescript"],
  },
  // Flask doesn't export these
  {
    parent: /\bfrom\s+flask\s+import\b/,
    invalidChild: /\b(?:validate|sanitize|authenticate|login_required|cors|csrf_protect|rate_limit)\b/,
    reason:
      "Flask does not export these directly. They come from extensions: flask-login, flask-cors, flask-wtf, flask-limiter.",
    languages: ["python"],
  },
];

// ─── Main Analyzer ──────────────────────────────────────────────────────────

export function analyzeHallucinationDetection(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  let ruleNum = 1;
  const prefix = "HALLU";
  const lang = getLangFamily(language);

  // 1. Check against known hallucinated API patterns
  for (const hp of HALLUCINATED_PATTERNS) {
    if (!hp.languages.includes(lang)) continue;

    const affectedLines: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (hp.pattern.test(lines[i])) {
        affectedLines.push(i + 1);
      }
    }

    if (affectedLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: `Hallucinated API: ${hp.hallucinated}`,
        description: hp.reason,
        lineNumbers: affectedLines,
        recommendation: hp.fix,
        reference: "AI Code Safety — Hallucinated API Detection",
        confidence: 0.85,
        provenance: "regex-pattern-match",
      });
    }
  }

  // 2. Check for suspicious submodule imports
  for (const sp of SUSPICIOUS_SUBMODULE_PATTERNS) {
    if (!sp.languages.includes(lang)) continue;

    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      if (sp.parent.test(lines[i]) && sp.invalidChild.test(lines[i])) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Hallucinated import — non-existent export from known package",
          description: sp.reason,
          lineNumbers: [i + 1],
          recommendation:
            "Verify the import exists in the package's documentation. Install the correct third-party package instead.",
          reference: "AI Code Safety — Hallucinated Import Detection",
          confidence: 0.8,
          provenance: "regex-pattern-match",
        });
      }
    }
  }

  // 3. Detect common phantom method chains
  // LLMs generate plausible-looking but non-existent method chains
  if (lang === "javascript" || lang === "typescript") {
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      const line = lines[i];

      // Promise.resolve().delay() — Bluebird API hallucinated into native Promise
      if (/\bPromise\.resolve\s*\([^)]*\)\s*\.delay\s*\(/.test(line)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "high",
          title: "Hallucinated API: Promise.resolve().delay()",
          description: "Native Promises have no .delay() method. LLMs hallucinate this from the Bluebird library.",
          lineNumbers: [i + 1],
          recommendation: "Use: await new Promise(resolve => setTimeout(resolve, ms));",
          reference: "AI Code Safety — Hallucinated API Detection",
          confidence: 0.9,
          provenance: "regex-pattern-match",
        });
      }

      // Map.prototype.contains — should be .has
      if (/\bnew Map\b/.test(code) && /\.contains\s*\(/.test(line)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Possible hallucinated API: Map.contains()",
          description: "JavaScript Maps use .has() not .contains(). LLMs often hallucinate Java's Map.containsKey().",
          lineNumbers: [i + 1],
          recommendation: "Use map.has(key) to check for key existence.",
          reference: "AI Code Safety — Hallucinated API Detection",
          confidence: 0.7,
          provenance: "regex-pattern-match",
        });
      }
    }
  }

  // 4. Detect incorrect async patterns — common hallucination
  if (lang === "javascript" || lang === "typescript") {
    for (let i = 0; i < lines.length; i++) {
      if (isCommentLine(lines[i])) continue;
      const line = lines[i];

      // new Promise(async (resolve, reject) => { ... }) — anti-pattern
      if (/new\s+Promise\s*\(\s*async\s/.test(line)) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Anti-pattern: async function inside Promise constructor",
          description:
            "Wrapping an async function inside new Promise() is an anti-pattern commonly generated by LLMs. Errors thrown in the async executor won't reject the promise, leading to unhandled rejections and swallowed errors.",
          lineNumbers: [i + 1],
          recommendation:
            "Remove the Promise wrapper — async functions already return Promises. Just use: async function name() { ... }",
          reference: "AI Code Safety — Hallucinated Pattern Detection",
          confidence: 0.85,
          provenance: "regex-pattern-match",
        });
      }
    }
  }

  return findings;
}
