/**
 * Team leaderboard — gamified security review engagement
 * tracking across developers.
 *
 * All data stays in local .judges-leaderboard/ directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface DevStats {
  author: string;
  findingsReviewed: number;
  findingsFixed: number;
  criticalFixed: number;
  scansRun: number;
  streak: number;
  lastActive: string;
  badges: string[];
}

interface LeaderboardStore {
  developers: DevStats[];
  updatedAt: string;
}

const LB_DIR = ".judges-leaderboard";
const LB_FILE = join(LB_DIR, "leaderboard.json");

// ─── Badge definitions ──────────────────────────────────────────────────────

function computeBadges(dev: DevStats): string[] {
  const badges: string[] = [];
  if (dev.scansRun >= 100) badges.push("Century Scanner");
  else if (dev.scansRun >= 50) badges.push("Veteran Scanner");
  else if (dev.scansRun >= 10) badges.push("Active Scanner");
  if (dev.criticalFixed >= 10) badges.push("Critical Crusher");
  else if (dev.criticalFixed >= 5) badges.push("Bug Buster");
  if (dev.findingsFixed >= 50) badges.push("Fix Master");
  else if (dev.findingsFixed >= 20) badges.push("Fixer Upper");
  if (dev.streak >= 30) badges.push("Monthly Streak");
  else if (dev.streak >= 7) badges.push("Weekly Streak");
  if (dev.findingsReviewed >= 100) badges.push("Review Champion");
  return badges;
}

// ─── Core ───────────────────────────────────────────────────────────────────

function ensureDir(): void {
  if (!existsSync(LB_DIR)) mkdirSync(LB_DIR, { recursive: true });
}

function loadStore(): LeaderboardStore {
  if (!existsSync(LB_FILE)) return { developers: [], updatedAt: new Date().toISOString() };
  try {
    return JSON.parse(readFileSync(LB_FILE, "utf-8"));
  } catch {
    return { developers: [], updatedAt: new Date().toISOString() };
  }
}

function saveStore(store: LeaderboardStore): void {
  ensureDir();
  store.updatedAt = new Date().toISOString();
  writeFileSync(LB_FILE, JSON.stringify(store, null, 2));
}

function sanitizeAuthor(author: string): string {
  return author.replace(/[^a-zA-Z0-9@._-]/g, "_").slice(0, 100);
}

export function recordActivity(
  author: string,
  activity: { reviewed?: number; fixed?: number; criticalFixed?: number; scansRun?: number },
): DevStats {
  const store = loadStore();
  const safeAuthor = sanitizeAuthor(author);
  let dev = store.developers.find((d) => d.author === safeAuthor);
  if (!dev) {
    dev = {
      author: safeAuthor,
      findingsReviewed: 0,
      findingsFixed: 0,
      criticalFixed: 0,
      scansRun: 0,
      streak: 0,
      lastActive: "",
      badges: [],
    };
    store.developers.push(dev);
  }

  dev.findingsReviewed += activity.reviewed || 0;
  dev.findingsFixed += activity.fixed || 0;
  dev.criticalFixed += activity.criticalFixed || 0;
  dev.scansRun += activity.scansRun || 0;

  // Streak tracking
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (dev.lastActive === yesterday || dev.lastActive === today) {
    if (dev.lastActive !== today) dev.streak++;
  } else {
    dev.streak = 1;
  }
  dev.lastActive = today;
  dev.badges = computeBadges(dev);

  saveStore(store);
  return dev;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runTeamLeaderboard(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges team-leaderboard — Gamified security review engagement

Usage:
  judges team-leaderboard
  judges team-leaderboard --record --author "alice@co.com" --reviewed 5 --fixed 3
  judges team-leaderboard --author "alice@co.com"
  judges team-leaderboard --top 5
  judges team-leaderboard --badges

Options:
  --record                  Record developer activity
  --author <email>          Developer identifier
  --reviewed <n>            Findings reviewed count
  --fixed <n>               Findings fixed count
  --critical-fixed <n>      Critical findings fixed count
  --scans <n>               Scans run count
  --top <n>                 Show top N developers (default: 10)
  --badges                  Show badge catalog
  --format json             JSON output
  --help, -h                Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // Badge catalog
  if (argv.includes("--badges")) {
    const catalog = [
      { badge: "Century Scanner", requirement: "100+ scans run" },
      { badge: "Veteran Scanner", requirement: "50+ scans run" },
      { badge: "Active Scanner", requirement: "10+ scans run" },
      { badge: "Critical Crusher", requirement: "10+ critical findings fixed" },
      { badge: "Bug Buster", requirement: "5+ critical findings fixed" },
      { badge: "Fix Master", requirement: "50+ findings fixed" },
      { badge: "Fixer Upper", requirement: "20+ findings fixed" },
      { badge: "Monthly Streak", requirement: "30+ day activity streak" },
      { badge: "Weekly Streak", requirement: "7+ day activity streak" },
      { badge: "Review Champion", requirement: "100+ findings reviewed" },
    ];
    if (format === "json") {
      console.log(JSON.stringify(catalog, null, 2));
    } else {
      console.log(`\n  Badge Catalog\n  ──────────────────────────`);
      for (const b of catalog) {
        console.log(`    🏆 ${b.badge.padEnd(20)} ${b.requirement}`);
      }
      console.log("");
    }
    return;
  }

  // Record activity
  if (argv.includes("--record")) {
    const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author");
    if (!author) {
      console.error("  --author required for --record");
      return;
    }
    const reviewed = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--reviewed") || "0", 10);
    const fixed = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--fixed") || "0", 10);
    const criticalFixed = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--critical-fixed") || "0", 10);
    const scansRun = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--scans") || "0", 10);

    const dev = recordActivity(author, { reviewed, fixed, criticalFixed, scansRun });
    if (format === "json") {
      console.log(JSON.stringify(dev, null, 2));
    } else {
      console.log(`\n  ✅ Activity recorded for ${dev.author}`);
      console.log(`     Reviewed: ${dev.findingsReviewed} | Fixed: ${dev.findingsFixed} | Streak: ${dev.streak}`);
      if (dev.badges.length > 0) console.log(`     Badges: ${dev.badges.join(", ")}`);
      console.log("");
    }
    return;
  }

  // Individual stats
  const author = argv.find((_a: string, i: number) => argv[i - 1] === "--author");
  if (author) {
    const store = loadStore();
    const dev = store.developers.find((d) => d.author === sanitizeAuthor(author));
    if (!dev) {
      console.error(`  Developer not found: ${author}`);
      return;
    }
    if (format === "json") {
      console.log(JSON.stringify(dev, null, 2));
    } else {
      console.log(`\n  Developer Stats — ${dev.author}`);
      console.log(`  ──────────────────────────`);
      console.log(`  Reviewed:       ${dev.findingsReviewed}`);
      console.log(`  Fixed:          ${dev.findingsFixed}`);
      console.log(`  Critical fixed: ${dev.criticalFixed}`);
      console.log(`  Scans:          ${dev.scansRun}`);
      console.log(`  Streak:         ${dev.streak} days`);
      console.log(`  Badges:         ${dev.badges.join(", ") || "none yet"}`);
      console.log("");
    }
    return;
  }

  // Leaderboard
  const topN = parseInt(argv.find((_a: string, i: number) => argv[i - 1] === "--top") || "10", 10);
  const store = loadStore();
  const sorted = [...store.developers].sort((a, b) => {
    // Score: fixed * 3 + reviewed + criticalFixed * 5
    const scoreA = a.findingsFixed * 3 + a.findingsReviewed + a.criticalFixed * 5;
    const scoreB = b.findingsFixed * 3 + b.findingsReviewed + b.criticalFixed * 5;
    return scoreB - scoreA;
  });

  const top = sorted.slice(0, topN);
  if (format === "json") {
    console.log(JSON.stringify(top, null, 2));
  } else {
    console.log(`\n  Team Leaderboard (top ${topN})\n  ──────────────────────────`);
    if (top.length === 0) {
      console.log("    No data yet. Record activity with --record first.");
    } else {
      top.forEach((dev, i) => {
        const score = dev.findingsFixed * 3 + dev.findingsReviewed + dev.criticalFixed * 5;
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
        console.log(
          `    ${medal} #${(i + 1).toString().padEnd(3)} ${dev.author.padEnd(25)} score: ${score.toString().padEnd(6)} streak: ${dev.streak}d`,
        );
        if (dev.badges.length) console.log(`        Badges: ${dev.badges.join(", ")}`);
      });
    }
    console.log("");
  }
}
