//! Worlds kept in folders on this computer.
//!
//! The window can only reach folders the person picked in the system's own folder dialog. Every path
//! it sends is relative to such a folder, is checked before use and can never point outside it,
//! even through a link inside the folder.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Folders that are never listed (tooling, trash, version control); the same list as the web app's.
const IGNORED_DIRS: [&str; 5] = [".git", ".trash", "node_modules", ".obsidian", ".DS_Store"];

/// Saved versions of pages. Left out of a whole-world listing; listed only when asked for.
const VERSIONS_DIR: &str = ".exomyth/versions";

/// A folder the person opened, remembered so it can be opened again with one click.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub last_opened: u64,
}

/// One file of a world, as the web app's `FileEntry`.
#[derive(Clone, Debug, Serialize, PartialEq)]
pub struct Entry {
    pub path: String,
    pub mtime: f64,
    pub size: u64,
}

/// Turns a path sent by the window ("Places/Rivertown.md") into a path inside `root`.
///
/// Refused: empty paths, absolute paths, drive letters, backslashes, `.` and `..`, and names that
/// Windows treats specially (a colon opens a hidden data stream).
pub fn inside(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let bad = || format!("Not a path inside the world: {rel}");
    if rel.is_empty() || rel.contains('\\') || rel.contains(':') || rel.contains('\0') || rel.starts_with('/') {
        return Err(bad());
    }
    let mut out = root.to_path_buf();
    for part in rel.split('/') {
        if part.is_empty() || part == "." || part == ".." {
            return Err(bad());
        }
        let p = Path::new(part);
        if !matches!(p.components().next(), Some(Component::Normal(_))) || p.components().count() != 1 {
            return Err(bad());
        }
        out.push(part);
    }
    Ok(out)
}

/// Fails when `path`, with every link followed, is not inside `root`. Missing files are checked
/// through the closest folder that exists, so a new file cannot be written through a link either.
pub fn check_real(root: &Path, path: &Path) -> Result<(), String> {
    let real_root = fs::canonicalize(root).map_err(|e| format!("The world's folder is not available: {e}"))?;
    let mut probe = path.to_path_buf();
    loop {
        match fs::canonicalize(&probe) {
            Ok(real) => {
                return if real.starts_with(&real_root) { Ok(()) } else { Err("This file is outside the world's folder".into()) };
            }
            Err(_) => {
                if !probe.pop() || !probe.starts_with(root) {
                    return Err("The world's folder is not available".into());
                }
            }
        }
    }
}

fn millis(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

fn walk(dir: &Path, prefix: &str, skip_versions: bool, out: &mut Vec<Entry>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for item in read.flatten() {
        let Ok(name) = item.file_name().into_string() else { continue };
        if IGNORED_DIRS.contains(&name.as_str()) {
            continue;
        }
        // Links are not followed: a world's files are the ones really inside its folder.
        let Ok(kind) = item.file_type() else { continue };
        if kind.is_symlink() {
            continue;
        }
        let path = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        if kind.is_dir() {
            if skip_versions && path == VERSIONS_DIR {
                continue;
            }
            walk(&item.path(), &path, skip_versions, out);
        } else if kind.is_file() {
            if name.ends_with(TMP_SUFFIX) {
                continue;
            }
            if let Ok(meta) = item.metadata() {
                out.push(Entry { path, mtime: millis(&meta), size: meta.len() });
            }
        }
    }
}

/// Every file of a world (without saved versions), or every file under `dir` (with them).
pub fn list(root: &Path, dir: &str) -> Result<Vec<Entry>, String> {
    let mut out = Vec::new();
    if dir.is_empty() {
        walk(root, "", true, &mut out);
    } else {
        let start = inside(root, dir.trim_end_matches('/'))?;
        if start.is_dir() && check_real(root, &start).is_ok() {
            walk(&start, dir.trim_end_matches('/'), false, &mut out);
        }
    }
    Ok(out)
}

pub fn stat(root: &Path, rel: &str) -> Result<Option<Entry>, String> {
    let path = inside(root, rel)?;
    match fs::symlink_metadata(&path) {
        Ok(meta) if meta.is_file() => Ok(Some(Entry { path: rel.to_string(), mtime: millis(&meta), size: meta.len() })),
        _ => Ok(None),
    }
}

pub fn read(root: &Path, rel: &str) -> Result<Vec<u8>, String> {
    let path = inside(root, rel)?;
    check_real(root, &path)?;
    fs::read(&path).map_err(|e| format!("File not found: {rel} ({e})"))
}

/// The ending of the temporary file a page is written to before it replaces the old one.
const TMP_SUFFIX: &str = ".exomyth-tmp";

/// Writes the whole file to a temporary file next to it, then swaps it in, so a crash or a full
/// disk mid-write never leaves a half-written page behind.
pub fn write(root: &Path, rel: &str, data: &[u8]) -> Result<(), String> {
    let path = inside(root, rel)?;
    check_real(root, &path)?;
    let parent = path.parent().ok_or("Not a path inside the world")?;
    fs::create_dir_all(parent).map_err(|e| format!("Could not make the folder for {rel}: {e}"))?;
    check_real(root, parent)?;
    let name = path.file_name().and_then(|n| n.to_str()).ok_or("Not a path inside the world")?;
    let tmp = parent.join(format!(".{name}{TMP_SUFFIX}"));
    let result = (|| {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, &path)
    })();
    if let Err(e) = result {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Could not save {rel}: {e}"));
    }
    Ok(())
}

pub fn remove(root: &Path, rel: &str) -> Result<(), String> {
    let path = inside(root, rel)?;
    check_real(root, &path)?;
    fs::remove_file(&path).map_err(|e| format!("Could not delete {rel}: {e}"))
}

