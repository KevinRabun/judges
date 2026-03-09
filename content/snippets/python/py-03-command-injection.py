import os

API_KEY = "AKIAIOSFODNN7EXAMPLE"

def convert(filename: str) -> int:
    return os.system(f"convert {filename} out.pdf")
