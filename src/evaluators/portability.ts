import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzePortability(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "PORTA";

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
      recommendation: "Use platform-independent path construction (path.join, os.path.join, Path.Combine). Use environment variables or config for base directories.",
      reference: "Cross-Platform File Path Best Practices",
    });
  }

  // Hardcoded path separators
  const pathSepPattern = /(?:['"`](?:[^'"`]*\\\\[^'"`]*){2,}['"`]|['"`](?:[^'"`]*\/[^'"`]*){3,}['"`])/g;
  const pathSepLines = getLineNumbers(code, pathSepPattern);
  // Filter out URLs and imports
  const filteredPathSepLines = pathSepLines.filter((lineNum) => {
    const line = code.split("\n")[lineNum - 1] || "";
    return !/https?:\/\/|import\s|from\s|require\s*\(/.test(line);
  });
  if (filteredPathSepLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Hardcoded path separators in strings",
      description: "File paths use hardcoded separators instead of platform-independent path construction.",
      lineNumbers: filteredPathSepLines.slice(0, 5),
      recommendation: "Use path.join() (Node.js), os.path.join() (Python), or Path.Combine() (C#) instead of hardcoded separators.",
      reference: "Node.js path module / Cross-Platform Development",
    });
  }

  // Platform-specific shell commands
  const shellCmdPattern = /(?:exec|spawn|system|popen|shell_exec)\s*\(\s*["'`](?:cmd |powershell |bash |sh |\/bin\/|\.exe|rm -rf|del \/|copy |xcopy|chmod|chown)/gi;
  const shellLines = getLineNumbers(code, shellCmdPattern);
  if (shellLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Platform-specific shell commands",
      description: `Found ${shellLines.length} platform-specific shell command(s). These won't work on other operating systems.`,
      lineNumbers: shellLines,
      recommendation: "Use cross-platform APIs instead of shell commands (fs module instead of rm, path module instead of basename). If shell commands are required, use cross-platform alternatives.",
      reference: "Cross-Platform Development Best Practices",
    });
  }

  // Cloud vendor-specific SDK without abstraction
  const awsPattern = /aws-sdk|@aws-sdk|AmazonS3|AWSLambda|DynamoDB/gi;
  const azurePattern = /@azure\/|Azure\.|BlobServiceClient|ServiceBusClient/gi;
  const gcpPattern = /@google-cloud|googleapis|CloudStorage|BigQuery/gi;
  const awsLines = getLineNumbers(code, awsPattern);
  const azureLines = getLineNumbers(code, azurePattern);
  const gcpLines = getLineNumbers(code, gcpPattern);
  const hasAbstraction = /interface\s+\w*(?:Storage|Queue|Cache|Blob|Cloud)\w*/gi.test(code) ||
    /(?:adapter|provider|strategy)Pattern/gi.test(code);
  const vendorLines = [...new Set([...awsLines, ...azureLines, ...gcpLines])];
  if (vendorLines.length > 0 && !hasAbstraction) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Cloud vendor SDK used without abstraction layer",
      description: "Cloud vendor-specific SDKs are used directly without an abstraction layer. Switching cloud providers would require extensive code changes.",
      lineNumbers: vendorLines.slice(0, 5),
      recommendation: "Create an abstraction layer (interface/adapter pattern) around cloud services. This allows swapping implementations without changing business logic.",
      reference: "Cloud-Agnostic Architecture / Adapter Pattern",
    });
  }

  // Hardcoded localhost / IP addresses
  const hardcodedHostPattern = /["'`](?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?["'`]/gi;
  const hostLines = getLineNumbers(code, hardcodedHostPattern);
  if (hostLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Hardcoded localhost/IP references",
      description: `Found ${hostLines.length} hardcoded localhost or IP address reference(s). These won't work in containerized, cloud, or multi-machine deployments.`,
      lineNumbers: hostLines,
      recommendation: "Use environment variables for host configuration. In containers, use service names. In cloud, use DNS-based service discovery.",
      reference: "12-Factor App: Port Binding (Factor VII)",
    });
  }

  // Platform-specific line-ending handling
  const lineEndingPattern = /\\r\\n|\\r|CRLF|LF|line.?ending/gi;
  const hasExplicitLineEnding = lineEndingPattern.test(code);
  const hasFileOps = /readFile|writeFile|createReadStream|createWriteStream|open\s*\(/gi.test(code);
  // Only flag if doing file I/O without line ending awareness
  if (hasFileOps && !hasExplicitLineEnding && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "File I/O without explicit line-ending handling",
      description: "File operations detected without explicit line-ending handling. Windows uses CRLF (\\r\\n) while Unix uses LF (\\n), which can cause issues in cross-platform environments.",
      recommendation: "Use 'utf-8' encoding explicitly. Consider normalizing line endings when reading files. Configure .gitattributes for consistent line endings in version control.",
      reference: "Git Line Endings / Cross-Platform File I/O",
    });
  }

  // OS-specific environment variables
  const osEnvPattern = /process\.env\.(?:APPDATA|LOCALAPPDATA|USERPROFILE|PROGRAMFILES|HOMEPATH|WINDIR|SystemRoot|COMSPEC|HOME|XDG_\w+)/g;
  const osEnvLines = getLineNumbers(code, osEnvPattern);
  if (osEnvLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "OS-specific environment variables used directly",
      description: `Found ${osEnvLines.length} reference(s) to platform-specific environment variables (e.g., APPDATA, USERPROFILE, XDG_*). These variables only exist on specific operating systems.`,
      lineNumbers: osEnvLines,
      recommendation: "Use cross-platform helpers like os.homedir(), os.tmpdir(), or libraries like 'env-paths' to resolve platform-appropriate directories.",
      reference: "Node.js os Module / Cross-Platform File Paths",
    });
  }

  // Browser-specific APIs in server/universal code
  const browserApiPattern = /\b(?:document\.|window\.|navigator\.|localStorage\.|sessionStorage\.|alert\s*\(|confirm\s*\(|prompt\s*\()/g;
  const browserApiLines = getLineNumbers(code, browserApiPattern);
  const isLikelyServer = /require\s*\(\s*['"](?:express|http|fs|net|child_process|cluster)/gi.test(code) || /import\s+.*from\s+['"](?:express|http|fs|net|child_process|cluster)/gi.test(code);
  if (browserApiLines.length > 0 && isLikelyServer) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Browser-specific APIs used in server-side code",
      description: `Found ${browserApiLines.length} browser-only API call(s) (document, window, localStorage, etc.) in what appears to be server-side code. These will throw ReferenceError at runtime.`,
      lineNumbers: browserApiLines,
      recommendation: "Guard browser API usage with typeof checks (e.g., typeof window !== 'undefined'). Use isomorphic libraries for code shared between client and server.",
      reference: "Universal JavaScript / SSR Best Practices",
    });
  }

  // __dirname / __filename in ESM
  const dirnamePattern = /\b__dirname\b|\b__filename\b/g;
  const dirnameLines = getLineNumbers(code, dirnamePattern);
  const isESM = /import\s+.*from\s+['"]|export\s+(?:default|const|function|class)\b/g.test(code);
  if (dirnameLines.length > 0 && isESM) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "__dirname/__filename used in ESM module",
      description: `Found ${dirnameLines.length} use(s) of __dirname or __filename, which are not available in ES modules. This will fail at runtime when using ESM.`,
      lineNumbers: dirnameLines,
      recommendation: "Use import.meta.url with fileURLToPath() and path.dirname() for ESM-compatible directory resolution: const __dirname = path.dirname(fileURLToPath(import.meta.url))",
      reference: "Node.js ESM: import.meta.url",
    });
  }

  // Architecture-specific assumptions (32/64 bit)
  const archPattern = /(?:Int32Array|Float32Array|Uint32Array|Buffer\.alloc(?:Unsafe)?\s*\(\s*\d{8,})|(?:MAX_SAFE_INTEGER|Number\.MAX_SAFE_INTEGER)/g;
  const archLines = getLineNumbers(code, archPattern);
  if (archLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potential architecture-specific assumptions",
      description: `Found ${archLines.length} instance(s) of typed arrays, large buffer allocations, or integer limit references that may behave differently across architectures.`,
      lineNumbers: archLines,
      recommendation: "Use BigInt for values exceeding Number.MAX_SAFE_INTEGER. Be mindful of buffer sizes on memory-constrained platforms. Test on both 32-bit and 64-bit environments.",
      reference: "MDN: BigInt / Node.js Buffer Best Practices",
    });
  }

  // Platform-specific process signals
  const signalPattern = /process\.on\s*\(\s*['"](?:SIGUSR1|SIGUSR2|SIGWINCH|SIGHUP|SIGPIPE)['"]/g;
  const signalLines = getLineNumbers(code, signalPattern);
  if (signalLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Platform-specific process signals used",
      description: `Found ${signalLines.length} Unix-specific signal handler(s) (SIGUSR1, SIGHUP, etc.). These signals are not available on Windows and will cause errors.`,
      lineNumbers: signalLines,
      recommendation: "Guard signal handlers with platform checks (process.platform !== 'win32'). Use cross-platform shutdown mechanisms. Consider using 'death' or 'signal-exit' packages.",
      reference: "Node.js Process Signals / Cross-Platform Considerations",
    });
  }

  return findings;
}
