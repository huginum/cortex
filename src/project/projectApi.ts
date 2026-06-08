import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { isLayoutNode, type Layout } from './layout';

export type Project = {
  root: string;
  name: string;
  branch?: string | null;
  /** Whether the repository still exists on disk. */
  exists: boolean;
};

export function listRecentProjects(): Promise<Project[]> {
  return invoke<Project[]>('list_recent_projects');
}

export function removeRecentProject(root: string): Promise<void> {
  return invoke('remove_recent_project', { root });
}

export function openProject(path: string): Promise<Project> {
  return invoke<Project>('open_project', { path });
}

export function initProject(path: string): Promise<Project> {
  return invoke<Project>('init_project', { path });
}

export function cloneProject(url: string, dest: string): Promise<Project> {
  return invoke<Project>('clone_project', { url, dest });
}

/** Prompt for a directory. Returns null if the user cancels. */
export async function pickDirectory(title: string): Promise<string | null> {
  const selected = await openDialog({ directory: true, multiple: false, title });
  return typeof selected === 'string' ? selected : null;
}

export async function loadLayout(root: string): Promise<Layout> {
  const raw = await invoke<string | null>('read_layout', { root });
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // The file is repo-controlled; a malformed-but-valid-JSON layout opens as an
  // empty project rather than crashing project open during hydration.
  return isLayoutNode(parsed) ? parsed : null;
}

export function saveLayout(root: string, layout: Layout): Promise<void> {
  return invoke('write_layout', { root, contents: JSON.stringify(layout) });
}
