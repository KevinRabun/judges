/**
 * Review-rate-limit — Control review frequency to avoid noise.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RateLimitConfig {
  version: string;
  maxReviewsPerHour: number;
  maxReviewsPerDay: number;
  cooldownMinutes: number;
  history: string[];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const RL_FILE = ".judges/rate-limit.json";

function loadConfig(): RateLimitConfig {
  if (!existsSync(RL_FILE)) {
    return { version: "1.0.0", maxReviewsPerHour: 30, maxReviewsPerDay: 200, cooldownMinutes: 1, history: [] };
  }
  try {
    return JSON.parse(readFileSync(RL_FILE, "utf-8")) as RateLimitConfig;
  } catch {
    return { version: "1.0.0", maxReviewsPerHour: 30, maxReviewsPerDay: 200, cooldownMinutes: 1, history: [] };
  }
}

function saveConfig(config: RateLimitConfig): void {
  mkdirSync(dirname(RL_FILE), { recursive: true });
  writeFileSync(RL_FILE, JSON.stringify(config, null, 2), "utf-8");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewRateLimit(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-rate-limit — Control review frequency

Usage:
  judges review-rate-limit                           Show current limits and usage
  judges review-rate-limit set --per-hour 20 --per-day 100
  judges review-rate-limit check                     Check if review is allowed now
  judges review-rate-limit record                    Record a review event
  judges review-rate-limit reset                     Reset history and limits

Subcommands:
  (default)             Show limits and usage
  set                   Configure rate limits
  check                 Check if within limits
  record                Record a review event
  reset                 Reset all rate limit state

Options:
  --per-hour <n>        Max reviews per hour
  --per-day <n>         Max reviews per day
  --cooldown <n>        Cooldown between reviews (minutes)
  --format json         JSON output
  --help, -h            Show this help

Config stored in .judges/rate-limit.json.
`);
    return;
  }

  const subcommand = argv.find((a) => ["set", "check", "record", "reset"].includes(a));
  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const config = loadConfig();

  if (subcommand === "set") {
    const perHour = argv.find((_a: string, i: number) => argv[i - 1] === "--per-hour");
    const perDay = argv.find((_a: string, i: number) => argv[i - 1] === "--per-day");
    const cooldown = argv.find((_a: string, i: number) => argv[i - 1] === "--cooldown");
    if (perHour) config.maxReviewsPerHour = parseInt(perHour, 10);
    if (perDay) config.maxReviewsPerDay = parseInt(perDay, 10);
    if (cooldown) config.cooldownMinutes = parseInt(cooldown, 10);
    saveConfig(config);
    console.log(
      `Rate limits: ${config.maxReviewsPerHour}/hr, ${config.maxReviewsPerDay}/day, ${config.cooldownMinutes}min cooldown`,
    );
    return;
  }

  if (subcommand === "record") {
    config.history.push(new Date().toISOString());
    // Prune old entries (keep last 24h)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    config.history = config.history.filter((t) => t >= cutoff);
    saveConfig(config);
    console.log(`Review recorded. ${config.history.length} reviews in last 24h.`);
    return;
  }

  if (subcommand === "reset") {
    saveConfig({ version: "1.0.0", maxReviewsPerHour: 30, maxReviewsPerDay: 200, cooldownMinutes: 1, history: [] });
    console.log("Rate limits reset to defaults.");
    return;
  }

  // Compute usage
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const lastHour = config.history.filter((t) => t >= oneHourAgo).length;
  const lastDay = config.history.filter((t) => t >= oneDayAgo).length;

  const lastTimestamp = config.history.length > 0 ? config.history[config.history.length - 1] : null;
  const cooldownOk = !lastTimestamp || now - new Date(lastTimestamp).getTime() >= config.cooldownMinutes * 60 * 1000;
  const hourOk = lastHour < config.maxReviewsPerHour;
  const dayOk = lastDay < config.maxReviewsPerDay;
  const allowed = cooldownOk && hourOk && dayOk;

  if (subcommand === "check") {
    if (format === "json") {
      console.log(JSON.stringify({ allowed, lastHour, lastDay, cooldownOk, hourOk, dayOk }, null, 2));
      return;
    }
    console.log(allowed ? "Review allowed." : "Rate limit exceeded — review blocked.");
    if (!cooldownOk) console.log(`  Cooldown: wait ${config.cooldownMinutes} min`);
    if (!hourOk) console.log(`  Hourly: ${lastHour}/${config.maxReviewsPerHour}`);
    if (!dayOk) console.log(`  Daily: ${lastDay}/${config.maxReviewsPerDay}`);
    return;
  }

  // Default: show
  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          limits: {
            perHour: config.maxReviewsPerHour,
            perDay: config.maxReviewsPerDay,
            cooldownMinutes: config.cooldownMinutes,
          },
          usage: { lastHour, lastDay },
          allowed,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log("\nRate Limit Status:");
  console.log("═".repeat(45));
  console.log(`  Hourly:   ${lastHour} / ${config.maxReviewsPerHour}`);
  console.log(`  Daily:    ${lastDay} / ${config.maxReviewsPerDay}`);
  console.log(`  Cooldown: ${config.cooldownMinutes} min`);
  console.log(`  Status:   ${allowed ? "OK — review allowed" : "BLOCKED"}`);
  console.log("═".repeat(45));
}
