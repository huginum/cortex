import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { GhosttyVt, type TerminalMouseInput, type TerminalSnapshot } from './ghosttyVt';
import { startLocalTerminal, type TerminalTransport } from './sessionTransport';
import { drawTerminal, terminalGeometry } from './terminalCanvas';
import { loadTerminalSettings, terminalStyle, type TerminalSettings } from './terminalSettings';

type TerminalState = 'idle' | 'starting' | 'ready' | 'error' | 'exited';

export type TerminalPaneProps = {
  /** Working directory for the shell; defaults to the user's home when omitted. */
  cwd?: string;
  /** Repository root; the backend confines the shell's cwd to within it. */
  root?: string;
  /** Called when the shell process exits so the parent can close this pane. */
  onExit: () => void;
  /** Whether this pane currently holds input focus (used for highlighting). */
  focused?: boolean;
  /** Called when the pane gains focus so the parent can track the active pane. */
  onFocus?: () => void;
};

export function TerminalPane({ cwd, root, onExit, focused, onFocus }: TerminalPaneProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLCanvasElement>(null);
  const ghosttyRef = useRef<GhosttyVt | null>(null);
  const transportRef = useRef<TerminalTransport | null>(null);
  const startedRef = useRef(false);
  // Set when the component unmounts so an in-flight start() can tear down a
  // backend session that resolves after we're gone, rather than leaking it.
  const cancelledRef = useRef(false);
  const drawFrameRef = useRef<number | undefined>(undefined);
  const pressedButtonRef = useRef<TerminalMouseInput['button'] | undefined>(undefined);
  const selectionRef = useRef<{ start: { x: number; y: number }; mode: 'cell' | 'word' } | undefined>(undefined);
  const latestSnapshotRef = useRef<TerminalSnapshot | undefined>(undefined);
  const focusedRef = useRef(focused);
  const geometryRef = useRef({ cols: 80, rows: 24, pixelWidth: 640, pixelHeight: 408, cellWidth: 8, cellHeight: 15 });
  const [state, setState] = useState<TerminalState>('idle');
  const [hasFrame, setHasFrame] = useState(false);
  const [settings, setSettings] = useState<TerminalSettings>({});
  const [cellWidth, setCellWidth] = useState(8);
  const [terminalBackground, setTerminalBackground] = useState('#090e1d');

  useEffect(() => {
    void loadTerminalSettings().then(setSettings);

    return () => {
      cancelledRef.current = true;
      if (drawFrameRef.current !== undefined) cancelAnimationFrame(drawFrameRef.current);
      transportRef.current?.dispose();
      void transportRef.current?.stop();
      ghosttyRef.current?.dispose();
    };
  }, []);

  // A pane starts its shell once on mount. The app never auto-starts a terminal
  // at launch; panes only exist once a project is open and a terminal is added
  // or restored, so starting here is always an explicit, user-driven action.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, []);

  // Move keyboard focus to whichever pane the parent marks active, so focus
  // follows a new pane after a split and the surviving pane after a close. Also
  // redraw so the cursor switches between solid (focused) and hollow (not).
  useEffect(() => {
    focusedRef.current = focused;
    if (focused) viewportRef.current?.focus();
    if (hasFrame && screenRef.current && ghosttyRef.current) {
      drawTerminal(screenRef.current, ghosttyRef.current.snapshot(), focused);
    }
  }, [focused, hasFrame]);

  async function start() {
    if (!viewportRef.current || state === 'starting' || state === 'ready') return;

    setState('starting');

    try {
      await waitForTerminalLayout();
      const geometry = updateGeometry();
      if (!geometry) return;
      const { cols, rows, pixelWidth, pixelHeight } = geometry;
      const ghostty = await GhosttyVt.create(cols, rows);
      if (cancelledRef.current) {
        ghostty.dispose();
        return;
      }
      ghosttyRef.current = ghostty;

      const transport = await startLocalTerminal(
        cols,
        rows,
        pixelWidth,
        pixelHeight,
        (data) => {
          ghostty.clearSelection();
          ghostty.write(data);
          queueDraw();
        },
        () => {
          setState('exited');
          onExit();
        },
        cwd,
        root,
      );
      if (cancelledRef.current) {
        // Unmounted while the backend session was being created; tear it down
        // so we never leave an orphaned PTY attached to a dead component.
        transport.dispose();
        void transport.stop();
        return;
      }
      transportRef.current = transport;
      setState('ready');
      draw();
      requestAnimationFrame(() => viewportRef.current?.focus());
      queueResizeSync();
    } catch {
      setState('error');
    }
  }

  function draw() {
    if (!ghosttyRef.current) return;
    const snapshot = ghosttyRef.current.snapshot();
    latestSnapshotRef.current = snapshot;
    setTerminalBackground(snapshot.background);
    if (screenRef.current) drawTerminal(screenRef.current, snapshot, focusedRef.current);
    setHasFrame(true);
  }

  function queueDraw() {
    if (drawFrameRef.current !== undefined) return;

    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = undefined;
      try {
        draw();
      } catch {
        setState('error');
      }
    });
  }

  function drawPreservingContent() {
    if (!ghosttyRef.current) return;
    const snapshot = ghosttyRef.current.snapshot();
    latestSnapshotRef.current = snapshot;
    setTerminalBackground(snapshot.background);
    if (screenRef.current) drawTerminal(screenRef.current, snapshot, focusedRef.current);
    setHasFrame(true);
  }

  function updateGeometry() {
    if (!viewportRef.current) return null;
    const geometry = terminalGeometry(viewportRef.current);
    geometryRef.current = geometry;
    setCellWidth(geometry.cellWidth);
    return geometry;
  }

  useEffect(() => {
    if (!hasFrame || !ghosttyRef.current || !screenRef.current) return;
    drawTerminal(screenRef.current, ghosttyRef.current.snapshot(), focusedRef.current);
  }, [cellWidth, terminalBackground, settings, hasFrame]);

  async function resize() {
    if (!viewportRef.current || !ghosttyRef.current || !transportRef.current) return;
    const geometry = terminalGeometry(viewportRef.current);
    const { cols, rows, pixelWidth, pixelHeight, cellWidth, cellHeight } = geometry;
    const last = geometryRef.current;
    const gridChanged = last.cols !== cols || last.rows !== rows || last.cellWidth !== cellWidth || last.cellHeight !== cellHeight;
    if (!gridChanged) {
      geometryRef.current = geometry;
      drawPreservingContent();
      return;
    }

    geometryRef.current = geometry;
    setCellWidth(cellWidth);
    ghosttyRef.current.scrollToBottom();
    ghosttyRef.current.resize(cols, rows, cellWidth, cellHeight);
    await transportRef.current.resize(cols, rows, pixelWidth, pixelHeight);
    ghosttyRef.current.scrollToBottom();
    drawPreservingContent();
    requestAnimationFrame(() => drawPreservingContent());
  }

  function queueResizeSync() {
    requestAnimationFrame(() => {
      void resize();
      window.setTimeout(() => void resize(), 80);
      window.setTimeout(() => void resize(), 240);
    });
  }

  async function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!ghosttyRef.current || !transportRef.current) return;

    if (event.metaKey && event.key.toLowerCase() === 'c' && copySelection()) {
      event.preventDefault();
      return;
    }
    if (event.metaKey && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      await pasteText(await navigator.clipboard?.readText());
      return;
    }

    let input = encodeKey(event);
    if (!input) return;

    event.preventDefault();
    ghosttyRef.current.clearSelection();
    ghosttyRef.current.scrollToBottom();
    await transportRef.current.write(ghosttyRef.current.encodeTextInput(input));
  }

  async function onMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button === 0 && ghosttyRef.current && !ghosttyRef.current.mouseTrackingActive()) {
      event.preventDefault();
      viewportRef.current?.focus();
      const point = terminalPoint(event, viewportRef.current, geometryRef.current);
      if (event.detail >= 2) {
        selectionRef.current = { start: point, mode: 'word' };
        ghosttyRef.current.selectWordAt(point);
        draw();
        return;
      }

      selectionRef.current = { start: point, mode: 'cell' };
      ghosttyRef.current.selectViewportRange(point, point);
      draw();
      return;
    }

    const button = mouseButton(event.button);
    pressedButtonRef.current = button;
    await writeMouse(event, 'press', button);
  }

  async function onMouseUp(event: React.MouseEvent<HTMLDivElement>) {
    if (selectionRef.current && ghosttyRef.current) {
      event.preventDefault();
      const end = terminalPoint(event, viewportRef.current, geometryRef.current);
      if (selectionRef.current.mode === 'word') {
        ghosttyRef.current.selectWordsBetween(selectionRef.current.start, end);
      } else {
        ghosttyRef.current.selectViewportRange(selectionRef.current.start, end);
      }
      selectionRef.current = undefined;
      draw();
      return;
    }

    const button = mouseButton(event.button) ?? pressedButtonRef.current;
    pressedButtonRef.current = undefined;
    await writeMouse(event, 'release', button);
  }

  async function onMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (selectionRef.current && ghosttyRef.current) {
      event.preventDefault();
      const end = terminalPoint(event, viewportRef.current, geometryRef.current);
      if (selectionRef.current.mode === 'word') {
        ghosttyRef.current.selectWordsBetween(selectionRef.current.start, end);
      } else {
        ghosttyRef.current.selectViewportRange(selectionRef.current.start, end);
      }
      draw();
      return;
    }

    if (event.buttons === 0 && !pressedButtonRef.current) return;
    await writeMouse(event, 'motion', pressedButtonRef.current);
  }

  async function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!ghosttyRef.current) return;

    if (!ghosttyRef.current.mouseTrackingActive()) {
      ghosttyRef.current.scrollViewport(event.deltaY < 0 ? -3 : 3);
      draw();
      return;
    }

    const button = event.deltaY < 0 ? 'wheelUp' : 'wheelDown';
    await writeMouse(event, 'press', button);
  }

  async function writeMouse(
    event: React.MouseEvent<HTMLDivElement> | React.WheelEvent<HTMLDivElement>,
    action: TerminalMouseInput['action'],
    button: TerminalMouseInput['button'],
  ) {
    if (!viewportRef.current || !ghosttyRef.current || !transportRef.current) return;

    const input = mouseInput(event, viewportRef.current, geometryRef.current, action, button);
    const encoded = ghosttyRef.current.encodeMouseInput(input);
    if (encoded.length === 0) return;

    event.preventDefault();
    viewportRef.current.focus();
    await transportRef.current.write(encoded);
  }

  async function pasteText(text: string | undefined) {
    if (!text || !ghosttyRef.current || !transportRef.current) return;

    ghosttyRef.current.clearSelection();
    ghosttyRef.current.scrollToBottom();
    await transportRef.current.write(ghosttyRef.current.encodePasteInput(text));
    draw();
  }

  function encodeKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey && event.key.length === 1) {
      const code = event.key.toUpperCase().charCodeAt(0);
      if (code >= 64 && code <= 95) return String.fromCharCode(code - 64);
    }

    let input = event.key.length === 1 ? event.key : '';
    if (event.key === 'Enter') input = '\r';
    if (event.key === 'Backspace') input = '\x7f';
    if (event.key === 'Tab') input = '\t';
    if (event.key === 'Escape') input = '\x1b';
    if (event.key === 'ArrowUp') input = '\x1b[A';
    if (event.key === 'ArrowDown') input = '\x1b[B';
    if (event.key === 'ArrowRight') input = '\x1b[C';
    if (event.key === 'ArrowLeft') input = '\x1b[D';
    return input;
  }

  useEffect(() => {
    void document.fonts?.ready.then(() => {
      if (state === 'ready') void resize();
      else updateGeometry();
    });
  }, [settings, state]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(() => {
      if (state === 'ready') void resize();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [state]);

  function copySelection() {
    const text = selectedText(latestSnapshotRef.current);
    if (!text) return false;

    void navigator.clipboard?.writeText(text);
    return true;
  }

  return (
    <section className="terminal-card">
      <div
        ref={viewportRef}
        className="terminal-viewport"
        style={{ ...terminalStyle(settings), '--terminal-cell-width': `${cellWidth}px`, '--terminal-background': terminalBackground } as React.CSSProperties}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseMove={onMouseMove}
        onWheel={onWheel}
        onFocus={onFocus}
        onContextMenu={(event) => event.preventDefault()}
        onCopy={(event) => {
          const text = selectedText(latestSnapshotRef.current);
          if (!text) return;
          event.clipboardData.setData('text/plain', text);
          event.preventDefault();
        }}
        onPaste={(event) => {
          event.preventDefault();
          void pasteText(event.clipboardData.getData('text/plain'));
        }}
        aria-label="Embedded terminal viewport"
      >
        {hasFrame ? (
          <canvas ref={screenRef} className="terminal-screen" />
        ) : (
          <div className="terminal-placeholder">Starting shell...</div>
        )}
      </div>
    </section>
  );
}

function terminalPoint(
  event: React.MouseEvent<HTMLDivElement>,
  viewport: HTMLDivElement | null,
  geometry: ReturnType<typeof terminalGeometry>,
) {
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  return {
    x: Math.floor((event.clientX - rect.left - 10) / geometry.cellWidth),
    y: Math.floor((event.clientY - rect.top - 10) / geometry.cellHeight),
  };
}

function selectedText(snapshot: TerminalSnapshot | undefined) {
  if (!snapshot) return '';

  return snapshot.cells
    .map((row) => row.filter((cell) => cell.selected).map((cell) => cell.text || ' ').join('').trimEnd())
    .filter((line) => line.length > 0)
    .join('\n');
}

async function waitForTerminalLayout() {
  await document.fonts?.ready;
  await nextFrame();
  await nextFrame();
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function mouseInput(
  event: React.MouseEvent<HTMLDivElement> | React.WheelEvent<HTMLDivElement>,
  viewport: HTMLDivElement,
  geometry: ReturnType<typeof terminalGeometry>,
  action: TerminalMouseInput['action'],
  button: TerminalMouseInput['button'],
): TerminalMouseInput {
  const rect = viewport.getBoundingClientRect();
  return {
    action,
    button,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    screenWidth: viewport.clientWidth,
    screenHeight: viewport.clientHeight,
    cellWidth: geometry.cellWidth,
    cellHeight: geometry.cellHeight,
    mods: {
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      alt: event.altKey,
      super: event.metaKey,
    },
  };
}

function mouseButton(button: number): TerminalMouseInput['button'] {
  if (button === 0) return 'left';
  if (button === 1) return 'middle';
  if (button === 2) return 'right';
  return undefined;
}
