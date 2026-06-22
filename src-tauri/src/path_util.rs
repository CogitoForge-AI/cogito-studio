use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Strip Windows verbatim/extended-length prefixes (`\\?\`, `\\?\UNC\`).
pub fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let lossy = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(stripped) = lossy.strip_prefix(r"\\?\") {
            return PathBuf::from(stripped);
        }
        if let Some(stripped) = lossy.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", stripped.replace('/', "\\")));
        }
    }
    path.to_path_buf()
}

/// Normalize a filesystem path string for subprocess env vars and `cmd.exe`.
pub fn normalize_path_string(path: &str) -> String {
    strip_verbatim_prefix(Path::new(path.trim()))
        .to_string_lossy()
        .into_owned()
}

/// Prepend a directory to `PATH` in an environment map.
pub fn prepend_path_dir(mut env: HashMap<String, String>, dir: &Path) -> HashMap<String, String> {
    let dir_str = strip_verbatim_prefix(dir)
        .to_string_lossy()
        .into_owned();
    if dir_str.is_empty() {
        return env;
    }

    #[cfg(windows)]
    let separator = ";";
    #[cfg(not(windows))]
    let separator = ":";

    let new_path = if let Some(current) = env.get("PATH").filter(|p| !p.is_empty()) {
        format!("{dir_str}{separator}{current}")
    } else if let Ok(current) = std::env::var("PATH") {
        if current.is_empty() {
            dir_str
        } else {
            format!("{dir_str}{separator}{current}")
        }
    } else {
        dir_str
    };
    env.insert("PATH".to_string(), new_path);
    env
}

/// Normalize known path-valued env vars for Windows subprocess compatibility.
pub fn normalize_env_paths(env: HashMap<String, String>) -> HashMap<String, String> {
    #[cfg(windows)]
    {
        let mut env = env;
        for key in ["UV_PYTHON", "PYTHONHOME", "PYTHONPATH"] {
            if let Some(value) = env.get(key).cloned() {
                env.insert(key.to_string(), normalize_path_string(&value));
            }
        }
        return env;
    }
    #[cfg(not(windows))]
    env
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn strips_verbatim_prefix_from_path_string() {
        assert_eq!(
            normalize_path_string(r"\\?\C:\Users\me\python.exe"),
            r"C:\Users\me\python.exe"
        );
    }

    #[test]
    fn prepends_directory_to_path_env() {
        let mut env = HashMap::new();
        env.insert("PATH".to_string(), "/usr/bin".to_string());
        let env = prepend_path_dir(env, Path::new("/sandbox/bin"));
        #[cfg(unix)]
        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some("/sandbox/bin:/usr/bin")
        );
        #[cfg(windows)]
        assert_eq!(
            env.get("PATH").map(String::as_str),
            Some(r"/sandbox/bin;/usr/bin")
        );
    }
}
