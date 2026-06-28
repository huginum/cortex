//! Containers: instances of images with their own copy-on-write rootfs.
//!
//! A container clones an immutable cached image rootfs (copy-on-write) into its
//! own directory, so writes stay in the container and the image stays pristine.
//! Each container has a generated id and a Docker-style name, a default command,
//! and persists until removed.
//!
//! Store layout, under the app data dir:
//!   containers/<id>/rootfs/         the COW clone
//!   containers/<id>/container.json  metadata
//!
//! Running a container (booting its agent VM) and exec'ing shells into it live in
//! later milestones; this module owns the store, the clone, and lifecycle records.

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};

/// A container instance.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Container {
    pub id: String,
    pub name: String,
    /// Image reference this container was created from.
    pub image: String,
    /// Default command run in the container (e.g. `/bin/sh`).
    pub command: String,
    /// Unix seconds at creation.
    pub created: u64,
    /// Whether the container's microVM is currently running.
    #[serde(default)]
    pub running: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ContainerError {
    #[error("image is not available: {0}")]
    ImageUnavailable(String),
    #[error("container name already in use: {0}")]
    NameInUse(String),
    #[error("container not found: {0}")]
    NotFound(String),
    #[error("container is running; stop it before removing")]
    Running,
    #[error("io error: {0}")]
    Io(String),
}

impl serde::Serialize for ContainerError {
    fn serialize<S: serde::ser::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

const DEFAULT_COMMAND: &str = "/bin/sh";

fn container_dir(root: &Path, id: &str) -> PathBuf {
    root.join(id)
}

fn meta_path(root: &Path, id: &str) -> PathBuf {
    container_dir(root, id).join("container.json")
}

/// The rootfs directory of a container (for booting its VM).
pub fn rootfs_path(root: &Path, id: &str) -> PathBuf {
    container_dir(root, id).join("rootfs")
}

/// Create a container by cloning `image_rootfs` copy-on-write. `name` is generated
/// when `None`; `command` defaults to `/bin/sh`.
pub fn create(
    root: &Path,
    image_reference: &str,
    image_rootfs: &Path,
    name: Option<String>,
    command: Option<String>,
) -> Result<Container, ContainerError> {
    if !image_rootfs.is_dir() {
        return Err(ContainerError::ImageUnavailable(image_reference.to_string()));
    }

    let existing = list(root);
    let name = match name {
        Some(requested) => {
            if existing.iter().any(|c| c.name == requested) {
                return Err(ContainerError::NameInUse(requested));
            }
            requested
        }
        None => generate_name(&existing),
    };

    let id = generate_id();
    let dir = container_dir(root, &id);
    fs::create_dir_all(&dir).map_err(|e| ContainerError::Io(e.to_string()))?;

    clone_rootfs(image_rootfs, &rootfs_path(root, &id))
        .map_err(|e| ContainerError::Io(format!("clone rootfs: {e}")))?;

    let container = Container {
        id: id.clone(),
        name,
        image: image_reference.to_string(),
        command: command.unwrap_or_else(|| DEFAULT_COMMAND.to_string()),
        created: now_unix(),
        running: false,
    };
    write_meta(root, &container)?;
    Ok(container)
}

/// List all containers, newest first.
pub fn list(root: &Path) -> Vec<Container> {
    let Ok(entries) = fs::read_dir(root) else {
        return Vec::new();
    };
    let mut out: Vec<Container> = entries
        .flatten()
        .filter_map(|e| {
            let contents = fs::read_to_string(e.path().join("container.json")).ok()?;
            serde_json::from_str(&contents).ok()
        })
        .collect();
    out.sort_by_key(|c| std::cmp::Reverse(c.created));
    out
}

pub fn get(root: &Path, id: &str) -> Option<Container> {
    let contents = fs::read_to_string(meta_path(root, id)).ok()?;
    serde_json::from_str(&contents).ok()
}

/// Update the running flag of a container.
pub fn set_running(root: &Path, id: &str, running: bool) -> Result<(), ContainerError> {
    let mut container = get(root, id).ok_or_else(|| ContainerError::NotFound(id.to_string()))?;
    container.running = running;
    write_meta(root, &container)
}

/// Remove a stopped container, deleting its rootfs and metadata.
pub fn remove(root: &Path, id: &str) -> Result<(), ContainerError> {
    let container = get(root, id).ok_or_else(|| ContainerError::NotFound(id.to_string()))?;
    if container.running {
        return Err(ContainerError::Running);
    }
    fs::remove_dir_all(container_dir(root, id)).map_err(|e| ContainerError::Io(e.to_string()))
}

fn write_meta(root: &Path, container: &Container) -> Result<(), ContainerError> {
    let path = meta_path(root, &container.id);
    let json = serde_json::to_vec_pretty(container).map_err(|e| ContainerError::Io(e.to_string()))?;
    fs::write(path, json).map_err(|e| ContainerError::Io(e.to_string()))
}

/// Copy-on-write clone of a directory tree: APFS `clonefile` via `cp -c` on macOS,
/// reflink on Linux, falling back to a plain recursive copy.
fn clone_rootfs(src: &Path, dst: &Path) -> std::io::Result<()> {
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent)?;
    }
    let _ = fs::remove_dir_all(dst);

    #[cfg(target_os = "macos")]
    let primary = &["-c", "-R"];
    #[cfg(target_os = "linux")]
    let primary = &["--reflink=auto", "-R"];
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    let primary: &[&str] = &["-R"];

    if run_cp(primary, src, dst)? {
        return Ok(());
    }
    // Fallback: plain recursive copy (no COW).
    if run_cp(&["-R"], src, dst)? {
        return Ok(());
    }
    Err(std::io::Error::other("cp failed to clone rootfs"))
}

