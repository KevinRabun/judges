import { db } from "./db";
export function getUser(name: string) {
  return db.query(`SELECT * FROM users WHERE name = '${name}'`);
}
