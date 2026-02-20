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
 * Returns true if the language uses braces for blocks (all except Python).
 */
export function isBraceLang(lang: LangFamily): boolean {
  return lang !== "python" && lang !== "unknown";
}

// ─── Pattern Builders ────────────────────────────────────────────────────────

/**
 * Build a regex that matches patterns for the given language family.
 * Falls back to matching ALL languages if lang is "unknown".
 */
export function langPattern(
  lang: LangFamily,
  patterns: Partial<Record<LangFamily | "jsts" | "all", string>>
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
    return new RegExp(parts.join("|"), "gi");
  }

  source = patterns[lang];
  if (!source && isJsTs(lang)) {
    source = patterns["jsts"];
  }
  if (!source) {
    source = patterns["all"];
  }
  if (!source) return null;
  return new RegExp(source, "gi");
}

/**
 * Build a single regex that matches across ALL supported languages.
 * Use this when you want to detect an issue regardless of declared language.
 */
export function allLangPattern(
  patterns: Partial<Record<LangFamily | "jsts", string>>
): RegExp {
  const parts: string[] = [];
  for (const v of Object.values(patterns)) {
    if (v) parts.push(v);
  }
  return new RegExp(parts.join("|"), "gi");
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
};

export const HARDCODED_ENV = {
  jsts: String.raw`process\.env\.\w+\s*\|\|\s*["'][^"']+["']`,
  python: String.raw`os\.environ\.get\s*\(\s*["'][^"']+["']\s*,\s*["'][^"']+["']\s*\)`,
  rust: String.raw`env::var\s*\(.*\)\.unwrap_or\s*\(\s*["'][^"']+["']`,
  csharp: String.raw`GetEnvironmentVariable\s*\(.*\)\s*\?\?\s*["'][^"']+["']`,
  java: String.raw`getenv\s*\(.*\)\s*(?:!=\s*null\s*\?|==\s*null)`,
  go: String.raw`os\.Getenv\s*\(.*\)\s*==\s*["']`,
};

// ── Function Definitions ─────────────────────────────────────────────────────

export const FUNCTION_DEF = {
  jsts: String.raw`(?:function\s+\w+|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))`,
  python: String.raw`(?:def|async\s+def)\s+\w+\s*\(`,
  rust: String.raw`(?:pub\s+)?(?:async\s+)?fn\s+\w+`,
  csharp: String.raw`(?:public|private|protected|internal|static|async|override|virtual)\s+[\w<>\[\]]+\s+\w+\s*\(`,
  java: String.raw`(?:public|private|protected|static|final|synchronized|abstract)\s+[\w<>\[\]]+\s+\w+\s*\(`,
  go: String.raw`func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+\s*\(`,
};

// ── Error Handling ───────────────────────────────────────────────────────────

export const TRY_CATCH = {
  jsts: String.raw`try\s*\{`,
  python: String.raw`try\s*:`,
  rust: String.raw`(?:\.unwrap\(\)|\.expect\(|panic!\()`,
  csharp: String.raw`try\s*\{`,
  java: String.raw`try\s*\{`,
  go: String.raw`if\s+err\s*!=\s*nil`,
};

export const EMPTY_CATCH = {
  jsts: String.raw`catch\s*\([^)]*\)\s*\{\s*\}`,
  python: String.raw`except(?:\s+\w+)?(?:\s+as\s+\w+)?\s*:\s*(?:pass|\.\.\.)\s*$`,
  rust: String.raw`\.unwrap_or_default\(\)`,
  csharp: String.raw`catch\s*(?:\([^)]*\))?\s*\{\s*\}`,
  java: String.raw`catch\s*\([^)]*\)\s*\{\s*\}`,
  go: String.raw`if\s+err\s*!=\s*nil\s*\{\s*\}|_\s*=\s*\w+\(`,
};

export const GENERIC_CATCH = {
  jsts: String.raw`catch\s*\(\s*\w+\s*\)`,
  python: String.raw`except\s*:(?!\s*\w)|except\s+Exception\s*:`,
  csharp: String.raw`catch\s*\(\s*Exception\s`,
  java: String.raw`catch\s*\(\s*(?:Exception|Throwable)\s`,
  go: String.raw`if\s+err\s*!=\s*nil`,
};

