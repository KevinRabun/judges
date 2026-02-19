import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeConcurrency(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "CONC";
  let ruleNum = 1;

  // Detect unbounded Promise.all
  const promiseAllLines: number[] = [];
  lines.forEach((line, i) => {
    if (/Promise\.all\s*\(\s*\w+\.map/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 5)).join("\n");
      if (!/chunk|batch|limit|throttle|pLimit|p-limit|concurrency|pool/i.test(context)) {
        promiseAllLines.push(i + 1);
      }
    }
  });
  if (promiseAllLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Unbounded Promise.all with dynamic array",
      description: "Using Promise.all with a mapped array without concurrency limits can overwhelm resources (database connections, API rate limits, memory).",
      lineNumbers: promiseAllLines,
      recommendation: "Use a concurrency limiter (p-limit, p-map with concurrency option) or batch the operations. Consider Promise.allSettled for fault tolerance.",
      reference: "Node.js Concurrency Patterns",
    });
  }

  // Detect shared mutable state
  const globalMutableLines: number[] = [];
  const globalVarPattern = /^(?:let|var)\s+\w+\s*=\s*(?:\[|\{|0|""|\d)/i;
  lines.forEach((line, i) => {
    if (globalVarPattern.test(line.trim())) {
      // Check if used in async context
      const restOfFile = lines.slice(i + 1).join("\n");
      const varName = line.trim().match(/(?:let|var)\s+(\w+)/)?.[1];
      if (varName && /async\s|\.then\s*\(/i.test(restOfFile) && new RegExp(`\\b${varName}\\b`).test(restOfFile)) {
        globalMutableLines.push(i + 1);
      }
    }
  });
  if (globalMutableLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Shared mutable state in async context",
      description: "Module-level mutable variables accessed from async functions can cause race conditions and data corruption.",
      lineNumbers: globalMutableLines,
      recommendation: "Use request-scoped/context-scoped state, atomic operations, or proper synchronization mechanisms instead of shared mutable variables.",
      reference: "Concurrency: Shared State Hazards",
    });
  }

  // Detect missing await
  const missingAwaitLines: number[] = [];
  lines.forEach((line, i) => {
    // Detect promise-returning calls without await in async context
    if (/^\s*\w+\.(save|update|delete|insert|remove|send|post|put|fetch)\s*\(/i.test(line) && !/await|return|\.then|\.catch/i.test(line)) {
      // Check if we're in an async function
      const prevCode = lines.slice(Math.max(0, i - 20), i).join("\n");
      if (/async\s+(?:function|\(|=>)/i.test(prevCode)) {
        missingAwaitLines.push(i + 1);
      }
    }
  });
  if (missingAwaitLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potentially missing await on async operation",
      description: "Async operations without await fire-and-forget, meaning errors are silently lost and operations may not complete before the response is sent.",
      lineNumbers: missingAwaitLines,
      recommendation: "Add await to async operations, or explicitly handle the returned promise with .catch(). Use ESLint's no-floating-promises rule.",
      reference: "Async/Await Error Handling",
    });
  }

  // Detect async operations in loops without understanding of ordering
  const awaitInLoopLines: number[] = [];
  lines.forEach((line, i) => {
    if (/for\s*\(|for\s+await|while\s*\(/.test(line)) {
      const loopBody = lines.slice(i + 1, Math.min(lines.length, i + 15)).join("\n");
      const awaitCount = (loopBody.match(/await\s/g) || []).length;
      if (awaitCount > 0) {
        awaitInLoopLines.push(i + 1);
      }
    }
  });
  if (awaitInLoopLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Sequential await in loop",
      description: "Using await inside a loop processes items sequentially. If operations are independent, this unnecessarily serializes them.",
      lineNumbers: awaitInLoopLines,
      recommendation: "For independent operations, collect promises and use Promise.all() (with concurrency limits). Keep sequential only if order matters.",
      reference: "Async Patterns: Parallel vs Sequential",
    });
  }

  // Detect setInterval without cleanup
  const setIntervalLines: number[] = [];
  lines.forEach((line, i) => {
    if (/setInterval\s*\(/i.test(line)) {
      setIntervalLines.push(i + 1);
    }
  });
  const hasClearInterval = /clearInterval/i.test(code);
  if (setIntervalLines.length > 0 && !hasClearInterval) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "setInterval without clearInterval",
      description: "Intervals without cleanup continue running after the component/module is no longer needed, causing memory leaks and unexpected behavior.",
      lineNumbers: setIntervalLines,
      recommendation: "Store the interval ID and call clearInterval in cleanup/unmount/dispose handlers.",
      reference: "Resource Cleanup Patterns",
    });
  }

  // Detect race condition patterns with read-modify-write
  const readModifyWriteLines: number[] = [];
  lines.forEach((line, i) => {
    if (/await\s+\w+\.(get|find|read|load)\s*\(/i.test(line)) {
      const nextLines = lines.slice(i + 1, Math.min(lines.length, i + 10)).join("\n");
      if (/await\s+\w+\.(save|update|set|write|put)\s*\(/i.test(nextLines)) {
        readModifyWriteLines.push(i + 1);
      }
    }
  });
  if (readModifyWriteLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Potential read-modify-write race condition",
      description: "Reading a value, modifying it, and writing it back without atomicity can cause lost updates when concurrent operations overlap.",
      lineNumbers: readModifyWriteLines,
      recommendation: "Use atomic operations (findOneAndUpdate, INCR), optimistic locking (version field), or database transactions.",
      reference: "Race Conditions / Optimistic Concurrency Control",
    });
  }

  // Detect worker/thread creation without pool
  const workerLines: number[] = [];
  lines.forEach((line, i) => {
    if (/new\s+Worker\s*\(|new\s+Thread\s*\(|threading\.Thread\s*\(|Thread\.start/i.test(line)) {
      workerLines.push(i + 1);
    }
  });
  const hasPool = /pool|WorkerPool|ThreadPool|threadpool|ExecutorService/i.test(code);
  if (workerLines.length > 0 && !hasPool) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Worker/thread creation without pooling",
      description: "Creating new workers or threads per request is expensive and can exhaust system resources under load.",
      lineNumbers: workerLines,
      recommendation: "Use a worker/thread pool with a bounded size. Reuse workers for subsequent tasks.",
      reference: "Thread Pool Pattern / Worker Pools",
    });
  }

  // Detect callback-based async mixed with promises
  const mixedAsyncLines: number[] = [];
  lines.forEach((line, i) => {
    if (/function\s*\(\s*(?:err|error)\s*,\s*(?:data|result|res)\s*\)/i.test(line)) {
      const context = lines.slice(Math.max(0, i - 10), i).join("\n");
      if (/async\s|Promise|\.then\s*\(/i.test(context)) {
        mixedAsyncLines.push(i + 1);
      }
    }
  });
  if (mixedAsyncLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Mixed callback and promise async patterns",
      description: "Mixing callbacks with promises/async-await in the same code path is error-prone and makes error handling inconsistent.",
      lineNumbers: mixedAsyncLines,
      recommendation: "Standardize on async/await. Wrap callback-based APIs with util.promisify() or manual Promise wrappers.",
      reference: "Node.js util.promisify / Async Patterns",
    });
  }

  // Detect mutex/lock-free concurrent data access
  const concurrentDataLines: number[] = [];
  lines.forEach((line, i) => {
    if (/(?:Map|Set|Array|Object)\s*\(\s*\)/i.test(line) && /shared|global|cache|store|registry/i.test(line)) {
      const restOfFile = lines.slice(i + 1).join("\n");
      if (/async\s|Promise|\.then\s*\(/i.test(restOfFile) && !/mutex|lock|semaphore|synchronized|atomic/i.test(restOfFile)) {
        concurrentDataLines.push(i + 1);
      }
    }
  });
  if (concurrentDataLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Shared data structure without synchronization",
      description: "Data structures labeled as shared/global/cache are used in async contexts without any synchronization mechanism.",
      lineNumbers: concurrentDataLines,
      recommendation: "Use ConcurrentHashMap (Java), Mutex/RWLock (Go/Rust), or atomic operations. In Node.js, consider request-scoped state.",
      reference: "Concurrent Data Access Patterns",
    });
  }

  // Detect deadlock-prone patterns (nested locks/awaits)
  const nestedAwaitLines: number[] = [];
  lines.forEach((line, i) => {
    if (/await\s+.*lock|acquire\s*\(/i.test(line)) {
      const innerBlock = lines.slice(i + 1, Math.min(lines.length, i + 20)).join("\n");
      if (/await\s+.*lock|acquire\s*\(/i.test(innerBlock)) {
        nestedAwaitLines.push(i + 1);
      }
    }
  });
  if (nestedAwaitLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "critical",
      title: "Potential deadlock: nested lock acquisition",
      description: "Acquiring locks inside other lock scopes can cause deadlocks when two operations acquire locks in different orders.",
      lineNumbers: nestedAwaitLines,
      recommendation: "Acquire locks in a consistent order, use lock-free algorithms, or use a single coarser lock. Add deadlock detection/timeouts.",
      reference: "Deadlock Prevention / Lock Ordering",
    });
  }

  return findings;
}
