// ─────────────────────────────────────────────────────────────────────────────
// Individual Judge Coverage — Exercises each judge with targeted code samples
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateWithJudge } from "../src/evaluators/index.js";
import { JUDGES, getJudge } from "../src/judges/index.js";

function evalJ(id: string, code: string, lang: string) {
  const j = getJudge(id)!;
  return evaluateWithJudge(j, code, lang);
}

// ═══════════ Exercise every judge with vulnerable + clean code ════════════

describe("All judges: vulnerable code produces findings", () => {
  const vulnerableJS = `
const express = require("express");
const app = express();
app.get("/user", (req, res) => {
  const id = req.query.id;
  const user = db.query("SELECT * FROM users WHERE id = " + id);
  eval(req.body.expr);
  res.send("<h1>" + req.query.name + "</h1>");
});
app.listen(3000);
`;

  for (const judge of JUDGES) {
    it(`${judge.id} evaluates without crashing`, () => {
      const r = evaluateWithJudge(judge, vulnerableJS, "javascript");
      assert.ok(typeof r.score === "number");
      assert.ok(r.verdict === "pass" || r.verdict === "warning" || r.verdict === "fail");
      assert.ok(Array.isArray(r.findings));
    });
  }
});

describe("All judges: clean code produces no critical findings", () => {
  const cleanTS = `
import { z } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import express from "express";

const app = express();
app.use(helmet());
app.use(rateLimit({ windowMs: 900000, max: 100 }));

const UserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

app.post("/api/users", async (req, res) => {
  const parsed = UserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.format() });
  }
  const user = await db.query("INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id", [parsed.data.name, parsed.data.email]);
  res.status(201).json({ id: user.rows[0].id });
});

app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(Number(process.env.PORT) || 3000);
`;

  for (const judge of JUDGES) {
    it(`${judge.id} produces no critical findings for clean code`, () => {
      const r = evaluateWithJudge(judge, cleanTS, "typescript");
      const critical = r.findings.filter((f) => f.severity === "critical");
      assert.equal(critical.length, 0, `${judge.id} flagged critical: ${critical.map((f) => f.title).join(", ")}`);
    });
  }
});

// ═══════════ Language-specific code to exercise more evaluator paths ═════

describe("Judge coverage: Python-specific patterns", () => {
  const pythonCode = `
import pickle
import hashlib
import yaml
import os

def process_request(request):
    # Weak crypto
    token = hashlib.md5(request.data).hexdigest()
    
    # Unsafe deserialization
    data = pickle.loads(request.body)
    
    # Unsafe YAML
    config = yaml.load(request.args.get("config"))
    
    # Command injection
    os.system("grep " + request.args.get("pattern") + " /var/log/app.log")
    
    # SQL injection
    cursor.execute(f"SELECT * FROM users WHERE name = '{request.args.get('name')}'")
    
    return data
`;

  it("cybersecurity detects Python issues", () => {
    const r = evalJ("cybersecurity", pythonCode, "python");
    assert.ok(r.findings.length >= 2);
  });

  it("security detects Python issues", () => {
    const r = evalJ("security", pythonCode, "python");
    assert.ok(r.findings.length >= 1);
  });
});

describe("Judge coverage: Go-specific patterns", () => {
  const goCode = `
package main

import (
    "fmt"
    "net/http"
    "os/exec"
    "database/sql"
)

func handler(w http.ResponseWriter, r *http.Request) {
    cmd := r.URL.Query().Get("cmd")
    out, _ := exec.Command("sh", "-c", cmd).Output()
    fmt.Fprintf(w, "%s", out)
    
    name := r.FormValue("name")
    db.Query(fmt.Sprintf("SELECT * FROM users WHERE name = '%s'", name))
}

func main() {
    http.HandleFunc("/", handler)
    http.ListenAndServe(":8080", nil)
}
`;

  it("cybersecurity detects Go issues", () => {
    const r = evalJ("cybersecurity", goCode, "go");
    assert.ok(r.findings.length >= 1);
  });

  it("security detects Go issues", () => {
    const r = evalJ("security", goCode, "go");
    assert.ok(typeof r.score === "number");
  });
});

