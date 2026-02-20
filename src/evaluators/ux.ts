import { Finding } from "../types.js";
import { getLineNumbers, getLangLineNumbers, getLangFamily } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeUx(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "UX";
  const lang = getLangFamily(language);

  // Inline event handlers (onClick, onSubmit in HTML)
  const inlineHandlerPattern = /\bon[A-Z]\w+\s*=\s*["'`]/gi;
  const inlineHandlerLines = getLineNumbers(code, inlineHandlerPattern);
  if (inlineHandlerLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Inline event handlers in HTML",
      description: `Found ${inlineHandlerLines.length} inline event handler(s). Inline handlers mix behavior with markup, break CSP policies, and are harder to maintain.`,
      lineNumbers: inlineHandlerLines,
      recommendation: "Use addEventListener() or framework event bindings (React onClick, Vue @click). Separate behavior from markup for maintainability and CSP compliance.",
      reference: "MDN: Inline Event Handlers / Content Security Policy",
    });
  }

  // No loading/disabled state for forms
  const hasForm = /form|submit|<button|<input.*type=["']submit/gi.test(code);
  const hasLoadingState = /loading|isLoading|submitting|isSubmitting|disabled|pending|spinner|skeleton/gi.test(code);
  if (hasForm && !hasLoadingState && code.split("\n").length > 15) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form submission without loading/disabled state",
      description: "Forms are submitted without visible loading state or button disabling. Users may click multiple times causing duplicate submissions.",
      recommendation: "Disable the submit button during submission. Show a loading indicator. Prevent double-submission at the application layer.",
      reference: "Nielsen's Heuristic #1: Visibility of System Status",
    });
  }

  // Generic error messages in UI
  const genericUiErrorPattern = /["'`](?:Error|Something went wrong|An error occurred|Oops|Server error)["'`]/gi;
  const genericUiErrorLines = getLineNumbers(code, genericUiErrorPattern);
  if (genericUiErrorLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Generic error messages shown to users",
      description: `Found ${genericUiErrorLines.length} generic error message(s). Users need specific, actionable error messages to understand what happened and what to do.`,
      lineNumbers: genericUiErrorLines,
      recommendation: "Provide specific error messages explaining what went wrong and what the user can do ('Please check your internet connection and try again' vs 'Something went wrong').",
      reference: "Nielsen's Heuristic #9: Help Users Recognize Errors",
    });
  }

  // Raw JSON/data dump in responses
  const rawJsonDump = /res\.json\s*\(\s*(?:data|results|rows|records|items)\s*\)/gi;
  const rawDumpLines = getLineNumbers(code, rawJsonDump);
  if (rawDumpLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Raw data returned without formatting envelope",
      description: "Data is returned directly without a response envelope (pagination info, total count, metadata). This makes it harder for UIs to display data properly.",
      lineNumbers: rawDumpLines,
      recommendation: "Wrap responses in an envelope: { data: [...], meta: { total, page, limit }, links: { next, prev } }. This enables pagination UI and data status indicators.",
      reference: "JSON:API / REST API Design Guidelines",
    });
  }

  // No placeholder/label on inputs
  const inputNoLabelPattern = /<input[^>]*(?!.*(?:aria-label|placeholder|id=))[^>]*>/gi;
  const inputLines = getLineNumbers(code, /<input\b/gi);
  const hasLabels = /<label|aria-label|placeholder/gi.test(code);
  if (inputLines.length > 0 && !hasLabels) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form inputs without labels or placeholders",
      description: "Input elements found without associated labels or placeholders. Users won't know what to enter in these fields.",
      lineNumbers: inputLines,
      recommendation: "Use <label for='inputId'> for every input. Add placeholder text for additional guidance. Both improve UX and accessibility.",
      reference: "WCAG 1.3.1: Info and Relationships",
    });
  }

  // Confirmation for destructive actions
  const destructivePattern = /delete|remove|destroy|drop|purge|erase/gi;
  const hasConfirmation = /confirm|modal|dialog|are you sure|confirmation/gi.test(code);
  const hasDestructiveEndpoint = /app\.(delete|post)\s*\([^)]*(?:delete|remove|destroy)/gi.test(code);
  if (hasDestructiveEndpoint && !hasConfirmation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Destructive actions without confirmation",
      description: "Destructive operations (delete, remove) are handled without confirmation prompts. Users could accidentally destroy data.",
      recommendation: "Add confirmation dialogs for destructive actions. Show what will be affected. Consider soft-delete with undo capability.",
      reference: "Nielsen's Heuristic #5: Error Prevention",
    });
  }

  // No pagination
  const hasListEndpoint = /app\.get\s*\([^)]*(?:list|all|users|items|posts|products|orders)/gi.test(code);
  const hasPagination = /page|limit|offset|cursor|skip|take|per_?page|pageSize/gi.test(code);
  const hasDbFind = /db\.find\s*\(\s*(?:\{\s*\}|\))/gi.test(code);
  if ((hasListEndpoint || hasDbFind) && !hasPagination) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "List endpoints without pagination",
      description: "Data retrieval endpoints return all results without pagination. This causes slow responses, high memory usage, and poor UX with large datasets.",
      recommendation: "Implement pagination (offset-based or cursor-based). Return total count and page info. Enforce maximum page sizes.",
      reference: "REST API Pagination Best Practices",
    });
  }

  // No empty state handling
  const hasEmptyCheck = /(?:\.length\s*===?\s*0|isEmpty|no\s*(?:results|data|items)|empty.?state|emptyState|NoData|NoResults)/gi.test(code);
  const hasListRendering = /\.map\s*\(|\.forEach\s*\(|v-for|ngFor|\*ngFor|\.render\s*\(/gi.test(code);
  if (hasListRendering && !hasEmptyCheck && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "List rendering without empty state handling",
      description: "Code renders lists/collections without checking for empty state. Users see a blank screen with no feedback when no data exists.",
      recommendation: "Always handle the empty state: show a helpful message, illustration, or call-to-action. Check array.length before rendering lists.",
      reference: "UX Design: Empty State Patterns",
    });
  }

  // Missing success feedback
  const hasMutation = /\.post\s*\(|\.put\s*\(|\.delete\s*\(|\.patch\s*\(|fetch\s*\([^)]*(?:POST|PUT|DELETE|PATCH)/gi.test(code);
  const hasSuccessFeedback = /toast|snackbar|notification|alert\s*\(\s*['"].*(?:success|saved|created|updated|deleted)|showMessage|showSuccess|feedback/gi.test(code);
  if (hasMutation && !hasSuccessFeedback && code.split("\n").length > 30) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "Mutations without success feedback",
      description: "POST/PUT/DELETE operations found without visible success feedback. Users don't know if their action worked, leading to repeated submissions.",
      recommendation: "Show success notifications (toasts, alerts) after mutations. Provide clear visual feedback. Consider optimistic UI updates with rollback on failure.",
      reference: "Nielsen's Heuristic #1: Visibility of System Status",
    });
  }

  // No progress indicator for long operations
  const hasAsyncOp = /async\s+function|await\s+fetch|\.then\s*\(|Promise\./gi.test(code);
  const hasProgress = /progress|spinner|loading|isLoading|setLoading|skeleton|placeholder/gi.test(code);
  const hasFileProcessing = /readFile|writeFile|stream|pipe\s*\(|transform/gi.test(code);
  if (hasFileProcessing && hasAsyncOp && !hasProgress) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "low",
      title: "File/stream operations without progress indicators",
      description: "File processing or streaming operations found without progress feedback. Users waiting on long operations without feedback may assume the app is frozen.",
      recommendation: "Show progress bars for file operations. Use streaming progress events. Provide estimated time remaining for large operations.",
      reference: "UX: Progress Indicator Patterns / Nielsen's Heuristic #1",
    });
  }

  // Hardcoded UI strings (i18n issue from UX perspective)
  const hardcodedStringPattern = /(?:innerHTML|textContent|innerText|placeholder|title|label)\s*=\s*['"][A-Z][a-z]+(?:\s+[a-z]+){2,}['"]/g;
  const hardcodedStringLines = getLineNumbers(code, hardcodedStringPattern);
  if (hardcodedStringLines.length > 3) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "info",
      title: "Multiple hardcoded UI strings detected",
      description: `Found ${hardcodedStringLines.length} hardcoded UI string(s) directly assigned to DOM properties. This makes copy changes difficult and blocks localization.`,
      lineNumbers: hardcodedStringLines,
      recommendation: "Extract UI strings to a constants file or i18n library. Use translation keys instead of hardcoded strings. This enables copy editing without code changes.",
      reference: "i18n Best Practices / Content Management",
    });
  }

  // Form submission without validation
  const formPattern = /onSubmit|handleSubmit|form\.submit|\.submit\s*\(/gi;
  const formLines = getLineNumbers(code, formPattern);
  const hasValidation = /validate|validator|yup|zod|joi|schema|required|minLength|maxLength|pattern\s*=/gi.test(code);
  if (formLines.length > 0 && !hasValidation) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form submission without client-side validation",
      description: `Found ${formLines.length} form submission handler(s) without visible validation. Submitting invalid data wastes round trips and frustrates users with server-side error messages.`,
      lineNumbers: formLines,
      recommendation: "Add client-side validation before submission. Use schema validation libraries (Zod, Yup, Joi). Show inline validation feedback. Keep server-side validation as well.",
      reference: "UX: Form Validation Patterns / Nielsen's Heuristic #9: Error Recovery",
    });
  }

  return findings;
}
