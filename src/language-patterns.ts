// ─── Language Patterns ───────────────────────────────────────────────────────
// Centralised, multi-language regex pattern library.
// Each concept maps to per-language regex patterns so evaluators can
// detect equivalent issues across JS/TS, Python, Rust, C#, Java, and Go.
// ──────────────────────────────────────────────────────────────────────────────

import type { LangFamily } from "./types.js";

// ─── Language Normalisation ──────────────────────────────────────────────────

const LANG_ALIAS_MAP: Record<string, LangFamily> = {
  javascript: "javascript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  typescript: "typescript",
  ts: "typescript",
  tsx: "typescript",
  python: "python",
  py: "python",
  python3: "python",
  rust: "rust",
  rs: "rust",
  csharp: "csharp",
  "c#": "csharp",
  cs: "csharp",
  java: "java",
  go: "go",
  golang: "go",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  c: "cpp",
  h: "cpp",
  hpp: "cpp",
  powershell: "powershell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  pwsh: "powershell",
  terraform: "terraform",
  tf: "terraform",
  hcl: "terraform",
  bicep: "bicep",
  arm: "arm",
  armtemplate: "arm",
  "arm-template": "arm",
  php: "php",
  php8: "php",
  php7: "php",
  ruby: "ruby",
  rb: "ruby",
  kotlin: "kotlin",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  dockerfile: "dockerfile",
  docker: "dockerfile",
  containerfile: "dockerfile",
};

/**
 * Normalise a user-supplied language string to a canonical LangFamily.
 */
export function normalizeLanguage(language: string): LangFamily {
  const key = language.toLowerCase().trim();
  return LANG_ALIAS_MAP[key] ?? "unknown";
}

/**
 * Returns true if the language is in the JS/TS family.
 */
export function isJsTs(lang: LangFamily): boolean {
  return lang === "javascript" || lang === "typescript";
}

/**
 * Returns true if the language uses braces for blocks (all except Python and IaC).
 */
export function isBraceLang(lang: LangFamily): boolean {
  return (
    lang !== "python" &&
    lang !== "ruby" &&
    lang !== "unknown" &&
    lang !== "terraform" &&
    lang !== "bicep" &&
    lang !== "arm" &&
    lang !== "dockerfile"
  );
}

/**
 * Returns true if the language is an Infrastructure as Code language.
 */
export function isIaC(lang: LangFamily): boolean {
  return lang === "terraform" || lang === "bicep" || lang === "arm" || lang === "dockerfile";
}

// ─── Pattern Builders ────────────────────────────────────────────────────────

/**
 * Build a regex that matches patterns for the given language family.
 * Falls back to matching ALL languages if lang is "unknown".
 */
export function langPattern(
  lang: LangFamily,
  patterns: Partial<Record<LangFamily | "jsts" | "all", string>>,
): RegExp | null {
  // "jsts" is a shortcut for both javascript and typescript
  let source: string | undefined;

  if (lang === "unknown") {
    // Match everything available
    const parts: string[] = [];
    for (const v of Object.values(patterns)) {
      if (v) parts.push(v);
    }
    if (parts.length === 0) return null;
    try {
      return new RegExp(parts.join("|"), "gi");
    } catch {
      return null;
    }
  }

  source = patterns[lang];
  if (!source && isJsTs(lang)) {
    source = patterns["jsts"];
  }
  if (!source) {
    source = patterns["all"];
  }
  if (!source) return null;
  try {
    return new RegExp(source, "gi");
  } catch {
    return null;
  }
}

/**
 * Build a single regex that matches across ALL supported languages.
 * Use this when you want to detect an issue regardless of declared language.
 */
export function allLangPattern(patterns: Partial<Record<LangFamily | "jsts", string>>): RegExp {
  const parts: string[] = [];
  for (const v of Object.values(patterns)) {
    if (v) parts.push(v);
  }
  try {
    return new RegExp(parts.join("|"), "gi");
  } catch {
    // Fallback: never-matching regex
    return /(?!)/gi;
  }
}

// ─── Common Pattern Constants ────────────────────────────────────────────────
// Organised by domain. Each constant is a record mapping LangFamily → regex source.
// Evaluators import these and pass to langPattern() / allLangPattern().

// ── Environment Variable Access ──────────────────────────────────────────────

export const ENV_ACCESS = {
  jsts: String.raw`process\.env\.\w+`,
  python: String.raw`os\.environ(?:\[|\.get\s*\()`,
  rust: String.raw`std::env::(?:var|args)|env!`,
  csharp: String.raw`Environment\.GetEnvironmentVariable\s*\(`,
  java: String.raw`System\.getenv\s*\(`,
  go: String.raw`os\.(?:Getenv|LookupEnv)\s*\(`,
  powershell: String.raw`\$env:\w+`,
  php: String.raw`\$_(?:ENV|SERVER)\[|getenv\s*\(`,
  ruby: String.raw`ENV\[|ENV\.fetch\s*\(`,
  kotlin: String.raw`System\.getenv\s*\(`,
  swift: String.raw`ProcessInfo\.processInfo\.environment\[`,
};

export const HARDCODED_ENV = {
  jsts: String.raw`process\.env\.\w+\s*\|\|\s*["'][^"']+["']`,
  python: String.raw`os\.environ\.get\s*\(\s*["'][^"']+["']\s*,\s*["'][^"']+["']\s*\)`,
  rust: String.raw`env::var\s*\(.*\)\.unwrap_or\s*\(\s*["'][^"']+["']`,
  csharp: String.raw`GetEnvironmentVariable\s*\(.*\)\s*\?\?\s*["'][^"']+["']`,
  java: String.raw`getenv\s*\(.*\)\s*(?:!=\s*null\s*\?|==\s*null)`,
  go: String.raw`os\.Getenv\s*\(.*\)\s*==\s*["']`,
  powershell: String.raw`\$env:\w+\s*=\s*["'][^"']+["']`,
};

// ── Function Definitions ─────────────────────────────────────────────────────

export const FUNCTION_DEF = {
  jsts: String.raw`(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))`,
  python: String.raw`(?:def|async\s+def)\s+\w+\s*\(`,
  rust: String.raw`(?:pub\s+)?(?:async\s+)?fn\s+\w+`,
  csharp: String.raw`(?:public|private|protected|internal|static|async|override|virtual)\s+[\w<>\[\]]+\s+\w+\s*\(`,
  java: String.raw`(?:public|private|protected|static|final|synchronized|abstract)\s+[\w<>\[\]]+\s+\w+\s*\(`,
  go: String.raw`func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+\s*\(`,
  powershell: String.raw`function\s+[\w-]+\s*(?:\(|\{)`,
  php: String.raw`(?:public|private|protected|static)?\s*function\s+\w+\s*\(`,
  ruby: String.raw`def\s+\w+`,
  kotlin: String.raw`(?:fun|suspend\s+fun)\s+\w+\s*\(`,
  swift: String.raw`(?:func|class\s+func|static\s+func)\s+\w+\s*\(`,
};

// ── Error Handling ───────────────────────────────────────────────────────────