export const PANIC_UNWRAP = {
  rust: String.raw`\.unwrap\(\)|\.expect\(|panic!\(|unreachable!\(`,
  go: String.raw`panic\s*\(|log\.Fatal`,
  jsts: String.raw`process\.exit\s*\(`,
  python: String.raw`sys\.exit\s*\(|os\._exit\s*\(`,
  csharp: String.raw`Environment\.Exit\s*\(|Environment\.FailFast\s*\(`,
  java: String.raw`System\.exit\s*\(|Runtime\.getRuntime\(\)\.halt\s*\(`,
};

// ── Weak / Dynamic Types ────────────────────────────────────────────────────

export const WEAK_TYPE = {
  jsts: String.raw`:\s*any\b|as\s+any\b|<any>`,
  python: String.raw`:\s*Any\b|->\s*Any\b`,
  rust: String.raw`unsafe\s*\{|as\s+\*(?:const|mut)`,
  csharp: String.raw`:\s*dynamic\b|:\s*object\b|as\s+object\b`,
  java: String.raw`:\s*Object\b|<\s*\?\s*>|@SuppressWarnings\s*\(\s*["']unchecked["']\s*\)`,
  go: String.raw`interface\s*\{\s*\}|any\b`,
};

// ── Async / Concurrency ─────────────────────────────────────────────────────

export const ASYNC_FUNCTION = {
  jsts: String.raw`async\s+function|async\s*\(`,
  python: String.raw`async\s+def\s`,
  rust: String.raw`async\s+fn\s`,
  csharp: String.raw`async\s+Task|async\s+ValueTask`,
  java: String.raw`CompletableFuture|@Async|ExecutorService`,
  go: String.raw`go\s+\w+\s*\(|go\s+func\s*\(`,
};

export const MISSING_AWAIT = {
  jsts: String.raw`(?:^|\s)(?!await\s)(?:fetch|axios|got|request)\s*\(`,
  python: String.raw`(?:^|\s)(?!await\s)(?:aiohttp|httpx)\.`,
  rust: String.raw`(?:^|\s)(?!\.await)tokio::`,
  csharp: String.raw`(?:^|\s)(?!await\s)(?:HttpClient|Task\.Run)`,
  java: String.raw`(?:^|\s)(?!\.get\(\))CompletableFuture`,
};

export const SHARED_MUTABLE = {
  jsts: String.raw`(?:let|var)\s+\w+\s*=.*(?:setTimeout|setInterval|addEventListener)`,
  python: String.raw`(?:threading\.Thread|multiprocessing\.Process).*(?:global\s|nonlocal\s)`,
  rust: String.raw`(?:static\s+mut\b|Arc<Mutex|Rc<RefCell)`,
  csharp: String.raw`(?:static\s+(?!readonly)[\w<>\[\]]+\s+\w+\s*=|volatile\s)`,
  java: String.raw`(?:static\s+(?!final)[\w<>\[\]]+\s+\w+\s*=)`,
  go: String.raw`(?:var\s+\w+\s+\w+\s*\n.*go\s+func|sync\.Mutex)`,
};

// ── Imports / Dependencies ───────────────────────────────────────────────────

export const WILDCARD_IMPORT = {
  jsts: String.raw`import\s+\*\s+as\s`,
  python: String.raw`from\s+\w+\s+import\s+\*`,
  java: String.raw`import\s+[\w.]+\.\*\s*;`,
  csharp: String.raw`using\s+static\s+[\w.]+\.\*`,
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
};

// ── Security: Command Injection ──────────────────────────────────────────────

export const COMMAND_INJECTION = {
  jsts: String.raw`(?:exec|spawn|execSync|execFile)\s*\(.*(?:\+|\$\{)`,
  python: String.raw`(?:os\.system|os\.popen|subprocess\.(?:call|run|Popen))\s*\(.*(?:\+|f["']|\.format|%s)`,
  rust: String.raw`Command::new\s*\(.*(?:format!|&\w+)`,
  csharp: String.raw`Process\.Start\s*\(.*(?:\+|\$["'])`,
  java: String.raw`Runtime\.getRuntime\(\)\.exec\s*\(.*\+|ProcessBuilder\s*\(.*\+`,
  go: String.raw`exec\.Command\s*\(.*(?:\+|fmt\.Sprintf)`,
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
};

// ── Security: Eval / Dynamic Execution ───────────────────────────────────────

