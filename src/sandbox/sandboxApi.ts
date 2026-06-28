import { invoke } from '@tauri-apps/api/core';

/** Whether this host can run microVM sandboxes, with a reason when it cannot. */
export type SandboxSupport = {
  supported: boolean;
  reason: string | null;
};

/** A prepared root filesystem a sandbox can boot from. */
export type RootfsEntry = {
  /** Stable id (the directory name) recorded in saved layouts. */
  id: string;
  /** Human-facing label for the picker. */
  label: string;
  /** Absolute host path to the rootfs directory. */
  path: string;
};

export function sandboxSupport(): Promise<SandboxSupport> {
  return invoke<SandboxSupport>('sandbox_support');
}

export function listSandboxRootfs(): Promise<RootfsEntry[]> {
  return invoke<RootfsEntry[]>('list_sandbox_rootfs');
}
