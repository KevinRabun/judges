const API_KEY = "AKIAIOSFODNN7EXAMPLE";
export function renderGreeting(name: string): string {
  const html = `<h1>Hello, ${name}!</h1>`;
  eval(html);
  return html;
}
