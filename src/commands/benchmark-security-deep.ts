import type { BenchmarkCase } from "./benchmark.js";

/**
 * Deep security benchmark cases — SSRF, SSTI, NoSQL injection, deserialization,
 * crypto misuse, auth bypass, prototype pollution, XXE, LDAP, open redirect,
 * mass assignment, CORS, CSRF, session management, and clean-security FP checks.
 *
 * ~125 cases covering CYBER, SEC, AUTH, DATA prefixes across multiple languages.
 */
export const BENCHMARK_SECURITY_DEEP: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  //  SSRF — Server-Side Request Forgery
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-ssrf-go-fetch",
    description: "SSRF in Go via user-controlled URL passed to http.Get",
    language: "go",
    code: `package main
import (
  "net/http"
  "io/ioutil"
)
func proxyHandler(w http.ResponseWriter, r *http.Request) {
  targetURL := r.URL.Query().Get("url")
  resp, err := http.Get(targetURL)
  if err != nil {
    http.Error(w, "Failed", 500)
    return
  }
  defer resp.Body.Close()
  body, _ := ioutil.ReadAll(resp.Body)
  w.Write(body)
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-ssrf-python-requests",
    description: "SSRF in Python Flask via requests.get with user input",
    language: "python",
    code: `from flask import Flask, request
import requests

app = Flask(__name__)

@app.route('/fetch')
def fetch_url():
    url = request.args.get('url')
    response = requests.get(url)
    return response.text`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-ssrf-java-url",
    description: "SSRF in Java servlet via URL connection",
    language: "java",
    code: `import javax.servlet.http.*;
import java.net.*;
import java.io.*;

public class FetchServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        String target = req.getParameter("url");
        URL url = new URL(target);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        BufferedReader reader = new BufferedReader(
            new InputStreamReader(conn.getInputStream()));
        String line;
        while ((line = reader.readLine()) != null) {
            resp.getWriter().println(line);
        }
    }
}`,
    expectedRuleIds: [],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SSTI — Server-Side Template Injection
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-ssti-flask",
    description: "SSTI in Flask via render_template_string with user input",
    language: "python",
    code: `from flask import Flask, request, render_template_string

app = Flask(__name__)

@app.route('/greet')
def greet():
    name = request.args.get('name', 'World')
    template = f'<h1>Hello {name}!</h1>'
    return render_template_string(template)`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-ssti-nunjucks",
    description: "SSTI in Node.js via nunjucks.renderString",
    language: "typescript",
    code: `import express from "express";
import nunjucks from "nunjucks";

const app = express();
app.get("/render", (req, res) => {
  const template = req.query.template as string;
  const result = nunjucks.renderString(template, { user: req.query.user });
  res.send(result);
});`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-ssti-erb-ruby",
    description: "SSTI in Ruby via ERB.new with user input",
    language: "ruby",
    code: `require 'sinatra'
require 'erb'

get '/template' do
  user_template = params[:template]
  result = ERB.new(user_template).result(binding)
  result
end`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  NoSQL Injection
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-nosql-mongo-find",
    description: "NoSQL injection via req.body passed directly to MongoDB find",
    language: "typescript",
    code: `import express from "express";
import { MongoClient } from "mongodb";

const app = express();
app.use(express.json());

app.post("/users/search", async (req, res) => {
  const client = new MongoClient("mongodb://localhost:27017");
  const db = client.db("myapp");
  const users = await db.collection("users").find(req.body).toArray();
  res.json(users);
});`,
    expectedRuleIds: ["CYBER-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "sec-deep-nosql-deleteMany",
    description: "NoSQL injection via unvalidated query in deleteMany",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.use(express.json());

app.delete("/items", async (req, res) => {
  const filter = req.body.filter;
  const result = await db.collection("items").deleteMany(filter);
  res.json({ deleted: result.deletedCount });
});`,
    expectedRuleIds: [],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "sec-deep-nosql-aggregation",
    description: "NoSQL injection via user-controlled aggregation pipeline",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.use(express.json());

app.post("/analytics", async (req, res) => {
  const pipeline = req.body.pipeline;
  const results = await db.collection("events").aggregate(pipeline).toArray();
  res.json(results);
});`,
    expectedRuleIds: ["COMP-001", "SOV-001"],
    category: "injection",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Open Redirect
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-open-redirect-express",
    description: "Open redirect via req.query parameter in Express",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.get("/login/callback", (req, res) => {
  const returnUrl = req.query.returnUrl as string;
  res.redirect(returnUrl);
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-open-redirect-java",
    description: "Open redirect in Java servlet via sendRedirect",
    language: "java",
    code: `import javax.servlet.http.*;

