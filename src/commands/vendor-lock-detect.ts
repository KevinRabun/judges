/**
 * Vendor lock detect — scan code for vendor-specific APIs and SDKs
 * commonly embedded by AI models. Flag portability risks.
 *
 * All analysis local.
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface VendorMatch {
  file: string;
  line: number;
  vendor: string;
  category: string;
  pattern: string;
  severity: "high" | "medium" | "low";
}

interface VendorPattern {
  vendor: string;
  category: string;
  regex: RegExp;
  severity: VendorMatch["severity"];
}

// ─── Vendor patterns ────────────────────────────────────────────────────────

const VENDOR_PATTERNS: VendorPattern[] = [
  // AWS
  { vendor: "AWS", category: "SDK", regex: /(?:aws-sdk|@aws-sdk\/|require\s*\(\s*["']aws)/i, severity: "high" },
  {
    vendor: "AWS",
    category: "Service",
    regex: /\b(?:DynamoDB|S3Client|LambdaClient|SQSClient|SNSClient|EC2Client)\b/,
    severity: "high",
  },
  { vendor: "AWS", category: "API", regex: /\b(?:amazonaws\.com|\.aws\.amazon\.com)\b/i, severity: "medium" },
  {
    vendor: "AWS",
    category: "Config",
    regex: /\b(?:AWS_ACCESS_KEY|AWS_SECRET|AWS_REGION|aws_access_key_id)\b/,
    severity: "medium",
  },
  {
    vendor: "AWS",
    category: "Service",
    regex: /\b(?:cognito|cloudformation|cloudwatch|elasticache|redshift)\b/i,
    severity: "medium",
  },

  // Azure
  { vendor: "Azure", category: "SDK", regex: /(?:@azure\/|azure-storage|microsoft\.azure)/i, severity: "high" },
  {
    vendor: "Azure",
    category: "Service",
    regex: /\b(?:BlobServiceClient|CosmosClient|ServiceBusClient|EventHubClient)\b/,
    severity: "high",
  },
  {
    vendor: "Azure",
    category: "API",
    regex: /\b(?:\.azure\.com|\.windows\.net|\.microsoft\.com\/api)\b/i,
    severity: "medium",
  },
  {
    vendor: "Azure",
    category: "Config",
    regex: /\b(?:AZURE_TENANT|AZURE_CLIENT_ID|AZURE_SUBSCRIPTION)\b/,
    severity: "medium",
  },

  // GCP
  { vendor: "GCP", category: "SDK", regex: /(?:@google-cloud\/|googleapis|google\.cloud)/i, severity: "high" },
  {
    vendor: "GCP",
    category: "Service",
    regex: /\b(?:BigQuery|Firestore|PubSub|CloudStorage|Spanner)\b/,
    severity: "high",
  },
  { vendor: "GCP", category: "API", regex: /\b(?:googleapis\.com|\.gstatic\.com)\b/i, severity: "medium" },
  {
    vendor: "GCP",
    category: "Config",
    regex: /\b(?:GOOGLE_APPLICATION_CREDENTIALS|GCP_PROJECT|GCLOUD)\b/,
    severity: "medium",
  },

  // Vercel
  { vendor: "Vercel", category: "SDK", regex: /(?:@vercel\/|vercel\.com\/api)\b/i, severity: "medium" },
  { vendor: "Vercel", category: "Service", regex: /\b(?:VERCEL_URL|VERCEL_ENV|vercel\.json)\b/, severity: "low" },

  // Cloudflare
  {
    vendor: "Cloudflare",
    category: "SDK",
    regex: /(?:@cloudflare\/|cloudflare-workers|wrangler)\b/i,
    severity: "medium",
  },
  {
    vendor: "Cloudflare",
    category: "Service",
    regex: /\b(?:Workers|KVNamespace|DurableObject|R2Bucket)\b/,
    severity: "medium",
  },

  // Firebase
  { vendor: "Firebase", category: "SDK", regex: /(?:firebase\/|firebase-admin|@firebase\/)\b/i, severity: "high" },
  {
    vendor: "Firebase",
    category: "Service",
    regex: /\b(?:initializeApp|getFirestore|getAuth|getStorage)\b.*firebase/i,
    severity: "high",
  },

  // Stripe
  { vendor: "Stripe", category: "SDK", regex: /(?:stripe|@stripe\/)/i, severity: "medium" },

  // Twilio
  { vendor: "Twilio", category: "SDK", regex: /(?:twilio|@twilio\/)/i, severity: "medium" },

  // Docker-specific
  { vendor: "Docker", category: "Platform", regex: /\b(?:DOCKER_HOST|docker-compose|dockerfile)\b/i, severity: "low" },

  // Vendor-specific ORMs
  { vendor: "MongoDB", category: "Database", regex: /(?:mongoose|mongodb|MongoClient)\b/i, severity: "medium" },
  {
    vendor: "PostgreSQL",
    category: "Database",
    regex: /(?:pg|sequelize|knex|prisma).*(?:postgres|pg)\b/i,
    severity: "low",
  },
];

// ─── Scanner ────────────────────────────────────────────────────────────────

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);
const EXTS = new Set([
  ".ts",
  ".js",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".rb",
  ".php",
  ".rs",
  ".yaml",
  ".yml",
  ".json",
  ".env",
  ".cfg",
]);

function collectFiles(dir: string): string[] {
  const result: string[] = [];
  function walk(d: string): void {
    let entries: string[];
    try {
      entries = readdirSync(d) as unknown as string[];
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP.has(name) || name.startsWith(".")) continue;
      const full = join(d, name);
      try {
        const sub = readdirSync(full);
        void sub;
        walk(full);
      } catch {
        if (EXTS.has(extname(name).toLowerCase())) result.push(full);
      }
    }
  }
  walk(dir);
  return result;
}

function scanFile(filePath: string): VendorMatch[] {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return [];
  }
  const lines = content.split("\n");
  const matches: VendorMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const vp of VENDOR_PATTERNS) {
      if (vp.regex.test(lines[i])) {
        matches.push({
          file: filePath,
          line: i + 1,
          vendor: vp.vendor,
          category: vp.category,
          pattern: lines[i].trim().substring(0, 80),
          severity: vp.severity,
        });
      }
    }
  }

  return matches;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export function runVendorLockDetect(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`
judges vendor-lock-detect — Scan for vendor-specific API dependencies

Usage:
  judges vendor-lock-detect [dir]
  judges vendor-lock-detect src/ --vendor AWS,GCP

Options:
  --vendor <names>     Filter by vendor (comma-separated: AWS,Azure,GCP,Firebase,...)
  --severity <levels>  Filter by severity (comma-separated)
  --vendors            List all detected vendor patterns
  --format json        JSON output
  --help, -h           Show this help

Vendors: AWS, Azure, GCP, Vercel, Cloudflare, Firebase, Stripe, Twilio, Docker, MongoDB, PostgreSQL
`);
    return;
  }

  const format = argv.find((_a: string, i: number) => argv[i - 1] === "--format") || "text";

  if (argv.includes("--vendors")) {
    const grouped: Record<string, string[]> = {};
    for (const vp of VENDOR_PATTERNS) {
      if (!grouped[vp.vendor]) grouped[vp.vendor] = [];
      if (!grouped[vp.vendor].includes(vp.category)) grouped[vp.vendor].push(vp.category);
    }
    if (format === "json") {
      console.log(JSON.stringify(grouped, null, 2));
    } else {
      console.log(`\n  Vendor Patterns\n  ──────────────────────────`);
      for (const [vendor, categories] of Object.entries(grouped)) {
        console.log(`    ${vendor}: ${categories.join(", ")}`);
      }
      console.log("");
    }
    return;
  }

  const target = argv.find((a: string) => !a.startsWith("--") && !argv[argv.indexOf(a) - 1]?.startsWith("--")) || ".";
  const vendorFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--vendor");
  const sevFilter = argv.find((_a: string, i: number) => argv[i - 1] === "--severity");

  if (!existsSync(target)) {
    console.error(`  Path not found: ${target}`);
    return;
  }

  let files: string[];
  try {
    readdirSync(target);
    files = collectFiles(target);
  } catch {
    files = [target];
  }

  let allMatches: VendorMatch[] = [];
  for (const f of files) allMatches.push(...scanFile(f));

  if (vendorFilter) {
    const allowed = vendorFilter.split(",");
    allMatches = allMatches.filter((m) => allowed.includes(m.vendor));
  }
  if (sevFilter) {
    const allowed = sevFilter.split(",");
    allMatches = allMatches.filter((m) => allowed.includes(m.severity));
  }

  // Group by vendor
  const byVendor: Record<string, VendorMatch[]> = {};
  for (const m of allMatches) {
    if (!byVendor[m.vendor]) byVendor[m.vendor] = [];
    byVendor[m.vendor].push(m);
  }

  const vendorCount = Object.keys(byVendor).length;
  const portabilityScore = vendorCount <= 1 ? 90 : vendorCount <= 2 ? 60 : vendorCount <= 3 ? 40 : 20;

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          matches: allMatches,
          byVendor,
          portabilityScore,
          scannedFiles: files.length,
          timestamp: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\n  Vendor Lock-In Detection — ${files.length} files`);
    console.log(`  Vendors detected: ${vendorCount} | Portability score: ${portabilityScore}/100`);
    console.log(`  ──────────────────────────`);

    if (allMatches.length === 0) {
      console.log(`    ✅ No vendor lock-in detected\n`);
      return;
    }

    for (const [vendor, matches] of Object.entries(byVendor)) {
      console.log(`\n    ${vendor} (${matches.length} references)`);
      const categories = [...new Set(matches.map((m) => m.category))];
      console.log(`      Categories: ${categories.join(", ")}`);
      for (const m of matches.slice(0, 5)) {
        const icon = m.severity === "high" ? "🔴" : m.severity === "medium" ? "🟡" : "🟢";
        console.log(`      ${icon} ${m.file}:${m.line} — ${m.pattern}`);
      }
      if (matches.length > 5) console.log(`      ... and ${matches.length - 5} more`);
    }

    if (vendorCount > 1) {
      console.log(`\n    ⚠️  Multi-vendor dependency detected — consider abstraction layers`);
    }
    console.log("");
  }
}
