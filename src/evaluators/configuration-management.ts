import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeConfigurationManagement(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "CFG";

  // Hardcoded secrets / credentials
  const secretPattern = /(?:password|passwd|secret|api_?key|token|private_?key)\s*[:=]\s*["'`][^"'`]{3,}/gi;
  const secretLines = getLineNumbers(code, secretPattern);
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

  return findings;
}
