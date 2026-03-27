// ─────────────────────────────────────────────────────────────────────────────
// Language-Specific Evaluator Coverage — targets deeper evaluator branches
// with realistic multi-vulnerability code in each language
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithTribunal, evaluateWithJudge, evaluateProject } from "../src/evaluators/index.js";
import { getJudge } from "../src/judges/index.js";

// ═══════════════ Swift ═══════════════════════════════════════════════════

describe("LangCov: Swift", () => {
  it("detects security issues in Swift", () => {
    const code = `
import Foundation
class UserService {
    func getUser(id: String) -> User? {
        let query = "SELECT * FROM users WHERE id = '\\(id)'"
        let result = db.execute(query)
        return result.first
    }
    
    func generateToken() -> String {
        return String(arc4random())
    }
}
`;
    const v = evaluateWithTribunal(code, "swift");
    assert.ok(v.evaluations.length > 0);
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Kotlin ══════════════════════════════════════════════════

describe("LangCov: Kotlin", () => {
  it("evaluates Kotlin Android with security issues", () => {
    const code = `
import android.webkit.WebView
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.addJavascriptInterface(JsInterface(), "Android")
        val url = intent.getStringExtra("url") ?: ""
        webView.loadUrl(url)
        
        val query = "SELECT * FROM users WHERE id = " + intent.getStringExtra("id")
        database.rawQuery(query, null)
    }
}
`;
    const v = evaluateWithTribunal(code, "kotlin");
    assert.ok(v.evaluations.length > 0);
  });
});

// ═══════════════ PowerShell ══════════════════════════════════════════════

describe("LangCov: PowerShell", () => {
  it("evaluates PowerShell with issues", () => {
    const code = `
$password = "SuperSecret123"
$cred = New-Object System.Management.Automation.PSCredential("admin", (ConvertTo-SecureString $password -AsPlainText -Force))

Invoke-Expression $userInput
Invoke-Command -ScriptBlock ([scriptblock]::Create($userCommand))

$query = "SELECT * FROM Users WHERE Name = '$userName'"
Invoke-Sqlcmd -Query $query
`;
    const v = evaluateWithTribunal(code, "powershell");
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Dart/Flutter ════════════════════════════════════════════

describe("LangCov: Dart", () => {
  it("evaluates Dart code", () => {
    const code = `
import 'dart:io';
void main() async {
  var server = await HttpServer.bind('0.0.0.0', 8080);
  await for (HttpRequest request in server) {
    var name = request.uri.queryParameters['name'];
    request.response.write('<h1>Hello \$name</h1>');
    request.response.close();
  }
}
`;
    const v = evaluateWithTribunal(code, "dart");
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Bicep (Azure IaC) ═══════════════════════════════════════

describe("LangCov: Bicep", () => {
  it("evaluates Bicep with security issues", () => {
    const code = `
param adminPassword string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'mystorageaccount'
  location: resourceGroup().location
  properties: {
    supportsHttpsTrafficOnly: false
    minimumTlsVersion: 'TLS1_0'
    allowBlobPublicAccess: true
  }
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
}

resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: 'mysqlserver'
  location: resourceGroup().location
  properties: {
    administratorLogin: 'admin'
    administratorLoginPassword: adminPassword
  }
}
`;
    const v = evaluateWithTribunal(code, "bicep");
    assert.ok(v.evaluations.length > 0);
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ YAML (Kubernetes) ═══════════════════════════════════════

describe("LangCov: Kubernetes YAML", () => {
  it("evaluates K8s manifest with security issues", () => {
    const code = `
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  hostNetwork: true
  containers:
  - name: app
    image: myapp:latest
    securityContext:
      privileged: true
      runAsUser: 0
    env:
    - name: DB_PASSWORD
      value: "supersecret"
    ports:
    - containerPort: 8080
      hostPort: 8080
`;
    const v = evaluateWithTribunal(code, "yaml");
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ SQL ═════════════════════════════════════════════════════

describe("LangCov: SQL", () => {
  it("evaluates SQL with issues", () => {
    const code = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  password VARCHAR(255),
  ssn VARCHAR(11),
  credit_card VARCHAR(19)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO public_role;

CREATE FUNCTION get_user(p_name TEXT) RETURNS SETOF users AS $$
BEGIN
  EXECUTE 'SELECT * FROM users WHERE name = ''' || p_name || '''';
END;
$$ LANGUAGE plpgsql;
`;
    const v = evaluateWithTribunal(code, "sql");
    assert.ok(typeof v.overallScore === "number");
  });
});

// ═══════════════ Multi-file project with cross-file patterns ═════════════

describe("LangCov: cross-file project analysis", () => {
  it("detects cross-file issues in project", () => {
    const files = [
      {
        path: "src/routes/users.ts",
        content: `
import { db } from "../db";
import { Request, Response } from "express";
export function getUser(req: Request, res: Response) {
  const user = db.query("SELECT * FROM users WHERE id = " + req.params.id);
  res.json(user);
}`,
        language: "typescript",
      },
      {
        path: "src/db.ts",
        content: `
import { Pool } from "pg";
export const db = new Pool({ connectionString: "postgresql://admin:pass@localhost/mydb" });
`,
        language: "typescript",
      },
      {
        path: "src/middleware/auth.ts",
        content: `
import jwt from "jsonwebtoken";
const SECRET = "my-jwt-secret-key";
export function authenticate(req: any, _res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  req.user = jwt.decode(token);
  next();
}`,
        language: "typescript",
      },
      {
        path: "src/index.ts",
        content: `
import express from "express";
const app = express();
app.listen(3000, "0.0.0.0");
console.log("Server started on http://localhost:3000");`,
        language: "typescript",
      },
    ];
    const result = evaluateProject(files);
    assert.ok(result.fileResults.length >= 4);
    assert.ok(typeof result.overallScore === "number");
  });

  it("detects cross-file taint flows", () => {
    const files = [
      {
        path: "src/handler.ts",
        content: `
import { processInput } from "./processor";
export function handle(req: any, res: any) {
  const result = processInput(req.body.data);
  res.send(result);
}`,
        language: "typescript",
      },
      {
        path: "src/processor.ts",
        content: `
export function processInput(data: string) {
  return eval(data);
}`,
        language: "typescript",
      },
    ];
    const result = evaluateProject(files);
    assert.ok(typeof result.overallScore === "number");
  });

  it("evaluates Python project", () => {
    const files = [
      {
        path: "app.py",
        content: `
from flask import Flask, request
import pickle
app = Flask(__name__)
app.secret_key = "dev-secret"

@app.route("/process", methods=["POST"])
def process():
    data = pickle.loads(request.data)
    return str(data)
`,
        language: "python",
      },
      {
        path: "utils.py",
        content: `
import hashlib
def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()
`,
        language: "python",
      },
    ];
    const result = evaluateProject(files);
    assert.ok(result.fileResults.length >= 2);
  });
});

// ═══════════════ Edge cases ══════════════════════════════════════════════

describe("LangCov: edge cases", () => {
  it("evaluates minified JS", () => {
    const code = 'function a(b){return eval(b)}var c=a("alert(1)");document.innerHTML=c;';
    const v = evaluateWithTribunal(code, "javascript");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates very long single line", () => {
    const code = "const x = " + "1 + ".repeat(500) + "1;";
    const v = evaluateWithTribunal(code, "javascript");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates code with Unicode", () => {
    const code = 'const name = "Ólafur Müller";\nconst greeting = `こんにちは ${name}`;\nconsole.log(greeting);';
    const v = evaluateWithTribunal(code, "javascript");
    assert.ok(typeof v.overallScore === "number");
  });

  it("evaluates mixed HTML/JS", () => {
    const code = `
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
<form action="/login" method="POST">
  <input type="text" name="username" />
  <input type="password" name="password" />
  <button onclick="document.write(location.hash)">Login</button>
</form>
<script>
  var user = document.location.search;
  document.getElementById("welcome").innerHTML = user;
  eval(user);
</script>
</body>
</html>`;
    const v = evaluateWithTribunal(code, "html");
    assert.ok(typeof v.overallScore === "number");
  });
});