export const TRY_CATCH = {
  jsts: String.raw`try\s*\{`,
  python: String.raw`try\s*:`,
  rust: String.raw`(?:\.unwrap\(\)|\.expect\(|panic!\()`,
  csharp: String.raw`try\s*\{`,
  java: String.raw`try\s*\{`,
  go: String.raw`if\s+err\s*!=\s*nil`,
  powershell: String.raw`try\s*\{`,
  php: String.raw`try\s*\{`,
  ruby: String.raw`begin\s*$|rescue\b`,
  kotlin: String.raw`try\s*\{`,
  swift: String.raw`do\s*\{.*catch`,
};

export const EMPTY_CATCH = {
  jsts: String.raw`catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*)?\s*\}`,
  python: String.raw`except(?:\s+\w+)?(?:\s+as\s+\w+)?\s*:\s*(?:pass|\.\.\.)\s*(?:#.*)?$`,
  rust: String.raw`\.unwrap_or_default\(\)`,
  csharp: String.raw`catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*)?\s*\}`,
  java: String.raw`catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}`,
  go: String.raw`if\s+err\s*!=\s*nil\s*\{\s*(?:\/\/[^\n]*)?\s*\}|_\s*=\s*\w+\(`,
  powershell: String.raw`catch\s*\{\s*(?:#[^\n]*)?\s*\}`,
  php: String.raw`catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}`,
  ruby: String.raw`rescue\s*(?:=>\s*\w+)?\s*$`,
  kotlin: String.raw`catch\s*\([^)]*\)\s*\{\s*(?:\/\/[^\n]*)?\s*\}`,
  swift: String.raw`catch\s*\{\s*(?:\/\/[^\n]*)?\s*\}`,
};

export const GENERIC_CATCH = {
  jsts: String.raw`catch\s*\(\s*\w+\s*\)`,
  python: String.raw`except\s*:(?!\s*\w)`,
  csharp: String.raw`catch\s*\(\s*Exception\s`,
  java: String.raw`catch\s*\(\s*(?:Exception|Throwable)\s`,
  // Go intentionally omitted: `if err != nil` is idiomatic, not a generic catch
  powershell: String.raw`catch\s*\{|catch\s*\[\s*System\.Exception\s*\]`,
  php: String.raw`catch\s*\(\s*(?:\\?Exception|\\?Throwable)\s`,
  ruby: String.raw`rescue\s*$|rescue\s+(?:Exception|StandardError)\b`,
  kotlin: String.raw`catch\s*\(\s*\w+\s*:\s*(?:Exception|Throwable)\s*\)`,
  swift: String.raw`catch\s*\{|catch\s+let\s+\w+\s*\{`,
};

export const PANIC_UNWRAP = {
  rust: String.raw`\.unwrap\(\)|\.expect\(|panic!\(|unreachable!\(`,
  go: String.raw`panic\s*\(|log\.Fatal`,
  jsts: String.raw`process\.exit\s*\(`,
  python: String.raw`sys\.exit\s*\(|os\._exit\s*\(`,
  csharp: String.raw`Environment\.Exit\s*\(|Environment\.FailFast\s*\(`,
  java: String.raw`System\.exit\s*\(|Runtime\.getRuntime\(\)\.halt\s*\(`,
  powershell: String.raw`\[Environment\]::Exit\s*\(|exit\s+\d|throw\s`,
  php: String.raw`die\s*\(|exit\s*\(`,
  ruby: String.raw`exit\s*\(!?|abort\s*\(|Kernel\.exit`,
  kotlin: String.raw`exitProcess\s*\(|(?<![.\w])error\s*\(`,
  swift: String.raw`fatalError\s*\(|preconditionFailure\s*\(|exit\s*\(`,
};

// ── Weak / Dynamic Types ────────────────────────────────────────────────────

export const WEAK_TYPE = {
  jsts: String.raw`:\s*any\b|as\s+any\b|<any>`,
  python: String.raw`:\s*Any\b|->\s*Any\b`,
  rust: String.raw`unsafe\s*\{|as\s+\*(?:const|mut)`,
  csharp: String.raw`:\s*dynamic\b|:\s*object\b|as\s+object\b`,
  java: String.raw`:\s*Object\b|<\s*\?\s*>|@SuppressWarnings\s*\(\s*["']unchecked["']\s*\)`,
  // Go's interface{} and any are idiomatic — they are the standard way to
  // accept arbitrary types (pre-1.18 and post-1.18 respectively). Only flag
  // unsafe pointer casts which genuinely bypass the type system.
  go: String.raw`unsafe\.Pointer`,
  powershell: String.raw`\[object\]|\[psobject\]|\[System\.Object\]`,
  php: String.raw`mixed\b|\$\w+\s*\/\*\*.*@var\s+mixed`,
  kotlin: String.raw`:\s*Any\??\b|as\??\s+Any\b`,
  swift: String.raw`:\s*Any\b|as!\s|unsafeBitCast\s*\(`,
};

// ── Async / Concurrency ─────────────────────────────────────────────────────

export const ASYNC_FUNCTION = {
  jsts: String.raw`async\s+function|async\s*\(`,
  python: String.raw`async\s+def\s`,
  rust: String.raw`async\s+fn\s`,
  csharp: String.raw`async\s+Task|async\s+ValueTask`,
  java: String.raw`CompletableFuture|@Async|ExecutorService`,
  go: String.raw`go\s+\w+\s*\(|go\s+func\s*\(`,
  powershell: String.raw`Start-Job|Start-ThreadJob|ForEach-Object\s+-Parallel`,
  php: String.raw`(?:Amp|React)\\Promise|async\s*\(|Fiber::`,
  ruby: String.raw`Async\b|Thread\.new|Concurrent::`,
  kotlin: String.raw`suspend\s+fun|launch\s*\{|async\s*\{|withContext\s*\(`,
  swift: String.raw`async\s+func|Task\s*\{|TaskGroup`,
};

export const MISSING_AWAIT = {
  jsts: String.raw`(?:^|\s)(?!await\s)(?:fetch|axios|got|request)\s*\(`,
  python: String.raw`(?:^|\s)(?!await\s)(?:aiohttp|httpx)\.`,
  rust: String.raw`(?:^|\s)(?!\.await)tokio::`,
  csharp: String.raw`(?:^|\s)(?!await\s)(?:HttpClient|Task\.Run)`,
  java: String.raw`(?:^|\s)(?!\.get\(\))CompletableFuture`,
};

export const SHARED_MUTABLE = {
  jsts: String.raw`(?:let|var|const)\s+\w+\s*(?::[^=]+)?\s*=\s*(?:\{|\[|\d+|new\s)`,
  // Note: const included because const objects/arrays are still mutable (const prevents
  // reassignment, not mutation). The :[^=]+ handles TypeScript type annotations
  // (e.g., `const sessions: Record<string, any> = {}`).
  python: String.raw`(?:threading\.Thread|multiprocessing\.Process).*(?:global\s|nonlocal\s)`,
  rust: String.raw`(?:static\s+mut\b|Arc<Mutex|Rc<RefCell)`,
  csharp: String.raw`(?:static\s+(?!readonly)[\w<>\[\]]+\s+\w+\s*=|volatile\s)`,
  java: String.raw`(?:static\s+(?!final)[\w<>\[\]]+\s+\w+\s*=)`,
  go: String.raw`(?:var\s+\w+\s+\w+\s*\n.*go\s+func|sync\.Mutex)`,
  php: String.raw`(?:static\s+\$\w+\s*=|global\s+\$)`,
  ruby: String.raw`(?:@@\w+\s*=|\$\w+\s*=)`,
  kotlin: String.raw`(?:companion\s+object.*var\b|@Volatile)`,
  swift: String.raw`(?:static\s+var\b|class\s+var\b)`,
};

