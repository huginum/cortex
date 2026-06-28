import { invoke } from '@tauri-apps/api/core';

/** A container instance. */
export type Container = {
  id: string;
  name: string;
  image: string;
  command: string;
  created: number;
  running: boolean;
};

/** Create a container from a cached image (COW clone). Image must be cached. */
export function createContainer(
  image: string,
  name?: string,
  command?: string,
): Promise<Container> {
  return invoke<Container>('create_container', { image, name, command });
}

export function listContainers(): Promise<Container[]> {
  return invoke<Container[]>('list_containers');
}

/** Remove a stopped container (deletes its rootfs). */
export function removeContainer(id: string): Promise<void> {
  return invoke('remove_container', { id });
}

/** Start a container's agent microVM (no-op if already running). */
export function runContainer(id: string): Promise<void> {
  return invoke('run_container', { id });
}

/** Stop a running container's microVM (rootfs preserved). */
export function stopContainer(id: string): Promise<void> {
  return invoke('stop_container', { id });
}
