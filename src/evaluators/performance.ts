import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzePerformance(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "PERF";
  let ruleNum = 1;

  // Detect N+1 query patterns
  const nPlusOneLines: number[] = [];
  lines.forEach((line, i) => {
    if (/for\s*\(|\.forEach\s*\(|\.map\s*\(/i.test(line)) {
      const loopBody = lines.slice(i + 1, Math.min(lines.length, i + 10)).join("\n");
      if (/\.find\s*\(|\.findOne\s*\(|\.query\s*\(|SELECT\s|await\s+.*\.get\s*\(/i.test(loopBody)) {
        nPlusOneLines.push(i + 1);
      }
    }
  });
  if (nPlusOneLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential N+1 query pattern",
      description: "Database queries inside loops cause N+1 performance problems, generating excessive database load that grows linearly with data size.",
      lineNumbers: nPlusOneLines,
      recommendation: "Batch queries outside the loop using WHERE IN clauses, JOINs, or DataLoader patterns. Fetch all needed data in a single query.",
      reference: "N+1 Query Problem",
    });
  }

  // Detect synchronous file I/O
  const syncIOLines: number[] = [];
  lines.forEach((line, i) => {
    if (/readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|readdirSync|statSync/i.test(line)) {
      syncIOLines.push(i + 1);
    }
  });
  if (syncIOLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Synchronous file I/O detected",
      description: "Synchronous file operations block the event loop (Node.js) or thread, degrading throughput under concurrent load.",
      lineNumbers: syncIOLines,
      recommendation: "Use async/await versions (readFile, writeFile) or streaming for large files. Sync I/O is only acceptable at startup.",
      reference: "Node.js Performance Best Practices",
    });
  }

  // Detect missing caching opportunities
  const repeatedFetchLines: number[] = [];
  const fetchCalls: { line: number; url: string }[] = [];
  lines.forEach((line, i) => {
    const urlMatch = line.match(/(?:fetch|get|request)\s*\(\s*["'`]([^"'`]+)["'`]/i);
    if (urlMatch) {
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
      description: "Multiple requests to the same URL within the same module suggest missing caching or request deduplication.",
      lineNumbers: repeatedFetchLines,
      recommendation: "Cache responses or deduplicate requests. Use memoization, request coalescing, or an in-memory/distributed cache.",
      reference: "Caching Strategies",
    });
  }

  // Detect unnecessary re-renders (React)
  const inlineHandlerLines: number[] = [];
  lines.forEach((line, i) => {
    if (/onClick\s*=\s*\{?\s*\(\s*\)\s*=>/i.test(line) || /onChange\s*=\s*\{?\s*\(\s*\w*\s*\)\s*=>/i.test(line)) {
      inlineHandlerLines.push(i + 1);
    }
  });
  if (inlineHandlerLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Inline arrow functions in JSX event handlers",
      description: "Inline arrow functions in JSX create new function instances on every render, potentially causing unnecessary child re-renders.",
      lineNumbers: inlineHandlerLines.slice(0, 5),
      recommendation: "Use useCallback for event handlers or define handlers outside the render function.",
      reference: "React Performance Optimization",
    });
  }

  // Detect unbounded array/string operations
  const unboundedOpLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.sort\s*\(\s*\)/.test(line) || /\.reverse\s*\(\s*\)/.test(line) || /JSON\.parse\s*\(.*JSON\.stringify/i.test(line)) {
      unboundedOpLines.push(i + 1);
    }
  });
  if (unboundedOpLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Potentially expensive array/object operations",
      description: "Operations like sort(), reverse(), or deep clone via JSON.parse(JSON.stringify()) can be expensive on large datasets.",
      lineNumbers: unboundedOpLines,
      recommendation: "Consider the data size. Use structuredClone() instead of JSON round-trip. Sort on the database side when possible.",
      reference: "JavaScript Performance Patterns",
    });
  }

  // Detect regex in hot paths
  const regexInLoopLines: number[] = [];
  lines.forEach((line, i) => {
    if (/for\s*\(|\.forEach|\.map|\.filter|while\s*\(/.test(line)) {
      const body = lines.slice(i + 1, Math.min(lines.length, i + 8)).join("\n");
      if (/new\s+RegExp\s*\(/.test(body)) {
        regexInLoopLines.push(i + 1);
      }
    }
  });
  if (regexInLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "RegExp compiled inside loop",
      description: "Creating RegExp objects inside loops recompiles the pattern on every iteration, wasting CPU.",
      lineNumbers: regexInLoopLines,
      recommendation: "Move RegExp compilation outside the loop. Declare regex patterns as constants at module or function scope.",
      reference: "Regex Performance Best Practices",
    });
  }

  // Detect memory leak patterns (event listeners not cleaned up)
  const addListenerLines: number[] = [];
  lines.forEach((line, i) => {
    if (/addEventListener\s*\(|\.on\s*\(\s*["']/i.test(line)) {
      addListenerLines.push(i + 1);
    }
  });
  const hasRemoveListener = /removeEventListener|\.off\s*\(|\.removeListener|\.removeAllListeners|AbortController|cleanup|dispose/i.test(code);
  if (addListenerLines.length > 2 && !hasRemoveListener) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Event listeners without cleanup",
      description: "Multiple event listeners are registered without corresponding removal, which can cause memory leaks especially in SPAs or long-running processes.",
      lineNumbers: addListenerLines.slice(0, 5),
      recommendation: "Always remove event listeners on cleanup (componentWillUnmount, useEffect cleanup, ngOnDestroy). Use AbortController for fetch listeners.",
      reference: "Memory Leak Prevention",
    });
  }

  // Detect missing lazy loading / code splitting
  const heavyImportLines: number[] = [];
  lines.forEach((line, i) => {
    if (/^import\s+.*from\s+["'](?:lodash|moment|rxjs|d3|three|chart\.js|plotly|tensorflow|pandas|numpy)["']/i.test(line.trim())) {
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
      recommendation: "Use dynamic imports (import()) for heavy libraries. Import specific sub-modules (lodash/get instead of lodash). Consider tree-shakeable alternatives.",
      reference: "Code Splitting / Bundle Optimization",
    });
  }

  // Detect missing debounce/throttle on high-frequency events
  const highFreqEventLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:onScroll|onResize|onMouseMove|onInput|onKeyUp|onKeyDown|scroll|resize|mousemove|input|keyup)\s*[=:]/i.test(line)) {
      highFreqEventLines.push(i + 1);
    }
  });
  const hasDebounce = /debounce|throttle|requestAnimationFrame|rAF/i.test(code);
  if (highFreqEventLines.length > 0 && !hasDebounce) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "High-frequency event handler without debounce/throttle",
      description: "Event handlers for scroll, resize, mousemove, or input fire many times per second and can cause janky UI or excessive processing.",
      lineNumbers: highFreqEventLines,
      recommendation: "Wrap high-frequency event handlers with debounce(), throttle(), or requestAnimationFrame to limit execution rate.",
      reference: "Event Handler Performance",
    });
  }

  // Detect large DOM manipulation in loops
  const domInLoopLines: number[] = [];
  lines.forEach((line, i) => {
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
      description: "Modifying the DOM inside a loop causes repeated layout recalculations (reflows), severely degrading rendering performance.",
      lineNumbers: domInLoopLines,
      recommendation: "Build DOM content in a DocumentFragment or string, then insert once. Use virtual DOM frameworks or batch updates.",
      reference: "DOM Performance / Layout Thrashing",
    });
  }

  // Detect unoptimized images
  const imgLines: number[] = [];
  lines.forEach((line, i) => {
    if (/<img\s/i.test(line) && !/loading\s*=\s*["']lazy["']/i.test(line)) {
      imgLines.push(i + 1);
    }
  });
  if (imgLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Images without lazy loading",
      description: "Multiple <img> tags without loading='lazy' cause all images to load eagerly, increasing initial page load time and bandwidth.",
      lineNumbers: imgLines.slice(0, 5),
      recommendation: "Add loading='lazy' to images below the fold. Use modern formats (WebP, AVIF) and responsive srcset attributes.",
      reference: "Image Optimization / Core Web Vitals",
    });
  }

  // Detect blocking script tags
  const blockingScriptLines: number[] = [];
  lines.forEach((line, i) => {
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
      recommendation: "Add 'async' or 'defer' attribute to script tags, or use type='module' which is deferred by default.",
      reference: "Script Loading Performance",
    });
  }

  // Detect inefficient string building in loops
  const stringConcatLoopLines: number[] = [];
  lines.forEach((line, i) => {
    if (/for\s*\(|\.forEach|while\s*\(/.test(line)) {
      const body = lines.slice(i + 1, Math.min(lines.length, i + 8)).join("\n");
      if (/\+\s*=\s*["'`]|\.concat\s*\(/i.test(body)) {
        stringConcatLoopLines.push(i + 1);
      }
    }
  });
  if (stringConcatLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "String concatenation in loop",
      description: "Building strings via concatenation in loops creates many intermediate string objects, especially costly in Java, C#, and Python.",
      lineNumbers: stringConcatLoopLines,
      recommendation: "Use StringBuilder (Java/C#), join() (Python/JS), or template literals with array.join() to build strings efficiently.",
      reference: "String Performance Optimization",
    });
  }

  // Detect missing pagination for large data
  const bulkFetchLines: number[] = [];
  lines.forEach((line, i) => {
    if (/\.find\s*\(\s*\{\s*\}\s*\)|\.find\s*\(\s*\)|findAll\s*\(\s*\)|SELECT\s+\*\s+FROM/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 3)).join("\n");
      if (!/limit|skip|offset|page|cursor|take|first|top\s+\d/i.test(context)) {
        bulkFetchLines.push(i + 1);
      }
    }
  });
  if (bulkFetchLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Unbounded data fetch without pagination",
      description: "Fetching all records without limit/pagination can exhaust memory and crash the application as data grows.",
      lineNumbers: bulkFetchLines,
      recommendation: "Always use pagination (limit/offset or cursor-based) when querying collections. Set reasonable default page sizes.",
      reference: "Database Query Performance / API Pagination",
    });
  }

  // Detect computation in render path (React)
  const computeInRenderLines: number[] = [];
  lines.forEach((line, i) => {
    if (/return\s*\(\s*</.test(line)) {
      const preReturn = lines.slice(Math.max(0, i - 15), i).join("\n");
      if (/\.filter\s*\(.*\)\.map\s*\(|\.sort\s*\(.*\)\.map\s*\(|\.reduce\s*\(/i.test(preReturn) && !/useMemo|useCallback|memo/i.test(preReturn)) {
        computeInRenderLines.push(i + 1);
      }
    }
  });
  if (computeInRenderLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Expensive computation in render without memoization",
      description: "Chained filter/sort/map operations run on every render without useMemo, causing unnecessary re-computation.",
      lineNumbers: computeInRenderLines,
      recommendation: "Wrap expensive derived data computations with useMemo() to only recompute when dependencies change.",
      reference: "React useMemo / Performance",
    });
  }

  return findings;
}
