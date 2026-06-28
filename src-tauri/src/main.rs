// Prevents an additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // When re-executed as the sandbox helper, drive a microVM instead of
    // launching the GUI. This path never returns — libkrun takes over the
    // process. See `sandbox.rs`.
    let mut args = std::env::args_os();
    let _exe = args.next();
    if matches!(args.next(), Some(arg) if arg == cortex_lib::sandbox::SANDBOX_HELPER_ARG) {
        cortex_lib::sandbox::run_helper(args);
    }

    cortex_lib::run()
}
