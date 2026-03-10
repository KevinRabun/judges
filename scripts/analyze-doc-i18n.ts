import { runBenchmarkSuite } from "../src/commands/benchmark.ts";
import { analyzeInternationalization } from "../src/evaluators/internationalization.ts";
import { analyzeDocumentation } from "../src/evaluators/documentation.ts";

const r = runBenchmarkSuite();

// Show missed I18N cases with details
console.log("Missed I18N cases analysis:");
const i18nCases = r.cases.filter((c: any) => c.expectedRuleIds?.some((id: string) => id.startsWith("I18N-")));
for (const c of i18nCases) {
  const ca = c as any;
  const detected = ca.detectedRuleIds?.filter((id: string) => id.startsWith("I18N-")) ?? [];
  if (detected.length === 0) {
    if (!ca.code) {
      console.log(`  ${ca.caseId}: NO CODE`);
      continue;
    }
    // Try running the evaluator to see how close it gets
    const findings = analyzeInternationalization(ca.code, ca.language);
    const lines = ca.code.split("\n");

    // Check hardcoded strings
    let hardcodedCount = 0;
    lines.forEach((line: string) => {
      if (/>[\s]*[A-Z][a-z]+[\s\w]+<\//i.test(line) && !/translate|t\(|i18n|intl|formatMessage/i.test(line)) {
        hardcodedCount++;
      }
      if (
        /(?:label|title|placeholder|aria-label)\s*[=:]\s*["'`][A-Z]/i.test(line) &&
        !/translate|t\(|i18n|intl|formatMessage/i.test(line) &&
        !/(?:FastAPI|Flask|App|Blueprint|Swagger|OpenAPI|APIRouter)\s*\(/i.test(line)
      ) {
        hardcodedCount++;
      }
    });

    console.log(
      `  ${ca.caseId}: hardcodedStrings=${hardcodedCount}, findings=${findings.length}, titles=[${findings.map((f: any) => f.title).join("; ")}]`,
    );
  }
}

// Show I18N FP clean cases with hardcoded string counts
console.log("\nI18N FP clean cases analysis:");
const cleanCases = r.cases.filter((ca: any) => ca.expectedRuleIds?.length === 0);
for (const c of cleanCases) {
  const ca = c as any;
  const findings = ca.findings ?? [];
  const i18nFindings = findings.filter((f: any) => f.ruleId.startsWith("I18N-"));
  if (i18nFindings.length > 0) {
    if (!ca.code) {
      console.log(`  ${ca.caseId}: NO CODE (FP)`);
      continue;
    }
    const lines = ca.code.split("\n");
    let hardcodedCount = 0;
    lines.forEach((line: string) => {
      if (/>[\s]*[A-Z][a-z]+[\s\w]+<\//i.test(line) && !/translate|t\(|i18n|intl|formatMessage/i.test(line)) {
        hardcodedCount++;
      }
      if (
        /(?:label|title|placeholder|aria-label)\s*[=:]\s*["'`][A-Z]/i.test(line) &&
        !/translate|t\(|i18n|intl|formatMessage/i.test(line) &&
        !/(?:FastAPI|Flask|App|Blueprint|Swagger|OpenAPI|APIRouter)\s*\(/i.test(line)
      ) {
        hardcodedCount++;
      }
    });
    console.log(
      `  ${ca.caseId}: hardcodedStrings=${hardcodedCount}, titles=[${i18nFindings.map((f: any) => f.title).join("; ")}]`,
    );
  }
}

// Show DOC status
console.log("\nDOC per-judge after changes:");
const docJudge = (r as any).perJudge?.["DOC"];
if (docJudge) {
  console.log(
    `  DOC: TP=${docJudge.truePositives}, FP=${docJudge.falsePositives}, FPR=${((docJudge.falsePositives / (docJudge.truePositives + docJudge.falsePositives)) * 100).toFixed(1)}%`,
  );
}
const i18nJudge = (r as any).perJudge?.["I18N"];
if (i18nJudge) {
  console.log(
    `  I18N: TP=${i18nJudge.truePositives}, FP=${i18nJudge.falsePositives}, FPR=${((i18nJudge.falsePositives / (i18nJudge.truePositives + i18nJudge.falsePositives)) * 100).toFixed(1)}%`,
  );
}
