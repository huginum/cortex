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

export async function startLocalTerminal(
  cols: number,
  rows: number,
  pixelWidth: number,
  pixelHeight: number,
  onData: (data: Uint8Array) => void,
  onExit: () => void,
  cwd?: string,
  root?: string,
): Promise<TerminalTransport> {
  const sessionId = await invoke<string>('start_terminal', {
    cols,
    rows,
    pixelWidth,
    pixelHeight,
    cwd,
    root,
  });
  const unlistenOutput = await listen<TerminalOutputPayload>('terminal-output', (event) => {
    if (event.payload.sessionId !== sessionId) return;
    onData(new Uint8Array(event.payload.data));
  });
  const unlistenExit = await listen<{ sessionId: string }>('terminal-exit', (event) => {
    if (event.payload.sessionId === sessionId) onExit();
  });

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
