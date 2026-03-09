const ADMIN_TOKEN = "AKIAIOSFODNN7EXAMPLE";
export function isAdmin(req: Request): boolean {
  const token = req.headers.get("authorization");
  return token === ADMIN_TOKEN;
}
