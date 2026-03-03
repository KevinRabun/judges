import type { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily, isCommentLine, testCode } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeDatabase(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "DB";
  const _lang = getLangFamily(language);

  // SQL injection via string concatenation (multi-language)
  const rawSqlInjectionLines = getLangLineNumbers(code, language, LP.SQL_INJECTION);
  // Filter out lines where SQL patterns appear inside regex literals or test/match calls
  // (code analysis tools referencing SQL patterns, not real SQL queries)
  const sqlInjectionLines = rawSqlInjectionLines.filter((ln) => {
    const line = code.split("\n")[ln - 1] || "";
    if (/\/[^/\n]+\/[gimsuy]*/.test(line) && /\.test\s*\(|\.match\s*\(|new\s+RegExp/i.test(line)) return false;
    return true;
  });
  if (sqlInjectionLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "SQL injection via string concatenation",
      description: `Found ${sqlInjectionLines.length} instance(s) of SQL queries built with string concatenation or interpolation containing user input. This is the most common and dangerous database vulnerability.`,
      lineNumbers: sqlInjectionLines,
      recommendation:
        "Use parameterized queries (placeholders) or prepared statements. ORMs handle this automatically. Never concatenate user input into SQL strings.",
      reference: "OWASP SQL Injection Prevention Cheat Sheet / CWE-89",
      suggestedFix:
        "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId]) (JS), cursor.execute('...WHERE id = %s', (uid,)) (Python), db.Query('...WHERE id = $1', id) (Go).",
      confidence: 0.95,
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
      recommendation:
        "Select only the columns you need: SELECT id, name, email FROM users. This reduces network transfer, memory usage, and improves query plan optimization.",
      reference: "SQL Performance Best Practices",
      suggestedFix:
        "Replace SELECT * with explicit columns: SELECT id, name, email FROM users WHERE active = true; — reduces data transfer and enables index-only scans.",
      confidence: 0.9,
    });
  }

  // N+1 query pattern (query in a loop) (multi-language)
  const lines = code.split("\n");
  const n1Lines: number[] = [];
  const dbQueryLines = new Set(getLangLineNumbers(code, language, LP.DB_QUERY));
  const loopLines = new Set(getLangLineNumbers(code, language, LP.FOR_LOOP));
  let inLoop = false;
  let loopDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (loopLines.has(i + 1) || /\b(?:for|while|forEach|\.map|\.each)\b/.test(line)) {
      inLoop = true;
      loopDepth++;
    }
    if (
      inLoop &&
      (dbQueryLines.has(i + 1) ||
        /(?:await\s+)?(?:db\.|query|find|findOne|findMany|execute|select|fetch)\s*\(/.test(line))
    ) {
      n1Lines.push(i + 1);
    }
    if (inLoop) {
      const opens = (line.match(/\{/g) || []).length + (line.match(/:\s*$/g) || []).length;
      const closes = (line.match(/\}/g) || []).length;
      loopDepth += opens - closes;
      if (loopDepth <= 0) {
        inLoop = false;
        loopDepth = 0;
      }
    }
  }
  // Gate N+1 finding on actual database context — browser-side JS using
  // fetch(), Array.find(), or DOM .select() inside loops is not N+1 DB access.
  const hasDatabaseContext =
    sqlInjectionLines.length > 0 ||
    selectStarLines.length > 0 ||
    /createConnection|new\s+Client|new\s+Pool|mongoose\.connect|createPool|DataSource|DriverManager|SqlConnection/i.test(
      code,
    ) ||
    /(?:require|import).*(?:mysql|pg|postgres|mongodb|mongoose|prisma|knex|sequelize|typeorm|drizzle|redis|sqlite|better-sqlite|database)\b/i.test(
      code,
    ) ||
    testCode(code, /\b(?:SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE)\b/i);
  if (n1Lines.length > 0 && hasDatabaseContext) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "N+1 query pattern detected",
      description: `Found ${n1Lines.length} database query/queries inside loops. This creates N+1 queries: 1 for the list + N for each item. Performance degrades linearly with data volume.`,
      lineNumbers: n1Lines,
      recommendation:
        "Use batch queries (WHERE id IN (...)), JOINs, or ORM eager loading (include/populate) to fetch related data in a single query.",
      reference: "N+1 Query Problem / ORM Performance Patterns",
      suggestedFix:
        "Batch queries: const items = await db.query('SELECT * FROM items WHERE parent_id = ANY($1)', [parentIds]); instead of querying in a loop.",
      confidence: 0.75,
    });
  }

  // No connection pooling
  const hasDbConnection =
    /createConnection|new\s+Client|new\s+Pool|mongoose\.connect|createPool|DataSource|DriverManager|SqlConnection/gi.test(
      code,
    );
  const hasPooling = testCode(code, /pool|Pool|connectionPool|poolSize|max_connections|maxPoolSize|connectionLimit/gi);
  if (hasDbConnection && !hasPooling) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Database connection without pooling",
      description:
        "Database connection created without visible connection pooling. Creating a new connection per request is expensive and unsustainable under load.",
      recommendation:
        "Use connection pooling (e.g., pg.Pool, mysql2.createPool, mongoose connection pooling). Configure pool size based on expected concurrent connections.",
      reference: "Database Connection Pooling Best Practices",
      suggestedFix:
        "Use connection pool: const pool = new Pool({ max: 20, idleTimeoutMillis: 30000 }); const client = await pool.connect(); try { ... } finally { client.release(); }",
      confidence: 0.7,
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
      recommendation:
        "Consider using a query builder (Knex, Prisma, Drizzle, SQLAlchemy) or ORM for type safety, parameterization, and database portability.",
      reference: "ORM vs Raw SQL Best Practices",
      suggestedFix:
        "Use a query builder: const users = await knex('users').select('id', 'name').where({ active: true }); — provides parameterization and type safety.",
      confidence: 0.8,
    });
  }

  // No transaction handling
  // Require concrete DB mutation evidence: SQL DML keywords in query context or ORM method calls
  const hasMutations =
    /(?:(?:query|execute|run|raw)\s*\(\s*["'`](?:INSERT|UPDATE|DELETE))|(?:\.(?:save|create|update|delete|remove|destroy|bulkCreate|insertMany|updateMany|deleteMany|insertOne|updateOne|deleteOne)\s*\()|(?:INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b)|db\.(?:create|update|delete|save|remove)\s*\(/gi.test(
      code,
    );
  const hasTransactions = testCode(code, /transaction|BEGIN|COMMIT|ROLLBACK|startTransaction|withTransaction/gi);
  if (hasMutations && !hasTransactions && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Data mutations without transaction handling",
      description:
        "Data is modified (INSERT/UPDATE/DELETE) without transaction wrappers. If an error occurs mid-operation, data could be left in an inconsistent state.",
      recommendation:
        "Wrap multi-step data mutations in transactions. Use BEGIN/COMMIT/ROLLBACK or ORM transaction APIs to ensure atomicity.",
      reference: "ACID Properties / Database Transaction Best Practices",
      suggestedFix:
        "Wrap mutations in transaction: await db.transaction(async (trx) => { await trx('orders').insert(order); await trx('inventory').decrement('qty', 1); });",
      confidence: 0.7,
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
      description:
        "Database connection string is hardcoded in source code, exposing credentials and making it impossible to use different databases per environment.",
      lineNumbers: connStringLines,
      recommendation:
        "Use environment variables for connection strings. Store credentials in a secrets manager. Use different connection strings per environment.",
      reference: "12-Factor App: Config / OWASP Secrets Management",
      suggestedFix:
        "Use env vars: const connectionString = process.env.DATABASE_URL; never hardcode credentials in source code.",
      confidence: 0.9,
    });
  }

  // DROP TABLE / TRUNCATE without safeguards
  const destructiveDbPattern = /(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DROP\s+DATABASE|DROP\s+SCHEMA)/gi;
  const destructiveDbLines = getLineNumbers(code, destructiveDbPattern);
  if (destructiveDbLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Destructive DDL statements in application code",
      description: `Found ${destructiveDbLines.length} DROP/TRUNCATE statement(s). These permanently delete data or schema. If executed accidentally (e.g., via injection), data loss is irreversible.`,
      lineNumbers: destructiveDbLines,
      recommendation:
        "Never run destructive DDL from application code. Use migration tools (Prisma, Flyway, Alembic) with review and rollback support. Require elevated permissions for DDL.",
      reference: "Database Migration Best Practices / Least Privilege",
      suggestedFix:
        "Move DDL to migration files: npx prisma migrate dev --name drop_legacy_table; never embed DROP TABLE in application code.",
      confidence: 0.95,
    });
  }

  // No migration tooling
  const hasMigrations =
    /migration|migrate|knex\.schema|Schema\.create|CreateTable|createTable|sequelize\.define|prisma\s+migrate|alembic|flyway|liquibase|db-migrate|umzug/gi.test(
      code,
    );
  const hasSchemaChanges = testCode(code, /CREATE\s+TABLE|ALTER\s+TABLE|ADD\s+COLUMN|DROP\s+COLUMN/gi);
  if (hasSchemaChanges && !hasMigrations) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Schema changes without migration tooling",
      description:
        "DDL statements (CREATE TABLE, ALTER TABLE) found without migration tooling. Manual schema changes are unreproducible and error-prone across environments.",
      recommendation:
        "Use a database migration tool (Prisma, Knex, Flyway, Alembic) to version schema changes. Migrations should be idempotent and reversible.",
      reference: "Database Migration Best Practices / Evolutionary Database Design",
      suggestedFix:
        "Use migration tool: npx prisma migrate dev --name add_users_table; or knex migrate:make create_users — version-controlled, reversible schema changes.",
      confidence: 0.7,
    });
  }

  // Missing database indexes heuristic
  const hasWhereClause = testCode(code, /WHERE\s+\w+\s*(?:=|IN\s*\(|LIKE|>|<|BETWEEN)/gi);
  const hasIndexHint = testCode(code, /CREATE\s+INDEX|ADD\s+INDEX|ensureIndex|createIndex|\.index\s*\(/gi);
  if (hasWhereClause && !hasIndexHint && rawSqlLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Queries with WHERE clauses but no index definitions",
      description:
        "SQL queries filter on columns but no index creation is visible. Without indexes, queries perform full table scans which degrade exponentially with data volume.",
      recommendation:
        "Create indexes on columns used in WHERE, JOIN, and ORDER BY clauses. Monitor slow query logs. Use EXPLAIN to verify query plans.",
      reference: "SQL Indexing Best Practices / Use The Index, Luke!",
      suggestedFix:
        "Add indexes: CREATE INDEX idx_users_email ON users(email); CREATE INDEX idx_orders_user_date ON orders(user_id, created_at); use EXPLAIN to verify.",
      confidence: 0.7,
    });
  }

  // Database credentials in connection string
  const credInConnPattern = /(?:postgres|mysql|mongodb|mssql):\/\/\w+:\w+@/gi;
  const credInConnLines = getLineNumbers(code, credInConnPattern);
  if (credInConnLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "high",
      title: "Database credentials embedded in connection string",
      description:
        "Connection string contains inline username and password. These credentials are visible in source code, logs, and process listings.",
      lineNumbers: credInConnLines,
      recommendation:
        "Use separate credential parameters or environment variables. Consider IAM/managed identity for passwordless database connections in cloud environments.",
      reference: "OWASP: Credential Management / Azure Managed Identity",
      suggestedFix:
        "Use env vars: const client = new Client({ host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASSWORD });",
      confidence: 0.9,
    });
  }

  return findings;
}