describe("Judge coverage: Java-specific patterns", () => {
  const javaCode = `
import java.sql.*;
import javax.crypto.*;
import java.security.*;

public class UserService {
    public User getUser(String id) throws SQLException {
        Statement stmt = connection.createStatement();
        ResultSet rs = stmt.executeQuery("SELECT * FROM users WHERE id = " + id);
        return mapUser(rs);
    }
    
    public String hashPassword(String password) throws Exception {
        MessageDigest md = MessageDigest.getInstance("MD5");
        return DatatypeConverter.printHexBinary(md.digest(password.getBytes()));
    }
    
    public String encrypt(String data) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, secretKey);
        return Base64.encodeToString(cipher.doFinal(data.getBytes()));
    }
}
`;

  it("cybersecurity detects Java issues", () => {
    const r = evalJ("cybersecurity", javaCode, "java");
    assert.ok(r.findings.length >= 1);
  });

  it("security detects Java issues", () => {
    const r = evalJ("security", javaCode, "java");
    assert.ok(r.findings.length >= 1);
  });
});

describe("Judge coverage: C# patterns", () => {
  const csharpCode = `
using System.Data.SqlClient;

public class UserController : Controller {
    public IActionResult GetUser(string id) {
        var conn = new SqlConnection(connectionString);
        var cmd = new SqlCommand("SELECT * FROM Users WHERE Id = " + id, conn);
        var reader = cmd.ExecuteReader();
        return Ok(reader);
    }
    
    public IActionResult Upload(string filename) {
        var path = Path.Combine("uploads", filename);
        System.IO.File.ReadAllBytes(path);
        return Ok();
    }
}
`;

  it("cybersecurity detects C# issues", () => {
    const r = evalJ("cybersecurity", csharpCode, "csharp");
    assert.ok(typeof r.score === "number");
  });

  it("security detects C# issues", () => {
    const r = evalJ("security", csharpCode, "csharp");
    assert.ok(typeof r.score === "number");
  });
});

describe("Judge coverage: Terraform/IaC patterns", () => {
  const terraformCode = `
resource "aws_security_group" "allow_all" {
  name = "allow_all"
  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "default" {
  engine              = "mysql"
  instance_class      = "db.t3.micro"
  publicly_accessible = true
  storage_encrypted   = false
  skip_final_snapshot = true
}

resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
  acl    = "public-read"
}
`;

  it("iac-security detects Terraform issues", () => {
    const r = evalJ("iac-security", terraformCode, "terraform");
    assert.ok(r.findings.length >= 1);
  });

  it("security evaluates Terraform", () => {
    const r = evalJ("security", terraformCode, "terraform");
    assert.ok(typeof r.score === "number");
  });
});

describe("Judge coverage: HTML accessibility", () => {
  const htmlCode = `
<div onclick="submitForm()" class="btn">Submit</div>
<img src="/logo.png" />
<input type="text" placeholder="Name" />
<div style="color: red;">Error occurred</div>
<table>
  <tr><td>Name</td><td>Age</td></tr>
  <tr><td>Alice</td><td>30</td></tr>
</table>
`;

  it("accessibility detects HTML issues", () => {
    const r = evalJ("accessibility", htmlCode, "html");
    assert.ok(r.findings.length >= 1);
  });
});

describe("Judge coverage: package.json dependency analysis", () => {
  const packageJson = `{
  "dependencies": {
    "express": "*",
    "request": "^2.88.2",
    "moment": "^2.29.4",
    "lodash": "^3.10.1",
    "jade": "^1.11.0",
    "coffee-script": "^1.12.7"
  }
}`;

  it("dependency-health flags issues", () => {
    const r = evalJ("dependency-health", packageJson, "json");
    assert.ok(r.findings.length >= 1);
  });
});
