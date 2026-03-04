/**
 * Auto-Fix Patch Rules
 *
 * Extracted from the evaluators monolith. Contains the PATCH_RULES registry
 * and the enrichWithPatches function that attaches deterministic, single-line
 * code-fix patches to findings.
 */

import type { Finding } from "../types.js";

/**
 * Auto-fix patch rules: each entry maps a finding pattern to a function that
 * can produce a Patch from the source code line. Only deterministic,
 * single-line replacements are emitted — no guessing.
 */
const PATCH_RULES: Array<{
  /** Match against ruleId or title */
  match: RegExp;
  /** Given the source line, return { oldText, newText } or null */
  generate: (line: string) => { oldText: string; newText: string } | null;
}> = [
  // ── Deprecated APIs ──
  // new Buffer() → Buffer.from()
  {
    match: /deprecated|DEPRECATED_API/i,
    generate: (line) => {
      const m = line.match(/new\s+Buffer\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `Buffer.from(${m[1]})` };
    },
  },

  // ── Transport Security ──
  // http:// → https:// (non-localhost)
  {
    match: /unencrypted.*http|http.*connection/i,
    generate: (line) => {
      const m = line.match(/(["'])http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)([^"']+)\1/);
      if (!m) return null;
      return { oldText: `${m[1]}http://${m[2]}${m[1]}`, newText: `${m[1]}https://${m[2]}${m[1]}` };
    },
  },
  // ws:// → wss:// (insecure WebSocket)
  {
    match: /insecure.*websocket|ws:\/\//i,
    generate: (line) => {
      const m = line.match(/(["'])ws:\/\/([^"']+)\1/);
      if (!m) return null;
      return { oldText: `${m[1]}ws://${m[2]}${m[1]}`, newText: `${m[1]}wss://${m[2]}${m[1]}` };
    },
  },

  // ── Cryptography ──
  // Math.random() → crypto.randomUUID()
  {
    match: /insecure.*random/i,
    generate: (line) => {
      const m = line.match(/Math\.random\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "crypto.randomUUID()" };
    },
  },
  // MD5/SHA-1 → SHA-256
  {
    match: /weak.*hash|weak.*crypto/i,
    generate: (line) => {
      const m = line.match(/createHash\s*\(\s*(["'])(md5|sha1|sha-1)\1\s*\)/i);
      if (!m) return null;
      return { oldText: m[0], newText: `createHash(${m[1]}sha256${m[1]})` };
    },
  },
  // ECB encryption mode → GCM
  {
    match: /insecure.*ecb|encryption.*mode/i,
    generate: (line) => {
      const m = line.match(/(["'])(aes-\d+-)(ecb)\1/i);
      if (!m) return null;
      return { oldText: `${m[1]}${m[2]}${m[3]}${m[1]}`, newText: `${m[1]}${m[2]}gcm${m[1]}` };
    },
  },

  // ── Injection Prevention ──
  // eval() → Function() or comment warning
  {
    match: /dangerous.*eval|eval.*usage/i,
    generate: (line) => {
      const m = line.match(/\beval\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `new Function(${m[1]})() /* TODO: eliminate dynamic code execution */` };
    },
  },
  // innerHTML → textContent (XSS prevention)
  {
    match: /xss.*innerhtml|innerhtml/i,
    generate: (line) => {
      const m = line.match(/(\.innerHTML)\s*=\s*/);
      if (!m) return null;
      return { oldText: m[1], newText: ".textContent" };
    },
  },
  // document.write → safer alternative
  {
    match: /document\.write/i,
    generate: (line) => {
      const m = line.match(/document\.write\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `document.body.insertAdjacentHTML("beforeend", ${m[1]})` };
    },
  },
  // exec() → execFile() (command injection)
  {
    match: /command.*injection|potential command/i,
    generate: (line) => {
      const m = line.match(/\bexec\s*\(/);
      if (!m) return null;
      return { oldText: "exec(", newText: "execFile(" };
    },
  },
  // User input in RegExp → escaped
  {
    match: /redos|regexp.*user/i,
    generate: (line) => {
      const m = line.match(/new\s+RegExp\s*\((\w+)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `new RegExp(${m[1]}.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"))` };
    },
  },

  // ── Equality & Type Safety ──
  // == → === (loose equality)
  {
    match: /loose.*equal|==.*strict/i,
    generate: (line) => {
      const m = line.match(/([^!=<>])={2}(?!=)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}===` };
    },
  },
  // != → !== (loose inequality)
  {
    match: /loose.*equal/i,
    generate: (line) => {
      const m = line.match(/!={1}(?!=)/);
      if (!m) return null;
      return { oldText: m[0], newText: "!==" };
    },
  },
  // throw "string" → throw new Error("string")
  {
    match: /throwing.*string|string.*literal.*instead.*error/i,
    generate: (line) => {
      const m = line.match(/throw\s+(["'])([^"']*)\1/);
      if (!m) return null;
      return { oldText: m[0], newText: `throw new Error(${m[1]}${m[2]}${m[1]})` };
    },
  },
  // any → unknown
  {
    match: /weak.*type|unsafe.*type|any.*type/i,
    generate: (line) => {
      const m = line.match(/:\s*any\b/);
      if (!m) return null;
      return { oldText: m[0], newText: ": unknown" };
    },
  },

  // ── Variable Declarations ──
  // var → let (maintainability)
  {
    match: /var.*declaration|var.*keyword|var.*instead/i,
    generate: (line) => {
      const m = line.match(/\bvar\s+/);
      if (!m) return null;
      return { oldText: m[0], newText: "let " };
    },
  },

  // ── Logging ──
  // console.log → structured logger placeholder
  {
    match: /console.*log.*structured|console.*instead.*structured/i,
    generate: (line) => {
      const m = line.match(/console\.log\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `logger.info(${m[1]})` };
    },
  },
  // console.error as sole error strategy
  {
    match: /console\.error.*sole/i,
    generate: (line) => {
      const m = line.match(/console\.error\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `logger.error(${m[1]})` };
    },
  },

  // ── Error Handling ──
  // Empty catch block → catch with error handling comment
  {
    match: /empty.*catch|catch.*swallow/i,
    generate: (line) => {
      const m = line.match(/catch\s*\(\s*\)\s*\{\s*\}/);
      if (!m) return null;
      return { oldText: m[0], newText: "catch (error) { /* TODO: handle error appropriately */ }" };
    },
  },
  // catch without error parameter
  {
    match: /catch.*discard|catch.*error.*object/i,
    generate: (line) => {
      const m = line.match(/catch\s*\(\s*\)\s*\{/);
      if (!m) return null;
      return { oldText: m[0], newText: "catch (error) {" };
    },
  },

  // ── Security Headers & CORS ──
  // Wildcard CORS → specific origin
  {
    match: /wildcard.*cors|cors.*wildcard|permissive.*cors/i,
    generate: (line) => {
      const m = line.match(/(origin\s*:\s*)(["'])\*\2/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}process.env.ALLOWED_ORIGIN || ${m[2]}*${m[2]}` };
    },
  },
  // CSP unsafe-inline → nonce-based
  {
    match: /content-security-policy|csp.*unsafe/i,
    generate: (line) => {
      const m = line.match(/(["'])unsafe-inline\1/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}nonce-\${nonce}${m[1]}` };
    },
  },

  // ── Cookie Security ──
  // Cookie without secure flag
  {
    match: /cookie.*security|cookie.*secure|cookie.*httponly/i,
    generate: (line) => {
      const m = line.match(/(secure\s*:\s*)false/);
      if (m) return { oldText: m[0], newText: `${m[1]}true` };
      const m2 = line.match(/(httpOnly\s*:\s*)false/i);
      if (m2) return { oldText: m2[0], newText: `${m2[1]}true` };
      return null;
    },
  },

  // ── Authentication ──
  // JWT without verification
  {
    match: /jwt.*without.*verif|jwt.*decoded/i,
    generate: (line) => {
      const m = line.match(/jwt\.decode\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `jwt.verify(${m[1]}, process.env.JWT_SECRET)` };
    },
  },
  // TLS verification disabled
  {
    match: /tls.*verif|certificate.*valid.*disabled/i,
    generate: (line) => {
      const m = line.match(/(rejectUnauthorized\s*:\s*)false/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}true` };
    },
  },

  // ── Async/Concurrency ──
  // .then() without .catch()
  {
    match: /promise.*catch|then.*without.*catch/i,
    generate: (line) => {
      const m = line.match(/(\.then\s*\([^)]*\))\s*;/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}.catch((err) => { throw err; });` };
    },
  },
  // Synchronous fs operations → async
  {
    match: /synchronous.*blocking|blocking.*i\/o|sync.*file/i,
    generate: (line) => {
      const m = line.match(
        /\b(readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|readdirSync|statSync|unlinkSync|renameSync|copyFileSync)\b/,
      );
      if (!m) return null;
      const asyncName = m[1].replace("Sync", "");
      return { oldText: m[1], newText: `await ${asyncName}` };
    },
  },

  // ── Performance ──
  // new Array() → []
  {
    match: /array.*constructor/i,
    generate: (line) => {
      const m = line.match(/new\s+Array\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "[]" };
    },
  },
  // new Object() → {}
  {
    match: /object.*constructor/i,
    generate: (line) => {
      const m = line.match(/new\s+Object\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "{}" };
    },
  },
  // String concatenation in loop → template literal guidance
  {
    match: /string.*concat.*loop/i,
    generate: (line) => {
      const m = line.match(/(\w+)\s*\+=\s*(["'])/);
      if (!m) return null;
      return { oldText: m[0], newText: `/* TODO: use array.push() + join() instead */ ${m[0]}` };
    },
  },

  // ── Database ──
  // SELECT * → explicit columns reminder
  {
    match: /select\s*\*/i,
    generate: (line) => {
      const m = line.match(/SELECT\s+\*/i);
      if (!m) return null;
      return { oldText: m[0], newText: "SELECT /* TODO: specify columns */" };
    },
  },

  // ── Serialization ──
  // JSON.parse without try/catch → safe wrapper
  {
    match: /unsafe.*deserialization|deserialization/i,
    generate: (line) => {
      const m = line.match(/JSON\.parse\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `(() => { try { return JSON.parse(${m[1]}); } catch { return null; } })()` };
    },
  },

  // ── Process & Lifecycle ──
  // process.exit() → graceful shutdown
  {
    match: /abrupt.*process|process.*termination/i,
    generate: (line) => {
      const m = line.match(/process\.exit\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `process.exitCode = ${m[1] || "1"}; /* allow graceful cleanup */` };
    },
  },

  // ── Docker / Container ──
  // :latest tag → pinned version
  {
    match: /latest.*tag|docker.*latest/i,
    generate: (line) => {
      const m = line.match(/(FROM\s+\S+):latest/i);
      if (!m) return null;
      return { oldText: `${m[1]}:latest`, newText: `${m[1]}:lts-slim /* TODO: pin to specific version */` };
    },
  },
  // USER root → non-root user
  {
    match: /docker.*root|container.*root/i,
    generate: (line) => {
      const m = line.match(/^USER\s+root\s*$/i);
      if (!m) return null;
      return { oldText: m[0], newText: "USER node" };
    },
  },

  // ── CI/CD ──
  // npm install → npm ci
  {
    match: /npm install.*instead.*ci|npm ci/i,
    generate: (line) => {
      const m = line.match(/npm\s+install(?!\s+\S)/);
      if (!m) return null;
      return { oldText: m[0], newText: "npm ci" };
    },
  },

  // ── Network ──
  // 0.0.0.0 binding → localhost
  {
    match: /binds.*all.*interfaces|0\.0\.0\.0/i,
    generate: (line) => {
      const m = line.match(/(["'])0\.0\.0\.0\1/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}127.0.0.1${m[1]}` };
    },
  },
  // External calls without timeout
  {
    match: /without.*timeout|network.*timeout/i,
    generate: (line) => {
      const m = line.match(/(fetch\s*\(\s*\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}, { signal: AbortSignal.timeout(30000) })` };
    },
  },

  // ── Accessibility ──
  // outline: none → visible focus style
  {
    match: /focus.*indicator.*removed|outline.*none/i,
    generate: (line) => {
      const m = line.match(/outline\s*:\s*none/);
      if (!m) return null;
      return { oldText: m[0], newText: "outline: 2px solid currentColor" };
    },
  },
  // img without alt → add alt placeholder
  {
    match: /image.*alt|missing.*alt/i,
    generate: (line) => {
      const m = line.match(/<img\s+(?!.*alt\s*=)/);
      if (!m) return null;
      return { oldText: m[0], newText: `<img alt="" ` };
    },
  },

  // ── Configuration ──
  // Hardcoded connection string → env var
  {
    match: /hardcoded.*connection|connection.*string.*code/i,
    generate: (line) => {
      const m = line.match(/(["'])((?:mongodb|postgres|mysql|redis):\/\/[^"']+)\1/);
      if (!m) return null;
      return { oldText: m[0], newText: `process.env.DATABASE_URL || ${m[0]}` };
    },
  },
  // Debug mode enabled
  {
    match: /debug.*mode.*enabled|debug.*enabled/i,
    generate: (line) => {
      const m = line.match(/(debug\s*[:=]\s*)true/i);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}process.env.NODE_ENV !== "production"` };
    },
  },

  // ── Session Security ──
  // Insecure session config
  {
    match: /insecure.*session/i,
    generate: (line) => {
      const m = line.match(/(secure\s*:\s*)false/);
      if (m) return { oldText: m[0], newText: `${m[1]}process.env.NODE_ENV === "production"` };
      return null;
    },
  },

  // ── Input Validation ──
  // Request body without size limit
  {
    match: /body.*parser.*size|request.*body.*size/i,
    generate: (line) => {
      const m = line.match(/(\.json\s*\(\s*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}{ limit: "1mb" })` };
    },
  },

  // ── Deprecated Patterns ──
  // __dirname in ESM → import.meta
  {
    match: /__dirname.*esm|__filename.*esm/i,
    generate: (line) => {
      const m = line.match(/__dirname/);
      if (!m) return null;
      return { oldText: m[0], newText: `new URL(".", import.meta.url).pathname` };
    },
  },

  // ── XML Security ──
  // XML without XXE protection
  {
    match: /xxe|xml.*protect/i,
    generate: (line) => {
      const m = line.match(/(new\s+(?:DOMParser|XMLParser)\s*\(\s*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}{ noent: false, dtd: false })` };
    },
  },

  // ── Python Patches ──

  // Python: hashlib.md5/sha1 → sha256
  {
    match: /weak.*hash|weak.*crypto|insecure.*hash/i,
    generate: (line) => {
      const m = line.match(/hashlib\.(md5|sha1)\s*\(/i);
      if (!m) return null;
      return { oldText: m[0], newText: "hashlib.sha256(" };
    },
  },
  // Python: random.random() → secrets.token_hex()
  {
    match: /insecure.*random|weak.*random/i,
    generate: (line) => {
      const m = line.match(/random\.(?:random|randint|choice)\s*\([^)]*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "secrets.token_hex(32)" };
    },
  },
  // Python: pickle.loads → json.loads
  {
    match: /unsafe.*deseri|pickle.*untrusted|insecure.*deseri/i,
    generate: (line) => {
      const m = line.match(/pickle\.loads?\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "json.loads(" };
    },
  },
  // Python: yaml.load(data) → yaml.safe_load(data)
  {
    match: /unsafe.*yaml|yaml.*load|insecure.*yaml/i,
    generate: (line) => {
      const m = line.match(/yaml\.load\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "yaml.safe_load(" };
    },
  },
  // Python: os.system → subprocess.run
  {
    match: /command.*inject|os\.system|shell.*inject/i,
    generate: (line) => {
      const m = line.match(/os\.system\s*\(\s*(f?["'])/);
      if (!m) return null;
      return { oldText: "os.system(", newText: "subprocess.run(" };
    },
  },
  // Python: assert for validation → raise ValueError
  {
    match: /assert.*valid|assert.*production|assert.*security/i,
    generate: (line) => {
      const m = line.match(/^(\s*)assert\s+(.*),\s*["'](.*?)["']\s*$/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}if not (${m[2]}): raise ValueError("${m[3]}")` };
    },
  },
  // Python DEBUG=True → environment variable
  {
    match: /debug.*true|debug.*production/i,
    generate: (line) => {
      const m = line.match(/^(\s*)DEBUG\s*=\s*True\s*$/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}DEBUG = os.environ.get('DEBUG', 'False') == 'True'` };
    },
  },

  // ── Go Patches ──

  // Go: fmt.Sprintf in SQL → parameterized query marker
  {
    match: /sql.*inject|string.*format.*sql/i,
    generate: (line) => {
      const m = line.match(/fmt\.Sprintf\s*\(\s*["']([^"']*?)%[sdv]/);
      if (!m) return null;
      if (!/SELECT|INSERT|UPDATE|DELETE|WHERE/i.test(m[1])) return null;
      return { oldText: "fmt.Sprintf(", newText: "/* TODO: use parameterized query ($1) */ fmt.Sprintf(" };
    },
  },
  // Go: http.ListenAndServe → http.ListenAndServeTLS
  {
    match: /unencrypted.*http|http.*tls|insecure.*transport/i,
    generate: (line) => {
      const m = line.match(/http\.ListenAndServe\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "http.ListenAndServeTLS(" };
    },
  },

  // ── Java Patches ──

  // Java: MessageDigest MD5/SHA-1 → SHA-256
  {
    match: /weak.*hash|weak.*digest|insecure.*hash/i,
    generate: (line) => {
      const m = line.match(/MessageDigest\.getInstance\s*\(\s*["'](MD5|SHA-1)["']\s*\)/i);
      if (!m) return null;
      return { oldText: m[0], newText: `MessageDigest.getInstance("SHA-256")` };
    },
  },
  // Java: new Random() → SecureRandom
  {
    match: /insecure.*random|predictable.*random/i,
    generate: (line) => {
      const m = line.match(/new\s+Random\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "new SecureRandom()" };
    },
  },
  // Java: DES/3DES → AES (cipher)
  {
    match: /weak.*cipher|insecure.*cipher|des.*encrypt/i,
    generate: (line) => {
      const m = line.match(/Cipher\.getInstance\s*\(\s*["'](?:DES|DESede|3DES)(?:\/[^"']*)?["']\s*\)/i);
      if (!m) return null;
      return { oldText: m[0], newText: `Cipher.getInstance("AES/GCM/NoPadding")` };
    },
  },
  // Java: Runtime.exec with string → ProcessBuilder
  {
    match: /command.*inject|runtime.*exec|os.*command/i,
    generate: (line) => {
      const m = line.match(/Runtime\.getRuntime\s*\(\s*\)\.exec\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "new ProcessBuilder(" };
    },
  },
  // Java: XMLInputFactory without disabling DTD
  {
    match: /xxe|xml.*injection|xml.*entity/i,
    generate: (line) => {
      const m = line.match(/XMLInputFactory\.newInstance\s*\(\s*\)/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `XMLInputFactory.newInstance() /* TODO: factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false) */`,
      };
    },
  },

  // ── C# Patches ──

  // C#: MD5/SHA1 → SHA256
  {
    match: /weak.*hash|insecure.*hash|obsolete.*hash/i,
    generate: (line) => {
      const m = line.match(/(MD5|SHA1)\.Create\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "SHA256.Create()" };
    },
  },
  // C#: new Random() → RandomNumberGenerator
  {
    match: /insecure.*random|predictable.*random/i,
    generate: (line) => {
      const m = line.match(/new\s+Random\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: "RandomNumberGenerator.Create()" };
    },
  },
  // C#: AllowAnyOrigin → specific origin comment
  {
    match: /cors.*wildcard|permissive.*cors|cors.*any/i,
    generate: (line) => {
      const m = line.match(/\.AllowAnyOrigin\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `.WithOrigins("https://your-domain.com") /* TODO: restrict origins */` };
    },
  },
  // C#: FromSqlRaw with interpolation → FromSqlInterpolated
  {
    match: /sql.*inject|raw.*sql/i,
    generate: (line) => {
      const m = line.match(/FromSqlRaw\s*\(\s*\$/);
      if (!m) return null;
      return { oldText: "FromSqlRaw($", newText: "FromSqlInterpolated($" };
    },
  },

  // ── Rust Patches ──

  // Rust: unwrap() → expect() with message
  {
    match: /unwrap.*panic|unwrap.*error|unhandled.*unwrap/i,
    generate: (line) => {
      const m = line.match(/\.unwrap\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `.expect("TODO: handle this error")` };
    },
  },
  // Rust: unsafe block → comment marker
  {
    match: /unsafe.*block|unsafe.*usage/i,
    generate: (line) => {
      const m = line.match(/^(\s*)unsafe\s*\{/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}// SAFETY: TODO: document why unsafe is needed\n${m[1]}unsafe {` };
    },
  },

  // ── Hardcoded Secrets ──
  // Hardcoded password/secret → environment variable
  {
    match: /hardcoded.*password|password.*literal|hardcoded.*secret|hardcoded.*credential/i,
    generate: (line) => {
      const m = line.match(/(password|passwd|pwd|secret)\s*[:=]\s*(["'])([^"']{4,})\2/i);
      if (!m) return null;
      const envVar = m[1].toUpperCase();
      return { oldText: `${m[2]}${m[3]}${m[2]}`, newText: `process.env.${envVar} || ${m[2]}${m[2]}` };
    },
  },
  // Hardcoded API key → environment variable
  {
    match: /hardcoded.*api.?key|api.?key.*hardcoded|hardcoded.*token|secret.*key.*literal/i,
    generate: (line) => {
      const m = line.match(/(api_?[Kk]ey|api_?[Tt]oken|auth_?[Tt]oken|access_?[Tt]oken)\s*[:=]\s*(["'])([^"']{8,})\2/i);
      if (!m) return null;
      const normalized = m[1].toUpperCase().replace(/([a-z])([A-Z])/g, "$1_$2");
      return { oldText: `${m[2]}${m[3]}${m[2]}`, newText: `process.env.${normalized} || ${m[2]}${m[2]}` };
    },
  },

  // ── Path Traversal ──
  {
    match: /path.*traversal|directory.*traversal|path.*manipulation/i,
    generate: (line) => {
      const m = line.match(/path\.join\s*\(([^,]+),\s*(\w+)\s*\)/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `path.resolve(${m[1]}, path.basename(${m[2]})) /* TODO: validate no traversal */`,
      };
    },
  },

  // ── Open Redirect ──
  {
    match: /open.*redirect|unvalidat.*redirect|redirect.*user.*input/i,
    generate: (line) => {
      const m = line.match(/(res\.redirect\s*\(\s*)(req\.(?:query|params|body)\.\w+)\s*\)/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `${m[1]}/* TODO: validate against allowlist */ new URL(${m[2]}, \`\${req.protocol}://\${req.get("host")}\`).pathname)`,
      };
    },
  },

  // ── Timing-Safe Comparison ──
  {
    match: /timing.*attack|constant.*time.*compar|timing.*safe/i,
    generate: (line) => {
      const m = line.match(/([\w.]+)\s*===?\s*([\w.]*(?:secret|token|key|hash|digest|signature)[\w.]*)/i);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `crypto.timingSafeEqual(Buffer.from(String(${m[1]})), Buffer.from(String(${m[2]})))`,
      };
    },
  },

  // ── Error Information Leakage ──
  {
    match: /error.*leak|stack.*trace.*expos|error.*information.*disclos|sensitive.*error/i,
    generate: (line) => {
      const m = line.match(/(res\.(?:send|json)\s*\(\s*(?:err|error))\.stack\b/);
      if (!m) return null;
      return { oldText: `${m[1]}.stack`, newText: `${m[1]}.message || "Internal server error"` };
    },
  },

  // ── Link Security ──
  // target="_blank" without rel="noopener"
  {
    match: /noopener|reverse.*tabnab|target.*blank.*rel/i,
    generate: (line) => {
      const m = line.match(/(target\s*=\s*["']_blank["'])(?!.*rel\s*=)/);
      if (!m) return null;
      return { oldText: m[1], newText: `${m[1]} rel="noopener noreferrer"` };
    },
  },

  // ── Password Hashing ──
  {
    match: /bcrypt.*rounds|salt.*rounds|weak.*hash.*factor|low.*cost.*factor/i,
    generate: (line) => {
      const m = line.match(/(bcrypt\.(?:hash|genSalt)\s*\(\s*\w+\s*,\s*)(\d+)/);
      if (!m) return null;
      if (parseInt(m[2]) >= 10) return null;
      return { oldText: m[0], newText: `${m[1]}12` };
    },
  },

  // ── Log Injection ──
  {
    match: /log.*inject|logging.*untrusted|unsanit.*log/i,
    generate: (line) => {
      const m = line.match(/((?:console|logger)\.\w+\s*\(\s*)(req\.(?:body|query|params)\.\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}String(${m[2]}).replace(/[\\n\\r]/g, ""))` };
    },
  },

  // ── Python: f-string in SQL execute ──
  {
    match: /sql.*injection.*f.?string|f.?string.*sql|python.*sql.*inject/i,
    generate: (line) => {
      const m = line.match(/\.execute\s*\(\s*f(["'])/);
      if (!m) return null;
      return { oldText: m[0], newText: `.execute(/* TODO: use parameterized query with %s placeholders */ f${m[1]}` };
    },
  },

  // ── Python: Flask debug mode ──
  {
    match: /flask.*debug|debug.*production.*flask/i,
    generate: (line) => {
      const m = line.match(/(app\.run\s*\([^)]*debug\s*=\s*)True/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}os.environ.get("FLASK_DEBUG", "False") == "True"` };
    },
  },

  // ── Python: bare except clause ──
  {
    match: /bare.*except|broad.*except|generic.*except.*clause/i,
    generate: (line) => {
      const m = line.match(/^(\s*)except\s*:/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}except Exception:  # TODO: use specific exception` };
    },
  },

  // ── Python: hardcoded Flask secret key ──
  {
    match: /flask.*secret.*key|hardcoded.*secret.*key/i,
    generate: (line) => {
      const m = line.match(
        /((?:app\.)?(?:config\s*\[\s*["']SECRET_KEY["']\s*\]\s*=|secret_key\s*=)\s*)(["'])([^"']+)\2/i,
      );
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}os.environ.get("SECRET_KEY", secrets.token_hex(32))` };
    },
  },

  // ── Python: insecure tempfile ──
  {
    match: /insecure.*temp|tempfile.*mktemp|predictable.*temp/i,
    generate: (line) => {
      const m = line.match(/tempfile\.mktemp\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "tempfile.mkstemp(" };
    },
  },

  // ── File Permissions ──
  {
    match: /insecure.*permission|chmod.*777|file.*permission.*broad|overly.*permissive/i,
    generate: (line) => {
      const mShell = line.match(/chmod\s+(777|666)\b/);
      if (mShell) return { oldText: mShell[0], newText: `chmod ${mShell[1] === "777" ? "750" : "640"}` };
      const mPy = line.match(/os\.chmod\s*\(\s*(\w+)\s*,\s*0o(777|666)\s*\)/);
      if (mPy) return { oldText: mPy[0], newText: `os.chmod(${mPy[1]}, 0o${mPy[2] === "777" ? "750" : "640"})` };
      return null;
    },
  },

  // ── Go: unchecked error ──
  {
    match: /unchecked.*error|error.*not.*checked|ignored.*error.*return/i,
    generate: (line) => {
      const m = line.match(/^(\s*)\w+\s*,\s*_\s*:?=\s*/);
      if (!m) return null;
      return { oldText: ", _", newText: ", err" };
    },
  },

  // ── Java: catching generic Exception ──
  {
    match: /catch.*generic.*exception|broad.*exception.*catch|catching.*exception.*instead/i,
    generate: (line) => {
      const m = line.match(/catch\s*\(\s*Exception\s+(\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `catch (/* TODO: use specific exception type */ Exception ${m[1]})` };
    },
  },

  // ── Hardcoded Port ──
  {
    match: /hardcoded.*port|port.*hardcoded|magic.*number.*port/i,
    generate: (line) => {
      const m = line.match(/(\.listen\s*\(\s*)(\d{4,5})\s*([,)])/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}parseInt(process.env.PORT || "${m[2]}")${m[3]}` };
    },
  },

  // ── Prototype Pollution ──
  {
    match: /prototype.*pollut|__proto__.*inject|property.*inject/i,
    generate: (line) => {
      const m = line.match(/(\w+)\[(\w+)\]\s*=\s*/);
      if (!m) return null;
      return { oldText: m[0], newText: `/* TODO: validate key is not __proto__, constructor, or prototype */ ${m[0]}` };
    },
  },

  // ── SSRF Prevention ──
  {
    match: /ssrf|server.?side.*request.*forg|unvalidat.*url.*fetch/i,
    generate: (line) => {
      const m = line.match(/((?:fetch|axios\.get|http\.get|got)\s*\(\s*)([\w.]+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}/* TODO: validate URL against allowlist to prevent SSRF */ ${m[2]})` };
    },
  },

  // ── Mass Assignment ──
  {
    match: /mass.*assign|over.?post|unfiltered.*body|object.*spread.*request/i,
    generate: (line) => {
      const m = line.match(/(\.create\s*\(\s*)req\.body\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}{ /* TODO: allowlist specific fields */ ...req.body })` };
    },
  },

  // ── HTML Sanitization ──
  {
    match: /xss.*sanitiz|unsanit.*html|html.*inject.*user/i,
    generate: (line) => {
      const m = line.match(/(\.innerHTML\s*=\s*)(\w+)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}DOMPurify.sanitize(${m[2]})` };
    },
  },

  // ── Security Headers / Helmet ──
  {
    match: /missing.*helmet|security.*header.*missing|no.*security.*middleware/i,
    generate: (line) => {
      const m = line.match(/(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[0]} /* TODO: add app.use(helmet()) for security headers */` };
    },
  },
];

/**
 * Multi-line patch rules produce replacements that may span multiple source
 * lines. Each rule receives a context window around the finding and returns
 * a patch whose oldText/newText may contain newlines.
 */
interface MultiLinePatchRule {
  /** Match against ruleId or title */
  match: RegExp;
  /** How many lines before/after the finding line to include in the window */
  contextLines: number;
  /** Given the window, produce a multi-line patch or null */
  generate: (
    windowLines: string[],
    windowStartLine: number,
    findingLine: number,
  ) => { oldText: string; newText: string; startLine: number; endLine: number } | null;
}

const MULTI_LINE_PATCH_RULES: MultiLinePatchRule[] = [
  // ── Multi-line empty catch block → re-throw with error parameter ──
  {
    match: /empty.*catch|catch.*swallow|catch.*discard/i,
    contextLines: 6,
    generate: (windowLines, windowStart, _findingLine) => {
      for (let i = 0; i < windowLines.length; i++) {
        const line = windowLines[i];
        const catchMatch = line.match(/^(\s*)(?:}\s*)?catch\s*\(([^)]*)\)\s*\{\s*$/);
        if (!catchMatch) continue;
        const indent = catchMatch[1];
        const param = catchMatch[2].trim() || "error";
        // Find matching closing brace — everything inside must be empty/comments
        let braceDepth = 1;
        let endIdx = -1;
        for (let j = i + 1; j < windowLines.length; j++) {
          const inner = windowLines[j];
          for (const ch of inner) {
            if (ch === "{") braceDepth++;
            if (ch === "}") braceDepth--;
          }
          if (braceDepth === 0) {
            endIdx = j;
            break;
          }
          // Non-empty, non-comment line means the catch isn't truly empty
          if (inner.trim() !== "" && !/^\s*\/\//.test(inner)) return null;
        }
        if (endIdx <= i) continue;
        const oldText = windowLines.slice(i, endIdx + 1).join("\n");
        const newText = `${indent}catch (${param}) {\n${indent}  /* TODO: handle error appropriately */ throw ${param};\n${indent}}`;
        return { oldText, newText, startLine: windowStart + i, endLine: windowStart + endIdx };
      }
      return null;
    },
  },

  // ── Bare JSON.parse → try/catch wrapped ──
  {
    match: /unsafe.*json|json.*parse.*unguard|deserialization(?!.*already)/i,
    contextLines: 2,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(const|let|var)\s+(\w+)\s*=\s*JSON\.parse\s*\(([^)]+)\)\s*;?\s*$/);
      if (!m) return null;
      const [, indent, , varName, arg] = m;
      const oldText = line;
      const newText = [
        `${indent}let ${varName};`,
        `${indent}try { ${varName} = JSON.parse(${arg}); }`,
        `${indent}catch { ${varName} = null; /* TODO: handle parse error */ }`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Server .listen() without error callback → add error handler ──
  {
    match: /no.*error.*callback|listen.*without.*error|server.*error.*handling/i,
    contextLines: 2,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)((?:\w+\.)?listen\s*\(\s*(\d+|[\w.]+)\s*)\)\s*;?\s*$/);
      if (!m) return null;
      const [, indent, prefix, port] = m;
      const oldText = line;
      const newText = [
        `${indent}${prefix}, () => {`,
        `${indent}  console.log(\`Server listening on port ${port}\`);`,
        `${indent}}).on("error", (err) => {`,
        `${indent}  console.error("Server failed to start:", err);`,
        `${indent}  process.exitCode = 1;`,
        `${indent}});`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Bare await without try/catch → wrap in try/catch ──
  {
    match: /unhandled.*reject|await.*without.*catch|async.*error.*handling/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)((?:const|let|var)\s+\w+\s*=\s*await\s+.+?)\s*;?\s*$/);
      if (!m) return null;
      // Check that there is no try/catch wrapping already
      const before = windowLines.slice(Math.max(0, idx - 3), idx).join("\n");
      if (/\btry\s*\{/.test(before)) return null;
      const [, indent, stmt] = m;
      const oldText = line;
      const newText = [
        `${indent}try {`,
        `${indent}  ${stmt.trim()};`,
        `${indent}} catch (error) {`,
        `${indent}  /* TODO: handle async error */ throw error;`,
        `${indent}}`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Dockerfile FROM :latest → pinned with comment ──
  {
    match: /latest.*tag|docker.*latest|unpinned.*base/i,
    contextLines: 1,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(FROM\s+)(\S+):latest(\s+AS\s+\S+)?\s*$/i);
      if (!m) return null;
      const [, indent, from, image, alias] = m;
      const oldText = line;
      const newText = `${indent}# TODO: pin to a specific version for reproducibility\n${indent}${from}${image}:lts-slim${alias || ""}`;
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Express app without helmet → add helmet middleware ──
  {
    match: /missing.*helmet|security.*headers.*middleware|no.*helmet/i,
    contextLines: 5,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(const\s+app\s*=\s*express\s*\(\s*\)\s*;?\s*)$/);
      if (!m) return null;
      const [, indent, appInit] = m;
      const oldText = line;
      const newText = [
        `${indent}const helmet = require("helmet"); /* TODO: npm install helmet */`,
        `${indent}${appInit}`,
        `${indent}app.use(helmet());`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Missing rate limiting → add express-rate-limit middleware ──
  {
    match: /rate.*limit.*missing|no.*rate.*limit|missing.*rate.*limit/i,
    contextLines: 5,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(const\s+app\s*=\s*express\s*\(\s*\)\s*;?\s*)$/);
      if (!m) return null;
      const [, indent, appInit] = m;
      const oldText = line;
      const newText = [
        `${indent}const rateLimit = require("express-rate-limit"); /* TODO: npm install express-rate-limit */`,
        `${indent}${appInit}`,
        `${indent}app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── String concatenation SQL → parameterized query (Node.js) ──
  {
    match: /sql.*inject|sql.*concatenat|string.*concat.*query/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)([\w.]+\.query\s*\(\s*)(["'`])(.+?)\3\s*\+\s*(\w+)\s*\)/);
      if (!m) return null;
      const [, indent, queryCall, quote, sql, param] = m;
      const oldText = line;
      const newText = `${indent}${queryCall}${quote}${sql}$1${quote}, [${param}])`;
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Error handler leaking stack trace → sanitized response ──
  {
    match: /error.*handler.*leak|stack.*trace.*response|error.*detail.*client/i,
    contextLines: 6,
    generate: (windowLines, windowStart) => {
      for (let i = 0; i < windowLines.length; i++) {
        const line = windowLines[i];
        if (!line.match(/app\.use\s*\(\s*\(\s*(?:err|error)\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/)) continue;
        const indent = line.match(/^(\s*)/)?.[1] || "";
        for (let j = i + 1; j < Math.min(i + 8, windowLines.length); j++) {
          const bodyLine = windowLines[j];
          if (bodyLine.match(/res\.(?:json|send)\s*\(\s*\{[^}]*(?:stack|trace)/)) {
            const oldText = bodyLine;
            const newText = `${indent}  res.status(err.status || 500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });`;
            return { oldText, newText, startLine: windowStart + j, endLine: windowStart + j };
          }
        }
      }
      return null;
    },
  },

  // ── Missing input validation → add schema guard ──
  {
    match: /input.*validation.*missing|no.*input.*valid|request.*body.*unvalid/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(
        /^(\s*)(app\.(?:post|put|patch)\s*\(\s*["'][^"']+["']\s*,\s*(?:async\s*)?\(\s*req\s*,\s*res\s*\)\s*=>\s*\{)\s*$/,
      );
      if (!m) return null;
      const [, indent, handler] = m;
      const oldText = line;
      const newText = [
        `${indent}${handler}`,
        `${indent}  /* TODO: add input validation (e.g. Zod, Joi, or express-validator) */`,
        `${indent}  if (!req.body || typeof req.body !== "object") { return res.status(400).json({ error: "Invalid request body" }); }`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Python: bare except with pass → specific exception with logging ──
  {
    match: /bare.*except|broad.*except.*python|pokemon.*except/i,
    contextLines: 4,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)except\s*:\s*$/);
      if (!m) return null;
      const indent = m[1];
      const nextIdx = idx + 1;
      if (nextIdx < windowLines.length && windowLines[nextIdx].match(/^\s*pass\s*$/)) {
        const oldText = windowLines.slice(idx, nextIdx + 1).join("\n");
        const newText = `${indent}except Exception as e:  # TODO: use specific exception\n${indent}    logging.exception("Unexpected error: %s", e)`;
        return { oldText, newText, startLine: findingLine, endLine: windowStart + nextIdx };
      }
      const oldText = line;
      const newText = `${indent}except Exception as e:  # TODO: use specific exception`;
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Go HTTP server without timeout → add timeouts ──
  {
    match: /http.*server.*timeout|missing.*timeout.*server|server.*no.*timeout/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)((?:srv|server|s)\s*:?=\s*&http\.Server\s*\{)\s*$/);
      if (!m) return null;
      const [, indent, serverInit] = m;
      const rest = windowLines.slice(idx + 1, idx + 6).join("\n");
      if (/ReadTimeout|WriteTimeout/.test(rest)) return null;
      const oldText = line;
      const newText = [
        `${indent}${serverInit}`,
        `${indent}\tReadTimeout:  15 * time.Second,`,
        `${indent}\tWriteTimeout: 15 * time.Second,`,
        `${indent}\tIdleTimeout:  60 * time.Second,`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Missing CORS configuration → proper CORS setup ──
  {
    match: /cors.*not.*config|missing.*cors|cors.*missing/i,
    contextLines: 5,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(const\s+app\s*=\s*express\s*\(\s*\)\s*;?\s*)$/);
      if (!m) return null;
      const [, indent, appInit] = m;
      const oldText = line;
      const newText = [
        `${indent}const cors = require("cors"); /* TODO: npm install cors */`,
        `${indent}${appInit}`,
        `${indent}app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "http://localhost:3000", credentials: true }));`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },
];

export function enrichWithPatches(findings: Finding[], code: string): Finding[] {
  const lines = code.split("\n");
  return findings.map((f) => {
    // Skip if patch already present or no line numbers
    if (f.patch || !f.lineNumbers || f.lineNumbers.length === 0) return f;

    // 1. Try single-line rules first
    for (const rule of PATCH_RULES) {
      if (!rule.match.test(f.title) && !rule.match.test(f.ruleId)) continue;
      // Try the first affected line
      const lineIdx = f.lineNumbers[0] - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;
      const result = rule.generate(lines[lineIdx]);
      if (result) {
        return {
          ...f,
          patch: {
            oldText: result.oldText,
            newText: result.newText,
            startLine: f.lineNumbers[0],
            endLine: f.lineNumbers[0],
          },
        };
      }
    }

    // 2. Try multi-line rules
    for (const rule of MULTI_LINE_PATCH_RULES) {
      if (!rule.match.test(f.title) && !rule.match.test(f.ruleId)) continue;
      const findingLine = f.lineNumbers[0];
      const windowStart = Math.max(1, findingLine - rule.contextLines);
      const windowEnd = Math.min(lines.length, findingLine + rule.contextLines);
      const windowLines = lines.slice(windowStart - 1, windowEnd);
      const result = rule.generate(windowLines, windowStart, findingLine);
      if (result) {
        return { ...f, patch: result };
      }
    }

    return f;
  });
}
