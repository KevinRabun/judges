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
];

export function enrichWithPatches(findings: Finding[], code: string): Finding[] {
  const lines = code.split("\n");
  return findings.map((f) => {
    // Skip if patch already present or no line numbers
    if (f.patch || !f.lineNumbers || f.lineNumbers.length === 0) return f;

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
    return f;
  });
}
