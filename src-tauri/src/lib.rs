//! Exomyth for the desktop: the same app as the website, in a window of its own, keeping worlds in
//! folders on this computer. The window cannot go online; see `updates.rs` for the one exception
//! (the "Check for updates" button) and `files.rs` for how folders are kept safe.

mod files;
mod updates;

use files::{Entry, Folder};
use percent_encoding::percent_decode_str;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// Folders the person picked. Only these can be read or written.
struct Folders {
    list: Mutex<Vec<Folder>>,
    file: PathBuf,
}

impl Folders {
    fn root(&self, id: &str) -> Result<PathBuf, String> {
        let list = self.list.lock().map_err(|e| e.to_string())?;
        list.iter().find(|f| f.id == id).map(|f| f.path.clone()).ok_or_else(|| "This folder is not open in Exomyth".into())
    }

    fn save(&self, list: &[Folder]) -> Result<(), String> {
        files::save_folders(&self.file, list)
    }
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/* ------------------------------------------------------------------------- folders */

#[tauri::command]
async fn folders_list(folders: State<'_, Folders>) -> Result<Vec<Folder>, String> {
    let mut list = folders.list.lock().map_err(|e| e.to_string())?.clone();
    list.sort_by_key(|f| std::cmp::Reverse(f.last_opened));
    Ok(list)
}

/// Shows the system's folder dialog; the picked folder is remembered and can be used from then on.
#[tauri::command]
async fn folder_pick(app: AppHandle, folders: State<'_, Folders>, title: String) -> Result<Option<Folder>, String> {
    let Some(picked) = app.dialog().file().set_title(title).blocking_pick_folder() else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let mut list = folders.list.lock().map_err(|e| e.to_string())?;
    let folder = files::remember(&mut list, path, now());
    folders.save(&list)?;
    Ok(Some(folder))
}

/// Asks where to keep a new world, makes its folder there and remembers it.
#[tauri::command]
async fn folder_create(app: AppHandle, folders: State<'_, Folders>, title: String, name: String) -> Result<Option<Folder>, String> {
    let Some(picked) = app.dialog().file().set_title(title).blocking_pick_folder() else { return Ok(None) };
    let parent = picked.into_path().map_err(|e| e.to_string())?;
    let path = files::new_folder(&parent, &name)?;
    let mut list = folders.list.lock().map_err(|e| e.to_string())?;
    let folder = files::remember(&mut list, path, now());
    folders.save(&list)?;
    Ok(Some(folder))
}

/// Opens a remembered folder again, or says it is no longer there.
#[tauri::command]
async fn folder_open(folders: State<'_, Folders>, id: String) -> Result<Folder, String> {
    let mut list = folders.list.lock().map_err(|e| e.to_string())?;
    let folder = list.iter_mut().find(|f| f.id == id).ok_or("This folder is not in the list")?;
    if !folder.path.is_dir() {
        return Err(format!("The folder is not there any more: {}", folder.path.display()));
    }
    folder.last_opened = now();
    let out = folder.clone();
    folders.save(&list)?;
    Ok(out)
}

/// Takes a folder off the list. Its files are not touched.
#[tauri::command]
async fn folder_forget(folders: State<'_, Folders>, id: String) -> Result<(), String> {
    let mut list = folders.list.lock().map_err(|e| e.to_string())?;
    list.retain(|f| f.id != id);
    folders.save(&list)
}

/* ---------------------------------------------------------------------------- files */

#[tauri::command]
async fn fs_list(folders: State<'_, Folders>, folder: String, dir: String) -> Result<Vec<Entry>, String> {
    files::list(&folders.root(&folder)?, &dir)
}

#[tauri::command]
async fn fs_stat(folders: State<'_, Folders>, folder: String, path: String) -> Result<Option<Entry>, String> {
    files::stat(&folders.root(&folder)?, &path)
}

#[tauri::command]
async fn fs_exists(folders: State<'_, Folders>, folder: String, path: String) -> Result<bool, String> {
    files::exists(&folders.root(&folder)?, &path)
}

/// The file's bytes, sent as they are (not as a list of numbers).
#[tauri::command]
async fn fs_read(folders: State<'_, Folders>, folder: String, path: String) -> Result<Response, String> {
    Ok(Response::new(files::read(&folders.root(&folder)?, &path)?))
}

#[tauri::command]
async fn fs_remove(folders: State<'_, Folders>, folder: String, path: String) -> Result<(), String> {
    files::remove(&folders.root(&folder)?, &path)
}

/// A header sent with raw bytes; the window encodes it with `encodeURIComponent`.
fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    let raw = request.headers().get(name).and_then(|v| v.to_str().ok()).ok_or_else(|| format!("Missing {name}"))?;
    percent_decode_str(raw).decode_utf8().map(|s| s.into_owned()).map_err(|e| e.to_string())
}