// ── Imports / Dependencies ───────────────────────────────────────────────────

export const WILDCARD_IMPORT = {
  jsts: String.raw`import\s+\*\s+as\s`,
  python: String.raw`from\s+\w+\s+import\s+\*`,
  java: String.raw`import\s+[\w.]+\.\*\s*;`,
  csharp: String.raw`using\s+static\s+[\w.]+\.\*`,
  php: String.raw`use\s+[\w\\]+\\\{[^}]*\}`,
  kotlin: String.raw`import\s+[\w.]+\.\*\s*$`,
};

export const DEPRECATED_IMPORT = {
  jsts: String.raw`require\s*\(\s*["'](?:crypto|http|url|querystring|path)["']\s*\)`,
  python: String.raw`import\s+(?:imp|optparse|formatter|mimetools|rfc822)\b`,
  java: String.raw`import\s+java\.(?:util\.Date|util\.Hashtable|util\.Vector|util\.Stack)\s*;`,
};

// ── Security: SQL Injection ──────────────────────────────────────────────────

export const SQL_INJECTION = {
  jsts: String.raw`(?:query|execute|exec)\s*\(\s*(?:\x60[^\x60]*\$\{|["'].*\+\s*(?:req\.|request\.|params\.|body\.))`,
  python: String.raw`(?:cursor\.execute|\.raw|connection\.execute)\s*\(\s*(?:f["']|["'].*%|["'].*\.format\s*\()`,
  rust: String.raw`(?:query|execute)\s*\(\s*&format!\(`,
  csharp: String.raw`(?:ExecuteNonQuery|ExecuteReader|ExecuteScalar|SqlCommand)\s*\(.*(?:\+\s*\w+|string\.Format|\$["'])`,
  java: String.raw`(?:executeQuery|executeUpdate|prepareStatement|createQuery)\s*\(\s*(?:["'].*\+\s*\w+|String\.format)`,
  go: String.raw`(?:db\.(?:Query|Exec|QueryRow)|\.Raw)\s*\(\s*(?:fmt\.Sprintf|["'].*\+\s*\w+)`,
  powershell: String.raw`Invoke-Sqlcmd.*["'].*\$|Invoke-DbaQuery.*["'].*\$`,
  php: String.raw`(?:mysqli?_query|\$(?:pdo|db|conn)->query)\s*\(\s*(?:["'].*\.\s*\$|\$\w+)`,
  ruby: String.raw`(?:ActiveRecord|\w+\.(?:where|find_by_sql|execute))\s*\(\s*(?:["'].*#\{|["'].*\+)`,
  kotlin: String.raw`(?:executeQuery|createQuery|nativeQuery|createStatement)\s*\(\s*(?:["'].*\+|\$?["'].*\$\w+)`,
  swift: String.raw`(?:execute|prepare)\s*\(\s*(?:["'].*\\\(|["'].*\+)`,
};

// ── Security: Command Injection ──────────────────────────────────────────────

export const COMMAND_INJECTION = {
  jsts: String.raw`(?:exec|spawn|execSync|execFile)\s*\(.*(?:\+|\$\{)`,
  python: String.raw`(?:os\.system|os\.popen|subprocess\.(?:call|run|Popen))\s*\(.*(?:\+|f["']|\.format|%s)`,
  rust: String.raw`Command::new\s*\(.*(?:format!|&\w+)`,
  csharp: String.raw`Process\.Start\s*\(.*(?:\+|\$["'])`,
  java: String.raw`Runtime\.getRuntime\(\)\.exec\s*\(.*\+|ProcessBuilder\s*\(.*\+`,
  go: String.raw`exec\.Command\s*\(.*(?:\+|fmt\.Sprintf)`,
  powershell: String.raw`Invoke-Expression.*\$|Start-Process.*\$|&\s*\$\w+`,
  php: String.raw`(?:exec|system|passthru|shell_exec|popen|proc_open)\s*\(.*\$`,
  ruby: String.raw`(?:system|exec|\x60|%x).*#\{|Kernel\.system\s*\(.*\+`,
  kotlin: String.raw`Runtime\.getRuntime\(\)\.exec\s*\(.*\+|ProcessBuilder\s*\(.*\+`,
  swift: String.raw`Process\(\).*arguments.*\+|NSTask\b`,
};

// ── Security: Hardcoded Secrets ──────────────────────────────────────────────

export const HARDCODED_PASSWORD = {
  all: String.raw`(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']`,
};

export const HARDCODED_API_KEY = {
  all: String.raw`(?:api[_-]?key|apikey)\s*[:=]\s*["'][^"']+["']`,
};

export const HARDCODED_SECRET = {
  all: String.raw`(?:secret|token)\s*[:=]\s*["'][^"']+["']`,
};

// ── Security: Weak Hashing ───────────────────────────────────────────────────

export const WEAK_HASH = {
  jsts: String.raw`crypto\.createHash\s*\(\s*["'](?:md5|sha1)["']\)`,
  python: String.raw`hashlib\.(?:md5|sha1)\s*\(`,
  rust: String.raw`(?:md5|sha1)::(?:compute|digest|Md5|Sha1)`,
  csharp: String.raw`(?:MD5|SHA1)\.Create`,
  java: String.raw`MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-?1)["']\)`,
  go: String.raw`(?:md5|sha1)\.(?:New|Sum)\s*\(`,
  powershell: String.raw`\[System\.Security\.Cryptography\.(?:MD5|SHA1)\]::Create`,
  php: String.raw`md5\s*\(|sha1\s*\(`,
  ruby: String.raw`Digest::(?:MD5|SHA1)`,
  kotlin: String.raw`MessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-?1)["']\)`,
  swift: String.raw`CC_MD5|CC_SHA1|Insecure\.(?:MD5|SHA1)`,
};

// ── Security: Eval / Dynamic Execution ───────────────────────────────────────

export const EVAL_USAGE = {
  jsts: String.raw`\beval\s*\(|new\s+Function\s*\(`,
  python: String.raw`\beval\s*\(|\bexec\s*\(|compile\s*\(`,
  rust: String.raw`(?!)`, // Rust has no eval equivalent
  csharp: String.raw`CSharpScript\.EvaluateAsync|Roslyn\.Scripting`,
  java: String.raw`ScriptEngine\.eval\s*\(|Nashorn|Groovy`,
  go: String.raw`(?!)`, // Go has no eval equivalent
  powershell: String.raw`Invoke-Expression|iex\s`,
  php: String.raw`\beval\s*\(|\bcreate_function\s*\(|\bpreg_replace\b.*\/e`,
  ruby: String.raw`\beval\s*\(|\bsend\s*\(|\binstance_eval\s*\(|\bclass_eval\s*\(`,
  kotlin: String.raw`ScriptEngine\.eval\s*\(`,
  swift: String.raw`NSExpression\b|JSContext\b.*evaluateScript`,
};

// ── Security: TLS / Certificate ──────────────────────────────────────────────

