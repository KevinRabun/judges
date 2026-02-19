import { Finding } from "../types.js";
import { getLineNumbers } from "./shared.js";

export function analyzeTesting(code: string, language: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");
  const prefix = "TEST";
  let ruleNum = 1;

  // Detect test files with no assertions
  const hasTestStructure = /describe\s*\(|it\s*\(|test\s*\(|def\s+test_|@Test/i.test(code);
  if (hasTestStructure) {
    // Check for assertions
    const assertionLines: number[] = [];
    lines.forEach((line, i) => {
      if (/expect\s*\(|assert|should\.|\.to\.|\.toBe|\.toEqual|\.toThrow|assertEqual|assertTrue|verify/i.test(line)) {
        assertionLines.push(i + 1);
      }
    });

    const testBlockLines: number[] = [];
    lines.forEach((line, i) => {
      if (/\b(?:it|test)\s*\(\s*["'`]/i.test(line)) {
        testBlockLines.push(i + 1);
      }
    });

    if (testBlockLines.length > 0 && assertionLines.length === 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "critical",
        title: "Test cases with no assertions",
        description: "Tests without assertions always pass and provide no verification. They give false confidence in code correctness.",
        lineNumbers: testBlockLines,
        recommendation: "Add meaningful assertions to every test case. Each test should verify at least one expected behavior.",
        reference: "Unit Testing Best Practices",
      });
    }

    // Detect overly broad test names
    const vagueTestLines: number[] = [];
    lines.forEach((line, i) => {
      if (/(?:it|test)\s*\(\s*["'`](test\s+\w+|works|it works|should work|test \d+|basic test)["'`]/i.test(line)) {
        vagueTestLines.push(i + 1);
      }
    });
    if (vagueTestLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Vague test names",
        description: "Test names like 'works' or 'test 1' don't describe what behavior is being verified, making test failures harder to diagnose.",
        lineNumbers: vagueTestLines,
        recommendation: "Use descriptive test names that explain the scenario and expected outcome: 'should return 404 when user not found'.",
        reference: "Test Naming Conventions",
      });
    }

    // Detect hardcoded test data that might be brittle
    const hardcodedDateLines: number[] = [];
    lines.forEach((line, i) => {
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
        recommendation: "Use relative dates, time-freezing libraries (sinon.useFakeTimers, freezegun), or inject clock dependencies.",
        reference: "Testing Best Practices: Time-Dependent Tests",
      });
    }

    // Detect tests with external dependencies
    const externalDepLines: number[] = [];
    lines.forEach((line, i) => {
      if (/fetch\s*\(|axios\.|https?:\/\/|database|redis|mongodb/i.test(line) && !/mock|stub|fake|spy|nock|msw/i.test(line)) {
        externalDepLines.push(i + 1);
      }
    });
    if (externalDepLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Tests with real external dependencies",
        description: "Tests that call real external services or databases are slow, flaky, and may fail due to network issues or service unavailability.",
        lineNumbers: externalDepLines,
        recommendation: "Mock external dependencies using test doubles (jest.mock, sinon, nock, msw). Use in-memory databases for integration tests.",
        reference: "Test Doubles: Mocks, Stubs, and Fakes",
      });
    }

    // Detect tests with shared mutable state
    const sharedStateLines: number[] = [];
    lines.forEach((line, i) => {
      if (/(?:let|var)\s+\w+\s*=/i.test(line.trim()) && !/(?:const|it\s*\(|test\s*\(|describe\s*\()/i.test(line.trim())) {
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
        description: "Mutable variables declared in describe blocks but not reset in beforeEach can cause test order dependencies and flaky results.",
        lineNumbers: sharedStateLines,
        recommendation: "Initialize mutable test state in beforeEach/setUp hooks, or use const for immutable test data.",
        reference: "Test Isolation Best Practices",
      });
    }

    // Detect tests without error case coverage
    const happyPathOnly = /test|it\b/i.test(code) && !/error|throw|reject|fail|invalid|unauthorized|not found|exception/i.test(code);
    if (happyPathOnly && testBlockLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Tests cover only happy path",
        description: "No error, exception, or edge case tests detected. Tests should cover both success and failure scenarios.",
        recommendation: "Add tests for error cases, boundary conditions, invalid inputs, and edge cases. Test both what it does and what it prevents.",
        reference: "Test Coverage: Error Paths",
      });
    }

    // Detect sleep/wait in tests
    const sleepLines: number[] = [];
    lines.forEach((line, i) => {
      if (/(?:sleep|setTimeout|Thread\.sleep|time\.sleep|delay)\s*\(\s*\d/i.test(line)) {
        sleepLines.push(i + 1);
      }
    });
    if (sleepLines.length > 0) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "Arbitrary sleep/delay in tests",
        description: "Using sleep/setTimeout in tests makes them slow and flaky — the timing may not be sufficient on slow CI machines.",
        lineNumbers: sleepLines,
        recommendation: "Use waitFor, polling, or event-based assertions instead of arbitrary delays. Use fake timers for timer-dependent logic.",
        reference: "Testing Library waitFor / Flaky Test Prevention",
      });
    }

    // Detect overly large test files
    if (lines.length > 500) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Test file is very large",
        description: `Test file has ${lines.length} lines. Very large test files are hard to navigate and may indicate the test subject needs refactoring.`,
        recommendation: "Split test files by feature or behavior. Consider if the production code under test should be broken into smaller modules.",
        reference: "Test Organization Best Practices",
      });
    }

    // Detect snapshot overuse
    const snapshotLines: number[] = [];
    lines.forEach((line, i) => {
      if (/toMatchSnapshot|toMatchInlineSnapshot/i.test(line)) {
        snapshotLines.push(i + 1);
      }
    });
    if (snapshotLines.length > 5) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "low",
        title: "Heavy reliance on snapshot testing",
        description: "Many snapshot assertions detected. Snapshot tests are brittle, produce large diffs, and can be blindly updated without review.",
        lineNumbers: snapshotLines.slice(0, 5),
        recommendation: "Prefer explicit assertions for logic. Use snapshots sparingly for UI structure. Review snapshot updates carefully.",
        reference: "Snapshot Testing Best Practices",
      });
    }
  } else {
    // No test structure detected - check if this is production code without tests
    const hasFunctions = /function\s+\w+|=>\s*\{|def\s+\w+|public\s+\w+\s+\w+\s*\(/i.test(code);
    const isLargeFile = lines.length > 50;
    if (hasFunctions && isLargeFile) {
      findings.push({
        ruleId: `${prefix}-${String(ruleNum++).padStart(3, "0")}`,
        severity: "medium",
        title: "No tests detected for production code",
        description: "This file contains significant logic but no accompanying tests were detected.",
        recommendation: "Write unit tests covering the main functions, edge cases, and error paths. Aim for meaningful coverage of critical paths.",
        reference: "Test-Driven Development / Testing Pyramid",
      });
    }
  }

  return findings;
}
