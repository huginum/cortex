import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type TerminalTransport = {
  sessionId: string;
  write(data: Uint8Array): Promise<void>;
  resize(cols: number, rows: number, pixelWidth: number, pixelHeight: number): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;
};

type TerminalOutputPayload = {
  sessionId: string;
  data: number[];
};

/** What a terminal session is attached to. A host shell at a working directory,
 *  or a sandbox microVM booted from a prepared rootfs (referenced by id). */
export type SessionDescriptor =
  | { kind: 'host'; cwd?: string; root?: string }
  | { kind: 'sandbox'; rootfs: string };

export async function startTerminalSession(
  cols: number,
  rows: number,
  pixelWidth: number,
  pixelHeight: number,
  onData: (data: Uint8Array) => void,
  onExit: () => void,
  session: SessionDescriptor,
): Promise<TerminalTransport> {
  const sessionArgs =
    session.kind === 'sandbox'
      ? { kind: 'sandbox', rootfs: session.rootfs }
      : { cwd: session.cwd, root: session.root };
  const sessionId = await invoke<string>('start_terminal', {
    cols,
    rows,
    pixelWidth,
    pixelHeight,
    ...sessionArgs,
  });
  const unlistenOutput = await listen<TerminalOutputPayload>('terminal-output', (event) => {
    if (event.payload.sessionId !== sessionId) return;
    onData(new Uint8Array(event.payload.data));
  });
  const unlistenExit = await listen<{ sessionId: string }>('terminal-exit', (event) => {
    if (event.payload.sessionId === sessionId) onExit();
  });

  // Start streaming only now that the listeners are attached, so the backend
  // never emits startup output (or a fast exit) before we can receive it.
  await invoke('subscribe_terminal', { sessionId });

  return {
    sessionId,
    write(data) {
      return invoke('write_terminal', { sessionId, data: Array.from(data) });
    },
    resize(cols, rows, pixelWidth, pixelHeight) {
      return invoke('resize_terminal', { sessionId, cols, rows, pixelWidth, pixelHeight });
    },
    stop() {
      return invoke('stop_terminal', { sessionId });
    },
    dispose() {
      unlistenOutput();
      unlistenExit();
    },
  };
}