export const TLS_DISABLED = {
  jsts: String.raw`NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|rejectUnauthorized\s*:\s*false`,
  python: String.raw`verify\s*=\s*False|ssl\._create_unverified_context`,
  rust: String.raw`danger_accept_invalid_certs\s*\(\s*true\)`,
  csharp: String.raw`ServerCertificateValidationCallback\s*=.*true|ServicePointManager\.ServerCertificateValidationCallback`,
  java: String.raw`TrustAllCerts|X509TrustManager|trustAllCerts`,
  go: String.raw`InsecureSkipVerify\s*:\s*true`,
  powershell: String.raw`\[System\.Net\.ServicePointManager\]::ServerCertificateValidationCallback|\-SkipCertificateCheck`,
  php: String.raw`CURLOPT_SSL_VERIFYPEER\s*=>\s*false|verify_peer\s*=>\s*false`,
  ruby: String.raw`verify_mode\s*=\s*OpenSSL::SSL::VERIFY_NONE|ssl_verify_mode.*VERIFY_NONE`,
  kotlin: String.raw`TrustAllCerts|X509TrustManager|trustAllCerts`,
  swift: String.raw`ServerTrustPolicy\.disableEvaluation|allowsSelfSignedCertificates\s*=\s*true`,
};

// ── Security: CORS ───────────────────────────────────────────────────────────

export const CORS_WILDCARD = {
  jsts: String.raw`(?:Access-Control-Allow-Origin|cors)\s*[:({]\s*(?:['"]\*|(?:\{[^}]*)?origin\s*:\s*['"]\*)`,
  python: String.raw`(?:CORS_ALLOW_ALL_ORIGINS|CORS_ORIGIN_ALLOW_ALL)\s*=\s*True|allow_origins\s*=\s*\[["']\*["']\]`,
  csharp: String.raw`AllowAnyOrigin\s*\(\)|WithOrigins\s*\(\s*["']\*["']\s*\)`,
  java: String.raw`@CrossOrigin\s*$|allowedOrigins\s*=.*\*|addMapping\s*\(\s*["']/\*\*["']\s*\)`,
  go: String.raw`AllowAllOrigins\s*:\s*true|Access-Control-Allow-Origin.*\*`,
  php: String.raw`header\s*\(\s*["']Access-Control-Allow-Origin:\s*\*`,
  ruby: String.raw`allow_origin\s+["']\*["']|origins\s+["']\*["']`,
  kotlin: String.raw`@CrossOrigin\s*$|allowedOrigins\s*=.*\*`,
  swift: String.raw`Access-Control-Allow-Origin.*\*`,
};

// ── Web Framework Routes ─────────────────────────────────────────────────────

export const HTTP_ROUTE = {
  jsts: String.raw`(?:app|router|server)\.\s*(?:get|post|put|delete|patch|use)\s*\(`,
  python: String.raw`@(?:app|bp|blueprint)\.(?:route|get|post|put|delete)|@router\.\w+\(|path\s*\(\s*["']`,
  rust: String.raw`#\[(?:get|post|put|delete|patch)\s*\(|\.route\s*\(`,
  csharp: String.raw`\[Http(?:Get|Post|Put|Delete|Patch)\]|MapGet|MapPost|MapPut|MapDelete`,
  java: String.raw`@(?:Get|Post|Put|Delete|Patch)Mapping|@RequestMapping`,
  go: String.raw`\.(?:GET|POST|PUT|DELETE|Handle|HandleFunc)\s*\(`,
  php: String.raw`Route::(?:get|post|put|delete|patch)\s*\(|->(?:get|post|put|delete)\s*\(`,
  ruby: String.raw`(?:get|post|put|delete|patch)\s+["']/|resources?\s+:\w+`,
  kotlin: String.raw`@(?:Get|Post|Put|Delete|Patch)Mapping|routing\s*\{`,
  swift: String.raw`\.(?:get|post|put|delete|patch)\s*\(|@(?:GET|POST|PUT|DELETE)`,
};

// ── Logging ──────────────────────────────────────────────────────────────────

export const CONSOLE_LOG = {
  jsts: String.raw`console\.\w+\s*\(`,
  python: String.raw`print\s*\(`,
  rust: String.raw`(?:println!|eprintln!|dbg!)\s*\(`,
  csharp: String.raw`Console\.Write(?:Line)?\s*\(`,
  java: String.raw`System\.(?:out|err)\.print(?:ln)?\s*\(`,
  go: String.raw`fmt\.Print(?:ln|f)?\s*\(`,
  powershell: String.raw`Write-(?:Host|Output|Warning|Error|Verbose|Debug)\s`,
  php: String.raw`(?:echo|print|var_dump|print_r|error_log)\s*\(`,
  ruby: String.raw`(?:puts|p|pp|print|warn)\s`,
  kotlin: String.raw`println\s*\(|print\s*\(`,
  swift: String.raw`print\s*\(|debugPrint\s*\(|dump\s*\(`,
};

export const STRUCTURED_LOG = {
  jsts: String.raw`(?:winston|bunyan|pino|log4js|logger)\.\w+\s*\(`,
  python: String.raw`logging\.\w+\s*\(|logger\.\w+\s*\(`,
  rust: String.raw`(?:log|tracing)::(?:info|warn|error|debug|trace)!\s*\(|slog`,
  csharp: String.raw`(?:ILogger|_logger|Logger)\.\w+\s*\(|Log\.(?:Information|Warning|Error)`,
  java: String.raw`(?:Logger|LOG|log|logger)\.\w+\s*\(|LoggerFactory\.getLogger`,
  go: String.raw`(?:log|zap|logrus|slog)\.\w+\s*\(`,
  php: String.raw`(?:Monolog|Log|\$logger)->\w+\s*\(|error_log\s*\(`,
  ruby: String.raw`(?:Rails\.logger|Logger\.new|logger)\.\w+\s*\(`,
  kotlin: String.raw`(?:Logger|log|logger)\.\w+\s*\(|LoggerFactory\.getLogger`,
  swift: String.raw`(?:Logger|os_log|OSLog)\.\w+\s*\(|Logger\(`,
};

// ── Testing ──────────────────────────────────────────────────────────────────

export const TEST_FUNCTION = {
  jsts: String.raw`(?:describe|it|test|beforeEach|afterEach)\s*\(`,
  python: String.raw`(?:def\s+test_\w+|class\s+Test\w+|@pytest)`,
  rust: String.raw`#\[(?:test|cfg\(test\))\]|mod\s+tests`,
  csharp: String.raw`\[(?:Test|TestMethod|Fact|Theory)\]`,
  java: String.raw`@(?:Test|Before|After|BeforeEach)\b`,
  go: String.raw`func\s+Test\w+\s*\(\s*t\s+\*testing\.T`,
  powershell: String.raw`Describe\s+["']|It\s+["']|Context\s+["']|BeforeAll\s*\{|BeforeEach\s*\{|AfterAll\s*\{|AfterEach\s*\{`,
  php: String.raw`(?:public\s+)?function\s+test\w+|@test\b|\$this->assert`,
  ruby: String.raw`(?:describe|it|context|before|after)\s+["']|def\s+test_`,
  kotlin: String.raw`@Test\b|@BeforeEach|@AfterEach`,
  swift: String.raw`func\s+test\w+\s*\(|XCTAssert`,
};

