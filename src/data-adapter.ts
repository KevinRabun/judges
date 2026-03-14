/**
 * Pluggable Data Adapter — Storage Abstraction Layer
 *
 * Judges never directly holds or processes user data. Instead, this module
 * defines a `DataAdapter` interface that abstracts all persistence operations.
 * Users can configure their own backend by providing a custom adapter
 * (REST API, database, cloud storage, etc.) via `.judgesrc` or programmatic
 * registration.
 *
 * The default adapter (`FileSystemAdapter`) uses local `.judges-*.json` files
 * in the project directory — no data leaves the developer's machine unless
 * they explicitly configure an external adapter.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import type { FeedbackStore } from "./commands/feedback.js";
import type { FindingStore } from "./finding-lifecycle.js";

// ─── Adapter Interface ──────────────────────────────────────────────────────

/**
 * Storage adapter interface. All data persistence flows through this so
 * users can plug in their own backends (REST, DB, cloud, etc.).
 */
export interface DataAdapter {
  /** Adapter name for diagnostics */
  readonly name: string;

  // ── Feedback ──────────────────────────────────────────────────────────
  loadFeedback(projectDir: string): Promise<FeedbackStore>;
  saveFeedback(store: FeedbackStore, projectDir: string): Promise<void>;

  // ── Finding Lifecycle ─────────────────────────────────────────────────
  loadFindings(projectDir: string): Promise<FindingStore>;
  saveFindings(store: FindingStore, projectDir: string): Promise<void>;

  // ── Snapshots ─────────────────────────────────────────────────────────
  loadSnapshots(projectDir: string): Promise<SnapshotData>;
  saveSnapshots(data: SnapshotData, projectDir: string): Promise<void>;

  // ── Metrics (read-only aggregation) ───────────────────────────────────
  loadMetrics(projectDir: string): Promise<MetricsData>;

  // ── Key-Value (generic config/state) ──────────────────────────────────
  loadJson<T>(key: string, projectDir: string): Promise<T | undefined>;
  saveJson<T>(key: string, data: T, projectDir: string): Promise<void>;
}

/** Snapshot data shape (matches SnapshotStore from snapshot.ts) */
export interface SnapshotData {
  version: 1;
  snapshots: Array<{
    timestamp: string;
    totalFindings: number;
    bySeverity: Record<string, number>;
    byJudge: Record<string, number>;
    score: number;
    verdict: string;
    label?: string;
  }>;
  metadata: {
    createdAt: string;
    lastUpdated: string;
    totalRuns: number;
  };
}

/** Metrics aggregate shape */
export interface MetricsData {
  feedbackStore?: FeedbackStore;
  findingStore?: FindingStore;
  snapshotData?: SnapshotData;
}

// ─── Default File System Adapter ────────────────────────────────────────────

const DEFAULT_FILES = {
  feedback: ".judges-feedback.json",
  findings: ".judges-findings.json",
  snapshots: ".judges-snapshots.json",
};

export class FileSystemAdapter implements DataAdapter {
  readonly name = "filesystem";

  async loadFeedback(projectDir: string): Promise<FeedbackStore> {
    return loadJsonFile<FeedbackStore>(resolve(projectDir, DEFAULT_FILES.feedback)) ?? createEmptyFeedbackStore();
  }

  async saveFeedback(store: FeedbackStore, projectDir: string): Promise<void> {
    store.metadata.lastUpdated = new Date().toISOString();
    saveJsonFile(resolve(projectDir, DEFAULT_FILES.feedback), store);
  }

  async loadFindings(projectDir: string): Promise<FindingStore> {
    return (
      loadJsonFile<FindingStore>(resolve(projectDir, DEFAULT_FILES.findings)) ?? {
        version: "1.0.0",
        lastRunAt: new Date().toISOString(),
        runNumber: 0,
        findings: [],
      }
    );
  }

  async saveFindings(store: FindingStore, projectDir: string): Promise<void> {
    saveJsonFile(resolve(projectDir, DEFAULT_FILES.findings), store);
  }

  async loadSnapshots(projectDir: string): Promise<SnapshotData> {
    return loadJsonFile<SnapshotData>(resolve(projectDir, DEFAULT_FILES.snapshots)) ?? createEmptySnapshotData();
  }

  async saveSnapshots(data: SnapshotData, projectDir: string): Promise<void> {
    data.metadata.lastUpdated = new Date().toISOString();
    saveJsonFile(resolve(projectDir, DEFAULT_FILES.snapshots), data);
  }

  async loadMetrics(projectDir: string): Promise<MetricsData> {
    const [feedbackStore, findingStore, snapshotData] = await Promise.all([
      this.loadFeedback(projectDir),
      this.loadFindings(projectDir),
      this.loadSnapshots(projectDir),
    ]);
    return { feedbackStore, findingStore, snapshotData };
  }

  async loadJson<T>(key: string, projectDir: string): Promise<T | undefined> {
    return loadJsonFile<T>(resolve(projectDir, `.judges-${key}.json`));
  }

  async saveJson<T>(key: string, data: T, projectDir: string): Promise<void> {
    saveJsonFile(resolve(projectDir, `.judges-${key}.json`), data);
  }
}

