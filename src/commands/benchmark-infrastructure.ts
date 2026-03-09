import type { BenchmarkCase } from "./benchmark.js";

/**
 * Infrastructure-as-Code, cloud, configuration, CI/CD, cost, scaling,
 * caching, reliability, and rate limiting benchmark cases.
 *
 * Covers IAC, CLOUD, CFG, CICD, COST, SCALE, CACHE, REL, RATE prefixes.
 */
export const BENCHMARK_INFRASTRUCTURE: BenchmarkCase[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  //  IAC — Infrastructure as Code
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "iac-deep-terraform-public-s3",
    description: "Terraform S3 bucket with public access enabled",
    language: "hcl",
    code: `resource "aws_s3_bucket" "data_bucket" {
  bucket = "my-app-data-bucket"
  acl    = "public-read"

  versioning {
    enabled = false
  }
}

resource "aws_s3_bucket_policy" "public_policy" {
  bucket = aws_s3_bucket.data_bucket.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = ["\${aws_s3_bucket.data_bucket.arn}/*"]
      }
    ]
  })
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-terraform-open-sg",
    description: "Terraform security group allowing all inbound traffic",
    language: "hcl",
    code: `resource "aws_security_group" "web" {
  name        = "web-sg"
  description = "Web server security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-terraform-no-encryption",
    description: "Terraform RDS and EBS without encryption enabled",
    language: "hcl",
    code: `resource "aws_db_instance" "main" {
  allocated_storage    = 100
  engine               = "mysql"
  engine_version       = "8.0"
  instance_class       = "db.t3.medium"
  name                 = "appdb"
  username             = "admin"
  password             = "Password123!"
  publicly_accessible  = true
  storage_encrypted    = false
  skip_final_snapshot  = true
}

resource "aws_ebs_volume" "data" {
  availability_zone = "us-east-1a"
  size              = 500
  encrypted         = false
}

resource "aws_launch_template" "web" {
  name_prefix   = "web-"
  image_id      = "ami-12345678"
  instance_type = "t3.large"

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size = 100
      encrypted   = false
    }
  }
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-deep-dockerfile-root",
    description: "Dockerfile running as root with no security hardening",
    language: "dockerfile",
    code: `FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN apt-get update && apt-get install -y curl wget netcat

EXPOSE 3000 22

ENV NODE_ENV=production
ENV DB_PASSWORD=prod_password_123
ENV API_SECRET=sk-live-abc123

CMD ["node", "server.js"]`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-k8s-privileged-pod",
    description: "Kubernetes pod spec with privileged containers",
    language: "yaml",
    code: `apiVersion: v1
kind: Pod
metadata:
  name: app-pod
spec:
  containers:
  - name: app
    image: myapp:latest
    securityContext:
      privileged: true
      runAsUser: 0
    ports:
    - containerPort: 8080
      hostPort: 8080
    volumeMounts:
    - name: host-root
      mountPath: /host
    env:
    - name: DB_PASSWORD
      value: "production-password-123"
    - name: API_KEY
      value: "sk-live-secret-key"
  volumes:
  - name: host-root
    hostPath:
      path: /
      type: Directory`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLOUD prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "cloud-deep-aws-wildcard-iam",
    description: "AWS IAM policy with wildcard actions and resources",
    language: "json",
    code: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AdminAccess",
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*"
    },
    {
      "Sid": "S3FullAccess",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    },
    {
      "Sid": "LambdaFullAccess",
      "Effect": "Allow",
      "Action": "lambda:*",
      "Resource": "*"
    }
  ]
}`,
    expectedRuleIds: ["DEPS-001"],
    category: "cloud",
    difficulty: "easy",
  },
  {
    id: "cloud-deep-hardcoded-aws-creds",
    description: "AWS SDK usage with hardcoded credentials",
    language: "typescript",
    code: `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  },
});

export async function uploadFile(key: string, body: Buffer) {
  await s3.send(new PutObjectCommand({
    Bucket: "my-app-bucket",
    Key: key,
    Body: body,
  }));
}

const AZURE_STORAGE_KEY = "DefaultEndpointsProtocol=https;AccountName=myaccount;AccountKey=abc123def456==;EndpointSuffix=core.windows.net";
const GCP_SERVICE_KEY = '{"type":"service_account","project_id":"my-project","private_key":"-----BEGIN RSA PRIVATE KEY-----\\nMIIEpA..."}';`,
    expectedRuleIds: ["CLOUD-001", "AUTH-001"],
    category: "cloud",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CFG — Configuration
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "cfg-deep-env-no-validation",
    description: "Environment variables used without validation or defaults",
    language: "typescript",
    code: `const config = {
  port: parseInt(process.env.PORT),
  dbHost: process.env.DB_HOST,
  dbPort: parseInt(process.env.DB_PORT),
  dbName: process.env.DB_NAME,
  apiKey: process.env.API_KEY,
  redisUrl: process.env.REDIS_URL,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT),
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN,
  logLevel: process.env.LOG_LEVEL,
};

export default config;`,
    expectedRuleIds: [],
    category: "configuration",
    difficulty: "easy",
  },
  {
    id: "cfg-deep-mixed-config-sources",
    description: "Configuration scattered across hardcoded values and env vars",
    language: "typescript",
    code: `import express from "express";

const app = express();

const DB_URL = "postgres://admin:password@localhost:5432/myapp";
const REDIS_HOST = "localhost";
const REDIS_PORT = 6379;
const API_TIMEOUT = 5000;

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running");
});

const emailConfig = {
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: "app@gmail.com",
    pass: "app-password-123",
  },
};

const stripeConfig = {
  secretKey: "sk_test_abc123",
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
};`,
    expectedRuleIds: ["SCALE-001", "REL-001", "DB-001", "PORTA-001", "SEC-001"],
    category: "configuration",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  COST — Cost Effectiveness
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "cost-deep-full-table-scan",
    description: "Full table scans on every request without caching",
    language: "typescript",
    code: `import { Pool } from "pg";
import express from "express";

const pool = new Pool();
const app = express();

app.get("/api/dashboard", async (req, res) => {
  const totalUsers = await pool.query("SELECT COUNT(*) FROM users");
  const totalOrders = await pool.query("SELECT COUNT(*) FROM orders");
  const totalRevenue = await pool.query("SELECT SUM(amount) FROM orders");
  const topProducts = await pool.query(
    "SELECT p.name, COUNT(oi.id) as count FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.name ORDER BY count DESC LIMIT 10"
  );
  const recentActivity = await pool.query(
    "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100"
  );
  res.json({
    users: totalUsers.rows[0].count,
    orders: totalOrders.rows[0].count,
    revenue: totalRevenue.rows[0].sum,
    topProducts: topProducts.rows,
    recentActivity: recentActivity.rows,
  });
});`,
    expectedRuleIds: ["SEC-001"],
    category: "cost-effectiveness",
    difficulty: "medium",
  },
  {
    id: "cost-deep-oversized-lambda",
    description: "Lambda function with massive dependencies for simple task",
    language: "typescript",
    code: `import AWS from "aws-sdk";
import _ from "lodash";
import moment from "moment";
import axios from "axios";
import Joi from "joi";

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();

export const handler = async (event: any) => {
  const timestamp = moment().format("YYYY-MM-DD");
  const body = JSON.parse(event.body);
  const name = _.get(body, "name", "unknown");
  const validated = Joi.object({ name: Joi.string().required() }).validate(body);
  if (validated.error) return { statusCode: 400, body: "Invalid" };

  await dynamodb.put({
    TableName: "events",
    Item: { id: event.requestContext.requestId, name, timestamp },
  }).promise();

  return { statusCode: 200, body: JSON.stringify({ message: "OK" }) };
};`,
    expectedRuleIds: ["SCALE-001", "DEPS-001", "PORTA-001", "AICS-001"],
    category: "cost-effectiveness",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCALE — Scalability
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "scale-deep-in-memory-session",
    description: "In-memory session store that doesn't scale horizontally",
    language: "typescript",
    code: `import express from "express";
import crypto from "crypto";

const sessions = new Map<string, any>();
const app = express();

app.post("/login", (req, res) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, {
    userId: req.body.userId,
    createdAt: Date.now(),
    data: {},
  });
  res.cookie("session_id", sessionId);
  res.json({ success: true });
});

app.use((req, res, next) => {
  const sessionId = req.cookies?.session_id;
  if (sessionId && sessions.has(sessionId)) {
    req.session = sessions.get(sessionId);
    next();
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > 3600000) sessions.delete(id);
  }
}, 60000);`,
    expectedRuleIds: [
      "DATA-001",
      "RATE-001",
      "CYBER-001",
      "API-001",
      "PERF-001",
      "COMP-001",
      "CONC-001",
      "ERR-001",
      "AUTH-001",
      "AICS-001",
      "SEC-001",
    ],
    category: "scalability",
    difficulty: "medium",
  },
  {
    id: "scale-deep-local-filesystem-state",
    description: "Application storing state on local filesystem",
    language: "typescript",
    code: `import fs from "fs";
import path from "path";

class FileBasedQueue {
  private queueDir = "/tmp/app-queue";

  constructor() {
    fs.mkdirSync(this.queueDir, { recursive: true });
  }

  enqueue(job: any) {
    const id = Date.now().toString();
    fs.writeFileSync(path.join(this.queueDir, id + ".json"), JSON.stringify(job));
  }

  dequeue(): any | null {
    const files = fs.readdirSync(this.queueDir).sort();
    if (files.length === 0) return null;
    const file = path.join(this.queueDir, files[0]);
    const job = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.unlinkSync(file);
    return job;
  }

  size(): number {
    return fs.readdirSync(this.queueDir).length;
  }
}

const uploadDir = "/var/app/uploads";
function saveUpload(name: string, data: Buffer) {
  fs.writeFileSync(path.join(uploadDir, name), data);
}`,
    expectedRuleIds: ["SCALE-001"],
    category: "scalability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CACHE prefix
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "cache-deep-no-caching-expensive",
    description: "Expensive API calls repeated without caching",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.get("/api/product/:id", async (req, res) => {
  const product = await db.query("SELECT * FROM products WHERE id = $1", [req.params.id]);
  const reviews = await db.query("SELECT * FROM reviews WHERE product_id = $1", [req.params.id]);
  const related = await db.query(
    "SELECT * FROM products WHERE category = $1 AND id != $2 LIMIT 10",
    [product.rows[0].category, req.params.id]
  );
  const pricing = await fetch(\`https://pricing-service.internal/price/\${req.params.id}\`);
  const inventory = await fetch(\`https://inventory-service.internal/stock/\${req.params.id}\`);

  res.json({
    product: product.rows[0],
    reviews: reviews.rows,
    related: related.rows,
    price: await pricing.json(),
    stock: await inventory.json(),
  });
});`,
    expectedRuleIds: ["CYBER-001", "REL-001", "SCALE-001", "API-001", "DB-001", "AICS-001", "SEC-001"],
    category: "caching",
    difficulty: "medium",
  },
  {
    id: "cache-deep-cache-no-ttl",
    description: "Cache implementation with no TTL or eviction policy",
    language: "typescript",
    code: `const cache = new Map<string, any>();

export function getFromCache(key: string): any {
  return cache.get(key);
}

export function setInCache(key: string, value: any): void {
  cache.set(key, value);
}

export async function getCachedUser(userId: string): Promise<User> {
  const cached = cache.get(\`user:\${userId}\`);
  if (cached) return cached;
  const user = await db.findUser(userId);
  cache.set(\`user:\${userId}\`, user);
  return user;
}

export async function getCachedConfig(): Promise<Config> {
  const cached = cache.get("config");
  if (cached) return cached;
  const config = await db.getConfig();
  cache.set("config", config);
  return config;
}`,
    expectedRuleIds: ["CACHE-001"],
    category: "caching",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  REL — Reliability
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "rel-deep-no-retry-external",
    description: "External API calls with no retry or circuit breaker",
    language: "typescript",
    code: `export async function processPayment(order: Order): Promise<PaymentResult> {
  const response = await fetch("https://payment-api.example.com/charge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: order.total, currency: "USD" }),
  });
  return response.json();
}

export async function sendNotification(userId: string, message: string): Promise<void> {
  await fetch("https://notification-service.internal/send", {
    method: "POST",
    body: JSON.stringify({ userId, message }),
  });
}

export async function syncInventory(productId: string): Promise<void> {
  const stock = await fetch(\`https://warehouse-api.example.com/stock/\${productId}\`);
  const data = await stock.json();
  await db.updateStock(productId, data.quantity);
}`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },
  {
    id: "rel-deep-single-point-failure",
    description: "System with single points of failure and no fallback",
    language: "typescript",
    code: `import express from "express";

const UPSTREAM_URL = "https://api.single-provider.com";
const app = express();

app.get("/api/data", async (req, res) => {
  const response = await fetch(\`\${UPSTREAM_URL}/data?q=\${req.query.q}\`);
  if (!response.ok) {
    res.status(502).json({ error: "Upstream failed" });
    return;
  }
  const data = await response.json();
  const enriched = await fetch(\`\${UPSTREAM_URL}/enrich\`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  res.json(await enriched.json());
});

// No fallback, no health check, no timeout config
app.listen(3000);`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  RATE — Rate Limiting
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "rate-deep-auth-no-rate-limit",
    description: "Authentication endpoint with no rate limiting",
    language: "typescript",
    code: `import express from "express";
import bcrypt from "bcrypt";

const app = express();
app.use(express.json());

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });
  const token = generateJWT(user);
  res.json({ token });
});

app.post("/auth/register", async (req, res) => {
  const { email, password, name } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const user = await db.createUser({ email, password: hash, name });
  res.json({ userId: user.id });
});

app.post("/auth/forgot-password", async (req, res) => {
  const user = await db.findUserByEmail(req.body.email);
  if (user) await sendResetEmail(user);
  res.json({ message: "If the email exists, a reset link was sent" });
});

app.listen(3000);`,
    expectedRuleIds: ["RATE-001"],
    category: "rate-limiting",
    difficulty: "medium",
  },
  {
    id: "rate-deep-no-body-limit",
    description: "Express app with no request body size limits",
    language: "typescript",
    code: `import express from "express";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post("/api/upload", async (req, res) => {
  const data = req.body;
  await processUpload(data);
  res.json({ success: true });
});

app.post("/api/import", async (req, res) => {
  const records = req.body.records;
  for (const record of records) {
    await db.insert(record);
  }
  res.json({ imported: records.length });
});

app.post("/api/webhook", async (req, res) => {
  const payload = req.body;
  await processWebhook(payload);
  res.json({ received: true });
});

app.listen(3000);`,
    expectedRuleIds: ["DATA-001", "API-001", "REL-001", "OBS-001", "DOC-001", "CONC-001", "COMPAT-001", "SEC-001"],
    category: "rate-limiting",
    difficulty: "easy",
  },
  {
    id: "rate-deep-file-upload-no-limit",
    description: "File upload endpoint without size or type restrictions",
    language: "typescript",
    code: `import express from "express";
import multer from "multer";

const upload = multer({ dest: "uploads/" });
const app = express();

app.post("/api/upload", upload.single("file"), async (req, res) => {
  const file = req.file!;
  await processFile(file.path);
  res.json({ filename: file.originalname, size: file.size });
});

app.post("/api/bulk-upload", upload.array("files"), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  for (const file of files) {
    await processFile(file.path);
  }
  res.json({ count: files.length });
});

app.listen(3000);`,
    expectedRuleIds: ["RATE-001"],
    category: "rate-limiting",
    difficulty: "easy",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CICD — CI/CD deep
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "cicd-deep-unpinned-actions",
    description: "GitHub Actions with unpinned action versions",
    language: "yaml",
    code: `name: Build and Deploy
on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@master
      - uses: actions/setup-node@latest
      - run: npm ci && npm test
      - uses: docker/build-push-action@main
        with:
          push: true
          tags: myapp:latest
      - uses: appleboy/ssh-action@master
        with:
          host: \${{ secrets.HOST }}
          username: root
          password: \${{ secrets.PASSWORD }}
          script: docker pull myapp:latest && docker run -d myapp:latest`,
    expectedRuleIds: ["CYBER-001"],
    category: "cicd",
    difficulty: "medium",
  },

  // ── IAC: Terraform advanced misconfigurations ──────────────────────────────
  {
    id: "iac-deep-terraform-no-logging",
    description: "Terraform S3 bucket without access logging enabled",
    language: "hcl",
    code: `resource "aws_s3_bucket" "sensitive_data" {
  bucket = "company-financial-records"

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "aws:kms"
      }
    }
  }

  # No logging configuration — compliance violation
}

resource "aws_s3_bucket_versioning" "sensitive_versioning" {
  bucket = aws_s3_bucket.sensitive_data.id
  versioning_configuration {
    status = "Enabled"
  }
}`,
    expectedRuleIds: [],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-deep-terraform-rds-public",
    description: "Terraform RDS instance publicly accessible with weak password",
    language: "hcl",
    code: `resource "aws_db_instance" "production" {
  identifier           = "prod-database"
  engine               = "mysql"
  engine_version       = "8.0"
  instance_class       = "db.m5.large"
  allocated_storage    = 100
  username             = "admin"
  password             = "admin123"
  publicly_accessible  = true
  skip_final_snapshot  = true

  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period = 0
  multi_az                = false

  tags = {
    Environment = "production"
  }
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-terraform-default-vpc",
    description: "Terraform resources deployed in the default VPC",
    language: "hcl",
    code: `data "aws_vpc" "default" {
  default = true
}

resource "aws_instance" "api_server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  subnet_id     = data.aws_vpc.default.main_route_table_id

  vpc_security_group_ids = [aws_security_group.default_sg.id]

  user_data = <<-EOF
    #!/bin/bash
    yum update -y
    yum install -y httpd
    systemctl start httpd
    systemctl enable httpd
  EOF

  tags = {
    Name = "API-Server"
  }
}

resource "aws_security_group" "default_sg" {
  vpc_id = data.aws_vpc.default.id
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-deep-terraform-unencrypted-ebs",
    description: "Terraform EBS volumes without encryption",
    language: "hcl",
    code: `resource "aws_ebs_volume" "data_volume" {
  availability_zone = "us-east-1a"
  size              = 500
  type              = "gp3"
  encrypted         = false

  tags = {
    Name = "data-volume"
  }
}

resource "aws_volume_attachment" "data_attach" {
  device_name = "/dev/sdf"
  volume_id   = aws_ebs_volume.data_volume.id
  instance_id = aws_instance.app_server.id
}`,
    expectedRuleIds: [],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-cloudformation-wildcard",
    description: "CloudFormation template with wildcard IAM policy",
    language: "yaml",
    code: `AWSTemplateFormatVersion: '2010-09-09'
Resources:
  LambdaRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: LambdaFullAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action: '*'
                Resource: '*'
  ApiFunction:
    Type: AWS::Lambda::Function
    Properties:
      Runtime: nodejs18.x
      Handler: index.handler
      Role: !GetAtt LambdaRole.Arn
      Code:
        ZipFile: |
          exports.handler = async (event) => {
            return { statusCode: 200, body: 'OK' };
          };`,
    expectedRuleIds: ["AICS-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-deep-terraform-azure-nsg-any",
    description: "Terraform Azure NSG allowing any inbound traffic",
    language: "hcl",
    code: `resource "azurerm_network_security_group" "web_nsg" {
  name                = "web-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  security_rule {
    name                       = "AllowAll"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_storage_account" "logs" {
  name                     = "companylogsstorage"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_0"
}`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },

  // ── IAC: Kubernetes advanced misconfigurations ─────────────────────────────
  {
    id: "iac-deep-k8s-no-resource-limits",
    description: "Kubernetes Pod without resource limits — risk of resource exhaustion",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api
        image: company/api-server:v2.4.1
        ports:
        - containerPort: 8080
        # No resources block — unbounded CPU and memory usage
        env:
        - name: NODE_ENV
          value: "production"
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: db-config
              key: host`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-deep-k8s-hostnetwork",
    description: "Kubernetes Pod using host network namespace",
    language: "yaml",
    code: `apiVersion: v1
kind: Pod
metadata:
  name: debug-pod
  namespace: production
spec:
  hostNetwork: true
  hostPID: true
  containers:
  - name: debug
    image: busybox:latest
    command: ["sleep", "3600"]
    volumeMounts:
    - name: host-root
      mountPath: /host
  volumes:
  - name: host-root
    hostPath:
      path: /
      type: Directory`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-k8s-default-sa",
    description: "Kubernetes Deployment using default service account with auto-mount",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: default
spec:
  replicas: 2
  selector:
    matchLabels:
      app: payment
  template:
    metadata:
      labels:
        app: payment
    spec:
      # using default service account — auto-mounts API token
      automountServiceAccountToken: true
      containers:
      - name: payment
        image: company/payment:latest
        ports:
        - containerPort: 3000
        env:
        - name: STRIPE_KEY
          value: "sk_live_abcdef123456"`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },
  {
    id: "iac-deep-k8s-latest-tag",
    description: "Kubernetes Deployment using :latest image tag with no pull policy",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-frontend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: company/frontend:latest
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 80
      - name: sidecar-proxy
        image: envoyproxy/envoy:latest
        ports:
        - containerPort: 15001`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-k8s-no-probes",
    description: "Kubernetes Deployment without readiness or liveness probes",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 5
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
      - name: order
        image: company/order-service:v3.1.0
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        # No readiness or liveness probes configured`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "medium",
  },

  // ── IAC: Dockerfile advanced issues ────────────────────────────────────────
  {
    id: "iac-deep-dockerfile-no-healthcheck",
    description: "Dockerfile without HEALTHCHECK instruction",
    language: "dockerfile",
    code: `FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-dockerfile-add-url",
    description: "Dockerfile using ADD with URL instead of COPY/RUN curl",
    language: "dockerfile",
    code: `FROM ubuntu:22.04
RUN apt-get update && apt-get install -y python3 python3-pip
ADD https://example.com/scripts/setup.sh /tmp/setup.sh
RUN chmod +x /tmp/setup.sh && /tmp/setup.sh
ADD https://example.com/config/app.tar.gz /opt/
COPY requirements.txt .
RUN pip3 install -r requirements.txt
COPY . /app
WORKDIR /app
CMD ["python3", "main.py"]`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },
  {
    id: "iac-deep-dockerfile-env-secrets",
    description: "Dockerfile embedding secrets in ENV directives",
    language: "dockerfile",
    code: `FROM python:3.11-slim
WORKDIR /app
ENV DATABASE_URL=postgresql://admin:s3cretP@ss@prod-db.internal:5432/maindb
ENV AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
ENV AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
ENV STRIPE_SECRET_KEY=sk_live_51HxxxxBxxxxDxxxxAxxxxK
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8000"]`,
    expectedRuleIds: ["IAC-001"],
    category: "iac-security",
    difficulty: "easy",
  },

  // ── CICD: Advanced pipeline security issues ────────────────────────────────
  {
    id: "cicd-deep-pr-target-injection",
    description: "GitHub Actions workflow vulnerable to PR title injection",
    language: "yaml",
    code: `name: Comment on PR
on:
  pull_request_target:
    types: [opened, edited]

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ github.event.pull_request.head.sha }}
      - name: Build and Test
        run: |
          echo "PR Title: \${{ github.event.pull_request.title }}"
          npm install
          npm test
      - name: Deploy Preview
        env:
          DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
        run: |
          curl -X POST -H "Authorization: Bearer $DEPLOY_TOKEN" \\
            -d '{"ref": "\${{ github.event.pull_request.head.sha }}"}' \\
            https://api.deploy.example.com/preview`,
    expectedRuleIds: ["CYBER-001"],
    category: "cicd",
    difficulty: "hard",
  },
  {
    id: "cicd-deep-secrets-in-logs",
    description: "CI pipeline printing secrets to build logs",
    language: "yaml",
    code: `name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Debug Environment
        run: |
          echo "Deploying with token: \${{ secrets.DEPLOY_TOKEN }}"
          echo "Database: \${{ secrets.DATABASE_URL }}"
          env | sort
      - name: Deploy
        run: |
          export KUBECONFIG_DATA="\${{ secrets.KUBECONFIG }}"
          echo "$KUBECONFIG_DATA" | base64 -d > kubeconfig
          kubectl --kubeconfig=kubeconfig apply -f k8s/`,
    expectedRuleIds: ["CYBER-001", "SOV-001"],
    category: "cicd",
    difficulty: "easy",
  },
  {
    id: "cicd-deep-no-artifact-integrity",
    description: "CI pipeline building and deploying without artifact verification",
    language: "yaml",
    code: `stages:
  - build
  - deploy

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t registry.example.com/app:$CI_COMMIT_SHA .
    - docker push registry.example.com/app:$CI_COMMIT_SHA
  # No image signing, no SBOM, no vulnerability scan

deploy:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/app app=registry.example.com/app:$CI_COMMIT_SHA
  environment:
    name: production
  # No approval gate, no rollback strategy`,
    expectedRuleIds: ["CICD-001"],
    category: "cicd",
    difficulty: "medium",
  },
  {
    id: "cicd-deep-self-hosted-runner-risk",
    description: "GitHub Actions running untrusted code on self-hosted runners",
    language: "yaml",
    code: `name: CI
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  test:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - name: Install Dependencies
        run: npm install
      - name: Run Tests
        run: npm test
      - name: Lint
        run: npm run lint
      - name: Integration Tests
        env:
          DB_URL: \${{ secrets.DB_URL }}
        run: npm run test:integration`,
    expectedRuleIds: [],
    category: "cicd",
    difficulty: "hard",
  },

  // ── CLOUD: Multi-cloud misconfigurations ───────────────────────────────────
  {
    id: "cloud-deep-azure-public-blob",
    description: "Azure storage container with public blob access",
    language: "hcl",
    code: `resource "azurerm_storage_account" "uploads" {
  name                     = "companyuploads"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = "eastus"
  account_tier             = "Standard"
  account_replication_type = "LRS"
  min_tls_version          = "TLS1_0"

  blob_properties {
    cors_rule {
      allowed_headers    = ["*"]
      allowed_methods    = ["GET", "PUT", "POST", "DELETE"]
      allowed_origins    = ["*"]
      exposed_headers    = ["*"]
      max_age_in_seconds = 86400
    }
  }
}

resource "azurerm_storage_container" "public" {
  name                  = "user-uploads"
  storage_account_name  = azurerm_storage_account.uploads.name
  container_access_type = "blob"
}`,
    expectedRuleIds: ["AICS-001", "IAC-001"],
    category: "cloud",
    difficulty: "medium",
  },
  {
    id: "cloud-deep-gcp-default-network",
    description: "GCP Compute instance on default network with public IP",
    language: "hcl",
    code: `resource "google_compute_instance" "web_server" {
  name         = "web-server-prod"
  machine_type = "e2-medium"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-11"
    }
  }

  network_interface {
    network = "default"
    access_config {
      # Assigns a public IP
    }
  }

  metadata = {
    enable-oslogin = "false"
  }

  metadata_startup_script = <<-EOT
    apt-get update
    apt-get install -y nginx
    echo "Hello" > /var/www/html/index.html
  EOT
}

resource "google_compute_firewall" "allow_all" {
  name    = "allow-all"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }

  source_ranges = ["0.0.0.0/0"]
}`,
    expectedRuleIds: [],
    category: "cloud",
    difficulty: "medium",
  },
  {
    id: "cloud-deep-aws-rds-no-ssl",
    description: "AWS RDS parameter group without SSL enforcement",
    language: "hcl",
    code: `resource "aws_db_parameter_group" "mysql" {
  family = "mysql8.0"
  name   = "prod-mysql-params"

  parameter {
    name  = "require_secure_transport"
    value = "0"
  }

  parameter {
    name  = "log_output"
    value = "NONE"
  }
}

resource "aws_db_instance" "mysql_prod" {
  identifier              = "prod-mysql"
  engine                  = "mysql"
  instance_class          = "db.r5.large"
  allocated_storage       = 200
  username                = "dbadmin"
  password                = var.db_password
  parameter_group_name    = aws_db_parameter_group.mysql.name
  storage_encrypted       = false
  deletion_protection     = false
  backup_retention_period = 1
}`,
    expectedRuleIds: [],
    category: "cloud",
    difficulty: "hard",
  },
  {
    id: "cloud-deep-aws-lambda-vpc-no-nat",
    description: "AWS Lambda in VPC without NAT gateway — no internet access",
    language: "hcl",
    code: `resource "aws_lambda_function" "processor" {
  function_name = "order-processor"
  runtime       = "nodejs18.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda.arn
  filename      = "lambda.zip"
  timeout       = 300
  memory_size   = 1024

  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda.id]
  }

  environment {
    variables = {
      EXTERNAL_API = "https://api.stripe.com"
      SQS_QUEUE    = aws_sqs_queue.orders.url
    }
  }
}

# No NAT Gateway configured — Lambda cannot reach external APIs`,
    expectedRuleIds: [],
    category: "cloud",
    difficulty: "hard",
  },

  // ── CFG: Configuration security issues ─────────────────────────────────────
  {
    id: "cfg-deep-hardcoded-urls",
    description: "Hardcoded service URLs instead of service discovery",
    language: "typescript",
    code: `const SERVICE_CONFIG = {
  authService: "http://10.0.1.45:3001",
  paymentService: "http://10.0.1.46:3002",
  inventoryService: "http://10.0.1.47:3003",
  notificationService: "http://10.0.1.48:3004",
  analyticsService: "http://10.0.1.49:3005",
};

export async function processOrder(order: Order) {
  const user = await fetch(\`\${SERVICE_CONFIG.authService}/users/\${order.userId}\`);
  const stock = await fetch(\`\${SERVICE_CONFIG.inventoryService}/check/\${order.productId}\`);
  await fetch(\`\${SERVICE_CONFIG.paymentService}/charge\`, {
    method: "POST",
    body: JSON.stringify({ amount: order.total }),
  });
  await fetch(\`\${SERVICE_CONFIG.notificationService}/send\`, {
    method: "POST",
    body: JSON.stringify({ userId: order.userId, message: "Order placed" }),
  });
}`,
    expectedRuleIds: ["DATA-001", "REL-001", "SCALE-001", "COMP-001", "SOV-001", "MAINT-001", "RATE-001"],
    category: "configuration",
    difficulty: "medium",
  },
  {
    id: "cfg-deep-plaintext-secrets-yaml",
    description: "Application config file with plaintext secrets",
    language: "yaml",
    code: `# config/production.yml
server:
  port: 8080
  host: 0.0.0.0

database:
  host: prod-db.internal.example.com
  port: 5432
  name: production_db
  username: app_user
  password: Pr0d_P@ssw0rd!2024

redis:
  url: redis://:RedisSecretKey@cache.internal:6379/0

auth:
  jwt_secret: my-super-secret-jwt-key-do-not-share
  oauth_client_secret: 7a8b9c0d1e2f3a4b5c6d7e8f

external_apis:
  stripe_key: sk_live_51HxxxxBxxxxDxxxxAxxxxK
  sendgrid_key: SG.xxxxxxxxxxxxxxxx
  twilio_auth_token: abcdef1234567890`,
    expectedRuleIds: ["CYBER-001", "DB-001"],
    category: "configuration",
    difficulty: "easy",
  },
  {
    id: "cfg-deep-no-schema-validation",
    description: "Config loading without schema validation or type checking",
    language: "typescript",
    code: `import fs from "fs";

export function loadConfig(configPath: string): any {
  const raw = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(raw);

  // No validation, no defaults, no type checking
  return config;
}

const config = loadConfig("./config.json");

export function startServer() {
  const port = config.port; // might be undefined, string, or negative
  const host = config.host; // might be missing
  const maxConnections = config.db.maxConnections; // might throw if db is undefined
  const timeout = config.timeout; // no bounds checking

  console.log(\`Starting on \${host}:\${port}\`);
}`,
    expectedRuleIds: ["SCALE-001", "COST-001"],
    category: "configuration",
    difficulty: "medium",
  },
  {
    id: "cfg-deep-feature-flags-code",
    description: "Feature flags hardcoded in source code instead of config",
    language: "typescript",
    code: `export function processPayment(order: Order) {
  // TODO: Remove after Q2 release
  const USE_NEW_PAYMENT_FLOW = true;
  const ENABLE_DISCOUNT_V2 = false;
  const MAX_RETRY_COUNT = 3;
  const FEATURE_DARK_MODE = true;
  const AB_TEST_CHECKOUT = "variant_b";

  if (USE_NEW_PAYMENT_FLOW) {
    return newPaymentProcessor(order);
  }

  if (ENABLE_DISCOUNT_V2) {
    applyNewDiscountRules(order);
  }

  if (AB_TEST_CHECKOUT === "variant_b") {
    return checkoutVariantB(order);
  }

  return legacyPaymentProcessor(order);
}`,
    expectedRuleIds: ["TEST-001"],
    category: "configuration",
    difficulty: "medium",
  },

  // ── COST: Additional cost-effectiveness issues ─────────────────────────────
  {
    id: "cost-deep-no-resource-tags",
    description: "Cloud resources deployed without cost allocation tags",
    language: "hcl",
    code: `resource "aws_instance" "worker_1" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "c5.4xlarge"
}

resource "aws_instance" "worker_2" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "c5.4xlarge"
}

resource "aws_instance" "worker_3" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "c5.4xlarge"
}

resource "aws_rds_cluster" "analytics" {
  engine         = "aurora-mysql"
  engine_version = "5.7.mysql_aurora.2.11.2"
  master_username = "admin"
  master_password = var.db_password
}

# No tags on any resource — impossible to track costs per team/project`,
    expectedRuleIds: [],
    category: "cost-effectiveness",
    difficulty: "easy",
  },
  {
    id: "cost-deep-over-provisioned-instance",
    description: "Over-provisioned compute resources for simple workloads",
    language: "typescript",
    code: `// serverless.yml config for a simple CRUD API
const serverlessConfig = {
  service: "user-profile-api",
  provider: {
    name: "aws",
    runtime: "nodejs18.x",
    memorySize: 3008,      // Max memory for a simple GET endpoint
    timeout: 900,           // 15-minute timeout for < 100ms operations
  },
  functions: {
    getUser: {
      handler: "handler.getUser",
      memorySize: 3008,
      events: [{ http: { path: "users/{id}", method: "get" } }],
    },
    listUsers: {
      handler: "handler.listUsers",
      memorySize: 3008,
      events: [{ http: { path: "users", method: "get" } }],
    },
    healthCheck: {
      handler: "handler.health",
      memorySize: 3008,
      events: [{ schedule: "rate(1 minute)" }], // Health check every minute
    },
  },
};`,
    expectedRuleIds: [],
    category: "cost-effectiveness",
    difficulty: "medium",
  },

  // ── SCALE: Additional scalability issues ───────────────────────────────────
  {
    id: "scale-deep-sync-queue",
    description: "Synchronous processing instead of async queue-based architecture",
    language: "typescript",
    code: `import express from "express";

const app = express();

app.post("/api/orders", async (req, res) => {
  const order = req.body;

  // Process everything synchronously in the request
  const inventory = await checkInventory(order.items);
  const payment = await chargePayment(order.userId, order.total);
  const receipt = await generateReceipt(order, payment);
  await sendConfirmationEmail(order.userId, receipt);
  await updateAnalytics("order_placed", order);
  await notifyWarehouse(order);
  await updateLoyaltyPoints(order.userId, order.total);
  await syncToERP(order);

  // Response delayed by all sequential operations
  res.json({ orderId: order.id, status: "completed" });
});`,
    expectedRuleIds: ["API-001", "COMP-001", "SEC-001"],
    category: "scalability",
    difficulty: "medium",
  },
  {
    id: "scale-deep-global-singleton-state",
    description: "Global singleton holding state that prevents horizontal scaling",
    language: "typescript",
    code: `class RateLimiter {
  private static instance: RateLimiter;
  private requestCounts: Map<string, { count: number; resetAt: number }> = new Map();
  private blockedIPs: Set<string> = new Set();

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  isAllowed(ip: string): boolean {
    if (this.blockedIPs.has(ip)) return false;

    const now = Date.now();
    const record = this.requestCounts.get(ip);

    if (!record || now > record.resetAt) {
      this.requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
      return true;
    }

    record.count++;
    if (record.count > 100) {
      this.blockedIPs.add(ip);
      return false;
    }
    return true;
  }
}

// Each instance has its own rate limiter — no coordination across replicas`,
    expectedRuleIds: [],
    category: "scalability",
    difficulty: "hard",
  },
  {
    id: "scale-deep-hardcoded-pool-size",
    description: "Hardcoded connection pool size not matching workload",
    language: "typescript",
    code: `import { Pool } from "pg";

const pool = new Pool({
  host: process.env.DB_HOST,
  database: "production",
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  max: 5,                  // Hardcoded low limit for production
  idleTimeoutMillis: 0,    // Connections never idle out
  connectionTimeoutMillis: 0, // Wait forever for connection
});

export async function query(sql: string, params: any[]) {
  const client = await pool.connect(); // Blocks indefinitely when pool exhausted
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// Under load with 100 concurrent requests, 95 will queue behind 5 connections`,
    expectedRuleIds: ["CYBER-001", "PERF-001", "DB-001", "CFG-001"],
    category: "scalability",
    difficulty: "medium",
  },

  // ── CACHE: Advanced caching antipatterns ────────────────────────────────────
  {
    id: "cache-deep-stampede",
    description: "Cache stampede / thundering herd on cache expiry",
    language: "typescript",
    code: `const cache = new Map<string, { value: any; expiry: number }>();

export async function getPopularProducts(): Promise<Product[]> {
  const key = "popular-products";
  const cached = cache.get(key);

  if (cached && cached.expiry > Date.now()) {
    return cached.value;
  }

  // Cache miss — ALL concurrent requests hit the database simultaneously
  const products = await db.query(\`
    SELECT p.*, COUNT(o.id) as order_count
    FROM products p
    JOIN order_items o ON o.product_id = p.id
    WHERE o.created_at > NOW() - INTERVAL '7 days'
    GROUP BY p.id
    ORDER BY order_count DESC
    LIMIT 100
  \`);

  cache.set(key, { value: products, expiry: Date.now() + 60000 });
  return products;
}

// With 1000 concurrent visitors and cache TTL=60s, all 1000 hit DB at once on expiry`,
    expectedRuleIds: ["CACHE-001"],
    category: "caching",
    difficulty: "hard",
  },
  {
    id: "cache-deep-unbounded-growth",
    description: "In-memory cache growing without bounds causing OOM",
    language: "typescript",
    code: `const userCache: Record<string, any> = {};
const sessionCache: Record<string, any> = {};
const queryResultCache: Record<string, any> = {};

export function cacheUser(userId: string, data: any) {
  userCache[userId] = data;
}

export function cacheSession(sessionId: string, data: any) {
  sessionCache[sessionId] = data;
}

export function cacheQueryResult(queryHash: string, result: any) {
  queryResultCache[queryHash] = result;
}

export function getCachedUser(userId: string) {
  return userCache[userId]; // Never evicted, never expired
}

// After processing millions of users, cache grows to gigabytes
// No eviction policy, no max size, no TTL
// Process eventually crashes with ENOMEM`,
    expectedRuleIds: ["AICS-001"],
    category: "caching",
    difficulty: "medium",
  },

  // ── REL: Advanced reliability antipatterns ─────────────────────────────────
  {
    id: "rel-deep-no-graceful-shutdown",
    description: "Server without graceful shutdown handling",
    language: "typescript",
    code: `import express from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();

app.post("/api/orders", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO orders ...", [req.body]);
    await client.query("UPDATE inventory ...", [req.body.items]);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

const server = app.listen(3000, () => {
  console.log("Server started on port 3000");
});

// No SIGTERM/SIGINT handlers
// On deployment: in-flight requests are killed mid-transaction
// Database connections are leaked
// No draining of existing connections`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },
  {
    id: "rel-deep-no-deadletter",
    description: "Message queue consumer without dead letter handling",
    language: "typescript",
    code: `import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL!;

async function processMessages() {
  while (true) {
    const { Messages } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    }));

    if (!Messages) continue;

    for (const msg of Messages) {
      try {
        const payload = JSON.parse(msg.Body!);
        await processOrder(payload);
        await sqs.send(new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: msg.ReceiptHandle!,
        }));
      } catch (error) {
        console.error("Failed to process message:", error);
        // Message returns to queue, gets retried forever
        // No dead letter queue configured
        // Poison messages block the queue permanently
      }
    }
  }
}`,
    expectedRuleIds: ["COST-001", "TEST-001", "CONC-001"],
    category: "reliability",
    difficulty: "hard",
  },
  {
    id: "rel-deep-cascade-failure",
    description: "Synchronous cascading service calls with no fallback",
    language: "typescript",
    code: `export async function getProductPage(productId: string) {
  // All calls are sequential and mandatory — any failure = full page failure
  const product = await fetch(\`http://product-service/products/\${productId}\`).then(r => r.json());
  const reviews = await fetch(\`http://review-service/reviews/\${productId}\`).then(r => r.json());
  const recommendations = await fetch(\`http://rec-service/recommend/\${productId}\`).then(r => r.json());
  const pricing = await fetch(\`http://pricing-service/price/\${productId}\`).then(r => r.json());
  const inventory = await fetch(\`http://inventory-service/stock/\${productId}\`).then(r => r.json());
  const shipping = await fetch(\`http://shipping-service/estimate/\${productId}\`).then(r => r.json());

  return {
    product,
    reviews,
    recommendations,
    pricing,
    inventory,
    shipping,
  };
}
// If review-service is slow, entire page load is delayed
// If any service is down, entire page returns 500`,
    expectedRuleIds: ["REL-001"],
    category: "reliability",
    difficulty: "medium",
  },

  // ── RATE: Advanced rate-limiting omissions ──────────────────────────────────
  {
    id: "rate-deep-graphql-no-depth",
    description: "GraphQL endpoint without query depth or complexity limiting",
    language: "typescript",
    code: `import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";

const typeDefs = \`
  type User {
    id: ID!
    friends: [User!]!
    posts: [Post!]!
  }
  type Post {
    id: ID!
    author: User!
    comments: [Comment!]!
  }
  type Comment {
    id: ID!
    author: User!
    replies: [Comment!]!
  }
  type Query {
    user(id: ID!): User
    users: [User!]!
  }
\`;

const server = new ApolloServer({
  typeDefs,
  resolvers,
  // No depth limiting plugin
  // No query complexity analysis
  // No persisted queries
  // Attacker can craft: { user(id: 1) { friends { friends { friends { posts { comments { replies { replies ... } } } } } } } }
});

startStandaloneServer(server, { listen: { port: 4000 } });`,
    expectedRuleIds: [],
    category: "rate-limiting",
    difficulty: "hard",
  },
  {
    id: "rate-deep-websocket-no-limit",
    description: "WebSocket server without message rate limiting",
    language: "typescript",
    code: `import { WebSocketServer } from "ws";

const wss = new WebSocketServer({ port: 8080 });
const clients = new Map<string, WebSocket>();

wss.on("connection", (ws) => {
  const clientId = crypto.randomUUID();
  clients.set(clientId, ws);

  ws.on("message", (data) => {
    // No per-client rate limiting
    // No message size check
    // No authentication
    const message = JSON.parse(data.toString());

    switch (message.type) {
      case "broadcast":
        // Anyone can broadcast to all clients
        for (const [, client] of clients) {
          client.send(JSON.stringify(message));
        }
        break;
      case "chat":
        handleChat(message);
        break;
    }
  });

  ws.on("close", () => clients.delete(clientId));
});`,
    expectedRuleIds: [],
    category: "rate-limiting",
    difficulty: "medium",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  //  CLEAN infrastructure cases — FP validation
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "clean-iac-terraform-secure",
    description: "Clean: Secure Terraform S3 bucket configuration",
    language: "hcl",
    code: `resource "aws_s3_bucket" "data" {
  bucket = "my-app-data-\${var.environment}"
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-iac-dockerfile-hardened",
    description: "Clean: Hardened Dockerfile with non-root user and multi-stage build",
    language: "dockerfile",
    code: `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

FROM node:20-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget --spider -q http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-iac-k8s-secure-pod",
    description: "Clean: Kubernetes pod with security context and resource limits",
    language: "yaml",
    code: `apiVersion: v1
kind: Pod
metadata:
  name: secure-app
spec:
  serviceAccountName: app-service-account
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
  containers:
  - name: app
    image: myapp:1.2.3@sha256:abc123
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop:
          - ALL
    resources:
      requests:
        memory: "128Mi"
        cpu: "250m"
      limits:
        memory: "256Mi"
        cpu: "500m"
    livenessProbe:
      httpGet:
        path: /health
        port: 8080
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: app-secrets
          key: db-password`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-cfg-validated-config",
    description: "Clean: Environment config with validation and typed defaults",
    language: "typescript",
    code: `import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(5432),
  DB_NAME: z.string().min(1),
  DB_PASSWORD: z.string().min(8),
  REDIS_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGINS: z.string().transform(s => s.split(",")),
});

function loadConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid configuration:", result.error.format());
    process.exit(1);
  }
  return Object.freeze(result.data);
}

export const config = loadConfig();`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-rate-express-limits",
    description: "Clean: Express app with proper rate limiting and body limits",
    language: "typescript",
    code: `import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

const app = express();
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many login attempts" },
});

app.use("/api/", generalLimiter);
app.use("/auth/", authLimiter);

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await authenticateUser(email, password);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const token = generateToken(user);
  res.json({ token });
});

app.listen(3000);`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-rel-retry-circuit",
    description: "Clean: External API call with retry and circuit breaker",
    language: "typescript",
    code: `import CircuitBreaker from "opossum";

const circuitOptions = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

async function fetchWithRetry(url: string, retries = 3, backoff = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return response;
      if (response.status >= 500 && i < retries - 1) {
        await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
        continue;
      }
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, backoff * Math.pow(2, i)));
    }
  }
  throw new Error("Max retries exceeded");
}

const paymentBreaker = new CircuitBreaker(
  (order: Order) => fetchWithRetry("https://payment-api.example.com/charge"),
  circuitOptions
);

paymentBreaker.fallback(() => ({ status: "queued", message: "Payment will be processed shortly" }));`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-cache-with-ttl",
    description: "Clean: Cache with TTL, LRU eviction, and invalidation",
    language: "typescript",
    code: `import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, any>({
  max: 1000,
  ttl: 5 * 60 * 1000,
  updateAgeOnGet: true,
});

export async function getCachedUser(userId: string): Promise<User> {
  const key = \`user:\${userId}\`;
  const cached = cache.get(key);
  if (cached) return cached;
  const user = await db.findUser(userId);
  cache.set(key, user);
  return user;
}

export function invalidateUser(userId: string): void {
  cache.delete(\`user:\${userId}\`);
}

export function clearCategoryCache(category: string): void {
  for (const [key] of cache.entries()) {
    if (key.startsWith(\`category:\${category}\`)) {
      cache.delete(key);
    }
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-scale-redis-session",
    description: "Clean: Redis-backed session store for horizontal scaling",
    language: "typescript",
    code: `import express from "express";
import session from "express-session";
import RedisStore from "connect-redis";
import { createClient } from "redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect();

const app = express();
app.use(session({
  store: new RedisStore({ client: redisClient, prefix: "sess:" }),
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 3600000,
    sameSite: "strict",
  },
}));

app.post("/login", async (req, res) => {
  const user = await authenticate(req.body);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  req.session.userId = user.id;
  res.json({ success: true });
});`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-cloud-aws-iam-least-priv",
    description: "Clean: AWS IAM policy following least privilege principle",
    language: "json",
    code: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3ReadAppBucket",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-app-bucket",
        "arn:aws:s3:::my-app-bucket/*"
      ]
    },
    {
      "Sid": "AllowDynamoDBAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789:table/my-app-table"
    }
  ]
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },

  // ── Additional clean infrastructure cases ──────────────────────────────────
  {
    id: "clean-k8s-secure-deployment",
    description: "Clean: Kubernetes Deployment with all security best practices",
    language: "yaml",
    code: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
  labels:
    app: api-server
    version: v2.4.1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      serviceAccountName: api-server-sa
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 2000
      containers:
      - name: api
        image: company/api-server:v2.4.1@sha256:abc123def456
        imagePullPolicy: Always
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 20
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop: ["ALL"]`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-dockerfile-multi-stage",
    description: "Clean: Multi-stage Dockerfile with security hardening",
    language: "dockerfile",
    code: `# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --production

# Production stage
FROM node:20-alpine AS production
RUN apk add --no-cache tini && \\
    addgroup -g 1001 appgroup && \\
    adduser -D -u 1001 -G appgroup appuser
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./
USER appuser
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-cicd-secure-pipeline",
    description: "Clean: Secure CI/CD pipeline with artifact verification",
    language: "yaml",
    code: `name: Secure CI/CD
on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write
  id-token: write

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --ignore-scripts
      - run: npm audit --audit-level=high
      - run: npm test
      - name: Build
        run: npm run build
      - name: Container scan
        uses: aquasecurity/trivy-action@0.20.0
        with:
          scan-type: fs
          exit-code: 1
          severity: CRITICAL,HIGH
      - name: Sign artifact
        uses: sigstore/cosign-installer@v3
        with:
          cosign-release: 'v2.2.0'`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-terraform-azure-secure",
    description: "Clean: Secure Azure Terraform with private endpoints",
    language: "hcl",
    code: `resource "azurerm_storage_account" "secure" {
  name                     = "companysecurestorage"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"

  network_rules {
    default_action = "Deny"
    ip_rules       = []
    bypass         = ["AzureServices"]
  }

  blob_properties {
    delete_retention_policy {
      days = 30
    }
    versioning_enabled = true
  }

  tags = {
    Environment = "production"
    Team        = "platform"
    CostCenter  = "CC-1234"
  }
}

resource "azurerm_storage_container" "private" {
  name                  = "app-data"
  storage_account_name  = azurerm_storage_account.secure.name
  container_access_type = "private"
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-cfg-vault-secrets",
    description: "Clean: Configuration using HashiCorp Vault for secrets",
    language: "typescript",
    code: `import Vault from "node-vault";
import { z } from "zod";

const ConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  host: z.string().min(1),
  database: z.object({
    host: z.string().min(1),
    port: z.number().int(),
    name: z.string().min(1),
    maxPoolSize: z.number().int().min(1).max(100).default(20),
  }),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<AppConfig> {
  const vault = Vault({
    apiVersion: "v1",
    endpoint: process.env.VAULT_ADDR!,
    token: process.env.VAULT_TOKEN!,
  });

  const secrets = await vault.read("secret/data/app/production");
  const envConfig = {
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    database: {
      host: secrets.data.data.db_host,
      port: parseInt(secrets.data.data.db_port, 10),
      name: secrets.data.data.db_name,
      maxPoolSize: parseInt(process.env.DB_POOL_SIZE || "20", 10),
    },
    logLevel: process.env.LOG_LEVEL || "info",
  };

  return ConfigSchema.parse(envConfig);
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-rel-graceful-shutdown",
    description: "Clean: Server with proper graceful shutdown handling",
    language: "typescript",
    code: `import express from "express";
import { Pool } from "pg";
import { createTerminus } from "@godaddy/terminus";
import http from "http";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
const app = express();

app.post("/api/orders", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO orders (data) VALUES ($1)", [req.body]);
    await client.query("COMMIT");
    res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Failed" });
  } finally {
    client.release();
  }
});

const server = http.createServer(app);

createTerminus(server, {
  signals: ["SIGTERM", "SIGINT"],
  timeout: 30000,
  healthChecks: {
    "/healthz": async () => {
      await pool.query("SELECT 1");
    },
  },
  onSignal: async () => {
    console.log("Shutting down gracefully...");
    await pool.end();
  },
  onShutdown: async () => {
    console.log("Cleanup finished, server is shutting down");
  },
});

server.listen(3000, () => console.log("Server running on 3000"));`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-rate-graphql-depth",
    description: "Clean: GraphQL server with depth and complexity limiting",
    language: "typescript",
    code: `import { ApolloServer } from "@apollo/server";
import depthLimit from "graphql-depth-limit";
import { createComplexityLimitRule } from "graphql-validation-complexity";
import { startStandaloneServer } from "@apollo/server/standalone";

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [
    depthLimit(5),
    createComplexityLimitRule(1000, {
      scalarCost: 1,
      objectCost: 2,
      listFactor: 10,
      onCost: (cost: number) => {
        if (cost > 500) {
          console.warn(\`High complexity query: \${cost}\`);
        }
      },
    }),
  ],
  plugins: [
    {
      async requestDidStart() {
        return {
          async didResolveOperation(ctx) {
            // Reject introspection in production
            if (process.env.NODE_ENV === "production" && ctx.operation?.operation === "query") {
              const isIntrospection = ctx.document.definitions.some(
                (d: any) => d.selectionSet?.selections?.some(
                  (s: any) => s.name?.value?.startsWith("__")
                )
              );
              if (isIntrospection) {
                throw new Error("Introspection disabled in production");
              }
            }
          },
        };
      },
    },
  ],
});

startStandaloneServer(server, { listen: { port: 4000 } });`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-cost-tagged-resources",
    description: "Clean: AWS resources with comprehensive tagging strategy",
    language: "hcl",
    code: `locals {
  common_tags = {
    Environment = var.environment
    Team        = var.team_name
    Project     = var.project_name
    CostCenter  = var.cost_center
    ManagedBy   = "terraform"
    CreatedAt   = timestamp()
  }
}

resource "aws_instance" "worker" {
  count         = var.worker_count
  ami           = data.aws_ami.amazon_linux.id
  instance_type = var.worker_instance_type

  tags = merge(local.common_tags, {
    Name = "worker-\${count.index + 1}"
    Role = "worker"
  })
}

resource "aws_rds_cluster" "analytics" {
  engine                  = "aurora-mysql"
  engine_version          = "8.0.mysql_aurora.3.04.0"
  master_username         = var.db_admin_user
  master_password         = random_password.db.result
  backup_retention_period = 7
  deletion_protection     = true
  storage_encrypted       = true

  tags = merge(local.common_tags, {
    Name = "analytics-db"
    Role = "database"
  })
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "easy",
  },
  {
    id: "clean-scale-distributed-workers",
    description: "Clean: Queue-based async workers for horizontal scaling",
    language: "typescript",
    code: `import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import express from "express";

const sqs = new SQSClient({});
const app = express();

// API handler: enqueue work and return immediately
app.post("/api/orders", async (req, res) => {
  const orderId = crypto.randomUUID();

  await sqs.send(new SendMessageCommand({
    QueueUrl: process.env.ORDER_QUEUE_URL!,
    MessageBody: JSON.stringify({ orderId, ...req.body }),
    MessageGroupId: req.body.userId,
    MessageDeduplicationId: orderId,
  }));

  res.status(202).json({
    orderId,
    status: "accepted",
    statusUrl: \`/api/orders/\${orderId}/status\`,
  });
});

// Status endpoint for polling
app.get("/api/orders/:id/status", async (req, res) => {
  const status = await redis.get(\`order:\${req.params.id}:status\`);
  res.json({ orderId: req.params.id, status: status || "processing" });
});

app.listen(3000);`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "medium",
  },
  {
    id: "clean-cache-stampede-prevention",
    description: "Clean: Cache with stampede prevention using locking",
    language: "typescript",
    code: `import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

async function getWithStampedeProtection<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const lockKey = \`lock:\${key}\`;
  const lockAcquired = await redis.set(lockKey, "1", "EX", 10, "NX");

  if (lockAcquired) {
    try {
      const value = await fetchFn();
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return value;
    } finally {
      await redis.del(lockKey);
    }
  }

  // Another request is refreshing — wait and retry
  await new Promise((resolve) => setTimeout(resolve, 100));
  const retried = await redis.get(key);
  if (retried) return JSON.parse(retried);

  // Fallback: fetch directly if lock holder failed
  return fetchFn();
}

export async function getPopularProducts(): Promise<Product[]> {
  return getWithStampedeProtection(
    "popular-products",
    60,
    () => db.query("SELECT * FROM popular_products_view LIMIT 100")
  );
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-cloud-gcp-secure",
    description: "Clean: Secure GCP Compute instance with private networking",
    language: "hcl",
    code: `resource "google_compute_network" "private" {
  name                    = "private-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "app" {
  name          = "app-subnet"
  ip_cidr_range = "10.0.1.0/24"
  network       = google_compute_network.private.id
  region        = "us-central1"

  private_ip_google_access = true
}

resource "google_compute_instance" "app_server" {
  name         = "app-server"
  machine_type = "e2-medium"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = 20
      type  = "pd-ssd"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.app.id
    # No access_config — no public IP
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  tags = ["app-server", "internal-only"]

  labels = {
    environment = "production"
    team        = "platform"
  }
}

resource "google_compute_firewall" "allow_internal" {
  name    = "allow-internal"
  network = google_compute_network.private.id

  allow {
    protocol = "tcp"
    ports    = ["8080"]
  }

  source_ranges = ["10.0.0.0/8"]
  target_tags   = ["app-server"]
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
  {
    id: "clean-rel-deadletter-queue",
    description: "Clean: Message queue consumer with dead letter handling and retry",
    language: "typescript",
    code: `import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, SendMessageCommand } from "@aws-sdk/client-sqs";

const sqs = new SQSClient({});
const QUEUE_URL = process.env.QUEUE_URL!;
const DLQ_URL = process.env.DLQ_URL!;
const MAX_RETRIES = 3;

interface MessageAttributes {
  retryCount?: number;
}

async function processMessages() {
  while (true) {
    const { Messages } = await sqs.send(new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
      MessageAttributeNames: ["All"],
    }));

    if (!Messages) continue;

    for (const msg of Messages) {
      const retryCount = parseInt(
        msg.MessageAttributes?.retryCount?.StringValue || "0",
        10
      );

      try {
        const payload = JSON.parse(msg.Body!);
        await processOrder(payload);
        await sqs.send(new DeleteMessageCommand({
          QueueUrl: QUEUE_URL,
          ReceiptHandle: msg.ReceiptHandle!,
        }));
      } catch (error) {
        if (retryCount >= MAX_RETRIES) {
          await sqs.send(new SendMessageCommand({
            QueueUrl: DLQ_URL,
            MessageBody: msg.Body!,
            MessageAttributes: {
              error: { DataType: "String", StringValue: String(error) },
              originalQueue: { DataType: "String", StringValue: QUEUE_URL },
            },
          }));
          await sqs.send(new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: msg.ReceiptHandle!,
          }));
          console.error(\`Message sent to DLQ after \${MAX_RETRIES} retries\`, error);
        }
        // Otherwise let visibility timeout expire for automatic retry
      }
    }
  }
}`,
    expectedRuleIds: [],
    category: "clean",
    difficulty: "hard",
  },
];