export const ASSERTION = {
  jsts: String.raw`(?:expect|assert|should)\s*[\.(]`,
  python: String.raw`(?:assert\s+\w|self\.assert\w|pytest\.raises)`,
  rust: String.raw`assert(?:_eq|_ne|_matches)?!\s*\(`,
  csharp: String.raw`Assert\.\w+\s*\(`,
  java: String.raw`assert(?:Equals|True|False|NotNull|Throws)\s*\(|assertThat\s*\(`,
  go: String.raw`(?:t\.(?:Error|Fatal|Log|Run)|assert\.\w+|require\.\w+)\s*\(`,
  powershell: String.raw`Should\s+-`,
  php: String.raw`\$this->assert\w+\s*\(|Assert::\w+\s*\(`,
  ruby: String.raw`(?:expect\(|assert_|should\b|must_)`,
  kotlin: String.raw`assert(?:Equals|True|False|NotNull|Throws)\s*\(|assertEquals\s*\(`,
  swift: String.raw`XCTAssert\w*\s*\(|#expect\s*\(`,
};

// ── Documentation ────────────────────────────────────────────────────────────

export const DOC_COMMENT = {
  jsts: String.raw`/\*\*[\s\S]*?\*/|///\s`,
  python: String.raw`(?:"""|''')[\s\S]*?(?:"""|''')`,
  rust: String.raw`///\s|//!\s|/\*\*`,
  csharp: String.raw`///\s*<summary>|///\s`,
  java: String.raw`/\*\*[\s\S]*?\*/`,
  go: String.raw`//\s+\w+\s`,
  powershell: String.raw`<#[\s\S]*?#>|\.SYNOPSIS|\.DESCRIPTION|\.PARAMETER|\.EXAMPLE`,
  php: String.raw`/\*\*[\s\S]*?\*/|///\s`,
  ruby: String.raw`#\s+@(?:param|return|note|example)|=begin[\s\S]*?=end`,
  kotlin: String.raw`/\*\*[\s\S]*?\*/|///\s`,
  swift: String.raw`///\s|/\*\*[\s\S]*?\*/`,
};

// ── Loop Constructs ──────────────────────────────────────────────────────────

export const FOR_LOOP = {
  jsts: String.raw`for\s*\(|\.forEach\s*\(|\.map\s*\(`,
  python: String.raw`for\s+\w+\s+in\s`,
  rust: String.raw`for\s+\w+\s+in\s|\.iter\(\)|\.for_each\(`,
  csharp: String.raw`for\s*\(|foreach\s*\(|\.ForEach\s*\(`,
  java: String.raw`for\s*\(|\.forEach\s*\(|\.stream\(\)`,
  go: String.raw`for\s+(?:\w+\s*:?=|range\s)`,
  powershell: String.raw`foreach\s*\(|for\s*\(|ForEach-Object|%\s*\{|\|\s*ForEach\b`,
  php: String.raw`for(?:each)?\s*\(|array_map\s*\(|array_walk\s*\(`,
  ruby: String.raw`\.each\b|\.map\b|\.select\b|\.inject\b|for\s+\w+\s+in\b`,
  kotlin: String.raw`for\s*\(|\.forEach\s*\{|\.map\s*\{`,
  swift: String.raw`for\s+\w+\s+in\s|\.forEach\s*\{|\.map\s*\{`,
};

// ── Type / Class Definitions ─────────────────────────────────────────────────

export const CLASS_DEF = {
  jsts: String.raw`class\s+\w+`,
  python: String.raw`class\s+\w+`,
  rust: String.raw`(?:pub\s+)?(?:struct|enum|trait)\s+\w+`,
  csharp: String.raw`(?:public|internal|private|protected)\s+(?:class|struct|record|interface)\s+\w+`,
  java: String.raw`(?:public|private|protected)\s+(?:class|interface|enum|record)\s+\w+`,
  go: String.raw`type\s+\w+\s+struct`,
  powershell: String.raw`class\s+\w+`,
  php: String.raw`(?:class|interface|trait|enum)\s+\w+`,
  ruby: String.raw`(?:class|module)\s+\w+`,
  kotlin: String.raw`(?:class|data\s+class|object|interface|sealed\s+class|enum\s+class)\s+\w+`,
  swift: String.raw`(?:class|struct|enum|protocol|actor)\s+\w+`,
};

// ── Package Manifests ────────────────────────────────────────────────────────

export const MANIFEST_FILES: Record<LangFamily, string[]> = {
  javascript: ["package.json"],
  typescript: ["package.json"],
  python: ["requirements.txt", "setup.py", "setup.cfg", "pyproject.toml", "Pipfile"],
  rust: ["Cargo.toml"],
  csharp: ["*.csproj", "packages.config", "Directory.Packages.props"],
  java: ["pom.xml", "build.gradle", "build.gradle.kts"],
  go: ["go.mod"],
  cpp: ["CMakeLists.txt", "Makefile", "conanfile.txt", "vcpkg.json"],
  powershell: ["*.psd1", "*.psm1"],
  terraform: ["*.tf", "terraform.tfvars", ".terraform.lock.hcl"],
  bicep: ["*.bicep", "bicepconfig.json"],
  arm: ["*.json"],
  php: ["composer.json", "composer.lock"],
  ruby: ["Gemfile", "Gemfile.lock", "*.gemspec"],
  kotlin: ["build.gradle.kts", "build.gradle", "pom.xml"],
  swift: ["Package.swift", "*.xcodeproj", "Podfile"],
  dockerfile: ["Dockerfile", "Containerfile", ".dockerignore"],
  unknown: [],
};

// ── Input Validation ─────────────────────────────────────────────────────────

export const INPUT_VALIDATION = {
  jsts: String.raw`(?:req\.(?:body|params|query)|request\.(?:body|params|query))\.\w+`,
  python: String.raw`request\.(?:form|args|json|data)\[`,
  rust: String.raw`(?:Query|Json|Path|Form)<`,
  csharp: String.raw`\[FromBody\]|\[FromQuery\]|\[FromRoute\]|Request\.(?:Form|Query)`,
  java: String.raw`@RequestParam|@PathVariable|@RequestBody|request\.getParameter`,
  go: String.raw`r\.(?:URL\.Query|FormValue|PostFormValue)\(`,
  powershell: String.raw`\[Parameter\s*\(Mandatory|\[ValidateNotNullOrEmpty\s*\(\)|\[ValidateSet\s*\(|\[ValidateRange\s*\(|\$PSBoundParameters`,
  php: String.raw`\$_(?:GET|POST|REQUEST)\[|\$request->(?:input|get|post)\s*\(`,
  ruby: String.raw`params\[|params\.(?:require|permit)\s*\(`,
  kotlin: String.raw`@RequestParam|@PathVariable|@RequestBody|call\.receive\b`,
  swift: String.raw`request\.(?:content|query|parameters)\b|req\.(?:content|query)\b`,
};

// ── Mutex / Lock ─────────────────────────────────────────────────────────────

export const MUTEX = {
  jsts: String.raw`(?:Mutex|Semaphore|Lock)\b`,
  python: String.raw`(?:threading\.Lock|asyncio\.Lock|multiprocessing\.Lock)\s*\(`,
  rust: String.raw`(?:Mutex|RwLock|Arc<Mutex)`,
  csharp: String.raw`(?:lock\s*\(|Monitor\.|Mutex\.|SemaphoreSlim)`,
  java: String.raw`(?:synchronized\b|ReentrantLock|Semaphore|CountDownLatch)`,
  go: String.raw`(?:sync\.(?:Mutex|RWMutex|WaitGroup)|<-\s*\w+)`,
  php: String.raw`flock\s*\(|sem_acquire\s*\(`,
  ruby: String.raw`Mutex\.new|Monitor\.new|\bsynchronize\b`,
  kotlin: String.raw`(?:synchronized\b|Mutex|ReentrantLock|Semaphore)`,
  swift: String.raw`NSLock|NSRecursiveLock|DispatchSemaphore|os_unfair_lock`,
};

