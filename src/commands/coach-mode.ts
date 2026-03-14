/**
 * Coach mode — interactive teaching mode that explains why each
 * finding matters with real-world examples and secure alternatives.
 *
 * Wraps evaluations with educational context for each finding category.
 */

import { readFileSync, existsSync } from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CoachLesson {
  category: string;
  explanation: string;
  realWorldExample: string;
  secureAlternative: string;
  resources: string[];
}

// ─── Knowledge Base ─────────────────────────────────────────────────────────

const LESSONS: CoachLesson[] = [
  {
    category: "sql-injection",
    explanation:
      "SQL injection occurs when user input is concatenated directly into SQL queries, allowing attackers to manipulate the query logic, extract data, or modify the database.",
    realWorldExample:
      "Heartland Payment Systems (2008): SQL injection led to theft of 130 million credit card numbers. Equifax breach (2017): An unpatched vulnerability allowed SQL injection affecting 147 million people.",
    secureAlternative:
      "BEFORE: `db.query('SELECT * FROM users WHERE id=' + userId)`\nAFTER:  `db.query('SELECT * FROM users WHERE id=$1', [userId])`\n\nAlways use parameterized queries or prepared statements.",
    resources: ["OWASP SQL Injection Prevention", "CWE-89: SQL Injection"],
  },
  {
    category: "xss",
    explanation:
      "Cross-Site Scripting (XSS) lets attackers inject malicious scripts into web pages viewed by other users, stealing session cookies, redirecting users, or defacing content.",
    realWorldExample:
      "British Airways (2018): XSS-style attack on payment page stole 380,000 credit card details. TweetDeck XSS worm (2014) auto-retweeted itself across thousands of accounts.",
    secureAlternative:
      "BEFORE: `element.innerHTML = userInput`\nAFTER:  `element.textContent = userInput`\n  OR:   `element.innerHTML = DOMPurify.sanitize(userInput)`\n\nAlways sanitize before DOM insertion.",
    resources: ["OWASP XSS Prevention Cheat Sheet", "CWE-79: Cross-site Scripting"],
  },
  {
    category: "hardcoded-secret",
    explanation:
      "Hardcoded secrets (API keys, passwords, tokens) in source code are exposed to anyone with repo access and persist in git history even if 'deleted'. Automated scrapers on GitHub find them within seconds.",
    realWorldExample:
      "Uber (2016): AWS keys hardcoded in a GitHub repo led to breach of 57 million records. Multiple cryptocurrency thefts traced to API keys pushed to public repos.",
    secureAlternative:
      "BEFORE: `const apiKey = 'sk-1234567890abcdef'`\nAFTER:  `const apiKey = process.env.API_KEY`\n\nUse environment variables, .env files (gitignored), or a secrets manager (AWS SSM, HashiCorp Vault).",
    resources: ["OWASP Secrets Management", "CWE-798: Hard-coded Credentials"],
  },
  {
    category: "eval",
    explanation:
      "eval() and new Function() execute arbitrary code strings, enabling code injection attacks where attacker-controlled input becomes executable code.",
    realWorldExample:
      "Multiple Node.js package supply chain attacks used eval() to execute obfuscated malicious payloads. The event-stream incident (2018) used eval-like patterns to steal cryptocurrency.",
    secureAlternative:
      "BEFORE: `eval('obj.' + propName)`\nAFTER:  `obj[propName]`  (property access)\n  OR:   Use a safe parser like expr-eval for math expressions.\n\nNever pass user input to eval().",
    resources: ["CWE-95: Eval Injection", "MDN: Never use eval()"],
  },
  {
    category: "empty-catch",
    explanation:
      "Empty catch blocks silently swallow exceptions, hiding bugs, security issues, and data corruption. The application continues in an undefined state without any indication of failure.",
    realWorldExample:
      "Knight Capital (2012): Silent error handling in trading software caused $440 million loss in 45 minutes. Empty catches masked the deployment error that triggered the catastrophe.",
    secureAlternative:
      "BEFORE: `try { op() } catch (e) {}`\nAFTER:  `try { op() } catch (e) { logger.error('Operation failed', { error: e }); throw e; }`\n\nAlways log, report, or re-throw caught exceptions.",
    resources: ["CWE-390: Detection of Error Without Action", "Error Handling Best Practices"],
  },
  {
    category: "insecure-http",
    explanation:
      "Plain HTTP transmits data unencrypted, allowing man-in-the-middle attacks to intercept passwords, API keys, and sensitive data in transit.",
    realWorldExample:
      "FireSheep (2010): Tool demonstrated mass session hijacking on HTTP networks at coffee shops. Multiple ISPs caught injecting ads and tracking scripts into HTTP traffic.",
    secureAlternative:
      "BEFORE: `fetch('http://api.example.com/data')`\nAFTER:  `fetch('https://api.example.com/data')`\n\nAlways use HTTPS. Enable HSTS headers. Reject HTTP in production.",
    resources: ["OWASP Transport Layer Protection", "CWE-319: Cleartext Transmission"],
  },
  {
    category: "weak-crypto",
    explanation:
      "Math.random() is predictable and not cryptographically secure. MD5 and SHA1 are broken for security purposes — collisions can be generated practically.",
    realWorldExample:
      "Flame malware (2012): Exploited MD5 collision to forge Microsoft certificates. Multiple password breaches accelerated by MD5 hash cracking (orders of magnitude faster than bcrypt).",
    secureAlternative:
      "BEFORE: `const token = Math.random().toString(36)`\nAFTER:  `const token = crypto.randomUUID()`\n\nBEFORE: `crypto.createHash('md5')`\nAFTER:  `crypto.createHash('sha256')`  or bcrypt for passwords.",
    resources: ["OWASP Cryptographic Failures", "CWE-338: Weak PRNG"],
  },
  {
    category: "command-injection",
    explanation:
      "Passing user input to shell commands (exec, spawn with string) allows attackers to inject additional commands using ; && || etc.",
    realWorldExample:
      "ImageTragick (2016): Image processing library passed filenames to shell commands, enabling remote code execution on thousands of servers. Multiple CI/CD pipeline compromises via command injection in build scripts.",
    secureAlternative:
      "BEFORE: `execSync('convert ' + filename)`\nAFTER:  `spawn('convert', [filename])`\n\nUse array-based APIs. Validate inputs against allowlists. Never pass user input to exec().",
    resources: ["OWASP OS Command Injection", "CWE-78: OS Command Injection"],
  },
  {
    category: "cors",
    explanation:
      "Permissive CORS (Access-Control-Allow-Origin: *) allows any website to make authenticated requests to your API, enabling cross-origin data theft.",
    realWorldExample:
      "Multiple cryptocurrency exchanges had funds stolen via CORS misconfiguration, where malicious sites could read authenticated API responses including account balances and trade capabilities.",
    secureAlternative:
      "BEFORE: `app.use(cors())`  // allows all origins\nAFTER:  `app.use(cors({ origin: ['https://myapp.com'], credentials: true }))`\n\nSpecify allowed origins. Never use * with credentials.",
    resources: ["OWASP CORS Misconfiguration", "MDN: CORS"],
  },
  {
    category: "missing-auth",
    explanation:
      "API endpoints without authentication middleware are accessible to anyone, including automated scanners. Every endpoint processing or returning data must verify the caller's identity.",
    realWorldExample:
      "Parler data scrape (2021): Unauthenticated API endpoints allowed bulk download of millions of posts including deleted content. T-Mobile (2021): Unauthenticated API exposed 40 million records.",
    secureAlternative:
      "BEFORE: `app.get('/users', handler)`\nAFTER:  `app.get('/users', authMiddleware, roleCheck('admin'), handler)`\n\nApply authentication to all non-public routes. Add authorization for sensitive operations.",
    resources: ["OWASP Broken Access Control", "CWE-306: Missing Authentication"],
  },
];

