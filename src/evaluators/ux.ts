import type { Finding } from "../types.js";
import { getLineNumbers, getLangFamily, testCode } from "./shared.js";

export function analyzeUx(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "UX";
  const _lang = getLangFamily(language);

  // Inline event handlers (onClick, onSubmit in HTML)
  // Skip for React/JSX files — synthetic event props like onClick={handler} are standard,
  // and even onClick={"handler"} is a legitimate (if unusual) React pattern.
  const isReactOrJsx =
    /import\s+.*\bReact\b|from\s+['"]react['"]|jsx|tsx|React\.createElement|\buse(?:State|Effect|Ref|Memo|Callback)\b/i.test(
      code,
    );
  const inlineHandlerPattern = /\bon[A-Z]\w+\s*=\s*["'`]/gi;
  const inlineHandlerLines = isReactOrJsx ? [] : getLineNumbers(code, inlineHandlerPattern);
  if (inlineHandlerLines.length >= 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Inline event handlers in HTML",
      description: `Found ${inlineHandlerLines.length} inline event handler(s). Inline handlers mix behavior with markup, break CSP policies, and are harder to maintain.`,
      lineNumbers: inlineHandlerLines,
      recommendation:
        "Use addEventListener() or framework event bindings (React onClick, Vue @click). Separate behavior from markup for maintainability and CSP compliance.",
      reference: "MDN: Inline Event Handlers / Content Security Policy",
      suggestedFix:
        "Remove the inline `on*=` attribute and attach the handler in JavaScript via `element.addEventListener('click', handler)` or the framework equivalent.",
      confidence: 0.85,
    });
  }

  // No loading/disabled state for forms
  // Require actual HTML form elements or submit handlers, not just keyword mentions
  const hasForm = testCode(
    code,
    /<form\b|<button\b|onSubmit\s*=|handleSubmit|formik|useForm|<input[^>]*type=["']submit/gi,
  );
  const hasLoadingState = testCode(
    code,
    /loading|isLoading|submitting|isSubmitting|disabled|pending|spinner|skeleton/gi,
  );
  if (hasForm && !hasLoadingState && code.split("\n").length > 15) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form submission without loading/disabled state",
      description:
        "Forms are submitted without visible loading state or button disabling. Users may click multiple times causing duplicate submissions.",
      recommendation:
        "Disable the submit button during submission. Show a loading indicator. Prevent double-submission at the application layer.",
      reference: "Nielsen's Heuristic #1: Visibility of System Status",
      suggestedFix:
        "Add an `isSubmitting` state flag that disables the submit button and shows a spinner while the form request is in flight.",
      confidence: 0.7,
    });
  }

  // Generic error messages in UI
  const genericUiErrorPattern =
    /["'`](?:Error|Something went wrong|An error occurred|Oops|Server error|Bad request)["'`]/gi;
  const codeLines = code.split("\n");
  const genericUiErrorLines = getLineNumbers(code, genericUiErrorPattern).filter((ln) => {
    const line = codeLines[ln - 1] ?? "";
    // Skip JSON keys like {"error": msg} — the word "error" as a key is not a user message
    if (/["'`]error["'`]\s*[:,]/i.test(line)) return false;
    // Skip structured logging calls: logger.Error("...", "error", err)
    if (/\.\s*(?:Error|Warn|Info|Debug|Fatal|Log)\s*\(/i.test(line)) return false;
    // Skip server-side HTTP error responses (Rust HttpResponse, Go http.Error, etc.)
    // But do NOT skip .status(4xx/5xx) lines that also contain a generic error string —
    // the user-facing error message IS the UX finding.
    if (/HttpResponse::|http\.Error\s*\(/i.test(line)) return false;
    if (/\.status\s*\(\s*[45]\d\d\s*\)/i.test(line)) {
      if (/["'`](?:Error|Something went wrong|An error occurred|Oops|Server error|Bad request)["'`]/i.test(line)) {
        return true; // Keep: generic error message shown to users via HTTP response
      }
      return false;
    }
    return true;
  });
  if (genericUiErrorLines.length > 0 && code.split("\n").length > 60) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Generic error messages shown to users",
      description: `Found ${genericUiErrorLines.length} generic error message(s). Users need specific, actionable error messages to understand what happened and what to do.`,
      lineNumbers: genericUiErrorLines,
      recommendation:
        "Provide specific error messages explaining what went wrong and what the user can do ('Please check your internet connection and try again' vs 'Something went wrong').",
      reference: "Nielsen's Heuristic #9: Help Users Recognize Errors",
      suggestedFix:
        "Replace the generic string with a user-friendly message derived from the error type, e.g., `error.message || 'Unable to save your changes. Please try again.'`.",
      confidence: 0.85,
    });
  }

  // Raw JSON/data dump in responses
  const rawJsonDump = /res\.json\s*\(\s*(?:data|results|rows|records|items)\s*\)/gi;
  const rawDumpLines = getLineNumbers(code, rawJsonDump);
  if (rawDumpLines.length >= 2) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Raw data returned without formatting envelope",
      description:
        "Data is returned directly without a response envelope (pagination info, total count, metadata). This makes it harder for UIs to display data properly.",
      lineNumbers: rawDumpLines,
      recommendation:
        "Wrap responses in an envelope: { data: [...], meta: { total, page, limit }, links: { next, prev } }. This enables pagination UI and data status indicators.",
      reference: "JSON:API / REST API Design Guidelines",
      suggestedFix:
        "Wrap the raw `res.json(data)` call in an envelope: `res.json({ data, meta: { total: data.length } })`.",
      confidence: 0.8,
    });
  }

  // No placeholder/label on inputs
  const _inputNoLabelPattern = /<input[^>]*(?!.*(?:aria-label|placeholder|id=))[^>]*>/gi;
  const inputLines = getLineNumbers(code, /<input\b/gi);
  const hasLabels = testCode(code, /<label|aria-label|placeholder/gi);
  if (inputLines.length > 0 && !hasLabels) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form inputs without labels or placeholders",
      description:
        "Input elements found without associated labels or placeholders. Users won't know what to enter in these fields.",
      lineNumbers: inputLines,
      recommendation:
        "Use <label for='inputId'> for every input. Add placeholder text for additional guidance. Both improve UX and accessibility.",
      reference: "WCAG 1.3.1: Info and Relationships",
      suggestedFix:
        "Add a `<label for='fieldId'>` element before each `<input>` and set a matching `id` attribute on the input.",
      confidence: 0.75,
    });
  }

  // Confirmation for destructive actions
  const _destructivePattern = /delete|remove|destroy|drop|purge|erase/gi;
  const hasConfirmation = testCode(code, /confirm|modal|dialog|are you sure|confirmation/gi);
  const hasDestructiveEndpoint = testCode(code, /app\.(delete|post)\s*\([^)]*(?:delete|remove|destroy)/gi);
  if (hasDestructiveEndpoint && !hasConfirmation && code.split("\n").length > 50) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Destructive actions without confirmation",
      description:
        "Destructive operations (delete, remove) are handled without confirmation prompts. Users could accidentally destroy data.",
      recommendation:
        "Add confirmation dialogs for destructive actions. Show what will be affected. Consider soft-delete with undo capability.",
      reference: "Nielsen's Heuristic #5: Error Prevention",
      suggestedFix:
        "Guard the delete handler with a confirmation prompt, e.g., `if (!confirm('Are you sure you want to delete this item?')) return;`.",
      confidence: 0.7,
    });
  }

  // No pagination
  const hasListEndpoint = testCode(code, /app\.get\s*\([^)]*(?:list|all|users|items|posts|products|orders)/gi);
  const hasPagination = testCode(code, /page|limit|offset|cursor|skip|take|per_?page|pageSize/gi);
  const hasDbFind = testCode(code, /db\.find\s*\(\s*(?:\{\s*\}|\))/gi);
  if ((hasListEndpoint || hasDbFind) && !hasPagination) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "List endpoints without pagination",
      description:
        "Data retrieval endpoints return all results without pagination. This causes slow responses, high memory usage, and poor UX with large datasets.",
      recommendation:
        "Implement pagination (offset-based or cursor-based). Return total count and page info. Enforce maximum page sizes.",
      reference: "REST API Pagination Best Practices",
      suggestedFix:
        "Accept `page` and `limit` query parameters (e.g., `const { page = 1, limit = 20 } = req.query`) and apply `.skip((page-1)*limit).limit(limit)` to the query.",
      confidence: 0.7,
    });
  }

  // No empty state handling
  const hasEmptyCheck = testCode(
    code,
    /(?:\.length\s*===?\s*0|isEmpty|no\s*(?:results|data|items)|empty.?state|emptyState|NoData|NoResults)/gi,
  );
  const hasListRendering = testCode(code, /\.map\s*\(|\.forEach\s*\(|v-for|ngFor|\*ngFor|\.render\s*\(/gi);
  // Only flag when the file has UI rendering context — pure backend modules
  // use .map()/.forEach() for data processing, not list rendering.
  const hasUIRenderingContext =
    isReactOrJsx ||
    testCode(code, /<[a-z][a-z0-9]*[\s>]/i) || // HTML/JSX tags
    testCode(code, /innerHTML|appendChild|createElement|document\.|window\.|\$\(|v-for|ngFor|template\s*:/i) ||
    testCode(code, /from\s+['"](?:vue|@angular|svelte|lit|preact|solid)/i);
  if (hasListRendering && hasUIRenderingContext && !hasEmptyCheck && code.split("\n").length > 120) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "List rendering without empty state handling",
      description:
        "Code renders lists/collections without checking for empty state. Users see a blank screen with no feedback when no data exists.",
      recommendation:
        "Always handle the empty state: show a helpful message, illustration, or call-to-action. Check array.length before rendering lists.",
      reference: "UX Design: Empty State Patterns",
      suggestedFix:
        "Add an `if (items.length === 0) return <EmptyState />` guard before the `.map()` call to render a friendly empty-state message.",
      confidence: 0.7,
    });
  }

  // Missing success feedback
  const hasMutation = testCode(
    code,
    /\.post\s*\(|\.put\s*\(|\.delete\s*\(|\.patch\s*\(|fetch\s*\([^)]*(?:POST|PUT|DELETE|PATCH)/gi,
  );
  const hasSuccessFeedback =
    /toast|snackbar|notification|alert\s*\(\s*['"].*(?:success|saved|created|updated|deleted)|showMessage|showSuccess|feedback/gi.test(
      code,
    );
  if (hasMutation && !hasSuccessFeedback && code.split("\n").length > 80) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Mutations without success feedback",
      description:
        "POST/PUT/DELETE operations found without visible success feedback. Users don't know if their action worked, leading to repeated submissions.",
      recommendation:
        "Show success notifications (toasts, alerts) after mutations. Provide clear visual feedback. Consider optimistic UI updates with rollback on failure.",
      reference: "Nielsen's Heuristic #1: Visibility of System Status",
      suggestedFix:
        "Add a `toast.success('Changes saved successfully')` call (or equivalent notification) in the `.then()` or after the `await` of the mutation request.",
      confidence: 0.7,
    });
  }

  // No progress indicator for long operations
  const hasAsyncOp = testCode(code, /async\s+function|await\s+fetch|\.then\s*\(|Promise\./gi);
  const hasProgress = testCode(code, /progress|spinner|loading|isLoading|setLoading|skeleton|placeholder/gi);
  const hasFileProcessing = testCode(code, /readFile|writeFile|stream|pipe\s*\(|transform/gi);
  if (hasFileProcessing && hasAsyncOp && !hasProgress && code.split("\n").length > 60) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "File/stream operations without progress indicators",
      description:
        "File processing or streaming operations found without progress feedback. Users waiting on long operations without feedback may assume the app is frozen.",
      recommendation:
        "Show progress bars for file operations. Use streaming progress events. Provide estimated time remaining for large operations.",
      reference: "UX: Progress Indicator Patterns / Nielsen's Heuristic #1",
      suggestedFix:
        "Track bytes processed via the stream's `'data'` event and emit a progress percentage (e.g., `onProgress(bytesRead / totalSize * 100)`).",
      confidence: 0.7,
    });
  }

  // Hardcoded UI strings (i18n issue from UX perspective)
  const hardcodedStringPattern =
    /(?:innerHTML|textContent|innerText|placeholder|title|label)\s*=\s*['"][A-Z][a-z]+(?:\s+[a-z]+){2,}['"]/g;
  const hardcodedStringLines = getLineNumbers(code, hardcodedStringPattern);
  if (hardcodedStringLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Multiple hardcoded UI strings detected",
      description: `Found ${hardcodedStringLines.length} hardcoded UI string(s) directly assigned to DOM properties. This makes copy changes difficult and blocks localization.`,
      lineNumbers: hardcodedStringLines,
      recommendation:
        "Extract UI strings to a constants file or i18n library. Use translation keys instead of hardcoded strings. This enables copy editing without code changes.",
      reference: "i18n Best Practices / Content Management",
      suggestedFix:
        "Replace the hardcoded string with a translation key lookup, e.g., `element.textContent = t('welcomeMessage')`, and add the string to your locale file.",
      confidence: 0.85,
    });
  }

  // Form submission without validation
  const formPattern = /onSubmit|handleSubmit|form\.submit|\.submit\s*\(/gi;
  const formLines = getLineNumbers(code, formPattern);
  const hasValidation = testCode(
    code,
    /validate|validator|yup|zod|joi|schema|required|minLength|maxLength|pattern\s*=/gi,
  );
  if (formLines.length > 0 && !hasValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form submission without client-side validation",
      description: `Found ${formLines.length} form submission handler(s) without visible validation. Submitting invalid data wastes round trips and frustrates users with server-side error messages.`,
      lineNumbers: formLines,
      recommendation:
        "Add client-side validation before submission. Use schema validation libraries (Zod, Yup, Joi). Show inline validation feedback. Keep server-side validation as well.",
      reference: "UX: Form Validation Patterns / Nielsen's Heuristic #9: Error Recovery",
      suggestedFix:
        "Add a validation check at the top of the submit handler (e.g., `const result = schema.safeParse(formData); if (!result.success) return showErrors(result.error)`) before sending the request.",
      confidence: 0.75,
    });
  }

  // Infinite scroll without scroll position restoration
  const hasInfiniteScroll = testCode(
    code,
    /IntersectionObserver|useInfiniteQuery|infinite.?scroll|loadMore|load.?next/gi,
  );
  const hasScrollRestore = testCode(code, /scrollRestoration|scrollTo|scrollPosition|saveScroll|restoreScroll/gi);
  if (hasInfiniteScroll && !hasScrollRestore) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Infinite scroll without scroll position restoration",
      description:
        "Infinite scroll is implemented without scroll position saving. Users lose their place when navigating away and returning.",
      recommendation:
        "Save scroll position before navigation. Restore it on return. Use browser history.scrollRestoration or a scroll position cache.",
      reference: "UX: Infinite Scroll Best Practices",
      suggestedFix:
        "Store `window.scrollY` before navigating away and call `window.scrollTo(0, savedPosition)` on return, or set `history.scrollRestoration = 'manual'`.",
      confidence: 0.7,
    });
  }

  // Keyboard shortcuts without discoverability
  const hasKeyboardShortcuts = testCode(
    code,
    /addEventListener\s*\(\s*['"]key(?:down|up|press)['"]|onKeyDown|onKeyUp|hotkey|useHotkey|mousetrap|Ctrl\+|Meta\+|mod\+/gi,
  );
  const hasShortcutHelp = testCode(
    code,
    /shortcut.?help|keyboard.?shortcuts|hotkey.?list|shortcut.?modal|help.?dialog|shortcut.?guide|\?\s*$/gi,
  );
  if (hasKeyboardShortcuts && !hasShortcutHelp && code.split("\n").length > 100) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Keyboard shortcuts without help/discoverability",
      description:
        "Keyboard shortcuts are defined but no help dialog or documentation is visible. Users won't discover the shortcuts.",
      recommendation:
        "Add a keyboard shortcut help dialog (e.g., triggered by '?'). Show shortcut hints in tooltips. Document available shortcuts.",
      reference: "Nielsen's Heuristic #6: Recognition over Recall",
      suggestedFix:
        "Create a shortcuts help modal listing all hotkeys and bind it to the '?' key, e.g., `if (e.key === '?') showShortcutsModal()`.",
      confidence: 0.7,
    });
  }

  // Unresponsive click targets (too-small buttons/links)
  const smallTargetPattern = /(?:width|height|min-width|min-height)\s*:\s*(?:[0-9]|1[0-9]|2[0-9]|3[0-9])px/gi;
  const smallTargetLines = getLineNumbers(code, smallTargetPattern);
  const isStyleFile = testCode(code, /\.css|styled|makeStyles|createStyle|css`|emotion/gi);
  if (smallTargetLines.length > 3 && isStyleFile) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Interactive elements with small touch/click targets",
      description: `Found ${smallTargetLines.length} element(s) with dimensions < 40px. Small touch targets cause mis-taps on mobile and frustrate users.`,
      lineNumbers: smallTargetLines,
      recommendation:
        "Ensure interactive elements are at least 44×44px (WCAG) or 48×48dp (Material Design). Use adequate padding to increase tap area without visual changes.",
      reference: "WCAG 2.5.8: Target Size / Material Design Touch Targets",
      suggestedFix:
        "Increase the element's `min-width` and `min-height` to at least `44px`, or add padding: e.g., `padding: 12px`.",
      confidence: 0.7,
    });
  }

  // Missing error boundary in React component trees
  const isReactComponent = testCode(code, /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]*return\s*\(/gi) && isReactOrJsx;
  const hasErrorBoundary = testCode(code, /ErrorBoundary|componentDidCatch|getDerivedStateFromError|error.?boundary/gi);
  const hasSuspense = testCode(code, /Suspense|React\.lazy|lazy\(/gi);
  if (isReactComponent && hasSuspense && !hasErrorBoundary && code.split("\n").length > 60) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Lazy-loaded components without error boundary",
      description:
        "React.lazy/Suspense is used without an ErrorBoundary wrapper. If the lazy chunk fails to load, the entire component tree crashes with no recovery.",
      recommendation:
        "Wrap Suspense boundaries with ErrorBoundary components. Provide a fallback UI for failed chunk loads. Consider retry logic for network errors.",
      reference: "React: Error Boundaries / Code Splitting Best Practices",
      suggestedFix:
        "Wrap the `<Suspense>` component with an `<ErrorBoundary fallback={<ErrorFallback />}>` to catch and display chunk load failures.",
      confidence: 0.75,
    });
  }

  // Time display without timezone context
  const hasDateRendering = testCode(
    code,
    /new Date\s*\(|toLocaleDateString|toLocaleTimeString|format\s*\(\s*['"][^'"]*[HhMm]/gi,
  );
  const hasTimezone = testCode(
    code,
    /timeZone|timezone|Intl\.DateTimeFormat|utc|UTC|tz\b|luxon|dayjs.*tz|moment.*tz/gi,
  );
  const hasTimeDisplay = testCode(code, /\.toISOString|\.toUTCString|createdAt|updatedAt|timestamp|date.?format/gi);
  if (hasDateRendering && hasTimeDisplay && !hasTimezone && hasUIRenderingContext) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
      severity: "low",
      title: "Time/date display without timezone awareness",
      description:
        "Dates are rendered in the UI without explicit timezone handling. Users in different timezones see confusing or incorrect times.",
      recommendation:
        "Display times in the user's local timezone using Intl.DateTimeFormat. Show timezone indicator (e.g., 'PST'). Use relative time ('2 hours ago') when appropriate.",
      reference: "UX: Displaying Time Across Timezones",
      suggestedFix:
        "Use `new Intl.DateTimeFormat(locale, { timeZone: userTz, ...opts }).format(date)` or a library like `date-fns-tz` to display user-local times.",
      confidence: 0.65,
    });
  }

  return findings;
}
