import type { Finding } from "../types.js";
import { isCommentLine, isIaCTemplate, isLikelyAnalysisCode, testCode } from "./shared.js";

export function analyzeDataSovereignty(code: string, _language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "SOV";
  let ruleNum = 1;

  // Analysis / evaluator code references sovereignty concepts (KMS, replication,
  // export paths, PII patterns) in regex and string literals — not real violations.
  if (isLikelyAnalysisCode(code)) return findings;

  // Infrastructure-as-Code templates (Bicep, Terraform, ARM) are declarative
  // infrastructure definitions — they enforce jurisdiction via parameter
  // constraints (@allowed, variable validation), not imperative branching.
  // Skip application-code rules that produce false positives on IaC.
  const iacTemplate = isIaCTemplate(code);

  const regionMentionLines: number[] = [];
  const hardcodedGlobalOrForeignLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Skip comment lines — doc blocks describing sovereignty controls are not violations
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    // Skip lines where region patterns appear inside regex literals or test/match calls
    // (analysis/evaluator code referencing patterns, not actual region usage)
    if (/\/[^/\n]+\/[gimsuy]*/.test(line) && /\.test\s*\(|\.match\s*\(|new\s+RegExp/i.test(line)) return;

    if (/region|location|geo|jurisdiction|data.?residen/i.test(line)) {
      regionMentionLines.push(index + 1);
    }

    if (
      /(global|multi-?region|us-|asia-|ap-|worldwide|any-region|default-region)/i.test(line) &&
      !/allow|approved|whitelist|policy|guard|eu-|sovereign/i.test(line)
    ) {
      // Skip Python 'global' scope declarations (e.g., "global my_var") and
      // variable names prefixed/suffixed with 'global' (GLOBAL_CONFIG,
      // global_cache, _global) — these are programming-scope identifiers,
      // not geographic deployment targets.  Do NOT suppress when the line also
      // contains other geographic patterns (us-, asia-, ap-, etc.).
      if (
        /global/i.test(line) &&
        !/multi-?region|us-|asia-|ap-|worldwide|any-region|default-region/i.test(line) &&
        /^\s*global\s+\w+|\bglobal[_.]|[_.]global\b|\bGLOBAL[_A-Z]/i.test(line)
      ) {
        return;
      }
      hardcodedGlobalOrForeignLines.push(index + 1);
    }
  });

  const hasRegionPolicy =
    /allow(ed)?Regions|approvedRegions|regionPolicy|dataResidencyPolicy|sovereignty|approvedJurisdictions|allowedJurisdictions|jurisdictionPolicy|exportPolicy|egressPolicy|jurisdictionGuard|regionConfig|deploymentRegion|regionConstraint|regionAllowlist|regionDenylist|dataLocality|geoFence|geoRestrict/i.test(
      code,
    );

  if (hardcodedGlobalOrForeignLines.length >= 5 && !hasRegionPolicy && !iacTemplate) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Region usage without residency policy guardrails",
      description:
        "Code appears to use global/foreign region patterns without an explicit approved-region policy. This can cause unintentional cross-border storage or processing.",
      lineNumbers: hardcodedGlobalOrForeignLines.slice(0, 10),
      recommendation:
        "Enforce a strict approved-region allowlist and reject deployments/requests outside permitted jurisdictions.",
      reference: "Data Residency Governance / GDPR Chapter V",
      suggestedFix:
        "Add an approved-region allowlist: const ALLOWED_REGIONS = ['eu-west-1', 'eu-central-1']; and validate before deployment/request routing.",
      confidence: 0.85,
    });
  }

  const crossBorderEgressLines: number[] = [];
  // File-level check for jurisdiction gate helpers (e.g., assertAllowedEgress, approvedJurisdictions)
  const hasEgressGate =
    /assertAllowedEgress|approvedJurisdictions|egressPolicy|egressGate|allowedEgress|jurisdictionCheck|checkJurisdiction|validateDestination|transferControl|crossBorder.*check|egress.*guard/i.test(
      code,
    );
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(fetch\(|axios\.|http(s)?:\/\/|webhook|third.?party|external.?api|sendTo|forwardTo)/i.test(line) &&
      !/consent|scc|adequacy|jurisdiction|region|residency|sovereignty|allowedEgress|egressPolicy|egressGate|transferControl/i.test(
        line,
      )
    ) {
      crossBorderEgressLines.push(index + 1);
    }
  });

  // Only flag cross-border egress when the code actually handles personal or
  // sensitive data.  Modules that exclusively fetch read-only reference content
  // (e.g., regulation text loaders, documentation fetchers) have no personal-data
  // export risk.
  const handlesPersonalData =
    /(?:user|customer|patient|email|phone|ssn|passport|payment|credit.?card|personal.?data|\bpii\b|sensitive|address|profile|account|identity|subscriber)/i.test(
      code,
    );
  if (crossBorderEgressLines.length >= 5 && !hasEgressGate && handlesPersonalData) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential cross-border data egress without jurisdiction checks",
      description:
        "External API/network calls are present without visible jurisdictional or transfer controls, increasing cross-border data transfer risk.",
      lineNumbers: crossBorderEgressLines.slice(0, 10),
      recommendation:
        "Add egress controls that validate destination jurisdiction, data classification, and lawful transfer conditions before sending data.",
      reference: "GDPR Articles 44-49 / Cross-Border Transfer Controls",
      suggestedFix:
        "Add egress validation: if (!approvedJurisdictions.includes(getDestinationRegion(url))) throw new SovereigntyError('Cross-border transfer blocked');",
      confidence: 0.8,
    });
  }

  const replicationLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(\breplica\b|replication|backup|\bdr\b|disaster.?recovery|geo-?redundant|read.?replica)/i.test(line) &&
      !/same.?region|region.?locked|sovereign|local.?zone/i.test(line)
    ) {
      replicationLines.push(index + 1);
    }
  });

  if (replicationLines.length > 0 && !iacTemplate) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Replication/backup configuration may violate localization requirements",
      description:
        "Replication or backup behavior is referenced without explicit geography constraints, which can replicate regulated data to unauthorized regions.",
      lineNumbers: replicationLines.slice(0, 10),
      recommendation:
        "Pin replication and backup targets to approved jurisdictions and document DR geography constraints.",
      reference: "Data Localization Controls / Operational Resilience",
      suggestedFix:
        "Pin replicas to approved regions: replication: { regions: ALLOWED_REGIONS } and add sovereignty tags to backup configurations.",
      confidence: 0.85,
    });
  }
  // Frontend/browser code — keywords like analytics, report, download in UI
  // rendering or event handling are not data-export operations.
  const isFrontendCode =
    /document\.|window\.|addEventListener|querySelector|getElementById|innerHTML|createElement|\.classList|\.style\b|ReactDOM|createRoot|hydrateRoot|React\.|useState|useEffect|angular|Vue\.|createApp|\$\(|jQuery/i.test(
      code,
    );
  const exportLines: number[] = [];
  let inMultiLineString = false;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Track Python multi-line strings (""" / ''') so that docstring body
    // lines mentioning "export", "report", etc. are not mistaken for real
    // data-export code paths.
    const tripleQuotes = (trimmed.match(/"""|'''/g) || []).length;
    if (inMultiLineString) {
      if (tripleQuotes % 2 === 1) inMultiLineString = false;
      return; // skip lines inside multi-line strings
    }
    if (tripleQuotes === 1) {
      inMultiLineString = true;
      return;
    }
    if (tripleQuotes >= 2) return; // single-line docstring — skip entirely

    // Skip comment lines — doc blocks describing export policy are not real export paths
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    // Skip JS/TS export keyword declarations (export const, export function, etc.)
    if (/^\s*export\s+(default\s+)?(const|let|var|function|class|interface|type|enum|abstract|async)\b/i.test(line))
      return;
    // Skip JS/TS named re-exports and barrel aggregations (export { ... } from '...')
    if (/^\s*export\s*\{/.test(line)) return;
    // Skip env-var / config references that merely name a region or setting
    if (/process\.env\.|import\s|require\s*\(|getenv|os\.environ/i.test(line)) return;
    // Skip multi-line import continuation lines (identifiers inside import { ... } blocks)
    if (/^\s*[A-Za-z_$][A-Za-z0-9_$]*,?\s*$/.test(line)) return;
    // Skip lines where 'export' only appears as part of an identifier (e.g., getExportRegion, isExportAllowed)
    if (/export/i.test(line) && !/(?<![a-zA-Z0-9_])export(?![a-zA-Z0-9_])/i.test(line)) return;
    // Skip lines where trigger words appear only inside compound identifiers
    // (e.g., "UncertaintyReportV2" or "DownloadManager" — type names, not data exports)
    if (
      /(export|download|dump|report|analytics|telemetry|support.?bundle)/i.test(line) &&
      !/(^|[^a-zA-Z])(export|download|dump|report|analytics|telemetry|support.?bundle)([^a-zA-Z]|$)/i.test(line)
    )
      return;
    if (
      /(export|download|dump|report|analytics|telemetry|support.?bundle)/i.test(line) &&
      !/redact|anonym|aggregate|jurisdiction|policy|allowed|blocked|guard|check|validate/i.test(line)
    ) {
      // Skip standard serialization library dump/dumps calls — json.dumps(),
      // pickle.dump(), yaml.dump(), etc. are in-memory or local-file
      // serialization primitives, not cross-border data export operations.
      if (/(?:json|pickle|yaml|toml|msgpack|marshal|csv|pprint)\.(?:dumps?|dump_all)\s*\(/i.test(line)) {
        return;
      }
      exportLines.push(index + 1);
    }
  });

  // Check for centralized sovereignty response handler at file level
  const hasCentralizedSovereignResponse =
    /finalizeSovereignResponse|sovereignResponse|responseFinalize|exportFinalize|sovereigntyCheck|applySovereigntyControls|sovereigntyMiddleware|sovereigntyGuard/i.test(
      code,
    );

  if (exportLines.length > 0 && !hasCentralizedSovereignResponse && !isFrontendCode && !iacTemplate) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Data export path without sovereignty-aware controls",
      description:
        "Export/reporting flows appear without visible controls for jurisdiction, minimization, or anonymization, increasing sovereignty and transfer risk.",
      lineNumbers: exportLines.slice(0, 10),
      recommendation:
        "Apply policy checks to export paths (region eligibility, minimization, anonymization) and block disallowed exports.",
      reference: "Data Governance / Transfer Risk Mitigation",
      suggestedFix:
        "Gate export paths with policy checks: if (!exportPolicy.isAllowed(dataClass, targetRegion)) throw new Error('Export blocked by sovereignty policy');",
      confidence: 0.8,
    });
  }

  const geoRoutingSignals = testCode(code, /(country|locale|region|jurisdiction|tenantRegion|dataBoundary)/i);
  const hasPolicyEnforcement = testCode(code, /(deny|reject|throw|forbidden|policyViolation|residencyViolation)/i);

  // Skip jurisdiction enforcement for HTML/markup files — mentions of
  // "jurisdiction" or "region" in privacy text are legal disclosures, not code
  // branches that need enforcement logic.
  const isMarkupFile = /^\s*<(!DOCTYPE|html|head|body|meta|link)/im.test(code);
  if (regionMentionLines.length > 0 && geoRoutingSignals && !hasPolicyEnforcement && !isMarkupFile && !iacTemplate) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Jurisdiction context present without explicit enforcement branch",
      description:
        "Code references region/jurisdiction context but does not clearly enforce deny/allow behavior when rules are violated.",
      lineNumbers: regionMentionLines.slice(0, 10),
      recommendation:
        "Implement explicit enforcement branches that block operations violating residency or transfer policy.",
      reference: "Policy-as-Code Enforcement Best Practices",
      suggestedFix:
        "Add enforcement branches: if (region !== allowedRegion) { throw new PolicyViolationError('Data residency violation'); } before data operations.",
      confidence: 0.75,
    });
  }

  // CDN or third-party asset loading from external origins
  const cdnLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(?:cdn\.|cloudflare|unpkg|jsdelivr|cdnjs|googleapis|bootstrapcdn|cloudfront|akamai|maxcdn|stackpath)/i.test(
        line,
      ) &&
      !/integrity\s*=|crossorigin|nonce|hash/i.test(line)
    ) {
      cdnLines.push(index + 1);
    }
  });

  if (cdnLines.length > 0 && !hasRegionPolicy) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "External CDN/third-party assets loaded without integrity checks",
      description:
        "Code loads assets from external CDN origins without Subresource Integrity (SRI) hashes or approved-origin policies. These assets are served from globally distributed infrastructure whose data processing locations may not comply with sovereignty requirements.",
      lineNumbers: cdnLines.slice(0, 10),
      recommendation:
        "Add SRI integrity attributes for CDN-loaded scripts/styles. Maintain an approved CDN origin allowlist. Consider self-hosting critical assets within sovereign infrastructure.",
      reference: "Subresource Integrity (SRI) / Data Sovereignty Asset Controls",
      suggestedFix:
        "Add SRI hashes to CDN assets: <script src='cdn-url' integrity='sha384-...' crossorigin='anonymous'> and maintain an approved CDN origin allowlist.",
      confidence: 0.85,
    });
  }

  // Telemetry / analytics to external services
  const telemetryLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(?:google.?analytics|gtag|mixpanel|segment|amplitude|hotjar|heap|fullstory|posthog|sentry|datadog|newrelic|appinsights|applicationinsights|bugsnag|rollbar|logrocket)/i.test(
        line,
      ) &&
      !/dsn.*localhost|endpoint.*localhost|self.?hosted|on.?premises?/i.test(line)
    ) {
      telemetryLines.push(index + 1);
    }
  });

  if (telemetryLines.length > 0) {
    // Check for kill-switch / negative guard: code that explicitly disables or throws on telemetry enablement
    const hasTelemetryKillSwitch =
      /(?:throw.*telemetry|telemetry.*(?:disabled|disallow|forbidden|blocked|throw)|ALLOW_EXTERNAL_TELEMETRY|disable.*telemetry|telemetry.*kill.?switch|no.?external.?telemetry|SovereigntyError.*telemetry|telemetry.*SovereigntyError|telemetry.*policy.?gate|policy.?gate.*telemetry)/i.test(
        code,
      );
    if (!hasTelemetryKillSwitch && !iacTemplate) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "high",
        title: "Telemetry/analytics data sent to external service",
        description:
          "Code integrates with external telemetry or analytics services that may process and store user behavior data, IP addresses, or session information in jurisdictions outside sovereignty boundaries.",
        lineNumbers: telemetryLines.slice(0, 10),
        recommendation:
          "Verify the analytics provider's data residency options and configure region-specific endpoints. Consider self-hosted alternatives (Plausible, Matomo, self-hosted PostHog) for sovereign environments. Ensure DPAs cover data processing locations.",
        reference: "GDPR Articles 44-49 / Telemetry Data Sovereignty",
        suggestedFix:
          "Configure region-specific telemetry endpoints or use self-hosted alternatives (Plausible, self-hosted PostHog). Ensure DPAs cover data processing locations.",
        confidence: 0.85,
      });
    }
  }

  // PII stored without geographic partitioning
  const hasPiiFields =
    /(?:email|phone|ssn|social.?security|date.?of.?birth|address|first.?name|last.?name|national.?id|passport|driver.?license)/i.test(
      code,
    );
  const hasGeoPartitioning = testCode(
    code,
    /(?:partition|shard|region.*key|tenant.*region|geo.*route|data.*boundary|residency.*tag|region.*id)/i,
  );
  // Require concrete DB mutation evidence: ORM method calls (.save(), .create(), etc.)
  // or SQL DML keywords (INSERT INTO, UPDATE...SET, DELETE FROM) — not just generic words
  const dbOpsPattern =
    /(?:\.(?:save|create|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|bulkWrite|persist|upsert)\s*\(|(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b|cursor\.execute|\.execute\s*\(\s*["'`](?:INSERT|UPDATE|DELETE))/i;
  const hasDbOps = testCode(code, dbOpsPattern);

  if (hasPiiFields && hasDbOps && !hasGeoPartitioning && code.split("\n").length > 80) {
    // Collect line numbers where DB operations with PII occur
    const piiDbLines: number[] = [];
    const codeLines = code.split("\n");
    for (let i = 0; i < codeLines.length; i++) {
      if (dbOpsPattern.test(codeLines[i])) {
        piiDbLines.push(i + 1);
      }
    }
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "PII stored without geographic partitioning indicator",
      description:
        "Code stores PII fields (email, phone, national ID, etc.) with database operations but has no visible geographic partitioning, tenant-region routing, or data boundary tagging. Without explicit geo-aware storage, PII may be co-mingled across jurisdictions.",
      recommendation:
        "Tag PII records with a region/jurisdiction identifier. Use tenant-scoped region routing for multi-tenant systems. Implement database-level partitioning by geography for regulated data.",
      reference: "Data Residency Partitioning / Multi-Tenant Sovereignty",
      suggestedFix:
        "Add region tagging to PII records: { ...userData, _region: tenantRegion } and partition storage by jurisdiction.",
      confidence: 0.8,
      lineNumbers: piiDbLines.length > 0 ? piiDbLines : undefined,
    });
  }

  // Region configuration without server-side enforcement
  const hasClientRegionConfig = testCode(code, /(?:region|location|zone)\s*[:=]\s*["'`][^"'`]+["'`]/i);
  const hasServerValidation =
    /(?:validateRegion|checkRegion|regionGuard|verifyJurisdiction|enforceResidency|assertRegion|regionPolicy)/i.test(
      code,
    );

  if (
    hasClientRegionConfig &&
    !hasServerValidation &&
    !hasPolicyEnforcement &&
    !iacTemplate &&
    code.split("\n").length > 15
  ) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Region configuration without server-side enforcement",
      description:
        "A region or location is configured as a string value but no server-side validation or enforcement function is visible. Client-side region settings can be bypassed — sovereignty controls must be enforced server-side.",
      recommendation:
        "Implement server-side region validation that rejects requests targeting unauthorized regions. Use infrastructure-level guardrails (Azure Policy, AWS SCP, GCP Organization Policy) to enforce region boundaries.",
      reference: "Policy-as-Code / Server-Side Sovereignty Enforcement",
      suggestedFix:
        "Add server-side region validation: function validateRegion(region: string) { if (!ALLOWED_REGIONS.includes(region)) throw new Error('Unauthorized region'); }",
      confidence: 0.8,
      isAbsenceBased: true,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TECHNOLOGICAL SOVEREIGNTY
  // Detect vendor lock-in, proprietary dependency risk, and lack of
  // technology-stack independence that undermines sovereign control.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── SOV-011: Vendor-managed encryption without key sovereignty ──────────
  const kmsLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed)) return;
    if (
      /(?:aws\.?kms|kms\.encrypt|kms\.decrypt|kms\.generateDataKey|@aws-sdk\/client-kms|Azure\.KeyVault|CryptographyClient|keyVaultClient|google\.cloud\.kms|CloudKMS|KmsKeyRing)/i.test(
        line,
      ) &&
      !/byok|bring.?your.?own.?key|hsm|import.?key|customer.?managed|cmk|external.?key|key.?wrap|key.?import/i.test(
        line,
      )
    ) {
      kmsLines.push(index + 1);
    }
  });

  if (kmsLines.length > 0 && !iacTemplate) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Vendor-managed encryption without key sovereignty",
      description:
        "Code uses cloud-provider key management services (KMS) without visible BYOK (Bring Your Own Key), customer-managed key (CMK), or HSM key-import patterns. Provider-managed keys mean the cloud vendor retains ultimate control over cryptographic material, undermining technological sovereignty.",
      lineNumbers: kmsLines.slice(0, 10),
      recommendation:
        "Use customer-managed keys (CMK) or import keys via BYOK/HSM to retain cryptographic sovereignty. Document key lifecycle ownership and ensure keys can be rotated independently of the cloud provider.",
      reference: "Cloud Key Sovereignty / BYOK Best Practices",
      suggestedFix:
        "Import your own key material: const key = await kmsClient.importKey({ keyMaterial: localHsmKey, wrappingAlgorithm: 'RSA_AES_KEY_WRAP_SHA_256' }); — or configure customer-managed keys (CMK) for all encryption-at-rest resources.",
      confidence: 0.8,
    });
  }

  // ── SOV-012: Proprietary AI/ML model dependency without abstraction ─────
  const aiVendorLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed)) return;
    if (
      /(?:@aws-sdk\/client-bedrock|BedrockRuntimeClient|InvokeModelCommand|@azure\/openai|AzureOpenAI|OpenAIClient|@google-cloud\/aiplatform|PredictionServiceClient|@google-cloud\/vertexai|VertexAI|@aws-sdk\/client-rekognition|@aws-sdk\/client-textract|@aws-sdk\/client-comprehend|CognitiveServicesCredentials|TextAnalyticsClient|ComputerVisionClient|google\.cloud\.vision|google\.cloud\.language|google\.cloud\.speech)/i.test(
        line,
      ) &&
      !/interface\s+\w*(?:AI|Model|LLM|Inference|Predict)\w*|abstract\s+class|implements\s+\w*(?:AI|Model|LLM)\w*|adapter|provider.?pattern|strategy.?pattern/i.test(
        line,
      )
    ) {
      aiVendorLines.push(index + 1);
    }
  });

  const hasAiAbstraction =
    testCode(code, /interface\s+\w*(?:AI|Model|LLM|Inference|Predict|Embedding|Completion)\w*/i) ||
    testCode(code, /(?:adapter|provider|strategy).*(?:AI|Model|LLM)/i) ||
    testCode(code, /(?:openai|ollama|huggingface|transformers|vllm|litellm|langchain)/i);

  if (aiVendorLines.length > 0 && !hasAiAbstraction) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Proprietary AI/ML service dependency without model portability",
      description:
        "Code directly imports vendor-specific AI/ML SDKs (AWS Bedrock, Azure OpenAI, Google Vertex AI, or vendor cognitive services) without an abstraction layer. This creates tight coupling to a single vendor's AI platform, limiting model portability and technological sovereignty.",
      lineNumbers: aiVendorLines.slice(0, 10),
      recommendation:
        "Introduce an AI provider abstraction (interface/adapter) that decouples business logic from the specific vendor SDK. Consider open-source model runners (Ollama, vLLM, HuggingFace Transformers) or multi-provider libraries (LiteLLM, LangChain) for model portability.",
      reference: "Technological Sovereignty / AI Model Portability",
      suggestedFix:
        "Define a provider-agnostic interface: interface IModelProvider { complete(prompt: string): Promise<string>; } — and wrap each vendor SDK in an adapter implementing this interface.",
      confidence: 0.75,
    });
  }

  // ── SOV-013: Single identity provider coupling ──────────────────────────
  const idpLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed)) return;
    if (
      /(?:@aws-sdk\/client-cognito|CognitoIdentityProviderClient|CognitoUserPool|@azure\/msal|ConfidentialClientApplication|PublicClientApplication|@azure\/identity|google-auth-library|GoogleAuth|firebase\/auth|signInWithGoogle|Auth0Client|@auth0\/auth0-react)/i.test(
        line,
      ) &&
      !/oidc|openid|saml|federation|multi.?provider|identity.?broker|passport|next-?auth|keycloak|casdoor/i.test(line)
    ) {
      idpLines.push(index + 1);
    }
  });

  const hasIdpAbstraction =
    /(?:oidc|openid.?connect|saml|federation|identity.?broker|passport\.use|NextAuth|next-?auth|keycloak|multi.?provider)/i.test(
      code,
    );

  if (idpLines.length > 0 && !hasIdpAbstraction) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Single identity provider coupling without federation",
      description:
        "Authentication is tightly coupled to a single vendor-specific identity provider (Cognito, MSAL/Entra ID, Google Auth, Auth0, Firebase Auth) without visible OIDC/SAML federation or multi-provider abstraction. Single-vendor identity dependency creates operational risk and limits sovereignty over user authentication flows.",
      lineNumbers: idpLines.slice(0, 10),
      recommendation:
        "Implement identity federation using standard protocols (OpenID Connect, SAML 2.0). Use an identity broker (Keycloak, NextAuth, Passport.js with multiple strategies) that supports multiple upstream providers. This ensures authentication sovereignty and provider portability.",
      reference: "Technological Sovereignty / Identity Federation",
      suggestedFix:
        "Use an identity abstraction layer: configure Passport.js with multiple strategies (passport.use('oidc', new OidcStrategy(...))), or use NextAuth with pluggable providers to avoid single-vendor lock-in.",
      confidence: 0.75,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OPERATIONAL SOVEREIGNTY
  // Detect patterns that undermine an organization's ability to operate
  // independently — missing resilience, audit trails, and data portability.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── SOV-014: External API calls without circuit breaker / resilience ────
  const externalCallLines: number[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed)) return;
    if (
      /(?:fetch\(|axios\.|got\(|superagent|request\(|httpClient|HttpClient|http\.(?:get|post|put|delete)|urllib|requests\.(?:get|post|put|delete)|reqwest|hyper::Client)/i.test(
        line,
      ) &&
      !/circuit.?breaker|fallback|retry|timeout|AbortController|signal|AbortSignal|deadline|backoff|resilience|polly|cockatiel|opossum/i.test(
        line,
      )
    ) {
      externalCallLines.push(index + 1);
    }
  });

  const hasResiliencePattern =
    /(?:circuit.?breaker|CircuitBreaker|opossum|cockatiel|polly|resilience4j|Hystrix|retry.?policy|exponential.?backoff|fallback.?handler|AbortController|timeout.*fetch|fetch.*timeout)/i.test(
      code,
    );

  if (externalCallLines.length >= 5 && !hasResiliencePattern && code.split("\n").length > 80) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "External API calls without circuit breaker or resilience pattern",
      description:
        "Multiple external HTTP calls are made without visible circuit breaker, retry/backoff, or timeout patterns. This creates operational dependency on external services — if they degrade or become unavailable, your system has no autonomy to gracefully degrade or fail fast.",
      lineNumbers: externalCallLines.slice(0, 10),
      recommendation:
        "Wrap external API calls with circuit breaker patterns (opossum, cockatiel, Polly, resilience4j). Add timeouts via AbortController/AbortSignal. Implement fallback responses for degraded-mode operation to maintain operational sovereignty.",
      reference: "Operational Sovereignty / Resilience Patterns",
      suggestedFix:
        "Add a circuit breaker: const breaker = new CircuitBreaker(fetchExternal, { timeout: 5000, errorThresholdPercentage: 50 }); breaker.fallback(() => cachedResponse); — and use AbortController for request-level timeouts.",
      confidence: 0.75,
    });
  }

  // ── SOV-015: Administrative operations without audit trail ──────────────
  const adminOpLines: number[] = [];
  const auditLinePattern = /audit|log\.|logger\.|console\.|track|record|emit.*event|chronicle|journal/i;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (isCommentLine(trimmed)) return;
    if (
      /(?:\.delete\(|\.destroy\(|\.drop\(|\.truncate\(|\.revoke\(|\.disable\(|\.suspend\(|\.terminate\(|\.purge\(|\.wipe\(|\.removeAll\(|\.deleteMany\(|\.dropTable|\.dropDatabase|\.dropCollection|admin\.(?:create|delete|update|grant|revoke)|setRole|assignRole|revokeRole|changePassword|resetPassword)/i.test(
        line,
      ) &&
      !auditLinePattern.test(line)
    ) {
      // Check a small window of surrounding lines (±2) for nearby audit/log calls
      const windowStart = Math.max(0, index - 2);
      const windowEnd = Math.min(lines.length - 1, index + 2);
      let hasNearbyAudit = false;
      for (let i = windowStart; i <= windowEnd; i++) {
        if (i !== index && auditLinePattern.test(lines[i])) {
          hasNearbyAudit = true;
          break;
        }
      }
      if (!hasNearbyAudit) {
        adminOpLines.push(index + 1);
      }
    }
  });

  const hasAuditPattern =
    /(?:audit.?log|audit.?trail|audit.?event|audit.?record|AuditLogger|createAuditEntry|logAuditEvent|emitAuditEvent|chronicle|compliance.?log)/i.test(
      code,
    );

  if (adminOpLines.length >= 2 && !hasAuditPattern && code.split("\n").length > 80) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Administrative operations without audit trail",
      description:
        "Destructive or privileged operations (delete, destroy, drop, revoke, role changes, password resets) are performed without visible audit logging. Without audit trails, the organization loses operational sovereignty — the ability to independently verify who did what, when, and why.",
      lineNumbers: adminOpLines.slice(0, 10),
      recommendation:
        "Log all administrative and destructive operations to a tamper-evident audit trail. Include actor identity, timestamp, operation type, affected resource, and outcome. Store audit logs in a separate, append-only store with retention policies.",
      reference: "Operational Sovereignty / Audit Trail Requirements",
      suggestedFix:
        "Add audit logging before each destructive operation: auditLogger.log({ actor: ctx.userId, action: 'DELETE', resource: resourceId, timestamp: new Date().toISOString(), outcome: 'success' });",
      confidence: 0.8,
    });
  }

  // ── SOV-016: No data export or portability mechanism ────────────────────
  const hasDataStorage =
    /(?:\.save\(|\.insert\(|\.create\(|\.put\(|\.store\(|\.persist\(|\.upsert\(|\.bulkWrite\(|Model\.create|Repository\.save|database|collection\(|table\()/i.test(
      code,
    );
  const hasDataExport =
    /(?:export.*data|data.*export|download|dump|backup|migrate|portability|transfer.*out|extract|bulk.*read|getAll|findAll|cursor|stream.*all|paginate.*all|data.?portability|right.?to.?data)/i.test(
      code,
    );
  const hasExportApi =
    /(?:\/export|\/download|\/dump|\/backup|\/migrate|\/extract|\/portability|api.*export|export.*endpoint|bulk.*export)/i.test(
      code,
    );

  if (hasDataStorage && !hasDataExport && !hasExportApi && !iacTemplate && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Data storage without export or portability mechanism",
      description:
        "Code stores data but has no visible data export, bulk extraction, or portability mechanism. Without data portability, the organization risks vendor lock-in at the data layer — inability to migrate, audit, or exercise sovereignty over stored data.",
      recommendation:
        "Implement data export APIs (bulk read, streaming export, backup endpoints). Support standard portable formats (JSON, CSV, Parquet). This satisfies both GDPR Article 20 (right to data portability) and operational sovereignty — the ability to migrate data between systems independently.",
      reference: "Operational Sovereignty / Data Portability / GDPR Art. 20",
      suggestedFix:
        "Add a data export endpoint: app.get('/api/export/:entity', async (req, res) => { const data = await repository.findAll(); res.json(data); }); — and support CSV/JSON format options.",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CATCH-ALL: Sovereignty evidence not explicit
  // ═══════════════════════════════════════════════════════════════════════════

  if (findings.length === 0 && code.length > 0 && !iacTemplate) {
    const hasDataHandling = testCode(code, /(user|customer|personal|profile|account|email|phone|pii|data)/i);
    if (hasDataHandling) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "info",
        title: "Sovereignty evidence not explicit in code",
        description:
          "Data handling is present, but sovereignty controls (policy references, jurisdiction checks, transfer guardrails) are not explicitly visible in this code segment.",
        recommendation:
          "Add explicit sovereignty control points in code/config and link them to auditable policy artifacts.",
        reference: "Data Sovereignty Assurance Guidance",
        suggestedFix:
          "Add explicit sovereignty annotations: // @sovereignty: compliant, region=eu-west-1, policy=gdpr-ch5 — and link to auditable policy artifacts.",
        confidence: 0.7,
        isAbsenceBased: true,
      });
    }
  }

  return findings;
}
