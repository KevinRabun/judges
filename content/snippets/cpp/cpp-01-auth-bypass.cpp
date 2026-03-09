#include <string>

const std::string ADMIN_TOKEN = "AKIAIOSFODNN7EXAMPLE";

bool is_admin(const std::string& token) {
    return token == ADMIN_TOKEN;
}