fn body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("Expected the file's bytes".into()),
    }
}

/// Writes a file; the bytes come as they are, the folder and path in headers.
#[tauri::command]
async fn fs_write(folders: State<'_, Folders>, request: Request<'_>) -> Result<(), String> {
    let root = folders.root(&header(&request, "x-folder")?)?;
    files::write(&root, &header(&request, "x-path")?, body(&request)?)
}

/// Saves something made in the app (a .zip, a book, a picture) where the person chooses.
#[tauri::command]
async fn save_file(app: AppHandle, request: Request<'_>) -> Result<bool, String> {
    let name = header(&request, "x-name")?;
    let Some(target) = app.dialog().file().set_file_name(&name).blocking_save_file() else { return Ok(false) };
    let path = target.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, body(&request)?).map_err(|e| format!("Could not save {}: {e}", path.display()))?;
    Ok(true)
}

/* -------------------------------------------------------------------- outside world */

#[tauri::command]
async fn update_check(app: AppHandle) -> Result<updates::UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    tauri::async_runtime::spawn_blocking(move || updates::check(&current)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn open_releases(app: AppHandle) -> Result<(), String> {
    app.opener().open_url(updates::RELEASES_PAGE, None::<&str>).map_err(|e| e.to_string())
}

/// Web and e-mail links from pages open in the person's own browser or mail app, never in Exomyth.
fn open_outside(app: &AppHandle, url: &Url) {
    if matches!(url.scheme(), "http" | "https" | "mailto") && !is_app(url) {
        let _ = app.opener().open_url(url.as_str(), None::<&str>);
    }
}

/// The window may only show Exomyth itself.
fn is_app(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => true,
        "about" => true,
        "http" | "https" => {
            let host = url.host_str().unwrap_or("");
            host == "tauri.localhost" || (cfg!(debug_assertions) && (host == "localhost" || host == "127.0.0.1"))
        }
        _ => false,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let file = app.path().app_config_dir()?.join("folders.json");
            app.manage(Folders { list: Mutex::new(files::load_folders(&file)), file });

            let nav = app.handle().clone();
            let popup = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Exomyth")
                .inner_size(1280.0, 820.0)
                .min_inner_size(760.0, 520.0)
                // Let the page handle drag and drop itself (moving pages, adding pictures).
                .disable_drag_drop_handler()
                .on_navigation(move |url| {
                    if is_app(url) {
                        return true;
                    }
                    open_outside(&nav, url);
                    false
                })
                .on_new_window(move |url, _| {
                    open_outside(&popup, &url);
                    NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            folders_list,
            folder_pick,
            folder_create,
            folder_open,
            folder_forget,
            fs_list,
            fs_stat,
            fs_exists,
            fs_read,
            fs_write,
            fs_remove,
            save_file,
            update_check,
            open_releases,
        ])
        .run(tauri::generate_context!())
        .expect("Exomyth could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_window_only_shows_exomyth() {
        assert!(is_app(&Url::parse("http://tauri.localhost/index.html").unwrap()));
        assert!(is_app(&Url::parse("tauri://localhost/index.html").unwrap()));
        assert!(!is_app(&Url::parse("https://example.com/").unwrap()));
        assert!(!is_app(&Url::parse("file:///C:/Windows/win.ini").unwrap()));
        assert!(!is_app(&Url::parse("javascript:alert(1)").unwrap()));
    }
}
