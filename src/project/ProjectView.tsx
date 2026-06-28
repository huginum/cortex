import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { TerminalPane } from '../terminal/TerminalPane';
import type { SessionDescriptor } from '../terminal/sessionTransport';
import {
  closePane,
  collectPanes,
  createPane,
  createContainerPane,
  firstPaneId,
  placeLayout,
  setRatio,
  splitPane,
  type Layout,
  type Orientation,
  type PaneNode,
  type PaneRect,
} from './layout';
import { saveLayout, type Project } from './projectApi';
import { CloseIcon, CubeIcon, PlusIcon, SplitColumnsIcon, SplitRowsIcon } from './icons';
import { onPullProgress, pullImage, sandboxSupport, type SandboxSupport } from '../sandbox/sandboxApi';
import {
  createContainer,
  listContainers,
  removeContainer,
  runContainer,
  stopContainer,
  type Container,
} from '../container/containerApi';

type ProjectViewProps = {
  project: Project;
  /** Layout restored from disk, or null for an empty project. */
  initialLayout: Layout;
  /** Return to the project picker. */
  onClose: () => void;
};

type Drag = { id: string; orientation: Orientation; region: PaneRect };

export function ProjectView({ project, initialLayout, onClose }: ProjectViewProps) {
  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [focusedPaneId, setFocusedPaneId] = useState<string | undefined>(() => firstPaneId(initialLayout));
  const [menuOpen, setMenuOpen] = useState(false);
  const [support, setSupport] = useState<SandboxSupport | null>(null);
  const [containers, setContainers] = useState<Container[]>([]);
  const [imageInput, setImageInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [commandInput, setCommandInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const skipNextSave = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  // Latest layout and whether a debounced save is still pending, so the final
  // change can be flushed if the project/window closes within the debounce.
  const layoutRef = useRef(layout);
  const savePendingRef = useRef(false);
  layoutRef.current = layout;

  // Persist the layout whenever it changes (but not the initial restored value).
  // Debounced so a divider drag coalesces into a single write rather than one
  // per pointer move.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    savePendingRef.current = true;
    const timer = window.setTimeout(() => {
      savePendingRef.current = false;
      void saveLayout(project.root, layout);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [layout, project.root]);

  // Flush a still-pending save on unmount (e.g. closing the project or window
  // within the 300 ms debounce window) so the last change is not lost.
  useEffect(() => {
    return () => {
      if (savePendingRef.current) {
        savePendingRef.current = false;
        void saveLayout(project.root, layoutRef.current);
      }
    };
  }, [project.root]);

  // Keep focus on a live pane: when the focused pane disappears (closed), move
  // focus to the first remaining pane.
  useEffect(() => {
    const ids = new Set(collectPanes(layout).map((pane) => pane.id));
    if (focusedPaneId && !ids.has(focusedPaneId)) {
      setFocusedPaneId(firstPaneId(layout));
    }
  }, [layout, focusedPaneId]);

  // Load the container list once so container panes can show their names.
  useEffect(() => {
    void listContainers().then(setContainers);
  }, []);

  function addFirstPane() {
    const pane = createPane('.');
    setLayout(pane);
    setFocusedPaneId(pane.id);
  }

  function focusedPane(): PaneNode | undefined {
    return collectPanes(layout).find((pane) => pane.id === focusedPaneId);
  }

  // Context-aware split: another shell in the same container when the focused
  // pane is a container, otherwise another host shell.
  function split(orientation: Orientation) {
    if (!focusedPaneId) {
      addFirstPane();
      return;
    }
    const focused = focusedPane();
    const pane =
      focused?.session.kind === 'container'
        ? createContainerPane(focused.session.id, focused.session.command)
        : createPane('.');
    setLayout((current) => splitPane(current, focusedPaneId, orientation, pane));
    setFocusedPaneId(pane.id);
  }

  // Add a pane the same way "+" does: first pane, or split off the focused one.
  function addPane(pane: PaneNode) {
    if (!focusedPaneId) {
      setLayout(pane);
    } else {
      setLayout((current) => splitPane(current, focusedPaneId, 'horizontal', pane));
    }
    setFocusedPaneId(pane.id);
  }

  // "+" adds a terminal: the first one when the project is empty, otherwise a
  // new pane split off the focused one — never replacing the existing layout.
  function addTerminal() {
    if (!focusedPaneId) {
      addFirstPane();
      return;
    }
    split('horizontal');
  }

  function close(targetId: string) {
    setLayout((current) => closePane(current, targetId));
  }

  const refreshContainers = useCallback(() => {
    void listContainers().then(setContainers);
  }, []);

  // Open (or close) the container menu, refreshing host support and the
  // container list each time it opens.
  function toggleMenu() {
    const next = !menuOpen;
    setMenuOpen(next);
    if (next) {
      setMenuError(null);
      void sandboxSupport().then(setSupport);
      refreshContainers();
    }
  }

  // Open a shell pane into a container, starting it if needed.
  function openContainerPane(id: string, command?: string) {
    addPane(createContainerPane(id, command));
    setMenuOpen(false);
  }

  // Create + run a container from an image: pull the image (with progress),
  // create the container (COW), start it, and open a shell pane.
  async function createAndRun() {
    const image = imageInput.trim();
    if (!image || busy) return;
    const name = nameInput.trim() || undefined;
    const command = commandInput.trim() || undefined;
    setMenuError(null);
    setBusy('pulling image…');
    const unlisten = await onPullProgress((progress) => setBusy(`image: ${progress.phase}…`));
    try {
      await pullImage(image);
      setBusy('creating container…');
      const container = await createContainer(image, name, command);
      setBusy('starting container…');
      await runContainer(container.id);
      openContainerPane(container.id, command);
      setImageInput('');
      setNameInput('');
      setCommandInput('');
      refreshContainers();
    } catch (error) {
      setMenuError(String(error));
    } finally {
      unlisten();
      setBusy(null);
    }
  }

  // Open a shell into an existing container (starting it if stopped).
  async function runExisting(container: Container) {
    if (busy) return;
    setMenuError(null);
    setBusy('starting container…');
    try {
      await runContainer(container.id);
      openContainerPane(container.id, undefined);
      refreshContainers();
    } catch (error) {
      setMenuError(String(error));
    } finally {
      setBusy(null);
    }
  }

  async function stopExisting(id: string) {
    setMenuError(null);
    try {
      await stopContainer(id);
      refreshContainers();
    } catch (error) {
      setMenuError(String(error));
    }
  }

  async function removeExisting(id: string) {
    setMenuError(null);
    try {
      await removeContainer(id);
      refreshContainers();
    } catch (error) {
      setMenuError(String(error));
    }
  }

  const onDragMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const root = rootRef.current;
    if (!drag || !root) return;
    const bounds = root.getBoundingClientRect();
    const pct =
      drag.orientation === 'horizontal'
        ? ((event.clientX - bounds.left) / bounds.width) * 100
        : ((event.clientY - bounds.top) / bounds.height) * 100;
    const span = drag.orientation === 'horizontal' ? drag.region.width : drag.region.height;
    const start = drag.orientation === 'horizontal' ? drag.region.left : drag.region.top;
    const ratio = Math.min(0.9, Math.max(0.1, (pct - start) / span));
    setLayout((current) => (current ? setRatio(current, drag.id, ratio) : current));
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
  }, [onDragMove]);

  function startDrag(event: React.PointerEvent, drag: Drag) {
    event.preventDefault();
    dragRef.current = drag;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  }

  // Map a pane's persisted session to a transport descriptor + display label.
  function paneBacking(pane: PaneNode): { session: SessionDescriptor; label?: string } {
    const session = pane.session;
    if (session.kind === 'container') {
      const container = containers.find((c) => c.id === session.id);
      const name = container?.name ?? session.id.slice(0, 8);
      const label =
        session.command && session.command !== '/bin/sh' ? `${name} · ${session.command}` : name;
      return { session: { kind: 'container', id: session.id, command: session.command }, label };
    }
    if (session.kind === 'sandbox') {
      return { session: { kind: 'sandbox', image: session.image }, label: session.image };
    }
    return {
      session: { kind: 'host', cwd: resolveCwd(project.root, session.cwd), root: project.root },
    };
  }

  const { panes, dividers } = placeLayout(layout);

  return (
    <div className="project-view">
      <header className="project-bar">
        <div className="project-bar-info">
          <span className="project-name">{project.name}</span>
          {project.branch ? <span className="project-branch">{project.branch}</span> : null}
        </div>
        <div className="project-bar-actions">
          <button type="button" className="icon-button" title="Split right" onClick={() => split('horizontal')}>
            <SplitColumnsIcon />
          </button>
          <button type="button" className="icon-button" title="Split down" onClick={() => split('vertical')}>
            <SplitRowsIcon />
          </button>
          <button type="button" className="icon-button" title="New terminal" onClick={addTerminal}>
            <PlusIcon />
          </button>
          <div className="sandbox-menu-anchor">
            <button
              type="button"
              className={menuOpen ? 'icon-button icon-button-active' : 'icon-button'}
              title="Containers"
              onClick={toggleMenu}
            >
              <CubeIcon />
            </button>
            {menuOpen ? (
              <div className="sandbox-menu sandbox-menu-wide" role="menu">
                {support && !support.supported ? (
                  <p className="sandbox-menu-note">{support.reason}</p>
                ) : (
                  <>
                    <form
                      className="sandbox-run-form sandbox-run-form-stacked"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void createAndRun();
                      }}
                    >
                      <input
                        className="sandbox-run-input"
                        placeholder="image, e.g. ubuntu:24.04"
                        value={imageInput}
                        onChange={(event) => setImageInput(event.target.value)}
                        disabled={!!busy}
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                      <div className="sandbox-run-row">
                        <input
                          className="sandbox-run-input"
                          placeholder="name (optional)"
                          value={nameInput}
                          onChange={(event) => setNameInput(event.target.value)}
                          disabled={!!busy}
                        />
                        <input
                          className="sandbox-run-input"
                          placeholder="command (default /bin/sh)"
                          value={commandInput}
                          onChange={(event) => setCommandInput(event.target.value)}
                          disabled={!!busy}
                        />
                      </div>
                      <button type="submit" className="sandbox-run-button" disabled={!!busy || !imageInput.trim()}>
                        Create &amp; run
                      </button>
                    </form>
                    {busy ? <p className="sandbox-menu-note">{busy}</p> : null}
                    {menuError ? <p className="sandbox-menu-note sandbox-menu-error">{menuError}</p> : null}

                    {containers.length > 0 ? (
                      <div className="sandbox-menu-list">
                        {containers.map((container) => (
                          <div key={container.id} className="container-row">
                            <button
                              type="button"
                              className="sandbox-menu-item container-row-main"
                              title={`Open a shell in ${container.name}`}
                              onClick={() => void runExisting(container)}
                              disabled={!!busy}
                            >
                              <span className={container.running ? 'container-dot running' : 'container-dot'} />
                              <span className="container-name">{container.name}</span>
                              <span className="container-image">{container.image}</span>
                            </button>
                            {container.running ? (
                              <button
                                type="button"
                                className="container-action"
                                title="Stop"
                                onClick={() => void stopExisting(container.id)}
                              >
                                ■
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="container-action"
                                title="Remove"
                                onClick={() => void removeExisting(container.id)}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="sandbox-menu-note">
                        No containers yet. Enter an image above to create and run one.
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </div>
          <button type="button" className="icon-button" title="Close project" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="project-canvas">
        {panes.length === 0 ? (
          <div className="project-empty">
            <p>No terminals open in this project.</p>
            <button type="button" className="icon-button icon-button-lg" title="New terminal" onClick={addTerminal}>
              <PlusIcon />
            </button>
          </div>
        ) : (
          <div className="layout-root" ref={rootRef}>
            {panes.map(({ pane, rect }) => {
              const { session, label } = paneBacking(pane);
              return (
                <div
                  key={pane.id}
                  className={pane.id === focusedPaneId ? 'layout-pane layout-pane-focused' : 'layout-pane'}
                  style={{
                    left: `${rect.left}%`,
                    top: `${rect.top}%`,
                    width: `${rect.width}%`,
                    height: `${rect.height}%`,
                  }}
                >
                  <TerminalPane
                    session={session}
                    label={label}
                    focused={pane.id === focusedPaneId}
                    onFocus={() => setFocusedPaneId(pane.id)}
                    onExit={() => close(pane.id)}
                  />
                </div>
              );
            })}
            {dividers.map((divider) => (
              <div
                key={divider.id}
                className={`layout-divider ${divider.orientation === 'horizontal' ? 'layout-divider-col' : 'layout-divider-row'}`}
                style={{
                  left: `${divider.rect.left}%`,
                  top: `${divider.rect.top}%`,
                  width: divider.orientation === 'horizontal' ? undefined : `${divider.rect.width}%`,
                  height: divider.orientation === 'horizontal' ? `${divider.rect.height}%` : undefined,
                }}
                onPointerDown={(event) =>
                  startDrag(event, { id: divider.id, orientation: divider.orientation, region: divider.region })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Resolve a repo-relative pane cwd to an absolute path for the backend,
 * confined to the repository root. A restored `.cortex/layout.json` is
 * attacker-controllable — it can be committed and shared between clones — so
 * `..` segments that would climb above the repo are dropped rather than
 * trusted, keeping shells inside the project as the repo-relative contract
 * promises.
 */
function resolveCwd(root: string, relative: string): string {
  const base = root.replace(/[\\/]+$/, '');
  if (!relative || relative === '.') return base;
  const stack: string[] = [];
  // Split on both separators: a layout written on Windows (or a crafted one)
  // may use `\`, which the backend's PathBuf would treat as a separator too.
  for (const segment of relative.split(/[\\/]+/)) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (stack.length > 0) stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.length > 0 ? `${base}/${stack.join('/')}` : base;
}
