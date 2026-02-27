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
      suggestedFix: "Replace hardcoded text with translation keys: use t('greeting_message') or <FormattedMessage id='greeting_message' /> instead of inline strings.",
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
      suggestedFix: "Replace string concatenation with parameterized translations: t('greeting', { name }) instead of 'Hello ' + name + '!'.",
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
      suggestedFix: "Pass an explicit locale argument: date.toLocaleDateString(userLocale) or new Intl.DateTimeFormat(userLocale).format(date).",
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
      suggestedFix: "Replace hardcoded currency symbols with Intl.NumberFormat: new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(amount).",
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
      suggestedFix: "Replace directional CSS with logical properties: use margin-inline-start instead of margin-left and text-align: start instead of text-align: left.",
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
      suggestedFix: "Use ICU plural syntax in translation keys: '{count, plural, one {# item} other {# items}}' instead of manual count === 1 ternary logic.",
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
      suggestedFix: "Replace hardcoded format patterns with Intl APIs: new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(date) instead of MM/DD/YYYY strings.",
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
      suggestedFix: "Use google-libphonenumber for phone validation and accept international postal codes instead of enforcing US-only zip code patterns.",
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
      suggestedFix: "Specify encoding explicitly: fs.readFileSync(path, 'utf-8') and set Content-Type: 'application/json; charset=utf-8' in HTTP responses.",
    });
  }

  // Detect raw number formatting without locale awareness
  const rawNumberLines: number[] = [];
  lines.forEach((line, i) => {
    // Detect Number().toString(), String(number), or template literals with numeric variables without Intl
    if (/(?:\.toString\(\)|String\(\w+\)|\$\{\w+\})\s*/.test(line) && /(?:price|amount|cost|total|quantity|count|balance|salary|revenue)/i.test(line) && !/Intl|toLocaleString|NumberFormat|i18n|formatNumber/i.test(line)) {
      rawNumberLines.push(i + 1);
    }
    // Detect manual thousand separators or decimal formatting
    if (/\.replace\(\s*\/\\B\(?=\(\\d\{3\}\)\+\(?!\\d\)\)\/|\.toFixed\s*\(\s*\d\s*\)\s*(?!\s*\))/.test(line) && /(?:price|amount|cost|total|balance)/i.test(line) && !/Intl|NumberFormat/i.test(line)) {
      rawNumberLines.push(i + 1);
    }
  });
  if (rawNumberLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Numeric values formatted without locale awareness",
      description: "Monetary or numeric values are formatted without using locale-aware APIs. Thousand separators (1,000 vs 1.000) and decimal marks vary by locale.",
      lineNumbers: [...new Set(rawNumberLines)],
      recommendation: "Use Intl.NumberFormat for all user-facing numbers: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount).",
      reference: "JavaScript Intl.NumberFormat / CLDR Number Patterns",
      suggestedFix: "Format numbers with Intl: new Intl.NumberFormat(userLocale, { style: 'currency', currency: 'USD' }).format(amount); instead of manual formatting.",
    });
  }

  return findings;
}
