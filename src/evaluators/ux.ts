import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeUx(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  let ruleNum = 1;
  const prefix = "UX";

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

  return findings;
}
