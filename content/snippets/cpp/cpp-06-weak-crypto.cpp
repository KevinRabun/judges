#include <openssl/md5.h>
#include <string>
#include <cstring>

std::string hash_password(const std::string& pw) {
    unsigned char digest[MD5_DIGEST_LENGTH];
    MD5((unsigned char*)pw.c_str(), pw.size(), digest);
    char hex[33];
    for (int i = 0; i < 16; i++) sprintf(hex + i*2, "%02x", digest[i]);
    return std::string(hex);
}
