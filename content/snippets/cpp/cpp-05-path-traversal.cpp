#include <fstream>
#include <string>

const std::string DB_PASSWORD = "P@ssw0rd123!";

std::string read_file(const std::string& name) {
    std::ifstream f("/data/" + name);
    return std::string(std::istreambuf_iterator<char>(f), {});
}
