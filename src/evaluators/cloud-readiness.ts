import type { Finding } from "../types.js";
import {
  getLineNumbers,
  getLangLineNumbers,
  getLangFamily,
  isIaCTemplate,
  testCode,
  getContextWindow,
  isLikelyAnalysisCode,
} from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCloudReadiness(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CLOUD";
  const _lang = getLangFamily(language);

  // Analysis code references filesystem paths and cloud-service keywords in
  // regex patterns for detection — these are not real cloud-readiness issues.
  if (isLikelyAnalysisCode(code)) return findings;

  // Shared: detect whether the file contains server/application bootstrap code.
  // Used to suppress operational rules (health check, graceful shutdown, feature flags)
  // that are irrelevant for utility/helper modules.
  const hasServerCode =
    /app\.(listen|use)|createServer|express\(\)|Flask\(|Django|WebApplication|actix_web|rocket::|gin\.|fiber\.|http\.ListenAndServe|SpringBoot/i.test(
      code,
    );

  // Hardcoded hosts/ports
  const hardcodedHostPattern = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{4,5}(?!.*(?:test|spec|mock|example))/gi;
  // Post-filter: exclude configurable defaults / fallback values
  const defaultCtxPattern = /unwrap_or|or_else|\|\||\?\?|environ\.get|getenv|os\.Getenv|default|fallback/i;
  const codeLines = code.split("\n");
  const hardcodedLines = getLineNumbers(code, hardcodedHostPattern).filter((ln) => {
    const ctx = getContextWindow(codeLines, ln, 2);
    return !defaultCtxPattern.test(ctx);
  });
  if (hardcodedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded localhost/port references",
      description:
        "Hardcoded host:port combinations won't work in cloud environments where services are dynamically assigned endpoints via service discovery or environment variables.",
      lineNumbers: hardcodedLines,
      recommendation:
        "Use environment variables (process.env.SERVICE_URL) or a service discovery mechanism. Configure ports via environment variables (process.env.PORT).",
      reference: "12-Factor App: Config (Factor III)",
      suggestedFix:
        "Replace hardcoded host:port with an environment variable read, e.g. `const url = process.env.SERVICE_URL || 'http://localhost:3000';`.",
      confidence: 0.9,
    });
  }

  // Local filesystem dependency
  // IaC templates reference target-machine paths (e.g., /home/user/.ssh/authorized_keys
  // on a deployed VM) — these are not local dev-machine filesystem dependencies.
  const fsPattern = /(?:\/tmp\/|C:\\|D:\\|\/var\/|\/home\/|\/etc\/|\.\/data\/|\.\/uploads\/|E:\\|F:\\)/gi;
  const fsLines = getLineNumbers(code, fsPattern);
  if (fsLines.length > 0 && !isIaCTemplate(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Local filesystem path dependency",
      description:
        "Hardcoded filesystem paths assume a specific OS or directory structure. In cloud/container environments, local storage is ephemeral and non-shared.",
      lineNumbers: fsLines,
      recommendation:
        "Use cloud storage (S3, Azure Blob, GCS) for persistent files. Use /tmp only for truly temporary data. Accept paths from environment configuration.",
      reference: "12-Factor App: Disposability (Factor IX)",
      suggestedFix:
        "Replace the hardcoded path with a cloud storage SDK call or read the path from an environment variable (e.g. `process.env.STORAGE_PATH`).",
      confidence: 0.85,
    });
  }

  // No health check endpoint
  const hasHealthCheck = testCode(code, /health|healthz|readyz|readiness|liveness|\/ready|\/live|\/status/gi);
  if (!hasHealthCheck && hasServerCode && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No health check endpoint detected",
      description:
        "Cloud platforms (Kubernetes, App Service, ECS) require health check endpoints to manage container lifecycle, auto-scaling, and load balancing.",
      recommendation:
        "Add /health or /healthz and /readyz endpoints. Health checks should verify the application can serve traffic and reach its dependencies.",
      reference: "Kubernetes Health Checks / Cloud-Native Patterns",
      suggestedFix:
        "Add a `GET /healthz` endpoint that returns 200 when the service is ready (e.g. `app.get('/healthz', (_, res) => res.sendStatus(200));`).",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  // No structured logging (multi-language)
  const hasStructuredLog =
    /winston|pino|bunyan|structuredLog|log\.info\(.*\{|logger\.|logging\.getLogger|serilog|log4j|NLog|zap\.|slog\.|tracing::/gi.test(
      code,
    );
  const consoleLogLines = getLangLineNumbers(code, language, LP.CONSOLE_LOG);
  const hasConsoleLog = consoleLogLines.length > 0;
  if (hasConsoleLog && !hasStructuredLog) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Console.log instead of structured logging",
      description:
        "Console.log output is unstructured and difficult to parse in cloud log aggregation systems (CloudWatch, Azure Monitor, GCP Logging, ELK).",
      recommendation:
        "Use a structured logging library (pino/winston for JS, logging with dictConfig for Python, slog for Go, serilog for C#, log4j/slf4j for Java, tracing for Rust) that outputs JSON. Include correlation IDs, timestamps, and log levels.",
      reference: "Cloud-Native Logging Best Practices",
      suggestedFix:
        "Replace `console.log()` calls with a structured logger (e.g. `import pino from 'pino'; const logger = pino(); logger.info({ event }, 'message');`).",
      confidence: 0.75,
    });
  }

  // No graceful shutdown (multi-language)
  const hasGracefulShutdown =
    /SIGTERM|SIGINT|graceful.*shutdown|process\.on\s*\(\s*['"](?:SIGTERM|SIGINT)['"]|signal\.Notify|tokio::signal|ctrlc::|CancellationToken|Runtime\.getRuntime\(\)\.addShutdownHook/gi.test(
      code,
    );
  if (!hasGracefulShutdown && hasServerCode && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No graceful shutdown handling",
      description:
        "Cloud platforms send SIGTERM before killing containers. Without graceful shutdown, in-flight requests are dropped and resources leak.",
      recommendation:
        "Handle SIGTERM to stop accepting new requests, complete in-flight work, close database connections, and exit cleanly.",
      reference: "12-Factor App: Disposability (Factor IX) / Kubernetes Pod Lifecycle",
      suggestedFix:
        "Add a SIGTERM handler, e.g. `process.on('SIGTERM', () => { server.close(() => process.exit(0)); });`.",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  // .env file usage in production context (multi-language)
  const dotenvPattern =
    /require\s*\(\s*['"]dotenv['"]\)|dotenv\.config|from\s+['"]dotenv['"]|dotenv\.load|python-dotenv|godotenv|DotNetEnv/gi;
  const dotenvLines = getLineNumbers(code, dotenvPattern);
  if (dotenvLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: ".env / dotenv usage detected",
      description:
        "dotenv is fine for local development but should not be the production configuration strategy in cloud environments.",
      lineNumbers: dotenvLines,
      recommendation:
        "In production, use cloud-native configuration: Azure App Configuration, AWS Parameter Store, Kubernetes ConfigMaps/Secrets, or your platform's native env var injection.",
      reference: "12-Factor App: Config (Factor III)",
      suggestedFix:
        "Guard dotenv loading behind an environment check, e.g. `if (process.env.NODE_ENV !== 'production') require('dotenv').config();`.",
      confidence: 0.9,
    });
  }

  // Missing Dockerfile / container support indicators
  const hasContainerSupport =
    /Dockerfile|docker|containerPort|EXPOSE|FROM\s+node|FROM\s+python|FROM\s+mcr|FROM\s+golang|FROM\s+rust|FROM\s+openjdk/gi.test(
      code,
    );
  if (hasServerCode && !hasContainerSupport && code.split("\n").length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No containerization indicators",
      description: "Server code without container configuration. Most cloud platforms use containers for deployment.",
      recommendation:
        "Create a Dockerfile with multi-stage builds. Use .dockerignore to exclude unnecessary files. Configure proper health checks in the container.",
      reference: "Docker Best Practices / Cloud-Native Packaging",
      suggestedFix: "Add a Dockerfile with a multi-stage build and a HEALTHCHECK instruction to the project root.",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  // Hardcoded credentials / connection strings
  const hardcodedCredsPattern = /(?:connectionString|DATABASE_URL|REDIS_URL|MONGO_URI)\s*[:=]\s*["'`][^"'`]{10,}/gi;
  const hardcodedCredsLines = getLineNumbers(code, hardcodedCredsPattern);
  if (hardcodedCredsLines.length > 0 && !isIaCTemplate(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded connection string / service URL",
      description:
        "Connection strings hardcoded in source code will break across environments and expose credentials in version control.",
      lineNumbers: hardcodedCredsLines,
      recommendation:
        "Use environment variables or a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) for all connection strings.",
      reference: "12-Factor App: Config (Factor III) / Secret Management",
      suggestedFix:
        "Move the connection string to an environment variable or secret store and reference it via `process.env.DATABASE_URL`.",
      confidence: 0.95,
    });
  }

  // Missing environment-based configuration
  const hasEnvConfig = testCode(
    code,
    /process\.env|os\.environ|os\.Getenv|Environment\.GetEnvironmentVariable|System\.getenv|ENV\[/gi,
  );
  const hasHardcodedConfig = getLineNumbers(
    code,
    /(?:port|host|database|redis|mongo)\s*[:=]\s*["'`](?!process|os\.|ENV)/gi,
  );
  if (hasHardcodedConfig.length > 2 && !hasEnvConfig && !isIaCTemplate(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Configuration hardcoded instead of environment-driven",
      description:
        "Multiple configuration values are hardcoded. Cloud-native apps should read configuration from the environment to support different deployment targets.",
      lineNumbers: hasHardcodedConfig.slice(0, 5),
      recommendation:
        "Read all configuration from environment variables. Use a config library (convict, dotenv, django-environ) to validate and provide defaults.",
      reference: "12-Factor App: Config (Factor III)",
      suggestedFix:
        "Replace each hardcoded config value with an environment variable read (e.g. `const port = process.env.PORT || 3000;`).",
      confidence: 0.8,
    });
  }

  // No CI/CD pipeline indicators
  const hasCICD = testCode(
    code,
    /\.github\/workflows|\.gitlab-ci|Jenkinsfile|azure-pipelines|bitbucket-pipelines|circleci|\.travis/gi,
  );
  // This check is informational and only applies to config/YAML files
  if (language === "yaml" && !hasCICD) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No CI/CD pipeline configuration detected",
      description: "Cloud-ready applications should have automated build, test, and deployment pipelines.",
      recommendation:
        "Set up a CI/CD pipeline (GitHub Actions, Azure DevOps, GitLab CI) for automated testing and deployment.",
      reference: "Continuous Delivery Best Practices",
      suggestedFix: "Add a `.github/workflows/ci.yml` file with build, test, and deploy steps for your project.",
      confidence: 0.7,
    });
  }

  // Missing retry/resilience for cloud services (multi-language)
  // IaC templates (Bicep/ARM/Terraform) are declarative — the deployment engine
  // (ARM, Terraform provider) handles retries.  Flagging `Azure.` references in
  // Bicep resource-type strings as "cloud SDK without retry" is a false positive.
  const cloudSdkPattern =
    /aws-sdk|@aws-sdk|@azure|googleapis|firebase|@google-cloud|boto3|azure\.identity|google\.cloud|Azure\.|Amazon\.|cloud\.google\.com/gi;
  const cloudSdkLines = getLineNumbers(code, cloudSdkPattern);
  const hasRetry =
    /retry|retries|backoff|exponential|resilience|polly|cockatiel|tenacity|resilience4j|backoff::|go-retryablehttp/gi.test(
      code,
    );
  if (cloudSdkLines.length > 0 && !hasRetry && !isIaCTemplate(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Cloud SDK usage without retry logic",
      description:
        "Cloud service calls can experience transient failures. Without retry logic, these become unnecessary errors.",
      lineNumbers: cloudSdkLines.slice(0, 3),
      recommendation:
        "Configure retry policies with exponential backoff for cloud SDK calls. Most SDKs have built-in retry configuration.",
      reference: "Cloud Service Resilience Patterns",
      suggestedFix:
        "Wrap cloud SDK calls with a retry utility using exponential backoff (e.g. `{ retries: 3, minTimeout: 1000 }`).",
      confidence: 0.8,
    });
  }

  // Missing resource cleanup / dispose pattern (multi-language)
  const hasResources =
    /createReadStream|openSync|createConnection|new\s+Client|open\s*\(|DatabaseConnection|SqlConnection|DriverManager|sql\.Open|File\.open|BufReader::new/gi.test(
      code,
    );
  const hasCleanup =
    /\.close\s*\(|\.end\s*\(|\.destroy\s*\(|\.dispose\s*\(|finally\s*\{|using\s*\(|with\s+.*as\s|defer\s|Drop\s+for|IDisposable|AutoCloseable/gi.test(
      code,
    );
  if (hasResources && !hasCleanup && !isIaCTemplate(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Resources opened without cleanup",
      description:
        "Resources (connections, streams, file handles) are opened but no cleanup/dispose pattern is visible. In cloud environments, leaked resources cause container restarts.",
      recommendation:
        "Use try/finally, 'using' (C#), 'with' (Python), or cleanup handlers. Ensure all resources are released on shutdown.",
      reference: "Resource Management / Dispose Pattern",
      suggestedFix:
        "Wrap the resource usage in a `try/finally` block and call `.close()` or `.destroy()` in the `finally` clause.",
      confidence: 0.75,
    });
  }

  // Feature flag / config toggles
  const hasFeatureFlags = /feature.?flag|launch.?darkly|unleash|flagsmith|ConfigCat|featureToggle|FEATURE_/gi.test(
    code,
  );
  if (!hasFeatureFlags && hasServerCode && code.split("\n").length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "info",
      title: "No feature flag mechanism detected",
      description:
        "Feature flags enable safe deployments, A/B testing, and gradual rollouts — key capabilities for cloud-native applications.",
      recommendation:
        "Consider implementing feature flags (LaunchDarkly, Unleash, Azure App Configuration) for controlled feature rollouts.",
      reference: "Feature Flags / Progressive Delivery",
      suggestedFix:
        "Introduce a feature-flag check (e.g. `if (featureFlags.isEnabled('new-feature'))`) using a flag provider or environment variable.",
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  return findings;
}
