import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as cliModule from "../src/cli.js";

const { runCli } = cliModule as any;
import { globToRegex, matchesGlob, collectFiles, parseCliArgs, dispatchCommand } from "../src/cli-helpers.js";
const getPackageVersion = (cliModule as any).getPackageVersion as (() => string) | undefined;
const printHelp = (cliModule as any).printHelp as (() => void) | undefined;

describe("cli helpers", () => {
  it("globToRegex and matchesGlob handle patterns", () => {
    const rx = globToRegex("src/**/*.ts");
    assert.ok(rx.test("src/commands/doctor.ts"));
    assert.ok(!rx.test("tests/foo.js"));

    assert.ok(matchesGlob("src/app.ts", ["src/**/*.ts"]));
    assert.ok(!matchesGlob("tests/app.test.ts", ["src/**/*.ts"]));
  });

  it("collectFiles respects include/exclude", () => {
    const files = collectFiles("tests", { include: ["tests/**/*.test.ts"], exclude: ["**/node_modules/**"] });
    assert.ok(files.some((f: string) => f.endsWith("tests/judges.test.ts")));
    assert.ok(!files.some((f: string) => f.includes("node_modules")));
  });

  it("dispatchCommand routes to handlers and throws on unknown", async () => {
    const calls: string[] = [];
    await dispatchCommand("foo", ["arg"], {
      foo: (argv) => {
        calls.push(argv.join(" "));
      },
    });
    assert.deepEqual(calls, ["arg"]);
    await assert.rejects(() => dispatchCommand("unknown", [], {}), /UNKNOWN_COMMAND/);
  });

  it("parseCliArgs covers flag parsing branches", () => {
    const args = parseCliArgs([
      "eval",
      "--file",
      "src/app.ts",
      "--format",
      "json",
      "--judge",
      "cybersecurity",
      "--baseline",
      "baseline.json",
      "--config",
      "config.json",
      "--preset",
      "strict",
      "--min-score",
      "85",
      "--language",
      "python",
      "--plugins",
      "plugin-a",
      "--include",
      "src/**",
      "--exclude",
      "tests/**",
      "--max-files",
      "10",
      "--fail-on-findings",
      "--help",
    ]);
    assert.equal(args.command, "eval");
    assert.equal(args.file, "src/app.ts");
    assert.equal(args.format, "json");
    assert.equal(args.judge, "cybersecurity");
    assert.equal(args.baseline, "baseline.json");
    assert.equal(args.config, "config.json");
    assert.equal(args.preset, "strict");
    assert.equal(args.minScore, 85);
    assert.equal(args.language, "python");
    assert.deepEqual(args.plugins, ["plugin-a"]);
    assert.deepEqual(args.include, ["src/**"]);
    assert.deepEqual(args.exclude, ["tests/**"]);
    assert.equal(args.maxFiles, 10);
    assert.equal(args.failOnFindings, true);
    assert.equal(args.help, true);
  });

  it("printHelp covers help text and package version path", async () => {
    const logs: string[] = [];
    const origLog = console.log;

    console.log = (msg?: any) => logs.push(String(msg ?? "")) as any;
    try {
      if (printHelp) {
        printHelp();
      } else {
        await runCli(["--help"]);
      }
    } catch {
      // process.exit may throw in test stubs; ignore
    } finally {
      console.log = origLog;
    }
    assert.ok(logs.some((l) => l.toLowerCase().includes("usage")));
    // Access getPackageVersion to exercise version code path
    if (getPackageVersion) {
      const ver = getPackageVersion();
      assert.ok(typeof ver === "string" && ver.length > 0);
    }
  });

  it("printHelp toggles experimental commands via env flag", async () => {
    const captureHelp = async (experimental = false) => {
      const logs: string[] = [];
      const origLog = console.log;
      const origEnv = process.env.JUDGES_SHOW_EXPERIMENTAL;
      process.env.JUDGES_SHOW_EXPERIMENTAL = experimental ? "1" : undefined;

      console.log = (msg?: any) => logs.push(String(msg ?? "")) as any;
      try {
        await runCli(["--help"]);
      } catch {
        // process.exit stubbed; ignore
      } finally {
        console.log = origLog;
        if (origEnv === undefined) delete process.env.JUDGES_SHOW_EXPERIMENTAL;
        else process.env.JUDGES_SHOW_EXPERIMENTAL = origEnv;
      }
      return logs.join("\n");
    };

    const coreHelp = await captureHelp(false);
    assert.ok(coreHelp.includes("judges eval"));
    assert.ok(coreHelp.includes("judges license-scan"));
    // Ensure the giant roadmap list is hidden by default
    assert.ok(!coreHelp.includes("fix-suggest"));
    assert.ok(!coreHelp.includes("review-priority"));

    const experimentalHelp = await captureHelp(true);
    assert.ok(experimentalHelp.includes("Experimental / roadmap"));
    // Experimental entries should show up only when the flag is enabled
    assert.ok(experimentalHelp.includes("quality-gate"));
  });
});

describe("runCli dispatch", () => {
  const exitCalls: number[] = [];
  const origExit = process.exit;

  beforeEach(() => {
    (process as any).exit = (code?: number) => {
      exitCalls.push(code ?? 0);
      throw new Error(`exit ${code ?? 0}`);
    };
  });

  afterEach(() => {
    (process as any).exit = origExit;
    exitCalls.length = 0;
  });

  it("handles --version and help without errors", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg?: any) => logs.push(String(msg));
    await runCli(["--version"]);
    console.log = origLog;
    assert.ok(logs.some((l) => /judges/i.test(l) || /\d+\.\d+\.\d+/.test(l)));
  });

  it("runCli handles version and help", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    const origExit = process.exit;

    console.log = (msg?: any) => logs.push(String(msg ?? "")) as any;
    (process as any).exit = (_?: number) => {
      throw new Error("exit");
    };
    try {
      await runCli(["--version"]);
      try {
        await runCli(["--help"]);
      } catch {
        // process.exit stubbed; ignore
      }
    } finally {
      console.log = origLog;
      (process as any).exit = origExit;
    }
    assert.ok(logs.some((l) => /judges/i.test(l) || /\d+\.\d+\.\d+/.test(l)));
    assert.ok(logs.some((l) => l.toLowerCase().includes("usage")));
  });

  it("handles unknown command by showing help", async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (msg?: any) => logs.push(String(msg));
    try {
      await runCli(["unknown-cmd"]);
    } catch {
      // process.exit throws due to our stub
    }
    console.log = origLog;
    assert.ok(
      logs.some((l) => l.includes("Usage")),
      "should print help for unknown commands",
    );
  });

  it("dispatches license-scan command (new command coverage)", async () => {
    const calls: string[][] = [];
    stubCommand("../src/commands/license-scan.js", { runLicenseScan: (argv: string[]) => calls.push(argv) });
    await runCli(["license-scan", "--format", "json"]);
    assert.deepEqual(calls, [["license-scan", "--format", "json"]]);
  });
});
