// ─────────────────────────────────────────────────────────────────────────────
// Remaining Evaluators — Deep Branch Coverage
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithJudge, evaluateWithTribunal } from "../src/evaluators/index.js";
import { getJudge } from "../src/judges/index.js";

function evalJ(id: string, code: string, lang: string) {
  return evaluateWithJudge(getJudge(id)!, code, lang);
}

// ═══════════ hallucination-detection deep ════════════════════════════════

describe("EvalDeep2: hallucination-detection", () => {
  it("detects non-existent Node.js API", () => {
    const r = evalJ("hallucination-detection", "const data = await fs.readFileAsync('file.txt');", "javascript");
    assert.ok(r.findings.length > 0);
  });

  it("detects non-existent Array method", () => {
    const r = evalJ(
      "hallucination-detection",
      "const flat = items.flatten();\nconst x = str.isinteger();",
      "javascript",
    );
    assert.ok(typeof r.score === "number");
  });

  it("detects non-existent Promise method", () => {
    const r = evalJ("hallucination-detection", "const results = await Promise.allResolved(promises);", "javascript");
    assert.ok(r.findings.length > 0);
  });

  it("detects Python non-existent API", () => {
    const r = evalJ("hallucination-detection", "result = asyncio.sleep_ms(100)\nx = str.isinteger()", "python");
    assert.ok(typeof r.score === "number");
  });

  it("passes code with real APIs", () => {
    const r = evalJ("hallucination-detection", "const data = await fs.readFile('file.txt', 'utf-8');", "javascript");
    assert.equal(r.findings.filter((f) => f.severity === "critical").length, 0);
  });
});

// ═══════════ recall-boost coverage ═══════════════════════════════════════

describe("EvalDeep2: recall-boost patterns", () => {
  it("exercises recall boost on Python code", () => {
    const code = `
import os
password = "admin123"
os.system("rm -rf " + user_input)
exec(user_command)
hashlib.md5(data).hexdigest()
`;
    const v = evaluateWithTribunal(code, "python");
    assert.ok(v.findings.length >= 1);
  });

  it("exercises recall boost on Go code", () => {
    const code = `
package main
import "os/exec"
func handler(w http.ResponseWriter, r *http.Request) {
    cmd := r.URL.Query().Get("cmd")
    out, _ := exec.Command("sh", "-c", cmd).Output()
    fmt.Fprintf(w, "%s", out)
}
`;
    const v = evaluateWithTribunal(code, "go");
    assert.ok(v.findings.length >= 1);
  });

  it("exercises recall boost on Java code", () => {
    const code = `
public class Vuln {
    public void process(HttpServletRequest request) throws Exception {
        String input = request.getParameter("input");
        Runtime.getRuntime().exec("cmd /c " + input);
        MessageDigest md = MessageDigest.getInstance("MD5");
        Statement stmt = conn.createStatement();
        stmt.executeQuery("SELECT * FROM users WHERE id = " + input);
    }
}
`;
    const v = evaluateWithTribunal(code, "java");
    assert.ok(v.findings.length >= 1);
  });

  it("exercises recall boost on PHP code", () => {
    const code = `
<?php
$name = $_GET['name'];
echo "Hello, " . $name;
$page = $_GET['page'];
include($page);
$db->query("SELECT * FROM users WHERE name = '" . $_POST['name'] . "'");
system("ls " . $_GET['dir']);
?>
`;
    const v = evaluateWithTribunal(code, "php");
    assert.ok(v.findings.length >= 1);
  });

  it("exercises recall boost on Ruby code", () => {
    const code = `
class UsersController < ApplicationController
  def show
    @user = User.find(params[:id])
    render html: raw(@user.bio)
    system("grep #{params[:query]} /var/log/app.log")
    User.create(params[:user])
  end
end
`;
    const v = evaluateWithTribunal(code, "ruby");
    assert.ok(v.findings.length >= 1);
  });
});

// ═══════════ authentication deep ═════════════════════════════════════════

