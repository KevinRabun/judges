import { execFileSync } from "child_process";

export interface GitCommandOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
  trim?: boolean;
}

export function runGit(args: string[], options: GitCommandOptions = {}): string {
  const output = execFileSync("git", args, {
    cwd: options.cwd,
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return options.trim === false ? output : output.trim();
}

export function tryRunGit(args: string[], options: GitCommandOptions = {}): string | null {
  try {
    return runGit(args, options);
  } catch {
    return null;
  }
}

export function parseGitHubRepo(remote: string): string | undefined {
  const sshMatch = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  if (sshMatch) return sshMatch[1];
  const httpsMatch = remote.match(/github\.com\/([^/]+\/[^/.]+)/);
  if (httpsMatch) return httpsMatch[1];
  return undefined;
}

export function normalizeGlobPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

export function stripWildcards(pattern: string): string {
  return pattern.replaceAll("*", "").replaceAll("?", "");
}

export function matchWildcardText(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let lastStarIndex = -1;
  let lastMatchIndex = 0;

  while (valueIndex < value.length) {
    if (
      patternIndex < pattern.length &&
      (pattern[patternIndex] === "?" || pattern[patternIndex] === value[valueIndex])
    ) {
      valueIndex++;
      patternIndex++;
      continue;
    }

    if (patternIndex < pattern.length && pattern[patternIndex] === "*") {
      lastStarIndex = patternIndex;
      patternIndex++;
      lastMatchIndex = valueIndex;
      continue;
    }

    if (lastStarIndex !== -1) {
      patternIndex = lastStarIndex + 1;
      lastMatchIndex++;
      valueIndex = lastMatchIndex;
      continue;
    }

    return false;
  }

  while (patternIndex < pattern.length && pattern[patternIndex] === "*") {
    patternIndex++;
  }

  return patternIndex === pattern.length;
}

export function matchGlobPath(filePath: string, pattern: string): boolean {
  const fileSegments = normalizeGlobPath(filePath).split("/").filter(Boolean);
  const patternSegments = normalizeGlobPath(pattern).split("/").filter(Boolean);
  const memo = new Map<string, boolean>();

  function match(pathIndex: number, patternIndex: number): boolean {
    const key = `${pathIndex}:${patternIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let result: boolean;
    if (patternIndex === patternSegments.length) {
      result = pathIndex === fileSegments.length;
    } else if (patternSegments[patternIndex] === "**") {
      result =
        match(pathIndex, patternIndex + 1) || (pathIndex < fileSegments.length && match(pathIndex + 1, patternIndex));
    } else if (pathIndex < fileSegments.length) {
      result =
        matchWildcardText(fileSegments[pathIndex], patternSegments[patternIndex]) &&
        match(pathIndex + 1, patternIndex + 1);
    } else {
      result = false;
    }

    memo.set(key, result);
    return result;
  }

  return match(0, 0);
}