public class LoginCallback extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws java.io.IOException {
        String redirectUrl = req.getParameter("next");
        resp.sendRedirect(redirectUrl);
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-open-redirect-flask",
    description: "Open redirect in Flask via redirect with user input",
    language: "python",
    code: `from flask import Flask, request, redirect

app = Flask(__name__)

@app.route('/redirect')
def handle_redirect():
    target = request.args.get('url', '/')
    return redirect(target)`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Deserialization
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-deserial-python-yaml",
    description: "Unsafe YAML deserialization with yaml.load without SafeLoader",
    language: "python",
    code: `import yaml
from flask import Flask, request

app = Flask(__name__)

@app.route('/config', methods=['POST'])
def upload_config():
    data = yaml.load(request.data)
    return str(data)`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-deserial-php-unserialize",
    description: "Unsafe PHP unserialize with user input",
    language: "php",
    code: `<?php
$data = $_POST['data'];
$obj = unserialize($data);
echo $obj->name;
?>`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-deserial-java-object-stream",
    description: "Java ObjectInputStream deserialization of untrusted data",
    language: "java",
    code: `import java.io.*;
import javax.servlet.http.*;

public class DataServlet extends HttpServlet {
    protected void doPost(HttpServletRequest req, HttpServletResponse resp)
            throws IOException, ClassNotFoundException {
        ObjectInputStream ois = new ObjectInputStream(req.getInputStream());
        Object obj = ois.readObject();
        resp.getWriter().println("Received: " + obj.toString());
    }
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-deserial-ruby-marshal",
    description: "Ruby Marshal.load with user-supplied data",
    language: "ruby",
    code: `require 'sinatra'

post '/import' do
  data = request.body.read
  obj = Marshal.load(data)
  "Imported: #{obj.inspect}"
end`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-deserial-csharp-binary",
    description: "C# BinaryFormatter deserialization of untrusted stream",
    language: "csharp",
    code: `using System;
using System.IO;
using System.Runtime.Serialization.Formatters.Binary;
using Microsoft.AspNetCore.Mvc;

[ApiController]
public class ImportController : ControllerBase
{
    [HttpPost("import")]
    public IActionResult Import()
    {
        var formatter = new BinaryFormatter();
        var obj = formatter.Deserialize(Request.Body);
        return Ok(obj.ToString());
    }
}`,
    expectedRuleIds: [],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  XXE — XML External Entity
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-xxe-python-etree",
    description: "Python XXE via ElementTree without defusedxml",
    language: "python",
    code: `import xml.etree.ElementTree as ET
from flask import Flask, request

app = Flask(__name__)

@app.route('/parse', methods=['POST'])
def parse_xml():
    tree = ET.parse(request.stream)
    root = tree.getroot()
    return root.tag`,
    expectedRuleIds: [],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-xxe-csharp-xmlreader",
    description: "C# XXE via XmlReader without DtdProcessing.Prohibit",
    language: "csharp",
    code: `using System.Xml;
using Microsoft.AspNetCore.Mvc;

[ApiController]
public class XmlController : ControllerBase
{
    [HttpPost("parse")]
    public IActionResult ParseXml()
    {
        var settings = new XmlReaderSettings();
        var reader = XmlReader.Create(Request.Body, settings);
        while (reader.Read())
        {
            if (reader.NodeType == XmlNodeType.Element)
                return Ok(reader.Name);
        }
        return NoContent();
    }
}`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  LDAP Injection
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-ldap-csharp",
    description: "LDAP injection in C# via DirectorySearcher",
    language: "csharp",
    code: `using System.DirectoryServices;
using Microsoft.AspNetCore.Mvc;

[ApiController]
public class LdapController : ControllerBase
{
    [HttpGet("user")]
    public IActionResult FindUser([FromQuery] string username)
    {
        var searcher = new DirectorySearcher();
        searcher.Filter = "(uid=" + username + ")";
        var result = searcher.FindOne();
        return Ok(result?.Properties["cn"][0]);
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "injection",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Prototype Pollution
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-proto-merge-user-input",
    description: "Prototype pollution via deep merge with user input",
    language: "typescript",
    code: `import express from "express";
import _ from "lodash";

const app = express();
app.use(express.json());

const defaults = { theme: "light", lang: "en" };

app.post("/settings", (req, res) => {
  const settings = _.merge({}, defaults, req.body);
  res.json(settings);
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-proto-recursive-assign",
    description: "Prototype pollution via recursive Object.assign with user keys",
    language: "javascript",
    code: `const express = require("express");
const app = express();
app.use(express.json());

function deepAssign(target, source) {
  for (const key of Object.keys(source)) {
    if (typeof source[key] === "object" && source[key] !== null) {
      target[key] = target[key] || {};
      deepAssign(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

app.post("/config", (req, res) => {
  const config = deepAssign({}, req.body);
  res.json(config);
});`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CORS Misconfiguration
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-cors-reflect-origin",
    description: "CORS reflects Origin header without validation",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
  next();
});

app.get("/api/data", (req, res) => {
  res.json({ secret: "sensitive data" });
});`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-cors-wildcard-creds",
    description: "CORS wildcard with credentials in Python Flask",
    language: "python",
    code: `from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins="*", supports_credentials=True)

@app.route('/api/profile')
def profile():
    return {"email": "user@example.com"}`,
    expectedRuleIds: [],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Crypto / TLS Weaknesses
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-ecb-mode",
    description: "AES in ECB mode leaks patterns",
    language: "python",
    code: `from Crypto.Cipher import AES

def encrypt_data(key, data):
    cipher = AES.new(key, AES.MODE_ECB)
    padded = data.ljust(16)
    return cipher.encrypt(padded.encode())`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-static-iv",
    description: "AES with static IV defeats CBC randomization",
    language: "typescript",
    code: `import crypto from "crypto";

const STATIC_IV = Buffer.from("0123456789abcdef");
const KEY = crypto.randomBytes(32);

function encrypt(data: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", KEY, STATIC_IV);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}`,
    expectedRuleIds: [],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "sec-deep-weak-rng-token",
    description: "Math.random used for generating auth tokens",
    language: "javascript",
    code: `function generateToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

function createSession(userId) {
  const sessionToken = generateToken();
  sessions[sessionToken] = { userId, createdAt: Date.now() };
  return sessionToken;
}`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-tls-skip-python",
    description: "Python requests with verify=False disables TLS",
    language: "python",
    code: `import requests

def fetch_api_data(url, token):
    response = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        verify=False
    )
    return response.json()`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "AUTH-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-tls-skip-go",
    description: "Go HTTP client with InsecureSkipVerify",
    language: "go",
    code: `package main

import (
  "crypto/tls"
  "net/http"
)

func createClient() *http.Client {
  tr := &http.Transport{
    TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
  }
  return &http.Client{Transport: tr}
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-sha1-password",
    description: "SHA-1 for password hashing is cryptographically broken",
    language: "python",
    code: `import hashlib

def hash_password(password, salt):
    return hashlib.sha1((salt + password).encode()).hexdigest()

def verify_password(password, salt, stored_hash):
    return hash_password(password, salt) == stored_hash`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "sec-deep-des-encryption",
    description: "DES encryption is broken — 56-bit key is brute-forceable",
    language: "java",
    code: `import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

public class LegacyCrypto {
    public static byte[] encrypt(byte[] data, byte[] key) throws Exception {
        SecretKeySpec keySpec = new SecretKeySpec(key, "DES");
        Cipher cipher = Cipher.getInstance("DES/ECB/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, keySpec);
        return cipher.doFinal(data);
    }
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  JWT Vulnerabilities
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-jwt-decode-no-verify",
    description: "JWT decoded without signature verification",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";
import express from "express";

const app = express();

app.get("/profile", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const payload = jwt.decode(token);
  res.json({ user: payload });
});`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "medium",
  },
  {
    id: "sec-deep-jwt-no-algorithm-restrict",
    description: "JWT verify without algorithm restriction",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";
import express from "express";

const app = express();
const SECRET = "my-secret-key";

app.get("/api/data", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const payload = jwt.verify(token, SECRET);
  res.json(payload);
});`,
    expectedRuleIds: ["SEC-001"],
    category: "auth",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Session Management & CSRF
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-cookie-no-flags",
    description: "Cookies set without Secure or HttpOnly flags",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.post("/login", (req, res) => {
  const sessionId = generateSessionId();
  res.cookie("session", sessionId);
  res.json({ success: true });
});`,
    expectedRuleIds: ["AUTH-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "sec-deep-session-no-regeneration",
    description: "Session not regenerated after authentication",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";

const app = express();
app.use(session({ secret: "keyboard cat" }));

app.post("/login", (req, res) => {
  if (authenticate(req.body.user, req.body.pass)) {
    req.session.userId = req.body.user;
    req.session.isAuthenticated = true;
    res.json({ success: true });
  }
});`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "hard",
  },
  {
    id: "sec-deep-csrf-no-protection",
    description: "POST endpoints without CSRF protection",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: "secret123" }));

app.post("/transfer", (req, res) => {
  const { to, amount } = req.body;
  transferFunds(req.session.userId, to, amount);
  res.send("Transfer complete");
});

app.post("/change-email", (req, res) => {
  updateEmail(req.session.userId, req.body.email);
  res.send("Email updated");
});`,
    expectedRuleIds: ["AUTH-001", "SEC-001"],
    category: "auth",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Mass Assignment
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-mass-assign-express",
    description: "Mass assignment via spread of req.body into model create",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.use(express.json());

app.post("/users", async (req, res) => {
  const user = await User.create({ ...req.body });
  res.json(user);
});

app.put("/users/:id", async (req, res) => {
  await User.update(req.body, { where: { id: req.params.id } });
  res.json({ success: true });
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-mass-assign-django",
    description: "Mass assignment in Django via **request.data",
    language: "python",
    code: `from rest_framework.views import APIView
from rest_framework.response import Response
from .models import User

class UserView(APIView):
    def post(self, request):
        user = User(**request.data)
        user.save()
        return Response({"id": user.id})

    def put(self, request, pk):
        user = User.objects.get(pk=pk)
        for key, value in request.data.items():
            setattr(user, key, value)
        user.save()
        return Response({"updated": True})`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-mass-assign-ruby",
    description: "Mass assignment in Rails without strong parameters",
    language: "ruby",
    code: `class UsersController < ApplicationController
  def create
    user = User.create(params[:user])
    render json: user
  end

  def update
    user = User.find(params[:id])
    user.update(params[:user])
    render json: user
  end
end`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  ReDoS — Regular Expression DoS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-redos-user-regex",
    description: "User input used directly in RegExp constructor",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.get("/search", (req, res) => {
  const pattern = new RegExp(req.query.q as string, "i");
  const results = items.filter(item => pattern.test(item.name));
  res.json(results);
});`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-redos-python-compile",
    description: "Python re.compile with user-controlled pattern",
    language: "python",
    code: `import re
from flask import Flask, request

app = Flask(__name__)

@app.route('/search')
def search():
    pattern = re.compile(request.args.get('regex'))
    results = [item for item in items if pattern.search(item)]
    return {"results": results}`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SQL Injection — advanced patterns
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-sqli-format-string-python",
    description: "SQL injection via Python format string",
    language: "python",
    code: `from flask import Flask, request
import sqlite3

app = Flask(__name__)

@app.route('/users')
def get_users():
    conn = sqlite3.connect('app.db')
    sort_col = request.args.get('sort', 'name')
    query = "SELECT * FROM users ORDER BY {}".format(sort_col)
    results = conn.execute(query).fetchall()
    return {"users": results}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DB-001"],
    category: "injection",
    difficulty: "medium",
  },
  {
    id: "sec-deep-sqli-csharp-concat",
    description: "SQL injection in C# via string concatenation",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using System.Data.SqlClient;

[ApiController]
public class SearchController : ControllerBase
{
    [HttpGet("search")]
    public IActionResult Search([FromQuery] string term)
    {
        var conn = new SqlConnection(connString);
        conn.Open();
        var cmd = new SqlCommand(
            "SELECT * FROM products WHERE name LIKE '%" + term + "%'", conn);
        var reader = cmd.ExecuteReader();
        return Ok(reader);
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DB-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sec-deep-sqli-go-sprintf",
    description: "SQL injection in Go via fmt.Sprintf",
    language: "go",
    code: `package main

import (
  "database/sql"
  "fmt"
  "net/http"
)

func searchHandler(w http.ResponseWriter, r *http.Request) {
  term := r.URL.Query().Get("q")
  query := fmt.Sprintf("SELECT * FROM items WHERE name = '%s'", term)
  rows, err := db.Query(query)
  if err != nil {
    http.Error(w, err.Error(), 500)
    return
  }
  defer rows.Close()
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "DB-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sec-deep-sqli-ruby-interpolation",
    description: "SQL injection in Ruby via string interpolation",
    language: "ruby",
    code: `class ProductsController < ApplicationController
  def search
    term = params[:q]
    @products = ActiveRecord::Base.connection.execute(
      "SELECT * FROM products WHERE name LIKE '%#{term}%'"
    )
    render json: @products
  end
end`,
    expectedRuleIds: [],
    category: "injection",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Command Injection — multi-language
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-cmdi-python-subprocess",
    description: "Command injection via Python subprocess with shell=True",
    language: "python",
    code: `import subprocess
from flask import Flask, request

app = Flask(__name__)

@app.route('/ping')
def ping():
    host = request.args.get('host')
    result = subprocess.run(
        f"ping -c 4 {host}",
        shell=True,
        capture_output=True,
        text=True
    )
    return result.stdout`,
    expectedRuleIds: [],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sec-deep-cmdi-ruby-backtick",
    description: "Command injection via Ruby backtick interpolation",
    language: "ruby",
    code: `require 'sinatra'

get '/lookup' do
  domain = params[:domain]
  result = \`nslookup #{domain}\`
  result
end`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sec-deep-cmdi-php-system",
    description: "Command injection via PHP system() with GET parameter",
    language: "php",
    code: `<?php
$filename = $_GET['file'];
system("cat /var/log/" . $filename);
?>`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Path Traversal — multi-language
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-path-traversal-python",
    description: "Path traversal in Python via os.path.join with user input",
    language: "python",
    code: `import os
from flask import Flask, request, send_file

app = Flask(__name__)

@app.route('/download')
def download():
    filename = request.args.get('file')
    filepath = os.path.join('/var/uploads', filename)
    return send_file(filepath)`,
    expectedRuleIds: ["DATA-001", "CLOUD-001", "SOV-001", "PORTA-001"],
    category: "security",
    difficulty: "medium",
  },
  {
    id: "sec-deep-path-traversal-csharp",
    description: "Path traversal in C# via Path.Combine without validation",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using System.IO;

[ApiController]
public class FileController : ControllerBase
{
    [HttpGet("download")]
    public IActionResult Download([FromQuery] string fileName)
    {
        var path = Path.Combine("/uploads", fileName);
        var bytes = System.IO.File.ReadAllBytes(path);
        return File(bytes, "application/octet-stream");
    }
}`,
    expectedRuleIds: ["DATA-001", "COST-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  XSS — multi-language
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-xss-php-echo",
    description: "Reflected XSS via PHP echo without htmlspecialchars",
    language: "php",
    code: `<?php
$name = $_GET['name'];
echo "<h1>Welcome, " . $name . "</h1>";
echo "<p>Your search: " . $_POST['query'] . "</p>";
?>`,
    expectedRuleIds: ["CYBER-001"],
    category: "xss",
    difficulty: "easy",
  },
  {
    id: "sec-deep-xss-ruby-html-safe",
    description: "XSS in Ruby via html_safe on user input",
    language: "ruby",
    code: `class CommentsController < ApplicationController
  def show
    @comment = Comment.find(params[:id])
    @rendered = @comment.body.html_safe
  end
end`,
    expectedRuleIds: ["CYBER-001"],
    category: "xss",
    difficulty: "medium",
  },
  {
    id: "sec-deep-xss-go-fprintf",
    description: "XSS in Go via fmt.Fprintf without escaping",
    language: "go",
    code: `package main

import (
  "fmt"
  "net/http"
)

func greetHandler(w http.ResponseWriter, r *http.Request) {
  name := r.URL.Query().Get("name")
  fmt.Fprintf(w, "<h1>Hello %s</h1>", name)
}`,
    expectedRuleIds: [],
    category: "xss",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Hardcoded Credentials — multi-language
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-hardcoded-creds-env-file",
    description: "Hardcoded credentials in environment variable assignments",
    language: "typescript",
    code: `const config = {
  DB_HOST: "postgres.internal.company.com",
  DB_USER: "admin",
  DB_PASSWORD: "Pr0duct10n_P@ss!",
  STRIPE_SECRET_KEY: "sk_test_FAKE_KEY_FOR_BENCHMARK_TEST",
  JWT_SECRET: "my-super-secret-jwt-key-2024",
  REDIS_PASSWORD: "r3d1s_s3cur3_key",
};`,
    expectedRuleIds: ["AUTH-001", "DATA-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "sec-deep-hardcoded-creds-python-class",
    description: "Hardcoded credentials in Python class",
    language: "python",
    code: `class DatabaseConfig:
    HOST = "db.production.internal"
    PORT = 5432
    USERNAME = "app_user"
    PASSWORD = "X7k#mP9$vL2nQ"
    DATABASE = "production_db"

class AWSConfig:
    ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"
    SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    REGION = "us-east-1"`,
    expectedRuleIds: ["AUTH-001", "DATA-001"],
    category: "auth",
    difficulty: "easy",
  },
  {
    id: "sec-deep-hardcoded-conn-string",
    description: "Hardcoded database connection string with credentials",
    language: "typescript",
    code: `import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgres://admin:s3cret_pw@db.example.com:5432/myapp"
});

export async function getUsers() {
  const result = await pool.query("SELECT * FROM users");
  return result.rows;
}`,
    expectedRuleIds: ["AUTH-001", "DATA-001", "DB-001"],
    category: "auth",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Timing Attacks
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-timing-hmac-compare",
    description: "HMAC verification with === allows timing attack",
    language: "typescript",
    code: `import crypto from "crypto";
import express from "express";

const app = express();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.headers["x-signature"] as string;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET)
    .update(req.body)
    .digest("hex");
  if (signature === expected) {
    processWebhook(req.body);
    res.sendStatus(200);
  } else {
    res.sendStatus(403);
  }
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001", "AUTH-001"],
    category: "security",
    difficulty: "hard",
  },
  {
    id: "sec-deep-timing-api-key",
    description: "API key comparison with == allows timing attack",
    language: "python",
    code: `from flask import Flask, request, abort

app = Flask(__name__)
API_KEY = "sk-prod-abc123xyz789"

@app.before_request
def check_api_key():
    key = request.headers.get("X-API-Key")
    if key != API_KEY:
        abort(403)`,
    expectedRuleIds: ["AUTH-001"],
    category: "auth",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Insecure HTTP
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-http-auth-endpoint",
    description: "Authentication over insecure HTTP",
    language: "typescript",
    code: `async function login(username: string, password: string) {
  const response = await fetch("http://api.production.com/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return response.json();
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Insecure Websocket
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-insecure-websocket",
    description: "WebSocket connection over insecure ws:// protocol",
    language: "typescript",
    code: `const socket = new WebSocket("ws://api.example.com/realtime");

socket.onopen = () => {
  socket.send(JSON.stringify({ token: authToken, action: "subscribe" }));
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  updateDashboard(data);
};`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Debug Mode / Admin Backdoor
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-debug-mode-flask",
    description: "Flask running in debug mode in production",
    language: "python",
    code: `from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
    return "Hello World"

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=80)`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "easy",
  },
  {
    id: "sec-deep-admin-backdoor",
    description: "Hardcoded admin credentials as backdoor",
    language: "typescript",
    code: `import express from "express";
const app = express();
app.use(express.json());

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "admin" && password === "admin123!") {
    res.json({ token: generateToken({ role: "superadmin" }) });
    return;
  }
  const user = authenticateUser(username, password);
  if (user) {
    res.json({ token: generateToken(user) });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});`,
    expectedRuleIds: ["CYBER-001", "AUTH-001"],
    category: "auth",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Weak CSP / Security Headers
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-weak-csp",
    description: "CSP with unsafe-inline and unsafe-eval defeats XSS protection",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'"
  );
  next();
});

app.get("/", (req, res) => {
  res.send("<html><body>Hello</body></html>");
});`,
    expectedRuleIds: ["A11Y-001", "I18N-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Insecure Session Config
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-insecure-session",
    description: "Express session with weak secret and no secure cookie flags",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";

const app = express();
app.use(session({
  secret: "keyboard cat",
  resave: false,
  saveUninitialized: true,
}));

app.get("/dashboard", (req, res) => {
  if (!req.session.userId) {
    res.redirect("/login");
  }
  res.send("Dashboard");
});`,
    expectedRuleIds: ["CYBER-001", "AUTH-001"],
    category: "auth",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Header Injection / CRLF
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-crlf-header-injection",
    description: "HTTP header injection via user-controlled header value",
    language: "typescript",
    code: `import express from "express";
const app = express();

app.get("/redirect", (req, res) => {
  const location = req.query.url as string;
  res.setHeader("Location", location);
  res.status(302).send("Redirecting...");
});`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  PHP File Inclusion
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-php-lfi",
    description: "PHP local file inclusion via user-controlled include path",
    language: "php",
    code: `<?php
$page = $_GET['page'];
include("pages/" . $page . ".php");
?>`,
    expectedRuleIds: ["CYBER-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sec-deep-php-rfi",
    description: "PHP remote file inclusion via require with user variable",
    language: "php",
    code: `<?php
$module = $_GET['module'];
require($module);
?>`,
    expectedRuleIds: ["CYBER-001"],
    category: "injection",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Format String Attack
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-format-string-python",
    description: "Format string attack via user-controlled .format() template",
    language: "python",
    code: `from flask import Flask, request

app = Flask(__name__)

@app.route('/greet')
def greet():
    template = request.args.get('template', 'Hello {name}!')
    name = request.args.get('name', 'World')
    return template.format(name=name, config=app.config)`,
    expectedRuleIds: ["SEC-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Insecure Encryption Config
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-go-cipher-no-gcm",
    description: "Go AES without GCM mode exposes data integrity risk",
    language: "go",
    code: `package main

import (
  "crypto/aes"
  "crypto/cipher"
)

func encrypt(key, plaintext []byte) ([]byte, error) {
  block, err := aes.NewCipher(key)
  if err != nil {
    return nil, err
  }
  iv := make([]byte, aes.BlockSize)
  stream := cipher.NewCFBEncrypter(block, iv)
  ciphertext := make([]byte, len(plaintext))
  stream.XORKeyStream(ciphertext, plaintext)
  return ciphertext, nil
}`,
    expectedRuleIds: ["SEC-001", "CYBER-001"],
    category: "security",
    difficulty: "hard",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Hardcoded Secrets in Docker/K8s
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-dockerfile-secrets",
    description: "Dockerfile with hardcoded secrets in ENV",
    language: "dockerfile",
    code: `FROM node:18-alpine
WORKDIR /app
COPY . .
ENV DATABASE_URL=postgres://admin:secretpass@db:5432/prod
ENV JWT_SECRET=my-production-jwt-secret
ENV AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
RUN npm install
CMD ["node", "server.js"]`,
    expectedRuleIds: ["AUTH-001", "DATA-001"],
    category: "auth",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Insecure Mobile Code
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-kotlin-webview",
    description: "Kotlin WebView with JavaScript enabled loading user URL",
    language: "kotlin",
    code: `import android.webkit.WebView
import android.os.Bundle
import android.app.Activity

class BrowserActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        val url = intent.getStringExtra("url") ?: "https://example.com"
        webView.loadUrl(url)
        setContentView(webView)
    }
}`,
    expectedRuleIds: ["CYBER-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Eval / Dynamic Code Execution
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-eval-template-engine",
    description: "Eval used as template engine with user input",
    language: "javascript",
    code: `const express = require("express");