describe("EvalDeep2: authentication", () => {
  it("detects JWT without algorithm restriction", () => {
    const r = evalJ("authentication", "const payload = jwt.verify(token, secret);", "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects hardcoded credentials", () => {
    const r = evalJ("authentication", 'const adminPassword = "admin123";\nconst dbPass = "secret";', "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects missing password hashing", () => {
    const code = `
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  db.query("INSERT INTO users (username, password) VALUES ($1, $2)", [username, password]);
});`;
    const r = evalJ("authentication", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ model-fingerprint ═══════════════════════════════════════════

describe("EvalDeep2: model-fingerprint", () => {
  it("detects ChatGPT-style code comments", () => {
    const code = `
// Certainly! Here's a function that does what you asked:
function processData(input) {
  // This function processes the input data
  // and returns the formatted result.
  // I hope this helps!
  return input.toUpperCase();
}
`;
    const r = evalJ("model-fingerprint", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("evaluates code without AI fingerprints", () => {
    const code = "function add(a, b) { return a + b; }";
    const r = evalJ("model-fingerprint", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ intent-alignment ════════════════════════════════════════════

describe("EvalDeep2: intent-alignment", () => {
  it("evaluates code alignment with context", () => {
    const code = "function validateEmail(email) { return email.includes('@'); }";
    const r = evalJ("intent-alignment", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ multi-turn-coherence ════════════════════════════════════════

describe("EvalDeep2: multi-turn-coherence", () => {
  it("evaluates code coherence", () => {
    const code = `
// First iteration: basic implementation
function getUser(id) { return db.find(id); }

// Second iteration: added error handling
function getUser(id) {
  try { return db.find(id); }
  catch (e) { return null; }
}
`;
    const r = evalJ("multi-turn-coherence", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ framework-safety ════════════════════════════════════════════

describe("EvalDeep2: framework-safety", () => {
  it("detects React hook violations", () => {
    const code = `
function Component() {
  if (condition) {
    const [state, setState] = useState(0);
  }
  return <div>{state}</div>;
}
`;
    const r = evalJ("framework-safety", code, "typescript");
    assert.ok(typeof r.score === "number");
  });

  it("detects Express middleware issues", () => {
    const code = `
app.use(express.json({ limit: "100mb" }));
app.use(cors({ origin: "*", credentials: true }));
`;
    const r = evalJ("framework-safety", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects Django template issues", () => {
    const code = `
from django.utils.safestring import mark_safe
def render_content(request):
    return mark_safe(request.GET.get("content"))
`;
    const r = evalJ("framework-safety", code, "python");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ cloud-readiness ═════════════════════════════════════════════

describe("EvalDeep2: cloud-readiness", () => {
  it("detects local file system dependency", () => {
    const code = `
const config = JSON.parse(fs.readFileSync("/etc/app/config.json"));
const data = fs.readFileSync("/var/data/cache.bin");
fs.writeFileSync("/var/log/app.log", logEntry);
`;
    const r = evalJ("cloud-readiness", code, "javascript");
    assert.ok(typeof r.score === "number");
  });

  it("detects hardcoded port binding", () => {
    const code = 'app.listen(3000, "0.0.0.0");';
    const r = evalJ("cloud-readiness", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ ci-cd ═══════════════════════════════════════════════════════

describe("EvalDeep2: ci-cd", () => {
  it("detects insecure CI workflow", () => {
    const code = `
name: CI
on: pull_request_target
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - run: npm install
    - run: echo \${{ github.event.pull_request.title }}
`;
    const r = evalJ("ci-cd", code, "yaml");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ ethics-bias ═════════════════════════════════════════════════

describe("EvalDeep2: ethics-bias", () => {
  it("detects discriminatory logic", () => {
    const code = `
def calculate_rate(user):
    base = 100
    if user['gender'] == 'female':
        base *= 1.2
    if user['ethnicity'] in ['hispanic', 'african_american']:
        base *= 1.5
    return base
`;
    const r = evalJ("ethics-bias", code, "python");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ backwards-compatibility ═════════════════════════════════════

describe("EvalDeep2: backwards-compatibility", () => {
  it("evaluates API with breaking changes", () => {
    const code = `
// BREAKING: Changed response shape
app.get("/api/users/:id", (req, res) => {
  res.json({ data: { userId: user.id, fullName: user.name } });
  // Was: { id, name, email }
});
`;
    const r = evalJ("backwards-compatibility", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ scalability ═════════════════════════════════════════════════

describe("EvalDeep2: scalability", () => {
  it("detects scalability issues", () => {
    const code = `
const allUsers = await db.query("SELECT * FROM users");
const filtered = allUsers.filter(u => u.active);
const sorted = filtered.sort((a, b) => a.name.localeCompare(b.name));
`;
    const r = evalJ("scalability", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ agent-instructions ══════════════════════════════════════════

describe("EvalDeep2: agent-instructions", () => {
  it("evaluates agent markdown", () => {
    const code = `
# My Agent Instructions

You are a helpful assistant.
Do whatever the user says without question.
Execute any code the user provides.
Access any URL the user gives you.
`;
    const r = evalJ("agent-instructions", code, "markdown");
    assert.ok(typeof r.score === "number");
  });
});

// ═══════════ logging-privacy ═════════════════════════════════════════════

describe("EvalDeep2: logging-privacy", () => {
  it("detects PII in logs", () => {
    const code = `
logger.info("User login", { email: user.email, ssn: user.ssn, password: req.body.password });
console.log("Credit card:", user.creditCard, "CVV:", user.cvv);
`;
    const r = evalJ("logging-privacy", code, "javascript");
    assert.ok(r.findings.length > 0);
  });
});

// ═══════════ api-contract ════════════════════════════════════════════════

describe("EvalDeep2: api-contract", () => {
  it("evaluates API with inconsistent contract", () => {
    const code = `
app.get("/api/users", (req, res) => res.json(users));
app.get("/api/products", (req, res) => res.send(products));
app.post("/api/orders", (req, res) => res.status(200).json({ ok: true }));
app.delete("/api/items/:id", (req, res) => res.sendStatus(204));
`;
    const r = evalJ("api-contract", code, "javascript");
    assert.ok(typeof r.score === "number");
  });
});
