//! "Check for updates": the only time Exomyth for the desktop goes online, and only when the person
//! clicks the button. It asks GitHub for the newest release of Exomyth and sends nothing else: no
//! worlds, no settings, no identifiers. Installing a new version is left to the person.

use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const RELEASES_API: &str = "https://api.github.com/repos/Exonerv-Pec/Exomyth/releases/latest";
pub const RELEASES_PAGE: &str = "https://github.com/Exonerv-Pec/Exomyth/releases/latest";

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current: String,
    /// The newest published version, when GitHub says which one it is.
    pub latest: Option<String>,
    pub newer: bool,
}

#[derive(Deserialize)]
struct Release {
    #[serde(default)]
    tag_name: String,
    #[serde(default)]
    name: Option<String>,
}

/// The first version number in a text: "v1.2.0" → (1, 2, 0), "Version 1.0" → (1, 0, 0).
pub fn version_in(text: &str) -> Option<(u64, u64, u64)> {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_digit() && (i == 0 || !bytes[i - 1].is_ascii_alphanumeric() || bytes[i - 1] == b'v' || bytes[i - 1] == b'V') {
            let rest = &text[i..];
            let end = rest.find(|c: char| !(c.is_ascii_digit() || c == '.')).unwrap_or(rest.len());
            let parts: Vec<u64> = rest[..end].trim_end_matches('.').split('.').filter_map(|p| p.parse().ok()).collect();
            if parts.len() >= 2 {
                return Some((parts[0], parts[1], parts.get(2).copied().unwrap_or(0)));
            }
            i += end.max(1);
        } else {
            i += 1;
        }
    }
    None
}

fn show((a, b, c): (u64, u64, u64)) -> String {
    format!("{a}.{b}.{c}")
}

/// Compares the running version with a release's tag (or, failing that, its title).
pub fn compare(current: &str, tag: &str, name: Option<&str>) -> UpdateInfo {
    let latest = version_in(tag).or_else(|| name.and_then(version_in));
    let mine = version_in(current);
    UpdateInfo {
        current: current.to_string(),
        latest: latest.map(show),
        newer: matches!((latest, mine), (Some(l), Some(m)) if l > m),
    }
}

/// Asks GitHub for the newest release. Runs only when the person clicks "Check for updates".
pub fn check(current: &str) -> Result<UpdateInfo, String> {
    // The system's own certificate check (on Windows the one Edge uses), so the request also works
    // behind company proxies that the system trusts.
    let tls = ureq::tls::TlsConfig::builder().root_certs(ureq::tls::RootCerts::PlatformVerifier).build();
    let agent: ureq::Agent = ureq::Agent::config_builder().tls_config(tls).timeout_global(Some(Duration::from_secs(15))).build().into();
    let mut response = agent
        .get(RELEASES_API)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "Exomyth-desktop")
        .call()
        .map_err(|e| e.to_string())?;
    let release: Release = response.body_mut().read_json().map_err(|e| e.to_string())?;
    Ok(compare(current, &release.tag_name, release.name.as_deref()))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Asks the real GitHub. Not run by default (it goes online): `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn asks_github() {
        let info = check("0.0.1").expect("GitHub answers");
        assert!(info.latest.is_some(), "{info:?}");
        assert!(info.newer);
    }

    #[test]
    fn finds_versions_in_tags_and_titles() {
        assert_eq!(version_in("v1.2.3"), Some((1, 2, 3)));
        assert_eq!(version_in("1.4"), Some((1, 4, 0)));
        assert_eq!(version_in("Releasing Version 1.0 + Local App"), Some((1, 0, 0)));
        assert_eq!(version_in("Release"), None);
        assert_eq!(version_in("x2 build 3"), None);
    }

    #[test]
    fn says_when_a_newer_version_is_out() {
        assert!(compare("1.0.0", "v1.1.0", None).newer);
        assert!(compare("1.0.0", "v2.0.0", None).newer);
        assert!(!compare("1.0.0", "v1.0.0", None).newer);
        assert!(!compare("1.2.0", "v1.1.9", None).newer);
        let old_style = compare("1.0.0", "Release", Some("Releasing Version 1.0 + Local App"));
        assert_eq!(old_style.latest.as_deref(), Some("1.0.0"));
        assert!(!old_style.newer);
        assert_eq!(compare("1.0.0", "Release", None), UpdateInfo { current: "1.0.0".into(), latest: None, newer: false });
    }
}
