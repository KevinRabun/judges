// ─────────────────────────────────────────────────────────────────────────────
// Git Diff Parser — Test Suite
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnifiedDiffToChangedLines } from "../src/git-diff.js";

describe("GitDiff: parseUnifiedDiffToChangedLines", () => {
  it("parses a simple unified diff", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 const x = 1;
+const y = 2;
 const z = 3;
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.ok(result.length > 0);
    assert.equal(result[0].filePath, "src/app.ts");
    assert.ok(result[0].changedLines.length > 0);
    assert.ok(result[0].changedLines.includes(2)); // Added line
  });

  it("handles multiple files in a diff", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1,2 +1,3 @@
 hello
+world
 end
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.ok(result.length >= 2);
    const files = result.map((r) => r.filePath);
    assert.ok(files.includes("a.ts"));
    assert.ok(files.includes("b.ts"));
  });

  it("handles multiple hunks in one file", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 line1
+added1
 line3
@@ -10,3 +11,4 @@
 line10
+added2
 line12
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.equal(result.length, 1);
    assert.ok(result[0].changedLines.includes(2));
    assert.ok(result[0].changedLines.includes(12));
  });

  it("returns empty for empty diff", () => {
    assert.deepEqual(parseUnifiedDiffToChangedLines(""), []);
  });

  it("returns empty for diff with no additions", () => {
    const diff = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,2 @@
 line1
-removed
 line3
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    // No additions, so changedLines should be empty
    assert.ok(result.length === 0 || result[0].changedLines.length === 0);
  });

  it("ignores binary file diffs", () => {
    const diff = `diff --git a/image.png b/image.png
Binary files differ
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.equal(result.length, 0);
  });

  it("handles new file diffs", () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+const x = 1;
+const y = 2;
+const z = 3;
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.ok(result.length > 0);
    assert.equal(result[0].filePath, "new.ts");
    assert.ok(result[0].changedLines.length >= 3);
  });

  it("handles context lines correctly", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -5,6 +5,7 @@
 context1
 context2
+new_line
 context3
 context4
 context5
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.ok(result[0].changedLines.includes(7)); // Line 7 is the added line
  });

  it("handles modification (delete + add) pairs", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
 const z = 4;
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.ok(result.length > 0);
    assert.ok(result[0].changedLines.includes(2)); // Modified line
  });

  it("handles paths with spaces", () => {
    const diff = `diff --git a/src/my file.ts b/src/my file.ts
--- a/src/my file.ts
+++ b/src/my file.ts
@@ -1,2 +1,3 @@
 line1
+added
 line2
`;
    const result = parseUnifiedDiffToChangedLines(diff);
    assert.ok(result.length > 0);
    assert.equal(result[0].filePath, "src/my file.ts");
  });
});