const app = express();

app.get("/calc", (req, res) => {
  const expression = req.query.expr;
  try {
    const result = eval(expression);
    res.json({ result });
  } catch (e) {
    res.status(400).json({ error: "Invalid expression" });
  }
});`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },
  {
    id: "sec-deep-eval-python-exec",
    description: "Python exec() with user code — RCE",
    language: "python",
    code: `from flask import Flask, request

app = Flask(__name__)

@app.route('/run', methods=['POST'])
def run_code():
    code = request.form.get('code')
    namespace = {}
    exec(code, namespace)
    return str(namespace.get('result', 'No result'))`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "injection",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  Unsafe Rust
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "sec-deep-rust-unsafe-deref",
    description: "Rust unsafe raw pointer dereference without safety comment",
    language: "rust",
    code: `pub fn process_buffer(ptr: *const u8, len: usize) -> Vec<u8> {
    let mut result = Vec::new();
    unsafe {
        let slice = std::slice::from_raw_parts(ptr, len);
        for &byte in slice {
            result.push(byte ^ 0xFF);
        }
    }
    result
}

pub fn transmute_cast<T, U>(value: T) -> U {
    unsafe {
        std::mem::transmute_copy(&value)
    }
}`,
    expectedRuleIds: ["CYBER-001", "SEC-001"],
    category: "security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLEAN SECURITY CODE — FP Validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "clean-sec-parameterized-queries",
    description: "Clean: SQL queries using parameterized statements",
    language: "typescript",
    code: `import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function getUserById(id: string) {
  const result = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [id]);
  return result.rows[0];
}