export const EVAL_USAGE = {
  jsts: String.raw`\beval\s*\(|new\s+Function\s*\(`,
  python: String.raw`\beval\s*\(|\bexec\s*\(|compile\s*\(`,
  rust: String.raw`(?:)`,  // Rust has no eval equivalent
  csharp: String.raw`CSharpScript\.EvaluateAsync|Roslyn\.Scripting`,
  java: String.raw`ScriptEngine\.eval\s*\(|Nashorn|Groovy`,
  go: String.raw`(?:)`,  // Go has no eval equivalent
};

// ── Security: TLS / Certificate ──────────────────────────────────────────────

export const TLS_DISABLED = {
  jsts: String.raw`NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|rejectUnauthorized\s*:\s*false`,
  python: String.raw`verify\s*=\s*False|ssl\._create_unverified_context`,
  rust: String.raw`danger_accept_invalid_certs\s*\(\s*true\)`,
  csharp: String.raw`ServerCertificateValidationCallback\s*=.*true|ServicePointManager\.ServerCertificateValidationCallback`,
  java: String.raw`TrustAllCerts|X509TrustManager|trustAllCerts`,
  go: String.raw`InsecureSkipVerify\s*:\s*true`,
};

// ── Security: CORS ───────────────────────────────────────────────────────────

export const CORS_WILDCARD = {
  jsts: String.raw`(?:Access-Control-Allow-Origin|cors)\s*[:({]\s*['"]\*`,
  python: String.raw`(?:CORS_ALLOW_ALL_ORIGINS|CORS_ORIGIN_ALLOW_ALL)\s*=\s*True|allow_origins\s*=\s*\[["']\*["']\]`,
  csharp: String.raw`AllowAnyOrigin\s*\(\)|WithOrigins\s*\(\s*["']\*["']\s*\)`,
  java: String.raw`@CrossOrigin\s*$|allowedOrigins\s*=.*\*|addMapping\s*\(\s*["']/\*\*["']\s*\)`,
  go: String.raw`AllowAllOrigins\s*:\s*true|Access-Control-Allow-Origin.*\*`,
};

// ── Web Framework Routes ─────────────────────────────────────────────────────

export const HTTP_ROUTE = {
  jsts: String.raw`(?:app|router|server)\.\s*(?:get|post|put|delete|patch|use)\s*\(`,
  python: String.raw`@(?:app|bp|blueprint)\.(?:route|get|post|put|delete)|@router\.\w+\(|path\s*\(\s*["']`,
  rust: String.raw`#\[(?:get|post|put|delete|patch)\s*\(|\.route\s*\(`,
  csharp: String.raw`\[Http(?:Get|Post|Put|Delete|Patch)\]|MapGet|MapPost|MapPut|MapDelete`,
  java: String.raw`@(?:Get|Post|Put|Delete|Patch)Mapping|@RequestMapping`,
  go: String.raw`\.(?:GET|POST|PUT|DELETE|Handle|HandleFunc)\s*\(`,
};

// ── Logging ──────────────────────────────────────────────────────────────────

export const CONSOLE_LOG = {
  jsts: String.raw`console\.\w+\s*\(`,
  python: String.raw`print\s*\(`,
  rust: String.raw`(?:println!|eprintln!|dbg!)\s*\(`,
  csharp: String.raw`Console\.Write(?:Line)?\s*\(`,
  java: String.raw`System\.(?:out|err)\.print(?:ln)?\s*\(`,
  go: String.raw`fmt\.Print(?:ln|f)?\s*\(`,
};

export const STRUCTURED_LOG = {
  jsts: String.raw`(?:winston|bunyan|pino|log4js|logger)\.\w+\s*\(`,
  python: String.raw`logging\.\w+\s*\(|logger\.\w+\s*\(`,
  rust: String.raw`(?:log|tracing)::(?:info|warn|error|debug|trace)!\s*\(|slog`,
  csharp: String.raw`(?:ILogger|_logger|Logger)\.\w+\s*\(|Log\.(?:Information|Warning|Error)`,
  java: String.raw`(?:Logger|LOG|log|logger)\.\w+\s*\(|LoggerFactory\.getLogger`,
  go: String.raw`(?:log|zap|logrus|slog)\.\w+\s*\(`,
};

// ── Testing ──────────────────────────────────────────────────────────────────

