import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  verifyWebhookSignature,
  loadAppConfig,
  runAppCommand,
  detectLanguage,
  generateJwt,
} from "../src/github-app.js";
import { createHmac, generateKeyPairSync } from "crypto";

describe("github-app extended", () => {
  it("verifies webhook signatures and rejects invalid ones", () => {
    const payload = JSON.stringify({ action: "ping" });
    const secret = "shhh";
    const sig = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(verifyWebhookSignature(payload, sig, secret), true);
    assert.equal(verifyWebhookSignature(payload, "sha256=bad", secret), false);
    // Missing signature should fail
    assert.equal(verifyWebhookSignature(payload, undefined, secret), false);
  });

  it("loadAppConfig works when env vars set", () => {
    process.env.JUDGES_APP_ID = "123";
    process.env.JUDGES_PRIVATE_KEY_PATH = "";
    process.env.JUDGES_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----\nMIIBOwIBAAJBAKGec4TxGM0kjYBAtHxn7WpfT8J5cGAcSO4QUMflvlaf986JvS2W\nzRLbBZSMT/QmUWoj+nGzJfFX9mRRsQO6FlgCAwEAAQJAXHmozMr//hSuhPFXPqeh\nIHRmbjqw7cjJ3hnPCNwQ0UKa5WvdmSYfE+sqRNvMuuJ4bb2ZpS6Kx88pJJxVwk03\nwQIhANBmPdxefQQvSiuIkXFkB8MHLwioHtesovbMHurqO1b5AiEAx5rLPzjqPMSi\nlGNkxdt1Cj1gM3tI8D4GqKNYBjKCuEsCIQCPMuLADC7iuThYKWCy7CasyJzZbLg9\n644BGdtAfyJstQIhAL/eb2negG6r00S/5xxWgs04Rd3KyPaaj8PW05bNZ8VBAiBx\nY/ZPo/s+Cs/MB33xkB6QWQZ9uJljNp6sJXf6EDjo4A==\n-----END RSA PRIVATE KEY-----`;
    process.env.JUDGES_WEBHOOK_SECRET = "secret";
    const cfg = loadAppConfig();
    assert.equal(cfg.appId, "123");
  });

  it("runAppCommand handles unknown subcommands gracefully", () => {
    const logs: string[] = [];
    const origLog = console.log;

    console.log = (msg?: any) => logs.push(String(msg ?? "")) as any;
    try {
      runAppCommand(["invalid-subcommand"]);
    } finally {
      console.log = origLog;
    }
    assert.ok(logs.join("\n").toLowerCase().includes("usage"));
  });

  it("detectLanguage and generateJwt helper coverage", () => {
    assert.equal(detectLanguage("src/main.swift"), "swift");
    assert.equal(detectLanguage("Dockerfile"), "dockerfile");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString();
    const jwt = generateJwt("123", pem);
    assert.equal(jwt.split(".").length, 3);
  });

  it("runAppCommand is noop in test dry run", async () => {
    process.env.JUDGES_TEST_DRY_RUN = "1";
    const gh = await import("../src/github-app.js");
    (gh as any).runAppCommand(["serve", "--port", "9999"]);
    // No assertions needed; just ensure no throw and no server started
    delete process.env.JUDGES_TEST_DRY_RUN;
  });
});
