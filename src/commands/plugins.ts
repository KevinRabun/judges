/**
 * `judges plugins` — Plugin management and discovery.
 *
 * Lists installed plugins, shows their rules and judges, and provides
 * guidance on creating and discovering new plugins.
 *
 * Usage:
 *   judges plugins                    List installed plugins
 *   judges plugins --format json      Machine-readable output
 *   judges plugins info <name>        Show details for a plugin
 */

import { getRegisteredPlugins, getCustomRules, getPluginJudges } from "../plugins.js";

// ─── Runner ─────────────────────────────────────────────────────────────────

export function runPlugins(argv: string[]): void {
  const format = argv.includes("--format") ? argv[argv.indexOf("--format") + 1] : "text";
  const subcommand = argv.find((a, i) => i > 2 && !a.startsWith("-") && a !== "json" && a !== "text");

  const plugins = getRegisteredPlugins();
  const customRules = getCustomRules();
  const customJudges = getPluginJudges();

  if (subcommand === "info") {
    const name = argv.find((a, i) => i > argv.indexOf("info") && !a.startsWith("-"));
    if (!name) {
      console.error("  Usage: judges plugins info <plugin-name>");
      process.exit(1);
    }
    const reg = plugins.find((p) => p.name === name);
    if (!reg) {
      console.error(`  Plugin not found: "${name}"`);
      console.error(`  Installed plugins: ${plugins.map((p) => p.name).join(", ") || "(none)"}`);
      process.exit(1);
    }
    console.log("");
    console.log(`  Plugin: ${reg.name} v${reg.version}`);
    console.log("  " + "─".repeat(40));
    console.log(`  Rules registered:  ${reg.rulesRegistered}`);
    console.log(`  Judges registered: ${reg.judgesRegistered}`);
    console.log("");
    return;
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          installed: plugins.map((p) => ({
            name: p.name,
            version: p.version,
            rulesRegistered: p.rulesRegistered,
            judgesRegistered: p.judgesRegistered,
          })),
          totalCustomRules: customRules.length,
          totalCustomJudges: customJudges.length,
          customRuleIds: customRules.map((r) => r.id),
          customJudgeIds: customJudges.map((j) => j.id),
        },
        null,
        2,
      ),
    );
    return;
  }

  // Text output
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Judges Panel — Plugin Manager                     ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  if (plugins.length === 0) {
    console.log("  No plugins installed.");
    console.log("");
    console.log("  Get started:");
    console.log("    judges scaffold-plugin my-rules      Create a new plugin");
    console.log("    judges community-patterns             Browse community patterns");
    console.log("    judges help plugins                   Plugin authoring guide");
    console.log("");
    return;
  }

  console.log(`  Installed Plugins: ${plugins.length}`);
  console.log(`  Custom Rules: ${customRules.length}`);
  console.log(`  Custom Judges: ${customJudges.length}`);
  console.log("");
  console.log("  " + "─".repeat(60));
  console.log("");

  for (const reg of plugins) {
    const version = reg.version ? ` v${reg.version}` : "";
    console.log(`  📦 ${reg.name}${version}`);
    console.log(`     Rules:  ${reg.rulesRegistered}`);
    console.log(`     Judges: ${reg.judgesRegistered}`);
    console.log("");
  }

  if (customRules.length > 0) {
    console.log("  Custom Rules:");
    for (const r of customRules) {
      const sev = r.severity ? ` [${r.severity}]` : "";
      console.log(`    ${r.id}${sev} — ${r.description ?? "(no description)"}`);
    }
    console.log("");
  }

  if (customJudges.length > 0) {
    console.log("  Custom Judges:");
    for (const j of customJudges) {
      console.log(`    ${j.id} — ${j.name}: ${j.domain}`);
    }
    console.log("");
  }

  console.log("  Commands:");
  console.log("    judges plugins info <name>          Show plugin details");
  console.log("    judges scaffold-plugin <name>       Create a new plugin");
  console.log("    judges community-patterns           Browse community patterns");
  console.log("");
}
