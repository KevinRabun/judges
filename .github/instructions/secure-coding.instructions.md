---
applyTo: "src/**,tests/**"
---

# Secure Coding — Preventing CodeQL / Code Scanning Findings

Follow these rules when writing or modifying TypeScript code in this repository.
They address the categories of findings that GitHub Code Scanning (CodeQL) flags.

---

## 1. Regex Safety (js/polynomial-redos)

Avoid regular expressions that can exhibit catastrophic backtracking.

- **Never** use nested quantifiers like `(.+)*`, `(a+)+`, `(\s*)*`, or `(\S.*)$` with greedy/backtracking groups.
- **Prefer string methods** (`indexOf`, `startsWith`, `endsWith`, `split`, `substring`) over regex when the pattern is a fixed string or simple delimiter.
- When regex is necessary, use **possessive-style character classes**: `[^ \t\n]*` instead of `.*`, and `[^\n]*` instead of `.+`.
- `\s` in quantified positions is dangerous because it overlaps with `[ \t]` — prefer explicit `[ \t]` when you only need horizontal whitespace.
- If a pattern is anchored with `$` and can only match once, do **not** use the `/g` flag.
- For parsing structured comment directives (e.g., `// judges-ignore RULE-ID`), use `indexOf` + `substring` instead of a single complex regex.

**Bad:**
```typescript
const pattern = /(?:\/\/|#|\/\*)\s*judges-ignore\s+(.+)$/gi;
```

**Good:**
```typescript
const idx = line.indexOf("judges-ignore");
if (idx >= 0) {
  const before = line.substring(0, idx).trimEnd();
  if (before.endsWith("//") || before.endsWith("#") || before.endsWith("/*")) {
    const rest = line.substring(idx + "judges-ignore".length).trimStart();
    // ... parse rest with string methods ...
  }
}
```

---

## 2. No Sensitive Data in Logs (js/clear-text-logging)

Never log values sourced from `process.env` — CodeQL treats all environment variables as sensitive.

- Use `os.userInfo().username` instead of `process.env.USER` or `process.env.USERNAME` when you need the current user's name.
- If you must read an env var, assign it to a local variable and do not pass that variable to `console.log`, `console.error`, or any logging function.

**Bad:**
```typescript
const user = process.env.USER || "unknown";
console.log(`Action performed by ${user}`);
```

**Good:**
```typescript
import { userInfo } from "os";
const user = userInfo().username || "unknown";
console.log(`Action performed by ${user}`);
```

---

## 3. Complete Sanitization (js/incomplete-sanitization)

When escaping or replacing characters in strings:

- **Escape backslashes first**, before escaping any other characters (`"`, `|`, newlines).
- Use `replaceAll()` or a regex with `/g` flag — bare `replace()` with a string argument replaces only the first occurrence.

**Bad:**
```typescript
const safe = input.replace(/"/g, '\\"').replace(/\n/g, "\\n");
// Missing: backslash not escaped, so `\"` in input becomes `\\"` (broken)

name.replace("/", "%2F");  // only replaces FIRST slash
```

**Good:**
```typescript
const safe = input.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

name.replaceAll("/", "%2F");  // replaces ALL slashes
```

---

## 4. URL Validation (js/incomplete-url-substring-sanitization)

Never use `.includes("github.com")` or `.includes("http://...")` to validate URLs — a malicious URL like `evil-github.com` or `http://evil.com?q=github.com` would pass.

- Use `URL` constructor and check `.hostname` for exact match or suffix match.
- Or use a regex with domain boundary: `/(:?\/\/|@)github\.com[\/:]/.test(url)`.
- For protocol checks, use `url.startsWith("https://")` (starts-with is safe, includes is not).

**Bad:**
```typescript
if (resolved.includes("github.com")) { ... }
```

**Good:**
```typescript
if (/(?:\/\/|@)github\.com[\/:]/. test(resolved)) { ... }
```

---

## 5. Cryptographic Key Sizes (js/insufficient-key-size)

- RSA keys must be **at least 2048 bits**. Never use 1024.
- This applies even in test code — CodeQL does not distinguish test from production.

---

## 6. Case-Insensitive HTML Tag Matching (js/bad-tag-filter)

When checking for HTML tags like `<script>`, always use case-insensitive matching.

**Bad:** `/<script>/`  
**Good:** `/<script>/i`

---

## 7. Template Literal Escaping (js/useless-regexp-character-escape)

In template literals, `\$` is the same as `$` and the backslash is silently dropped. If you need a literal `$` followed by `{` in a template literal, use `${'$'}` or string concatenation.

---

## 8. GraphQL / Query Injection (js/incomplete-sanitization in queries)

When interpolating user-provided strings into GraphQL queries or any query language:

- Escape backslashes before other characters.
- Prefer parameterized queries or input variables over string interpolation when the API supports it.
