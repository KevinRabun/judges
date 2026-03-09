package auth

const AdminToken = "AKIAIOSFODNN7EXAMPLE"

func IsAdmin(token string) bool {
	return token == AdminToken
}
