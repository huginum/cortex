fn main() {
    link_libkrun();
    tauri_build::build()
}

/// Link against libkrun so the sandbox helper can drive a microVM.
///
/// libkrun is a build-time dependency (the sandbox subsystem calls its C API
/// directly). On macOS it is keg-only under the `libkrun/krun` Homebrew tap, so
/// its lib directory is not on the default linker search path; we resolve it via
/// `brew --prefix`. `LIBKRUN_LIB_DIR` overrides the search path on any platform
/// (e.g. a `make install` prefix on Linux, or CI).
fn link_libkrun() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" && target_os != "linux" {
        return;
    }

    if let Ok(dir) = std::env::var("LIBKRUN_LIB_DIR") {
        println!("cargo:rustc-link-search=native={dir}");
    } else if target_os == "macos" {
        // libkrun depends on libkrunfw at link/runtime; add both kegs.
        for formula in ["libkrun", "libkrunfw"] {
            if let Some(prefix) = brew_prefix(formula) {
                println!("cargo:rustc-link-search=native={prefix}/lib");
            }
        }
    }

    println!("cargo:rustc-link-lib=dylib=krun");
    println!("cargo:rerun-if-env-changed=LIBKRUN_LIB_DIR");
}

fn brew_prefix(formula: &str) -> Option<String> {
    let output = std::process::Command::new("brew")
        .arg("--prefix")
        .arg(formula)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let prefix = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!prefix.is_empty()).then_some(prefix)
}
