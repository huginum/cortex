import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { TerminalPane } from '../terminal/TerminalPane';
import {
  closePane,
  collectPanes,
  createPane,
  createSandboxPane,
  firstPaneId,
  placeLayout,
  setRatio,
  splitPane,
  type Layout,
  type Orientation,
  type PaneRect,
} from './layout';
import { saveLayout, type Project } from './projectApi';
import { CloseIcon, CubeIcon, PlusIcon, SplitColumnsIcon, SplitRowsIcon } from './icons';
import {
  listImages,
  onPullProgress,
  pullImage,
  sandboxSupport,
  type ImageEntry,
  type SandboxSupport,
} from '../sandbox/sandboxApi';

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
  const [sandboxMenuOpen, setSandboxMenuOpen] = useState(false);
  const [support, setSupport] = useState<SandboxSupport | null>(null);
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [imageInput, setImageInput] = useState('');
  const [pulling, setPulling] = useState<{ reference: string; phase: string } | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);
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

  function addFirstPane() {
    const pane = createPane('.');
    setLayout(pane);
    setFocusedPaneId(pane.id);
  }

  function split(orientation: Orientation) {
    if (!focusedPaneId) {
      addFirstPane();
      return;
    }
    const pane = createPane('.');
    setLayout((current) => splitPane(current, focusedPaneId, orientation, pane));
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

  // Open (or close) the sandbox menu, refreshing host support and the cached
  // image list each time it opens.
  function toggleSandboxMenu() {
    const next = !sandboxMenuOpen;
    setSandboxMenuOpen(next);
    if (next) {
      setPullError(null);
      void sandboxSupport().then(setSupport);
      void listImages().then(setImages);
    }
  }

  // Open a sandbox pane booted from `image`: the first pane when the project is
  // empty, otherwise split off the focused pane — mirroring how host panes add.
  function openSandboxPane(image: string) {
    const pane = createSandboxPane(image);
    if (!focusedPaneId) {
      setLayout(pane);
    } else {
      setLayout((current) => splitPane(current, focusedPaneId, 'horizontal', pane));
    }
    setFocusedPaneId(pane.id);
    setSandboxMenuOpen(false);
  }

  // Run a container: ensure the image is cached (pulling with progress), then
  // open a sandbox pane. A pull failure is reported without opening a pane.
  async function runImage(reference: string) {
    const ref = reference.trim();
    if (!ref || pulling) return;
    setPullError(null);
    setPulling({ reference: ref, phase: 'starting' });
    const unlisten = await onPullProgress((progress) =>
      setPulling({ reference: ref, phase: progress.phase }),
    );
    try {
      await pullImage(ref);
      openSandboxPane(ref);
      setImageInput('');
      void listImages().then(setImages);
    } catch (error) {
      setPullError(String(error));
    } finally {
      unlisten();
      setPulling(null);
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
              className={sandboxMenuOpen ? 'icon-button icon-button-active' : 'icon-button'}
              title="New sandbox"
              onClick={toggleSandboxMenu}
            >
              <CubeIcon />
            </button>
            {sandboxMenuOpen ? (
              <div className="sandbox-menu" role="menu">
                {support && !support.supported ? (
                  <p className="sandbox-menu-note">{support.reason}</p>
                ) : (
                  <>
                    <form
                      className="sandbox-run-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void runImage(imageInput);
                      }}
                    >
                      <input
                        className="sandbox-run-input"
                        placeholder="image, e.g. ubuntu:24.04"
                        value={imageInput}
                        onChange={(event) => setImageInput(event.target.value)}
                        disabled={!!pulling}
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="sandbox-run-button"
                        disabled={!!pulling || !imageInput.trim()}
                      >
                        Run
                      </button>
                    </form>
                    {pulling ? (
                      <p className="sandbox-menu-note">
                        Pulling {pulling.reference} — {pulling.phase}…
                      </p>
                    ) : null}
                    {pullError ? (
                      <p className="sandbox-menu-note sandbox-menu-error">{pullError}</p>
                    ) : null}
                    {images.length > 0 ? (
                      <div className="sandbox-menu-list">
                        {images.map((image) => (
                          <button
                            key={image.reference}
                            type="button"
                            className="sandbox-menu-item"
                            role="menuitem"
                            onClick={() => void runImage(image.reference)}
                            disabled={!!pulling}
                          >
                            {image.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="sandbox-menu-note">
                        No images yet. Type a reference above to fetch and run one.
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
              const session =
                pane.session.kind === 'sandbox'
                  ? { kind: 'sandbox' as const, image: pane.session.image }
                  : { kind: 'host' as const, cwd: resolveCwd(project.root, pane.session.cwd), root: project.root };
              const label = pane.session.kind === 'sandbox' ? pane.session.image : undefined;
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