export async function searchUsers(term: string, limit: number) {
  const result = await pool.query(
    "SELECT id, name FROM users WHERE name ILIKE $1 LIMIT $2",
    [\`%\${term}%\`, Math.min(limit, 100)]
  );
  return result.rows;
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-bcrypt-auth",
    description: "Clean: Authentication with bcrypt and proper session management",
    language: "typescript",
    code: `import bcrypt from "bcrypt";
import crypto from "crypto";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-input-validation",
    description: "Clean: Express routes with Zod input validation",
    language: "typescript",
    code: `import express from "express";
import { z } from "zod";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().min(13).max(150),
});

app.post("/users", async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.issues });
  }
  const user = await createUser(parsed.data);
  res.status(201).json(user);
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-csrf-protection",
    description: "Clean: Express with CSRF protection and secure cookies",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";
import csrf from "csurf";
import helmet from "helmet";

const app = express();
app.use(helmet());
app.use(express.urlencoded({ extended: false }));
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, httpOnly: true, sameSite: "strict", maxAge: 3600000 },
}));
app.use(csrf());

app.post("/transfer", (req, res) => {
  const { to, amount } = req.body;
  transferFunds(req.session.userId!, to, Number(amount));
  res.json({ success: true });
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-jwt-proper",
    description: "Clean: JWT with algorithm restriction and proper verification",
    language: "typescript",
    code: `import jwt from "jsonwebtoken";
import express from "express";

const app = express();
const JWT_SECRET = process.env.JWT_SECRET!;

function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.sendStatus(401);
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    req.user = payload;
    next();
  } catch {
    res.sendStatus(403);
  }
}

app.get("/api/profile", authenticateToken, (req, res) => {
  res.json(req.user);
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-python-secure-api",
    description: "Clean: Python FastAPI with security best practices",
    language: "python",
    code: `from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr, constr
import bcrypt
import secrets

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class UserCreate(BaseModel):
    email: EmailStr
    password: constr(min_length=12)
    name: constr(min_length=1, max_length=100)

@app.post("/users", status_code=201)
async def create_user(user: UserCreate):
    hashed = bcrypt.hashpw(user.password.encode(), bcrypt.gensalt(12))
    return await save_user(user.email, user.name, hashed)

@app.get("/profile")
async def get_profile(token: str = Depends(oauth2_scheme)):
    user = await verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return {"email": user.email, "name": user.name}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-go-secure-handler",
    description: "Clean: Go HTTP handler with input validation and parameterized query",
    language: "go",
    code: `package main

import (
  "database/sql"
  "encoding/json"
  "net/http"
  "regexp"
)

var emailRegex = regexp.MustCompile("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")

type CreateUserRequest struct {
  Name  string \`json:"name"\`
  Email string \`json:"email"\`
}

func createUserHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    var req CreateUserRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      http.Error(w, "Invalid JSON", http.StatusBadRequest)
      return
    }
    if len(req.Name) < 1 || len(req.Name) > 100 {
      http.Error(w, "Invalid name", http.StatusBadRequest)
      return
    }
    if !emailRegex.MatchString(req.Email) {
      http.Error(w, "Invalid email", http.StatusBadRequest)
      return
    }
    _, err := db.Exec("INSERT INTO users (name, email) VALUES ($1, $2)", req.Name, req.Email)
    if err != nil {
      http.Error(w, "Internal error", http.StatusInternalServerError)
      return
    }
    w.WriteHeader(http.StatusCreated)
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-rust-safe-crypto",
    description: "Clean: Rust crypto with ring library — no unsafe blocks",
    language: "rust",
    code: `use ring::hmac;
use ring::rand::{SecureRandom, SystemRandom};

pub fn generate_token() -> Result<String, ring::error::Unspecified> {
    let rng = SystemRandom::new();
    let mut token = vec![0u8; 32];
    rng.fill(&mut token)?;
    Ok(hex::encode(token))
}

pub fn verify_hmac(key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    let hmac_key = hmac::Key::new(hmac::HMAC_SHA256, key);
    hmac::verify(&hmac_key, message, signature).is_ok()
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-java-prepared-stmt",
    description: "Clean: Java with PreparedStatement and input validation",
    language: "java",
    code: `import javax.servlet.http.*;
import java.sql.*;

public class UserServlet extends HttpServlet {
    private final DataSource dataSource;

    public UserServlet(DataSource ds) { this.dataSource = ds; }

    protected void doGet(HttpServletRequest req, HttpServletResponse resp)
            throws java.io.IOException {
        String idParam = req.getParameter("id");
        if (idParam == null || !idParam.matches("\\\\d+")) {
            resp.sendError(400, "Invalid ID");
            return;
        }
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                 "SELECT id, name, email FROM users WHERE id = ?")) {
            ps.setLong(1, Long.parseLong(idParam));
            ResultSet rs = ps.executeQuery();
            if (rs.next()) {
                resp.getWriter().println(rs.getString("name"));
            } else {
                resp.sendError(404, "Not found");
            }
        } catch (SQLException e) {
            resp.sendError(500, "Internal error");
        }
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-csharp-ef-core",
    description: "Clean: C# Entity Framework Core with model validation",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

public class CreateUserDto
{
    [Required, StringLength(100, MinimumLength = 1)]
    public string Name { get; set; }

    [Required, EmailAddress]
    public string Email { get; set; }
}

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;

    public UsersController(AppDbContext db) => _db = db;

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(int id)
    {
        var user = await _db.Users.FindAsync(id);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateUserDto dto)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var user = new User { Name = dto.Name, Email = dto.Email };
        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = user.Id }, user);
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-ruby-strong-params",
    description: "Clean: Rails controller with strong parameters and validation",
    language: "ruby",
    code: `class UsersController < ApplicationController
  before_action :authenticate_user!

  def create
    @user = User.new(user_params)
    if @user.save
      render json: @user, status: :created
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  def update
    @user = User.find(params[:id])
    authorize @user
    if @user.update(user_params)
      render json: @user
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def user_params
    params.require(:user).permit(:name, :email)
  end
end`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-php-pdo-prepared",
    description: "Clean: PHP with PDO prepared statements and validation",
    language: "php",
    code: `<?php
declare(strict_types=1);

function getUserById(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare("SELECT id, name, email FROM users WHERE id = :id");
    $stmt->execute(['id' => $id]);
    return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
}

function createUser(PDO $pdo, string $name, string $email): int {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException("Invalid email");
    }
    if (strlen($name) < 1 || strlen($name) > 100) {
        throw new InvalidArgumentException("Invalid name length");
    }
    $stmt = $pdo->prepare("INSERT INTO users (name, email) VALUES (:name, :email)");
    $stmt->execute(['name' => $name, 'email' => $email]);
    return (int) $pdo->lastInsertId();
}
?>`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-python-defusedxml",
    description: "Clean: Python XML parsing with defusedxml",
    language: "python",
    code: `import defusedxml.ElementTree as ET
from flask import Flask, request

app = Flask(__name__)

@app.route('/parse', methods=['POST'])
def parse_xml():
    try:
        tree = ET.fromstring(request.data)
        items = [elem.text for elem in tree.findall('.//item')]
        return {"items": items}
    except ET.ParseError:
        return {"error": "Invalid XML"}, 400`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-go-template-safe",
    description: "Clean: Go HTML template with auto-escaping",
    language: "go",
    code: `package main

import (
  "html/template"
  "net/http"
)

var tmpl = template.Must(template.ParseFiles("templates/greet.html"))

func greetHandler(w http.ResponseWriter, r *http.Request) {
  name := r.URL.Query().Get("name")
  if len(name) > 100 {
    http.Error(w, "Name too long", http.StatusBadRequest)
    return
  }
  data := struct{ Name string }{Name: name}
  tmpl.Execute(w, data)
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-kotlin-secure-app",
    description: "Clean: Kotlin Spring Boot with security configuration",
    language: "kotlin",
    code: `import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
@EnableWebSecurity
class SecurityConfig {
    @Bean
    fun passwordEncoder() = BCryptPasswordEncoder(12)

    @Bean
    fun securityFilterChain(http: HttpSecurity) = http
        .csrf { it.enable() }
        .authorizeHttpRequests { auth ->
            auth.requestMatchers("/api/public/**").permitAll()
                .anyRequest().authenticated()
        }
        .sessionManagement { session ->
            session.maximumSessions(1)
        }
        .build()
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-csharp-anti-forgery",
    description: "Clean: ASP.NET controller with anti-forgery and authorization",
    language: "csharp",
    code: `using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Antiforgery;

[ApiController]
[Authorize]
[Route("api/[controller]")]
public class TransferController : ControllerBase
{
    private readonly ITransferService _service;

    public TransferController(ITransferService service) => _service = service;

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Transfer([FromBody] TransferRequest request)
    {
        if (!ModelState.IsValid) return BadRequest(ModelState);
        var userId = User.FindFirst("sub")?.Value;
        if (userId == null) return Unauthorized();
        await _service.Transfer(userId, request.To, request.Amount);
        return Ok(new { success = true });
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-python-safe-redirect",
    description: "Clean: Python Flask with validated redirect URL",
    language: "python",
    code: `from flask import Flask, request, redirect, abort
from urllib.parse import urlparse

app = Flask(__name__)

ALLOWED_HOSTS = {"example.com", "app.example.com"}

def is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    if not parsed.scheme or parsed.scheme not in ("http", "https"):
        return parsed.path.startswith("/")
    return parsed.hostname in ALLOWED_HOSTS

@app.route('/redirect')
def safe_redirect():
    target = request.args.get('url', '/')
    if not is_safe_url(target):
        abort(400, "Invalid redirect URL")
    return redirect(target)`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-swift-secure-networking",
    description: "Clean: Swift with URLSession and certificate pinning",
    language: "swift",
    code: `import Foundation
import Security

class SecureNetworkService: NSObject, URLSessionDelegate {
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.default
        config.tlsMinimumSupportedProtocolVersion = .TLSv12
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()

    func fetchData(from url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw NetworkError.invalidResponse
        }
        return data
    }

    func urlSession(_ session: URLSession,
                    didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard let trust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        let policy = SecPolicyCreateSSL(true, challenge.protectionSpace.host as CFString)
        SecTrustSetPolicies(trust, policy)
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-sec-rust-safe-parsing",
    description: "Clean: Rust safe string parsing without unsafe",
    language: "rust",
    code: `use std::collections::HashMap;

/// Parse query string into key-value pairs safely.
pub fn parse_query_string(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = parts.next().unwrap_or("").to_string();
            if key.is_empty() { None } else { Some((key, value)) }
        })
        .collect()
}

/// Validate and sanitize user name input.
pub fn sanitize_name(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() || trimmed.len() > 100 {
        return None;
    }
    if trimmed.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-') {
        Some(trimmed.to_string())
    } else {
        None
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-python-crypto-proper",
    description: "Clean: Python with proper cryptography (Fernet symmetric encryption)",
    language: "python",
    code: `from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os
import base64

def derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))

def encrypt_data(data: str, password: str) -> tuple[bytes, bytes]:
    salt = os.urandom(16)
    key = derive_key(password, salt)
    f = Fernet(key)
    return f.encrypt(data.encode()), salt

def decrypt_data(token: bytes, password: str, salt: bytes) -> str:
    key = derive_key(password, salt)
    f = Fernet(key)
    return f.decrypt(token).decode()`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-java-spring-security",
    description: "Clean: Java Spring Security configuration with CORS and CSRF",
    language: "java",
    code: `import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse()))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .sessionManagement(session -> session
                .maximumSessions(1)
                .sessionFixation().newSession()
            )
            .headers(headers -> headers
                .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
            );
        return http.build();
    }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-sec-go-rate-limited-api",
    description: "Clean: Go API with rate limiting and input validation",
    language: "go",
    code: `package main

import (
  "encoding/json"
  "net/http"
  "sync"
  "time"
  "golang.org/x/time/rate"
)

type visitor struct {
  limiter  *rate.Limiter
  lastSeen time.Time
}

var (
  mu       sync.Mutex
  visitors = make(map[string]*visitor)
)

func getVisitor(ip string) *rate.Limiter {
  mu.Lock()
  defer mu.Unlock()
  v, exists := visitors[ip]
  if !exists {
    limiter := rate.NewLimiter(10, 30)
    visitors[ip] = &visitor{limiter: limiter, lastSeen: time.Now()}
    return limiter
  }
  v.lastSeen = time.Now()
  return v.limiter
}

func rateLimitMiddleware(next http.Handler) http.Handler {
  return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    limiter := getVisitor(r.RemoteAddr)
    if !limiter.Allow() {
      http.Error(w, "Too many requests", http.StatusTooManyRequests)
      return
    }
    next.ServeHTTP(w, r)
  })
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-sec-php-password-hash",
    description: "Clean: PHP modern password hashing with password_hash",
    language: "php",
    code: `<?php
declare(strict_types=1);

function registerUser(PDO $pdo, string $email, string $password): int {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new InvalidArgumentException("Invalid email");
    }
    if (strlen($password) < 12) {
        throw new InvalidArgumentException("Password too short");
    }
    $hash = password_hash($password, PASSWORD_ARGON2ID, [
        'memory_cost' => 65536,
        'time_cost' => 4,
        'threads' => 3,
    ]);
    $stmt = $pdo->prepare("INSERT INTO users (email, password_hash) VALUES (:email, :hash)");
    $stmt->execute(['email' => $email, 'hash' => $hash]);
    return (int) $pdo->lastInsertId();
}

function verifyLogin(PDO $pdo, string $email, string $password): bool {
    $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE email = :email");
    $stmt->execute(['email' => $email]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return false;
    return password_verify($password, $row['password_hash']);
}
?>`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-sec-sanitized-template",
    description: "Clean: Handlebars template with auto-escaping (no raw HTML)",
    language: "typescript",
    code: `import Handlebars from "handlebars";
import express from "express";
import helmet from "helmet";
import DOMPurify from "isomorphic-dompurify";

const app = express();
app.use(helmet());

const template = Handlebars.compile("<h1>Hello {{name}}</h1><p>{{message}}</p>");

app.get("/greet", (req, res) => {
  const name = String(req.query.name || "Guest").slice(0, 100);
  const message = DOMPurify.sanitize(String(req.query.message || "Welcome"));
  res.send(template({ name, message }));
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-sec-yaml-safe-load",
    description: "Clean: Python YAML with safe_load",
    language: "python",
    code: `import yaml
from pathlib import Path

def load_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")
    with open(path) as f:
        config = yaml.safe_load(f)
    if not isinstance(config, dict):
        raise ValueError("Invalid config format")
    return config`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
];
