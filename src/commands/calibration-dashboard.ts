// ─── Calibration Dashboard Command ───────────────────────────────────────────
// Displays per-rule and per-judge confidence calibration data from feedback.
//
// Usage:
//   judges calibration-dashboard
//   judges calibration-dashboard --min-samples 5
//   judges calibration-dashboard --format json
// ──────────────────────────────────────────────────────────────────────────────

import { buildCalibrationProfile, type CalibrationProfile } from "../calibration.js";
import { loadFeedbackStore, type FeedbackStore } from "./feedback.js";

export async function runCalibrationDashboard(argv: string[]): Promise<void> {
  let minSamples = 3;
  let format = "text";
  let outputPath: string | undefined;

  for (let i = 3; i < argv.length; i++) {
    if (argv[i] === "--min-samples" && argv[i + 1]) {
      minSamples = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === "--format" && argv[i + 1]) {
      format = argv[i + 1];
      i++;
    } else if ((argv[i] === "--output" || argv[i] === "-o") && argv[i + 1]) {
      outputPath = argv[i + 1];
      i++;
    }
  }

  const store = loadFeedbackStore();
  const profile = buildCalibrationProfile(store, { minSamples });

  if (format === "json") {
    const output = {
      name: profile.name,
      isActive: profile.isActive,
      feedbackCount: profile.feedbackCount,
      fpRateByRule: Object.fromEntries(profile.fpRateByRule),
      fpRateByPrefix: Object.fromEntries(profile.fpRateByPrefix),
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (format === "html") {
    const html = renderCalibrationHtml(profile, store);
    if (outputPath) {
      const { writeFileSync: writeFs } = await import("fs");
      writeFs(outputPath, html, "utf-8");
      console.log(`  ✅ Dashboard written to ${outputPath}`);
    } else {
      console.log(html);
    }
    return;
  }

  // ── Text output ──
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║           Judges — Confidence Calibration Dashboard          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log(`  Status:    ${profile.isActive ? "✅ Active" : "⚠️  Inactive (not enough feedback)"}`);
  console.log(`  Feedback:  ${profile.feedbackCount} entries (min ${minSamples} samples per rule)`);
  console.log("");

  if (!profile.isActive) {
    console.log("  No calibration data available. Use 'judges feedback' to provide");
    console.log("  true-positive / false-positive feedback on findings.");
    console.log("");
    return;
  }

  // ── Per-Judge (Prefix) FP Rates ──
  if (profile.fpRateByPrefix.size > 0) {
    console.log("  ─── Judge-Level FP Rates ───────────────────────────────────");
    console.log("");
    console.log("  " + "Judge Prefix".padEnd(16) + "FP Rate".padEnd(12) + "Assessment");
    console.log("  " + "─".repeat(48));

    const sortedPrefixes = [...profile.fpRateByPrefix.entries()].sort((a, b) => b[1] - a[1]);
    for (const [prefix, rate] of sortedPrefixes) {
      const pct = `${(rate * 100).toFixed(1)}%`;
      const icon = rate > 0.5 ? "🔴" : rate > 0.2 ? "🟡" : "🟢";
      const assessment = rate > 0.5 ? "Needs tuning" : rate > 0.2 ? "Acceptable" : "Well calibrated";
      console.log(`  ${icon} ${prefix.padEnd(14)} ${pct.padEnd(12)} ${assessment}`);
    }
    console.log("");
  }

  // ── Per-Rule FP Rates ──
  if (profile.fpRateByRule.size > 0) {
    console.log("  ─── Rule-Level FP Rates ────────────────────────────────────");
    console.log("");
    console.log("  " + "Rule ID".padEnd(20) + "FP Rate".padEnd(12) + "Assessment");
    console.log("  " + "─".repeat(52));

    const sortedRules = [...profile.fpRateByRule.entries()].sort((a, b) => b[1] - a[1]);
    for (const [ruleId, rate] of sortedRules) {
      const pct = `${(rate * 100).toFixed(1)}%`;
      const icon = rate > 0.5 ? "🔴" : rate > 0.2 ? "🟡" : "🟢";
      const assessment = rate > 0.5 ? "High FP — suppress or tune" : rate > 0.2 ? "Moderate FP" : "Low FP";
      console.log(`  ${icon} ${ruleId.padEnd(18)} ${pct.padEnd(12)} ${assessment}`);
    }
    console.log("");
  }

  // ── Recommendations ──
  const highFpRules = [...profile.fpRateByRule.entries()].filter(([, r]) => r > 0.5);
  if (highFpRules.length > 0) {
    console.log("  ─── Recommendations ────────────────────────────────────────");
    console.log("");
    console.log("  Rules with >50% FP rate should be reviewed:");
    for (const [ruleId, rate] of highFpRules) {
      console.log(`    • ${ruleId} (${(rate * 100).toFixed(0)}% FP) — consider disabling or adding exceptions`);
    }
    console.log("");
    console.log("  Add to .judgesrc to disable:");
    console.log(`    "disabledRules": [${highFpRules.map(([id]) => `"${id}"`).join(", ")}]`);
    console.log("");
  }

  // ── Feedback Impact Visibility ──
  if (store.entries.length > 0) {
    console.log("  ─── Feedback Impact ────────────────────────────────────────");
    console.log("");
    const tpCount = store.entries.filter((e) => e.verdict === "tp").length;
    const fpCount = store.entries.filter((e) => e.verdict === "fp").length;
    const totalEntries = store.entries.length;
    const overallFpRate = totalEntries > 0 ? fpCount / totalEntries : 0;
    console.log(`  Total feedback:    ${totalEntries} entries (${tpCount} TP, ${fpCount} FP)`);
    console.log(`  Overall FP rate:   ${(overallFpRate * 100).toFixed(1)}%`);

    // Show improvement over time: compare first-half vs second-half FP rates
    const sorted = [...store.entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const mid = Math.floor(sorted.length / 2);
    if (mid > 2) {
      const firstHalf = sorted.slice(0, mid);
      const secondHalf = sorted.slice(mid);
      const firstFp = firstHalf.filter((e) => e.verdict === "fp").length / firstHalf.length;
      const secondFp = secondHalf.filter((e) => e.verdict === "fp").length / secondHalf.length;
      const delta = firstFp - secondFp;
      if (delta > 0.05) {
        console.log(`  Accuracy trend:    📈 Improving — FP rate dropped ${(delta * 100).toFixed(1)}pp`);
      } else if (delta < -0.05) {
        console.log(`  Accuracy trend:    📉 Degrading — FP rate rose ${(Math.abs(delta) * 100).toFixed(1)}pp`);
      } else {
        console.log(`  Accuracy trend:    ➡️  Stable`);
      }
    }

    // Show rules most improved by feedback
    const ruleImpact: Array<{ rule: string; reduction: string }> = [];
    for (const [ruleId, rate] of profile.fpRateByRule.entries()) {
      if (rate < 0.2) {
        ruleImpact.push({ rule: ruleId, reduction: `${(rate * 100).toFixed(0)}% FP` });
      }
    }
    if (ruleImpact.length > 0) {
      console.log("");
      console.log("  Well-calibrated rules (your feedback helped):");
      for (const r of ruleImpact.slice(0, 10)) {
        console.log(`    🟢 ${r.rule.padEnd(18)} ${r.reduction}`);
      }
    }
    console.log("");
  }
}

// ─── HTML Dashboard ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderCalibrationHtml(profile: CalibrationProfile, store: FeedbackStore): string {
  const sortedPrefixes = [...profile.fpRateByPrefix.entries()].sort((a, b) => b[1] - a[1]);
  const sortedRules = [...profile.fpRateByRule.entries()].sort((a, b) => b[1] - a[1]);

  // Compute feedback timeline — group by week
  const weekMap = new Map<string, { tp: number; fp: number }>();
  for (const entry of store.entries) {
    const d = new Date(entry.timestamp);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    const bucket = weekMap.get(key) ?? { tp: 0, fp: 0 };
    if (entry.verdict === "fp") bucket.fp++;
    else if (entry.verdict === "tp") bucket.tp++;
    weekMap.set(key, bucket);
  }
  const weeks = [...weekMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const barColor = (rate: number) => (rate > 0.5 ? "#ef4444" : rate > 0.2 ? "#f59e0b" : "#22c55e");
  const assessment = (rate: number) => (rate > 0.5 ? "Needs tuning" : rate > 0.2 ? "Acceptable" : "Well calibrated");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Judges — Calibration Dashboard</title>
<style>
  :root { --bg: #0d1117; --fg: #e6edf3; --card: #161b22; --border: #30363d; --muted: #7d8590; }
  @media (prefers-color-scheme: light) { :root { --bg: #fff; --fg: #1f2328; --card: #f6f8fa; --border: #d1d9e0; --muted: #656d76; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: var(--bg); color: var(--fg); padding: 2rem; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .subtitle { color: var(--muted); margin-bottom: 2rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; }
  .card .label { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .card .value { font-size: 1.8rem; font-weight: 600; margin-top: 0.25rem; }
  h2 { font-size: 1.1rem; margin: 1.5rem 0 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; }
  th, td { padding: 0.6rem 0.8rem; text-align: left; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  th { color: var(--muted); font-weight: 500; }
  .bar-cell { width: 200px; }
  .bar-bg { background: var(--border); border-radius: 4px; height: 16px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 500; }
  .badge-red { background: #3d1a1a; color: #ef4444; }
  .badge-yellow { background: #3d2e0a; color: #f59e0b; }
  .badge-green { background: #0d2818; color: #22c55e; }
  .timeline { display: flex; align-items: flex-end; gap: 3px; height: 80px; margin-bottom: 1.5rem; }
  .timeline-bar { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; min-width: 8px; }
  .timeline-bar .tp { background: #22c55e; }
  .timeline-bar .fp { background: #ef4444; }
  .timeline-labels { display: flex; gap: 3px; margin-bottom: 0.5rem; }
  .timeline-labels span { flex: 1; font-size: 0.6rem; color: var(--muted); text-align: center; overflow: hidden; }
  .recs { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; margin-top: 1.5rem; }
  .recs code { background: var(--border); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }
  .legend { display: flex; gap: 1rem; margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--muted); }
  .legend span::before { content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .legend .l-tp::before { background: #22c55e; }
  .legend .l-fp::before { background: #ef4444; }
  footer { margin-top: 3rem; text-align: center; color: var(--muted); font-size: 0.75rem; }
</style>
</head>
<body>
<h1>Judges — Calibration Dashboard</h1>
<p class="subtitle">Local calibration data from feedback · ${new Date().toLocaleDateString()}</p>

<div class="grid">
  <div class="card"><div class="label">Status</div><div class="value">${profile.isActive ? "✅ Active" : "⚠️ Inactive"}</div></div>
  <div class="card"><div class="label">Feedback Entries</div><div class="value">${profile.feedbackCount}</div></div>
  <div class="card"><div class="label">Rules Tracked</div><div class="value">${profile.fpRateByRule.size}</div></div>
  <div class="card"><div class="label">Judges Tracked</div><div class="value">${profile.fpRateByPrefix.size}</div></div>
</div>

${
  weeks.length > 0
    ? `
<h2>Feedback Timeline</h2>
<div class="legend"><span class="l-tp">True Positive</span><span class="l-fp">False Positive</span></div>
<div class="timeline-labels">${weeks.map(([w]) => `<span>${w.slice(5)}</span>`).join("")}</div>
<div class="timeline">${weeks
        .map(([, v]) => {
          const max = Math.max(...weeks.map(([, b]) => b.tp + b.fp), 1);
          const tpH = Math.round((v.tp / max) * 70);
          const fpH = Math.round((v.fp / max) * 70);
          return `<div class="timeline-bar"><div class="fp" style="height:${fpH}px"></div><div class="tp" style="height:${tpH}px"></div></div>`;
        })
        .join("")}</div>`
    : ""
}

${
  sortedPrefixes.length > 0
    ? `
<h2>Judge-Level FP Rates</h2>
<table>
<tr><th>Judge Prefix</th><th>FP Rate</th><th class="bar-cell">Distribution</th><th>Assessment</th></tr>
${sortedPrefixes
  .map(([prefix, rate]) => {
    const pct = (rate * 100).toFixed(1);
    const cls = rate > 0.5 ? "red" : rate > 0.2 ? "yellow" : "green";
    return `<tr><td><strong>${esc(prefix)}</strong></td><td>${pct}%</td><td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${barColor(rate)}"></div></div></td><td><span class="badge badge-${cls}">${assessment(rate)}</span></td></tr>`;
  })
  .join("\n")}
</table>`
    : ""
}

${
  sortedRules.length > 0
    ? `
<h2>Rule-Level FP Rates</h2>
<table>
<tr><th>Rule ID</th><th>FP Rate</th><th class="bar-cell">Distribution</th><th>Assessment</th></tr>
${sortedRules
  .map(([ruleId, rate]) => {
    const pct = (rate * 100).toFixed(1);
    const cls = rate > 0.5 ? "red" : rate > 0.2 ? "yellow" : "green";
    return `<tr><td><code>${esc(ruleId)}</code></td><td>${pct}%</td><td class="bar-cell"><div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${barColor(rate)}"></div></div></td><td><span class="badge badge-${cls}">${assessment(rate)}</span></td></tr>`;
  })
  .join("\n")}
</table>`
    : ""
}

${(() => {
  const highFp = sortedRules.filter(([, r]) => r > 0.5);
  if (highFp.length === 0) return "";
  return `<div class="recs"><h2 style="border:none;margin-top:0">Recommendations</h2>
<p>Rules with &gt;50% FP rate should be reviewed. Add to <code>.judgesrc</code> to disable:</p>
<pre style="margin-top:0.75rem;padding:0.75rem;background:var(--bg);border-radius:6px;overflow-x:auto"><code>"disabledRules": [${highFp.map(([id]) => `"${esc(id)}"`).join(", ")}]</code></pre></div>`;
})()}

<footer>Generated by Judges Panel · All data computed locally</footer>
</body>
</html>`;
}