// ── Database Access ──────────────────────────────────────────────────────────

export const DB_QUERY = {
  jsts: String.raw`\.query\s*\(|\.find\s*\(|\.findOne\s*\(|\.aggregate\s*\(|\.exec\s*\(`,
  python: String.raw`cursor\.execute\s*\(|\.query\s*\(|session\.(?:query|execute)\s*\(`,
  rust: String.raw`(?:diesel|sqlx|sea_orm)::.*query|\.execute\s*\(`,
  csharp: String.raw`\.(?:ExecuteNonQuery|ExecuteReader|ExecuteScalar|SaveChanges|ToList)\s*\(`,
  java: String.raw`\.(?:executeQuery|executeUpdate|createQuery|persist|merge|find)\s*\(`,
  go: String.raw`db\.(?:Query|QueryRow|Exec|QueryContext|ExecContext)\s*\(`,
  powershell: String.raw`Invoke-Sqlcmd|Invoke-DbaQuery|\[System\.Data\.SqlClient`,
  php: String.raw`\$(?:pdo|db|conn)->(?:query|prepare|exec)\s*\(|DB::(?:table|select|insert)\s*\(`,
  ruby: String.raw`ActiveRecord|\w+\.(?:where|find|find_by|select|pluck)\s*\(`,
  kotlin: String.raw`\.(?:executeQuery|createQuery|persist|find)\s*\(|transaction\s*\{`,
  swift: String.raw`\.(?:execute|prepare|query)\s*\(|NSFetchRequest`,
};

// ── HTTP Client ──────────────────────────────────────────────────────────────

export const HTTP_CLIENT = {
  jsts: String.raw`fetch\s*\(|axios\.\w+\s*\(|got\s*\(|request\s*\(`,
  python: String.raw`requests\.\w+\s*\(|aiohttp\.\w+\s*\(|httpx\.\w+\s*\(|urllib\.request`,
  rust: String.raw`reqwest::(?:get|Client)|hyper::Client`,
  csharp: String.raw`HttpClient\.\w+\s*\(|WebClient\.\w+\s*\(`,
  java: String.raw`HttpClient\.\w+\s*\(|OkHttpClient|RestTemplate\.\w+\s*\(|WebClient\.\w+\s*\(`,
  go: String.raw`http\.(?:Get|Post|NewRequest)\s*\(|http\.Client`,
  powershell: String.raw`Invoke-(?:WebRequest|RestMethod)\s`,
  php: String.raw`curl_\w+\s*\(|file_get_contents\s*\(|Guzzle|Http::(?:get|post)`,
  ruby: String.raw`Net::HTTP|HTTParty|Faraday|RestClient`,
  kotlin: String.raw`HttpClient\.\w+\s*\(|OkHttpClient|Fuel\.\w+\s*\(|ktor.*client`,
  swift: String.raw`URLSession\.\w+\s*\(|URLRequest\s*\(|Alamofire`,
};

// ── Config / Constants ───────────────────────────────────────────────────────

export const MAGIC_NUMBER = {
  jsts: String.raw`(?:===?|!==?|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|length|port|interval)\s*[:=]\s*\d{3,}`,
  python: String.raw`(?:==|!=|<=?|>=?|and|or)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|port|interval)\s*=\s*\d{3,}`,
  rust: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|port)\s*[:=]\s*\d{3,}`,
  csharp: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:Timeout|Delay|Limit|Max|Min|Size|Count|Port)\s*=\s*\d{3,}`,
  java: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:TIMEOUT|DELAY|LIMIT|MAX|MIN|SIZE|COUNT|PORT)\s*=\s*\d{3,}`,
  go: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|port)\s*[:=]\s*\d{3,}`,
  powershell: String.raw`(?:-eq|-ne|-lt|-le|-gt|-ge)\s*\d{2,}|(?:Timeout|Delay|Limit|Max|Min|Size|Count|Port)\s*=\s*\d{3,}`,
};

// ── TODO / FIXME ─────────────────────────────────────────────────────────────

export const TODO_FIXME = {
  all: String.raw`(?://|#|/\*)\s*(?:TODO|FIXME|HACK|XXX|TEMP|WORKAROUND)\b`,
};

// ── Linter Suppression ───────────────────────────────────────────────────────

export const LINTER_DISABLE = {
  jsts: String.raw`eslint-disable|tslint:disable|@ts-ignore|@ts-nocheck`,
  python: String.raw`noqa|type:\s*ignore|# pragma:\s*no cover|pylint:\s*disable`,
  rust: String.raw`#\[allow\(|#!\[allow\(`,
  csharp: String.raw`#pragma\s+warning\s+disable|SuppressMessage`,
  java: String.raw`@SuppressWarnings|NOSONAR|noinspection`,
  go: String.raw`//nolint`,
  powershell: String.raw`\[Diagnostics\.CodeAnalysis\.SuppressMessage|#\s*PSScriptAnalyzer`,
  php: String.raw`@phpstan-ignore|@psalm-suppress|phpcs:ignore`,
  ruby: String.raw`rubocop:disable|# :nocov:|# :reek:`,
  kotlin: String.raw`@Suppress\(|@SuppressWarnings|detekt:`,
  swift: String.raw`swiftlint:disable|nolint`,
};

// ── Serialization ────────────────────────────────────────────────────────────

export const UNSAFE_DESERIALIZATION = {
  jsts: String.raw`JSON\.parse\s*\(\s*(?:req\.|request\.|body)`,
  python: String.raw`pickle\.loads?\s*\(|yaml\.(?:load|unsafe_load)\s*\(|marshal\.loads?\s*\(`,
  rust: String.raw`serde_yaml::from_str.*(?:unsafe|user)`,
  csharp: String.raw`BinaryFormatter\.Deserialize|JsonConvert\.DeserializeObject.*(?:TypeNameHandling|TypeNameAssemblyFormatHandling)`,
  java: String.raw`ObjectInputStream\.readObject|XMLDecoder\.readObject|readUnshared|new\s+ObjectInputStream|\w+\.readObject\s*\(`,
  go: String.raw`encoding/gob|json\.Unmarshal\(.*(?:req\.|request\.)`,
  powershell: String.raw`Import-Clixml|\[System\.Runtime\.Serialization.*Deserialize|ConvertFrom-Json.*\$`,
  php: String.raw`unserialize\s*\(|json_decode\s*\(\s*\$_`,
  ruby: String.raw`Marshal\.load|YAML\.load(?!_safe)|Oj\.load`,
  kotlin: String.raw`ObjectInputStream\.readObject|readObject\s*\(`,
  swift: String.raw`NSKeyedUnarchiver\.unarchiveObject|JSONDecoder\(\)\.decode.*(?:request|input)`,
};

// ── Memory / Resource ────────────────────────────────────────────────────────