// ─── HTTP Adapter (user-hosted backend) ─────────────────────────────────────

/**
 * HTTP adapter that sends data to a user-hosted REST endpoint.
 * Users deploy their own backend — judges never processes the data itself.
 *
 * Configuration in .judgesrc:
 * ```json
 * {
 *   "dataAdapter": {
 *     "type": "http",
 *     "url": "https://my-company-judges.internal/api",
 *     "headers": { "Authorization": "Bearer ${JUDGES_API_KEY}" }
 *   }
 * }
 * ```
 */
export class HttpAdapter implements DataAdapter {
  readonly name = "http";
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: { url: string; headers?: Record<string, string> }) {
    this.baseUrl = config.url.replace(/\/+$/, "");
    this.headers = { "Content-Type": "application/json", ...config.headers };
  }

  async loadFeedback(projectDir: string): Promise<FeedbackStore> {
    return (
      (await this.get<FeedbackStore>(`/feedback?project=${encodeURIComponent(projectDir)}`)) ??
      createEmptyFeedbackStore()
    );
  }

  async saveFeedback(store: FeedbackStore, projectDir: string): Promise<void> {
    await this.put(`/feedback?project=${encodeURIComponent(projectDir)}`, store);
  }

  async loadFindings(projectDir: string): Promise<FindingStore> {
    return (
      (await this.get<FindingStore>(`/findings?project=${encodeURIComponent(projectDir)}`)) ?? {
        version: "1.0.0",
        lastRunAt: new Date().toISOString(),
        runNumber: 0,
        findings: [],
      }
    );
  }

  async saveFindings(store: FindingStore, projectDir: string): Promise<void> {
    await this.put(`/findings?project=${encodeURIComponent(projectDir)}`, store);
  }

  async loadSnapshots(projectDir: string): Promise<SnapshotData> {
    return (
      (await this.get<SnapshotData>(`/snapshots?project=${encodeURIComponent(projectDir)}`)) ??
      createEmptySnapshotData()
    );
  }

  async saveSnapshots(data: SnapshotData, projectDir: string): Promise<void> {
    await this.put(`/snapshots?project=${encodeURIComponent(projectDir)}`, data);
  }

  async loadMetrics(projectDir: string): Promise<MetricsData> {
    return (await this.get<MetricsData>(`/metrics?project=${encodeURIComponent(projectDir)}`)) ?? {};
  }

  async loadJson<T>(key: string, projectDir: string): Promise<T | undefined> {
    return this.get<T>(`/data/${encodeURIComponent(key)}?project=${encodeURIComponent(projectDir)}`);
  }

  async saveJson<T>(key: string, data: T, projectDir: string): Promise<void> {
    await this.put(`/data/${encodeURIComponent(key)}?project=${encodeURIComponent(projectDir)}`, data);
  }

  private async get<T>(path: string): Promise<T | undefined> {
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, { headers: this.headers });
      if (!resp.ok) return undefined;
      return (await resp.json()) as T;
    } catch {
      return undefined;
    }
  }

  private async put(path: string, data: unknown): Promise<void> {
    await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(data),
    });
  }
}

// ─── Adapter Registry ───────────────────────────────────────────────────────

let activeAdapter: DataAdapter = new FileSystemAdapter();

/** Get the currently active data adapter. */
export function getDataAdapter(): DataAdapter {
  return activeAdapter;
}

/** Set the active data adapter. */
export function setDataAdapter(adapter: DataAdapter): void {
  activeAdapter = adapter;
}

/**
 * Create a data adapter from `.judgesrc` configuration.
 *
 * Config shape:
 * ```json
 * { "dataAdapter": { "type": "filesystem" } }     // default
 * { "dataAdapter": { "type": "http", "url": "...", "headers": { ... } } }
 * ```
 */
export function createAdapterFromConfig(config: DataAdapterConfig): DataAdapter {
  switch (config.type) {
    case "http":
      if (!config.url) throw new Error("HTTP data adapter requires 'url' in dataAdapter config");
      return new HttpAdapter({
        url: resolveEnvVars(config.url),
        headers: config.headers
          ? Object.fromEntries(Object.entries(config.headers).map(([k, v]) => [k, resolveEnvVars(v)]))
          : undefined,
      });
    case "filesystem":
    default:
      return new FileSystemAdapter();
  }
}

/** Data adapter config shape in .judgesrc */
export interface DataAdapterConfig {
  type: "filesystem" | "http";
  url?: string;
  headers?: Record<string, string>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadJsonFile<T>(filePath: string): T | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

function saveJsonFile(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function createEmptyFeedbackStore(): FeedbackStore {
  const now = new Date().toISOString();
  return {
    version: 1,
    entries: [],
    metadata: { createdAt: now, lastUpdated: now, totalSubmissions: 0 },
  };
}

function createEmptySnapshotData(): SnapshotData {
  const now = new Date().toISOString();
  return {
    version: 1,
    snapshots: [],
    metadata: { createdAt: now, lastUpdated: now, totalRuns: 0 },
  };
}

/** Resolve `${ENV_VAR}` patterns in config strings. */
function resolveEnvVars(str: string): string {
  return str.replace(/\$\{(\w+)\}/g, (_, name: string) => process.env[name] ?? "");
}
