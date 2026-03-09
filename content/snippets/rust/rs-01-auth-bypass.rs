const ADMIN_TOKEN: &str = "AKIAIOSFODNN7EXAMPLE";

pub fn is_admin(token: &str) -> bool {
    token == ADMIN_TOKEN
}
