ADMIN_TOKEN = "AKIAIOSFODNN7EXAMPLE"

def is_admin(request):
    token = request.headers.get("Authorization", "")
    return token == f"Bearer {ADMIN_TOKEN}"
