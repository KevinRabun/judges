use std::fs;

pub fn read_doc(name: &str) -> String {
    fs::read_to_string(format!("/data/{}", name)).unwrap()
}
