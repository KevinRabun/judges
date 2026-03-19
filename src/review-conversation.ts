/**
 * Multi-Turn Review Conversation
 *
 * Enables interactive, stateful review sessions where developers and
 * the tribunal engage in a conversation about findings. This transforms
 * the evaluation from a one-shot report into a collaborative review:
 *
 * - Developer asks "why?" about a finding → tribunal explains reasoning
 * - Developer provides context → tribunal adjusts confidence
 * - Developer requests re-evaluation → tribunal focuses on specific areas
 * - Developer disputes a finding → tribunal logs disagreement and adjusts
 *
 * Designed for MCP tool sessions and VS Code extension interactions.
 */

import type { Finding, TribunalVerdict } from "./types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ConversationRole = "developer" | "tribunal" | "system";

export type MessageIntent =
  | "explain" // "Why was this flagged?"
  | "context" // "This is expected because..." / "We use X library"
  | "dispute" // "This is a false positive"
  | "accept" // "OK, I'll fix this"
  | "re-evaluate" // "Check again with this context"
  | "focus" // "Look specifically at security issues"
  | "summary" // "Give me the summary"
  | "general"; // Free-form message

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  intent: MessageIntent;
  content: string;
  timestamp: string;
  /** Finding this message relates to (if applicable) */
  findingRef?: string;
  /** Metadata about the action taken */
  metadata?: Record<string, unknown>;
}

export interface ReviewConversation {
  /** Unique conversation ID */
  conversationId: string;
  /** File under review */
  filePath: string;
  /** Language of the file */
  language: string;
  /** Current state of the conversation */
  state: ConversationState;
  /** All messages in order */
  messages: ConversationMessage[];
  /** Current findings (may be updated during conversation) */
  findings: Finding[];
  /** Original verdict from initial evaluation */
  originalVerdict?: TribunalVerdict;
  /** Accumulated developer context that affects evaluation */
  developerContext: DeveloperContext;
  /** Conversation started at */
  startedAt: string;
  /** Last activity */
  lastActivityAt: string;
}

export type ConversationState =
  | "active" // Ongoing conversation
  | "resolved" // All findings addressed
  | "paused" // Developer stepped away
  | "escalated"; // Sent to human reviewer

export interface DeveloperContext {
  /** Reasons provided by developer for specific findings */
  explanations: Map<string, string>;
  /** Findings the developer disputes */
  disputed: Set<string>;
  /** Findings the developer accepts */
  accepted: Set<string>;
  /** Additional context (frameworks, libraries, constraints) */
  additionalContext: string[];
  /** Focus areas for re-evaluation */
  focusAreas: string[];
}

// ─── Conversation Management ─────────────────────────────────────────────────

let messageCounter = 0;

function generateMessageId(): string {
  messageCounter++;
  return `msg_${Date.now().toString(36)}_${messageCounter.toString(36)}`;
}

