import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { TerminalPane } from '../terminal/TerminalPane';
import {
  closePane,
  collectPanes,
  createPane,
  firstPaneId,
  placeLayout,
  setRatio,
  splitPane,
  type Layout,
  type Orientation,
  type PaneRect,
} from './layout';
import { saveLayout, type Project } from './projectApi';
import { CloseIcon, PlusIcon, SplitColumnsIcon, SplitRowsIcon } from './icons';

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
  const skipNextSave = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  // Persist the layout whenever it changes (but not the initial restored value).
  // Debounced so a divider drag coalesces into a single write rather than one
  // per pointer move.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => void saveLayout(project.root, layout), 300);
    return () => window.clearTimeout(timer);
  }, [layout, project.root]);

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
            {panes.map(({ pane, rect }) => (
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
                  cwd={resolveCwd(project.root, pane.cwd)}
                  root={project.root}
                  focused={pane.id === focusedPaneId}
                  onFocus={() => setFocusedPaneId(pane.id)}
                  onExit={() => close(pane.id)}
                />
              </div>
            ))}
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
