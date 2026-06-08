import { useEffect, useState } from 'react';
import {
  cloneProject,
  initProject,
  listRecentProjects,
  openProject,
  pickDirectory,
  removeRecentProject,
  type Project,
} from './projectApi';

type ProjectPickerProps = {
  onOpen: (project: Project) => void;
};

export function ProjectPicker({ onOpen }: ProjectPickerProps) {
  const [recent, setRecent] = useState<Project[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setRecent(await listRecentProjects());
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function run(action: () => Promise<Project | null>) {
    setBusy(true);
    setError(null);
    try {
      const project = await action();
      if (project) onOpen(project);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function openExisting() {
    void run(async () => {
      const dir = await pickDirectory('Open a git repository');
      return dir ? openProject(dir) : null;
    });
  }

  function openOrInit() {
    void run(async () => {
      const dir = await pickDirectory('Open a folder (will be initialized as a git repository)');
      return dir ? initProject(dir) : null;
    });
  }

  function startClone() {
    void run(async () => {
      const url = cloneUrl.trim();
      if (!url) return null;
      const parent = await pickDirectory('Choose where to clone the repository');
      if (!parent) return null;
      const dest = `${parent.replace(/\/$/, '')}/${repoNameFromUrl(url)}`;
      const project = await cloneProject(url, dest);
      setCloning(false);
      setCloneUrl('');
      return project;
    });
  }

  function openRecent(project: Project) {
    if (!project.exists) return;
    void run(() => openProject(project.root));
  }

  async function forget(root: string) {
    await removeRecentProject(root);
    await refresh();
  }

  return (
    <div className="picker">
      <div className="picker-panel">
        <h1 className="picker-title">Cortex</h1>
        <p className="picker-subtitle">Open a project to start working.</p>

        {recent.length > 0 ? (
          <ul className="picker-list">
            {recent.map((project) => (
              <li key={project.root} className={project.exists ? 'picker-item' : 'picker-item picker-item-missing'}>
                <button
                  type="button"
                  className="picker-item-open"
                  disabled={!project.exists || busy}
                  onClick={() => openRecent(project)}
                >
                  <span className="picker-item-name">{project.name}</span>
                  <span className="picker-item-path">{project.root}</span>
                </button>
                <span className="picker-item-meta">
                  {project.exists ? (
                    project.branch ? <span className="picker-branch">{project.branch}</span> : null
                  ) : (
                    <span className="picker-missing">missing</span>
                  )}
                  <button type="button" className="picker-forget" onClick={() => void forget(project.root)}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="picker-empty">No projects yet. Add one to get started.</p>
        )}

        {cloning ? (
          <div className="picker-clone">
            <input
              type="text"
              placeholder="https://github.com/owner/repo.git"
              value={cloneUrl}
              autoFocus
              onChange={(event) => setCloneUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') startClone();
                if (event.key === 'Escape') setCloning(false);
              }}
            />
            <button type="button" disabled={busy || !cloneUrl.trim()} onClick={startClone}>
              Clone
            </button>
            <button type="button" onClick={() => setCloning(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="picker-actions">
            <button type="button" disabled={busy} onClick={openExisting}>
              Open repository
            </button>
            <button type="button" disabled={busy} onClick={openOrInit}>
              Open folder (init)
            </button>
            <button type="button" disabled={busy} onClick={() => setCloning(true)}>
              Clone from remote
            </button>
          </div>
        )}

        {error ? <p className="picker-error">{error}</p> : null}
      </div>
    </div>
  );
}

function repoNameFromUrl(url: string): string {
  const trimmed = url.replace(/\/$/, '').replace(/\.git$/, '');
  const last = trimmed.split(/[/:]/).pop();
  return last && last.length > 0 ? last : 'repository';
}
