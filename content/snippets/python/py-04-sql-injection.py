import sqlite3

def find_user(name: str):
    conn = sqlite3.connect("app.db")
    return conn.execute(f"SELECT * FROM users WHERE name='{name}'").fetchone()
