import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeCostEffectiveness(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "COST";

  // Nested loops (potential O(n²))
  const lines = code.split("\n");
  let loopDepth = 0;
  const nestedLoopLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\b(?:for|while)\s*\(/.test(lines[i])) {
      loopDepth++;
      if (loopDepth >= 2) {
        nestedLoopLines.push(i + 1);
      }
    }
    if (/\}/.test(lines[i]) && loopDepth > 0) {
      loopDepth--;
    }
  }
  if (nestedLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Nested loops detected — potential O(n²) complexity",
      description: "Nested loops can lead to quadratic or worse time complexity. At scale, this causes dramatically increased compute costs and response times.",
      lineNumbers: nestedLoopLines,
      recommendation: "Consider using hash maps for lookups (O(1)), sorting + binary search, or restructuring the algorithm. If the nested loop is necessary, ensure the inner dataset is bounded.",
      reference: "Algorithm Efficiency Best Practices",
    });
  }

  // N+1 query patterns (loop with await inside)
  const awaitInLoopPattern = /(?:for|while|\.forEach|\.map)\s*\([\s\S]*?await\s/gi;
  if (awaitInLoopPattern.test(code)) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential N+1 query pattern (await in loop)",
      description: "An await call inside a loop suggests sequential asynchronous operations that could be batched. This causes N+1 performance problems and increased latency/cost.",
      recommendation: "Use Promise.all() to parallelize independent operations, or batch database queries (e.g., WHERE id IN (...) instead of per-ID queries).",
      reference: "Database Performance Anti-Patterns",
    });
  }

  // Unbounded data fetching
  const unboundedPattern = /\.find\s*\(\s*\{\s*\}\s*\)|SELECT\s+\*\s+FROM(?!\s+.*(?:WHERE|LIMIT))|\.findAll\s*\(\s*\)|\.objects\.all\(\)|\.ToList\s*\(\s*\)/gi;
  const unboundedLines = getLineNumbers(code, unboundedPattern);
  if (unboundedLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Unbounded data query",
      description: "A query fetches all records without filtering or pagination. With growing data, this will consume excessive memory, bandwidth, and compute.",
      lineNumbers: unboundedLines,
      recommendation: "Add pagination (LIMIT/OFFSET or cursor-based), filtering (WHERE clauses), and projection (select only needed fields). Default to a reasonable page size.",
      reference: "Database Query Optimization",
    });
  }

  // Large synchronous file reads (multi-language)
  const syncReadPattern = /readFileSync|readSync|fs\.readFile\s*\(\s*[^,]+\s*\)|open\s*\(.*\)\.read\(\)|File\.ReadAllText|File\.ReadAllLines|File\.ReadAllBytes|ioutil\.ReadFile/gi;
  const syncReadLines = getLineNumbers(code, syncReadPattern);
  if (syncReadLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Synchronous/blocking file I/O detected",
      description: "Synchronous file operations block the event loop or thread, reducing throughput and wasting compute resources — especially costly in serverless environments billed per-ms.",
      lineNumbers: syncReadLines,
      recommendation: "Use asynchronous file operations (fs.promises.readFile, aiofiles, async File.ReadAllTextAsync) or streaming for large files.",
      reference: "I/O Performance Best Practices",
    });
  }

  // No caching hints
  const hasCaching = /cache|redis|memcached|lru|memoize|Cache-Control|@Cacheable|functools\.lru_cache|@cache/gi.test(code);
  if (!hasCaching && code.split("\n").length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "No caching strategy detected",
      description: "The code has no apparent caching mechanism. For read-heavy workloads, caching can significantly reduce compute costs and latency.",
      recommendation: "Consider adding caching at appropriate layers: in-memory (LRU), distributed (Redis/Memcached), or HTTP (Cache-Control headers).",
      reference: "Caching Best Practices",
    });
  }

  // String concatenation in loops (Java/C#/Python)
  const strConcatLoopLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\b(?:for|while)\s*[\s(]/.test(line)) {
      const loopBody = lines.slice(i + 1, Math.min(lines.length, i + 10)).join("\n");
      if (/\+=\s*["']|\+\s*=\s*str|\.concat\s*\(|String\s*\+/i.test(loopBody)) {
        strConcatLoopLines.push(i + 1);
      }
    }
  });
  if (strConcatLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "String concatenation inside loop",
      description: "String concatenation in loops creates many intermediate string objects (especially in Java/C#/Python), leading to O(n²) memory allocation.",
      lineNumbers: strConcatLoopLines,
      recommendation: "Use StringBuilder (Java/C#), list with join (Python), or array with join (JavaScript) for building strings in loops.",
      reference: "String Performance Optimization",
    });
  }

  // Over-logging in production paths
  const logLines = getLineNumbers(code, /console\.(log|info|debug|warn|trace)\s*\(|logger\.(log|info|debug|trace)\s*\(|print\s*\(|fmt\.Print/gi);
  if (logLines.length > 15) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Excessive logging may increase costs",
      description: `Found ${logLines.length} log statements. Excessive logging in cloud environments increases storage and log ingestion costs (CloudWatch, Azure Monitor, Datadog).`,
      lineNumbers: logLines.slice(0, 5),
      recommendation: "Use appropriate log levels. Set DEBUG/TRACE only in development. Use sampling for high-frequency operations. Estimate log volume costs.",
      reference: "Cloud Logging Cost Optimization",
    });
  }

  // Unnecessary object creation / deep cloning
  const deepCloneLines = getLineNumbers(code, /JSON\.parse\s*\(\s*JSON\.stringify|structuredClone|cloneDeep|\.deepCopy|copy\.deepcopy/gi);
  if (deepCloneLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Deep cloning may be unnecessary",
      description: "Deep cloning (JSON.parse(JSON.stringify(...)), structuredClone, cloneDeep) is expensive. Ensure it's necessary and not used on large objects in hot paths.",
      lineNumbers: deepCloneLines,
      recommendation: "Consider shallow copies (spread operator, Object.assign) when deep cloning isn't needed. Use immutable data structures if cloning is for safety.",
      reference: "Memory Efficiency Patterns",
    });
  }

  // Eager loading / over-fetching
  const eagerLoadLines = getLineNumbers(code, /\.include\s*\(|\.populate\s*\(|\.eager\s*\(|\.prefetch_related|\.select_related|Include\s*\(|ThenInclude/gi);
  if (eagerLoadLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Excessive eager loading / data over-fetching",
      description: `Found ${eagerLoadLines.length} eager-loading directives. Loading too many relations eagerly wastes memory and bandwidth when the data isn't always needed.`,
      lineNumbers: eagerLoadLines.slice(0, 5),
      recommendation: "Use lazy loading for optional relations. Load only what's needed for each use case. Consider GraphQL or sparse fieldsets for flexible fetching.",
      reference: "ORM Performance Optimization",
    });
  }

  // Uncompressed responses
  const hasCompression = /compression|gzip|deflate|brotli|Content-Encoding|Accept-Encoding|UseResponseCompression/gi.test(code);
  const hasServer = /app\.(listen|use)|createServer|express\(\)|Flask|Django|WebApplication/gi.test(code);
  if (hasServer && !hasCompression) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "No response compression configured",
      description: "HTTP server code without compression middleware. Compressed responses can reduce bandwidth costs by 60-80% for text-based payloads.",
      recommendation: "Enable gzip/brotli compression (compression middleware for Express, GzipMiddleware for Django, UseResponseCompression in ASP.NET).",
      reference: "HTTP Compression Best Practices",
    });
  }

  // Missing connection pooling
  const hasDbConnection = /createConnection|new\s+Client\s*\(|MongoClient|DriverManager\.getConnection|SqlConnection|psycopg2\.connect|mysql\.connector/gi.test(code);
  const hasPooling = /Pool|pool|createPool|connection_pool|pooling|DataSource|HikariCP/gi.test(code);
  if (hasDbConnection && !hasPooling) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Database connections without pooling",
      description: "Creating individual database connections per request is expensive. Connection establishment overhead can dominate query time in cloud environments.",
      recommendation: "Use connection pooling (pg Pool, HikariCP, SqlAlchemy pool, ADO.NET connection pooling). Set appropriate min/max pool sizes.",
      reference: "Database Connection Pooling Best Practices",
    });
  }

  // Redundant data transformations
  const multiMapLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.map\s*\(/.test(line)) {
      const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 3)).join("\n");
      if (/\.map\s*\(|\.filter\s*\(/.test(nextLines)) {
        multiMapLines.push(i + 1);
      }
    }
  });
  if (multiMapLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Chained array transformations",
      description: "Multiple chained .map()/.filter() calls iterate the array multiple times. For large datasets, this wastes CPU and creates intermediate arrays.",
      lineNumbers: multiMapLines,
      recommendation: "Combine chained operations into a single reduce() or loop. Use lazy evaluation libraries (lodash/fp, RxJS) for large datasets.",
      reference: "Functional Programming Performance",
    });
  }

  // Serverless cold-start heavy imports
  const heavyImportLines = getLineNumbers(code, /import\s+.*(?:aws-sdk|@aws-sdk|firebase-admin|googleapis|azure-storage|@azure\/storage)/gi);
  if (heavyImportLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Heavy SDK imports may increase cold-start costs",
      description: `Found ${heavyImportLines.length} heavy SDK imports. In serverless environments, large imports increase cold-start duration and cost.`,
      lineNumbers: heavyImportLines,
      recommendation: "Import only specific modules (e.g., @aws-sdk/client-s3 instead of aws-sdk). Use tree-shakeable imports. Consider lazy loading for rarely-used SDKs.",
      reference: "Serverless Performance Optimization",
    });
  }

  return findings;
}
