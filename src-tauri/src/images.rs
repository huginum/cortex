//! OCI image fetching and an unpacked-rootfs cache for sandboxes.
//!
//! libkrun boots from an unpacked root filesystem directory; it does not pull or
//! unpack images. This module fills that gap in pure Rust (no skopeo/buildah, so
//! the app stays self-contained): pull an image by reference for the guest
//! architecture, flatten its layers — honoring OCI whiteouts — into a cached
//! rootfs, and list what's cached.
//!
//! Cache layout, under the app data dir:
//!   images/<sanitized-ref>/rootfs/      the unpacked filesystem
//!   images/<sanitized-ref>/image.json   { reference, digest }

use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};

use flate2::read::GzDecoder;
use oci_client::{Reference, client::ClientConfig, manifest, secrets::RegistryAuth, Client};
use serde::{Deserialize, Serialize};

/// A cached image, listed for the picker.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageEntry {
    /// Canonical reference, e.g. `docker.io/library/ubuntu:24.04`.
    pub reference: String,
    /// Short `name:tag` for display.
    pub label: String,
}

/// Sidecar recording what a cache directory holds.
#[derive(Serialize, Deserialize)]
struct ImageMeta {
    reference: String,
    digest: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("invalid image reference: {0}")]
    Reference(String),
    #[error("image is not available for this architecture")]
    Architecture,
    #[error("pull failed: {0}")]
    Pull(String),
    #[error("io error: {0}")]
    Io(String),
}

impl serde::Serialize for ImageError {
    fn serialize<S: serde::ser::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Add an implicit `:latest` when a reference names no tag or digest. Registry
/// and `library/` defaulting (e.g. `ubuntu` → `docker.io/library/ubuntu`) is left
/// to `Reference` parsing.
pub fn normalize_reference(input: &str) -> String {
    let trimmed = input.trim();
    let last_segment = trimmed.rsplit('/').next().unwrap_or(trimmed);
    let has_tag_or_digest = last_segment.contains(':') || last_segment.contains('@');
    if has_tag_or_digest {
        trimmed.to_string()
    } else {
        format!("{trimmed}:latest")
    }
}

/// Short `name:tag` label from a canonical reference (drops the registry host).
fn label_for(reference: &str) -> String {
    reference
        .rsplit('/')
        .next()
        .unwrap_or(reference)
        .to_string()
}

fn sanitize(reference: &str) -> String {
    reference
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' { c } else { '_' })
        .collect()
}

fn image_dir(images_root: &Path, reference: &str) -> PathBuf {
    images_root.join(sanitize(reference))
}

fn rootfs_dir(images_root: &Path, reference: &str) -> PathBuf {
    image_dir(images_root, reference).join("rootfs")
}

/// The cached rootfs for a reference, if fully materialized.
pub fn cached_rootfs(images_root: &Path, reference: &str) -> Option<PathBuf> {
    let normalized = normalize_reference(reference);
    let rootfs = rootfs_dir(images_root, &normalized);
    let meta = image_dir(images_root, &normalized).join("image.json");
    (rootfs.is_dir() && meta.exists()).then_some(rootfs)
}

/// List cached images by reading each directory's `image.json`.
pub fn list_cached(images_root: &Path) -> Vec<ImageEntry> {
    let Ok(entries) = fs::read_dir(images_root) else {
        return Vec::new();
    };
    let mut out: Vec<ImageEntry> = entries
        .flatten()
        .filter_map(|e| {
            let meta_path = e.path().join("image.json");
            let contents = fs::read_to_string(&meta_path).ok()?;
            let meta: ImageMeta = serde_json::from_str(&contents).ok()?;
            // Only list fully-materialized rootfs.
            e.path().join("rootfs").is_dir().then(|| ImageEntry {
                label: label_for(&meta.reference),
                reference: meta.reference,
            })
        })
        .collect();
    out.sort_by(|a, b| a.label.cmp(&b.label));
    out
}

/// Progress phases for a pull, emitted to the UI.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PullProgress {
    pub reference: String,
    pub phase: String,
}

