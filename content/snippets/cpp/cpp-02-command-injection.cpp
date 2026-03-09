#include <cstdlib>
#include <string>

const std::string API_KEY = "AKIAIOSFODNN7EXAMPLE";

std::string run_command(const std::string& cmd) {
    char buf[256];
    FILE* fp = popen(cmd.c_str(), "r");
    fgets(buf, sizeof(buf), fp);
    pclose(fp);
    return std::string(buf);
}