export const TEST_FUNCTION = {
  jsts: String.raw`(?:describe|it|test|beforeEach|afterEach)\s*\(`,
  python: String.raw`(?:def\s+test_\w+|class\s+Test\w+|@pytest)`,
  rust: String.raw`#\[(?:test|cfg\(test\))\]|mod\s+tests`,
  csharp: String.raw`\[(?:Test|TestMethod|Fact|Theory)\]`,
  java: String.raw`@(?:Test|Before|After|BeforeEach)\b`,
  go: String.raw`func\s+Test\w+\s*\(\s*t\s+\*testing\.T`,
};

export const ASSERTION = {
  jsts: String.raw`(?:expect|assert|should)\s*[\.(]`,
  python: String.raw`(?:assert\s+\w|self\.assert\w|pytest\.raises)`,
  rust: String.raw`assert(?:_eq|_ne|_matches)?!\s*\(`,
  csharp: String.raw`Assert\.\w+\s*\(`,
  java: String.raw`assert(?:Equals|True|False|NotNull|Throws)\s*\(|assertThat\s*\(`,
  go: String.raw`(?:t\.(?:Error|Fatal|Log|Run)|assert\.\w+|require\.\w+)\s*\(`,
};

// ── Documentation ────────────────────────────────────────────────────────────

export const DOC_COMMENT = {
  jsts: String.raw`/\*\*[\s\S]*?\*/|///\s`,
  python: String.raw`(?:"""|''')[\s\S]*?(?:"""|''')`,
  rust: String.raw`///\s|//!\s|/\*\*`,
  csharp: String.raw`///\s*<summary>|///\s`,
  java: String.raw`/\*\*[\s\S]*?\*/`,
  go: String.raw`//\s+\w+\s`,
};

// ── Loop Constructs ──────────────────────────────────────────────────────────

export const FOR_LOOP = {
  jsts: String.raw`for\s*\(|\.forEach\s*\(|\.map\s*\(`,
  python: String.raw`for\s+\w+\s+in\s`,
  rust: String.raw`for\s+\w+\s+in\s|\.iter\(\)|\.for_each\(`,
  csharp: String.raw`for\s*\(|foreach\s*\(|\.ForEach\s*\(`,
  java: String.raw`for\s*\(|\.forEach\s*\(|\.stream\(\)`,
  go: String.raw`for\s+(?:\w+\s*:?=|range\s)`,
};

// ── Type / Class Definitions ─────────────────────────────────────────────────

export const CLASS_DEF = {
  jsts: String.raw`class\s+\w+`,
  python: String.raw`class\s+\w+`,
  rust: String.raw`(?:pub\s+)?(?:struct|enum|trait)\s+\w+`,
  csharp: String.raw`(?:public|internal|private|protected)\s+(?:class|struct|record|interface)\s+\w+`,
  java: String.raw`(?:public|private|protected)\s+(?:class|interface|enum|record)\s+\w+`,
  go: String.raw`type\s+\w+\s+struct`,
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
};

// ── Mutex / Lock ─────────────────────────────────────────────────────────────

export const MUTEX = {
  jsts: String.raw`(?:Mutex|Semaphore|Lock)\b`,
  python: String.raw`(?:threading\.Lock|asyncio\.Lock|multiprocessing\.Lock)\s*\(`,
  rust: String.raw`(?:Mutex|RwLock|Arc<Mutex)`,
  csharp: String.raw`(?:lock\s*\(|Monitor\.|Mutex\.|SemaphoreSlim)`,
  java: String.raw`(?:synchronized\b|ReentrantLock|Semaphore|CountDownLatch)`,
  go: String.raw`(?:sync\.(?:Mutex|RWMutex|WaitGroup)|<-\s*\w+)`,
};

// ── Database Access ──────────────────────────────────────────────────────────

export const DB_QUERY = {
  jsts: String.raw`\.query\s*\(|\.find\s*\(|\.findOne\s*\(|\.aggregate\s*\(|\.exec\s*\(`,
  python: String.raw`cursor\.execute\s*\(|\.query\s*\(|session\.(?:query|execute)\s*\(`,
  rust: String.raw`(?:diesel|sqlx|sea_orm)::.*query|\.execute\s*\(`,
  csharp: String.raw`\.(?:ExecuteNonQuery|ExecuteReader|ExecuteScalar|SaveChanges|ToList)\s*\(`,
  java: String.raw`\.(?:executeQuery|executeUpdate|createQuery|persist|merge|find)\s*\(`,
  go: String.raw`db\.(?:Query|QueryRow|Exec|QueryContext|ExecContext)\s*\(`,
};

