import type { Finding } from "../types.js";
import { getLineNumbers, getLangFamily, isIaCTemplate, testCode, getContextWindow } from "./shared.js";

export function analyzePortability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "PORTA";
  const _lang = getLangFamily(language);

  // IaC templates (Bicep/Terraform/ARM) are inherently platform- and
  // vendor-specific by design.  Filesystem paths in IaC refer to the target
  // machine (e.g. VM SSH keys at /home/user/.ssh/), not the developer's
  // workstation, and vendor SDK references (Azure.*, @aws-sdk) are the resource
  // type identifiers — abstraction layers are architecturally inappropriate.
  if (isIaCTemplate(code)) return findings;

  // Hardcoded Windows/Unix file paths
  const windowsPathPattern = /['"` ](?:[A-Z]:\\|\\\\[a-zA-Z])/g;
  const unixAbsolutePathPattern = /['"` ](?:\/(?:home|var|etc|opt|usr|tmp)\/)/g;
  const windowsLines = getLineNumbers(code, windowsPathPattern);
  const unixLines = getLineNumbers(code, unixAbsolutePathPattern);
  const osPathLines = [...new Set([...windowsLines, ...unixLines])];
  if (osPathLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "OS-specific file paths detected",
      description: `Found ${osPathLines.length} hardcoded OS-specific path(s). These will fail on other operating systems.`,
      lineNumbers: osPathLines.slice(0, 5),
      recommendation:
        "Use platform-independent path construction (path.join, os.path.join, Path.Combine). Use environment variables or config for base directories.",
      reference: "Cross-Platform File Path Best Practices",
      suggestedFix:
        "Replace hardcoded paths like `'C:\\Users\\...'` with `path.join(os.homedir(), 'relative', 'path')` or read the base directory from an environment variable.",
      confidence: 0.9,
    });
  }

  // Hardcoded path separators
  // Move the trailing [^...]* OUTSIDE the repeated group so each iteration is
  // just [^...]*<sep> — no ambiguity between adjacent iterations' boundaries.
  // This prevents exponential NFA backtracking (CodeQL js/polynomial-redos).
  const pathSepPattern = /(?:['"`](?:[^'"`\\]*\\\\){2,}[^'"`\\]*['"`]|['"`](?:[^'"`/]*\/){3,}[^'"`/]*['"`])/g;
  const pathSepLines = getLineNumbers(code, pathSepPattern);
  // Skip entirely for HTML/markup files — forward slashes in href/src attributes
  // are valid URL paths, not OS file-path separator misuse.
  const isMarkupLang = /^\s*<(!DOCTYPE|html|head|body|meta|link)/im.test(code);
  // Filter out URLs, imports, and route/API path literals
  const filteredPathSepLines = isMarkupLang
    ? []
    : pathSepLines.filter((lineNum) => {
        const line = code.split("\n")[lineNum - 1] || "";
        // Exclude URLs and module imports
        if (/https?:\/\/|import\s|from\s|require\s*\(/.test(line)) return false;
        // Exclude route/API path definitions (e.g., '/api/v1/users/:id')
        if (/(?:app|router)\s*\.\s*(?:get|post|put|delete|patch|use|all)\s*\(/i.test(line)) return false;
        if (/@(?:Get|Post|Put|Delete|Patch|RequestMapping)\s*\(/i.test(line)) return false;
        if (/(?:path|route|endpoint|url)\s*[:=]/i.test(line) && /['"]\//i.test(line)) return false;
        // Exclude strings that look like URL paths (start with / and contain only path chars)
        if (/['"`]\/(?:api|v[0-9]|auth|users|admin|health|status|webhook|callback)\//i.test(line)) return false;
        return true;
      });
  if (filteredPathSepLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Hardcoded path separators in strings",
      description: "File paths use hardcoded separators instead of platform-independent path construction.",
      lineNumbers: filteredPathSepLines.slice(0, 5),
      recommendation:
        "Use path.join() (Node.js), os.path.join() (Python), or Path.Combine() (C#) instead of hardcoded separators.",
      reference: "Node.js path module / Cross-Platform Development",
      suggestedFix:
        "Replace string-concatenated paths like `dir + '\\\\' + file` with `path.join(dir, file)` to let the runtime choose the correct separator.",
      confidence: 0.8,
    });
  }

  // Platform-specific shell commands
  const shellCmdPattern =
    /(?:exec|spawn|system|popen|shell_exec)\s*\(\s*["'`](?:cmd |powershell |bash |sh |\/bin\/|\.exe|rm -rf|del \/|copy |xcopy|chmod|chown)/gi;
  const shellLines = getLineNumbers(code, shellCmdPattern);
  if (shellLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Platform-specific shell commands",
      description: `Found ${shellLines.length} platform-specific shell command(s). These won't work on other operating systems.`,
      lineNumbers: shellLines,
      recommendation:
        "Use cross-platform APIs instead of shell commands (fs module instead of rm, path module instead of basename). If shell commands are required, use cross-platform alternatives.",
      reference: "Cross-Platform Development Best Practices",
      suggestedFix:
        "Replace shell calls like `exec('rm -rf dir')` with `fs.rmSync('dir', { recursive: true })` or use the `cross-spawn` package for unavoidable shell commands.",
      confidence: 0.9,
    });
  }

  // Cloud vendor-specific SDK without abstraction
  const awsPattern = /aws-sdk|@aws-sdk|AmazonS3|AWSLambda|DynamoDB/gi;
  const azurePattern = /@azure\/|Azure\.|BlobServiceClient|ServiceBusClient/gi;
  const gcpPattern = /@google-cloud|googleapis|CloudStorage|BigQuery/gi;
  const awsLines = getLineNumbers(code, awsPattern);
  const azureLines = getLineNumbers(code, azurePattern);
  const gcpLines = getLineNumbers(code, gcpPattern);
  const hasAbstraction =
    testCode(code, /interface\s+\w*(?:Storage|Queue|Cache|Blob|Cloud)\w*/gi) ||
    testCode(code, /(?:adapter|provider|strategy)Pattern/gi);
  const vendorLines = [...new Set([...awsLines, ...azureLines, ...gcpLines])];
  if (vendorLines.length > 0 && !hasAbstraction) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Cloud vendor SDK used without abstraction layer",
      description:
        "Cloud vendor-specific SDKs are used directly without an abstraction layer. Switching cloud providers would require extensive code changes.",
      lineNumbers: vendorLines.slice(0, 5),
      recommendation:
        "Create an abstraction layer (interface/adapter pattern) around cloud services. This allows swapping implementations without changing business logic.",
      reference: "Cloud-Agnostic Architecture / Adapter Pattern",
      suggestedFix:
        "Define an interface (e.g. `IStorageProvider`) and wrap the vendor SDK in an adapter class so business logic depends only on the interface.",
      confidence: 0.7,
    });
  }

  // Hardcoded localhost / IP addresses
  const hardcodedHostPattern = /["'`](?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?["'`]/gi;
  // Post-filter: exclude configurable defaults / fallback values
  const defaultCtxPattern = /unwrap_or|or_else|\|\||\?\?|environ\.get|getenv|os\.Getenv|default|fallback/i;
  const portaCodeLines = code.split("\n");
  const hostLines = getLineNumbers(code, hardcodedHostPattern).filter((ln) => {
    const ctx = getContextWindow(portaCodeLines, ln, 2);
    return !defaultCtxPattern.test(ctx);
  });
  if (hostLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded localhost/IP references",
      description: `Found ${hostLines.length} hardcoded localhost or IP address reference(s). These won't work in containerized, cloud, or multi-machine deployments.`,
      lineNumbers: hostLines,
      recommendation:
        "Use environment variables for host configuration. In containers, use service names. In cloud, use DNS-based service discovery.",
      reference: "12-Factor App: Port Binding (Factor VII)",
      suggestedFix:
        "Replace `'localhost:3000'` with `process.env.HOST ?? 'localhost'` and `process.env.PORT ?? 3000` so the values are configurable per environment.",
      confidence: 0.9,
    });
  }

  // Platform-specific line-ending handling
  // Skip Go — `os.ReadFile` is the standard stdlib function, not a portability
  // concern. The readFile/writeFile pattern is JS/Node-centric.
  const lineEndingPattern = /\\r\\n|\\r|CRLF|LF|line.?ending/gi;
  const hasExplicitLineEnding = testCode(code, lineEndingPattern);
  const hasFileOps =
    language === "go" ? false : testCode(code, /readFile|writeFile|createReadStream|createWriteStream|open\s*\(/gi);
  // Only flag if doing file I/O without line ending awareness
  if (hasFileOps && !hasExplicitLineEnding && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "File I/O without explicit line-ending handling",
      description:
        "File operations detected without explicit line-ending handling. Windows uses CRLF (\\r\\n) while Unix uses LF (\\n), which can cause issues in cross-platform environments.",
      recommendation:
        "Use 'utf-8' encoding explicitly. Consider normalizing line endings when reading files. Configure .gitattributes for consistent line endings in version control.",
      reference: "Git Line Endings / Cross-Platform File I/O",
      suggestedFix:
        "Normalize line endings after reading with `.replace(/\\r\\n/g, '\\n')` and add a `.gitattributes` file with `* text=auto eol=lf`.",
      confidence: 0.7,
    });
  }

  // OS-specific environment variables
  const osEnvPattern =
    /process\.env\.(?:APPDATA|LOCALAPPDATA|USERPROFILE|PROGRAMFILES|HOMEPATH|WINDIR|SystemRoot|COMSPEC|HOME|XDG_\w+)/g;
  const osEnvLines = getLineNumbers(code, osEnvPattern);
  if (osEnvLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "OS-specific environment variables used directly",
      description: `Found ${osEnvLines.length} reference(s) to platform-specific environment variables (e.g., APPDATA, USERPROFILE, XDG_*). These variables only exist on specific operating systems.`,
      lineNumbers: osEnvLines,
      recommendation:
        "Use cross-platform helpers like os.homedir(), os.tmpdir(), or libraries like 'env-paths' to resolve platform-appropriate directories.",
      reference: "Node.js os Module / Cross-Platform File Paths",
      suggestedFix:
        "Replace `process.env.APPDATA` with `os.homedir()` or use the `env-paths` package to get platform-appropriate config/data directories.",
      confidence: 0.9,
    });
  }

  // Browser-specific APIs in server/universal code
  const browserApiPattern =
    /\b(?:document\.|window\.|navigator\.|localStorage\.|sessionStorage\.|alert\s*\(|confirm\s*\(|prompt\s*\()/g;
  const browserApiLines = getLineNumbers(code, browserApiPattern);
  const isLikelyServer =
    testCode(code, /require\s*\(\s*['"](?:express|http|fs|net|child_process|cluster)/gi) ||
    testCode(code, /import\s+.*from\s+['"](?:express|http|fs|net|child_process|cluster)/gi);
  if (browserApiLines.length > 0 && isLikelyServer) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Browser-specific APIs used in server-side code",
      description: `Found ${browserApiLines.length} browser-only API call(s) (document, window, localStorage, etc.) in what appears to be server-side code. These will throw ReferenceError at runtime.`,
      lineNumbers: browserApiLines,
      recommendation:
        "Guard browser API usage with typeof checks (e.g., typeof window !== 'undefined'). Use isomorphic libraries for code shared between client and server.",
      reference: "Universal JavaScript / SSR Best Practices",
      suggestedFix:
        "Wrap browser API calls in a guard: `if (typeof window !== 'undefined') { window.localStorage.setItem(...) }` or move them to a client-only module.",
      confidence: 0.85,
    });
  }

  // __dirname / __filename in ESM
  const dirnamePattern = /\b__dirname\b|\b__filename\b/g;
  const dirnameLines = getLineNumbers(code, dirnamePattern);
  const isESM = /import\s+.*from\s+['"]|export\s+(?:default|const|function|class)\b/g.test(code);
  if (dirnameLines.length > 0 && isESM) {
    // Filter out files that USE the recommended ESM polyfill pattern:
    //   const __filename = fileURLToPath(import.meta.url);
    //   const __dirname  = path.dirname(fileURLToPath(import.meta.url));
    //   const __dirname  = dirname(__filename);       // also valid
    // When a polyfill definition exists, all subsequent uses of __dirname /
    // __filename in the same file reference the polyfilled const, not the
    // missing CJS global — so the entire finding is suppressed.
    const codeLines = code.split("\n");
    const ESM_POLYFILL_RE =
      /(?:const|let|var)\s+__(?:dirname|filename)\s*=\s*(?:(?:path\.)?dirname\s*\((?:__filename|fileURLToPath)|fileURLToPath\s*\()/;
    const hasPolyfill = dirnameLines.some((ln) => {
      const lineText = codeLines[ln - 1] ?? "";
      return ESM_POLYFILL_RE.test(lineText);
    });
    if (!hasPolyfill) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "__dirname/__filename used in ESM module",
        description: `Found ${dirnameLines.length} use(s) of __dirname or __filename, which are not available in ES modules. This will fail at runtime when using ESM.`,
        lineNumbers: dirnameLines,
        recommendation:
          "Use import.meta.url with fileURLToPath() and path.dirname() for ESM-compatible directory resolution: const __dirname = path.dirname(fileURLToPath(import.meta.url))",
        reference: "Node.js ESM: import.meta.url",
        suggestedFix:
          "Replace `__dirname` with `path.dirname(fileURLToPath(import.meta.url))` after importing `fileURLToPath` from `'node:url'`.",
        confidence: 0.9,
      });
    }
  }

  // Architecture-specific assumptions (32/64 bit)
  const archPattern =
    /(?:Int32Array|Float32Array|Uint32Array|Buffer\.alloc(?:Unsafe)?\s*\(\s*\d{8,})|(?:MAX_SAFE_INTEGER|Number\.MAX_SAFE_INTEGER)/g;
  const archLines = getLineNumbers(code, archPattern);
  if (archLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potential architecture-specific assumptions",
      description: `Found ${archLines.length} instance(s) of typed arrays, large buffer allocations, or integer limit references that may behave differently across architectures.`,
      lineNumbers: archLines,
      recommendation:
        "Use BigInt for values exceeding Number.MAX_SAFE_INTEGER. Be mindful of buffer sizes on memory-constrained platforms. Test on both 32-bit and 64-bit environments.",
      reference: "MDN: BigInt / Node.js Buffer Best Practices",
      suggestedFix:
        "Use `BigInt` literals (e.g. `9007199254740993n`) for values beyond `Number.MAX_SAFE_INTEGER` and validate buffer sizes against `os.freemem()` before allocating.",
      confidence: 0.8,
    });
  }

  // Platform-specific process signals
  const signalPattern = /process\.on\s*\(\s*['"](?:SIGUSR1|SIGUSR2|SIGWINCH|SIGHUP|SIGPIPE)['"]/g;
  const signalLines = getLineNumbers(code, signalPattern);
  if (signalLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "low",
      title: "Platform-specific process signals used",
      description: `Found ${signalLines.length} Unix-specific signal handler(s) (SIGUSR1, SIGHUP, etc.). These signals are not available on Windows and will cause errors.`,
      lineNumbers: signalLines,
      recommendation:
        "Guard signal handlers with platform checks (process.platform !== 'win32'). Use cross-platform shutdown mechanisms. Consider using 'death' or 'signal-exit' packages.",
      reference: "Node.js Process Signals / Cross-Platform Considerations",
      suggestedFix:
        "Wrap the handler in a platform check: `if (process.platform !== 'win32') { process.on('SIGUSR1', handler); }` or use the `signal-exit` package.",
      confidence: 0.9,
    });
  }

  return findings;
}
