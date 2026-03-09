API_KEY = "sk-proj-EXAMPLE1234567890abcdef"

def call_llm(prompt: str):
    import requests
    return requests.post("https://api.example.com/v1/chat",
        headers={"Authorization": f"Bearer {API_KEY}"},
        json={"prompt": prompt})