export const RESOURCE_LEAK = {
  jsts: String.raw`createReadStream|createWriteStream|new\s+(?:WebSocket|EventSource)`,
  python: String.raw`open\s*\([^)]*\)\s*(?!=\s*with)`,
  rust: String.raw`File::open|TcpStream::connect`,
  csharp: String.raw`new\s+(?:FileStream|StreamReader|StreamWriter|SqlConnection|HttpClient)\s*\(`,
  java: String.raw`new\s+(?:FileInputStream|FileOutputStream|BufferedReader|Connection|Socket)\s*\(`,
  go: String.raw`os\.(?:Open|Create)\s*\(|net\.(?:Dial|Listen)\s*\(`,
  powershell: String.raw`New-Object\s+System\.IO\.(?:StreamReader|StreamWriter|FileStream)|\[System\.IO\.File\]::Open`,
  php: String.raw`fopen\s*\(|fsockopen\s*\(|stream_socket_client\s*\(`,
  ruby: String.raw`File\.open\s*\((?!.*\bdo\b)|IO\.(?:popen|sysopen)\s*\(`,
  kotlin: String.raw`FileInputStream\s*\(|FileOutputStream\s*\(|Socket\s*\(`,
  swift: String.raw`FileHandle\(|InputStream\(|OutputStream\(`,
};

// ── Deprecated APIs ──────────────────────────────────────────────────────────

export const DEPRECATED_API = {
  jsts: String.raw`new\s+Buffer\s*\(|\.substr\s*\(|\.escape\s*\(|__proto__`,
  python: String.raw`\.readfp\s*\(|optparse\.|imp\.|asyncio\.coroutine`,
  rust: String.raw`#\[deprecated\]`,
  csharp: String.raw`WebClient\b|\.GetSection\s*\(\s*["']appSettings["']\)`,
  java: String.raw`\.newInstance\s*\(\s*\)(?!\s*;.*class)|Date\s*\(\s*\)|Thread\.stop\s*\(`,
  go: String.raw`ioutil\.\w+|syscall\.StringToUTF16Ptr`,
  php: String.raw`mysql_\w+\s*\(|ereg\s*\(|split\s*\(|create_function\s*\(`,
  ruby: String.raw`File\.exists\?|URI\.escape|Fixnum\b|Bignum\b`,
  kotlin: String.raw`\.newInstance\s*\(\s*\)|Date\s*\(\s*\)`,
  swift: String.raw`URLRequest.*HTTPBody|NSURLConnection\b`,
};

// ── Framework-Specific Security Patterns ─────────────────────────────────────
// Detect common security misconfigurations in popular web frameworks.

/** Flask/Django debug mode or insecure settings */
export const FRAMEWORK_DEBUG_MODE = {
  python: String.raw`app\.run\s*\([^)]*debug\s*=\s*True|DEBUG\s*=\s*True|FLASK_DEBUG\s*=\s*["']?1`,
  jsts: String.raw`app\.set\s*\(\s*['"]env['"]\s*,\s*['"]development['"]`,
  csharp: String.raw`\.UseDeveloperExceptionPage\s*\(`,
  java: String.raw`server\.error\.include-stacktrace\s*=\s*always`,
  php: String.raw`APP_DEBUG\s*=\s*true|'debug'\s*=>\s*true|display_errors.*On`,
  ruby: String.raw`config\.consider_all_requests_local\s*=\s*true`,
  kotlin: String.raw`server\.error\.include-stacktrace\s*=\s*always`,
  swift: String.raw`\.environment\s*=\s*\.development`,
};

/** Missing HTTPS / security middleware in frameworks */
export const FRAMEWORK_MISSING_SECURITY = {
  python: String.raw`@app\.route\b(?!.*login_required|.*permission_required).*def\s+\w+`,
  jsts: String.raw`app\.listen\s*\(\s*(?:80|3000)\b(?!.*https)`,
  java: String.raw`\.antMatchers\s*\(\s*["']/\*\*["']\s*\)\s*\.permitAll`,
  csharp: String.raw`\.AllowAnonymous\b.*(?:Delete|Admin|Update|Transfer)`,
  go: String.raw`http\.ListenAndServe\s*\((?!.*tls|.*TLS)`,
  php: String.raw`Route::(?:get|post)\s*\((?!.*middleware|.*auth)`,
  ruby: String.raw`skip_before_action\s*:\s*(?:authenticate|verify)`,
  swift: String.raw`app\.http\.server\.configuration\.hostname\s*=\s*["']0\.0\.0\.0`,
};

/** Framework-specific secret key / session misconfigurations */
export const FRAMEWORK_SECRET_KEY = {
  python: String.raw`SECRET_KEY\s*=\s*["'][^"']{0,15}["']|app\.secret_key\s*=\s*["'][^"']{0,15}["']`,
  jsts: String.raw`secret\s*:\s*["'][^"']{0,15}["'](?=.*(?:session|cookie|jwt))`,
  java: String.raw`secret\.key\s*=\s*["'][^"']{0,20}["']`,
  csharp: String.raw`\.AddJwtBearer\s*\([^)]*(?:["']secret["']|IssuerSigningKey\s*=\s*new\s+SymmetricSecurityKey\s*\(\s*Encoding\.\w+\.GetBytes\s*\(\s*["'][^"']{0,20}["'])`,
  php: String.raw`APP_KEY\s*=\s*["'][^"']{0,15}["']|'key'\s*=>\s*["'][^"']{0,15}["']`,
  ruby: String.raw`secret_key_base\s*=\s*["'][^"']{0,20}["']|config\.secret_key_base\s*=\s*["']`,
};

/** Framework-specific mass assignment / over-posting vulnerabilities */
export const FRAMEWORK_MASS_ASSIGNMENT = {
  python: String.raw`request\.(?:form|json|data)\s*\.to_dict\s*\(|ModelForm\s*\(\s*[^)]*exclude\s*=\s*\[\s*\]\)`,
  jsts: String.raw`Object\.assign\s*\(\s*\w+\s*,\s*req\.body|\.create\s*\(\s*req\.body\s*\)|\.update\s*\(\s*req\.body\s*\)|spread.*req\.body`,
  java: String.raw`@ModelAttribute\b.*(?:without|no).*(?:binding|whitelist)|setAllowedFields\s*\(\s*\)`,
  csharp: String.raw`\[Bind\s*\(\s*\)\]|TryUpdateModelAsync\s*\(\s*\w+\s*\)|\.FromBody\].*(?:without|no).*(?:validation)`,
  php: String.raw`\$request->all\s*\(\)|\$fillable\s*=\s*\[\s*\]|\$guarded\s*=\s*\[\s*\]`,
  ruby: String.raw`params\.permit!|attr_accessible.*:all|without.*strong_parameters`,
};

/** Go-specific: Gin/Echo/Fiber security patterns */
export const FRAMEWORK_GO_WEB = {
  go: String.raw`gin\.Default\s*\(\)|c\.(?:Bind|ShouldBind)\w*\s*\(\s*&\w+\s*\)(?!.*(?:Validate|Valid))`,
};

/** Rust-specific: Actix-web / Axum security patterns */
export const FRAMEWORK_RUST_WEB = {
  rust: String.raw`HttpServer::new\s*\([^)]*\)\.bind\s*\(\s*["']0\.0\.0\.0|\.app_data\s*\(\s*web::JsonConfig::default\s*\(\)\s*\)(?!.*limit|.*error)`,
};

// ─── Infrastructure as Code Patterns ─────────────────────────────────────────