function findLesson(text: string): CoachLesson | null {
  const lower = text.toLowerCase();
  for (const lesson of LESSONS) {
    if (lower.includes(lesson.category) || lower.includes(lesson.category.replace(/-/g, " "))) {
      return lesson;
    }
  }
  // Fuzzy match
  const keywords: Record<string, string> = {
    sql: "sql-injection",
    inject: "sql-injection",
    xss: "xss",
    "cross-site": "xss",
    innerhtml: "xss",
    secret: "hardcoded-secret",
    password: "hardcoded-secret",
    hardcode: "hardcoded-secret",
    eval: "eval",
    "new function": "eval",
    "empty catch": "empty-catch",
    "catch {}": "empty-catch",
    http: "insecure-http",
    "math.random": "weak-crypto",
    md5: "weak-crypto",
    crypto: "weak-crypto",
    exec: "command-injection",
    spawn: "command-injection",
    command: "command-injection",
    cors: "cors",
    auth: "missing-auth",
    middleware: "missing-auth",
  };
  for (const [kw, cat] of Object.entries(keywords)) {
    if (lower.includes(kw)) {
      return LESSONS.find((l) => l.category === cat) || null;
    }
  }
  return null;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runCoachMode(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges coach-mode — Educational security coaching

Usage:
  judges coach-mode --topic sql-injection
  judges coach-mode --topic xss
  judges coach-mode --all
  judges coach-mode --scan <file>

Options:
  --topic <name>        Learn about a specific finding category
  --all                 Show all available lessons
  --scan <file>         Scan a file and show coaching for each finding
  --format json         JSON output
  --help, -h            Show this help

Topics: sql-injection, xss, hardcoded-secret, eval, empty-catch,
        insecure-http, weak-crypto, command-injection, cors, missing-auth
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const topic = argv.find((_a: string, i: number) => argv[i - 1] === "--topic") || "";
  const isAll = argv.includes("--all");
  const scanFile = argv.find((_a: string, i: number) => argv[i - 1] === "--scan") || "";

  if (isAll) {
    if (format === "json") {
      console.log(JSON.stringify({ lessons: LESSONS, total: LESSONS.length }, null, 2));
    } else {
      console.log(`\n  Coach Mode — ${LESSONS.length} lessons available\n  ──────────────────────────`);
      for (const lesson of LESSONS) {
        console.log(`\n    📚 ${lesson.category}`);
        console.log(`        ${lesson.explanation.substring(0, 80)}...`);
      }
      console.log("\n    Use --topic <name> for full lesson details.\n");
    }
    return;
  }

  if (topic) {
    const lesson = findLesson(topic);
    if (!lesson) {
      console.error(`  Unknown topic: ${topic}. Use --all to see available topics.`);
      return;
    }

    if (format === "json") {
      console.log(JSON.stringify(lesson, null, 2));
    } else {
      console.log(`\n  📚 ${lesson.category.toUpperCase()}`);
      console.log(`  ──────────────────────────\n`);
      console.log(`  WHY IT MATTERS:`);
      console.log(`    ${lesson.explanation}\n`);
      console.log(`  REAL-WORLD EXAMPLES:`);
      console.log(`    ${lesson.realWorldExample}\n`);
      console.log(`  SECURE ALTERNATIVE:`);
      for (const line of lesson.secureAlternative.split("\n")) {
        console.log(`    ${line}`);
      }
      console.log(`\n  RESOURCES:`);
      for (const r of lesson.resources) {
        console.log(`    📖 ${r}`);
      }
      console.log("");
    }
    return;
  }

  if (scanFile) {
    if (!existsSync(scanFile)) {
      console.error(`  File not found: ${scanFile}`);
      return;
    }

    const content = readFileSync(scanFile, "utf-8");
    const lines = content.split("\n");
    const found: Array<{ line: number; lesson: CoachLesson }> = [];

    for (let i = 0; i < lines.length; i++) {
      const lesson = findLesson(lines[i]);
      if (lesson && !found.some((f) => f.lesson.category === lesson.category)) {
        found.push({ line: i + 1, lesson });
      }
    }

    if (format === "json") {
      console.log(
        JSON.stringify(
          {
            file: scanFile,
            findings: found.map((f) => ({ line: f.line, ...f.lesson })),
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`\n  Coach Mode — ${scanFile} (${found.length} teaching moment(s))\n  ──────────────────────────`);

      if (found.length === 0) {
        console.log("  ✅ No common anti-patterns detected to coach on.");
      } else {
        for (const f of found) {
          console.log(`\n    📚 Line ${f.line}: ${f.lesson.category}`);
          console.log(`        ${f.lesson.explanation}`);
          console.log(`        🔴 Example breach: ${f.lesson.realWorldExample.split(".")[0]}`);
          console.log(
            `        💡 ${f.lesson.secureAlternative.split("\n")[f.lesson.secureAlternative.includes("AFTER") ? 1 : 0]}`,
          );
        }
      }
      console.log("");
    }
    return;
  }

  console.log("  Use --topic <name>, --all, or --scan <file>. See --help for details.");
}
