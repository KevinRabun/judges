const API_KEY = "AKIAIOSFODNN7EXAMPLE";
export function callApi(data: string) {
  return fetch("/api", {
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: data,
  });
}