pub fn exists(root: &Path, rel: &str) -> Result<bool, String> {
    let path = inside(root, rel)?;
    Ok(fs::symlink_metadata(&path).map(|m| m.is_file()).unwrap_or(false))
}

/* ------------------------------------------------------------------ remembered folders */

pub fn load_folders(file: &Path) -> Vec<Folder> {
    fs::read(file).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save_folders(file: &Path, folders: &[Folder]) -> Result<(), String> {
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_vec_pretty(folders).map_err(|e| e.to_string())?;
    fs::write(file, text).map_err(|e| e.to_string())
}

/// Adds a picked folder to the list, or refreshes it when the same folder was opened before.
pub fn remember(folders: &mut Vec<Folder>, path: PathBuf, now: u64) -> Folder {
    let same = |f: &Folder| f.path == path || (fs::canonicalize(&f.path).ok().is_some() && fs::canonicalize(&f.path).ok() == fs::canonicalize(&path).ok());
    if let Some(f) = folders.iter_mut().find(|f| same(f)) {
        f.last_opened = now;
        return f.clone();
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string_lossy().into_owned());
    let id = format!("{now}-{}", folders.len() + 1);
    let folder = Folder { id, name, path, last_opened: now };
    folders.push(folder.clone());
    folder
}

/// Makes a new, empty folder called `name` in `parent`, as "name 2", "name 3"… when it is taken.
pub fn new_folder(parent: &Path, name: &str) -> Result<PathBuf, String> {
    let name = name.trim();
    inside(parent, name)?;
    if name.contains('/') || name.starts_with('.') {
        return Err(format!("Not a folder name: {name}"));
    }
    for n in 1..1000 {
        let candidate = if n == 1 { parent.join(name) } else { parent.join(format!("{name} {n}")) };
        if candidate.exists() {
            continue;
        }
        fs::create_dir(&candidate).map_err(|e| format!("Could not make the folder: {e}"))?;
        return Ok(candidate);
    }
    Err("Could not find a free folder name".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_stay_inside_the_world() {
        let root = Path::new("/worlds/Silver Coast");
        assert_eq!(inside(root, "Places/Rivertown.md").unwrap(), root.join("Places").join("Rivertown.md"));
        assert_eq!(inside(root, "Персонажи/Кира Вейл.md").unwrap(), root.join("Персонажи").join("Кира Вейл.md"));
        for bad in ["", "/etc/passwd", "../secret.md", "Places/../../x", "a//b", "./a", "C:/x", "a\\..\\b", "file.md:stream", "a/."] {
            assert!(inside(root, bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn reads_writes_and_lists_a_world() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        write(root, "Places/Rivertown.md", b"# Rivertown").unwrap();
        write(root, ".exomyth/versions/Places/Rivertown.md/1.md", b"old").unwrap();
        write(root, ".git/config", b"x").unwrap();
        assert_eq!(read(root, "Places/Rivertown.md").unwrap(), b"# Rivertown");
        write(root, "Places/Rivertown.md", b"# Rivertown, again").unwrap();
        assert_eq!(read(root, "Places/Rivertown.md").unwrap(), b"# Rivertown, again");

        let all: Vec<String> = list(root, "").unwrap().into_iter().map(|e| e.path).collect();
        assert_eq!(all, vec!["Places/Rivertown.md".to_string()]);
        let versions: Vec<String> = list(root, ".exomyth/versions").unwrap().into_iter().map(|e| e.path).collect();
        assert_eq!(versions, vec![".exomyth/versions/Places/Rivertown.md/1.md".to_string()]);
        assert!(list(root, "Nowhere").unwrap().is_empty());

        assert!(exists(root, "Places/Rivertown.md").unwrap());
        assert_eq!(stat(root, "Places/Rivertown.md").unwrap().unwrap().size, 18);
        assert!(stat(root, "Places").unwrap().is_none());
        remove(root, "Places/Rivertown.md").unwrap();
        assert!(!exists(root, "Places/Rivertown.md").unwrap());
        assert!(read(root, "Places/Rivertown.md").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn links_cannot_lead_outside() {
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), b"secret").unwrap();
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::os::unix::fs::symlink(outside.path(), root.join("Linked")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.txt"), root.join("secret.md")).unwrap();
        assert!(read(root, "Linked/secret.txt").is_err());
        assert!(read(root, "secret.md").is_err());
        assert!(write(root, "Linked/new.md", b"x").is_err());
        assert!(!outside.path().join("new.md").exists());
        assert!(list(root, "").unwrap().is_empty());
        assert!(list(root, "Linked").unwrap().is_empty());
    }

    #[test]
    fn makes_new_world_folders() {
        let dir = tempfile::tempdir().unwrap();
        let a = new_folder(dir.path(), "Silver Coast").unwrap();
        let b = new_folder(dir.path(), "Silver Coast").unwrap();
        assert!(a.ends_with("Silver Coast") && a.is_dir());
        assert!(b.ends_with("Silver Coast 2") && b.is_dir());
        for bad in ["", "..", "a/b", ".hidden", "C:x"] {
            assert!(new_folder(dir.path(), bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn remembers_folders_once() {
        let dir = tempfile::tempdir().unwrap();
        let mut folders = Vec::new();
        let a = remember(&mut folders, dir.path().to_path_buf(), 1);
        let b = remember(&mut folders, dir.path().to_path_buf(), 2);
        assert_eq!(folders.len(), 1);
        assert_eq!(a.id, b.id);
        assert_eq!(folders[0].last_opened, 2);
        let file = dir.path().join("config/folders.json");
        save_folders(&file, &folders).unwrap();
        assert_eq!(load_folders(&file), folders);
    }
}
