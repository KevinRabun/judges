import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeDatabase(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "DB";

  // SQL injection via string concatenation
  const sqlInjectionPattern = /(?:execute|query|raw|prepare)\s*\(\s*(?:`[^`]*\$\{|['"][^'"]*['"]\s*\+|['"][^'"]*['"]\s*\.\s*concat)/gi;
  const sqlInjectionLines = getLineNumbers(code, sqlInjectionPattern);
  if (sqlInjectionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "SQL injection via string concatenation",
      description: `Found ${sqlInjectionLines.length} instance(s) of SQL queries built with string concatenation or template literals containing user input. This is the most common and dangerous database vulnerability.`,
      lineNumbers: sqlInjectionLines,
      recommendation: "Use parameterized queries (placeholders) or prepared statements. ORMs handle this automatically. Never concatenate user input into SQL strings.",
      reference: "OWASP SQL Injection Prevention Cheat Sheet / CWE-89",
    });
  }

  // SELECT * usage
  const selectStarPattern = /SELECT\s+\*/gi;
  const selectStarLines = getLineNumbers(code, selectStarPattern);
  if (selectStarLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "SELECT * retrieves unnecessary columns",
      description: `Found ${selectStarLines.length} SELECT * query/queries. Selecting all columns transfers unnecessary data, breaks when schema changes, and prevents index-only scans.`,
      lineNumbers: selectStarLines,
      recommendation: "Select only the columns you need: SELECT id, name, email FROM users. This reduces network transfer, memory usage, and improves query plan optimization.",
      reference: "SQL Performance Best Practices",
    });
  }

  // N+1 query pattern (query in a loop)
  const lines = code.split("\n");
  const n1Lines: number[] = [];
  let inLoop = false;
  let loopDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(?:for|while|forEach|\.map|\.each)\b/.test(line)) {
      inLoop = true;
      loopDepth++;
    }
    if (inLoop && /(?:await\s+)?(?:db\.|query|find|findOne|findMany|execute|select|fetch)\s*\(/.test(line)) {
      n1Lines.push(i + 1);
    }
    if (inLoop) {
      const opens = (line.match(/\{/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      loopDepth += opens - closes;
      if (loopDepth <= 0) {
        inLoop = false;
        loopDepth = 0;
      }
    }
  }
  if (n1Lines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "N+1 query pattern detected",
      description: `Found ${n1Lines.length} database query/queries inside loops. This creates N+1 queries: 1 for the list + N for each item. Performance degrades linearly with data volume.`,
      lineNumbers: n1Lines,
      recommendation: "Use batch queries (WHERE id IN (...)), JOINs, or ORM eager loading (include/populate) to fetch related data in a single query.",
      reference: "N+1 Query Problem / ORM Performance Patterns",
    });
  }

  // No connection pooling
  const hasDbConnection = /createConnection|new\s+Client|new\s+Pool|mongoose\.connect|createPool|DataSource|DriverManager|SqlConnection/gi.test(code);
  const hasPooling = /pool|Pool|connectionPool|poolSize|max_connections|maxPoolSize|connectionLimit/gi.test(code);
  if (hasDbConnection && !hasPooling) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Database connection without pooling",
      description: "Database connection created without visible connection pooling. Creating a new connection per request is expensive and unsustainable under load.",
      recommendation: "Use connection pooling (e.g., pg.Pool, mysql2.createPool, mongoose connection pooling). Configure pool size based on expected concurrent connections.",
      reference: "Database Connection Pooling Best Practices",
    });
  }

  // Raw SQL queries (no ORM/query builder)
  const rawSqlPattern = /(?:execute|query)\s*\(\s*["'`]\s*(?:SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/gi;
  const rawSqlLines = getLineNumbers(code, rawSqlPattern);
  if (rawSqlLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Extensive raw SQL without query builder or ORM",
      description: `Found ${rawSqlLines.length} raw SQL statements. Extensive raw SQL increases injection risk, reduces portability, and lacks type safety.`,
      lineNumbers: rawSqlLines.slice(0, 5),
      recommendation: "Consider using a query builder (Knex, Prisma, Drizzle, SQLAlchemy) or ORM for type safety, parameterization, and database portability.",
      reference: "ORM vs Raw SQL Best Practices",
    });
  }

  // No transaction handling
  const hasMutations = /INSERT|UPDATE|DELETE|db\.(?:create|update|delete|save|remove)/gi.test(code);
  const hasTransactions = /transaction|BEGIN|COMMIT|ROLLBACK|startTransaction|withTransaction/gi.test(code);
  if (hasMutations && !hasTransactions && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Data mutations without transaction handling",
      description: "Data is modified (INSERT/UPDATE/DELETE) without transaction wrappers. If an error occurs mid-operation, data could be left in an inconsistent state.",
      recommendation: "Wrap multi-step data mutations in transactions. Use BEGIN/COMMIT/ROLLBACK or ORM transaction APIs to ensure atomicity.",
      reference: "ACID Properties / Database Transaction Best Practices",
    });
  }

  // Hardcoded connection strings
  const connStringPattern = /(?:postgres|mysql|mongodb|redis|mssql):\/\/[^"'`\s]{10,}/gi;
  const connStringLines = getLineNumbers(code, connStringPattern);
  if (connStringLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Hardcoded database connection string",
      description: "Database connection string is hardcoded in source code, exposing credentials and making it impossible to use different databases per environment.",
      lineNumbers: connStringLines,
      recommendation: "Use environment variables for connection strings. Store credentials in a secrets manager. Use different connection strings per environment.",
      reference: "12-Factor App: Config / OWASP Secrets Management",
    });
  }

  return findings;
}
