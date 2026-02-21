import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCompliance(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "COMP";
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

  // Detect PII handling without encryption
  const piiFieldLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLikeLine(line)) return;

    if (/(?:ssn|social_security|tax_id|passport|national_id|driver_license)/i.test(line) && !/encrypt|hash|mask|redact/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 5)).join("\n");
      if (/(?:save|store|insert|persist|write|log|send|post|request|payload|body|db\.)/i.test(context)) {
        piiFieldLines.push(i + 1);
      }
    }
  });
  if (piiFieldLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "PII field handled without protection",
      description: "Personally Identifiable Information (SSN, passport, tax ID) must be encrypted at rest and in transit, and masked in logs.",
      lineNumbers: piiFieldLines,
      recommendation: "Encrypt PII fields, mask them in logs and UI displays, and ensure they are stored with column-level encryption.",
      reference: "GDPR Article 32 / CCPA / HIPAA",
    });
  }

  // Detect missing consent/opt-in checks
  const trackingLines: number[] = [];
  lines.forEach((line, i) => {
    if (/analytics|tracking|telemetry|gtag|fbq|pixel|ga\s*\(/i.test(line)) {
      trackingLines.push(i + 1);
    }
  });
  const hasConsent = /consent|opt.?in|cookie.?banner|gdpr|accept.*cookie/i.test(code);
  if (trackingLines.length > 0 && !hasConsent) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Tracking/analytics without consent check",
      description: "Analytics and tracking scripts are loaded without checking for user consent, potentially violating GDPR and ePrivacy regulations.",
      lineNumbers: trackingLines,
      recommendation: "Implement a consent management system. Only load tracking scripts after obtaining explicit user consent.",
      reference: "GDPR Article 6 / ePrivacy Directive",
    });
  }

  // Detect data retention issues
  const storeForeverLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:save|store|insert|persist|write)\s*\(/i.test(line) && /(?:user|personal|customer|patient|email|phone)/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join("\n");
      if (!/ttl|expir|retention|purge|delete.*after|archive/i.test(context)) {
        storeForeverLines.push(i + 1);
      }
    }
  });
  if (storeForeverLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Personal data stored without retention policy",
      description: "Personal data appears to be stored indefinitely without a defined retention period or cleanup mechanism.",
      lineNumbers: storeForeverLines,
      recommendation: "Define and implement data retention policies. Set TTLs, schedule purge jobs, or implement right-to-deletion workflows.",
      reference: "GDPR Article 5(1)(e) Storage Limitation",
    });
  }

  // Detect logging of sensitive information
  const logSensitiveLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:console|logger|log)\.\w+\s*\(/.test(line) && /(?:password|token|secret|ssn|credit.?card|api.?key|auth)/i.test(line)) {
      logSensitiveLines.push(i + 1);
    }
  });
  if (logSensitiveLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Sensitive data in log statements",
      description: "Logging sensitive information (passwords, tokens, SSNs, credit cards) creates compliance violations and security risks.",
      lineNumbers: logSensitiveLines,
      recommendation: "Never log sensitive data. Use redaction/masking utilities to sanitize log output. Audit all log statements.",
      reference: "OWASP Logging Cheat Sheet / PCI DSS Requirement 3",
    });
  }

  // Detect missing data classification markers
  const dataModelLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:interface|class|type|schema|model)\s+\w*(?:User|Customer|Patient|Employee|Person)/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
      if (!/classification|sensitivity|pii|confidential|restricted|public/i.test(context)) {
        dataModelLines.push(i + 1);
      }
    }
  });
  if (dataModelLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Data model lacks classification markers",
      description: "Data models containing personal information should include data classification metadata to guide handling policies.",
      lineNumbers: dataModelLines,
      recommendation: "Add data classification comments or decorators (e.g., @PII, @Confidential) to help enforce appropriate handling.",
      reference: "Data Classification Best Practices",
    });
  }

  // Detect credit card number patterns (PCI DSS)
  const cardNumberLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLikeLine(line)) return;

    const context = lines.slice(Math.max(0, i - 4), Math.min(lines.length, i + 5)).join("\n");
    const hasPaymentContext = /(?:payment|billing|checkout|charge|\bcard(?:Number)?\b|\bpan\b|stripe|braintree|authorize|capture|transaction)/i.test(context);
    const hasOperationalFlow = /(?:store|save|log|send|post|request|payload|body|db\.)/i.test(context);

    if (/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/.test(line) && hasPaymentContext && hasOperationalFlow) {
      cardNumberLines.push(i + 1);
    }
    if (/credit.?card|card.?number|ccn|pan\b|cardNumber/i.test(line) && !/mask|redact|encrypt|hash|tokenize|\*{4}/i.test(line) && hasPaymentContext && hasOperationalFlow) {
      cardNumberLines.push(i + 1);
    }
  });
  if (cardNumberLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Credit card data handling detected",
      description: "Credit card numbers must never be stored in plain text. PCI DSS requires tokenization, encryption, or use of a payment processor.",
      lineNumbers: [...new Set(cardNumberLines)],
      recommendation: "Use a PCI-compliant payment processor (Stripe, Braintree). Never store, log, or transmit raw card numbers. Tokenize immediately.",
      reference: "PCI DSS Requirement 3: Protect Stored Cardholder Data",
    });
  }

  // Detect HIPAA-relevant health data
  const healthDataLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:diagnosis|medical_record|health_condition|prescription|treatment|patient_id|medical_history|lab_result)/i.test(line) && !/encrypt|hipaa|protected|phi\b/i.test(line)) {
      healthDataLines.push(i + 1);
    }
  });
  if (healthDataLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Protected Health Information without HIPAA safeguards",
      description: "Health-related data fields detected without encryption or HIPAA compliance markers. PHI requires special handling under HIPAA.",
      lineNumbers: healthDataLines,
      recommendation: "Encrypt PHI at rest and in transit. Implement access controls, audit logging, and ensure BAA with cloud providers.",
      reference: "HIPAA Security Rule / 45 CFR Part 164",
    });
  }

  // Detect right-to-delete / data erasure gaps
  const deleteEndpointExists = /delete.*user|erase.*data|remove.*account|right.?to.?delete|gdpr.*delete|data.?erasure/i.test(code);
  const storesUserData = /(?:save|create|insert)\s*\(.*(?:user|customer|profile|account)/i.test(code);
  if (storesUserData && !deleteEndpointExists) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No data deletion/erasure capability detected",
      description: "User data is stored but no deletion mechanism exists. GDPR and CCPA require the ability to delete personal data on request.",
      recommendation: "Implement a user data deletion endpoint that cascades across all storage systems (DB, cache, backups, third parties).",
      reference: "GDPR Article 17: Right to Erasure / CCPA Right to Delete",
    });
  }

  // Detect cookie handling without SameSite/Secure flags
  const cookieLines: number[] = [];
  lines.forEach((line, i) => {
    if (/set-cookie|setCookie|cookie\s*\(/i.test(line) && !/sameSite|secure|httpOnly/i.test(line)) {
      cookieLines.push(i + 1);
    }
  });
  if (cookieLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Cookies set without security flags",
      description: "Cookies are set without SameSite, Secure, or HttpOnly flags, which may violate security compliance standards.",
      lineNumbers: cookieLines,
      recommendation: "Set Secure, HttpOnly, and SameSite=Strict on sensitive cookies. Review cookie consent requirements per jurisdiction.",
      reference: "OWASP Cookie Security / ePrivacy Directive",
    });
  }

  // Detect age verification gaps
  const ageRelatedLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:age|date.?of.?birth|dob|birthdate|birth_date|minor|child|under.?13|under.?16|coppa)/i.test(line)) {
      ageRelatedLines.push(i + 1);
    }
  });
  const hasAgeVerification = /age.?verif|age.?check|age.?gate|is.?minor|is.?adult|minimum.?age/i.test(code);
  if (ageRelatedLines.length > 0 && !hasAgeVerification) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Age-related data without verification mechanism",
      description: "Code references age or date of birth but has no age verification mechanism. COPPA, GDPR (under 16), and other laws require special handling for minors.",
      lineNumbers: ageRelatedLines.slice(0, 5),
      recommendation: "Implement age verification and parental consent flows for users under the applicable age threshold.",
      reference: "COPPA / GDPR Article 8 / Age Appropriate Design Code",
    });
  }

  // Detect audit trail gaps for regulated operations
  const regulatedOpLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:transfer|payment|withdrawal|approve|sign|certify|authorize|attest)\s*[=(]/i.test(line)) {
      regulatedOpLines.push(i + 1);
    }
  });
  const hasAuditTrail = /audit|auditLog|audit_log|audit_trail|compliance_log/i.test(code);
  if (regulatedOpLines.length > 0 && !hasAuditTrail) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Regulated operations without audit trail",
      description: "Financial or approval operations detected without audit logging. SOX, SOC2, and financial regulations require complete audit trails.",
      lineNumbers: regulatedOpLines.slice(0, 5),
      recommendation: "Implement immutable audit logging for all regulated operations. Log who, what, when, and the outcome.",
      reference: "SOX Compliance / SOC2 Trust Criteria",
    });
  }

  return findings;
}
