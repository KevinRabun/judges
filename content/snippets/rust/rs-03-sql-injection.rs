pub fn find_user(conn: &rusqlite::Connection, name: &str) -> String {
    let query = format!("SELECT * FROM users WHERE name='{}'", name);
    conn.query_row(&query, [], |row| row.get(0)).unwrap()
}
