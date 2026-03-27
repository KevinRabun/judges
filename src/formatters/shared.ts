// ─── Shared Formatter Utilities ──────────────────────────────────────────────
// Common helpers used by multiple output formatters (HTML, PDF, etc.).
// ──────────────────────────────────────────────────────────────────────────────

/** HTML-escape a string to prevent XSS in generated reports. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Map a severity level to its display hex color. */
export function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "#dc2626";
    case "high":
      return "#ea580c";
    case "medium":
      return "#ca8a04";
    case "low":
      return "#2563eb";
    case "info":
      return "#6b7280";
    default:
      return "#6b7280";
  }
}
