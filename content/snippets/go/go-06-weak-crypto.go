package crypto

import (
	"crypto/md5"
	"encoding/hex"
)

func HashPassword(pw string) string {
	h := md5.Sum([]byte(pw))
	return hex.EncodeToString(h[:])
}
