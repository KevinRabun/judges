import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeCloudReadiness(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CLOUD";
  const lang = getLangFamily(language);

  // Hardcoded hosts/ports
  const hardcodedHostPattern = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{4,5}(?!.*(?:test|spec|mock|example))/gi;
  const hardcodedLines = getLineNumbers(code, hardcodedHostPattern);
  if (hardcodedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded localhost/port references",
      description: "Hardcoded host:port combinations won't work in cloud environments where services are dynamically assigned endpoints via service discovery or environment variables.",
      lineNumbers: hardcodedLines,
      recommendation: "Use environment variables (process.env.SERVICE_URL) or a service discovery mechanism. Configure ports via environment variables (process.env.PORT).",
      reference: "12-Factor App: Config (Factor III)",
    });
  }

  // Local filesystem dependency
  const fsPattern = /(?:\/tmp\/|C:\\|D:\\|\/var\/|\/home\/|\/etc\/|\.\/data\/|\.\/uploads\/|E:\\|F:\\)/gi;
  const fsLines = getLineNumbers(code, fsPattern);
  if (fsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Local filesystem path dependency",
      description: "Hardcoded filesystem paths assume a specific OS or directory structure. In cloud/container environments, local storage is ephemeral and non-shared.",
      lineNumbers: fsLines,
      recommendation: "Use cloud storage (S3, Azure Blob, GCS) for persistent files. Use /tmp only for truly temporary data. Accept paths from environment configuration.",
      reference: "12-Factor App: Disposability (Factor IX)",
    });
  }

  // No health check endpoint
  const hasHealthCheck = /health|healthz|readyz|readiness|liveness|\/ready|\/live|\/status/gi.test(code);
  if (!hasHealthCheck && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No health check endpoint detected",
      description: "Cloud platforms (Kubernetes, App Service, ECS) require health check endpoints to manage container lifecycle, auto-scaling, and load balancing.",
      recommendation: "Add /health or /healthz and /readyz endpoints. Health checks should verify the application can serve traffic and reach its dependencies.",
      reference: "Kubernetes Health Checks / Cloud-Native Patterns",
    });
  }

  // No structured logging (multi-language)
  const hasStructuredLog = /winston|pino|bunyan|structuredLog|log\.info\(.*\{|logger\.|logging\.getLogger|serilog|log4j|NLog|zap\.|slog\.|tracing::/gi.test(code);
  const consoleLogLines = getLangLineNumbers(code, language, LP.CONSOLE_LOG);
  const hasConsoleLog = consoleLogLines.length > 0;
  if (hasConsoleLog && !hasStructuredLog) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Console.log instead of structured logging",
      description: "Console.log output is unstructured and difficult to parse in cloud log aggregation systems (CloudWatch, Azure Monitor, GCP Logging, ELK).",
      recommendation: "Use a structured logging library (pino/winston for JS, logging with dictConfig for Python, slog for Go, serilog for C#, log4j/slf4j for Java, tracing for Rust) that outputs JSON. Include correlation IDs, timestamps, and log levels.",
      reference: "Cloud-Native Logging Best Practices",
    });
  }

  // No graceful shutdown (multi-language)
  const hasGracefulShutdown = /SIGTERM|SIGINT|graceful.*shutdown|process\.on\s*\(\s*['"](?:SIGTERM|SIGINT)['"]|signal\.Notify|tokio::signal|ctrlc::|CancellationToken|Runtime\.getRuntime\(\)\.addShutdownHook/gi.test(code);
  if (!hasGracefulShutdown && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No graceful shutdown handling",
      description: "Cloud platforms send SIGTERM before killing containers. Without graceful shutdown, in-flight requests are dropped and resources leak.",
      recommendation: "Handle SIGTERM to stop accepting new requests, complete in-flight work, close database connections, and exit cleanly.",
      reference: "12-Factor App: Disposability (Factor IX) / Kubernetes Pod Lifecycle",
    });
  }

  // .env file usage in production context (multi-language)
  const dotenvPattern = /require\s*\(\s*['"]dotenv['"]\)|dotenv\.config|from\s+['"]dotenv['"]|dotenv\.load|python-dotenv|godotenv|DotNetEnv/gi;
  const dotenvLines = getLineNumbers(code, dotenvPattern);
  if (dotenvLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: ".env / dotenv usage detected",
      description: "dotenv is fine for local development but should not be the production configuration strategy in cloud environments.",
      lineNumbers: dotenvLines,
      recommendation: "In production, use cloud-native configuration: Azure App Configuration, AWS Parameter Store, Kubernetes ConfigMaps/Secrets, or your platform's native env var injection.",
      reference: "12-Factor App: Config (Factor III)",
    });
  }

  // Missing Dockerfile / container support indicators
  const hasContainerSupport = /Dockerfile|docker|containerPort|EXPOSE|FROM\s+node|FROM\s+python|FROM\s+mcr|FROM\s+golang|FROM\s+rust|FROM\s+openjdk/gi.test(code);
  const hasServerCode = /app\.(listen|use)|createServer|express\(\)|Flask\(|Django|WebApplication|actix_web|rocket::|gin\.|fiber\.|http\.ListenAndServe|SpringBoot/gi.test(code);
  if (hasServerCode && !hasContainerSupport && code.split("\n").length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No containerization indicators",
      description: "Server code without container configuration. Most cloud platforms use containers for deployment.",
      recommendation: "Create a Dockerfile with multi-stage builds. Use .dockerignore to exclude unnecessary files. Configure proper health checks in the container.",
      reference: "Docker Best Practices / Cloud-Native Packaging",
    });
  }

  // Hardcoded credentials / connection strings
  const hardcodedCredsPattern = /(?:connectionString|DATABASE_URL|REDIS_URL|MONGO_URI)\s*[:=]\s*["'`][^"'`]{10,}/gi;
  const hardcodedCredsLines = getLineNumbers(code, hardcodedCredsPattern);
  if (hardcodedCredsLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded connection string / service URL",
      description: "Connection strings hardcoded in source code will break across environments and expose credentials in version control.",
      lineNumbers: hardcodedCredsLines,
      recommendation: "Use environment variables or a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault) for all connection strings.",
      reference: "12-Factor App: Config (Factor III) / Secret Management",
    });
  }

  // Missing environment-based configuration
  const hasEnvConfig = /process\.env|os\.environ|os\.Getenv|Environment\.GetEnvironmentVariable|System\.getenv|ENV\[/gi.test(code);
  const hasHardcodedConfig = getLineNumbers(code, /(?:port|host|database|redis|mongo)\s*[:=]\s*["'`](?!process|os\.|ENV)/gi);
  if (hasHardcodedConfig.length > 2 && !hasEnvConfig) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Configuration hardcoded instead of environment-driven",
      description: "Multiple configuration values are hardcoded. Cloud-native apps should read configuration from the environment to support different deployment targets.",
      lineNumbers: hasHardcodedConfig.slice(0, 5),
      recommendation: "Read all configuration from environment variables. Use a config library (convict, dotenv, django-environ) to validate and provide defaults.",
      reference: "12-Factor App: Config (Factor III)",
    });
  }

  // No CI/CD pipeline indicators
  const hasCICD = /\.github\/workflows|\.gitlab-ci|Jenkinsfile|azure-pipelines|bitbucket-pipelines|circleci|\.travis/gi.test(code);
  // This check is informational and only applies to config/YAML files
  if (language === "yaml" && !hasCICD) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No CI/CD pipeline configuration detected",
      description: "Cloud-ready applications should have automated build, test, and deployment pipelines.",
      recommendation: "Set up a CI/CD pipeline (GitHub Actions, Azure DevOps, GitLab CI) for automated testing and deployment.",
      reference: "Continuous Delivery Best Practices",
    });
  }

  // Missing retry/resilience for cloud services (multi-language)
  const cloudSdkPattern = /aws-sdk|@aws-sdk|@azure|googleapis|firebase|@google-cloud|boto3|azure\.identity|google\.cloud|Azure\.|Amazon\.|cloud\.google\.com/gi;
  const cloudSdkLines = getLineNumbers(code, cloudSdkPattern);
  const hasRetry = /retry|retries|backoff|exponential|resilience|polly|cockatiel|tenacity|resilience4j|backoff::|go-retryablehttp/gi.test(code);
  if (cloudSdkLines.length > 0 && !hasRetry) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Cloud SDK usage without retry logic",
      description: "Cloud service calls can experience transient failures. Without retry logic, these become unnecessary errors.",
      lineNumbers: cloudSdkLines.slice(0, 3),
      recommendation: "Configure retry policies with exponential backoff for cloud SDK calls. Most SDKs have built-in retry configuration.",
      reference: "Cloud Service Resilience Patterns",
    });
  }

  // Missing resource cleanup / dispose pattern (multi-language)
  const hasResources = /createReadStream|openSync|createConnection|new\s+Client|open\s*\(|DatabaseConnection|SqlConnection|DriverManager|sql\.Open|File\.open|BufReader::new/gi.test(code);
  const hasCleanup = /\.close\s*\(|\.end\s*\(|\.destroy\s*\(|\.dispose\s*\(|finally\s*\{|using\s*\(|with\s+.*as\s|defer\s|Drop\s+for|IDisposable|AutoCloseable/gi.test(code);
  if (hasResources && !hasCleanup) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Resources opened without cleanup",
      description: "Resources (connections, streams, file handles) are opened but no cleanup/dispose pattern is visible. In cloud environments, leaked resources cause container restarts.",
      recommendation: "Use try/finally, 'using' (C#), 'with' (Python), or cleanup handlers. Ensure all resources are released on shutdown.",
      reference: "Resource Management / Dispose Pattern",
    });
  }

  // Feature flag / config toggles
  const hasFeatureFlags = /feature.?flag|launch.?darkly|unleash|flagsmith|ConfigCat|featureToggle|FEATURE_/gi.test(code);
  if (!hasFeatureFlags && code.split("\n").length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No feature flag mechanism detected",
      description: "Feature flags enable safe deployments, A/B testing, and gradual rollouts — key capabilities for cloud-native applications.",
      recommendation: "Consider implementing feature flags (LaunchDarkly, Unleash, Azure App Configuration) for controlled feature rollouts.",
      reference: "Feature Flags / Progressive Delivery",
    });
  }

  return findings;
}
