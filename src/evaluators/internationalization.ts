import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeInternationalization(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "I18N";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Detect hardcoded user-facing strings in UI code
  const hardcodedStringLines: number[] = [];
  lines.forEach((line, i) => {
    // Look for JSX text content or UI labels
    if (/>[\s]*[A-Z][a-z]+[\s\w]+<\//i.test(line) && !/translate|t\(|i18n|intl|formatMessage/i.test(line)) {
      hardcodedStringLines.push(i + 1);
    }
    // Look for label/title/placeholder with hardcoded strings
    if (/(?:label|title|placeholder|aria-label)\s*[=:]\s*["'`][A-Z]/i.test(line) && !/translate|t\(|i18n|intl|formatMessage/i.test(line)) {
      hardcodedStringLines.push(i + 1);
    }
  });
  if (hardcodedStringLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded user-facing strings",
      description: "User-facing text is hardcoded instead of using an internationalization framework, making translation impossible.",
      lineNumbers: [...new Set(hardcodedStringLines)].slice(0, 8),
      recommendation: "Use an i18n library (react-intl, i18next, vue-i18n) and extract strings to translation files.",
      reference: "Internationalization Best Practices",
    });
  }

  // Detect string concatenation for user messages
  const concatMsgLines: number[] = [];
  lines.forEach((line, i) => {
    if (/["'][^"']*["']\s*\+\s*\w+\s*\+\s*["']/i.test(line) && /(?:message|msg|text|label|title|error|warning|alert|toast)/i.test(line)) {
      concatMsgLines.push(i + 1);
    }
  });
  if (concatMsgLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "String concatenation for user messages",
      description: "Building user-facing messages with string concatenation doesn't work with i18n because word order varies by language.",
      lineNumbers: concatMsgLines,
      recommendation: "Use parameterized translation strings with named placeholders: t('greeting', { name }) instead of 'Hello ' + name.",
      reference: "ICU MessageFormat / i18n Parameterization",
    });
  }

  // Detect locale-sensitive operations without locale
  const localeSensitiveLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.toLocaleDateString\s*\(\s*\)|\.toLocaleString\s*\(\s*\)|new\s+Date\(\)\.toString\(\)/i.test(line)) {
      localeSensitiveLines.push(i + 1);
    }
    if (/\.sort\s*\(\s*\(.*\)\s*=>\s*\w+\s*[<>]\s*\w+/i.test(line) && /name|label|title/i.test(line)) {
      localeSensitiveLines.push(i + 1);
    }
  });
  if (localeSensitiveLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Locale-sensitive operation without explicit locale",
      description: "Date formatting and string sorting without explicit locale will behave inconsistently across different user environments.",
      lineNumbers: localeSensitiveLines,
      recommendation: "Pass explicit locale to toLocaleDateString(), use Intl.DateTimeFormat, and Intl.Collator for string comparison.",
      reference: "JavaScript Intl API",
    });
  }

  // Detect hardcoded currency symbols
  const currencyLines: number[] = [];
  lines.forEach((line, i) => {
    if (/[`"']\s*\$\s*\$?\{|["']\$\d|["`']\s*€|["`']\s*£|["`']\s*¥/i.test(line)) {
      currencyLines.push(i + 1);
    }
  });
  if (currencyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded currency formatting",
      description: "Hardcoded currency symbols and formatting don't account for different currencies, decimal separators, and symbol positions.",
      lineNumbers: currencyLines,
      recommendation: "Use Intl.NumberFormat with style: 'currency' for locale-aware currency formatting.",
      reference: "JavaScript Intl.NumberFormat",
    });
  }

  // Detect text direction assumptions
  const ltrAssumptionLines: number[] = [];
  lines.forEach((line, i) => {
    if (/text-align\s*:\s*left|padding-left|margin-left:\s*auto|float\s*:\s*left/i.test(line) && /header|nav|menu|sidebar/i.test(lines.slice(Math.max(0, i - 3), i + 1).join("\n"))) {
      ltrAssumptionLines.push(i + 1);
    }
  });
  if (ltrAssumptionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Assumed left-to-right text direction",
      description: "Hardcoded left/right positioning in layout elements doesn't support right-to-left (RTL) languages like Arabic or Hebrew.",
      lineNumbers: ltrAssumptionLines,
      recommendation: "Use logical CSS properties (inline-start/inline-end) or CSS logical properties (margin-inline-start) instead of left/right.",
      reference: "CSS Logical Properties / RTL Support",
    });
  }

  // Detect hardcoded pluralization
  const pluralLines: number[] = [];
  lines.forEach((line, i) => {
    if (/count\s*===?\s*1\s*\?\s*["'`].*["'`]\s*:\s*["'`].*s["'`]/i.test(line) || /\+\s*["'`]\s*items?["'`]/i.test(line)) {
      pluralLines.push(i + 1);
    }
  });
  if (pluralLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded pluralization logic",
      description: "Manual pluralization (adding 's') doesn't work for all languages. Many languages have complex plural forms (e.g., Arabic has 6 forms).",
      lineNumbers: pluralLines,
      recommendation: "Use ICU MessageFormat plural syntax or i18n library plural support: t('items', { count }).",
      reference: "CLDR Plural Rules / ICU MessageFormat",
    });
  }

  // Detect hardcoded date/number formats
  const formatLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.toFixed\s*\(\s*2\s*\)/.test(line) && /price|amount|cost|total/i.test(line)) {
      formatLines.push(i + 1);
    }
    if (/\d{2}\/\d{2}\/\d{4}|MM\/DD\/YYYY|DD\/MM\/YYYY/i.test(line)) {
      formatLines.push(i + 1);
    }
  });
  if (formatLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Hardcoded date or number format",
      description: "Date formats (MM/DD vs DD/MM) and number formats (decimal separators) differ across locales.",
      lineNumbers: [...new Set(formatLines)],
      recommendation: "Use Intl.DateTimeFormat and Intl.NumberFormat for locale-aware formatting. Never hardcode date patterns.",
      reference: "JavaScript Intl API / CLDR",
    });
  }

  // Detect hardcoded phone/address formats
  const phoneFormatLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\(\d{3}\)\s*\d{3}-\d{4}|phone.*format|zip.*code.*\d{5}/i.test(line)) {
      phoneFormatLines.push(i + 1);
    }
  });
  if (phoneFormatLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "US-specific format assumptions",
      description: "Phone number or zip code format validation assumes US format, which will reject valid international formats.",
      lineNumbers: phoneFormatLines,
      recommendation: "Use libraries like libphonenumber for phone validation, and flexible address components for international addresses.",
      reference: "International Phone Numbers / Address Standards",
    });
  }

  // Detect missing text encoding considerations
  const hasEncoding = /utf-8|utf8|encoding|charset/i.test(code);
  const handlesText = /readFile|writeFile|fetch|response\.text|Buffer\.from/i.test(code);
  if (handlesText && !hasEncoding && lines.length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No text encoding specification detected",
      description: "File/text operations without explicit encoding specification may produce garbled text for non-ASCII characters.",
      recommendation: "Always specify UTF-8 encoding when reading/writing text files. Set charset=utf-8 in Content-Type headers.",
      reference: "Unicode / UTF-8 Best Practices",
    });
  }

  return findings;
}
