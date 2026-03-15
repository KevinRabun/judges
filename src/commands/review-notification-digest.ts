/**
 * Review-notification-digest — Generate notification digests for review activity.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface NotificationEntry {
  id: string;
  type: "finding" | "verdict" | "gate" | "policy";
  severity: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface NotificationStore {
  notifications: NotificationEntry[];
  lastUpdated: string;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runReviewNotificationDigest(argv: string[]): void {
  const storeIdx = argv.indexOf("--store");
  const storePath = storeIdx >= 0 ? argv[storeIdx + 1] : ".judges-notifications.json";
  const formatIdx = argv.indexOf("--format");
  const format = formatIdx >= 0 ? argv[formatIdx + 1] : "table";
  const unreadOnly = argv.includes("--unread");
  const lastN = argv.indexOf("--last");
  const lastCount = lastN >= 0 ? parseInt(argv[lastN + 1], 10) : 0;

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges review-notification-digest — Generate notification digests

Usage:
  judges review-notification-digest [--store <path>] [--unread] [--last <n>] [--format table|json]

Options:
  --store <path>     Notification store (default: .judges-notifications.json)
  --unread           Show only unread notifications
  --last <n>         Show only the last N notifications
  --format <fmt>     Output format: table (default), json
  --help, -h         Show this help
`);
    return;
  }

  if (!existsSync(storePath)) {
    console.log(`No notification store found at: ${storePath}`);
    console.log("Notifications are generated automatically during reviews.");
    return;
  }

  const store = JSON.parse(readFileSync(storePath, "utf-8")) as NotificationStore;
  let notifications = store.notifications;

  if (unreadOnly) {
    notifications = notifications.filter((n) => !n.read);
  }

  if (lastCount > 0) {
    notifications = notifications.slice(-lastCount);
  }

  if (format === "json") {
    console.log(JSON.stringify(notifications, null, 2));
    return;
  }

  console.log(`\nNotification Digest (${notifications.length})`);
  console.log("═".repeat(80));

  if (notifications.length === 0) {
    console.log("  No notifications to display.");
  } else {
    console.log(
      `  ${"ID".padEnd(10)} ${"Type".padEnd(10)} ${"Severity".padEnd(10)} ${"Read".padEnd(6)} ${"Date".padEnd(14)} Message`,
    );
    console.log("  " + "─".repeat(75));

    for (const n of notifications) {
      const readIcon = n.read ? "Yes" : "No";
      const msg = n.message.length > 25 ? n.message.slice(0, 22) + "..." : n.message;
      console.log(
        `  ${n.id.padEnd(10)} ${n.type.padEnd(10)} ${n.severity.padEnd(10)} ${readIcon.padEnd(6)} ${n.timestamp.slice(0, 10).padEnd(14)} ${msg}`,
      );
    }
  }

  const unread = store.notifications.filter((n) => !n.read).length;
  console.log(`\n  Total: ${store.notifications.length} | Unread: ${unread}`);
  console.log("═".repeat(80));
}
