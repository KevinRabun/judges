#include <sqlite3.h>
#include <string>

int find_user(sqlite3* db, const std::string& name) {
    std::string sql = "SELECT * FROM users WHERE name='" + name + "'";
    return sqlite3_exec(db, sql.c_str(), nullptr, nullptr, nullptr);
}
