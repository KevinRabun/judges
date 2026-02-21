import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeConfigurationManagement(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CFG";
  const lang = getLangFamily(language);

  // Hardcoded secrets / credentials
  const secretPattern = /(?:password|passwd|secret|api_?key|token|private_?key)\s*[:=]\s*["'`][^"'`]{3,}/gi;
  const nonProductionContextPattern = /\b(?:test|tests|mock|mocks|fixture|fixtures|harness|e2e|example|sample|dummy)\b/i;
  const productionContextPattern = /\b(?:prod|production|release|deploy|deployment)\b/i;
  const secretLines: number[] = [];

  if (/\b(?:describe|it|test)\s*\(/i.test(code) && !productionContextPattern.test(code)) {
    // Skip hardcoded secret findings in explicit test modules.
  } else {

    const lines = code.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      secretPattern.lastIndex = 0;
      if (!secretPattern.test(lines[index])) {
        continue;
      }

      const contextStart = Math.max(0, index - 2);
      const contextEnd = Math.min(lines.length, index + 3);
      const context = lines.slice(contextStart, contextEnd).join("\n");
      const isLikelyNonProductionContext =
        nonProductionContextPattern.test(context) &&
        !productionContextPattern.test(context);

      if (!isLikelyNonProductionContext) {
        secretLines.push(index + 1);
      }
    }
  }

  if (secretLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Secrets hardcoded in source code",
      description: `Found ${secretLines.length} instance(s) of hardcoded secrets. Secrets in code are exposed in version control, CI logs, and error traces. They cannot be rotated without redeployment.`,
      lineNumbers: secretLines,
      recommendation: "Store secrets in a secrets manager (Azure Key Vault, AWS Secrets Manager, HashiCorp Vault). Inject via environment variables at runtime. Never commit secrets.",
      reference: "OWASP: Secrets Management / 12-Factor App: Config",
    });
  }

  // Hardcoded configuration values
  const hardcodedConfigPattern = /(?:const|let|var)\s+(?:PORT|HOST|DATABASE|REDIS|MONGO|API_URL|BASE_URL|TIMEOUT|INTERVAL)\s*=\s*(?:["'`]\w|[0-9])/gi;
  const hardcodedConfigLines = getLineNumbers(code, hardcodedConfigPattern);
  if (hardcodedConfigLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Configuration values hardcoded instead of externalized",
      description: `Found ${hardcodedConfigLines.length} hardcoded configuration value(s). These values need to change between environments (dev, staging, prod) and should be externalized.`,
      lineNumbers: hardcodedConfigLines,
      recommendation: "Read configuration from environment variables (process.env.PORT). Use a config library (convict, dotenv, django-environ) to validate and provide defaults.",
      reference: "12-Factor App: Config (Factor III)",
    });
  }

  // No environment variable usage
  const hasEnvVars = /process\.env|os\.environ|os\.Getenv|Environment\.GetEnvironmentVariable|System\.getenv|ENV\[/gi.test(code);
  const hasConfig = /(?:port|host|database|url|key|secret|token)\s*[:=]\s*["'`0-9]/gi.test(code);
  if (!hasEnvVars && hasConfig && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No environment variable usage detected",
      description: "Configuration values are present but no environment variable reads are visible. The application cannot be configured differently per environment without code changes.",
      recommendation: "Read all configuration from environment variables. Provide sensible defaults for development. Validate required config at startup and fail fast if missing.",
      reference: "12-Factor App: Config (Factor III)",
    });
  }

  // Config validation at startup
  const hasConfigValidation = /(?:assert|require|throw|exit|fatal|Error)\s*.*(?:missing|required|not set|undefined|config)/gi.test(code);
  if (hasConfig && !hasConfigValidation && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No configuration validation at startup",
      description: "Configuration values are used but never validated at startup. Missing or invalid configuration will cause runtime failures instead of clear startup errors.",
      recommendation: "Validate all required configuration at application startup. Fail fast with a clear error message listing which config is missing or invalid.",
      reference: "Fail-Fast Principle / 12-Factor App",
    });
  }

  // .env file committed (detected by its presence in code)
  const dotenvCommitPattern = /\.env\b(?!\.example|\.sample|\.template|\.schema)/gi;
  const hasGitignore = /\.gitignore/gi.test(code);
  const hasEnvFile = /dotenv|\.env\b/gi.test(code);
  // This is a heuristic — can't truly check .gitignore from code alone
  if (hasEnvFile && code.split("\n").length > 10) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: ".env usage detected — ensure it is not committed",
      description: ".env files are useful for development but must not be committed to version control. Ensure .env is listed in .gitignore and provide a .env.example template instead.",
      recommendation: "Add .env to .gitignore. Create a .env.example with placeholder values documenting required environment variables. Use CI/CD variables for deployment.",
      reference: "12-Factor App: Config / dotenv Best Practices",
    });
  }

  // Missing defaults on process.env reads
  const envNoDefaultPattern = /process\.env\.\w+(?!\s*\|\||[^;\n]*?(?:\?\?|default|fallback))/g;
  const envNoDefaultLines = getLineNumbers(code, envNoDefaultPattern);
  const envWithDefaultPattern = /process\.env\.\w+\s*(?:\|\||&&|\?\?)/g;
  const envWithDefaults = (code.match(envWithDefaultPattern) || []).length;
  const envTotal = envNoDefaultLines.length;
  if (envTotal > 0 && envWithDefaults === 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Environment variable reads without defaults",
      description: `Found ${envTotal} process.env reads without fallback defaults. Missing env vars will silently be undefined at runtime, causing hard-to-debug issues.`,
      lineNumbers: envNoDefaultLines.slice(0, 5),
      recommendation: "Provide defaults: process.env.PORT || 3000, or validate at startup that required variables are present. Use a config library that enforces defaults.",
      reference: "Node.js Configuration Best Practices",
    });
  }

  // Hardcoded feature flags
  const featureFlagPattern = /(?:const|let|var)\s+(?:ENABLE|DISABLE|FEATURE|FLAG|TOGGLE|ALLOW|USE)_\w+\s*=\s*(?:true|false)/gi;
  const featureFlagLines = getLineNumbers(code, featureFlagPattern);
  if (featureFlagLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Feature flags hardcoded as constants",
      description: `Found ${featureFlagLines.length} hardcoded feature flag(s). Hardcoded flags require code changes and redeployment to toggle features.`,
      lineNumbers: featureFlagLines,
      recommendation: "Use a feature flag service (LaunchDarkly, Unleash, AWS AppConfig) or environment variables. This allows toggling features without deploying.",
      reference: "Feature Flag Best Practices / Martin Fowler: Feature Toggles",
    });
  }

  // No secret rotation mechanism
  const hasSecrets = /(?:password|secret|api_?key|token|private_?key)\s*[:=]/gi.test(code);
  const hasRotation = /rotate|rotation|expir|renew|refresh.*token|refresh.*secret/gi.test(code);
  if (hasSecrets && !hasRotation && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No secret rotation mechanism detected",
      description: "Secrets are used but no rotation logic is visible. Secrets that cannot be rotated become a liability — a single leak requires emergency credential replacement.",
      recommendation: "Design for secret rotation: use short-lived tokens, implement token refresh flows, and use secrets managers with automatic rotation (Azure Key Vault, AWS Secrets Manager).",
      reference: "NIST 800-53: Secret Rotation / Zero Trust Principles",
    });
  }

  // Missing config schema / documentation
  const hasConfigSchema = /schema|convict|joi\.object|zod\.object|yup\.object|ajv|configSchema|configSpec/gi.test(code);
  if (hasEnvVars && !hasConfigSchema && code.split("\n").length > 40) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No configuration schema or documentation",
      description: "Environment variables are read but no config schema is defined. New developers won't know which variables are required, what types they should be, or what values are valid.",
      recommendation: "Define a config schema using convict, Zod, or Joi. Document every env var in a .env.example file with comments explaining purpose, type, and valid values.",
      reference: "Configuration Schema Validation / 12-Factor App",
    });
  }

  // Environment-specific code
  const envSpecificPattern = /(?:if|switch|case)\s*.*(?:NODE_ENV|ENVIRONMENT|ENV)\s*(?:===?|!==?|==)\s*["'`](?:production|staging|development|test)/gi;
  const envSpecificLines = getLineNumbers(code, envSpecificPattern);
  if (envSpecificLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Excessive environment-specific branching in code",
      description: `Found ${envSpecificLines.length} environment-specific conditional(s). Too many if(NODE_ENV) checks scatter config logic across the codebase instead of centralizing it.`,
      lineNumbers: envSpecificLines.slice(0, 5),
      recommendation: "Centralize environment-specific config in a config module. Use dependency injection or config objects rather than environment checks throughout the codebase.",
      reference: "12-Factor App: Config / Clean Architecture",
    });
  }

  return findings;
}
