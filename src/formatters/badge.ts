// ─── Score Badge Generator ───────────────────────────────────────────────────
// Generate SVG badge images from evaluation scores.
// Compatible with shields.io style badges for use in README files.
//
// Usage:
//   import { generateBadgeSvg } from "./badge.js";
//   const svg = generateBadgeSvg(85);      // green badge "judges | 85/100"
//   const svg = generateBadgeSvg(42);      // red badge   "judges | 42/100"
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Determine badge color based on score.
 */
function scoreColor(score: number): string {
  if (score >= 90) return "#4c1"; // bright green
  if (score >= 80) return "#97ca00"; // green
  if (score >= 70) return "#a4a61d"; // yellow-green
  if (score >= 60) return "#dfb317"; // yellow
  if (score >= 50) return "#fe7d37"; // orange
  return "#e05d44"; // red
}

/**
 * Estimate text width for SVG rendering.
 */
function textWidth(text: string): number {
  // Approximate character widths at 11px Verdana
  return text.length * 6.5 + 10;
}

/**
 * Generate an SVG badge in shields.io flat style.
 *
 * @param score - Score 0–100
 * @param label - Left label text (default: "judges")
 * @returns SVG string
 */
export function generateBadgeSvg(score: number, label = "judges"): string {
  const value = `${Math.round(score)} / 100`;
  const color = scoreColor(score);
  const lw = textWidth(label);
  const vw = textWidth(value);
  const totalWidth = lw + vw;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalWidth}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${lw}" height="20" fill="#555"/>
    <rect x="${lw}" width="${vw}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text aria-hidden="true" x="${lw / 2}" y="15" fill="#010101" fill-opacity=".3">${label}</text>
    <text x="${lw / 2}" y="14">${label}</text>
    <text aria-hidden="true" x="${lw + vw / 2}" y="15" fill="#010101" fill-opacity=".3">${value}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

/**
 * Generate a simple text-based badge string for terminals.
 *
 * @param score - Score 0–100
 * @param label - Label text
 * @returns Formatted badge string like "[ judges: 85/100 ✓ ]"
 */
export function generateBadgeText(score: number, label = "judges"): string {
  const icon = score >= 80 ? "✓" : score >= 60 ? "⚠" : "✗";
  return `[ ${label}: ${Math.round(score)}/100 ${icon} ]`;
}
