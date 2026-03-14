/**
 * Learning path — generates personalized developer learning
 * modules from recurring finding patterns, tracking skill
 * progression over time.
 *
 * All data stored locally.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface LearningModule {
  id: string;
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string;
  resources: string[];
  exercises: string[];
  prerequisites: string[];
}

interface DeveloperProgress {
  developer: string;
  completedModules: string[];
  weakAreas: Array<{ topic: string; findingCount: number }>;
  skillLevel: number; // 1-10
  lastUpdated: string;
}

interface LearningReport {
  recommendedModules: LearningModule[];
  progress: DeveloperProgress;
  timestamp: string;
}

// ─── Module Library ─────────────────────────────────────────────────────────

const MODULES: LearningModule[] = [
  {
    id: "sql-injection-101",
    topic: "SQL Injection Prevention",
    difficulty: "beginner",
    description: "Learn to identify and prevent SQL injection vulnerabilities",
    resources: [
      "OWASP SQL Injection Prevention Cheat Sheet",
      "Use parameterized queries instead of string concatenation",
      "Apply input validation at system boundaries",
    ],
    exercises: [
      "Refactor a string-concatenated query to use parameterized statements",
      "Identify SQL injection vectors in a sample CRUD controller",
      "Implement an ORM-based data access layer",
    ],
    prerequisites: [],
  },
  {
    id: "xss-prevention",
    topic: "Cross-Site Scripting (XSS) Prevention",
    difficulty: "beginner",
    description: "Understand and prevent XSS vulnerabilities in web applications",
    resources: [
      "OWASP XSS Prevention Cheat Sheet",
      "Content Security Policy (CSP) headers",
      "Output encoding for different contexts (HTML, JS, URL, CSS)",
    ],
    exercises: [
      "Add output encoding to a template rendering user input",
      "Configure CSP headers for a web application",
      "Test for DOM-based XSS in a client-side application",
    ],
    prerequisites: [],
  },
  {
    id: "auth-security",
    topic: "Authentication & Authorization",
    difficulty: "intermediate",
    description: "Implement secure authentication and authorization patterns",
    resources: [
      "OWASP Authentication Cheat Sheet",
      "JWT best practices and pitfalls",
      "OAuth 2.0 and OpenID Connect fundamentals",
    ],
    exercises: [
      "Implement rate limiting on login endpoints",
      "Add proper JWT validation with signature verification",
      "Design role-based access control for an API",
    ],
    prerequisites: ["sql-injection-101"],
  },
  {
    id: "crypto-basics",
    topic: "Cryptography Fundamentals",
    difficulty: "intermediate",
    description: "Use cryptographic primitives correctly",
    resources: [
      "OWASP Cryptographic Storage Cheat Sheet",
      "Modern cipher suites and key management",
      "Password hashing: bcrypt, scrypt, Argon2",
    ],
    exercises: [
      "Replace MD5/SHA-1 with SHA-256 or better",
      "Implement proper password hashing with Argon2",
      "Set up encrypted-at-rest storage for sensitive data",
    ],
    prerequisites: [],
  },
  {
    id: "ssrf-prevention",
    topic: "Server-Side Request Forgery (SSRF)",
    difficulty: "advanced",
    description: "Prevent SSRF attacks in web applications",
    resources: [
      "OWASP SSRF Prevention Cheat Sheet",
      "URL validation and allowlisting strategies",
      "Network segmentation for defense in depth",
    ],
    exercises: [
      "Implement URL validation with an allowlist",
      "Block internal IP ranges in outbound requests",
      "Design a secure proxy service for external API calls",
    ],
    prerequisites: ["auth-security"],
  },
  {
    id: "supply-chain",
    topic: "Supply Chain Security",
    difficulty: "advanced",
    description: "Secure the software supply chain",
    resources: [
      "SLSA framework for supply chain integrity",
      "Dependency pinning and lock file management",
      "SBOM generation and consumption",
    ],
    exercises: [
      "Generate an SBOM with `judges sbom-export`",
      "Audit dependencies with `judges dep-correlate`",
      "Set up automated dependency update policies",
    ],
    prerequisites: ["crypto-basics"],
  },
  {
    id: "secure-code-review",
    topic: "Secure Code Review Practices",
    difficulty: "intermediate",
    description: "Conduct effective security-focused code reviews",
    resources: [
      "OWASP Code Review Guide",
      "Common vulnerability patterns by language",
      "Using Judges for automated security review",
    ],
    exercises: [
      "Review a sample PR for security issues using Judges",
      "Create a custom judge with `judges judge-author`",
      "Build a team pattern library with `judges pattern-registry`",
    ],
    prerequisites: ["sql-injection-101", "xss-prevention"],
  },
  {
    id: "incident-handling",
    topic: "Security Incident Handling",
    difficulty: "advanced",
    description: "Respond to and manage security incidents",
    resources: [
      "NIST Incident Response Guide",
      "Post-incident review best practices",
      "Using `judges incident-response` for playbook generation",
    ],
    exercises: [
      "Create an incident response playbook for a critical finding",
      "Conduct a tabletop exercise with the team",
      "Set up SLA tracking with `judges sla-track`",
    ],
    prerequisites: ["secure-code-review", "auth-security"],
  },
];

// ─── Analysis ───────────────────────────────────────────────────────────────

const TOPIC_PATTERNS: Record<string, string[]> = {
  "SQL Injection Prevention": ["sql", "injection", "query", "database"],
  "Cross-Site Scripting (XSS) Prevention": ["xss", "cross-site", "script", "sanitize", "encode"],
  "Authentication & Authorization": ["auth", "login", "password", "token", "jwt", "session", "rbac"],
  "Cryptography Fundamentals": ["crypto", "cipher", "hash", "encrypt", "md5", "sha1", "key"],
  "Server-Side Request Forgery (SSRF)": ["ssrf", "request-forgery", "url", "redirect"],
  "Supply Chain Security": ["dependency", "package", "npm", "supply-chain", "sbom"],
  "Secure Code Review Practices": ["review", "code-quality", "pattern"],
  "Security Incident Handling": ["incident", "breach", "response", "escalation"],
};

function analyzeWeaknesses(
  findings: Array<{ ruleId: string; severity: string; title: string }>,
): Array<{ topic: string; findingCount: number }> {
  const topicCounts = new Map<string, number>();

  for (const f of findings) {
    const text = `${f.ruleId} ${f.title}`.toLowerCase();
    for (const [topic, patterns] of Object.entries(TOPIC_PATTERNS)) {
      if (patterns.some((p) => text.includes(p))) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
      }
    }
  }

  return [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, findingCount: count }))
    .sort((a, b) => b.findingCount - a.findingCount);
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const STORE = ".judges-learning";

export function runLearningPath(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges learning-path — Personalized security learning recommendations

Usage:
  judges learning-path
  judges learning-path --developer "alice"
  judges learning-path --modules
  judges learning-path --complete <module-id>

Options:
  --developer <name>    Developer name for personalized path
  --modules             List all available learning modules
  --complete <id>       Mark a module as completed
  --reset               Reset progress for developer
  --format json         JSON output
  --help, -h            Show this help
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  // List modules
  if (argv.includes("--modules")) {
    if (format === "json") {
      console.log(JSON.stringify(MODULES, null, 2));
    } else {
      console.log(`\n  Learning Modules (${MODULES.length})\n  ──────────────────────────`);
      for (const m of MODULES) {
        console.log(`    [${m.difficulty.padEnd(12)}] ${m.id.padEnd(25)} ${m.topic}`);
      }
      console.log("");
    }
    return;
  }

  if (!existsSync(STORE)) mkdirSync(STORE, { recursive: true });

  const devName = argv.find((_a: string, i: number) => argv[i - 1] === "--developer") || "default";
  const progressPath = join(STORE, `${devName}-progress.json`);
  let progress: DeveloperProgress = existsSync(progressPath)
    ? JSON.parse(readFileSync(progressPath, "utf-8"))
    : { developer: devName, completedModules: [], weakAreas: [], skillLevel: 1, lastUpdated: new Date().toISOString() };

  // Reset
  if (argv.includes("--reset")) {
    progress = {
      developer: devName,
      completedModules: [],
      weakAreas: [],
      skillLevel: 1,
      lastUpdated: new Date().toISOString(),
    };
    writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    console.log(`  Reset progress for ${devName}`);
    return;
  }

  // Complete module
  const completeId = argv.find((_a: string, i: number) => argv[i - 1] === "--complete");
  if (completeId) {
    const mod = MODULES.find((m) => m.id === completeId);
    if (!mod) {
      console.error(`  Module ${completeId} not found.`);
      return;
    }
    if (!progress.completedModules.includes(completeId)) {
      progress.completedModules.push(completeId);
      progress.skillLevel = Math.min(10, Math.round((progress.completedModules.length / MODULES.length) * 10));
      progress.lastUpdated = new Date().toISOString();
      writeFileSync(progressPath, JSON.stringify(progress, null, 2));
    }
    console.log(`  Completed: ${mod.topic} — Skill level: ${progress.skillLevel}/10`);
    return;
  }

  // Analyze and recommend
  const findings: Array<{ ruleId: string; severity: string; title: string }> = [];
  const paths = [".judges-findings.json", "judges-report.json"];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf-8"));
      if (Array.isArray(data)) findings.push(...data);
      else if (data.findings) findings.push(...data.findings);
    } catch {
      /* skip */
    }
  }

  const weakAreas = analyzeWeaknesses(findings);
  progress.weakAreas = weakAreas;
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(progressPath, JSON.stringify(progress, null, 2));

  // Find recommended modules (not completed, prerequisites met)
  const recommended = MODULES.filter((m) => {
    if (progress.completedModules.includes(m.id)) return false;
    const prereqsMet = m.prerequisites.every((p) => progress.completedModules.includes(p));
    if (!prereqsMet) return false;
    // Prioritize modules matching weak areas
    return true;
  });

  // Sort by relevance to weak areas
  const sortedRecs = recommended.sort((a, b) => {
    const aRelevance = weakAreas.find((w) => w.topic === a.topic)?.findingCount || 0;
    const bRelevance = weakAreas.find((w) => w.topic === b.topic)?.findingCount || 0;
    return bRelevance - aRelevance;
  });

  const report: LearningReport = {
    recommendedModules: sortedRecs,
    progress,
    timestamp: new Date().toISOString(),
  };

  if (format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n  Learning Path — ${devName}`);
    console.log(
      `  Skill Level: ${progress.skillLevel}/10  Completed: ${progress.completedModules.length}/${MODULES.length}`,
    );
    console.log(`  ──────────────────────────`);

    if (weakAreas.length > 0) {
      console.log(`\n  Weak Areas (from findings):`);
      for (const w of weakAreas.slice(0, 5)) {
        console.log(`    ${w.topic.padEnd(35)} ${w.findingCount} findings`);
      }
    }

    console.log(`\n  Recommended Modules:`);
    if (sortedRecs.length === 0) {
      console.log(`    🎉 All available modules completed!`);
    } else {
      for (const m of sortedRecs.slice(0, 5)) {
        const relevant = weakAreas.find((w) => w.topic === m.topic);
        const tag = relevant ? ` (${relevant.findingCount} findings)` : "";
        console.log(`    [${m.difficulty.padEnd(12)}] ${m.id}${tag}`);
        console.log(`      ${m.topic}`);
      }
    }

    if (progress.completedModules.length > 0) {
      console.log(`\n  Completed:`);
      for (const id of progress.completedModules) {
        const mod = MODULES.find((m) => m.id === id);
        console.log(`    ✅ ${mod?.topic || id}`);
      }
    }
    console.log("");
  }
}