/// Ensure `reference` is present in the cache, pulling and unpacking it if not.
/// Returns the rootfs directory. `on_progress` receives coarse phase updates.
pub async fn ensure_image(
    images_root: &Path,
    reference: &str,
    mut on_progress: impl FnMut(&str),
) -> Result<PathBuf, ImageError> {
    let normalized = normalize_reference(reference);
    let rootfs = rootfs_dir(images_root, &normalized);
    let meta_path = image_dir(images_root, &normalized).join("image.json");
    if rootfs.is_dir() && meta_path.exists() {
        return Ok(rootfs);
    }

    on_progress("resolving");
    let parsed: Reference = normalized
        .parse()
        .map_err(|e: oci_client::ParseError| ImageError::Reference(e.to_string()))?;

    // The guest is always Linux (matching the host CPU arch), regardless of the
    // host OS — so we can't use the default current-OS resolver (it would look
    // for macOS images). Select linux + the host architecture from a multi-arch
    // index.
    let client = Client::new(ClientConfig {
        platform_resolver: Some(Box::new(linux_guest_resolver)),
        ..ClientConfig::default()
    });
    on_progress("pulling");
    let image = client
        .pull(&parsed, &RegistryAuth::Anonymous, accepted_media_types())
        .await
        .map_err(map_pull_error)?;

    on_progress("unpacking");
    // Unpack into a temp sibling, then promote, so a failure leaves no partial
    // rootfs in the cache.
    let dir = image_dir(images_root, &normalized);
    fs::create_dir_all(&dir).map_err(|e| ImageError::Io(e.to_string()))?;
    let staging = dir.join("rootfs.staging");
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|e| ImageError::Io(e.to_string()))?;

    for layer in &image.layers {
        apply_layer(&layer.data, &layer.media_type, &staging)
            .map_err(|e| ImageError::Io(e.to_string()))?;
    }

    let _ = fs::remove_dir_all(&rootfs);
    fs::rename(&staging, &rootfs).map_err(|e| ImageError::Io(e.to_string()))?;
    let meta = ImageMeta {
        reference: normalized.clone(),
        digest: image.digest.unwrap_or_default(),
    };
    fs::write(&meta_path, serde_json::to_vec_pretty(&meta).unwrap_or_default())
        .map_err(|e| ImageError::Io(e.to_string()))?;

    on_progress("ready");
    Ok(rootfs)
}

/// Resolve a multi-arch image index to the `linux` variant matching the host CPU
/// architecture (the guest runs the same arch the host virtualizes).
fn linux_guest_resolver(entries: &[oci_client::manifest::ImageIndexEntry]) -> Option<String> {
    let want_arch = if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        "amd64"
    };
    entries
        .iter()
        .find(|entry| {
            entry.platform.as_ref().is_some_and(|platform| {
                platform.os.to_string() == "linux"
                    && platform.architecture.to_string() == want_arch
            })
        })
        .map(|entry| entry.digest.clone())
}

fn accepted_media_types() -> Vec<&'static str> {
    vec![
        manifest::IMAGE_LAYER_GZIP_MEDIA_TYPE,
        manifest::IMAGE_LAYER_MEDIA_TYPE,
        manifest::IMAGE_DOCKER_LAYER_GZIP_MEDIA_TYPE,
        manifest::IMAGE_DOCKER_LAYER_TAR_MEDIA_TYPE,
    ]
}

fn map_pull_error(error: oci_client::errors::OciDistributionError) -> ImageError {
    // The platform resolver returns no manifest when the arch is absent.
    let message = error.to_string();
    if message.contains("platform") || message.contains("Manifest") && message.contains("not") {
        ImageError::Architecture
    } else {
        ImageError::Pull(message)
    }
}

/// Apply one image layer onto `dest`, honoring OCI whiteouts.
fn apply_layer(data: &[u8], media_type: &str, dest: &Path) -> io::Result<()> {
    let reader: Box<dyn Read> = if media_type.ends_with("gzip") {
        Box::new(GzDecoder::new(data))
    } else {
        Box::new(data)
    };
    let mut archive = tar::Archive::new(reader);
    archive.set_overwrite(true);
    archive.set_preserve_permissions(true);

    for entry in archive.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        let parent = path.parent().map(Path::to_path_buf).unwrap_or_default();

        if name == ".wh..wh..opq" {
            // Opaque directory: drop everything already unpacked under it.
            clear_dir_contents(&dest.join(&parent));
            continue;
        }
        if let Some(removed) = name.strip_prefix(".wh.") {
            // Whiteout: delete the named path from earlier layers.
            remove_path(&dest.join(&parent).join(removed));
            continue;
        }

        // Tolerate per-entry failures (e.g. device nodes when unprivileged); the
        // guest only needs regular files, dirs, and symlinks to run a shell.
        let _ = entry.unpack_in(dest);
    }
    Ok(())
}

