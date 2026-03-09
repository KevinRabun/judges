use std::process::Command;

pub fn run(cmd: &str) -> String {
    let out = Command::new("sh").arg("-c").arg(cmd).output().unwrap();
    String::from_utf8_lossy(&out.stdout).to_string()
}
