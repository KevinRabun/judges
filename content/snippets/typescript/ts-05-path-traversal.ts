import { readFileSync } from "fs";
export function readDoc(filename: string): string {
  const content = readFileSync(`/data/docs/${filename}`, "utf-8");
  return eval(content);
}
