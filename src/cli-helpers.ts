import { existsSync, readdirSync, statSync } from "fs";
import { resolve, extname, relative, join } from "path";

export interface ParsedCliArgs {
  command?: string;
  file?: string;
  format?: string;
  judge?: string;
  baseline?: string;
  config?: string;
  preset?: string;
  minScore?: number;
  language?: string;
  plugins?: string[];
  include?: string[];
  exclude?: string[];
  maxFiles?: number;
  failOnFindings?: boolean;
  help?: boolean;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args: ParsedCliArgs = { include: [], exclude: [], plugins: [] };
  let i = 0;
  if (argv.length > 0 && !argv[0].startsWith("-")) {
    args.command = argv[i++];
  }
  for (; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--file":
      case "-f":
        args.file = argv[++i];
        break;
      case "--format":
        args.format = argv[++i];
        break;
      case "--judge":
      case "-j":
        args.judge = argv[++i];
        break;
      case "--baseline":
        args.baseline = argv[++i];
        break;
      case "--config":
        args.config = argv[++i];
        break;
      case "--preset":
        args.preset = argv[++i];
        break;
      case "--min-score":
        args.minScore = parseInt(argv[++i], 10);
        break;
      case "--language":
      case "-l":
        args.language = argv[++i];
        break;
      case "--plugins":
        args.plugins!.push(argv[++i]);
        break;
      case "--include":
        args.include!.push(argv[++i]);
        break;
      case "--exclude":
        args.exclude!.push(argv[++i]);
        break;
      case "--max-files":
        args.maxFiles = parseInt(argv[++i], 10);
        break;
      case "--fail-on-findings":
        args.failOnFindings = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        // ignore unknown flags; let dispatch handle it
        break;
    }
  }
  return args;
}

export function globToRegex(pattern: string): RegExp {
  // Normalize Windows backslashes in the pattern
  const normalized = pattern.replace(/\\/g, "/");

  // Escape all regex meta characters EXCEPT our glob wildcards (*, ?)
  const escapeRegexChars = /[.+^${}()|[\]\\]/g; // safe char class
  let escaped = normalized.replace(escapeRegexChars, "\\$&");

  // Temporarily protect globstar so the single-star replacement won't clobber it
  escaped = escaped.replace(/\*\*/g, "§§GLOBSTAR§§");
  // Replace single * with a single path-segment wildcard
  escaped = escaped.replace(/\*/g, "[^/]*");
  // Replace globstar with an any-depth wildcard (including empty)
  escaped = escaped.replace(/§§GLOBSTAR§§/g, ".*");
  // Optional: support ? for single-character wildcard
  escaped = escaped.replace(/\?/g, ".");

  // Special-case patterns that start with globstar+slash (e.g., **/*.ts) to also
  // match files in the root (i.e., allow the slash segment to be optional).
  escaped = escaped.replace(/^\.\*\//, "(?:.*\/)?");

  return new RegExp(`^${escaped}$`);
}

export function matchesGlob(filePath: string, patterns: string[]): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  return patterns.some((p) => globToRegex(p).test(normalizedPath));
}

export interface CollectOptions {
  include?: string[];
  exclude?: string[];
}

export function collectFiles(target: string, options: CollectOptions = {}): string[] {
  const root = resolve(target);
  const include = options.include ?? ["**/*"];
  const exclude = options.exclude ?? [];
  const files: string[] = [];
  const rootBasename = root.split(/[/\\]/).filter(Boolean).pop() ?? "";
  function pathVariants(rel: string): string[] {
    const normalized = rel.replace(/\\/g, "/");
    const withRoot = rootBasename ? `${rootBasename}/${normalized}` : normalized;
    return [normalized, withRoot];
  }
  function matchesAny(rel: string, globs: string[]): boolean {
    return pathVariants(rel).some((candidate) => matchesGlob(candidate, globs));
  }
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      const rel = relative(root, full);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        if (!matchesAny(rel, include)) continue;
        if (exclude.length && matchesAny(rel, exclude)) continue;
        files.push(full);
      }
    }
  }
  if (existsSync(root)) {
    walk(root);
  }
  return files;
}

export interface DispatchTable {
  [command: string]: (argv: string[]) => Promise<void> | void;
}

export async function dispatchCommand(
  command: string | undefined,
  argv: string[],
  dispatchTable: DispatchTable,
): Promise<void> {
  if (!command || !dispatchTable[command]) {
    throw new Error("UNKNOWN_COMMAND");
  }
  await dispatchTable[command](argv);
}
