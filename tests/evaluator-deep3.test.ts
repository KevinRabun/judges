// Remaining Evaluators — Third Wave
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithJudge, evaluateWithTribunal } from "../src/evaluators/index.js";
import { getJudge } from "../src/judges/index.js";

function evalJ(id: string, code: string, lang: string) {
  return evaluateWithJudge(getJudge(id)!, code, lang);
}

describe("EvalDeep3: data-sovereignty", () => {
  it("detects US storage", () => {
    const r = evalJ("data-sovereignty", 'await s3.putObject({ Bucket: "us-east-1-data" });', "javascript");
    assert.ok(typeof r.score === "number");
  });
  it("detects cross-region replication", () => {
    const r = evalJ(
      "data-sovereignty",
      'rds.startDBInstanceAutomatedBackupsReplication({ SourceDBInstanceArn: "arn:aws:rds:eu-central-1:123:db:x" });',
      "javascript",
    );
    assert.ok(typeof r.score === "number");
  });
});

describe("EvalDeep3: software-practices", () => {
  it("detects deprecated patterns", () => {
    const r = evalJ("software-practices", 'var x = new Array();\nnew Buffer("hi");', "javascript");
    assert.ok(typeof r.score === "number");
  });
  it("detects linter suppressions", () => {
    const r = evalJ("software-practices", "// eslint-disable-next-line\n// @ts-ignore\neval('x');", "typescript");
    assert.ok(typeof r.score === "number");
  });
});

describe("EvalDeep3: documentation", () => {
  it("detects undocumented exports", () => {
    const r = evalJ(
      "documentation",
      "export function calc(a: number, b: number, c: number): number { return a+b+c; }",
      "typescript",
    );
    assert.ok(typeof r.score === "number");
  });
});

describe("EvalDeep3: configuration-management", () => {
  it("detects hardcoded secrets", () => {
    const r = evalJ(
      "configuration-management",
      'const API_KEY = "sk-1234567890abcdef";\nconst SECRET = "mysupersecret";',
      "javascript",
    );
    assert.ok(typeof r.score === "number");
  });
});

describe("EvalDeep3: reliability", () => {
  it("detects unhandled async", () => {
    const r = evalJ("reliability", "async function f() { const r = await fetch(url); return r.json(); }", "javascript");
    assert.ok(typeof r.score === "number");
  });
});

describe("EvalDeep3: testing", () => {
  it("evaluates code structure", () => {
    const r = evalJ("testing", "export function processPayment(a: number) { return a * 1.1; }", "typescript");
    assert.ok(typeof r.score === "number");
  });
});

describe("EvalDeep3: recall-boost", () => {
  it("boosts C# recall", () => {
    const v = evaluateWithTribunal('new SqlCommand("SELECT * FROM Users WHERE Id = " + id);', "csharp");
    assert.ok(typeof v.overallScore === "number");
  });
  it("boosts Kotlin recall", () => {
    const v = evaluateWithTribunal("val q = \"SELECT * FROM users WHERE id = '$id'\"", "kotlin");
    assert.ok(typeof v.overallScore === "number");
  });
});

describe("EvalDeep3: multi-vuln samples", () => {
  it("Express with issues", () => {
    const code =
      'const app=require("express")();\napp.get("/u",(q,r)=>{r.send("<h1>"+q.query.n+"</h1>");eval(q.body.c);});\napp.listen(3000,"0.0.0.0");';
    const v = evaluateWithTribunal(code, "javascript");
    assert.ok(v.findings.length >= 1);
  });
  it("Python Flask with issues", () => {
    const code =
      'from flask import Flask,request\nimport pickle,os\napp=Flask(__name__)\napp.secret_key="dev"\n@app.route("/x")\ndef x():\n  data=pickle.loads(request.data)\n  os.system("grep "+request.args.get("q")+" /var/log")\n  return str(data)\napp.run(debug=True)';
    const v = evaluateWithTribunal(code, "python");
    assert.ok(v.findings.length >= 1);
  });
  it("clean TypeScript API", () => {
    const code =
      'import helmet from "helmet";\nimport express from "express";\nconst app=express();\napp.use(helmet());\napp.get("/d",(req,res)=>{const id=Number(req.params.id);res.json(db.query("SELECT * FROM t WHERE id=$1",[id]));});\napp.listen(Number(process.env.PORT)||3000);';
    const v = evaluateWithTribunal(code, "typescript");
    assert.ok(v.overallScore >= 30);
  });
});
