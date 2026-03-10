import type { Finding } from "../types.js";
import { getLangLineNumbers, getLineNumbers, getLangFamily, isCommentLine, testCode } from "./shared.js";
import * as LP from "../language-patterns.js";

export function analyzeTesting(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "TEST";
  let ruleNum = 1;
  const _lang = getLangFamily(language);

  // Detect test files with no assertions (multi-language)
  // For JS/TS, require at least 2 of (describe, it, test) to avoid false
  // positives on browser code where `it` is a common iterator variable name.
  const jsTestSignals = [/\bdescribe\s*\(/i.test(code), /\bit\s*\(/i.test(code), /\btest\s*\(/i.test(code)].filter(
    Boolean,
  ).length;
  const hasTestStructure =
    jsTestSignals >= 2 ||
    testCode(code, /def\s+test_|@Test|#\[test\]|#\[cfg\(test\)\]|func\s+Test[A-Z]|\[Fact\]|\[Theory\]|@pytest/i);
  if (hasTestStructure) {
    // Check for assertions (multi-language)
    const assertionLines = getLangLineNumbers(code, language, LP.ASSERTION);

    const testBlockLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (
        /\b(?:it|test)\s*\(\s*["'`]/i.test(line) ||
        /def\s+test_/i.test(line) ||
        /@Test/i.test(line) ||
        /func\s+Test[A-Z]/i.test(line) ||
        /#\[test\]/i.test(line) ||
        /\[Fact\]/i.test(line)
      ) {
        testBlockLines.push(i + 1);
      }
    });

    if (testBlockLines.length > 0 && assertionLines.length === 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Test cases with no assertions",
        description:
          "Tests without assertions always pass and provide no verification. They give false confidence in code correctness.",
        lineNumbers: testBlockLines,
        recommendation:
          "Add meaningful assertions to every test case. Each test should verify at least one expected behavior.",
        reference: "Unit Testing Best Practices",
        suggestedFix:
          "Add at least one `expect(...)` / `assert` / `Assert.*` call in each test verifying the expected return value, state change, or thrown error.",
        confidence: 0.7,
      });
    }

    // Detect overly broad test names
    const vagueTestLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (/(?:it|test)\s*\(\s*["'`](test\s+\w+|works|it works|should work|test \d+|basic test)["'`]/i.test(line)) {
        vagueTestLines.push(i + 1);
      }
    });
    if (vagueTestLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Vague test names",
        description:
          "Test names like 'works' or 'test 1' don't describe what behavior is being verified, making test failures harder to diagnose.",
        lineNumbers: vagueTestLines,
        recommendation:
          "Use descriptive test names that explain the scenario and expected outcome: 'should return 404 when user not found'.",
        reference: "Test Naming Conventions",
        suggestedFix:
          "Rename each test to follow the pattern `should <expected behavior> when <scenario>` (e.g., `'should throw ValidationError when email is empty'`).",
        confidence: 0.85,
      });
    }

    // Detect hardcoded test data that might be brittle
    const hardcodedDateLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (/["'`]20[2-3]\d-[01]\d-[0-3]\d/i.test(line) && !/mock|stub|fixture/i.test(line)) {
        hardcodedDateLines.push(i + 1);
      }
    });
    if (hardcodedDateLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Hardcoded dates in tests",
        description: "Hardcoded dates in tests can become stale and cause intermittent failures as time passes.",
        lineNumbers: hardcodedDateLines,
        recommendation:
          "Use relative dates, time-freezing libraries (sinon.useFakeTimers, freezegun), or inject clock dependencies.",
        reference: "Testing Best Practices: Time-Dependent Tests",
        suggestedFix:
          "Replace hardcoded date strings with a helper like `new Date()` offset or use `jest.useFakeTimers()` / `freezegun.freeze_time()` to control the clock in tests.",
        confidence: 0.85,
      });
    }

    // Detect tests with external dependencies (multi-language)
    const externalDepLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      const trimmed = line.trim();
      // Skip comment lines — doc blocks mentioning HttpClient/database are not real calls
      if (/^\/\/|^\*|^\/\*|^#(?!\[)|^"""|^'''/.test(trimmed)) return;
      // Skip function/method declarations & DI parameter defaults — these define
      // the interface, not actual external calls (e.g., createEgressAwareHttpClient(httpClient = null))
      if (/^\s*(?:export\s+)?(?:function|class|const|let|var|def|fn|func|async\s+function)\s/i.test(line)) return;
      // Skip test framework calls (describe/it/test labels often contain class names)
      if (/^\s*(?:describe|it|test|context)\s*\(/i.test(trimmed)) return;
      // Skip lines that are assigning/falling-back to an injected dependency
      if (/=\s*(?:httpClient|client|db|database|redis)\b/i.test(line) && /\|\||null|undefined|=\s*null/i.test(line))
        return;
      if (
        /fetch\s*\(|axios\.|https?:\/\/|\bdatabase\b|\bredis\b|\bmongodb\b|requests\.|reqwest::|(?<![a-zA-Z])HttpClient(?![a-zA-Z])|http\.Get/i.test(
          line,
        ) &&
        !/mock|stub|fake|spy|nock|msw|Mock|patch|@patch|mockito|Moq/i.test(line)
      ) {
        externalDepLines.push(i + 1);
      }
    });
    if (externalDepLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Tests with real external dependencies",
        description:
          "Tests that call real external services or databases are slow, flaky, and may fail due to network issues or service unavailability.",
        lineNumbers: externalDepLines,
        recommendation:
          "Mock external dependencies using test doubles (jest.mock, sinon, nock, msw, unittest.mock, mockito, Moq, httptest). Use in-memory databases for integration tests.",
        reference: "Test Doubles: Mocks, Stubs, and Fakes",
        suggestedFix:
          "Wrap the external call behind an interface and inject a mock/stub in the test (e.g., `jest.mock('./httpClient')` or `@patch('requests.get')`).",
        confidence: 0.8,
      });
    }

    // Detect tests with shared mutable state
    const sharedStateLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (
        /(?:let|var)\s+\w+\s*=/i.test(line.trim()) &&
        !/(?:const|it\s*\(|test\s*\(|describe\s*\()/i.test(line.trim())
      ) {
        const context = lines.slice(Math.max(0, i - 5), i).join("\n");
        if (/describe\s*\(/i.test(context) && !/beforeEach|beforeAll|setUp/i.test(context)) {
          sharedStateLines.push(i + 1);
        }
      }
    });
    if (sharedStateLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Shared mutable state between tests",
        description:
          "Mutable variables declared in describe blocks but not reset in beforeEach can cause test order dependencies and flaky results.",
        lineNumbers: sharedStateLines,
        recommendation:
          "Initialize mutable test state in beforeEach/setUp hooks, or use const for immutable test data.",
        reference: "Test Isolation Best Practices",
        suggestedFix:
          "Move the `let` declaration inside a `beforeEach` (or `setUp`) block so each test starts with a fresh instance of the variable.",
        confidence: 0.75,
      });
    }

    // Detect tests without error case coverage
    const happyPathOnly =
      testCode(code, /test|it\b/i) &&
      !testCode(code, /error|throw|reject|fail|invalid|unauthorized|not found|exception/i);
    if (happyPathOnly && testBlockLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Tests cover only happy path",
        description:
          "No error, exception, or edge case tests detected. Tests should cover both success and failure scenarios.",
        recommendation:
          "Add tests for error cases, boundary conditions, invalid inputs, and edge cases. Test both what it does and what it prevents.",
        reference: "Test Coverage: Error Paths",
        suggestedFix:
          "Add dedicated test cases that pass invalid/empty input and assert the expected error, rejection, or exception is thrown.",
        confidence: 0.7,
      });
    }

    // Detect sleep/wait in tests (multi-language)
    const sleepLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (
        /(?:sleep|setTimeout|Thread\.sleep|time\.sleep|delay|tokio::time::sleep|std::thread::sleep|Task\.Delay)\s*\(\s*\d/i.test(
          line,
        )
      ) {
        sleepLines.push(i + 1);
      }
    });
    if (sleepLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Arbitrary sleep/delay in tests",
        description:
          "Using sleep/setTimeout in tests makes them slow and flaky — the timing may not be sufficient on slow CI machines.",
        lineNumbers: sleepLines,
        recommendation:
          "Use waitFor, polling, or event-based assertions instead of arbitrary delays. Use fake timers for timer-dependent logic.",
        reference: "Testing Library waitFor / Flaky Test Prevention",
        suggestedFix:
          "Replace `sleep()`/`setTimeout()` with `await waitFor(() => expect(...))` or use `jest.useFakeTimers()` / `sinon.useFakeTimers()` to advance time deterministically.",
        confidence: 0.85,
      });
    }

    // Detect overly large test files
    if (lines.length > 500) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Test file is very large",
        description: `Test file has ${lines.length} lines. Very large test files are hard to navigate and may indicate the test subject needs refactoring.`,
        recommendation:
          "Split test files by feature or behavior. Consider if the production code under test should be broken into smaller modules.",
        reference: "Test Organization Best Practices",
        suggestedFix:
          "Extract related `describe` blocks into separate test files grouped by feature (e.g., `auth.test.ts`, `payments.test.ts`) to keep each file under ~300 lines.",
        confidence: 0.9,
      });
    }

    // Detect snapshot overuse
    const snapshotLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      if (/toMatchSnapshot|toMatchInlineSnapshot/i.test(line)) {
        snapshotLines.push(i + 1);
      }
    });

    // Detect tautological / empty assertions (always-pass)
    const tautologyLines: number[] = [];
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      const trimmed = line.trim();
      if (
        // JS/TS: expect(true).toBe(true), expect(1).toBe(1), expect(false).toBe(false)
        /expect\s*\(\s*(?:true|false|1|0|null|undefined|''|"")\s*\)\s*\.toBe\s*\(\s*(?:true|false|1|0|null|undefined|''|"")\s*\)/i.test(
          trimmed,
        ) ||
        // JS/TS: expect(true).toBeTruthy(), expect(1).toBeTruthy()
        /expect\s*\(\s*(?:true|1|"[^"]+"|'[^']+')\s*\)\s*\.toBeTruthy\s*\(\s*\)/i.test(trimmed) ||
        // Python: assert True, self.assertTrue(True)
        /^\s*assert\s+True\s*$/i.test(trimmed) ||
        /self\.assertTrue\s*\(\s*True\s*\)/i.test(trimmed) ||
        // C#/Java: Assert.True(true), Assert.AreEqual(1, 1)
        /Assert\.(?:True|IsTrue)\s*\(\s*true\s*\)/i.test(trimmed) ||
        /Assert\.AreEqual\s*\(\s*(\d+|true|false)\s*,\s*\1\s*\)/i.test(trimmed)
      ) {
        tautologyLines.push(i + 1);
      }
    });
    if (tautologyLines.length > 0) {
      ruleNum++;
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "high",
        title: "Tautological assertions (always pass)",
        description:
          "Assertions that compare a literal to itself (e.g., `expect(true).toBe(true)`) always pass and test nothing. They create an illusion of coverage without verifying any behavior.",
        lineNumbers: tautologyLines,
        recommendation:
          "Replace tautological assertions with assertions against actual computed values from the code under test.",
        reference: "Unit Testing Anti-Patterns: Tautological Tests",
        suggestedFix:
          "Replace `expect(true).toBe(true)` with an assertion that tests the actual result, e.g., `expect(result.isValid).toBe(true)`.",
        confidence: 0.95,
      });
    }

    // Detect over-mocking (more mock setups than test cases)
    const mockSetupCount = (
      code.match(
        /jest\.mock\s*\(|jest\.fn\s*\(|sinon\.stub\s*\(|sinon\.mock\s*\(|vi\.mock\s*\(|vi\.fn\s*\(|@patch\s*\(|mock\.\w+\.return_value|mockImplementation\s*\(|spyOn\s*\(/gi,
      ) || []
    ).length;
    const testCaseCount = testBlockLines.length;
    if (mockSetupCount > 0 && testCaseCount > 0 && mockSetupCount > testCaseCount * 3) {
      ruleNum++;
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "medium",
        title: "Excessive mocking relative to test count",
        description: `Found ${mockSetupCount} mock setups for ${testCaseCount} test case(s). Excessive mocking often means tests are coupled to implementation details rather than behavior.`,
        recommendation:
          "Reduce mocking by testing through public interfaces. Consider integration tests for heavily-mocked units. Prefer dependency injection over patching.",
        reference: "Test Doubles Best Practices / Over-Mocking Anti-Pattern",
        suggestedFix:
          "Extract shared mock setups into a `beforeEach` block, eliminate mocks for internal implementation details, and test behavior through public APIs.",
        confidence: 0.7,
      });
    }
    if (snapshotLines.length > 5) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "low",
        title: "Heavy reliance on snapshot testing",
        description:
          "Many snapshot assertions detected. Snapshot tests are brittle, produce large diffs, and can be blindly updated without review.",
        lineNumbers: snapshotLines.slice(0, 5),
        recommendation:
          "Prefer explicit assertions for logic. Use snapshots sparingly for UI structure. Review snapshot updates carefully.",
        reference: "Snapshot Testing Best Practices",
        suggestedFix:
          "Replace `toMatchSnapshot()` with targeted assertions (e.g., `expect(result.status).toBe(200)`) and reserve snapshots only for large UI structure comparisons.",
        confidence: 0.9,
      });
    }

    // Detect happy-path-only testing (no error/edge scenarios)
    const hasErrorTests =
      /(?:error|fail|invalid|reject|throw|exception|edge.?case|boundary|negative|unhappy|bad.?input|malformed|missing|null|undefined|empty|overflow|timeout)/i.test(
        code,
      );
    const hasOnlySuccessTests =
      /(?:success|happy|valid|correct|should\s+(?:return|work|pass|succeed|create|get))/i.test(code);
    if (testCaseCount >= 3 && !hasErrorTests && hasOnlySuccessTests) {
      ruleNum++;
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "medium",
        title: "Tests cover only happy path",
        description:
          `Found ${testCaseCount} test cases but none appear to test error conditions, invalid inputs, or edge cases. ` +
          "AI-generated tests frequently omit negative test scenarios.",
        recommendation:
          "Add tests for: invalid/missing inputs, error responses, boundary values, concurrent access, and timeout scenarios.",
        reference: "Test Coverage — Happy Path vs Edge Cases",
        suggestedFix:
          "Add test cases like: `it('should throw on invalid input', ...)`, `it('should handle empty array', ...)`, `it('should reject unauthorized requests', ...)`.",
        confidence: 0.65,
      });
    }

    // Detect tests that only assert response status without checking body
    const statusOnlyLines: number[] = [];
    lines.forEach((line, i) => {
      if (
        /\.(?:status|statusCode)\s*\)\s*\.toBe\s*\(\s*200\s*\)/.test(line) ||
        /assert.*status.*(?:==|===)\s*200/.test(line) ||
        /expect\(.*\.status\)/.test(line)
      ) {
        statusOnlyLines.push(i + 1);
      }
    });
    if (statusOnlyLines.length >= 3 && assertionLines.length <= statusOnlyLines.length + 2) {
      ruleNum++;
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "medium",
        title: "Tests only verify HTTP status codes",
        description:
          "Tests primarily assert response status codes without verifying response bodies, headers, or side effects. " +
          "AI code generators often produce API tests that check only `status: 200` without verifying the actual response data.",
        lineNumbers: statusOnlyLines.slice(0, 5),
        recommendation:
          "Assert on response body content, data structure, and side effects. Check for correct error messages, pagination, and data transformations.",
        confidence: 0.6,
      });
    }
  } else {
    // No test structure detected - check if this is production code without tests
    // Exclude config files, type definitions, constants, and utility barrel files
    const hasFunctions = getLangLineNumbers(code, language, LP.FUNCTION_DEF).length > 0;
    const isLargeFile = lines.length > 20;
    // Check only the file header (first 5 lines) for module-purpose indicators
    // to avoid matching incidental mentions like `const config = ...` in code body
    const headerText = lines.slice(0, 5).join("\n");
    const isConfigOrUtility =
      /(?:config|configuration|settings|constants|types|interfaces|models|schema|migration|seed|fixture|mock|stub|setup|index|barrel|util|utils|helper|helpers|lib|shared|common)\b/gi.test(
        headerText,
      );
    const isTypeDefinitionFile =
      testCode(code, /^(?:export\s+)?(?:type|interface|enum|declare)\s+/gim) &&
      !testCode(code, /(function|class)\s+\w+.*\{[\s\S]{10,}\}/gi);
    const hasMinimalLogic = (code.match(/(?:if|for|while|switch|match)\s*[\s(]/g) || []).length >= 3;
    // Suppress for code-analysis / evaluator modules (many regex .test() calls or regex literals)
    const regexTestCalls = (code.match(/\.test\s*\(/g) || []).length;
    const isAnalysisModule = regexTestCalls >= 8;
    if (
      hasFunctions &&
      isLargeFile &&
      hasMinimalLogic &&
      !isConfigOrUtility &&
      !isTypeDefinitionFile &&
      !isAnalysisModule
    ) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum).padStart(3, "0")}`,
        severity: "medium",
        title: "No tests detected for production code",
        description:
          "This file contains significant logic (multiple branches/loops) but no accompanying tests were detected.",
        lineNumbers: getLineNumbers(
          code,
          /(?:export\s+)?(?:async\s+)?function\s+\w+|(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\(|function)/gi,
        ).slice(0, 5),
        recommendation:
          "Write unit tests covering the main functions, edge cases, and error paths. Aim for meaningful coverage of critical paths.",
        reference: "Test-Driven Development / Testing Pyramid",
        suggestedFix:
          "Create a co-located test file (e.g., `<filename>.test.ts`) with at least one test per exported function covering a happy path, an edge case, and an error path.",
        confidence: 0.7,
      });
    }
  }

  return findings;
}
