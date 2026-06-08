import type { TerminalSnapshot } from './ghosttyVt';
import { DEFAULT_TERMINAL_FONT_SIZE, DEFAULT_TERMINAL_LINE_HEIGHT } from './terminalSettings';

const DEFAULT_CELL_WIDTH = 8;
const TERMINAL_PADDING_PX = 10;

export function drawTerminal(canvas: HTMLCanvasElement, snapshot: TerminalSnapshot, focused = true) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const dpr = window.devicePixelRatio || 1;
  const styles = getComputedStyle(canvas);
  const fontSize = parsePx(styles.getPropertyValue('--terminal-font-size')) ?? DEFAULT_TERMINAL_FONT_SIZE;
  const lineHeight = parsePx(styles.getPropertyValue('--terminal-line-height')) ?? DEFAULT_TERMINAL_LINE_HEIGHT;
  const cellWidth = parsePx(styles.getPropertyValue('--terminal-cell-width')) ?? DEFAULT_CELL_WIDTH;
  const fontFamily = styles.getPropertyValue('--terminal-font-family').trim() || 'monospace';

  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.scale(dpr, dpr);

  ctx.fillStyle = snapshot.background;
  ctx.fillRect(0, 0, width, height);

  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textBaseline = 'top';

  for (let y = 0; y < snapshot.cells.length; y += 1) {
    const row = snapshot.cells[y];
    for (let x = 0; x < row.length; x += 1) {
      const cell = row[x];
      const cellX = TERMINAL_PADDING_PX + x * cellWidth;
      const cellY = TERMINAL_PADDING_PX + y * lineHeight;
      ctx.fillStyle = cell.selected ? cell.fg : cell.bg;
      ctx.fillRect(cellX, cellY, Math.ceil(cellWidth), Math.ceil(lineHeight));
      if (cell.text) {
        ctx.fillStyle = cell.selected ? cell.bg : cell.fg;
        ctx.fillText(cell.text, cellX, cellY);
      }
    }
  }

  if (snapshot.cursor.visible) {
    const cursorX = TERMINAL_PADDING_PX + snapshot.cursor.x * cellWidth;
    const cursorY = TERMINAL_PADDING_PX + snapshot.cursor.y * lineHeight;
    ctx.fillStyle = '#e6edf7';
    ctx.strokeStyle = '#e6edf7';
    // An unfocused pane always shows a hollow box so the active pane is the only
    // one with a solid cursor.
    if (!focused || snapshot.cursor.style === 'hollowBlock') {
      ctx.strokeRect(cursorX + 0.5, cursorY + 0.5, cellWidth - 1, lineHeight - 1);
    } else if (snapshot.cursor.style === 'bar') {
      ctx.fillRect(cursorX, cursorY, 2, lineHeight);
    } else if (snapshot.cursor.style === 'underline') {
      ctx.fillRect(cursorX, cursorY + lineHeight - 2, cellWidth, 2);
    } else {
      ctx.fillRect(cursorX, cursorY, cellWidth, lineHeight);
    }
  }

  drawScrollbar(ctx, width, height, snapshot.scrollbar);
}

function drawScrollbar(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scrollbar: TerminalSnapshot['scrollbar'],
) {
  if (scrollbar.total <= scrollbar.len) return;

  const trackHeight = Math.max(1, height - TERMINAL_PADDING_PX * 2);
  const thumbHeight = Math.max(24, trackHeight * (scrollbar.len / scrollbar.total));
  const maxOffset = Math.max(1, scrollbar.total - scrollbar.len);
  const thumbTop = TERMINAL_PADDING_PX + (trackHeight - thumbHeight) * (scrollbar.offset / maxOffset);

  ctx.fillStyle = 'rgba(52, 67, 95, 0.8)';
  ctx.fillRect(width - 5, thumbTop, 3, thumbHeight);
}

export function terminalGeometry(element: HTMLElement) {
  const pixelWidth = Math.max(1, element.clientWidth);
  const pixelHeight = Math.max(1, element.clientHeight);
  const { cellWidth, cellHeight } = terminalCellSize(element);
  return {
    cols: Math.max(20, Math.floor((pixelWidth - TERMINAL_PADDING_PX * 2) / cellWidth)),
    rows: Math.max(8, Math.floor((pixelHeight - TERMINAL_PADDING_PX * 2) / cellHeight)),
    pixelWidth,
    pixelHeight,
    cellWidth,
    cellHeight,
  };
}

function terminalCellSize(element: HTMLElement) {
  const styles = getComputedStyle(element);
  const fontSize = parsePx(styles.getPropertyValue('--terminal-font-size')) ?? DEFAULT_TERMINAL_FONT_SIZE;
  const lineHeight = parsePx(styles.getPropertyValue('--terminal-line-height')) ?? DEFAULT_TERMINAL_LINE_HEIGHT;
  const fontFamily = styles.getPropertyValue('--terminal-font-family').trim() || 'monospace';

  return {
    cellWidth: measureCellWidth(fontSize, fontFamily),
    cellHeight: Math.max(1, lineHeight),
  };
}

function measureCellWidth(fontSize: number, fontFamily: string) {
  const canvas = measureCellWidth.canvas ?? (measureCellWidth.canvas = document.createElement('canvas'));
  const context = canvas.getContext('2d');
  if (!context) return DEFAULT_CELL_WIDTH;

  context.font = `${fontSize}px ${fontFamily}`;
  return Math.max(1, context.measureText('M').width || DEFAULT_CELL_WIDTH);
}

measureCellWidth.canvas = undefined as HTMLCanvasElement | undefined;

function parsePx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