function generateConversationId(): string {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Start a new review conversation for a file evaluation.
 */
export function startReviewConversation(
  filePath: string,
  language: string,
  verdict: TribunalVerdict,
): ReviewConversation {
  const now = new Date().toISOString();

  const conversation: ReviewConversation = {
    conversationId: generateConversationId(),
    filePath,
    language,
    state: "active",
    messages: [],
    findings: [...verdict.findings],
    originalVerdict: verdict,
    developerContext: {
      explanations: new Map(),
      disputed: new Set(),
      accepted: new Set(),
      additionalContext: [],
      focusAreas: [],
    },
    startedAt: now,
    lastActivityAt: now,
  };

  // Add system opening message
  addMessage(conversation, "system", "general", buildOpeningMessage(verdict));

  return conversation;
}

/**
 * Process a developer message and generate a tribunal response.
 */
export function processMessage(
  conversation: ReviewConversation,
  content: string,
  intent: MessageIntent,
  findingRef?: string,
): ConversationMessage {
  // Record the developer's message
  addMessage(conversation, "developer", intent, content, findingRef);

  // Generate tribunal response based on intent
  let response: string;

  switch (intent) {
    case "explain":
      response = handleExplainRequest(conversation, findingRef);
      break;
    case "context":
      response = handleContextProvided(conversation, content, findingRef);
      break;
    case "dispute":
      response = handleDispute(conversation, content, findingRef);
      break;
    case "accept":
      response = handleAcceptance(conversation, findingRef);
      break;
    case "re-evaluate":
      response = handleReEvaluateRequest(conversation, content);
      break;
    case "focus":
      response = handleFocusRequest(conversation, content);
      break;
    case "summary":
      response = buildConversationSummary(conversation);
      break;
    default:
      response = handleGeneralMessage(conversation, content);
      break;
  }

  // Record tribunal response
  return addMessage(conversation, "tribunal", intent, response, findingRef);
}

/**
 * Get the current state of outstanding findings in the conversation.
 */
export function getOutstandingFindings(conversation: ReviewConversation): {
  unaddressed: Finding[];
  accepted: Finding[];
  disputed: Finding[];
} {
  const accepted: Finding[] = [];
  const disputed: Finding[] = [];
  const unaddressed: Finding[] = [];

  for (const f of conversation.findings) {
    const key = f.ruleId;
    if (conversation.developerContext.accepted.has(key)) {
      accepted.push(f);
    } else if (conversation.developerContext.disputed.has(key)) {
      disputed.push(f);
    } else {
      unaddressed.push(f);
    }
  }

  return { unaddressed, accepted, disputed };
}

/**
 * Check if all findings have been addressed (accepted or disputed).
 */
export function isConversationResolved(conversation: ReviewConversation): boolean {
  const { unaddressed } = getOutstandingFindings(conversation);
  return unaddressed.length === 0;
}

/**
 * Export the conversation as a reviewable markdown report.
 */
export function exportConversationAsMarkdown(conversation: ReviewConversation): string {
  const lines: string[] = [
    `# Review Conversation: ${conversation.filePath}`,
    "",
    `**Started**: ${conversation.startedAt}`,
    `**State**: ${conversation.state}`,
    `**Findings**: ${conversation.findings.length}`,
    "",
    "---",
    "",
  ];

  for (const msg of conversation.messages) {
    const role = msg.role === "developer" ? "**Developer**" : msg.role === "tribunal" ? "**Tribunal**" : "*System*";
    const ref = msg.findingRef ? ` (re: ${msg.findingRef})` : "";
    lines.push(`### ${role}${ref}`);
    lines.push(`*${msg.timestamp}* — \`${msg.intent}\``);
    lines.push("");
    lines.push(msg.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const { unaddressed, accepted, disputed } = getOutstandingFindings(conversation);
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Accepted**: ${accepted.length} finding(s)`);
  lines.push(`- **Disputed**: ${disputed.length} finding(s)`);
  lines.push(`- **Unaddressed**: ${unaddressed.length} finding(s)`);

  return lines.join("\n");
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function addMessage(
  conversation: ReviewConversation,
  role: ConversationRole,
  intent: MessageIntent,
  content: string,
  findingRef?: string,
): ConversationMessage {
  const msg: ConversationMessage = {
    id: generateMessageId(),
    role,
    intent,
    content,
    timestamp: new Date().toISOString(),
    findingRef,
  };
  conversation.messages.push(msg);
  conversation.lastActivityAt = msg.timestamp;

  // Check if conversation is resolved after each message
  if (isConversationResolved(conversation)) {
    conversation.state = "resolved";
  }

  return msg;
}

function findFinding(conversation: ReviewConversation, ref?: string): Finding | undefined {
  if (!ref) return undefined;
  return conversation.findings.find((f) => f.ruleId === ref || f.title === ref);
}

function buildOpeningMessage(verdict: TribunalVerdict): string {
  const critical = verdict.findings.filter((f) => f.severity === "critical").length;
  const high = verdict.findings.filter((f) => f.severity === "high").length;
  const medium = verdict.findings.filter((f) => f.severity === "medium").length;
  const low = verdict.findings.filter((f) => f.severity === "low").length;

  const parts = [`Code review complete. Found **${verdict.findings.length}** finding(s):`];

  if (critical > 0) parts.push(`- ${critical} critical`);
  if (high > 0) parts.push(`- ${high} high`);
  if (medium > 0) parts.push(`- ${medium} medium`);
  if (low > 0) parts.push(`- ${low} low`);

  parts.push("");
  parts.push("You can:");
  parts.push("- Ask **why** a finding was flagged (`explain`)");
  parts.push("- Provide **context** about your code (`context`)");
  parts.push("- **Dispute** a false positive (`dispute`)");
  parts.push("- **Accept** a finding to fix (`accept`)");
  parts.push("- Request **re-evaluation** with new context (`re-evaluate`)");

  return parts.join("\n");
}

function handleExplainRequest(conversation: ReviewConversation, ref?: string): string {
  const finding = findFinding(conversation, ref);
  if (!finding) {
    // List all findings for the developer to pick
    const list = conversation.findings
      .map((f, i) => `${i + 1}. **${f.ruleId}** (${f.severity}): ${f.title}`)
      .join("\n");
    return `Which finding would you like explained?\n\n${list}`;
  }

  const parts = [
    `## ${finding.ruleId}: ${finding.title}`,
    "",
    `**Severity**: ${finding.severity}`,
    `**Confidence**: ${((finding.confidence ?? 0.5) * 100).toFixed(0)}%`,
    `**Lines**: ${finding.lineNumbers?.join(", ") || "N/A"}`,
    "",
    finding.description,
  ];

  if (finding.recommendation) {
    parts.push("", `**Recommendation**: ${finding.recommendation}`);
  }

  if (finding.reference) {
    parts.push("", `**Reference**: ${finding.reference}`);
  }

  if (finding.provenance) {
    parts.push("", `**Detection method**: ${finding.provenance}`);
  }

  return parts.join("\n");
}

function handleContextProvided(conversation: ReviewConversation, content: string, ref?: string): string {
  conversation.developerContext.additionalContext.push(content);

  if (ref) {
    conversation.developerContext.explanations.set(ref, content);

    const finding = findFinding(conversation, ref);
    if (finding) {
      // Reduce confidence since developer provided context
      const oldConf = finding.confidence ?? 0.5;
      finding.confidence = Math.max(0.1, oldConf * 0.7);
      return `Context noted for **${ref}**. Confidence adjusted from ${(oldConf * 100).toFixed(0)}% to ${(finding.confidence * 100).toFixed(0)}%. This finding will be weighted less heavily.`;
    }
  }

  return `Context recorded. This will be factored into any re-evaluation. (${conversation.developerContext.additionalContext.length} context note(s) total)`;
}

function handleDispute(conversation: ReviewConversation, content: string, ref?: string): string {
  if (!ref) {
    return "Please specify which finding you're disputing (e.g., by rule ID like SEC-001).";
  }

  conversation.developerContext.disputed.add(ref);
  conversation.developerContext.explanations.set(ref, content);

  const finding = findFinding(conversation, ref);
  if (finding) {
    finding.confidence = Math.max(0.05, (finding.confidence ?? 0.5) * 0.3);
    return `Finding **${ref}** marked as disputed. Your reasoning has been recorded. Confidence reduced to ${(finding.confidence * 100).toFixed(0)}%. This will feed back into calibration to reduce false positives for similar patterns.`;
  }

  return `Dispute recorded for **${ref}**. Finding was not found in current results — it may have already been resolved.`;
}

function handleAcceptance(conversation: ReviewConversation, ref?: string): string {
  if (!ref) {
    return "Please specify which finding you accept (e.g., by rule ID like SEC-001), or say 'all' to accept all.";
  }

  if (ref === "all") {
    for (const f of conversation.findings) {
      conversation.developerContext.accepted.add(f.ruleId);
    }
    return `All ${conversation.findings.length} findings accepted. Good luck with the fixes!`;
  }

  conversation.developerContext.accepted.add(ref);
  const { unaddressed } = getOutstandingFindings(conversation);
  return `Finding **${ref}** accepted. ${unaddressed.length} finding(s) remaining.`;
}

function handleReEvaluateRequest(conversation: ReviewConversation, _content: string): string {
  return `Re-evaluation requested. The following developer context will be applied:\n\n${conversation.developerContext.additionalContext.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\nRe-run the evaluation with this conversation's context for updated results.`;
}

function handleFocusRequest(conversation: ReviewConversation, content: string): string {
  conversation.developerContext.focusAreas.push(content);
  return `Focus area recorded: "${content}". Re-evaluation will prioritize ${conversation.developerContext.focusAreas.join(", ")}.`;
}

function buildConversationSummary(conversation: ReviewConversation): string {
  const { unaddressed, accepted, disputed } = getOutstandingFindings(conversation);
  const totalMessages = conversation.messages.length;

  const parts = [
    `## Conversation Summary`,
    "",
    `- **Total messages**: ${totalMessages}`,
    `- **Findings**: ${conversation.findings.length}`,
    `- **Accepted**: ${accepted.length}`,
    `- **Disputed**: ${disputed.length}`,
    `- **Unaddressed**: ${unaddressed.length}`,
    `- **Context notes**: ${conversation.developerContext.additionalContext.length}`,
    `- **State**: ${conversation.state}`,
  ];

  if (unaddressed.length > 0) {
    parts.push("", "### Unaddressed Findings");
    for (const f of unaddressed) {
      parts.push(`- **${f.ruleId}** (${f.severity}): ${f.title}`);
    }
  }

  if (disputed.length > 0) {
    parts.push("", "### Disputed Findings");
    for (const f of disputed) {
      const reason = conversation.developerContext.explanations.get(f.ruleId);
      parts.push(`- **${f.ruleId}**: ${reason || "(no reason given)"}`);
    }
  }

  return parts.join("\n");
}

function handleGeneralMessage(conversation: ReviewConversation, _content: string): string {
  const { unaddressed } = getOutstandingFindings(conversation);
  if (unaddressed.length === 0) {
    return "All findings have been addressed. The review is complete.";
  }
  return `${unaddressed.length} finding(s) still need attention. You can \`explain\`, \`dispute\`, or \`accept\` each one.`;
}
