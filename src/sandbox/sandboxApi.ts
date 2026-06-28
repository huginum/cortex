import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/** Whether this host can run microVM sandboxes, with a reason when it cannot. */
export type SandboxSupport = {
  supported: boolean;
  reason: string | null;
};

/** A cached OCI image a sandbox can boot from. */
export type ImageEntry = {
  /** Canonical reference, e.g. `docker.io/library/ubuntu:24.04`. */
  reference: string;
  /** Short `name:tag` for display. */
  label: string;
};

/** Progress phase while an image is being pulled. */
export type PullProgress = {
  reference: string;
  phase: string;
};

export function sandboxSupport(): Promise<SandboxSupport> {
  return invoke<SandboxSupport>('sandbox_support');
}

/** Cached images, listed by `name:tag`. */
export function listImages(): Promise<ImageEntry[]> {
  return invoke<ImageEntry[]>('list_images');
}

/** Ensure an image is cached, pulling it if needed. Resolves when ready. */
export function pullImage(reference: string): Promise<void> {
  return invoke('pull_image', { reference });
}

/** Subscribe to pull-progress events. Returns an unlisten function. */
export function onPullProgress(cb: (progress: PullProgress) => void): Promise<UnlistenFn> {
  return listen<PullProgress>('image-pull', (event) => cb(event.payload));
}
