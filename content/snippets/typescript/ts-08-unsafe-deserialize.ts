export function loadConfig(raw: string): unknown {
  const fn = new Function("return " + raw);
  return fn();
}
