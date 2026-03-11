import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, testCode, looksLikeIaCSecretValue } from "./shared.js";
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

  // Detect YAML IaC content (Docker Compose, Kubernetes manifests)
  const isYamlIaC = lang === "unknown" && (/^\s*(?:apiVersion|kind)\s*:/m.test(code) || /^\s*services\s*:/m.test(code));

  // Skip non-IaC languages entirely (allow YAML IaC through)
  if (!LP.isIaC(lang) && !isYamlIaC) return findings;

  // ── IAC-001: Hardcoded secrets / passwords / keys ─────────────────────
  const rawSecretLines = getLangLineNumbers(code, language, LP.IAC_HARDCODED_SECRET);
  // Post-filter: reject lines where the matched value is a boolean-string,
  // enum identifier, or known non-secret config value (e.g., 'false',
  // 'GuestAttestation', 'SystemAssigned').
  const codeLines = code.split("\n");
  const secretLines = rawSecretLines.filter((ln) => {
    const line = codeLines[ln - 1] ?? "";
    // Extract the quoted value from the IaC property assignment
    const valMatch =
      /(?:password|secret|key|token|apiKey|accessKey|connectionString|api_key|access_key|secret_key|connection_string|value)\s*[:=]\s*['"]([^'"]+)['"]/i.exec(
        line,
      );
    if (!valMatch) return true; // keep if we can't parse — let it through
    return looksLikeIaCSecretValue(valMatch[1]);
  });
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
  const openNetLinesRaw = getLangLineNumbers(code, language, LP.IAC_OPEN_NETWORK);
  // Filter out egress rules — allowing all outbound traffic (0.0.0.0/0)
  // in egress blocks is standard practice and not a security concern.
  const iacLines = code.split("\n");
  const openNetLines = openNetLinesRaw.filter((ln) => {
    // Look backwards from the flagged line for an enclosing egress block
    for (let j = ln - 2; j >= 0 && j >= ln - 15; j--) {
      const prev = iacLines[j]?.trim();
      if (!prev) continue;
      if (/^egress\s*\{/i.test(prev) || prev === "egress {") return false;
      // Stop searching if we hit another block type
      if (/^(?:ingress|resource|data)\s*[\s{("]/i.test(prev)) break;
    }
    return true;
  });
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
    const hasModuleOrVariable = testCode(code, /(?:variable\s+"|module\s+"|param\s+|var\s+\w+\s*=|"parameters"\s*:)/i);
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
    const hasRequiredProviders = testCode(code, /required_providers\s*\{/i);
    const hasProvider = testCode(code, /provider\s+"[^"]+"\s*\{/i);
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
    const hasBackend = testCode(code, /backend\s+"[^"]+"\s*\{/i);
    const hasTerraformBlock = testCode(code, /terraform\s*\{/i);
    // Reusable modules define variables/outputs but not backends — skip
    const isTerraformModule = /\bvariable\s+"[^"]+"\s*\{/i.test(code) && !/\bprovider\s+"[^"]+"\s*\{/i.test(code);
    if (hasTerraformBlock && !hasBackend && !isTerraformModule) {
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
        // Skip resource-name parameters where "key"/"secret"/"token" is part of a
        // compound resource name (e.g., keyVaultName, keyVaultUri, secretName,
        // tokenServiceUrl) — these hold identifiers, not secrets.
        if (/param\s+\w*(?:Name|Uri|Url|Endpoint|Id|ResourceGroup|Location|Sku|Region|Type)\s+string/i.test(line)) {
          continue;
        }
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

  // ── IAC-016: Docker-specific: privileged mode, USER directive, secrets ─
  if (lang === "dockerfile") {
    const dockerLines = code.split("\n");
    const privilegedLines: number[] = [];
    const dockerSecretEnvLines: number[] = [];
    let hasUserDirective = false;

    for (let i = 0; i < dockerLines.length; i++) {
      const line = dockerLines[i];
      // Detect --privileged flag in RUN docker commands
      if (/--privileged/i.test(line)) {
        privilegedLines.push(i + 1);
      }
      // Detect USER directive (means container changes user)
      if (/^\s*USER\s+/i.test(line)) {
        hasUserDirective = true;
      }
      // Detect secrets in ENV directives
      if (/^\s*ENV\s+\w*(?:password|passwd|pwd|secret|api_?key|token|private_key|db_pass)\w*[\s=]+/i.test(line)) {
        if (!/\$\{?\w+\}?/.test(line)) {
          dockerSecretEnvLines.push(i + 1);
        }
      }
    }

    if (privilegedLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Docker container running in privileged mode",
        description:
          "The --privileged flag gives the container full access to the host, effectively disabling all security boundaries. A compromised container can take over the host.",
        lineNumbers: privilegedLines,
        recommendation:
          "Remove --privileged. Use specific capabilities (--cap-add) only for what is needed. Use securityContext.privileged: false in Kubernetes.",
        reference: "CIS Docker Benchmark: Container Runtime Security",
        suggestedFix:
          "Remove --privileged and use granular capabilities: docker run --cap-add NET_ADMIN instead of --privileged.",
        confidence: 0.95,
      });
    }

    // Only flag missing USER if the Dockerfile has RUN commands (not just a trivial FROM)
    const hasRunCmd = /^\s*RUN\s+/im.test(code);
    if (hasRunCmd && !hasUserDirective && dockerLines.length > 5) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Docker container running as root",
        description:
          "No USER directive found — the container runs as root by default. If compromised, the attacker has root privileges inside the container.",
        recommendation:
          "Add a USER directive to run as a non-root user: USER 1001 or USER appuser. Create the user in a preceding RUN step.",
        reference: "CIS Docker Benchmark: Container Security",
        suggestedFix: "Add before the final CMD/ENTRYPOINT: RUN adduser -D appuser && USER appuser",
        confidence: 0.8,
      });
    }

    if (dockerSecretEnvLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Secrets exposed in Dockerfile ENV directive",
        description:
          "Secrets are hardcoded in ENV directives. These values are baked into the image layer and visible to anyone who can pull the image.",
        lineNumbers: dockerSecretEnvLines,
        recommendation:
          "Use Docker secrets, build-time ARG with --secret, or inject secrets at runtime via environment variables from the orchestrator.",
        reference: "CIS Docker Benchmark: Image Security",
        suggestedFix:
          "Remove hardcoded secrets from ENV. Use runtime injection: docker run -e SECRET_KEY=$SECRET_KEY or Docker secrets.",
        confidence: 0.9,
      });
    }
  }

  // ── IAC-020: Terraform S3 public ACL / public access blocks ───────────
  if (lang === "terraform") {
    const s3PublicLines: number[] = [];
    const tfLines = code.split("\n");
    for (let i = 0; i < tfLines.length; i++) {
      const line = tfLines[i];
      // S3 bucket with public-read or public-read-write ACL
      if (/acl\s*=\s*["']public-read(?:-write)?["']/i.test(line)) {
        s3PublicLines.push(i + 1);
      }
      // S3 public access block explicitly disabled
      if (
        /block_public_acls\s*=\s*false|block_public_policy\s*=\s*false|ignore_public_acls\s*=\s*false|restrict_public_buckets\s*=\s*false/i.test(
          line,
        )
      ) {
        s3PublicLines.push(i + 1);
      }
    }
    if (s3PublicLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "S3 bucket with public access enabled",
        description:
          "S3 bucket has a public ACL or public access block settings are disabled, allowing anyone on the internet to access the bucket contents.",
        lineNumbers: s3PublicLines,
        recommendation:
          "Set acl to 'private' and enable all public access block settings. Use bucket policies for controlled access.",
        reference: "CIS AWS Benchmark: S3 Bucket Security",
        suggestedFix:
          'Set acl = "private" and configure aws_s3_bucket_public_access_block with block_public_acls = true, block_public_policy = true.',
        confidence: 0.95,
      });
    }
  }

  // ── YAML IaC: Docker Compose and Kubernetes manifests ─────────────────
  if (isYamlIaC) {
    const yamlLines = code.split("\n");
    const yamlSecretLines: number[] = [];
    const yamlPrivilegedLines: number[] = [];

    for (let i = 0; i < yamlLines.length; i++) {
      const line = yamlLines[i];

      // Detect privileged containers (Docker Compose + K8s)
      if (/^\s*privileged\s*:\s*true/i.test(line)) {
        yamlPrivilegedLines.push(i + 1);
      }
      // network_mode: host (Docker Compose)
      if (/^\s*network_mode\s*:\s*['"]?host['"]?/i.test(line)) {
        yamlPrivilegedLines.push(i + 1);
      }
      // allowPrivilegeEscalation: true (K8s)
      if (/^\s*allowPrivilegeEscalation\s*:\s*true/i.test(line)) {
        yamlPrivilegedLines.push(i + 1);
      }

      // Hardcoded secrets in YAML environment variables
      // Docker Compose: PASSWORD=value or KEY: value patterns
      if (/(?:PASSWORD|SECRET|API_KEY|ACCESS_KEY|PRIVATE_KEY|TOKEN)\s*[:=]\s*["']?\w{3,}/i.test(line)) {
        // Exclude references to external secrets (${{ secrets.XXX }}) and variables (${VAR})
        if (!/\$\{[{]?\s*(?:secrets\.|\w+\s*$)|valueFrom/i.test(line)) {
          yamlSecretLines.push(i + 1);
        }
      }
      // K8s env value: "plaintext-password" pattern
      if (/^\s*value\s*:\s*["'](?![\s"']*$)\S+/i.test(line)) {
        const ctx = yamlLines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (/\bname\s*:\s*\S*(?:PASSWORD|SECRET|KEY|TOKEN)\b/i.test(ctx)) {
          yamlSecretLines.push(i + 1);
        }
      }
    }

    if (yamlPrivilegedLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Container running in privileged mode",
        description:
          "Containers are configured with elevated privileges (privileged: true, host networking, or privilege escalation). A compromised container can take over the host.",
        lineNumbers: yamlPrivilegedLines,
        recommendation:
          "Remove privileged: true. Use specific securityContext options only as needed. Avoid host networking.",
        reference: "CIS Docker/Kubernetes Benchmark: Container Security",
        suggestedFix:
          "Set privileged: false, allowPrivilegeEscalation: false, and use read-only root filesystem where possible.",
        confidence: 0.95,
      });
    }

    if (yamlSecretLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Hardcoded secrets in YAML infrastructure code",
        description:
          "Passwords, API keys, or secrets are hardcoded in Docker Compose or Kubernetes manifests. These values are stored in version control and visible to anyone with repository access.",
        lineNumbers: yamlSecretLines,
        recommendation:
          "Use secrets management: Docker secrets, Kubernetes Secrets with external secret operators, or reference environment variables from a secure vault.",
        reference: "CIS Benchmark: Secrets Management",
        suggestedFix:
          "Replace plaintext values with secret references: use Docker secrets, K8s external-secrets, or environment variable injection from a vault.",
        confidence: 0.9,
      });
    }

    // K8s: runAsNonRoot not set or runAsRoot
    const k8sRootLines: number[] = [];
    for (let i = 0; i < yamlLines.length; i++) {
      const line = yamlLines[i];
      if (/^\s*runAsNonRoot\s*:\s*false/i.test(line)) {
        k8sRootLines.push(i + 1);
      }
      if (/^\s*runAsUser\s*:\s*0\b/i.test(line)) {
        k8sRootLines.push(i + 1);
      }
    }
    if (k8sRootLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Kubernetes container running as root user",
        description:
          "Container security context allows running as root (runAsNonRoot: false or runAsUser: 0). A compromised container running as root increases the blast radius.",
        lineNumbers: k8sRootLines,
        recommendation:
          "Set runAsNonRoot: true and specify a non-zero runAsUser in the pod or container securityContext.",
        reference: "CIS Kubernetes Benchmark: Pod Security",
        suggestedFix: "Add to securityContext: runAsNonRoot: true, runAsUser: 1000, readOnlyRootFilesystem: true.",
        confidence: 0.9,
      });
    }

    // K8s: missing resource limits
    const hasContainers = /^\s*containers\s*:/m.test(code);
    const hasLimits = /^\s*limits\s*:/m.test(code);
    if (hasContainers && !hasLimits) {
      const containerLineNums: number[] = [];
      for (let i = 0; i < yamlLines.length; i++) {
        if (
          /^\s*-\s*name\s*:/i.test(yamlLines[i]) &&
          /containers/i.test(yamlLines.slice(Math.max(0, i - 5), i).join("\n"))
        ) {
          containerLineNums.push(i + 1);
        }
      }
      if (containerLineNums.length > 0) {
        findings.push({
          ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
          severity: "medium",
          title: "Kubernetes container without resource limits",
          description:
            "Containers do not specify resource limits (CPU/memory). Without limits, a runaway container can starve other workloads and cause node instability.",
          lineNumbers: containerLineNums.slice(0, 5),
          recommendation:
            "Set resources.limits.cpu and resources.limits.memory for every container to prevent resource exhaustion.",
          reference: "CIS Kubernetes Benchmark: Resource Management",
          suggestedFix:
            "Add resources: { limits: { cpu: '500m', memory: '256Mi' }, requests: { cpu: '100m', memory: '128Mi' } }.",
          confidence: 0.75,
        });
      }
    }

    // K8s: readOnlyRootFilesystem not set
    const hasReadOnly = /readOnlyRootFilesystem\s*:\s*true/m.test(code);
    if (hasContainers && !hasReadOnly) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Container filesystem is writable",
        description:
          "Kubernetes containers do not set readOnlyRootFilesystem: true. A writable filesystem allows attackers to install malicious tools or modify binaries.",
        recommendation:
          "Set securityContext.readOnlyRootFilesystem: true and use emptyDir volumes for paths that need writes.",
        reference: "CIS Kubernetes Benchmark: Container Security",
        suggestedFix:
          "Add to container securityContext: readOnlyRootFilesystem: true. Mount emptyDir for /tmp and other writable paths.",
        confidence: 0.7,
        isAbsenceBased: true,
      });
    }
  }

  // ── IAC: Missing resource tags ────────────────────────────────────────
  if (lang === "terraform") {
    const hasResources = /resource\s+"[^"]+"\s+"[^"]+"\s*\{/i.test(code);
    const hasTags = /tags\s*=\s*\{/i.test(code) || /tags\s*=\s*merge\(/i.test(code) || /default_tags\s*\{/i.test(code);
    // Count distinct resource blocks — skip on small configs with ≤3 resources
    const resourceCount = (code.match(/resource\s+"[^"]+"\s+"[^"]+"\s*\{/gi) || []).length;
    if (hasResources && !hasTags && resourceCount >= 4) {
      const resourceDefLines: number[] = [];
      const tfLines2 = code.split("\n");
      for (let i = 0; i < tfLines2.length; i++) {
        if (/resource\s+"[^"]+"\s+"[^"]+"\s*\{/i.test(tfLines2[i])) {
          resourceDefLines.push(i + 1);
        }
      }
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Resources without tags",
        description:
          "Terraform resources are defined without tags. Tags are essential for cost tracking, ownership, environment identification, and automated governance.",
        lineNumbers: resourceDefLines.slice(0, 5),
        recommendation:
          "Add a tags block to all resources. Use a common set of tags (environment, owner, project, cost-center) and consider using default_tags in the provider block.",
        reference: "Cloud Best Practices: Resource Tagging",
        suggestedFix:
          'Add tags = { Environment = var.environment, Project = var.project, Owner = var.owner, ManagedBy = "Terraform" } to each resource.',
        confidence: 0.7,
      });
    }
  }

  // ── IAC: Managed identity not used (password-based auth in IaC) ─────
  if (lang === "terraform" || lang === "bicep" || lang === "arm") {
    const passwordAuthLines: number[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/admin_username\s*=|administratorLogin\s*[:=]/i.test(line)) {
        const ctx = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
        if (/admin_password\s*=|administratorLoginPassword\s*[:=]/i.test(ctx) && !/identity\s*[:={]/i.test(ctx)) {
          passwordAuthLines.push(i + 1);
        }
      }
    }
    if (passwordAuthLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Password-based authentication without managed identity",
        description:
          "Resources use admin username/password authentication without a managed identity configured. Managed identities eliminate the need for credential management and rotation.",
        lineNumbers: passwordAuthLines,
        recommendation:
          "Configure a system-assigned or user-assigned managed identity and use Azure AD/Entra ID authentication where supported.",
        reference: "Azure Well-Architected Framework: Identity",
        suggestedFix:
          lang === "terraform"
            ? 'Add identity { type = "SystemAssigned" } to the resource and use Azure AD authentication.'
            : "Add identity: { type: 'SystemAssigned' } and configure Azure AD authentication.",
        confidence: 0.75,
      });
    }
  }

  // ── IAC: Database firewall allows all Azure services ──────────────────
  if (lang === "terraform" || lang === "bicep" || lang === "arm") {
    const allAzureLines: number[] = [];
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // "Allow all Azure services" firewall rule: start=0.0.0.0 end=0.0.0.0
      if (/start_ip_address\s*=\s*["']0\.0\.0\.0/i.test(line) || /startIpAddress\s*[:=]\s*['"]0\.0\.0\.0/i.test(line)) {
        const ctx = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
        if (/end_ip_address\s*=\s*["']0\.0\.0\.0/i.test(ctx) || /endIpAddress\s*[:=]\s*['"]0\.0\.0\.0/i.test(ctx)) {
          allAzureLines.push(i + 1);
        }
      }
    }
    if (allAzureLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Database firewall allows all Azure services",
        description:
          "A firewall rule with start and end IP of 0.0.0.0 allows any Azure service (including other tenants) to access the database. This is overly permissive.",
        lineNumbers: allAzureLines,
        recommendation:
          "Remove the 'Allow Azure services' rule and use private endpoints or VNet service endpoints for secure connectivity.",
        reference: "CIS Azure Benchmark: Database Security",
        suggestedFix:
          "Remove the 0.0.0.0-0.0.0.0 firewall rule and configure a private endpoint for the database instead.",
        confidence: 0.85,
      });
    }
  }

  // ── IAC: Dockerfile ADD instead of COPY ───────────────────────────────
  if (lang === "dockerfile") {
    const addLines: number[] = [];
    const dockerLines2 = code.split("\n");
    for (let i = 0; i < dockerLines2.length; i++) {
      const line = dockerLines2[i];
      if (
        /^\s*ADD\s+/i.test(line) &&
        !/^\s*ADD\s+https?:\/\//i.test(line) &&
        !/\.tar|\.gz|\.tgz|\.bz2|\.xz/i.test(line)
      ) {
        addLines.push(i + 1);
      }
    }
    if (addLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Dockerfile uses ADD instead of COPY",
        description:
          "The ADD instruction has implicit tar extraction and remote URL fetching that can introduce unexpected behavior. COPY is more explicit and predictable.",
        lineNumbers: addLines,
        recommendation:
          "Use COPY instead of ADD for local file copies. Only use ADD when you specifically need tar auto-extraction or remote URL downloading.",
        reference: "Dockerfile Best Practices: COPY vs ADD",
        suggestedFix: "Replace ADD with COPY for simple file copies: COPY ./app /app instead of ADD ./app /app.",
        confidence: 0.8,
      });
    }

    // Dockerfile: latest tag in FROM
    const latestTagLines: number[] = [];
    for (let i = 0; i < dockerLines2.length; i++) {
      const line = dockerLines2[i];
      if (
        /^\s*FROM\s+\S+:latest\b/i.test(line) ||
        (/^\s*FROM\s+\S+\s/i.test(line) && !/:/i.test(line.split(/\s+/)[1] ?? ""))
      ) {
        latestTagLines.push(i + 1);
      }
    }
    if (latestTagLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Dockerfile FROM uses latest or untagged image",
        description:
          "Using :latest or untagged base images leads to non-reproducible builds. The image content can change unexpectedly between builds.",
        lineNumbers: latestTagLines,
        recommendation:
          "Pin base images to a specific version tag or digest: FROM node:20-alpine instead of FROM node:latest.",
        reference: "Dockerfile Best Practices: Image Pinning",
        suggestedFix:
          "Pin the image version: FROM node:20-alpine or FROM node@sha256:abc123... for maximum reproducibility.",
        confidence: 0.85,
      });
    }
  }

  return findings;
}
