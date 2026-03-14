/**
 * Remediation guides — provide step-by-step fix guidance for common
 * finding categories, linked from finding output.
 *
 * Each guide includes: description, risk level, fix steps,
 * code examples (before/after), and references.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RemediationGuide {
  rulePrefix: string;
  title: string;
  category: string;
  risk: string;
  steps: string[];
  beforeCode?: string;
  afterCode?: string;
  references: string[];
}

// ─── Guides ─────────────────────────────────────────────────────────────────

const GUIDES: RemediationGuide[] = [
  {
    rulePrefix: "SEC-001",
    title: "SQL Injection Prevention",
    category: "Security",
    risk: "Critical — allows attackers to read/modify/delete database data",
    steps: [
      "Replace string concatenation in SQL queries with parameterized queries",
      "Use your ORM's built-in query builder instead of raw SQL",
      "If raw SQL is required, use prepared statements with placeholders",
      "Validate and sanitize all user input before using in queries",
      "Apply principle of least privilege to database accounts",
    ],
    beforeCode: `// VULNERABLE\nconst result = await db.query(\`SELECT * FROM users WHERE id = '\${userId}'\`);`,
    afterCode: `// SECURE\nconst result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);`,
    references: [
      "https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html",
      "https://cwe.mitre.org/data/definitions/89.html",
    ],
  },
  {
    rulePrefix: "SEC-002",
    title: "Cross-Site Scripting (XSS) Prevention",
    category: "Security",
    risk: "High — allows attackers to execute scripts in users' browsers",
    steps: [
      "Use context-aware output encoding (HTML, JavaScript, URL, CSS)",
      "Use framework auto-escaping (React JSX, Angular templates, etc.)",
      "Avoid dangerouslySetInnerHTML / v-html / innerHTML",
      "Implement Content-Security-Policy headers",
      "Validate and sanitize user input on the server side",
    ],
    beforeCode: `// VULNERABLE\nelement.innerHTML = userInput;`,
    afterCode: `// SECURE\nelement.textContent = userInput;`,
    references: [
      "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
      "https://cwe.mitre.org/data/definitions/79.html",
    ],
  },
  {
    rulePrefix: "SEC-003",
    title: "Command Injection Prevention",
    category: "Security",
    risk: "Critical — allows attackers to execute arbitrary OS commands",
    steps: [
      "Avoid shell command execution with user-controlled input",
      "Use language-native APIs instead of shell commands (e.g., fs.readdir instead of ls)",
      "If shell execution is required, use allowlists for permitted commands",
      "Use execFile/spawn with explicit argument arrays instead of exec with string concatenation",
      "Never pass user input directly to child_process.exec()",
    ],
    beforeCode: `// VULNERABLE\nexec(\`ls \${userDir}\`);`,
    afterCode: `// SECURE\nexecFile('ls', [userDir]);`,
    references: [
      "https://cheatsheetseries.owasp.org/cheatsheets/OS_Command_Injection_Defense_Cheat_Sheet.html",
      "https://cwe.mitre.org/data/definitions/78.html",
    ],
  },
  {
    rulePrefix: "AUTH-",
    title: "Authentication Best Practices",
    category: "Security",
    risk: "High — weak authentication allows unauthorized access",
    steps: [
      "Use bcrypt, argon2, or scrypt for password hashing (never MD5/SHA1)",
      "Implement rate limiting on login endpoints",
      "Use secure session management with HttpOnly, Secure, SameSite cookies",
      "Implement multi-factor authentication for sensitive operations",
      "Validate JWT tokens on every request (check signature, expiry, issuer)",
    ],
    references: [
      "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
      "https://cwe.mitre.org/data/definitions/287.html",
    ],
  },
  {
    rulePrefix: "CRYPTO-",
    title: "Cryptographic Best Practices",
    category: "Security",
    risk: "High — weak cryptography exposes sensitive data",
    steps: [
      "Use AES-256-GCM for symmetric encryption (not DES, 3DES, or ECB mode)",
      "Use RSA-2048+ or ECDSA P-256+ for asymmetric encryption",
      "Use SHA-256+ for hashing (not MD5 or SHA-1)",
      "Never hardcode encryption keys or secrets in source code",
      "Use platform-provided key management (AWS KMS, Azure Key Vault, etc.)",
    ],
    references: [
      "https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html",
      "https://cwe.mitre.org/data/definitions/327.html",
    ],
  },
  {
    rulePrefix: "SSRF-",
    title: "Server-Side Request Forgery Prevention",
    category: "Security",
    risk: "High — allows attackers to make requests from your server to internal resources",
    steps: [
      "Validate and sanitize all URLs before making server-side requests",
      "Use an allowlist of permitted domains/IPs",
      "Block requests to private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)",
      "Disable HTTP redirects or validate redirect targets",
      "Use a URL parser to validate the scheme (allow only https://)",
    ],
    references: [
      "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html",
      "https://cwe.mitre.org/data/definitions/918.html",
    ],
  },
  {
    rulePrefix: "PERF-",
    title: "Performance Optimization",
    category: "Performance",
    risk: "Medium — poor performance degrades user experience and increases costs",
    steps: [
      "Identify the bottleneck: CPU, memory, I/O, or network",
      "Use profiling tools (Node.js --prof, py-spy, Go pprof)",
      "Avoid N+1 queries — batch database operations",
      "Use caching for expensive computations (Redis, in-memory LRU)",
      "Implement pagination for large result sets",
    ],
    references: ["https://web.dev/performance/"],
  },
  {
    rulePrefix: "ERR-",
    title: "Error Handling Best Practices",
    category: "Reliability",
    risk: "Medium — poor error handling causes crashes and data corruption",
    steps: [
      "Catch and handle errors at appropriate boundaries",
      "Never swallow exceptions silently — at minimum log them",
      "Use structured error types with error codes",
      "Implement graceful degradation for non-critical failures",
      "Never expose stack traces or internal error details to users",
    ],
    references: ["https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html"],
  },
  {
    rulePrefix: "CONCUR-",
    title: "Concurrency Safety",
    category: "Reliability",
    risk: "High — race conditions cause data corruption and security vulnerabilities",
    steps: [
      "Identify shared mutable state and protect it with locks/mutexes",
      "Prefer immutable data structures",
      "Use atomic operations for simple shared counters",
      "Avoid holding multiple locks simultaneously (prevents deadlocks)",
      "Use channels/message-passing instead of shared memory where possible",
    ],
    references: ["https://cwe.mitre.org/data/definitions/362.html"],
  },
  {
    rulePrefix: "IAC-",
    title: "Infrastructure as Code Security",
    category: "Infrastructure",
    risk: "High — IaC misconfigurations expose cloud resources to attack",
    steps: [
      "Enable encryption at rest and in transit for all storage resources",
      "Apply principle of least privilege to IAM roles and policies",
      "Enable logging and monitoring (CloudTrail, Azure Monitor, etc.)",
      "Use private subnets for databases and internal services",
      "Never hardcode secrets in Terraform/Bicep/CloudFormation templates",
    ],
    references: ["https://cheatsheetseries.owasp.org/cheatsheets/Infrastructure_as_Code_Security_Cheat_Sheet.html"],
  },
];

// ─── Lookup API ─────────────────────────────────────────────────────────────

export function findGuide(ruleId: string): RemediationGuide | undefined {
  // Exact match first, then prefix match
  return GUIDES.find((g) => ruleId.startsWith(g.rulePrefix));
}

export function listGuides(): RemediationGuide[] {
  return GUIDES;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runRemediationGuide(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges remediation — Step-by-step fix guidance for findings

Usage:
  judges remediation SEC-001          Show guide for a specific rule
  judges remediation --list           List all available guides
  judges remediation --category Security  Filter by category

Options:
  --list               List all guides
  --category <cat>     Filter by category
  --format json        JSON output
  --help, -h           Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";
  const categoryFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--category");

  if (argv.includes("--list")) {
    let guides = GUIDES;
    if (categoryFilter) guides = guides.filter((g) => g.category.toLowerCase() === categoryFilter.toLowerCase());

    if (format === "json") {
      console.log(JSON.stringify(guides, null, 2));
      return;
    }

    console.log("\n  Available Remediation Guides:\n");
    for (const g of guides) {
      console.log(`    ${g.rulePrefix.padEnd(12)} ${g.title.padEnd(40)} [${g.category}]`);
    }
    console.log("");
    return;
  }

  // Find guide by rule ID
  const ruleId = argv.find(
    (a, i) => i > 1 && !a.startsWith("-") && argv[i - 1] !== "--format" && argv[i - 1] !== "--category",
  );
  if (!ruleId) {
    console.error("Error: provide a rule ID or use --list");
    process.exit(1);
  }

  const guide = findGuide(ruleId);
  if (!guide) {
    console.log(`  No guide found for "${ruleId}". Use --list to see available guides.`);
    return;
  }

  if (format === "json") {
    console.log(JSON.stringify(guide, null, 2));
    return;
  }

  console.log(`\n  📖 ${guide.title}\n`);
  console.log(`  Category: ${guide.category}`);
  console.log(`  Risk: ${guide.risk}\n`);
  console.log("  Steps:");
  for (let i = 0; i < guide.steps.length; i++) {
    console.log(`    ${i + 1}. ${guide.steps[i]}`);
  }

  if (guide.beforeCode) {
    console.log("\n  Before (vulnerable):");
    console.log(`    ${guide.beforeCode.split("\n").join("\n    ")}`);
  }
  if (guide.afterCode) {
    console.log("\n  After (secure):");
    console.log(`    ${guide.afterCode.split("\n").join("\n    ")}`);
  }

  if (guide.references.length > 0) {
    console.log("\n  References:");
    for (const ref of guide.references) {
      console.log(`    • ${ref}`);
    }
  }
  console.log("");
}
