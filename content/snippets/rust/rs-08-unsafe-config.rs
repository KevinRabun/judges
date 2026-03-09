pub fn load_config(raw: &str) -> serde_json::Value {
    serde_json::from_str(raw).unwrap()
}

pub fn merge_config(base: &mut serde_json::Value, patch: serde_json::Value) {
    if let (Some(b), Some(p)) = (base.as_object_mut(), patch.as_object()) {
        for (k, v) in p { b.insert(k.clone(), v.clone()); }
    }
}
