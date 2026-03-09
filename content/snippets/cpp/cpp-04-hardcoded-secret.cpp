#include <string>

const std::string API_KEY = "AKIAIOSFODNN7EXAMPLE";

std::string get_auth_header() {
    return "Bearer " + API_KEY;
}
