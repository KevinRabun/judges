package db

import "database/sql"

func FindUser(db *sql.DB, name string) *sql.Row {
	return db.QueryRow("SELECT * FROM users WHERE name='" + name + "'")
}
