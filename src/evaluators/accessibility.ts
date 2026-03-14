import type { Finding } from "../types.js";
import { getLangFamily, isCommentLine, testCode, isLikelyAnalysisCode } from "./shared.js";

export function analyzeAccessibility(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "A11Y";
  let ruleNum = 1;
  const _lang = getLangFamily(language);

  // Analysis code references ARIA, form, and HTML patterns in regex
  // for detection purposes — these are not actual accessibility issues.
  if (isLikelyAnalysisCode(code)) return findings;

  // Detect images without alt attributes
  // File-level check: if the file constructs ARIA helpers or accessibility utilities,
  // it is *building* accessible components rather than rendering inaccessible content.
  const isAriaHelperFile =
    /(?:createAccessible|ariaHelper|buildAria|aria.*Util|a11y.*(?:util|helper|props|component)|getAltText|accessibilityLabel|makeAccessible|addA11yProps|setAriaAttributes|withAccessibility)/i.test(
      code,
    );
  const imgNoAltLines: number[] = [];
  if (!isAriaHelperFile) {
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      // Skip lines where <img appears inside a regex or string pattern definition
      if (/\/[^/\n]+\/[gimsuy]*/.test(line) && /\.test\s*\(|\.match\s*\(|new\s+RegExp/i.test(line)) return;
      if (/<img\b/i.test(line) && !/alt\s*=/i.test(line)) {
        imgNoAltLines.push(i + 1);
      }
    });
  }
  if (imgNoAltLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Image missing alt attribute",
      description: "Images must have descriptive alt text for screen readers and assistive technologies.",
      lineNumbers: imgNoAltLines,
      recommendation:
        'Add meaningful alt text describing the image content. Use alt="" only for purely decorative images.',
      reference: "WCAG 2.1 SC 1.1.1 Non-text Content",
      suggestedFix:
        'Add descriptive alt text: <img src="photo.jpg" alt="Team photo at annual conference"> or alt="" for decorative images.',
      confidence: 0.85,
    });
  }

  // Detect click handlers without keyboard equivalents
  // Native interactive elements (<button>, <a>, <input>, <select>, <textarea>)
  // already support keyboard interaction, so only flag non-interactive elements.
  const clickNoKeyLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/onClick/i.test(line) && !/onKeyDown|onKeyUp|onKeyPress/i.test(line)) {
      // Skip native interactive elements — they inherently handle keyboard events
      if (/<(?:button|a\b|input|select|textarea)\b/i.test(line)) return;
      clickNoKeyLines.push(i + 1);
    }
  });
  if (clickNoKeyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Click handler without keyboard equivalent",
      description:
        "Interactive elements with onClick must also support keyboard interaction for users who cannot use a mouse.",
      lineNumbers: clickNoKeyLines,
      recommendation:
        "Add onKeyDown or onKeyPress handlers alongside onClick. Ensure all interactive elements are keyboard accessible.",
      reference: "WCAG 2.1 SC 2.1.1 Keyboard",
      suggestedFix:
        "Add keyboard support: <button onClick={handler} onKeyDown={(e) => e.key === 'Enter' && handler()}> or use native <button> elements which handle this automatically.",
      confidence: 0.75,
    });
  }

  // Detect non-semantic elements used for structure
  const nonSemanticLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<div\b/i.test(line) && /role\s*=\s*["'](button|link|heading|navigation|main)/i.test(line)) {
      nonSemanticLines.push(i + 1);
    }
  });
  if (nonSemanticLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Non-semantic element used with ARIA role",
      description:
        "Using div with an ARIA role instead of the appropriate semantic HTML element reduces accessibility and adds unnecessary complexity.",
      lineNumbers: nonSemanticLines,
      recommendation: "Use semantic HTML elements (button, a, h1-h6, nav, main) instead of divs with ARIA roles.",
      reference: "WCAG 2.1 SC 4.1.2 Name, Role, Value",
      suggestedFix:
        'Replace <div role="button"> with <button>, <div role="link"> with <a href>, <div role="navigation"> with <nav>, etc.',
      confidence: 0.85,
    });
  }

  // Detect missing form labels
  const inputNoLabelLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<input\b/i.test(line) && !/type\s*=\s*["']hidden/i.test(line)) {
      // Collect the full tag for multi-line JSX (attributes may span several lines)
      let fullTag = line;
      if (!/[/]?>/.test(line)) {
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          fullTag += " " + lines[j];
          if (/[/]?>/.test(lines[j])) break;
        }
      }
      if (!/aria-label|aria-labelledby|id\s*=/i.test(fullTag)) {
        inputNoLabelLines.push(i + 1);
      }
    }
  });
  if (inputNoLabelLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Form input missing label association",
      description: "Form inputs without associated labels are inaccessible to screen reader users.",
      lineNumbers: inputNoLabelLines,
      recommendation: "Associate each input with a <label> element using for/id, or use aria-label / aria-labelledby.",
      reference: "WCAG 2.1 SC 1.3.1 Info and Relationships",
      suggestedFix:
        'Associate labels: <label htmlFor="email">Email</label><input id="email"> or use aria-label={"Email address"} directly on the input.',
      confidence: 0.85,
    });
  }

  // Detect tabIndex > 0
  const tabIndexLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/tabIndex\s*=\s*{?\s*[1-9]/i.test(line) || /tabindex\s*=\s*["'][1-9]/i.test(line)) {
      tabIndexLines.push(i + 1);
    }
  });
  if (tabIndexLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Positive tabIndex used",
      description:
        "Using positive tabIndex values disrupts the natural tab order and creates confusing navigation for keyboard users.",
      lineNumbers: tabIndexLines,
      recommendation:
        "Use tabIndex={0} to add to natural tab order or tabIndex={-1} for programmatic focus only. Never use positive values.",
      reference: "WCAG 2.1 SC 2.4.3 Focus Order",
      suggestedFix:
        "Replace tabIndex={5} with tabIndex={0} to add to natural tab order, or tabIndex={-1} for programmatic focus only.",
      confidence: 0.9,
    });
  }

  // Detect color-only status indicators
  const colorOnlyLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /color\s*[:=].*(?:red|green|#f00|#0f0|#ff0000|#00ff00)/i.test(line) &&
      /(?:status|error|success|warning|valid|invalid)/i.test(line)
    ) {
      colorOnlyLines.push(i + 1);
    }
  });
  if (colorOnlyLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Possible color-only status indication",
      description:
        "Relying solely on color to convey status information excludes users with color vision deficiencies.",
      lineNumbers: colorOnlyLines,
      recommendation: "Use text labels, icons, or patterns in addition to color to convey status information.",
      reference: "WCAG 2.1 SC 1.4.1 Use of Color",
      suggestedFix:
        'Add text or icon alongside color: <span className="error"><ErrorIcon /> {errorMessage}</span> instead of relying on red color alone.',
      confidence: 0.75,
    });
  }

  // Detect autoplay media
  const autoplayLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/autoplay|autoPlay/i.test(line)) {
      autoplayLines.push(i + 1);
    }
  });
  if (autoplayLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Auto-playing media detected",
      description:
        "Auto-playing audio or video can be disorienting for screen reader users and those with cognitive disabilities.",
      lineNumbers: autoplayLines,
      recommendation: "Avoid autoplay or provide a mechanism to pause/stop/mute within the first 3 seconds.",
      reference: "WCAG 2.1 SC 1.4.2 Audio Control",
      suggestedFix:
        "Remove autoplay or add muted: <video muted autoPlay> and provide visible pause/stop controls within the first 3 seconds.",
      confidence: 0.9,
    });
  }

  // Missing lang attribute on html element
  const htmlNoLangLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<html\b/i.test(line) && !/lang\s*=/i.test(line)) {
      htmlNoLangLines.push(i + 1);
    }
  });
  if (htmlNoLangLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Missing lang attribute on <html>",
      description:
        "The html element must have a lang attribute so screen readers pronounce content in the correct language.",
      lineNumbers: htmlNoLangLines,
      recommendation: 'Add lang attribute: <html lang="en">. Use the appropriate BCP 47 language tag.',
      reference: "WCAG 2.1 SC 3.1.1 Language of Page",
      suggestedFix:
        'Add language attribute: <html lang="en"> using the appropriate BCP 47 language tag for your content.',
      confidence: 0.85,
    });
  }

  // Skip navigation link missing
  const hasNav = testCode(code, /<nav\b|role\s*=\s*["']navigation/i);
  const hasSkipLink = testCode(code, /skip.*nav|skip.*content|skipToContent|#main-content/i);
  if (hasNav && !hasSkipLink) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "No skip navigation link detected",
      description:
        "Pages with navigation should include a 'Skip to main content' link so keyboard users can bypass repetitive navigation.",
      recommendation: "Add a visually hidden 'Skip to main content' link as the first focusable element on the page.",
      reference: "WCAG 2.1 SC 2.4.1 Bypass Blocks",
      suggestedFix:
        'Add a skip link as the first focusable element: <a href="#main-content" className="sr-only focus:not-sr-only">Skip to main content</a>.',
      confidence: 0.7,
      isAbsenceBased: true,
    });
  }

  // Focus management — outline:none without replacement
  const outlineNoneLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/outline\s*:\s*(?:none|0)\b/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
      if (!/focus-visible|box-shadow|border.*focus|ring/i.test(context)) {
        outlineNoneLines.push(i + 1);
      }
    }
  });
  if (outlineNoneLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Focus indicator removed (outline: none)",
      description:
        "Removing the focus outline without providing an alternative focus indicator makes the page unusable for keyboard users.",
      lineNumbers: outlineNoneLines,
      recommendation:
        "If removing outline, provide a visible alternative focus indicator (box-shadow, border, custom :focus-visible styles).",
      reference: "WCAG 2.1 SC 2.4.7 Focus Visible",
      suggestedFix:
        "Provide alternative focus styles: :focus-visible { outline: 2px solid #4A90D9; outline-offset: 2px; } instead of outline: none.",
      confidence: 0.85,
    });
  }

  // Missing ARIA live regions for dynamic content
  const dynamicUpdateLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    const trimmed = line.trim();
    if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
    if (
      /(?:toast|notification|alert|snackbar|banner)\s*[=(]/i.test(line) ||
      /setState.*(?:error|message|notification)/i.test(line)
    ) {
      dynamicUpdateLines.push(i + 1);
    }
  });
  const hasAriaLive = testCode(code, /aria-live|role\s*=\s*["'](?:alert|status|log)/i);
  if (dynamicUpdateLines.length > 0 && !hasAriaLive) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Dynamic content updates without ARIA live region",
      description:
        "Dynamic notifications, toasts, or alerts must use aria-live regions so screen readers announce them.",
      lineNumbers: dynamicUpdateLines.slice(0, 5),
      recommendation: "Wrap dynamic notification areas with aria-live='polite' (or role='alert' for urgent messages).",
      reference: "WCAG 2.1 SC 4.1.3 Status Messages",
      suggestedFix:
        'Wrap notification areas: <div aria-live="polite" role="status">{statusMessage}</div> or use role="alert" for urgent messages.',
      confidence: 0.7,
    });
  }

  // Heading hierarchy issues
  const headingLevels: { level: number; line: number }[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    const match = line.match(/<h([1-6])\b/i);
    if (match) {
      headingLevels.push({ level: parseInt(match[1]), line: i + 1 });
    }
  });
  const skippedHeadingLines: number[] = [];
  for (let i = 1; i < headingLevels.length; i++) {
    if (headingLevels[i].level > headingLevels[i - 1].level + 1) {
      skippedHeadingLines.push(headingLevels[i].line);
    }
  }
  if (skippedHeadingLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Heading level skipped",
      description:
        "Heading levels should be sequential (h1->h2->h3). Skipping levels creates a confusing document hierarchy for assistive technology users.",
      lineNumbers: skippedHeadingLines,
      recommendation:
        "Use headings in sequential order. Don't skip from h1 to h3. Use CSS for visual styling instead of choosing heading levels by appearance.",
      reference: "WCAG 2.1 SC 1.3.1 Info and Relationships",
      suggestedFix:
        "Fix heading hierarchy: change <h3> to <h2> if its parent heading is <h1>. Use CSS for visual sizing instead of skipping heading levels.",
      confidence: 0.85,
    });
  }

  // Touch target size too small
  const smallTargetLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (
      /(?:width|height|size)\s*[:=]\s*(?:['"]?\d{1,2}(?:px)?['"]?|{\s*\d{1,2}\s*})/i.test(line) &&
      /(?:button|btn|icon|close|toggle|checkbox|radio)/i.test(line)
    ) {
      smallTargetLines.push(i + 1);
    }
  });
  if (smallTargetLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Interactive element may have small touch target",
      description:
        "Interactive elements with very small dimensions may not meet the 44x44px minimum touch target size.",
      lineNumbers: smallTargetLines,
      recommendation:
        "Ensure interactive elements have a minimum touch/click target size of 44x44 CSS pixels (WCAG) or 48x48dp (Material Design).",
      reference: "WCAG 2.1 SC 2.5.5 Target Size",
      suggestedFix:
        "Ensure minimum size: .icon-button { min-width: 44px; min-height: 44px; padding: 12px; } to meet WCAG touch target requirements.",
      confidence: 0.75,
    });
  }

  // Motion/animation without reduced-motion support
  const animationLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/animation\s*:|transition\s*:|@keyframes|animate\s*\(|gsap|framer-motion|\bspring\b/i.test(line)) {
      animationLines.push(i + 1);
    }
  });
  const hasReducedMotion = testCode(code, /prefers-reduced-motion|prefersReducedMotion|reducedMotion/i);
  if (animationLines.length > 0 && !hasReducedMotion) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Animations without reduced-motion support",
      description:
        "Animations can trigger vestibular disorders in some users. The prefers-reduced-motion media query should be respected.",
      lineNumbers: animationLines.slice(0, 5),
      recommendation:
        "Add @media (prefers-reduced-motion: reduce) { ... } to disable or simplify animations for users who prefer reduced motion.",
      reference: "WCAG 2.1 SC 2.3.3 Animation from Interactions",
      suggestedFix:
        "Add reduced motion support: @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }",
      confidence: 0.7,
    });
  }

  // Video/audio without captions/transcript
  const mediaLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<video\b|<audio\b|<iframe.*(?:youtube|vimeo)/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 5)).join("\n");
      if (!/track\b|caption|subtitle|transcript/i.test(context)) {
        mediaLines.push(i + 1);
      }
    }
  });
  if (mediaLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Media without captions or transcript",
      description:
        "Audio and video content must have captions (for deaf users) and ideally transcripts for full accessibility.",
      lineNumbers: mediaLines,
      recommendation:
        "Add <track kind='captions'> for videos, provide transcripts for audio, and ensure embedded videos have captions enabled.",
      reference: "WCAG 2.1 SC 1.2.2 Captions (Prerecorded)",
      suggestedFix:
        'Add captions track: <video><track kind="captions" src="captions.vtt" srclang="en" label="English" default></video>.',
      confidence: 0.85,
    });
  }

  // Form error messages not associated with inputs
  // Only apply to files that contain HTML/JSX rendering patterns — skip backend-only code
  const hasRenderingPatterns =
    /jsx|tsx|render\s*\(|createElement|dangerouslySetInnerHTML|className\s*=|htmlFor|aria-|role\s*=|<input|<form|<select|<textarea|<button|<div[\s>]|<span[\s>]|<p[\s>]|<h[1-6][\s>]|<img[\s>]|<table[\s>]|<label[\s>]/i.test(
      code,
    );
  const errorMsgLines: number[] = [];
  if (hasRenderingPatterns) {
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      const trimmed = line.trim();
      // Skip comment lines — doc blocks describing ARIA helpers are not violations
      if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
      // Skip function/class declarations — definitions are not rendering patterns
      if (/^\s*(?:export\s+)?(?:function|class|const|let|var|def|fn|func)\s/i.test(line)) return;
      if (
        /(?:error|invalid|validation).*(?:message|msg|text)/i.test(line) &&
        !/aria-describedby|aria-errormessage|aria-invalid/i.test(line)
      ) {
        errorMsgLines.push(i + 1);
      }
    });
  }
  if (errorMsgLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Form error not associated with input via ARIA",
      description:
        "Error messages near form inputs should be programmatically associated so screen readers announce them.",
      lineNumbers: errorMsgLines.slice(0, 5),
      recommendation:
        "Use aria-describedby to link error messages to inputs, and aria-invalid='true' on invalid inputs.",
      reference: "WCAG 2.1 SC 3.3.1 Error Identification",
      suggestedFix:
        'Associate errors with inputs: <input id="email" aria-describedby="email-error" aria-invalid="true"><span id="email-error">Invalid email</span>.',
      confidence: 0.75,
    });
  }

  // Links with vague text (click here, read more, etc.)
  const vagueLinkLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<a\b/i.test(line) && />\s*(?:click\s+here|read\s+more|here|more|learn\s+more|link)\s*</i.test(line)) {
      vagueLinkLines.push(i + 1);
    }
  });
  if (vagueLinkLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Link with vague or non-descriptive text",
      description:
        "Links with text like 'click here' or 'read more' are meaningless when listed out of context by screen readers.",
      lineNumbers: vagueLinkLines,
      recommendation: "Use descriptive link text that conveys the purpose of the link even when read out of context.",
      reference: "WCAG 2.1 SC 2.4.4 Link Purpose (In Context)",
      suggestedFix:
        'Replace <a href="...">click here</a> with <a href="...">View the accessibility guidelines</a> to convey link purpose.',
      confidence: 0.8,
    });
  }

  // Tables without headers (th) or scope attributes
  const tableLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/<table\b/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 20)).join("\n");
      if (!/<th\b/i.test(context) && !/role\s*=\s*["']presentation/i.test(line)) {
        tableLines.push(i + 1);
      }
    }
  });
  if (tableLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "medium",
      title: "Data table without header cells",
      description:
        "Data tables must use <th> elements with scope attributes so screen readers can associate data cells with their headers.",
      lineNumbers: tableLines,
      recommendation: "Add <th scope='col'> for column headers and <th scope='row'> for row headers in data tables.",
      reference: "WCAG 2.1 SC 1.3.1 Info and Relationships",
      suggestedFix:
        'Add table headers: <thead><tr><th scope="col">Name</th><th scope="col">Email</th></tr></thead> to associate data cells with headers.',
      confidence: 0.8,
    });
  }

  // Modal/dialog without focus trap
  const modalLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (/(?:modal|dialog|overlay|popup)\b/i.test(line) && /(?:open|show|visible|isOpen)/i.test(line)) {
      const context = lines.slice(i, Math.min(lines.length, i + 15)).join("\n");
      if (!/focusTrap|focus-trap|FocusLock|inert\b|aria-modal/i.test(context)) {
        modalLines.push(i + 1);
      }
    }
  });
  if (modalLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Modal/dialog without focus trap",
      description:
        "Modals and dialogs must trap focus inside them so keyboard users cannot tab behind the overlay to invisible content.",
      lineNumbers: modalLines.slice(0, 5),
      recommendation:
        "Implement a focus trap in modals using a library like focus-trap-react, or use the native <dialog> element with showModal().",
      reference: "WCAG 2.1 SC 2.4.3 Focus Order",
      suggestedFix:
        "Use native dialog: <dialog ref={dialogRef}> with dialogRef.current.showModal(), or add a focus-trap library to keep focus within the modal.",
      confidence: 0.75,
    });
  }

  // ARIA role conflicts — interactive role on non-focusable element without tabIndex
  const roleNoFocusLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (
      /role\s*=\s*["'](?:button|link|checkbox|tab|menuitem|option|switch|slider|textbox)\b/i.test(line) &&
      /<(?:div|span|li|p)\b/i.test(line) &&
      !/tabIndex|tabindex/i.test(line)
    ) {
      roleNoFocusLines.push(i + 1);
    }
  });
  if (roleNoFocusLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Interactive ARIA role without focusability",
      description:
        "Elements with interactive ARIA roles (button, link, etc.) must be focusable via tabIndex so keyboard users can reach them.",
      lineNumbers: roleNoFocusLines,
      recommendation:
        "Add tabIndex={0} to elements with interactive ARIA roles, or use the corresponding native element instead.",
      reference: "WCAG 2.1 SC 4.1.2 Name, Role, Value",
      suggestedFix:
        'Add focusability: <div role="button" tabIndex={0} onKeyDown={handler}> or preferably replace with <button>.',
      confidence: 0.85,
    });
  }

  // Inline event handlers without accessible name
  const noAccessNameLines: number[] = [];
  lines.forEach((line, i) => {
    if (isCommentLine(line)) return;
    if (
      /<(?:button|a)\b/i.test(line) &&
      /(?:onClick|href)/i.test(line) &&
      !/aria-label|aria-labelledby|title\s*=/i.test(line) &&
      />\s*<\s*(?:svg|img|i|icon|span\s*\/>)/i.test(line)
    ) {
      noAccessNameLines.push(i + 1);
    }
  });
  if (noAccessNameLines.length > 0) {
    findings.push({
      ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
      severity: "high",
      title: "Icon-only interactive element without accessible name",
      description:
        "Buttons or links containing only icons (SVG, img, or icon font) have no accessible name for screen readers.",
      lineNumbers: noAccessNameLines,
      recommendation:
        "Add aria-label or visually hidden text to provide an accessible name for icon-only interactive elements.",
      reference: "WCAG 2.1 SC 4.1.2 Name, Role, Value",
      suggestedFix:
        'Add accessible name: <button aria-label="Close"><svg>...</svg></button> or <button><span className="sr-only">Close</span><CloseIcon /></button>.',
      confidence: 0.85,
    });
  }

  // Missing landmark regions (no main, nav, or banner in page-level files)
  const isPageFile = /page|layout|app\.(tsx?|jsx?)|index\.(tsx?|jsx?|html)/i.test(language);
  if (isPageFile) {
    const hasMain = testCode(code, /<main\b|role\s*=\s*["']main/i);
    const hasLandmarks = testCode(
      code,
      /<nav\b|<header\b|<footer\b|<aside\b|role\s*=\s*["'](?:navigation|banner|contentinfo|complementary)/i,
    );
    if (!hasMain && !hasLandmarks && lines.length > 20) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "medium",
        title: "Page lacks landmark regions",
        description:
          "Page-level components should use landmark elements (main, nav, header, footer) so screen reader users can navigate efficiently.",
        recommendation:
          "Wrap primary content in <main>, navigation in <nav>, and page header/footer in <header>/<footer> elements.",
        reference: "WCAG 2.1 SC 1.3.1 Info and Relationships",
        suggestedFix:
          "Add landmarks: <header>...</header><nav>...</nav><main>...</main><footer>...</footer> to provide page structure for assistive technology.",
        confidence: 0.65,
        isAbsenceBased: true,
      });
    }
  }

  return findings;
}
