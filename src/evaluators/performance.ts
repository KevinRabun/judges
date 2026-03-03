import type { Finding } from "../types.js";
import { getLangLineNumbers, getLangFamily, isCommentLine, isStringLiteralLine } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzePerformance(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "PERF";
  let ruleNum = 1;
  const lang = getLangFamily(language);

  // Detect N+1 query patterns (multi-language)
  const nPlusOneLines: number[] = [];
  const loopLines = getLangLineNumbers(code, language, LP.FOR_LOOP);
  for (const loopLine of loopLines) {
    const idx = loopLine - 1;
    const loopBody = lines.slice(idx + 1, Math.min(lines.length, idx + 10)).join("\n");
    if (
      /\b(?:db|database|repo|repository|model|orm|prisma|sequelize|knex|mongoose|sql)\b\s*(?:\.|->)\s*(?:find|findOne|findMany|query|execute|executeQuery|select)\s*\(|\bcursor\.(?:execute|executemany)\s*\(|\bdb\.Query\s*\(/i.test(
        loopBody,
      )
    ) {
      nPlusOneLines.push(loopLine);
    }
  }
  if (nPlusOneLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential N+1 query pattern",
      description:
        "Database queries inside loops cause N+1 performance problems, generating excessive database load that grows linearly with data size.",
      lineNumbers: nPlusOneLines,
      recommendation:
        "Batch queries outside the loop using WHERE IN clauses, JOINs, or DataLoader patterns. Fetch all needed data in a single query.",
      reference: "N+1 Query Problem",
      suggestedFix:
        "Batch queries outside the loop: const items = await db.findMany({ where: { id: { in: ids } } }); then iterate over the result.",
      confidence: 0.85,
    });
  }

  // Detect synchronous file I/O (multi-language)
  const syncIOLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    // JS/TS sync I/O, Python blocking I/O, Rust std::fs blocking, C# synchronous I/O, Java blocking I/O, Go blocking I/O
    if (
      /readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|readdirSync|statSync/i.test(line) ||
      (lang === "python" && /open\s*\([^)]*\)(?!.*async)|time\.sleep\s*\(/i.test(line)) ||
      (lang === "rust" && /std::fs::(?:read|write|copy|remove)|std::thread::sleep/i.test(line)) ||
      (lang === "csharp" && /File\.(?:ReadAll|WriteAll|Copy|Move|Exists)(?!Async)|Thread\.Sleep/i.test(line)) ||
      (lang === "java" && /FileInputStream|FileOutputStream|BufferedReader|Thread\.sleep/i.test(line)) ||
      (lang === "go" && /ioutil\.ReadFile|os\.ReadFile|time\.Sleep/i.test(line))
    ) {
      syncIOLines.push(i + 1);
    }
  });
  if (syncIOLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Synchronous / blocking I/O detected",
      description:
        "Synchronous file or blocking operations can block the event loop (Node.js), thread, or async runtime, degrading throughput under concurrent load.",
      lineNumbers: syncIOLines,
      recommendation:
        "Use async/await versions, non-blocking APIs, or spawn blocking work on a separate thread/runtime. Sync I/O is only acceptable at startup.",
      reference: "Performance Best Practices",
      suggestedFix:
        "Use async variants: await fs.promises.readFile() instead of fs.readFileSync(), or asyncio.open() in Python.",
      confidence: 0.9,
    });
  }

  // Detect missing caching opportunities
  const repeatedFetchLines: number[] = [];
  const fetchCalls: { line: number; url: string }[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    const urlMatch = line.match(/(?:fetch|get|request)\s*\(\s*["'`]([^"'`]+)["'`]/i);
    if (urlMatch) {
      // Filter out non-HTTP get() calls — dict.get("key"), config.get("name"),
      // os.environ.get("VAR"), etc. are NOT network requests.  Only count get()
      // when it looks like an HTTP client call (requests.get, http.get, etc.) or
      // when the captured argument is an actual URL (http:// / https://).
      if (
        /\bget\s*\(/i.test(line) &&
        !/^\s*(?:fetch|requests?\.get|axios\.get|http[s]?\.get|client\.get|session\.get|api\.get|\$\.get)\s*\(/i.test(
          line.trim(),
        ) &&
        !/^https?:\/\//i.test(urlMatch[1])
      ) {
        return;
      }
      const existing = fetchCalls.find((f) => f.url === urlMatch[1]);
      if (existing) {
        repeatedFetchLines.push(i + 1);
      } else {
        fetchCalls.push({ line: i + 1, url: urlMatch[1] });
      }
    }
  });
  if (repeatedFetchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Duplicate fetch calls to same URL",
      description:
        "Multiple requests to the same URL within the same module suggest missing caching or request deduplication.",
      lineNumbers: repeatedFetchLines,
      recommendation:
        "Cache responses or deduplicate requests. Use memoization, request coalescing, or an in-memory/distributed cache.",
      reference: "Caching Strategies",
      suggestedFix:
        "Cache or deduplicate: const cached = cache.get(url) ?? await fetch(url); cache.set(url, cached); or use a request deduplication layer.",
      confidence: 0.8,
    });
  }

  // Detect unnecessary re-renders (React)
  const inlineHandlerLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/onClick\s*=\s*\{?\s*\(\s*\)\s*=>/i.test(line) || /onChange\s*=\s*\{?\s*\(\s*\w*\s*\)\s*=>/i.test(line)) {
      inlineHandlerLines.push(i + 1);
    }
  });
  if (inlineHandlerLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Inline arrow functions in JSX event handlers",
      description:
        "Inline arrow functions in JSX create new function instances on every render, potentially causing unnecessary child re-renders.",
      lineNumbers: inlineHandlerLines.slice(0, 5),
      recommendation: "Use useCallback for event handlers or define handlers outside the render function.",
      reference: "React Performance Optimization",
      suggestedFix:
        "Extract handlers: const handleClick = useCallback(() => { ... }, [deps]); then use onClick={handleClick}.",
      confidence: 0.8,
    });
  }

  // Detect unbounded array/string operations
  const unboundedOpLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (
      /\.sort\s*\(\s*\)/.test(line) ||
      /\.reverse\s*\(\s*\)/.test(line) ||
      /JSON\.parse\s*\(.*JSON\.stringify/i.test(line)
    ) {
      unboundedOpLines.push(i + 1);
    }
  });
  if (unboundedOpLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potentially expensive array/object operations",
      description:
        "Operations like sort(), reverse(), or deep clone via JSON.parse(JSON.stringify()) can be expensive on large datasets.",
      lineNumbers: unboundedOpLines,
      recommendation:
        "Consider the data size. Use structuredClone() instead of JSON round-trip. Sort on the database side when possible.",
      reference: "JavaScript Performance Patterns",
      suggestedFix:
        "Use structuredClone(obj) instead of JSON.parse(JSON.stringify(obj)). Sort on the database side or use a pre-sorted data structure.",
      confidence: 0.85,
    });
  }

  // Detect regex in hot paths (multi-language)
  const regexInLoopLines: number[] = [];
  for (const loopLine of loopLines) {
    const idx = loopLine - 1;
    const body = lines.slice(idx + 1, Math.min(lines.length, idx + 8)).join("\n");
    if (/new\s+RegExp\s*\(|re\.compile\s*\(|Regex::new|Pattern\.compile|regexp\.(?:Compile|MustCompile)/i.test(body)) {
      regexInLoopLines.push(loopLine);
    }
  }
  if (regexInLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "RegExp compiled inside loop",
      description: "Creating RegExp objects inside loops recompiles the pattern on every iteration, wasting CPU.",
      lineNumbers: regexInLoopLines,
      recommendation:
        "Move RegExp compilation outside the loop. Declare regex patterns as constants at module or function scope.",
      reference: "Regex Performance Best Practices",
      suggestedFix:
        "Hoist regex outside the loop: const pattern = new RegExp(expr); for (...) { pattern.test(item); } or use /literal/ syntax.",
      confidence: 0.9,
    });
  }

  // Detect memory leak patterns (event listeners not cleaned up)
  const addListenerLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/addEventListener\s*\(|\.on\s*\(\s*["']/i.test(line)) {
      addListenerLines.push(i + 1);
    }
  });
  const hasRemoveListener =
    /removeEventListener|\.off\s*\(|\.removeListener|\.removeAllListeners|AbortController|cleanup|dispose/i.test(code);
  if (addListenerLines.length > 2 && !hasRemoveListener) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Event listeners without cleanup",
      description:
        "Multiple event listeners are registered without corresponding removal, which can cause memory leaks especially in SPAs or long-running processes.",
      lineNumbers: addListenerLines.slice(0, 5),
      recommendation:
        "Always remove event listeners on cleanup (componentWillUnmount, useEffect cleanup, ngOnDestroy). Use AbortController for fetch listeners.",
      reference: "Memory Leak Prevention",
      suggestedFix:
        "Clean up in useEffect: useEffect(() => { el.addEventListener('click', handler); return () => el.removeEventListener('click', handler); }, []);",
      confidence: 0.8,
    });
  }

  // Detect missing lazy loading / code splitting
  const heavyImportLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (
      /^import\s+.*from\s+["'](?:lodash|moment|rxjs|d3|three|chart\.js|plotly|tensorflow|pandas|numpy)["']/i.test(
        line.trim(),
      )
    ) {
      heavyImportLines.push(i + 1);
    }
  });
  if (heavyImportLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Heavy library imported eagerly",
      description: "Large libraries are imported at the top level, which increases initial bundle size and load time.",
      lineNumbers: heavyImportLines,
      recommendation:
        "Use dynamic imports (import()) for heavy libraries. Import specific sub-modules (lodash/get instead of lodash). Consider tree-shakeable alternatives.",
      reference: "Code Splitting / Bundle Optimization",
      suggestedFix:
        "Use dynamic imports: const lodash = await import('lodash/get'); or import specific sub-modules: import get from 'lodash/get'.",
      confidence: 0.9,
    });
  }

  // Detect missing debounce/throttle on high-frequency events
  const highFreqEventLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (isStringLiteralLine(line)) return;
    if (
      /(?:onScroll|onResize|onMouseMove|onInput|onKeyUp|onKeyDown|scroll|resize|mousemove|input|keyup)\s*[=:]/i.test(
        line,
      )
    ) {
      highFreqEventLines.push(i + 1);
    }
  });
  const hasDebounce = /debounce|throttle|requestAnimationFrame|rAF/i.test(code);
  if (highFreqEventLines.length > 0 && !hasDebounce) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "High-frequency event handler without debounce/throttle",
      description:
        "Event handlers for scroll, resize, mousemove, or input fire many times per second and can cause janky UI or excessive processing.",
      lineNumbers: highFreqEventLines,
      recommendation:
        "Wrap high-frequency event handlers with debounce(), throttle(), or requestAnimationFrame to limit execution rate.",
      reference: "Event Handler Performance",
      suggestedFix:
        "Wrap with debounce: const handleScroll = useMemo(() => debounce(onScroll, 150), []); or use requestAnimationFrame.",
      confidence: 0.8,
    });
  }

  // Detect large DOM manipulation in loops
  const domInLoopLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/for\s*\(|\.forEach|\.map|while\s*\(/.test(line)) {
      const body = lines.slice(i + 1, Math.min(lines.length, i + 8)).join("\n");
      if (/\.appendChild|\.insertBefore|\.innerHTML|\.createElement|document\.write/i.test(body)) {
        domInLoopLines.push(i + 1);
      }
    }
  });
  if (domInLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "DOM manipulation inside loop",
      description:
        "Modifying the DOM inside a loop causes repeated layout recalculations (reflows), severely degrading rendering performance.",
      lineNumbers: domInLoopLines,
      recommendation:
        "Build DOM content in a DocumentFragment or string, then insert once. Use virtual DOM frameworks or batch updates.",
      reference: "DOM Performance / Layout Thrashing",
      suggestedFix:
        "Batch DOM updates: const fragment = document.createDocumentFragment(); items.forEach(item => fragment.appendChild(el)); container.appendChild(fragment);",
      confidence: 0.85,
    });
  }

  // Detect unoptimized images
  const imgLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<img\s/i.test(line) && !/loading\s*=\s*["']lazy["']/i.test(line)) {
      imgLines.push(i + 1);
    }
  });
  if (imgLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Images without lazy loading",
      description:
        "Multiple <img> tags without loading='lazy' cause all images to load eagerly, increasing initial page load time and bandwidth.",
      lineNumbers: imgLines.slice(0, 5),
      recommendation:
        "Add loading='lazy' to images below the fold. Use modern formats (WebP, AVIF) and responsive srcset attributes.",
      reference: "Image Optimization / Core Web Vitals",
      suggestedFix:
        'Add lazy loading: <img src="photo.jpg" loading="lazy" alt="..."> for images below the fold. Use srcset for responsive images.',
      confidence: 0.85,
    });
  }

  // Detect blocking script tags
  const blockingScriptLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<script\s/i.test(line) && !/async|defer|type\s*=\s*["']module["']/i.test(line) && /src\s*=/i.test(line)) {
      blockingScriptLines.push(i + 1);
    }
  });
  if (blockingScriptLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Render-blocking script tags",
      description: "Script tags without async or defer block HTML parsing and delay page rendering.",
      lineNumbers: blockingScriptLines,
      recommendation:
        "Add 'async' or 'defer' attribute to script tags, or use type='module' which is deferred by default.",
      reference: "Script Loading Performance",
      suggestedFix:
        'Add async or defer: <script src="app.js" defer></script> or use type="module" which defers by default.',
      confidence: 0.9,
    });
  }

  // Detect inefficient string building in loops (multi-language)
  const stringConcatLoopLines: number[] = [];
  for (const loopLine of loopLines) {
    const idx = loopLine - 1;
    const body = lines.slice(idx + 1, Math.min(lines.length, idx + 8)).join("\n");
    if (/\+\s*=\s*["'`]|\.concat\s*\(|\+=\s*str|\+=\s*\w+\.to_string|StringBuilder|String\.Concat/i.test(body)) {
      stringConcatLoopLines.push(loopLine);
    }
  }
  if (stringConcatLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "String concatenation in loop",
      description:
        "Building strings via concatenation in loops creates many intermediate string objects, especially costly in Java, C#, and Python.",
      lineNumbers: stringConcatLoopLines,
      recommendation:
        "Use StringBuilder (Java/C#), join() (Python/JS), or template literals with array.join() to build strings efficiently.",
      reference: "String Performance Optimization",
      suggestedFix:
        "Use array join: const parts = []; for (...) parts.push(str); return parts.join(''); or StringBuilder in Java/C#.",
      confidence: 0.85,
    });
  }

  // Detect missing pagination for large data (multi-language)
  const bulkFetchLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (isStringLiteralLine(line)) return;
    if (
      /\.find\s*\(\s*\{\s*\}\s*\)|\.find\s*\(\s*\)|findAll\s*\(\s*\)|SELECT\s+\*\s+FROM|\.all\s*\(\s*\)|objects\.all\s*\(|cursor\.execute\s*\(.*SELECT\s+\*/i.test(
        line,
      )
    ) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join("\n");
      if (
        !/limit|skip|offset|page|cursor|take|first|top\s+\d|LIMIT|paginate|Pageable|setMaxResults|setFirstResult/i.test(
          context,
        )
      ) {
        bulkFetchLines.push(i + 1);
      }
    }
  });
  if (bulkFetchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Unbounded data fetch without pagination",
      description:
        "Fetching all records without limit/pagination can exhaust memory and crash the application as data grows.",
      lineNumbers: bulkFetchLines,
      recommendation:
        "Always use pagination (limit/offset or cursor-based) when querying collections. Set reasonable default page sizes.",
      reference: "Database Query Performance / API Pagination",
      suggestedFix:
        "Add pagination: db.find({}).limit(50).skip(page * 50) or use cursor-based pagination for large datasets.",
      confidence: 0.85,
    });
  }

  // Detect computation in render path (React)
  const computeInRenderLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/return\s*\(\s*</.test(line)) {
      const preReturn = lines.slice(Math.max(0, i - 15), i).join("\n");
      if (
        /\.filter\s*\(.*\)\.map\s*\(|\.sort\s*\(.*\)\.map\s*\(|\.reduce\s*\(/i.test(preReturn) &&
        !/useMemo|useCallback|memo/i.test(preReturn)
      ) {
        computeInRenderLines.push(i + 1);
      }
    }
  });
  if (computeInRenderLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Expensive computation in render without memoization",
      description:
        "Chained filter/sort/map operations run on every render without useMemo, causing unnecessary re-computation.",
      lineNumbers: computeInRenderLines,
      recommendation:
        "Wrap expensive derived data computations with useMemo() to only recompute when dependencies change.",
      reference: "React useMemo / Performance",
      suggestedFix:
        "Memoize derived data: const filtered = useMemo(() => items.filter(...).sort(...), [items, sortKey]);",
      confidence: 0.8,
    });
  }

  // ── Nested Loop Complexity (O(n²) / O(n³)) ───────────────────────────────
  const nestedLoopLines: number[] = [];

  if (lang === "python") {
    // Python uses indentation for scoping — track nesting via indent level
    // rather than braces. Require `for`/`while` at line start to exclude
    // generator expressions / list comprehensions.
    const pyLoopStartRe = /^\s*(?:for|while)\s/;
    const indentStack: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (/^#|^"""|^'''/.test(trimmed) || trimmed === "") continue;
      if (pyLoopStartRe.test(lines[i])) {
        const indent = (lines[i].match(/^(\s*)/)?.[1] ?? "").length;
        while (indentStack.length > 0 && indentStack[indentStack.length - 1] >= indent) {
          indentStack.pop();
        }
        indentStack.push(indent);
        if (indentStack.length >= 2) {
          nestedLoopLines.push(i + 1);
        }
      }
    }
  } else {
    let nestingDepth = 0;
    const loopStartRe = /^\s*(?:for\s*\(|while\s*\(|do\s*\{|\.forEach\s*\(|\.map\s*\(|for\s+\w+\s+(?:in|of)\s)/;
    for (let i = 0; i < lines.length; i++) {
      if (loopStartRe.test(lines[i])) {
        nestingDepth++;
        if (nestingDepth >= 2) {
          nestedLoopLines.push(i + 1);
        }
      }
      // Track brace depth — simplified: each closing brace decreases depth if inside loop
      const opens = (lines[i].match(/\{/g) || []).length;
      const closes = (lines[i].match(/\}/g) || []).length;
      if (closes > opens && nestingDepth > 0) {
        nestingDepth = Math.max(0, nestingDepth - (closes - opens));
      }
    }
  }
  if (nestedLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Nested loops detected — O(n²) or worse complexity",
      description: `${nestedLoopLines.length} nested loop(s) detected. Nested loops scale quadratically or worse with input size and can cause severe performance degradation on large datasets.`,
      lineNumbers: nestedLoopLines.slice(0, 8),
      recommendation:
        "Replace nested loops with hash maps (O(n)) for lookups, pre-sorted data with binary search, or purpose-built data structures. Consider if the algorithm can be flattened.",
      reference: "Algorithm Complexity / Big-O Analysis",
      suggestedFix:
        "Replace nested loop with Map lookup: const map = new Map(items.map(x => [x.id, x])); for (const item of others) { const match = map.get(item.id); }",
      confidence: 0.75,
    });
  }

  // ── Unbounded Collection Growth (Memory Leak) ─────────────────────────────
  const unboundedGrowthLines: number[] = [];
  const globalArrayPush = /(?:const|let|var)\s+\w+\s*(?::\s*\w+(?:\[\]|<[^>]+>))?\s*=\s*\[\s*\]/;
  const moduleScope: number[] = [];
  // Track brace depth to distinguish module-level arrays from function-scoped locals
  let braceDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }
    // Only flag arrays at module/top-level scope (braceDepth 0) — local variables
    // inside functions are garbage-collected when the function returns
    if (braceDepth === 0 && globalArrayPush.test(line)) {
      moduleScope.push(i);
    }
  }
  for (const arrLine of moduleScope) {
    const arrName = lines[arrLine].match(/(?:const|let|var)\s+(\w+)/)?.[1];
    if (!arrName) continue;
    const pushRe = new RegExp(`\\b${arrName}\\.(?:push|unshift|splice)\\s*\\(`);
    const clearRe = new RegExp(
      `\\b${arrName}\\s*(?:=\\s*\\[|\\s*\\.length\\s*=\\s*0|\\s*\\.splice\\s*\\(\\s*0|\\s*\\.shift|\\s*\\.pop|\\s*\\.slice)`,
    );
    let hasPush = false;
    let hasClear = false;
    for (let i = arrLine + 1; i < Math.min(lines.length, arrLine + 50); i++) {
      if (pushRe.test(lines[i])) hasPush = true;
      if (clearRe.test(lines[i])) hasClear = true;
    }
    if (hasPush && !hasClear) {
      unboundedGrowthLines.push(arrLine + 1);
    }
  }
  if (unboundedGrowthLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Unbounded collection growth — potential memory leak",
      description: `${unboundedGrowthLines.length} array(s) grow via push/unshift without bounds checking, clearing, or eviction. In long-running processes, this causes memory exhaustion.`,
      lineNumbers: unboundedGrowthLines,
      recommendation:
        "Add a maximum size limit, use a circular buffer, implement LRU eviction, or periodically clear/trim the collection.",
      reference: "Memory Leak Prevention / CWE-401",
      suggestedFix:
        "Add bounds: if (cache.length > MAX_SIZE) cache.splice(0, cache.length - MAX_SIZE); or use an LRU cache library.",
      confidence: 0.7,
    });
  }

  // ── setInterval Without clearInterval ─────────────────────────────────────
  const setIntervalLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/setInterval\s*\(/i.test(line)) {
      setIntervalLines.push(i + 1);
    }
  });
  const hasClearInterval = /clearInterval/i.test(code);
  if (setIntervalLines.length > 0 && !hasClearInterval) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "setInterval without clearInterval — timer leak",
      description:
        "setInterval is called without a corresponding clearInterval, which creates a timer that runs indefinitely and prevents garbage collection of captured closures.",
      lineNumbers: setIntervalLines,
      recommendation:
        "Store the interval ID and call clearInterval in cleanup/teardown logic (e.g., useEffect cleanup, componentWillUnmount, or process exit handler).",
      reference: "Timer Management / Memory Leak Prevention",
      suggestedFix:
        "Store and clear: const id = setInterval(fn, delay); // in cleanup: clearInterval(id); or use useEffect: useEffect(() => { const id = setInterval(...); return () => clearInterval(id); }, []);",
      confidence: 0.85,
    });
  }

  // ── Recursive Function Without Depth Limit ────────────────────────────────
  const recursiveLines: number[] = [];
  const funcDefs: Array<{ name: string; line: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const funcMatch = lines[i].match(
      /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>))/,
    );
    if (funcMatch) {
      funcDefs.push({ name: funcMatch[1] || funcMatch[2], line: i });
    }
  }
  for (const fn of funcDefs) {
    // Find the actual end of this function's body by tracking brace depth
    // starting from the definition line. This avoids false positives for
    // nested functions whose calls from the outer scope would otherwise
    // fall within a naive 30-line window.
    let braceDepth = 0;
    let foundOpen = false;
    let bodyEnd = Math.min(lines.length, fn.line + 30); // fallback
    for (let j = fn.line; j < lines.length; j++) {
      const opens = (lines[j].match(/{/g) || []).length;
      const closes = (lines[j].match(/}/g) || []).length;
      braceDepth += opens - closes;
      if (opens > 0) foundOpen = true;
      if (foundOpen && braceDepth <= 0) {
        bodyEnd = j + 1; // exclusive end, right after closing brace
        break;
      }
    }
    const body = lines.slice(fn.line + 1, bodyEnd).join("\n");
    const selfCallRe = new RegExp(`\\b${fn.name}\\s*\\(`);
    if (selfCallRe.test(body)) {
      // Check for depth/limit guard
      const hasGuard = /depth|maxDepth|limit|level|MAX_|max_depth|stack.*length|RecursionError|StackOverflow/i.test(
        lines.slice(fn.line, Math.min(fn.line + 5, lines.length)).join("\n"),
      );
      if (!hasGuard) {
        recursiveLines.push(fn.line + 1);
      }
    }
  }
  if (recursiveLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Recursive function without depth limit",
      description: `${recursiveLines.length} recursive function(s) lack depth-limiting guards. Unbounded recursion can cause stack overflow on deep or cyclic data.`,
      lineNumbers: recursiveLines,
      recommendation:
        "Add a depth parameter with a maximum limit, or convert to an iterative approach using an explicit stack.",
      reference: "CWE-674: Uncontrolled Recursion",
      suggestedFix:
        "Add depth guard: function traverse(node, depth = 0) { if (depth > MAX_DEPTH) throw new Error('Max depth exceeded'); traverse(child, depth + 1); }",
      confidence: 0.75,
    });
  }

  // ── Global Mutable State Accumulation ─────────────────────────────────────
  const globalMutableLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Module-level let/var with mutable data structures
    if (
      /^(?:let|var)\s+\w+\s*(?::\s*(?:Map|Set|Record|any\[\]|Array))?\s*=\s*(?:new\s+(?:Map|Set|WeakMap)|{}|\[\])/i.test(
        lines[i].trim(),
      )
    ) {
      // Check it's at module scope (no indentation or minimal)
      const indent = lines[i].match(/^(\s*)/)?.[1]?.length || 0;
      if (indent <= 0) {
        globalMutableLines.push(i + 1);
      }
    }
  }
  if (globalMutableLines.length > 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Multiple global mutable data structures",
      description: `${globalMutableLines.length} module-level mutable data structures detected. Global mutable state grows unbounded in long-lived processes and causes hard-to-debug issues in concurrent or serverless environments.`,
      lineNumbers: globalMutableLines,
      recommendation:
        "Encapsulate state in classes with lifecycle management. Use WeakMap/WeakRef for cached references. Ensure cleanup in server restart/hot-reload scenarios.",
      reference: "Global State / Memory Management",
      suggestedFix:
        "Encapsulate: class Cache { private store = new Map(); clear() { this.store.clear(); } get size() { return this.store.size; } }",
      confidence: 0.7,
    });
  }

  // ── Expensive Operations in Promise.all Without Error Boundaries ──────────
  const promiseAllLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/Promise\.all\s*\(\s*\[/i.test(line) || /Promise\.all\s*\(/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
      if (!/Promise\.allSettled|\.catch|try\s*\{/i.test(context)) {
        promiseAllLines.push(i + 1);
      }
    }
  });
  if (promiseAllLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "medium",
      title: "Promise.all without error handling",
      description:
        "Promise.all rejects immediately on any single failure, potentially leaving other promises' results orphaned and causing resource leaks.",
      lineNumbers: promiseAllLines,
      recommendation:
        "Use Promise.allSettled() for independent operations, or wrap Promise.all in try/catch. Handle partial failures gracefully.",
      reference: "Promise Error Handling / Resource Cleanup",
      suggestedFix:
        "Use allSettled: const results = await Promise.allSettled(tasks); const successes = results.filter(r => r.status === 'fulfilled').map(r => r.value);",
      confidence: 0.8,
    });
  }

  return findings;
}