/** IaC resource definitions */
export const IAC_RESOURCE_DEF = {
  terraform: String.raw`resource\s+"[^"]+"\s+"[^"]+"\s*\{`,
  bicep: String.raw`resource\s+\w+\s+'[^']+'\s*=`,
  arm: String.raw`"type"\s*:\s*"Microsoft\.\w+/\w+"`,
};

/** IaC hardcoded secrets / passwords / keys */
export const IAC_HARDCODED_SECRET = {
  terraform: String.raw`(?:password|secret|key|token|api_key|access_key|secret_key|connection_string|value)\s*=\s*"[^"$\{]{4,}"`,
  bicep: String.raw`(?:password|secret|key|token|apiKey|accessKey|connectionString)\s*:\s*'[^']{4,}'`,
  arm: String.raw`"(?:adminPassword|password|secret|key|connectionString|storageAccountKey)"\s*:\s*\{\s*"value"\s*:\s*"[^[\]{}]{4,}"`,
};

/** IaC missing encryption at rest */
export const IAC_MISSING_ENCRYPTION = {
  terraform: String.raw`encryption_at_rest_enabled\s*=\s*false|encryption.*enabled\s*=\s*false`,
  bicep: String.raw`status\s*:\s*'Disabled'`,
  arm: String.raw`"status"\s*:\s*"Disabled"`,
};

/** IaC public access enabled */
export const IAC_PUBLIC_ACCESS = {
  terraform: String.raw`public_access_enabled\s*=\s*true|public_network_access_enabled\s*=\s*true|publicly_accessible\s*=\s*true|associate_public_ip_address\s*=\s*true`,
  bicep: String.raw`publicAccess\s*:\s*'Enabled'|publicNetworkAccess\s*:\s*'Enabled'|publiclyAccessible\s*:\s*true`,
  arm: String.raw`"publicAccess"\s*:\s*"Enabled"|"publicNetworkAccess"\s*:\s*"Enabled"|"publiclyAccessible"\s*:\s*true`,
};

/** IaC overly permissive network rules (0.0.0.0/0 ingress, open ports) */
export const IAC_OPEN_NETWORK = {
  terraform: String.raw`cidr_blocks\s*=\s*\[\s*"0\.0\.0\.0/0"\s*\]|source_address_prefix\s*=\s*"\*"|ingress\s*\{[^}]*from_port\s*=\s*0[^}]*to_port\s*=\s*65535`,
  bicep: String.raw`sourceAddressPrefix\s*:\s*'\*'|destinationPortRange\s*:\s*'\*'`,
  arm: String.raw`"sourceAddressPrefix"\s*:\s*"\*"|"destinationPortRange"\s*:\s*"\*"`,
};

/** IaC overly permissive IAM / RBAC */
export const IAC_OVERPERMISSIVE_IAM = {
  terraform: String.raw`actions\s*=\s*\[\s*"\*"\s*\]|effect\s*=\s*"Allow"[^}]*actions\s*=\s*\[\s*"\*"|policy\s*=.*"Action"\s*:\s*"\*"`,
  bicep: String.raw`roleDefinitionId\s*:.*Owner|actions\s*:\s*\[\s*'\*'\s*\]`,
  arm: String.raw`"roleDefinitionId"\s*:.*Owner|"actions"\s*:\s*\[\s*"\*"\s*\]`,
};

/** IaC missing HTTPS / TLS enforcement */
export const IAC_MISSING_HTTPS = {
  terraform: String.raw`https_only\s*=\s*false|enable_https_traffic_only\s*=\s*false|ssl_enforcement_enabled\s*=\s*false|minimum_tls_version\s*=\s*"TLS1_0"|protocol\s*=\s*"Http"`,
  bicep: String.raw`httpsOnly\s*:\s*false|supportsHttpsTrafficOnly\s*:\s*false|sslEnforcement\s*:\s*'Disabled'|minTlsVersion\s*:\s*'1\.0'`,
  arm: String.raw`"httpsOnly"\s*:\s*false|"supportsHttpsTrafficOnly"\s*:\s*false|"sslEnforcement"\s*:\s*"Disabled"|"minTlsVersion"\s*:\s*"1\.0"`,
};

/** IaC missing logging / monitoring */
export const IAC_MISSING_LOGGING = {
  terraform: String.raw`logging\s*\{[^}]*enabled\s*=\s*false|enable_logging\s*=\s*false`,
  bicep: String.raw`diagnosticSettings\s*:\s*\[\s*\]|logging\s*:\s*\{\s*enabled\s*:\s*false`,
  arm: String.raw`"diagnosticSettings"\s*:\s*\[\s*\]|"logging"\s*:\s*\{\s*"enabled"\s*:\s*false`,
};

/** IaC missing tags (cost / compliance tagging) */
export const IAC_MISSING_TAGS_CHECK = {
  terraform: String.raw`resource\s+"(?:azurerm|aws|google)_[^"]+"\s+"[^"]+"\s*\{(?:(?!tags\s*=)[^}])*\}`,
  bicep: String.raw`resource\s+\w+\s+'[^']+'\s*=\s*\{(?:(?!tags\s*:)[^}])*\}`,
  arm: String.raw`"type"\s*:\s*"Microsoft\.\w+/\w+"[^}]*(?!"tags"\s*:)`,
};

/** IaC hardcoded resource locations / IDs */
export const IAC_HARDCODED_LOCATION = {
  terraform: String.raw`location\s*=\s*"(?:eastus|westus|centralus|westeurope|northeurope|southeastasia|eastasia|uksouth|ukwest|japaneast|japanwest|australiaeast|canadacentral|brazilsouth)"`,
  bicep: String.raw`location\s*:\s*'(?:eastus|westus|centralus|westeurope|northeurope|southeastasia|eastasia|uksouth|ukwest|japaneast)'`,
  arm: String.raw`"location"\s*:\s*"(?:eastus|westus|centralus|westeurope|northeurope|southeastasia|eastasia|uksouth)"`,
};

/** IaC insecure defaults — HTTP allowed, no min TLS version */
export const IAC_INSECURE_DEFAULT = {
  terraform: String.raw`(?:min_tls_version|minimum_tls_version)\s*=\s*"(?:TLS1_0|TLS1_1|1\.0|1\.1)"|ssl_policy\s*\{[^}]*min_protocol_version\s*=\s*"TLSv1(?:\.1)?"`,
  bicep: String.raw`minTlsVersion\s*:\s*'(?:1\.0|1\.1)'|sslPolicy\s*:\s*\{[^}]*minProtocolVersion\s*:\s*'TLSv1(?:\.1)?'`,
  arm: String.raw`"minTlsVersion"\s*:\s*"(?:1\.0|1\.1)"|"minProtocolVersion"\s*:\s*"TLSv1(?:\.1)?"`,
};

/** IaC missing backup / disaster recovery config */
export const IAC_MISSING_BACKUP = {
  terraform: String.raw`backup_policy_id\s*=\s*""|backup\s*\{[^}]*enabled\s*=\s*false|geo_redundant_backup_enabled\s*=\s*false`,
  bicep: String.raw`backup\s*:\s*\{\s*enabled\s*:\s*false|geoRedundantBackup\s*:\s*'Disabled'`,
  arm: String.raw`"backup"\s*:\s*\{\s*"enabled"\s*:\s*false|"geoRedundantBackup"\s*:\s*"Disabled"`,
};
