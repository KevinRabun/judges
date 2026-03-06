/**
 * LSP Server — Language Server Protocol implementation for Judges
 *
 * Provides real-time code analysis diagnostics over stdio using the
 * JSON-RPC / LSP protocol. Compatible with any LSP-capable editor:
 * VS Code, Neovim, Emacs, Helix, etc.
 *
 * Usage: judges lsp [--stdio]
 *
 * The server supports:
 * - textDocument/didOpen   → full evaluation
 * - textDocument/didChange → debounced re-evaluation
 * - textDocument/didSave   → full re-evaluation
 * - textDocument/didClose  → clear diagnostics
 * - textDocument/codeAction → quick-fix patches
 */

import { evaluateWithTribunal, type EvaluationOptions } from "../evaluators/index.js";
import {
  findingToDiagnostic,
  findingsToCodeActions,
  type Diagnostic,
  type CodeAction,
} from "../formatters/diagnostics.js";
import { loadCascadingConfig } from "../config.js";
import type { Finding } from "../types.js";

// ─── JSON-RPC Transport ─────────────────────────────────────────────────────

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function sendMessage(msg: JsonRpcMessage): void {
  const body = JSON.stringify(msg);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  process.stdout.write(header + body);
}

function sendResponse(id: number | string, result: unknown): void {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendNotification(method: string, params: unknown): void {
  sendMessage({ jsonrpc: "2.0", method, params });
}

function publishDiagnostics(uri: string, diagnostics: Diagnostic[]): void {
  sendNotification("textDocument/publishDiagnostics", { uri, diagnostics });
}

// ─── Document Store ─────────────────────────────────────────────────────────

const documents = new Map<string, { content: string; version: number; language: string }>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function uriToFilePath(uri: string): string {
  if (uri.startsWith("file:///")) {
    // Windows: file:///c%3A/... → c:/...
    const decoded = decodeURIComponent(uri.slice(8));
    return decoded.replace(/\//g, "/");
  }
  return uri;
}

function detectLanguageFromUri(uri: string): string {
  const ext = uri.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    cs: "csharp",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    c: "cpp",
    h: "cpp",
    hpp: "cpp",
    php: "php",
    rb: "ruby",
    kt: "kotlin",
    kts: "kotlin",
    swift: "swift",
    ps1: "powershell",
    psm1: "powershell",
    tf: "terraform",
    bicep: "bicep",
  };
  return extMap[ext] ?? "unknown";
}

// ─── Evaluation Pipeline ────────────────────────────────────────────────────

const DEBOUNCE_MS = 500;

async function evaluateDocument(uri: string): Promise<void> {
  const doc = documents.get(uri);
  if (!doc) return;

  try {
    const filePath = uriToFilePath(uri);
    const config = loadCascadingConfig(filePath);

    const options: EvaluationOptions = {
      filePath,
      config,
      minConfidence: 0.4,
    };

    const verdict = evaluateWithTribunal(doc.content, doc.language, "", options);
    const diagnostics = verdict.findings.map((f: Finding) => findingToDiagnostic(f, uri));
    publishDiagnostics(uri, diagnostics);
  } catch {
    // Evaluation failure — clear diagnostics silently
    publishDiagnostics(uri, []);
  }
}

function scheduleEvaluation(uri: string): void {
  const existing = pendingTimers.get(uri);
  if (existing) clearTimeout(existing);

  pendingTimers.set(
    uri,
    setTimeout(() => {
      pendingTimers.delete(uri);
      evaluateDocument(uri).catch(() => {});
    }, DEBOUNCE_MS),
  );
}

// ─── LSP Request Handlers ───────────────────────────────────────────────────

let initialized = false;

// Cache of latest findings per URI for code-action requests
const findingsCache = new Map<string, Finding[]>();

function handleInitialize(id: number | string): void {
  sendResponse(id, {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: 2, // Incremental (we take full content anyway)
        save: { includeText: true },
      },
      codeActionProvider: true,
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
    serverInfo: {
      name: "judges-lsp",
      version: "1.0.0",
    },
  });
}

function handleInitialized(): void {
  initialized = true;
}

function handleShutdown(id: number | string): void {
  sendResponse(id, null);
}

