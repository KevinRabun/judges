const API_KEY: &str = "AKIAIOSFODNN7EXAMPLE";

pub fn render_greeting(name: &str) -> String {
    format!("<h1>Hello, {}!</h1><script>key='{}'</script>", name, API_KEY)
}