fn clear_dir_contents(dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            remove_path(&entry.path());
        }
    }
}

fn remove_path(path: &Path) {
    if path.is_dir() {
        let _ = fs::remove_dir_all(path);
    } else {
        let _ = fs::remove_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_missing_tag() {
        assert_eq!(normalize_reference("ubuntu"), "ubuntu:latest");
        assert_eq!(normalize_reference("ubuntu:24.04"), "ubuntu:24.04");
        assert_eq!(
            normalize_reference("docker.io/library/alpine"),
            "docker.io/library/alpine:latest"
        );
        assert_eq!(
            normalize_reference("registry:5000/img"),
            "registry:5000/img:latest"
        );
        assert_eq!(normalize_reference("img@sha256:abc"), "img@sha256:abc");
    }

    #[test]
    fn label_drops_registry() {
        assert_eq!(label_for("docker.io/library/ubuntu:24.04"), "ubuntu:24.04");
        assert_eq!(label_for("alpine:latest"), "alpine:latest");
    }

    fn tar_gz(files: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write;
        let mut builder = tar::Builder::new(Vec::new());
        for (name, body) in files {
            let mut header = tar::Header::new_gnu();
            header.set_size(body.len() as u64);
            header.set_mode(0o644);
            header.set_cksum();
            builder.append_data(&mut header, name, *body).unwrap();
        }
        let tar = builder.into_inner().unwrap();
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        encoder.write_all(&tar).unwrap();
        encoder.finish().unwrap()
    }

    #[test]
    fn whiteout_deletes_earlier_file() {
        let dest = std::env::temp_dir().join(format!("cortex-img-wh-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dest);
        fs::create_dir_all(&dest).unwrap();

        let l1 = tar_gz(&[("a.txt", b"one"), ("keep.txt", b"k")]);
        let l2 = tar_gz(&[(".wh.a.txt", b"")]);
        apply_layer(&l1, "application/vnd.oci.image.layer.v1.tar+gzip", &dest).unwrap();
        apply_layer(&l2, "application/vnd.oci.image.layer.v1.tar+gzip", &dest).unwrap();

        assert!(!dest.join("a.txt").exists());
        assert!(dest.join("keep.txt").exists());
        let _ = fs::remove_dir_all(&dest);
    }

    // Network test: pulls a real image. Run explicitly with
    //   cargo test --lib images::tests::pulls_alpine -- --ignored --nocapture
    #[ignore]
    #[tokio::test]
    async fn pulls_alpine_real() {
        let base = std::env::temp_dir().join(format!("cortex-img-pull-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let rootfs = ensure_image(&base, "alpine:latest", |p| eprintln!("phase: {p}"))
            .await
            .expect("pull alpine");
        // /bin/sh is an absolute symlink to busybox; check the link and target
        // exist in the rootfs without following to the host filesystem.
        assert!(
            rootfs.join("bin/sh").symlink_metadata().is_ok(),
            "rootfs has /bin/sh"
        );
        assert!(rootfs.join("bin/busybox").exists(), "rootfs has busybox");
        // Cached second time: no network, same path.
        assert!(cached_rootfs(&base, "alpine:latest").is_some());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn opaque_marker_clears_directory() {
        let dest = std::env::temp_dir().join(format!("cortex-img-opq-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dest);
        fs::create_dir_all(&dest).unwrap();

        let l1 = tar_gz(&[("d/old.txt", b"old")]);
        let l2 = tar_gz(&[("d/.wh..wh..opq", b""), ("d/new.txt", b"new")]);
        apply_layer(&l1, "application/vnd.oci.image.layer.v1.tar+gzip", &dest).unwrap();
        apply_layer(&l2, "application/vnd.oci.image.layer.v1.tar+gzip", &dest).unwrap();

        assert!(!dest.join("d/old.txt").exists());
        assert!(dest.join("d/new.txt").exists());
        let _ = fs::remove_dir_all(&dest);
    }
}