fn run_cp(args: &[&str], src: &Path, dst: &Path) -> std::io::Result<bool> {
    Ok(Command::new("cp")
        .args(args)
        .arg(src)
        .arg(dst)
        .status()?
        .success())
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// A tiny seeded PRNG so we avoid a dependency just for ids/names. Seeded from the
// clock, pid, and a process-lifetime counter so successive calls differ.
static COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_seed() -> u64 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let mut x = nanos
        ^ (std::process::id() as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ COUNTER.fetch_add(1, Ordering::Relaxed).wrapping_mul(0xD1B5_4A32_D192_ED03);
    // xorshift64
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

fn generate_id() -> String {
    format!("{:012x}", next_seed() & 0xFFFF_FFFF_FFFF)
}

const ADJECTIVES: &[&str] = &[
    "brave", "calm", "clever", "eager", "fancy", "gentle", "happy", "jolly", "keen", "lucky",
    "mighty", "nimble", "proud", "quiet", "swift", "witty", "bold", "bright", "cosmic", "daring",
];

const NOUNS: &[&str] = &[
    "otter", "falcon", "comet", "willow", "ember", "river", "cedar", "lynx", "harbor", "meadow",
    "quartz", "raven", "summit", "tundra", "violet", "walrus", "yak", "zephyr", "badger", "cobra",
];

fn generate_name(existing: &[Container]) -> String {
    for _ in 0..64 {
        let seed = next_seed();
        let adjective = ADJECTIVES[(seed % ADJECTIVES.len() as u64) as usize];
        let noun = NOUNS[((seed >> 16) % NOUNS.len() as u64) as usize];
        let name = format!("{adjective}_{noun}");
        if !existing.iter().any(|c| c.name == name) {
            return name;
        }
    }
    // Exhausted the friendly space; fall back to an id-suffixed name.
    format!("container_{}", generate_id())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("cortex-ctr-{tag}-{}", next_seed()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fake_image(tag: &str) -> PathBuf {
        let dir = temp_root(&format!("img-{tag}"));
        let rootfs = dir.join("rootfs");
        fs::create_dir_all(rootfs.join("bin")).unwrap();
        fs::write(rootfs.join("bin/sh"), b"#!/bin/sh\n").unwrap();
        rootfs
    }

    #[test]
    fn create_clones_cow_and_leaves_image_untouched() {
        let root = temp_root("store");
        let image = fake_image("a");
        let c = create(&root, "alpine:latest", &image, None, None).unwrap();
        assert!(c.name.contains('_'));
        assert_eq!(c.command, "/bin/sh");

        // Write into the container; the image must not change.
        let ctr_file = rootfs_path(&root, &c.id).join("scratch.txt");
        fs::write(&ctr_file, b"in container").unwrap();
        assert!(ctr_file.exists());
        assert!(!image.join("scratch.txt").exists(), "image stays pristine");

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(image.parent().unwrap());
    }

    #[test]
    fn names_are_unique_and_explicit_names_respected() {
        let root = temp_root("names");
        let image = fake_image("b");
        let a = create(&root, "img", &image, Some("my-box".into()), None).unwrap();
        assert_eq!(a.name, "my-box");
        let dup = create(&root, "img", &image, Some("my-box".into()), None);
        assert!(matches!(dup, Err(ContainerError::NameInUse(_))));

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(image.parent().unwrap());
    }

    #[test]
    fn remove_requires_stopped() {
        let root = temp_root("rm");
        let image = fake_image("c");
        let c = create(&root, "img", &image, None, Some("/bin/bash".into())).unwrap();
        assert_eq!(c.command, "/bin/bash");
        set_running(&root, &c.id, true).unwrap();
        assert!(matches!(remove(&root, &c.id), Err(ContainerError::Running)));
        set_running(&root, &c.id, false).unwrap();
        remove(&root, &c.id).unwrap();
        assert!(get(&root, &c.id).is_none());

        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(image.parent().unwrap());
    }
}