function handleDidOpen(params: {
  textDocument: { uri: string; languageId: string; version: number; text: string };
}): void {
  const { uri, languageId, version, text } = params.textDocument;
  const language = languageId || detectLanguageFromUri(uri);
  documents.set(uri, { content: text, version, language });
  // Immediate evaluation on open
  evaluateDocument(uri)
    .then(() => {
      // Cache findings for code actions
      const doc = documents.get(uri);
      if (doc) {
        const filePath = uriToFilePath(uri);
        const config = loadCascadingConfig(filePath);
        const verdict = evaluateWithTribunal(doc.content, doc.language, "", { filePath, config });
        findingsCache.set(uri, verdict.findings);
      }
    })
    .catch(() => {});
}

function handleDidChange(params: {
  textDocument: { uri: string; version: number };
  contentChanges: Array<{ text: string }>;
}): void {
  const { uri, version } = params.textDocument;
  const doc = documents.get(uri);
  if (!doc) return;

  // Take the full content from the last change event
  const lastChange = params.contentChanges[params.contentChanges.length - 1];
  if (lastChange) {
    doc.content = lastChange.text;
    doc.version = version;
  }

  scheduleEvaluation(uri);
}

function handleDidSave(params: { textDocument: { uri: string }; text?: string }): void {
  const uri = params.textDocument.uri;
  const doc = documents.get(uri);
  if (doc && params.text) {
    doc.content = params.text;
  }
  // Re-evaluate immediately on save
  evaluateDocument(uri).catch(() => {});
}

function handleDidClose(params: { textDocument: { uri: string } }): void {
  const uri = params.textDocument.uri;
  documents.delete(uri);
  findingsCache.delete(uri);
  const timer = pendingTimers.get(uri);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(uri);
  }
  // Clear diagnostics for the closed file
  publishDiagnostics(uri, []);
}

function handleCodeAction(
  id: number | string,
  params: { textDocument: { uri: string }; range: unknown; context: { diagnostics: Diagnostic[] } },
): void {
  const uri = params.textDocument.uri;
  const findings = findingsCache.get(uri) ?? [];
  const actions: CodeAction[] = findingsToCodeActions(findings, uri);
  sendResponse(id, actions);
}

// ─── Message Dispatch ────────────────────────────────────────────────────────

function dispatch(msg: JsonRpcMessage): void {
  const method = msg.method;
  const id = msg.id;

  switch (method) {
    case "initialize":
      if (id !== undefined) handleInitialize(id);
      break;
    case "initialized":
      handleInitialized();
      break;
    case "shutdown":
      if (id !== undefined) handleShutdown(id);
      break;
    case "exit":
      process.exit(initialized ? 0 : 1);
      break;
    case "textDocument/didOpen":
      handleDidOpen(msg.params as Parameters<typeof handleDidOpen>[0]);
      break;
    case "textDocument/didChange":
      handleDidChange(msg.params as Parameters<typeof handleDidChange>[0]);
      break;
    case "textDocument/didSave":
      handleDidSave(msg.params as Parameters<typeof handleDidSave>[0]);
      break;
    case "textDocument/didClose":
      handleDidClose(msg.params as Parameters<typeof handleDidClose>[0]);
      break;
    case "textDocument/codeAction":
      if (id !== undefined) handleCodeAction(id, msg.params as Parameters<typeof handleCodeAction>[1]);
      break;
    default:
      // Unknown method — respond with MethodNotFound for requests
      if (id !== undefined) {
        sendMessage({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
      }
  }
}

// ─── Stdio Transport ─────────────────────────────────────────────────────────

/**
 * Start the LSP server on stdio.
 *
 * Reads Content-Length-framed JSON-RPC messages from stdin
 * and writes responses to stdout.
 */
export function runLsp(_argv: string[]): void {
  let buffer = "";
  let contentLength = -1;

  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    while (true) {
      if (contentLength === -1) {
        // Parse headers
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) break;

        const headers = buffer.slice(0, headerEnd);
        const match = headers.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        contentLength = parseInt(match[1], 10);
        buffer = buffer.slice(headerEnd + 4);
      }

      if (buffer.length < contentLength) break;

      const body = buffer.slice(0, contentLength);
      buffer = buffer.slice(contentLength);
      contentLength = -1;

      try {
        const msg = JSON.parse(body) as JsonRpcMessage;
        dispatch(msg);
      } catch {
        // Malformed JSON — skip
      }
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}