// ── HTTP Client ──────────────────────────────────────────────────────────────

export const HTTP_CLIENT = {
  jsts: String.raw`fetch\s*\(|axios\.\w+\s*\(|got\s*\(|request\s*\(`,
  python: String.raw`requests\.\w+\s*\(|aiohttp\.\w+\s*\(|httpx\.\w+\s*\(|urllib\.request`,
  rust: String.raw`reqwest::(?:get|Client)|hyper::Client`,
  csharp: String.raw`HttpClient\.\w+\s*\(|WebClient\.\w+\s*\(`,
  java: String.raw`HttpClient\.\w+\s*\(|OkHttpClient|RestTemplate\.\w+\s*\(|WebClient\.\w+\s*\(`,
  go: String.raw`http\.(?:Get|Post|NewRequest)\s*\(|http\.Client`,
};

// ── Config / Constants ───────────────────────────────────────────────────────

export const MAGIC_NUMBER = {
  jsts: String.raw`(?:===?|!==?|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|length|port|interval)\s*[:=]\s*\d{3,}`,
  python: String.raw`(?:==|!=|<=?|>=?|and|or)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|port|interval)\s*=\s*\d{3,}`,
  rust: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|port)\s*[:=]\s*\d{3,}`,
  csharp: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:Timeout|Delay|Limit|Max|Min|Size|Count|Port)\s*=\s*\d{3,}`,
  java: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:TIMEOUT|DELAY|LIMIT|MAX|MIN|SIZE|COUNT|PORT)\s*=\s*\d{3,}`,
  go: String.raw`(?:==|!=|<=?|>=?|&&|\|\|)\s*\d{2,}|(?:timeout|delay|limit|max|min|size|count|port)\s*[:=]\s*\d{3,}`,
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
};

// ── Serialization ────────────────────────────────────────────────────────────

export const UNSAFE_DESERIALIZATION = {
  jsts: String.raw`JSON\.parse\s*\(\s*(?:req\.|request\.|body)`,
  python: String.raw`pickle\.loads?\s*\(|yaml\.(?:load|unsafe_load)\s*\(|marshal\.loads?\s*\(`,
  rust: String.raw`serde_yaml::from_str.*(?:unsafe|user)`,
  csharp: String.raw`BinaryFormatter\.Deserialize|JsonConvert\.DeserializeObject.*(?:TypeNameHandling|TypeNameAssemblyFormatHandling)`,
  java: String.raw`ObjectInputStream\.readObject|XMLDecoder\.readObject|readUnshared`,
  go: String.raw`encoding/gob|json\.Unmarshal\(.*(?:req\.|request\.)`,
};

// ── Memory / Resource ────────────────────────────────────────────────────────

export const RESOURCE_LEAK = {
  jsts: String.raw`createReadStream|createWriteStream|new\s+(?:WebSocket|EventSource)`,
  python: String.raw`open\s*\([^)]*\)\s*(?!=\s*with)`,
  rust: String.raw`File::open|TcpStream::connect`,
  csharp: String.raw`new\s+(?:FileStream|StreamReader|StreamWriter|SqlConnection|HttpClient)\s*\(`,
  java: String.raw`new\s+(?:FileInputStream|FileOutputStream|BufferedReader|Connection|Socket)\s*\(`,
  go: String.raw`os\.(?:Open|Create)\s*\(|net\.(?:Dial|Listen)\s*\(`,
};

// ── Deprecated APIs ──────────────────────────────────────────────────────────

export const DEPRECATED_API = {
  jsts: String.raw`new\s+Buffer\s*\(|\.substr\s*\(|\.escape\s*\(|__proto__`,
  python: String.raw`\.readfp\s*\(|optparse\.|imp\.|asyncio\.coroutine`,
  rust: String.raw`#\[deprecated\]`,
  csharp: String.raw`WebClient\b|\.GetSection\s*\(\s*["']appSettings["']\)`,
  java: String.raw`\.newInstance\s*\(\s*\)(?!\s*;.*class)|Date\s*\(\s*\)|Thread\.stop\s*\(`,
  go: String.raw`ioutil\.\w+|syscall\.StringToUTF16Ptr`,
};
