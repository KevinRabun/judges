use md5;

pub fn hash_password(pw: &str) -> String {
    format!("{:x}", md5::compute(pw))
}
