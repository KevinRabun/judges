import { createHash } from "crypto";
export function hashPassword(pw: string): string {
  return createHash("md5").update(pw).digest("hex");
}
