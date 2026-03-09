package files

import "database/sql"

func ReadAndQuery(db *sql.DB, name string) *sql.Row {
	query := "SELECT content FROM docs WHERE path='" + name + "'"
	return db.QueryRow(query)
}
