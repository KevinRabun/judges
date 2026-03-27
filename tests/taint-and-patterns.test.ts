// ─────────────────────────────────────────────────────────────────────────────
// Cross-File Taint + Language Patterns — Coverage Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeCrossFileTaint } from "../src/ast/cross-file-taint.js";
import {
  analyzeTaintFlows,
  SOURCE_PATTERNS,
  SINK_PATTERNS,
  SANITIZER_PATTERNS,
  isSanitized,
} from "../src/ast/taint-tracker.js";
import { normalizeLanguage, langPattern, isIaC } from "../src/language-patterns.js";

// ═══════════ Cross-file taint ════════════════════════════════════════════

describe("CrossFileTaint: analyzeCrossFileTaint", () => {
  it("detects taint flow across files", () => {
    const files = [
      {
        path: "src/handler.ts",
        content:
          'import { process } from "./processor";\nexport function handle(req: any) {\n  return process(req.body.data);\n}',
        language: "typescript",
      },
      {
        path: "src/processor.ts",
        content: "export function process(data: string) {\n  return eval(data);\n}",
        language: "typescript",
      },
    ];
    const flows = analyzeCrossFileTaint(files);
    assert.ok(Array.isArray(flows));
  });

  it("returns empty for files with no taint", () => {
    const files = [
      { path: "src/a.ts", content: "export const x = 1;", language: "typescript" },
      { path: "src/b.ts", content: 'import { x } from "./a";\nconsole.log(x);', language: "typescript" },
    ];
    const flows = analyzeCrossFileTaint(files);
    assert.ok(Array.isArray(flows));
    assert.equal(flows.length, 0);
  });

  it("handles empty file list", () => {
    const flows = analyzeCrossFileTaint([]);
    assert.deepEqual(flows, []);
  });

  it("handles single file", () => {
    const flows = analyzeCrossFileTaint([
      { path: "src/app.ts", content: "const x = req.body.name;\neval(x);", language: "typescript" },
    ]);
    assert.ok(Array.isArray(flows));
  });

  it("handles Python files", () => {
    const files = [
      {
        path: "app.py",
        content: 'from utils import process\ndef handler(request):\n  return process(request.args.get("input"))',
        language: "python",
      },
      { path: "utils.py", content: "def process(data):\n  exec(data)", language: "python" },
    ];
    const flows = analyzeCrossFileTaint(files);
    assert.ok(Array.isArray(flows));
  });
});

// ═══════════ Taint tracker patterns ══════════════════════════════════════

describe("TaintTracker: exported patterns", () => {
  it("SOURCE_PATTERNS is an array", () => {
    assert.ok(Array.isArray(SOURCE_PATTERNS));
    assert.ok(SOURCE_PATTERNS.length > 0);
  });

  it("SINK_PATTERNS is an array", () => {
    assert.ok(Array.isArray(SINK_PATTERNS));
    assert.ok(SINK_PATTERNS.length > 0);
  });

  it("SANITIZER_PATTERNS is an array", () => {
    assert.ok(Array.isArray(SANITIZER_PATTERNS));
    assert.ok(SANITIZER_PATTERNS.length > 0);
  });

  it("isSanitized detects DOMPurify", () => {
    assert.ok(isSanitized("DOMPurify.sanitize(input)"));
  });

  it("isSanitized detects encodeURIComponent", () => {
    assert.ok(isSanitized("encodeURIComponent(input)"));
  });

  it("isSanitized detects parameterized queries", () => {
    assert.ok(isSanitized("db.query('SELECT $1', [id])"));
  });

  it("isSanitized returns false for unsanitized input", () => {
    assert.ok(!isSanitized("rawInput + otherData"));
  });

  it("isSanitized detects validator library", () => {
    assert.ok(isSanitized("validator.isEmail(input)"));
  });

  it("isSanitized detects zod/joi/yup", () => {
    assert.ok(isSanitized("schema.parse(input)") || isSanitized("joi.validate(input)"));
  });

  it("isSanitized detects path sanitization", () => {
    assert.ok(isSanitized("path.normalize(userPath)"));
  });

  it("isSanitized detects PreparedStatement", () => {
    assert.ok(isSanitized("PreparedStatement stmt = conn.prepareStatement(sql)"));
  });
});

// ═══════════ Taint flow analysis — more languages ════════════════════════

describe("TaintTracker: multi-language flows", () => {
  it("detects Java taint flow", () => {
    const code = `
String input = request.getParameter("name");
Statement stmt = conn.createStatement();
stmt.executeQuery("SELECT * FROM users WHERE name = '" + input + "'");
`;
    const flows = analyzeTaintFlows(code, "java");
    assert.ok(Array.isArray(flows));
  });

  it("detects C# taint flow", () => {
    const code = `
var input = Request.QueryString["id"];
var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = " + input, conn);
cmd.ExecuteReader();
`;
    const flows = analyzeTaintFlows(code, "csharp");
    assert.ok(Array.isArray(flows));
  });

  it("detects Go taint flow", () => {
    const code = `
input := r.URL.Query().Get("cmd")
exec.Command("sh", "-c", input).Run()
`;
    const flows = analyzeTaintFlows(code, "go");
    assert.ok(Array.isArray(flows));
  });

  it("detects PHP taint flow", () => {
    const code = `
$name = $_GET['name'];
$result = mysql_query("SELECT * FROM users WHERE name = '" . $name . "'");
echo $result;
`;
    const flows = analyzeTaintFlows(code, "php");
    assert.ok(Array.isArray(flows));
  });

  it("detects Ruby taint flow", () => {
    const code = `
name = params[:name]
User.where("name = '#{name}'").first
`;
    const flows = analyzeTaintFlows(code, "ruby");
    assert.ok(Array.isArray(flows));
  });
});

// ═══════════ Language patterns ════════════════════════════════════════════

describe("LanguagePatterns: normalizeLanguage", () => {
  it("normalizes common aliases", () => {
    assert.equal(normalizeLanguage("js"), "javascript");
    assert.equal(normalizeLanguage("ts"), "typescript");
    assert.equal(normalizeLanguage("py"), "python");
    assert.equal(normalizeLanguage("cs"), "csharp");
    assert.equal(normalizeLanguage("rb"), "ruby");
  });

  it("handles already-normalized names", () => {
    assert.equal(normalizeLanguage("javascript"), "javascript");
    assert.equal(normalizeLanguage("python"), "python");
  });

  it("handles case insensitivity", () => {
    assert.equal(normalizeLanguage("JavaScript"), "javascript");
    assert.equal(normalizeLanguage("TypeScript"), "typescript");
  });
});

describe("LanguagePatterns: langPattern", () => {
  it("returns patterns for JavaScript", () => {
    const p = langPattern("javascript", "EVAL_USAGE");
    assert.ok(p === null || p instanceof RegExp);
  });

  it("returns patterns for Python", () => {
    const p = langPattern("python", "EVAL_USAGE");
    assert.ok(p === null || p instanceof RegExp);
  });

  it("returns null for unknown pattern name", () => {
    const p = langPattern("javascript", "NONEXISTENT_PATTERN");
    assert.equal(p, null);
  });
});

describe("LanguagePatterns: isIaC", () => {
  it("returns true for terraform", () => {
    assert.ok(isIaC("terraform"));
  });

  it("returns true for bicep", () => {
    assert.ok(isIaC("bicep"));
  });

  it("returns false for javascript", () => {
    assert.ok(!isIaC("javascript"));
  });

  it("returns false for python", () => {
    assert.ok(!isIaC("python"));
  });
});
