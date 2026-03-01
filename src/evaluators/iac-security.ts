import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

/**
 * Deterministic evaluator for Infrastructure as Code (Terraform, Bicep, ARM).
 *
 * Detects security misconfigurations, hardcoded secrets, missing encryption,
 * overly permissive network/IAM rules, and IaC best-practice violations.
 */
export function analyzeIacSecurity(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "IAC";
  const lang = getLangFamily(language);

  // Skip non-IaC languages entirely
  if (!LP.isIaC(lang)) return findings;

  // ── IAC-001: Hardcoded secrets / passwords / keys ─────────────────────
  const secretLines = getLangLineNumbers(code, language, LP.IAC_HARDCODED_SECRET);
  if (secretLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded secrets in infrastructure code",
      description:
        "Passwords, API keys, or secrets are hardcoded directly in IaC definitions. These values are stored in version control and visible to anyone with repository access.",
      lineNumbers: secretLines,
      recommendation:
        "Use a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) or reference secrets via variables/parameters that are injected at deployment time. Never commit plaintext secrets.",
      reference: "CIS Benchmark: Secrets Management",
      suggestedFix:
        lang === "terraform"
          ? "Replace the hardcoded value with a variable reference: `var.admin_password` and mark it `sensitive = true`."
          : lang === "bicep"
            ? "Use a `@secure()` parameter decorator: `@secure() param adminPassword string` and pass via Key Vault reference."
            : 'Use a Key Vault reference in ARM parameters: `"reference": { "keyVault": { "id": "..." }, "secretName": "..." }`.',
      confidence: 0.95,
    });
  }

  // ── IAC-002: Missing encryption at rest ───────────────────────────────
  const encryptionLines = getLangLineNumbers(code, language, LP.IAC_MISSING_ENCRYPTION);
  if (encryptionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Encryption at rest disabled",
      description:
        "One or more resources have encryption at rest explicitly disabled. Data stored without encryption is vulnerable to unauthorized access if storage media is compromised.",
      lineNumbers: encryptionLines,
      recommendation:
        "Enable encryption at rest for all storage resources. Use platform-managed keys (PMK) at minimum, or customer-managed keys (CMK) via Key Vault for stronger control.",
      reference: "CIS Azure/AWS Benchmark: Encryption at Rest",
      suggestedFix:
        lang === "terraform"
          ? "Set `encryption_at_rest_enabled = true` or remove the property to use the secure default."
          : lang === "bicep"
            ? "Set `encryption: { status: 'Enabled' }` or use the default (enabled)."
            : 'Set `"encryption": { "status": "Enabled" }` in the resource properties.',
      confidence: 0.9,
    });
  }

  // ── IAC-003: Missing HTTPS / TLS enforcement ──────────────────────────
  const httpsLines = getLangLineNumbers(code, language, LP.IAC_MISSING_HTTPS);
  if (httpsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "HTTPS/TLS not enforced",
      description:
        "Transport security is not enforced — HTTP traffic is allowed or TLS minimum version is set below 1.2. Data in transit is vulnerable to interception and man-in-the-middle attacks.",
      lineNumbers: httpsLines,
      recommendation:
        "Enforce HTTPS-only communication and set minimum TLS version to 1.2 or higher. Disable plaintext HTTP listeners.",
      reference: "CIS Benchmark: Data in Transit / TLS Configuration",
      suggestedFix:
        lang === "terraform"
          ? 'Set `https_only = true` and `min_tls_version = "TLS1_2"`.'
          : lang === "bicep"
            ? "Set `httpsOnly: true` and `minTlsVersion: '1.2'`."
            : 'Set `"httpsOnly": true` and `"minTlsVersion": "1.2"` in properties.',
      confidence: 0.9,
    });
  }

  // ── IAC-004: Public access enabled ────────────────────────────────────
  const publicAccessLines = getLangLineNumbers(code, language, LP.IAC_PUBLIC_ACCESS);
  if (publicAccessLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Public access enabled on resource",
      description:
        "One or more resources are configured with public network access enabled. This exposes the resource to the internet and increases the attack surface.",
      lineNumbers: publicAccessLines,
      recommendation:
        "Disable public access and use private endpoints or VNet integration. If public access is required, restrict it with firewall rules or IP allowlists.",
      reference: "CIS Benchmark: Network Security / Private Endpoints",
      suggestedFix:
        lang === "terraform"
          ? "Set `public_network_access_enabled = false` and configure a private endpoint."
          : lang === "bicep"
            ? "Set `publicNetworkAccess: 'Disabled'` and add a private endpoint resource."
            : 'Set `"publicNetworkAccess": "Disabled"` and define a private endpoint resource.',
      confidence: 0.9,
    });
  }

  // ── IAC-005: Overly permissive network rules ──────────────────────────
  const openNetLines = getLangLineNumbers(code, language, LP.IAC_OPEN_NETWORK);
  if (openNetLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Overly permissive network rules (0.0.0.0/0 or wildcard)",
      description:
        "Network security rules allow traffic from any source (0.0.0.0/0) or to any port (*). This effectively disables network-level access control and exposes resources to the entire internet.",
      lineNumbers: openNetLines,
      recommendation:
        "Restrict CIDR blocks to known IP ranges. Use specific port ranges instead of wildcards. Apply the principle of least privilege to all NSG/security group rules.",
      reference: "CIS Benchmark: Network Security Groups",
      suggestedFix:
        lang === "terraform"
          ? 'Replace `cidr_blocks = ["0.0.0.0/0"]` with specific CIDR ranges and restrict port ranges.'
          : lang === "bicep"
            ? "Replace `sourceAddressPrefix: '*'` with specific IP ranges and restrict port ranges."
            : 'Replace `"sourceAddressPrefix": "*"` with specific IP ranges.',
      confidence: 0.95,
    });
  }

  // ── IAC-006: Overly permissive IAM / RBAC ─────────────────────────────
  const iamLines = getLangLineNumbers(code, language, LP.IAC_OVERPERMISSIVE_IAM);
  if (iamLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Overly permissive IAM/RBAC assignment",
      description:
        "IAM policies or role assignments use wildcard permissions ('*') or the Owner built-in role. This grants far more access than needed and violates the principle of least privilege.",
      lineNumbers: iamLines,
      recommendation:
        "Use the most restrictive role that meets the requirement (e.g. Reader, Contributor for specific resource types). Define custom roles with minimal required permissions.",
      reference: "CIS Benchmark: Identity & Access Management",
      suggestedFix:
        lang === "terraform"
          ? 'Replace `actions = ["*"]` with specific permissions like `["Microsoft.Storage/storageAccounts/read"]`.'
          : lang === "bicep"
            ? "Use a scoped role like 'Reader' or 'Storage Blob Data Reader' instead of 'Owner'."
            : 'Replace wildcard `"actions": ["*"]` with specific actions.',
      confidence: 0.9,
    });
  }

  // ── IAC-007: Missing logging / monitoring ─────────────────────────────
  const loggingLines = getLangLineNumbers(code, language, LP.IAC_MISSING_LOGGING);
  if (loggingLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Logging or monitoring disabled",
      description:
        "Diagnostic settings or logging is explicitly disabled on one or more resources. Without logging, security incidents and operational issues cannot be detected or investigated.",
      lineNumbers: loggingLines,
      recommendation:
        "Enable diagnostic settings on all resources. Send logs to a Log Analytics workspace or storage account for retention. Configure alerts for critical events.",
      reference: "CIS Benchmark: Logging & Monitoring",
      suggestedFix:
        lang === "terraform"
          ? "Set `enable_logging = true` and add an `azurerm_monitor_diagnostic_setting` resource."
          : lang === "bicep"
            ? "Add a `Microsoft.Insights/diagnosticSettings` child resource with appropriate log categories enabled."
            : 'Add a `"Microsoft.Insights/diagnosticSettings"` resource linked to a Log Analytics workspace.',
      confidence: 0.85,
    });
  }

  // ── IAC-008: Hardcoded resource locations ──────────────────────────────
  const locationLines = getLangLineNumbers(code, language, LP.IAC_HARDCODED_LOCATION);
  if (locationLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded resource location",
      description:
        "Resource locations are hardcoded to specific Azure/AWS regions instead of being parameterized. This prevents reuse across environments and complicates multi-region deployments.",
      lineNumbers: locationLines,
      recommendation:
        "Use a variable or parameter for the location. In Terraform, use `var.location`. In Bicep, use `param location string = resourceGroup().location`. In ARM, use `[parameters('location')]`.",
      reference: "IaC Best Practices: Parameterization",
      suggestedFix:
        lang === "terraform"
          ? 'Replace the hardcoded location with `var.location` and define `variable "location" { type = string }`.'
          : lang === "bicep"
            ? "Replace the hardcoded location with `location` parameter: `param location string = resourceGroup().location`."
            : "Replace the hardcoded location with `[parameters('location')]` and add a `location` parameter.",
      confidence: 0.85,
    });
  }

  // ── IAC-009: Insecure TLS defaults ────────────────────────────────────
  const insecureDefaultLines = getLangLineNumbers(code, language, LP.IAC_INSECURE_DEFAULT);
  if (insecureDefaultLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Insecure TLS version configured",
      description:
        "TLS minimum version is set to 1.0 or 1.1, both of which are deprecated and vulnerable to known attacks (POODLE, BEAST). Only TLS 1.2+ should be used.",
      lineNumbers: insecureDefaultLines,
      recommendation:
        "Set the minimum TLS version to 1.2. TLS 1.0 and 1.1 are deprecated by RFC 8996 (March 2021) and should not be used.",
      reference: "RFC 8996 / CIS Benchmark: TLS Configuration",
      suggestedFix:
        lang === "terraform"
          ? 'Set `min_tls_version = "TLS1_2"` or `min_tls_version = "1.2"`.'
          : lang === "bicep"
            ? "Set `minTlsVersion: '1.2'`."
            : 'Set `"minTlsVersion": "1.2"`.',
      confidence: 0.9,
    });
  }

  // ── IAC-010: Missing backup / DR configuration ────────────────────────
  const backupLines = getLangLineNumbers(code, language, LP.IAC_MISSING_BACKUP);
  if (backupLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Backup or disaster recovery disabled",
      description:
        "Backup or geo-redundant backup is explicitly disabled. Without backups, data loss from accidental deletion, corruption, or ransomware is irrecoverable.",
      lineNumbers: backupLines,
      recommendation:
        "Enable automated backups with appropriate retention periods. Enable geo-redundant backup for production databases. Test backup restoration regularly.",
      reference: "CIS Benchmark: Backup & Recovery",
      suggestedFix:
        lang === "terraform"
          ? "Set `geo_redundant_backup_enabled = true` and configure backup retention."
          : lang === "bicep"
            ? "Set `geoRedundantBackup: 'Enabled'` and configure backup retention policies."
            : 'Set `"geoRedundantBackup": "Enabled"` in the resource properties.',
      confidence: 0.85,
    });
  }

  // ── IAC-011: Absence — no resource definitions found ──────────────────
  const resourceLines = getLangLineNumbers(code, language, LP.IAC_RESOURCE_DEF);
  if (resourceLines.length === 0 && code.split("\n").length > 5) {
    // Only flag on files that are long enough to plausibly be IaC but define no resources
    // (skip very short files like variable files, module references, etc.)
    const hasModuleOrVariable = /(?:variable\s+"|module\s+"|param\s+|var\s+\w+\s*=|"parameters"\s*:)/i.test(code);
    if (!hasModuleOrVariable) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "info",
        title: "No IaC resource definitions detected",
        description:
          "This file appears to be an IaC file but contains no resource definitions. It may be incomplete or a data-only/variable-only file.",
        recommendation:
          "Verify this file is complete. If it is a variables or locals file, no action is needed. If it should contain infrastructure definitions, add the required resource blocks.",
        reference: "IaC Best Practices: File Organization",
        confidence: 0.5,
      });
    }
  }

  // ── IAC-012: Terraform-specific: no required_providers ────────────────
  if (lang === "terraform") {
    const hasRequiredProviders = /required_providers\s*\{/i.test(code);
    const hasProvider = /provider\s+"[^"]+"\s*\{/i.test(code);
    if (hasProvider && !hasRequiredProviders) {
      const providerLines = getLineNumbers(code, /provider\s+"[^"]+"\s*\{/i);
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Missing required_providers block",
        description:
          "Providers are used but no `required_providers` block specifies version constraints. This can lead to unexpected behavior when provider versions change.",
        lineNumbers: providerLines,
        recommendation:
          'Add a `terraform { required_providers { ... } }` block with version constraints (e.g. `version = "~> 3.0"`).',
        reference: "Terraform Best Practices: Provider Version Constraints",
        suggestedFix:
          'Add `terraform { required_providers { azurerm = { source = "hashicorp/azurerm" version = "~> 3.0" } } }`.',
        confidence: 0.8,
      });
    }
  }

  // ── IAC-013: Terraform-specific: no backend configuration ─────────────
  if (lang === "terraform") {
    const hasBackend = /backend\s+"[^"]+"\s*\{/i.test(code);
    const hasTerraformBlock = /terraform\s*\{/i.test(code);
    if (hasTerraformBlock && !hasBackend) {
      const terraformLines = getLineNumbers(code, /terraform\s*\{/i);
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "No remote backend configured",
        description:
          "Terraform state is stored locally by default. Local state prevents team collaboration, has no locking, and risks data loss.",
        lineNumbers: terraformLines,
        recommendation:
          'Configure a remote backend (e.g. `backend "azurerm"`, `backend "s3"`, or Terraform Cloud) with state locking enabled.',
        reference: "Terraform Best Practices: Remote State",
        suggestedFix:
          'Add `backend "azurerm" { resource_group_name = "..." storage_account_name = "..." container_name = "tfstate" key = "terraform.tfstate" }`.',
        confidence: 0.7,
      });
    }
  }

  // ── IAC-014: Bicep-specific: no @secure() on sensitive parameters ─────
  if (lang === "bicep") {
    const paramLines = code.split("\n");
    for (let i = 0; i < paramLines.length; i++) {
      const line = paramLines[i];
      if (/param\s+\w*(?:password|secret|key|token|connectionString)\w*\s+string/i.test(line)) {
        // Check if the preceding line has @secure()
        const prevLine = i > 0 ? paramLines[i - 1] : "";
        if (!/@secure\(\)/.test(prevLine)) {
          findings.push({
            ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
            severity: "high",
            title: "Sensitive parameter without @secure() decorator",
            description: `Parameter on line ${i + 1} appears to hold a secret but is not decorated with \`@secure()\`. Without this decorator, the value may be logged in deployment history and visible in the Azure portal.`,
            lineNumbers: [i + 1],
            recommendation: "Add the `@secure()` decorator on the line above the parameter declaration.",
            reference: "Bicep Best Practices: Secure Parameters",
            suggestedFix: `Add \`@secure()\` on the line before the parameter: \`@secure()\\nparam ${line.trim()}\`.`,
            confidence: 0.9,
          });
        }
      }
    }
  }

  // ── IAC-015: ARM-specific: parameters with defaultValue for secrets ───
  if (lang === "arm") {
    // Multi-line pattern: match secret param names whose object contains a defaultValue
    const secretParamPattern =
      /"(?:adminPassword|password|secret|key|connectionString)"\s*:\s*\{[^}]*"defaultValue"\s*:\s*"[^"]+"/gis;
    const matches = [...code.matchAll(secretParamPattern)];
    if (matches.length > 0) {
      const lineNums = matches.map((m) => {
        const idx = m.index ?? 0;
        return code.slice(0, idx).split("\n").length;
      });
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "ARM template secret parameter has default value",
        description:
          "Sensitive parameters (passwords, keys) have hardcoded default values in the ARM template. Default values are stored in the template file and visible in version control.",
        lineNumbers: lineNums,
        recommendation:
          'Remove the `defaultValue` from sensitive parameters and use `"type": "securestring"`. Reference secrets from Key Vault in the parameter file.',
        reference: "ARM Template Best Practices: Secure Parameters",
        suggestedFix:
          'Change the parameter type to `"type": "securestring"` and remove the `"defaultValue"` property. Use Key Vault references at deployment time.',
        confidence: 0.95,
      });
    }
  }

  return findings;
}
