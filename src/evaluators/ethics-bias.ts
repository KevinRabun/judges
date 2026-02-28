import type { Finding } from "../types.js";
import { getLangFamily } from "./shared.js";

export function analyzeEthicsBias(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "ETHICS";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  const isCommentLikeLine = (line: string): boolean => {
    const trimmed = line.trim();
    return (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("--")
    );
  };

  const stripStringLiterals = (line: string): string => line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "");

  // Detect demographic-based filtering or scoring
  const demographicLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLikeLine(line)) return;
    const executableLine = stripStringLiterals(line);
    if (
      /\b(?:gender|sex|race|ethnicity|religion|nationality|age|disability)\b\s*(?:===|==|!==|!=|\?\s|&&|\|\|)/i.test(
        executableLine,
      )
    ) {
      demographicLines.push(i + 1);
    }
  });
  if (demographicLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Demographic-based conditional logic",
      description:
        "Code contains conditional logic based on protected demographic characteristics, which may constitute discriminatory behavior.",
      lineNumbers: demographicLines,
      recommendation:
        "Review whether demographic-based logic is legally compliant and ethically justified. Document the business justification. Consider bias testing.",
      reference: "EU AI Act / Anti-Discrimination Laws / Algorithmic Fairness",
      suggestedFix:
        "Replace demographic conditionals with policy-driven rules or feature flags, and add bias-impact documentation for any remaining demographic logic.",
      confidence: 0.8,
    });
  }

  // Detect scoring/ranking without explainability
  const scoringLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /(?:score|rank|rating|risk)\s*(?:\+|=|-|\*|\/)/i.test(line) &&
      /(?:user|customer|applicant|candidate|patient)/i.test(
        lines.slice(Math.max(0, i - 10), Math.min(lines.length, i + 10)).join("\n"),
      )
    ) {
      scoringLines.push(i + 1);
    }
  });
  const hasExplainability = /explain|reason|factor|justif|audit|log.*score|score.*log/i.test(code);
  if (scoringLines.length > 0 && !hasExplainability) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "User scoring without explainability",
      description:
        "Scoring or ranking users without logging factors or providing explanations may violate right-to-explanation regulations.",
      lineNumbers: scoringLines,
      recommendation:
        "Log all factors contributing to scores. Provide mechanisms for users to understand and contest automated decisions.",
      reference: "GDPR Article 22 / EU AI Act Transparency Requirements",
      suggestedFix:
        "Add a scoring explanation object that logs each factor and weight, and expose a `getScoreExplanation()` method for audit and user queries.",
      confidence: 0.75,
    });
  }

  // Detect automated decision-making without human review
  const autoDecisionLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:approve|reject|deny|block|suspend|terminate|ban)\s*\(/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join("\n");
      if (
        !/review|manual|human|override|appeal|queue.*review/i.test(context) &&
        /auto|bot|system|cron|scheduled/i.test(context)
      ) {
        autoDecisionLines.push(i + 1);
      }
    }
  });
  if (autoDecisionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Automated consequential decision without human review",
      description:
        "Automated decisions that significantly affect users (account suspension, application denial) should include human review processes.",
      lineNumbers: autoDecisionLines,
      recommendation:
        "Implement human-in-the-loop for high-impact automated decisions. Provide appeal mechanisms and audit trails.",
      reference: "GDPR Article 22 / Right to Human Review",
      suggestedFix:
        "Route high-impact decisions through a review queue instead of executing immediately, and add an appeal/override endpoint for human reviewers.",
      confidence: 0.75,
    });
  }

  // Detect dark patterns in UI code
  const darkPatternLines: number[] = [];
  lines.forEach((line, i) => {
    // Pre-checked checkboxes for marketing
    if (
      /(?:checked|defaultChecked|selected)\s*[=:]\s*(?:true|{true})/i.test(line) &&
      /(?:newsletter|marketing|promo|subscribe|opt|consent|agree|terms)/i.test(line)
    ) {
      darkPatternLines.push(i + 1);
    }
    // Hidden inputs for consent
    if (/type\s*=\s*["']hidden["']/i.test(line) && /consent|agree|opt/i.test(line)) {
      darkPatternLines.push(i + 1);
    }
  });
  if (darkPatternLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential dark pattern detected",
      description:
        "Pre-checked consent boxes or hidden consent inputs may constitute dark patterns that manipulate users into unintended actions.",
      lineNumbers: darkPatternLines,
      recommendation:
        "Ensure all consent mechanisms are opt-in (unchecked by default), clearly visible, and use plain language.",
      reference: "FTC Dark Patterns Guidelines / GDPR Valid Consent",
      suggestedFix:
        "Set `checked`/`defaultChecked` to `false` for consent checkboxes and change hidden consent inputs to visible, clearly-labeled form fields.",
      confidence: 0.85,
    });
  }

  // Detect exclusionary language in code/comments
  const exclusionaryLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\b(?:whitelist|blacklist|master(?:\/|_)slave|dummy|sanity\s*check)\b/i.test(line)) {
      exclusionaryLines.push(i + 1);
    }
  });
  if (exclusionaryLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Non-inclusive language in code",
      description:
        "Terms like 'whitelist/blacklist' and 'master/slave' are being replaced across the industry with inclusive alternatives.",
      lineNumbers: exclusionaryLines,
      recommendation: "Use inclusive alternatives: allowlist/denylist, primary/replica, placeholder, confidence check.",
      reference: "Inclusive Naming Initiative / Google Developer Style Guide",
      suggestedFix:
        "Rename `whitelist`→`allowlist`, `blacklist`→`denylist`, `master/slave`→`primary/replica`, and `sanity check`→`confidence check`.",
      confidence: 0.85,
    });
  }

  // Detect biased training data or model references
  const biasedDataLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /(?:train|dataset|corpus|sample)\s*(?:=|\.)/i.test(line) &&
      !/(?:balanced|stratified|representative|fairness|bias.?check|debiased)/i.test(
        lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join("\n"),
      )
    ) {
      if (
        /(?:predict|classify|recommend|score|rank)/i.test(lines.slice(i, Math.min(lines.length, i + 20)).join("\n"))
      ) {
        biasedDataLines.push(i + 1);
      }
    }
  });
  if (biasedDataLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "ML training data without bias consideration",
      description:
        "Training data is loaded for ML/prediction without visible bias checks or data balancing. Biased data produces biased outcomes.",
      lineNumbers: biasedDataLines.slice(0, 5),
      recommendation:
        "Implement data auditing for representation, test model outputs across demographic groups, and document data provenance.",
      reference: "ML Fairness / Responsible AI Practices",
      suggestedFix:
        "Add a bias-audit step (e.g., `auditDatasetBalance(dataset)`) before training, and log demographic distribution metrics for each dataset.",
      confidence: 0.7,
    });
  }

  // Detect manipulative UI urgency patterns
  const urgencyLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /(?:only\s+\d+\s+left|limited\s+time|act\s+now|hurry|countdown|expires?\s+in|last\s+chance|selling\s+fast)/i.test(
        line,
      )
    ) {
      urgencyLines.push(i + 1);
    }
  });
  if (urgencyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Artificial urgency/scarcity pattern",
      description:
        "Text suggesting false urgency or scarcity may pressure users into hasty decisions — a recognized dark pattern.",
      lineNumbers: urgencyLines,
      recommendation:
        "Ensure scarcity/urgency messaging reflects real inventory or time limits. Verify claims are accurate and not manufactured.",
      reference: "FTC Dark Patterns / Consumer Protection",
      suggestedFix:
        "Replace hardcoded urgency strings with data-driven values sourced from real inventory or deadline APIs, and remove any fabricated scarcity copy.",
      confidence: 0.85,
    });
  }

  // Detect data collection beyond stated purpose
  const excessiveCollectionLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /(?:navigator\.geolocation|getBattery|deviceMemory|connection\.effectiveType|screen\.orientation|Accelerometer|Gyroscope)/i.test(
        line,
      )
    ) {
      const context = lines.slice(Math.max(0, i - 10), Math.min(lines.length, i + 10)).join("\n");
      if (!/consent|permission|opt.?in|purpose/i.test(context)) {
        excessiveCollectionLines.push(i + 1);
      }
    }
  });
  if (excessiveCollectionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Device data collection without stated purpose",
      description:
        "Accessing device sensors, battery status, or detailed system info without clear consent or documented purpose raises privacy concerns.",
      lineNumbers: excessiveCollectionLines,
      recommendation:
        "Only collect data necessary for the stated feature. Document the purpose and obtain consent before accessing device APIs.",
      reference: "GDPR Data Minimization / Privacy by Design",
      suggestedFix:
        "Gate device-API calls behind a consent check (e.g., `if (hasUserConsent('geolocation')) { ... }`) and document the data-collection purpose inline.",
      confidence: 0.8,
    });
  }

  // Detect price discrimination patterns
  const pricingLines: number[] = [];
  lines.forEach((line, i) => {
    if (
      /(?:price|cost|fee|rate)\s*(?:\*|=|\+)/i.test(line) &&
      /(?:location|region|country|device|platform|userAgent|browser)/i.test(line)
    ) {
      pricingLines.push(i + 1);
    }
  });
  if (pricingLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential price discrimination based on user attributes",
      description:
        "Pricing calculations based on user location, device, or platform may constitute discriminatory pricing practices.",
      lineNumbers: pricingLines,
      recommendation:
        "If price varies by region, be transparent about it. Ensure pricing differences are based on legitimate factors (taxes, shipping) not user profiling.",
      reference: "Consumer Protection / Fair Pricing Laws",
      suggestedFix:
        "Separate tax/shipping adjustments from base price, remove device/userAgent from pricing logic, and display a price-breakdown to the user.",
      confidence: 0.8,
    });
  }

  // Detect accessibility barriers as ethics issue
  const accessBarrierLines: number[] = [];
  lines.forEach((line, i) => {
    if (/captcha|recaptcha/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
      if (!/audio|alternative|accessible|aria/i.test(context)) {
        accessBarrierLines.push(i + 1);
      }
    }
  });
  if (accessBarrierLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "CAPTCHA without accessible alternative",
      description:
        "Visual CAPTCHAs without audio or alternative verification options exclude users with visual impairments.",
      lineNumbers: accessBarrierLines,
      recommendation:
        "Provide accessible CAPTCHA alternatives (audio, logic puzzles) or use invisible CAPTCHA methods that don't require visual interaction.",
      reference: "WCAG 1.1.1 Non-text Content / Digital Inclusion",
      suggestedFix:
        "Add an audio CAPTCHA fallback or switch to an invisible/accessible CAPTCHA provider (e.g., reCAPTCHA v3) that doesn't require visual interaction.",
      confidence: 0.75,
    });
  }

  return findings;
}
