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
  // Rust: panic!() in library → return Result comment
  {
    match: /panic.*library|panic.*production|avoid.*panic/i,
    generate: (line) => {
      const m = line.match(/panic!\s*\(\s*(["'][^"']*["'])\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `return Err(anyhow::anyhow!(${m[1]})) /* TODO: replace panic with Result */` };
    },
  },
  // Rust: .clone() hint → borrow comment
  {
    match: /unnecessary.*clone|avoid.*clone|excessive.*clone/i,
    generate: (line) => {
      const m = line.match(/(\w+)\.clone\(\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}.clone() /* TODO: consider borrowing &${m[1]} instead */` };
    },
  },

  // ── Additional Python Patches ──

  // Python: eval() → ast.literal_eval()
  {
    match: /dangerous.*eval|python.*eval|eval.*usage/i,
    generate: (line) => {
      const m = line.match(/\beval\s*\(\s*(\w+)\s*\)/);
      if (!m) return null;
      // Only match if it looks like Python (no 'new Function' around it)
      if (line.includes("new Function") || line.includes("Function(")) return null;
      return { oldText: m[0], newText: `ast.literal_eval(${m[1]})` };
    },
  },
  // Python: requests without verify → verify=True
  {
    match: /ssl.*verif.*disabled|tls.*verif.*disabled|certificate.*verif/i,
    generate: (line) => {
      const m = line.match(/(requests\.(?:get|post|put|delete|patch)\s*\([^)]*?)verify\s*=\s*False/);
      if (!m) return null;
      return { oldText: "verify=False", newText: "verify=True" };
    },
  },
  // Python: subprocess with shell=True → shell=False
  {
    match: /shell.*true|subprocess.*shell|shell.*inject/i,
    generate: (line) => {
      const m = line.match(/(subprocess\.(?:run|call|check_call|check_output|Popen)\s*\([^)]*?)shell\s*=\s*True/);
      if (!m) return null;
      return { oldText: "shell=True", newText: "shell=False" };
    },
  },
  // Python: open() without encoding → add encoding
  {
    match: /missing.*encoding|file.*encoding|open.*without.*encoding/i,
    generate: (line) => {
      const m = line.match(/(open\s*\(\s*\w+\s*,\s*["'][rw](?:t)?["'])\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}, encoding="utf-8")` };
    },
  },

  // ── Additional Go Patches ──

  // Go: log.Fatal in HTTP handler → http.Error
  {
    match: /log\.fatal.*handler|fatal.*http.*handler|log.*fatal.*request/i,
    generate: (line) => {
      const m = line.match(/log\.Fatal(?:f|ln)?\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `http.Error(w, ${m[1]}, http.StatusInternalServerError)` };
    },
  },
  // Go: defer file.Close() without error check → named return
  {
    match: /defer.*close.*error|close.*without.*check|resource.*leak/i,
    generate: (line) => {
      const m = line.match(/(defer\s+\w+\.Close)\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}() // TODO: check Close() error in named return` };
    },
  },

  // ── Additional Java Patches ──

  // Java: System.out.println → Logger
  {
    match: /system\.out|console.*output|print.*instead.*log/i,
    generate: (line) => {
      const m = line.match(/System\.out\.println\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `logger.info(${m[1]})` };
    },
  },
  // Java: String concatenation in SQL → PreparedStatement marker
  {
    match: /sql.*concatenat|string.*concat.*sql|sql.*inject/i,
    generate: (line) => {
      const m = line.match(/(Statement\s*\w+\s*=\s*\w+\.createStatement)\s*\(\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `/* TODO: use PreparedStatement instead */ ${m[0]}` };
    },
  },

  // ── Additional C# Patches ──

  // C#: string.Format/interpolation in SQL → parameterized
  {
    match: /sql.*inject|string.*interpol.*sql|sql.*concat/i,
    generate: (line) => {
      const m = line.match(/ExecuteSqlRaw\s*\(\s*\$/);
      if (!m) return null;
      return { oldText: "ExecuteSqlRaw($", newText: "ExecuteSqlInterpolated($" };
    },
  },
  // C#: Console.WriteLine → ILogger
  {
    match: /console.*writeline.*log|console.*instead.*logger/i,
    generate: (line) => {
      const m = line.match(/Console\.WriteLine\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `_logger.LogInformation(${m[1]})` };
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

  // ── Ruby Patches ──

  // Ruby: system/exec → Shellwords.shellescape
  {
    match: /command.*inject|shell.*inject|os.*command|dangerous.*system/i,
    generate: (line) => {
      const m = line.match(/\bsystem\s*\(\s*(["'])(.+?)\1\s*\+\s*(\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `system(${m[1]}${m[2]}#{Shellwords.shellescape(${m[3]})}${m[1]})` };
    },
  },
  // Ruby: exec with string interpolation → shellescape
  {
    match: /command.*inject|shell.*inject|os.*command/i,
    generate: (line) => {
      const m = line.match(/`([^`]*#\{(\w+)\}[^`]*)`/);
      if (!m) return null;
      return { oldText: m[0], newText: `Shellwords.shelljoin(["${m[1].replace(/#\{\w+\}/, '", ' + m[2] + ', "')}"])` };
    },
  },
  // Ruby: eval → safer alternative
  {
    match: /dangerous.*eval|eval.*usage|code.*inject/i,
    generate: (line) => {
      const m = line.match(/\beval\s*\(\s*(\w+)\s*\)/);
      if (!m) return null;
      // Only match Ruby-style (no 'new Function' or JS context)
      if (line.includes("new Function") || line.includes("JSON.parse")) return null;
      return { oldText: m[0], newText: `JSON.parse(${m[1]}) # TODO: eliminate eval — use safe deserialization` };
    },
  },
  // Ruby: send with user input → allowlist
  {
    match: /dynamic.*method|unsafe.*send|method.*inject/i,
    generate: (line) => {
      const m = line.match(/(\.send\s*\(\s*)(\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}${m[2]}) # TODO: validate against allowlist before .send` };
    },
  },
  // Ruby: open-uri with user URL → validate
  {
    match: /ssrf|open-uri.*untrusted|server.*side.*request/i,
    generate: (line) => {
      const m = line.match(/(URI\.open\s*\(\s*)(\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}${m[2]}) # TODO: validate URL against allowlist to prevent SSRF` };
    },
  },
  // Ruby: yaml.load → YAML.safe_load
  {
    match: /unsafe.*yaml|yaml.*load|insecure.*yaml|deserialization/i,
    generate: (line) => {
      const m = line.match(/YAML\.load\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "YAML.safe_load(" };
    },
  },
  // Ruby: Marshal.load → JSON.parse
  {
    match: /unsafe.*deserialization|marshal.*untrusted|insecure.*deserialization/i,
    generate: (line) => {
      const m = line.match(/Marshal\.load\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: "JSON.parse( # TODO: replace Marshal with safe serialization" };
    },
  },
  // Ruby: String interpolation in SQL → parameterized
  {
    match: /sql.*inject|string.*interpol.*sql|sql.*concat/i,
    generate: (line) => {
      const m = line.match(/(\.(?:where|find_by_sql|execute)\s*\(\s*)"([^"]*?)#\{(\w+)\}([^"]*)"/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}"${m[2]}?${m[4]}", ${m[3]}` };
    },
  },
  // Ruby: Digest::MD5 → Digest::SHA256
  {
    match: /weak.*hash|insecure.*hash|md5|sha1/i,
    generate: (line) => {
      const m = line.match(/Digest::(MD5|SHA1)/);
      if (!m) return null;
      return { oldText: m[0], newText: "Digest::SHA256" };
    },
  },
  // Ruby: render inline with user input → sanitize
  {
    match: /xss|cross.*site.*script|render.*untrusted/i,
    generate: (line) => {
      const m = line.match(/(render\s+inline:\s*)(\w+)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}ERB::Util.html_escape(${m[2]})` };
    },
  },

  // ── PHP Patches ──

  // PHP: mysql_query → PDO prepared statement marker
  {
    match: /deprecated.*mysql|mysql_query|sql.*inject/i,
    generate: (line) => {
      const m = line.match(/mysql_query\s*\(\s*(".*?"|\$\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `$pdo->prepare(${m[1]})->execute() /* TODO: use PDO with bound parameters */` };
    },
  },
  // PHP: eval → safer alternative
  {
    match: /dangerous.*eval|eval.*usage|code.*inject/i,
    generate: (line) => {
      const m = line.match(/\beval\s*\(\s*(\$\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `json_decode(${m[1]}, true) /* TODO: eliminate eval — use safe parsing */` };
    },
  },
  // PHP: shell_exec/exec → escapeshellarg
  {
    match: /command.*inject|shell.*inject|os.*command/i,
    generate: (line) => {
      const m = line.match(/((?:shell_exec|exec|system|passthru)\s*\(\s*(?:["'].*?["']\s*\.\s*))(\$\w+)/);
      if (!m) return null;
      return { oldText: m[2], newText: `escapeshellarg(${m[2]})` };
    },
  },
  // PHP: md5/sha1 → password_hash for passwords
  {
    match: /weak.*hash|password.*hash|insecure.*hash/i,
    generate: (line) => {
      const m = line.match(/\bmd5\s*\(\s*(\$\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `password_hash(${m[1]}, PASSWORD_BCRYPT)` };
    },
  },
  // PHP: extract($_POST/GET/REQUEST) → manual assignment
  {
    match: /variable.*inject|mass.*assign|extract.*superglobal/i,
    generate: (line) => {
      const m = line.match(/extract\s*\(\s*\$_(POST|GET|REQUEST)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `/* TODO: assign specific variables from \$_${m[1]} instead of extract() */` };
    },
  },
  // PHP: htmlspecialchars missing → add
  {
    match: /xss|cross.*site.*script|output.*encod|unescaped.*output/i,
    generate: (line) => {
      const m = line.match(/(echo\s+)(\$\w+)\s*;/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}htmlspecialchars(${m[2]}, ENT_QUOTES, 'UTF-8');` };
    },
  },
  // PHP: unserialize → json_decode
  {
    match: /unsafe.*deserialization|unserialize.*untrusted|insecure.*deserialization/i,
    generate: (line) => {
      const m = line.match(/unserialize\s*\(\s*(\$\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `json_decode(${m[1]}, true) /* TODO: replace unserialize with safe format */` };
    },
  },
  // PHP: file_get_contents with user URL → validate
  {
    match: /ssrf|server.*side.*request|unvalidated.*url/i,
    generate: (line) => {
      const m = line.match(/(file_get_contents\s*\(\s*)(\$\w+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}${m[2]}) /* TODO: validate URL against allowlist to prevent SSRF */` };
    },
  },
  // PHP: rand() → random_int() (cryptographic)
  {
    match: /insecure.*random|weak.*random|predictable.*random/i,
    generate: (line) => {
      const m = line.match(/\brand\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `random_int(${m[1]}, ${m[2]})` };
    },
  },

  // ── Kotlin Patches ──

  // Kotlin: !! (force unwrap) → safe call + default
  {
    match: /force.*unwrap|non-null.*assert|!!.*operator|null.*safety/i,
    generate: (line) => {
      const m = line.match(/(\w+)!!(\.\w+)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}?${m[2]} ?: throw IllegalStateException("${m[1]} was null")` };
    },
  },
  // Kotlin: Thread.sleep → delay (coroutines)
  {
    match: /thread.*sleep|blocking.*call|blocking.*thread/i,
    generate: (line) => {
      const m = line.match(/Thread\.sleep\s*\(\s*(\d+)\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `delay(${m[1]}) // TODO: ensure calling function is suspend` };
    },
  },
  // Kotlin: var → val (immutability)
  {
    match: /mutable.*variable|var.*instead.*val|prefer.*immutable/i,
    generate: (line) => {
      const m = line.match(/\bvar\s+(\w+)\s*[:=]/);
      if (!m) return null;
      return { oldText: `var ${m[1]}`, newText: `val ${m[1]}` };
    },
  },
  // Kotlin: catching generic Exception → specific
  {
    match: /catch.*generic|broad.*exception|catching.*exception/i,
    generate: (line) => {
      const m = line.match(/catch\s*\(\s*(e|ex|err)\s*:\s*Exception\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `catch (${m[1]}: Exception) /* TODO: use specific exception type */` };
    },
  },
  // Kotlin: hardcoded URL → BuildConfig
  {
    match: /hardcoded.*url|url.*hardcoded|base.*url.*literal/i,
    generate: (line) => {
      const m = line.match(/(["'])(https?:\/\/[^"']+)\1/);
      if (!m) return null;
      return { oldText: m[0], newText: `BuildConfig.BASE_URL /* TODO: move URL to build config */` };
    },
  },
  // Kotlin: String SQL concatenation → parameterized
  {
    match: /sql.*inject|sql.*concat|string.*template.*sql/i,
    generate: (line) => {
      const m = line.match(/(rawQuery\s*\(\s*)"([^"]*)\$(\w+)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}"${m[2]}?", arrayOf(${m[3]}` };
    },
  },

  // ── Swift Patches ──

  // Swift: force unwrap (!) → optional binding
  {
    match: /force.*unwrap|implicit.*unwrap|!.*operator.*crash/i,
    generate: (line) => {
      const m = line.match(/(\w+)!\s*\./);
      if (!m) return null;
      // Don't match Kotlin !! or negation
      if (line.includes("!!")) return null;
      return { oldText: m[0], newText: `${m[1]}?. // TODO: use if-let or guard-let for safe unwrapping` };
    },
  },
  // Swift: try! → do-catch reminder
  {
    match: /force.*try|try!.*crash|unhandled.*throw/i,
    generate: (line) => {
      const m = line.match(/\btry!\s+/);
      if (!m) return null;
      return { oldText: m[0], newText: "try /* TODO: wrap in do-catch */ " };
    },
  },
  // Swift: implicitly unwrapped optional → regular optional
  {
    match: /implicit.*unwrap.*optional|iuo.*declaration/i,
    generate: (line) => {
      const m = line.match(/(:\s*\w+)!/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}?` };
    },
  },
  // Swift: NSLog → os_log (structured logging)
  {
    match: /nslog.*os_log|nslog.*instead|structured.*log/i,
    generate: (line) => {
      const m = line.match(/NSLog\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `os_log(.info, ${m[1]})` };
    },
  },
  // Swift: UserDefaults for sensitive data → Keychain
  {
    match: /userdefaults.*sensitive|insecure.*storage|keychain.*instead/i,
    generate: (line) => {
      const m = line.match(
        /(UserDefaults\.standard\.set\s*\([^,]+,\s*forKey:\s*)(["'][^"']*(?:password|token|secret|key)[^"']*["'])\s*\)/i,
      );
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `KeychainWrapper.standard.set(/* value */, forKey: ${m[2]}) /* TODO: use Keychain for sensitive data */`,
      };
    },
  },
  // Swift: print() → Logger
  {
    match: /print.*instead.*log|print.*production|remove.*print/i,
    generate: (line) => {
      const m = line.match(/\bprint\s*\(([^)]*)\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `Logger().info(${m[1]})` };
    },
  },

  // ── Additional Cross-Language Patches ──

  // Terraform: overly broad CIDR → restrict
  {
    match: /overly.*broad.*cidr|0\.0\.0\.0\/0|unrestricted.*ingress|open.*to.*world/i,
    generate: (line) => {
      const m = line.match(/(["'])0\.0\.0\.0\/0\1/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}10.0.0.0/8${m[1]} /* TODO: restrict to your CIDR range */` };
    },
  },
  // Terraform: public access enabled → private
  {
    match: /public.*access.*enabled|publicly.*accessible|public.*bucket/i,
    generate: (line) => {
      const m = line.match(/((?:publicly_accessible|public_access|public)\s*=\s*)true/i);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}false` };
    },
  },
  // Terraform: encryption disabled → enabled
  {
    match: /encryption.*disabled|unencrypted.*storage|encrypt.*at.*rest/i,
    generate: (line) => {
      const m = line.match(/((?:encrypted|encryption_enabled|encrypt)\s*=\s*)false/i);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}true` };
    },
  },
  // Bicep/ARM: HTTP allowed → HTTPS only
  {
    match: /http.*allowed|https.*only|transport.*security/i,
    generate: (line) => {
      const m = line.match(/(httpsOnly\s*:\s*)false/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}true` };
    },
  },

  // ── Dockerfile additional patches ──
  // ADD → COPY (Docker best practice)
  {
    match: /add.*instead.*copy|docker.*add|prefer.*copy/i,
    generate: (line) => {
      const m = line.match(/^(\s*)ADD\s+(?!https?:)/);
      if (!m) return null;
      return { oldText: `${m[1]}ADD `, newText: `${m[1]}COPY ` };
    },
  },
  // Missing HEALTHCHECK
  {
    match: /missing.*healthcheck|no.*healthcheck|docker.*health/i,
    generate: (line) => {
      const m = line.match(/^(\s*)(CMD\s+.+)$/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `HEALTHCHECK --interval=30s --timeout=3s CMD curl -f http://localhost:8080/ || exit 1\n${m[1]}${m[2]}`,
      };
    },
  },

  // ── GitHub Actions / CI Patches ──
  // Unpinned action version → pin to SHA
  {
    match: /unpinned.*action|action.*version.*pin|uses.*latest/i,
    generate: (line) => {
      const m = line.match(/(uses:\s*)(\S+)@(master|main|latest)\b/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}${m[2]}@v4 /* TODO: pin to specific SHA */` };
    },
  },

  // ═══ Authentication Patches ═══

  // AUTH: plaintext password comparison → bcrypt
  {
    match: /AUTH-.*|plaintext.*password|password.*comparison.*plain|comparing.*password/i,
    generate: (line) => {
      const m = line.match(/(password|passwd)\s*===?\s*(\w+)/i);
      if (!m) return null;
      return { oldText: m[0], newText: `await bcrypt.compare(${m[2]}, hashedPassword) /* TODO: use bcrypt */` };
    },
  },
  // AUTH: session without expiry → add maxAge
  {
    match: /session.*expir|session.*timeout|session.*no.*expir/i,
    generate: (line) => {
      const m = line.match(/(session\s*\(\s*\{[^}]*?)(\})/);
      if (!m) return null;
      if (/maxAge|expires/.test(m[1])) return null;
      return { oldText: m[0], newText: `${m[1]}, maxAge: 1800000 /* 30 min */}` };
    },
  },
  // AUTH: jwt.decode → jwt.verify
  {
    match: /jwt.*decode.*verify|unverified.*jwt|jwt.*without.*verif/i,
    generate: (line) => {
      const m = line.match(/jwt\.decode\s*\(/);
      if (!m) return null;
      return { oldText: m[0], newText: `jwt.verify(` };
    },
  },
  // AUTH: missing rate limit on login
  {
    match: /brute.*force|login.*rate.*limit|missing.*rate.*limit.*auth/i,
    generate: (line) => {
      const m = line.match(/^(\s*)((?:app|router)\.post\s*\(\s*["']\/(?:login|auth|signin)["'])/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `${m[1]}/* TODO: add rate limiting middleware (e.g., express-rate-limit) */\n${m[1]}${m[2]}`,
      };
    },
  },

  // ═══ Data Security Patches ═══

  // DSEC: storing PII in localStorage
  {
    match: /pii.*localStorage|sensitive.*local.*storage|localStorage.*personal/i,
    generate: (line) => {
      const m = line.match(
        /localStorage\.(setItem)\s*\(\s*(["'][^"']*(?:email|ssn|phone|name|address|dob)[^"']*["'])/i,
      );
      if (!m) return null;
      return {
        oldText: `localStorage.${m[1]}`,
        newText: `sessionStorage.setItem /* TODO: encrypt or use httpOnly cookie instead */`,
      };
    },
  },
  // DSEC: logging PII fields
  {
    match: /pii.*log|logging.*personal|log.*sensitive|LOGPRIV/i,
    generate: (line) => {
      const m = line.match(
        /(console\.log|logger\.\w+)\s*\([^)]*\b(email|ssn|password|creditCard|phoneNumber|socialSecurity)\b/i,
      );
      if (!m) return null;
      return { oldText: m[2], newText: `[REDACTED:${m[2]}]` };
    },
  },

  // ═══ Accessibility Patches ═══

  // A11Y: img without alt → add alt=""
  {
    match: /A11Y-.*|missing.*alt|img.*alt|image.*alt/i,
    generate: (line) => {
      const m = line.match(/(<img\s+(?:(?!alt=)[^>])*?)(\/?>)/i);
      if (!m) return null;
      if (/alt=/i.test(m[1])) return null;
      return { oldText: m[0], newText: `${m[1]} alt="" /* TODO: add descriptive alt text */${m[2]}` };
    },
  },
  // A11Y: button/link without aria-label (icon-only)
  {
    match: /aria.*label|icon.*button.*access|accessible.*name/i,
    generate: (line) => {
      const m = line.match(/(<(?:button|a)\s+(?:(?!aria-label)[^>])*?)(>)/i);
      if (!m) return null;
      if (/aria-label=/.test(m[1])) return null;
      if (!/icon|svg|fa-|material-icon/i.test(line)) return null;
      return { oldText: m[0], newText: `${m[1]} aria-label="TODO: describe action"${m[2]}` };
    },
  },
  // A11Y: onClick div → button
  {
    match: /interactive.*div|div.*onclick|click.*handler.*div/i,
    generate: (line) => {
      const m = line.match(/<div(\s+[^>]*?)onClick/i);
      if (!m) return null;
      return { oldText: `<div${m[1]}onClick`, newText: `<button${m[1]}onClick` };
    },
  },
  // A11Y: autocomplete off on login fields
  {
    match: /autocomplete.*off.*password|login.*autocomplete/i,
    generate: (line) => {
      const m = line.match(/(type=["']password["'][^>]*?)autocomplete=["']off["']/i);
      if (!m) return null;
      return { oldText: `autocomplete="off"`, newText: `autocomplete="current-password"` };
    },
  },

  // ═══ AI Code Safety Patches ═══

  // AICS: user input concatenated into prompt
  {
    match: /AICS-.*|prompt.*inject|user.*input.*prompt|llm.*inject/i,
    generate: (line) => {
      const m = line.match(/(`[^`]*\$\{(?:req\.body|req\.query|request\.\w+|user[Ii]nput|input)\b[^}]*\}[^`]*`)/);
      if (!m) return null;
      return { oldText: m[0], newText: `/* TODO: sanitize user input before LLM prompt */ ${m[0]}` };
    },
  },
  // AICS: LLM output in innerHTML
  {
    match: /llm.*output.*html|ai.*output.*innerhtml|inject.*llm.*output/i,
    generate: (line) => {
      const m = line.match(/\.innerHTML\s*=\s*(\w+(?:\.(?:response|output|text|completion|content))?)/);
      if (!m) return null;
      return { oldText: `.innerHTML = ${m[1]}`, newText: `.textContent = ${m[1]} /* sanitize LLM output */` };
    },
  },

  // ═══ Compliance Patches ═══

  // COMP: cookie without consent check
  {
    match: /cookie.*consent|gdpr.*cookie|tracking.*consent/i,
    generate: (line) => {
      const m = line.match(/^(\s*)(document\.cookie\s*=)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}if (hasUserConsent()) ${m[2]} /* TODO: implement consent check */` };
    },
  },
  // COMP: collecting data without purpose
  {
    match: /data.*purpose|purpose.*limitation|gdpr.*purpose/i,
    generate: (line) => {
      const m = line.match(/^(\s*)((?:const|let|var)\s+\w+\s*=\s*(?:req\.body|request\.(?:form|json)))/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `${m[1]}/* TODO: validate data collection purpose against privacy policy */\n${m[1]}${m[2]}`,
      };
    },
  },

  // ═══ Performance Patches ═══

  // PERF: regex in loop → pre-compile
  {
    match: /regex.*loop|regexp.*inside.*loop|pattern.*repeated/i,
    generate: (line) => {
      const m = line.match(/(new\s+RegExp\s*\(\s*(["'][^"']+["'])\s*(?:,\s*["'][^"']*["'])?\s*\))/);
      if (!m) return null;
      return { oldText: m[0], newText: `/* TODO: pre-compile regex outside loop */ ${m[0]}` };
    },
  },
  // PERF: Array spread in reduce → push
  {
    match: /spread.*reduce|array.*spread.*accumul|O\(n.\).*reduce/i,
    generate: (line) => {
      const m = line.match(/\[\.\.\.(acc|accumulator|result)\s*,/);
      if (!m) return null;
      return { oldText: `[...${m[1]},`, newText: `/* TODO: use push() instead of spread in reduce */ [...${m[1]},` };
    },
  },

  // ═══ Observability Patches ═══

  // OBS: catch without logging
  {
    match: /catch.*no.*log|error.*not.*logged|swallow.*without.*log/i,
    generate: (line) => {
      const m = line.match(/^(\s*)\}\s*catch\s*\((\w+)\)\s*\{\s*$/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[0]}\n${m[1]}  console.error('Error:', ${m[2]});` };
    },
  },

  // ═══ IaC Security Patches ═══

  // IaC: Dockerfile USER root → USER node
  {
    match: /docker.*root|container.*root|USER.*root/i,
    generate: (line) => {
      const m = line.match(/^USER\s+root\s*$/);
      if (!m) return null;
      return { oldText: m[0], newText: `USER node` };
    },
  },
  // IaC: Terraform allow all ingress → restrict CIDR
  {
    match: /ingress.*0\.0\.0\.0|open.*ingress|unrestricted.*ingress/i,
    generate: (line) => {
      const m = line.match(/(cidr_blocks\s*=\s*\[)"0\.0\.0\.0\/0"(\])/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}"10.0.0.0/8"${m[2]} /* TODO: restrict to your CIDR */` };
    },
  },
  // IaC: Kubernetes privileged container → drop privileges
  {
    match: /privileged.*true|container.*privileged|security.*context.*privileged/i,
    generate: (line) => {
      const m = line.match(/privileged:\s*true/);
      if (!m) return null;
      return { oldText: m[0], newText: `privileged: false` };
    },
  },

  // ═══ Database Patches ═══

  // DB: missing index comment
  {
    match: /missing.*index|no.*index.*query|full.*table.*scan/i,
    generate: (line) => {
      const m = line.match(/^(\s*)((?:SELECT|FROM|WHERE)\b.*)$/i);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}/* TODO: ensure WHERE-clause columns are indexed */ ${m[2]}` };
    },
  },
  // DB: transaction missing rollback
  {
    match: /transaction.*rollback|missing.*rollback|no.*rollback/i,
    generate: (line) => {
      const m = line.match(/^(\s*)((?:await\s+)?(?:client|conn|db|connection)\.query\s*\(\s*["']BEGIN)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}/* TODO: wrap in try/catch with ROLLBACK on error */\n${m[1]}${m[2]}` };
    },
  },

  // ═══ Concurrency Patches ═══

  // CONC: shared mutable variable → atomics hint
  {
    match: /race.*condition|shared.*mutable|concurrent.*access/i,
    generate: (line) => {
      const m = line.match(/^(\s*)(let|var)\s+(\w+)\s*=\s*(\d+)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}/* TODO: protect with mutex/lock */ ${m[2]} ${m[3]} = ${m[4]}` };
    },
  },

  // ═══ API Design Patches ═══

  // API: missing pagination
  {
    match: /missing.*pagination|no.*pagina|unbounded.*list/i,
    generate: (line) => {
      const m = line.match(/(\.find\s*\(\s*\{[^}]*\})\s*\)/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}).limit(100) /* TODO: add proper pagination */` };
    },
  },
  // API: missing content-type validation
  {
    match: /content.*type.*valid|missing.*content.*type/i,
    generate: (line) => {
      const m = line.match(/^(\s*)((?:app|router)\.(post|put|patch)\s*\()/);
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}/* TODO: validate Content-Type header */\n${m[1]}${m[2]}` };
    },
  },

  // ═══ Internationalization Patches ═══

  // I18N: hardcoded user-facing string → i18n key
  {
    match: /I18N-.*|hardcoded.*string|user.*facing.*literal/i,
    generate: (line) => {
      const m = line.match(/((?:label|title|message|placeholder|text|heading)\s*[:=]\s*)(["'])([A-Z][a-z].*?)\2/);
      if (!m) return null;
      const key = m[3]
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 30);
      return {
        oldText: `${m[1]}${m[2]}${m[3]}${m[2]}`,
        newText: `${m[1]}t("${key}") /* was: ${m[2]}${m[3]}${m[2]} */`,
      };
    },
  },

  // ═══ Scalability Patches ═══

  // SCAL: in-memory session store → comment
  {
    match: /in.*memory.*session|session.*memory.*store|express.*session.*default/i,
    generate: (line) => {
      const m = line.match(/^(\s*)(app\.use\s*\(\s*session\s*\(\s*\{)/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `${m[1]}/* TODO: use Redis/database session store for multi-instance */ ${m[2]}`,
      };
    },
  },

  // ═══ Sovereignty Patches ═══

  // SOV: data sent to external analytics
  {
    match: /data.*third.*party|analytics.*external|sov.*data.*transfer/i,
    generate: (line) => {
      const m = line.match(
        /^(\s*)((?:fetch|axios\.\w+|https?\.(?:get|post))\s*\(\s*["']https?:\/\/(?:analytics|tracking|telemetry)\b)/,
      );
      if (!m) return null;
      return { oldText: m[0], newText: `${m[1]}/* TODO: verify data residency compliance before sending */ ${m[2]}` };
    },
  },

  // ═══ Framework Safety Patches ═══

  // FW: Express without helmet → add helmet
  {
    match: /missing.*helmet|no.*security.*headers|express.*headers/i,
    generate: (line) => {
      const m = line.match(/^(\s*)(const\s+app\s*=\s*express\s*\(\s*\)\s*;?)/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `${m[1]}const helmet = require("helmet"); /* TODO: npm install helmet */\n${m[1]}${m[2]}\n${m[1]}app.use(helmet());`,
      };
    },
  },
  // FW: Flask debug mode in production
  {
    match: /flask.*debug|debug.*production|app\.run.*debug/i,
    generate: (line) => {
      const m = line.match(/app\.run\s*\(\s*([^)]*)debug\s*=\s*True/);
      if (!m) return null;
      return { oldText: `debug=True`, newText: `debug=os.environ.get("FLASK_DEBUG", "false") == "true"` };
    },
  },
  // FW: Django SECRET_KEY hardcoded
  {
    match: /django.*secret|SECRET_KEY.*hardcoded|hardcoded.*django/i,
    generate: (line) => {
      const m = line.match(/^(\s*)SECRET_KEY\s*=\s*(["'])[^"']+\2/);
      if (!m) return null;
      return {
        oldText: m[0],
        newText: `${m[1]}SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "change-me-in-production")`,
      };
    },
  },

  // ═══ Supply Chain Patches ═══

  // DEP: importing from CDN without SRI
  {
    match: /sri.*missing|subresource.*integrity|cdn.*integrity/i,
    generate: (line) => {
      const m = line.match(/(<script\s+src=["']https?:\/\/cdn[^"']*["'])(\s*>)/i);
      if (!m) return null;
      if (/integrity=/i.test(m[1])) return null;
      return { oldText: m[0], newText: `${m[1]} integrity="TODO:sha384-hash" crossorigin="anonymous"${m[2]}` };
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

  // ── Ruby: begin/rescue without specific exception → add specific ──
  {
    match: /bare.*rescue|rescue.*generic|rescue.*exception/i,
    contextLines: 4,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)rescue\s*$/);
      if (!m) return null;
      return {
        oldText: line,
        newText: `${m[1]}rescue StandardError => e # TODO: use specific exception class`,
        startLine: findingLine,
        endLine: findingLine,
      };
    },
  },

  // ── PHP: missing CSRF token in form → add hidden field ──
  {
    match: /csrf.*missing|cross.*site.*request|no.*csrf/i,
    contextLines: 5,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(<form\s[^>]*method=["']post["'][^>]*>)/i);
      if (!m) return null;
      const [, indent, formTag] = m;
      return {
        oldText: line,
        newText: `${indent}${formTag}\n${indent}  <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($csrfToken) ?>" />`,
        startLine: findingLine,
        endLine: findingLine,
      };
    },
  },

  // ── Kotlin: runOnUiThread with long operation → coroutine ──
  {
    match: /blocking.*main.*thread|ui.*thread.*block|network.*main/i,
    contextLines: 5,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)runOnUiThread\s*\{/);
      if (!m) return null;
      return {
        oldText: line,
        newText: `${m[1]}lifecycleScope.launch(Dispatchers.IO) { // TODO: move I/O-bound work off main thread`,
        startLine: findingLine,
        endLine: findingLine,
      };
    },
  },

  // ── Swift: DispatchQueue.main.sync → async ──
  {
    match: /deadlock|main.*thread.*sync|dispatch.*main.*sync/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)DispatchQueue\.main\.sync\b/);
      if (!m) return null;
      return {
        oldText: "DispatchQueue.main.sync",
        newText: "DispatchQueue.main.async",
        startLine: findingLine,
        endLine: findingLine,
      };
    },
  },

  // ── Terraform: missing logging/monitoring block ──
  {
    match: /missing.*logging|no.*monitoring|audit.*log.*disabled/i,
    contextLines: 5,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(resource\s+"[^"]+"\s+"[^"]+"\s*\{)/);
      if (!m) return null;
      const [, indent, resourceBlock] = m;
      return {
        oldText: line,
        newText: `${indent}${resourceBlock}\n${indent}  # TODO: add logging/monitoring configuration\n${indent}  # logging { enabled = true }`,
        startLine: findingLine,
        endLine: findingLine,
      };
    },
  },

  // ── v3.35.0 — Additional multi-line patches ──

  // ── Timing-safe comparison → crypto.timingSafeEqual ──
  {
    match: /timing.*attack|timing.*safe|constant.*time.*compar|non.*constant.*time/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(?:if\s*\(\s*)?([\w.]+)\s*===?\s*([\w.]+)/);
      if (!m) return null;
      const [, indent, left, right] = m;
      const oldText = line;
      const newText = [
        `${indent}// TODO: ensure crypto is imported: const crypto = require("crypto");`,
        `${indent}const _a = Buffer.from(String(${left}));`,
        `${indent}const _b = Buffer.from(String(${right}));`,
        `${indent}if (_a.length === _b.length && crypto.timingSafeEqual(_a, _b)) {`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Path traversal → sanitize with path.resolve + prefix check ──
  {
    match: /path.*traversal|directory.*traversal|dot.*dot.*slash|\.\..*path/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(
        /^(\s*)((?:const|let|var)\s+(\w+)\s*=\s*path\.(?:join|resolve)\s*\([^)]*(?:req\.\w+|params|query|body)[^)]*\))\s*;?\s*$/,
      );
      if (!m) return null;
      const [, indent, stmt, varName] = m;
      const oldText = line;
      const newText = [
        `${indent}const __baseDir = path.resolve("./safe-root"); // TODO: set allowed base directory`,
        `${indent}${stmt};`,
        `${indent}if (!path.resolve(${varName}).startsWith(__baseDir)) { throw new Error("Path traversal blocked"); }`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Hardcoded secret/password → use environment variable ──
  {
    match: /hardcoded.*secret|hardcoded.*password|hardcoded.*key|embedded.*credential|hardcoded.*token/i,
    contextLines: 2,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(
        /^(\s*)(const|let|var)\s+(\w*(?:secret|password|key|token|apiKey|api_key)\w*)\s*=\s*["'`]([^"'`]+)["'`]\s*;?\s*$/i,
      );
      if (!m) return null;
      const [, indent, decl, varName] = m;
      const envName = varName.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      const oldText = line;
      const newText = `${indent}${decl} ${varName} = process.env.${envName}; // TODO: set ${envName} in environment`;
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Open redirect → validate redirect URL ──
  {
    match: /open.*redirect|unvalidated.*redirect|url.*redirect.*uncheck/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(
        /^(\s*)(?:res\.redirect|return\s+res\.redirect)\s*\(\s*(req\.(?:query|params|body)\.\w+|[\w]+)\s*\)/,
      );
      if (!m) return null;
      const [, indent, urlExpr] = m;
      const oldText = line;
      const newText = [
        `${indent}const __redirectUrl = new URL(${urlExpr}, req.protocol + "://" + req.get("host"));`,
        `${indent}if (__redirectUrl.origin !== req.protocol + "://" + req.get("host")) { return res.status(400).send("Invalid redirect"); }`,
        `${indent}res.redirect(__redirectUrl.pathname);`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── SSRF → validate URL before HTTP request ──
  {
    match: /ssrf|server.*side.*request.*forgery|unvalidated.*url.*fetch/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(
        /^(\s*)((?:const|let|var)\s+\w+\s*=\s*)?(?:await\s+)?(?:fetch|axios\.(?:get|post|put|delete)|got|request)\s*\(\s*([\w.]+)\s*/,
      );
      if (!m) return null;
      const [, indent, , urlVar] = m;
      const oldText = line;
      const newText = [
        `${indent}// TODO: validate URL against allowlist to prevent SSRF`,
        `${indent}const __parsedUrl = new URL(${urlVar});`,
        `${indent}const __allowedHosts = (process.env.ALLOWED_HOSTS || "").split(",");`,
        `${indent}if (!__allowedHosts.includes(__parsedUrl.hostname)) { throw new Error("Blocked: host not in allowlist"); }`,
        `${indent}${line.trim()}`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Insecure cookie → add secure flags ──
  {
    match: /insecure.*cookie|cookie.*secure.*flag|cookie.*httponly|session.*cookie.*flag/i,
    contextLines: 4,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)res\.cookie\s*\(\s*["'](\w+)["']\s*,\s*(\S+)\s*\)\s*;?\s*$/);
      if (!m) return null;
      const [, indent, name, value] = m;
      const oldText = line;
      const newText = `${indent}res.cookie("${name}", ${value}, { httpOnly: true, secure: true, sameSite: "strict" });`;
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Java SQL injection → PreparedStatement ──
  {
    match: /sql.*inject|sql.*concatenat|jdbc.*inject/i,
    contextLines: 4,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(Statement\s+\w+\s*=\s*\w+\.createStatement\s*\(\s*\))\s*;?\s*$/);
      if (!m) return null;
      const [, indent] = m;
      // Look for executeQuery with concatenation on subsequent lines
      for (let j = idx + 1; j < Math.min(idx + 4, windowLines.length); j++) {
        const next = windowLines[j];
        const qm = next.match(/^(\s*)\w+\.executeQuery\s*\(\s*"([^"]+)"\s*\+\s*(\w+)/);
        if (!qm) continue;
        const [, , sql, param] = qm;
        const oldText = windowLines.slice(idx, j + 1).join("\n");
        const newText = [
          `${indent}PreparedStatement pstmt = conn.prepareStatement("${sql}?");`,
          `${indent}pstmt.setString(1, ${param});`,
          `${indent}ResultSet rs = pstmt.executeQuery();`,
        ].join("\n");
        return { oldText, newText, startLine: findingLine, endLine: windowStart + j };
      }
      return null;
    },
  },

  // ── Python f-string/format SQL → parameterized query ──
  {
    match: /sql.*inject|python.*sql.*format|f.*string.*sql/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(\w+)\.execute\s*\(\s*f["']([^"']*)\{(\w+)\}([^"']*)["']\s*\)/);
      if (!m) return null;
      const [, indent, cursor, sqlBefore, param, sqlAfter] = m;
      const oldText = line;
      const newText = `${indent}${cursor}.execute("${sqlBefore}%s${sqlAfter}", (${param},))`;
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── Missing Content-Security-Policy header → add CSP ──
  {
    match: /content.*security.*policy|missing.*csp|csp.*header/i,
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
        `${indent}${appInit}`,
        `${indent}app.use((_req, res, next) => {`,
        `${indent}  res.setHeader("Content-Security-Policy", "default-src 'self'"); // TODO: adjust CSP policy`,
        `${indent}  next();`,
        `${indent}});`,
      ].join("\n");
      return { oldText, newText, startLine: findingLine, endLine: findingLine };
    },
  },

  // ── C# SQL injection → SqlParameter ──
  {
    match: /sql.*inject|csharp.*sql|ado.*net.*inject/i,
    contextLines: 3,
    generate: (windowLines, windowStart, findingLine) => {
      const idx = findingLine - windowStart;
      if (idx < 0 || idx >= windowLines.length) return null;
      const line = windowLines[idx];
      const m = line.match(/^(\s*)(?:var|string)\s+\w+\s*=\s*\$?"[^"]*"\s*\+\s*(\w+)\s*;/);
      if (!m) return null;
      // Look for SqlCommand nearby
      const window = windowLines.join("\n");
      if (!/SqlCommand|ExecuteReader|ExecuteNonQuery/.test(window)) return null;
      const [, indent, param] = m;
      const oldText = line;
      const newText = [
        `${indent}// TODO: use parameterized queries instead of string concatenation`,
        `${indent}cmd.Parameters.AddWithValue("@param", ${param});`,
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
