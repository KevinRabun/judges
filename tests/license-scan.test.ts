import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { runLicenseScan } from "../src/commands/license-scan.js";

describe("commands/license-scan", () => {
  const origCwd = process.cwd();
  let dir: string;
  const logs: string[] = [];

  const origLog = console.log;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "judges-licenses-"));
    process.chdir(dir);
    logs.length = 0;
    // Capture console output
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).log = (msg?: unknown) => {
      logs.push(String(msg ?? ""));
    };
  });

  afterEach(() => {
    process.chdir(origCwd);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // cleanup is best-effort
    }

    console.log = origLog;
  });

  function writePackageJson(deps: Record<string, string>) {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "fixture",
          version: "1.0.0",
          dependencies: deps,
        },
        null,
        2,
      ),
    );
  }

  function writeDep(name: string, license: any) {
    const depDir = join(dir, "node_modules", name);
    mkdirSync(depDir, { recursive: true });
    writeFileSync(join(depDir, "package.json"), JSON.stringify({ name, version: "1.2.3", license }, null, 2));
  }

  it("scans licenses and supports --format json and filters", () => {
    writePackageJson({ "left-pad": "^1.0.0", agplpkg: "1.0.0", unknownpkg: "0.0.1" });
    writeDep("left-pad", "MIT");
    writeDep("agplpkg", "AGPL-3.0");
    writeDep("unknownpkg", { type: "Custom-License" });

    runLicenseScan(["--format", "json"]);
    const outRaw = logs.join("\n");
    const jsonLine = logs.find((l) => l.trim().startsWith("{")) ?? outRaw.slice(outRaw.indexOf("{"));
    const report = JSON.parse(jsonLine) as any;
    assert.equal(report.licenses.length, 3);
    assert.ok(report.conflicts.some((c: string) => c.includes("AGPL")));
    assert.ok(report.conflicts.some((c: string) => c.includes("Unknown")));

    // Risk filter should narrow to high risk (AGPL/custom)
    logs.length = 0;
    runLicenseScan(["--format", "json", "--risk", "high"]);
    const filteredLine = logs.find((l) => l.trim().startsWith("{")) ?? "{}";
    const filtered = JSON.parse(filteredLine) as any;
    assert.equal(filtered.licenses.length, 2);
  });

  it("supports category filter and --save", () => {
    writePackageJson({ "foo-lgpl": "1.0.0" });
    writeDep("foo-lgpl", "LGPL-3.0");

    runLicenseScan(["--category", "weak-copyleft", "--save"]);
    // Should have written a report to .judges-licenses
    const reportPath = join(dir, ".judges-licenses", "license-report.json");
    assert.ok(existsSync(reportPath));
    const report = JSON.parse(readFileSync(reportPath, "utf-8"));
    assert.equal(report.summary.weakCopyleft, 1);
  });

  it("prints help when --help is passed", () => {
    runLicenseScan(["--help"]);
    assert.ok(logs.join("\n").includes("Usage:"));
  });
});
