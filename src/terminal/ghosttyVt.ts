type WasmExports = WebAssembly.Exports & {
  memory: WebAssembly.Memory;
  ghostty_type_json: () => number;
  ghostty_wasm_alloc_opaque: () => number;
  ghostty_wasm_free_opaque: (ptr: number) => void;
  ghostty_wasm_alloc_u8_array: (len: number) => number;
  ghostty_wasm_free_u8_array: (ptr: number, len: number) => void;
  ghostty_wasm_alloc_usize: () => number;
  ghostty_wasm_free_usize: (ptr: number) => void;
  ghostty_free: (allocator: number, ptr: number, len: number) => void;
  ghostty_terminal_new: (allocator: number, terminalPtr: number, optionsPtr: number) => number;
  ghostty_terminal_free: (terminal: number) => void;
  ghostty_terminal_resize: (
    terminal: number,
    cols: number,
    rows: number,
    cellWidthPx: number,
    cellHeightPx: number,
  ) => number;
  ghostty_terminal_get: (terminal: number, data: number, outPtr: number) => number;
  ghostty_terminal_set: (terminal: number, option: number, valuePtr: number) => number;
  ghostty_terminal_mode_get: (terminal: number, mode: number, outPtr: number) => number;
  ghostty_terminal_grid_ref: (terminal: number, pointPtr: number, outRefPtr: number) => number;
  ghostty_terminal_select_word: (terminal: number, optionsPtr: number, outSelectionPtr: number) => number;
  ghostty_terminal_select_word_between: (terminal: number, optionsPtr: number, outSelectionPtr: number) => number;
  ghostty_terminal_scroll_viewport: (terminal: number, behaviorPtr: number) => void;
  ghostty_terminal_vt_write: (terminal: number, dataPtr: number, len: number) => void;
  ghostty_render_state_new: (allocator: number, renderStatePtr: number) => number;
  ghostty_render_state_free: (renderState: number) => void;
  ghostty_render_state_update: (renderState: number, terminal: number) => number;
  ghostty_render_state_get: (renderState: number, data: number, outPtr: number) => number;
  ghostty_render_state_colors_get: (renderState: number, outColorsPtr: number) => number;
  ghostty_render_state_row_iterator_new: (allocator: number, outIteratorPtr: number) => number;
  ghostty_render_state_row_iterator_free: (iterator: number) => void;
  ghostty_render_state_row_iterator_next: (iterator: number) => number;
  ghostty_render_state_row_get: (iterator: number, data: number, outPtr: number) => number;
  ghostty_render_state_row_cells_new: (allocator: number, outCellsPtr: number) => number;
  ghostty_render_state_row_cells_free: (cells: number) => void;
  ghostty_render_state_row_cells_next: (cells: number) => number;
  ghostty_render_state_row_cells_get: (cells: number, data: number, outPtr: number) => number;
  ghostty_mouse_encoder_new: (allocator: number, mouseEncoderPtr: number) => number;
  ghostty_mouse_encoder_free: (mouseEncoder: number) => void;
  ghostty_mouse_encoder_setopt: (mouseEncoder: number, option: number, valuePtr: number) => void;
  ghostty_mouse_encoder_setopt_from_terminal: (mouseEncoder: number, terminal: number) => void;
  ghostty_mouse_encoder_encode: (
    mouseEncoder: number,
    mouseEvent: number,
    outBufPtr: number,
    outBufSize: number,
    outLenPtr: number,
  ) => number;
  ghostty_mouse_event_new: (allocator: number, mouseEventPtr: number) => number;
  ghostty_mouse_event_free: (mouseEvent: number) => void;
  ghostty_mouse_event_set_action: (mouseEvent: number, action: number) => void;
  ghostty_mouse_event_set_button: (mouseEvent: number, button: number) => void;
  ghostty_mouse_event_clear_button: (mouseEvent: number) => void;
  ghostty_mouse_event_set_mods: (mouseEvent: number, mods: number) => void;
  ghostty_mouse_event_set_position: (mouseEvent: number, positionPtr: number) => void;
  ghostty_paste_encode: (dataPtr: number, dataLen: number, bracketed: number, bufPtr: number, bufLen: number, outLenPtr: number) => number;
  ghostty_formatter_terminal_new: (
    allocator: number,
    formatterPtr: number,
    terminal: number,
    optionsPtr: number,
  ) => number;
  ghostty_formatter_free: (formatter: number) => void;
  ghostty_formatter_format_alloc: (
    formatter: number,
    allocator: number,
    outPtrPtr: number,
    outLenPtr: number,
  ) => number;
};

type TypeLayout = Record<
  string,
  {
    size: number;
    fields: Record<string, { offset: number; type: string }>;
  }
>;

export type TerminalSnapshot = {
  cols: number;
  rows: number;
  text: string;
  html: string;
  cursor: TerminalCursor;
  background: string;
  foreground: string;
  cells: TerminalRenderCell[][];
  scrollbar: TerminalScrollbar;
};

export type TerminalScrollbar = {
  total: number;
  offset: number;
  len: number;
};

export type TerminalRenderCell = {
  text: string;
  fg: string;
  bg: string;
  selected: boolean;
};

export type TerminalCursor = {
  visible: boolean;
  blinking: boolean;
  x: number;
  y: number;
  style: 'block' | 'bar' | 'underline' | 'hollowBlock';
};

export type TerminalMouseInput = {
  action: 'press' | 'release' | 'motion';
  button?: 'left' | 'right' | 'middle' | 'wheelUp' | 'wheelDown';
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  cellWidth: number;
  cellHeight: number;
  mods: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    super: boolean;
  };
};

const GHOSTTY_SUCCESS = 0;
const GHOSTTY_FORMATTER_FORMAT_PLAIN = 0;
const GHOSTTY_FORMATTER_FORMAT_HTML = 2;
const GHOSTTY_CURSOR_STYLE_BAR = 0;
const GHOSTTY_CURSOR_STYLE_BLOCK = 1;
const GHOSTTY_CURSOR_STYLE_UNDERLINE = 2;
const GHOSTTY_CURSOR_STYLE_BLOCK_HOLLOW = 3;
const GHOSTTY_RENDER_STATE_DATA_CURSOR_VISUAL_STYLE = 10;
const GHOSTTY_RENDER_STATE_DATA_CURSOR_VISIBLE = 11;
const GHOSTTY_RENDER_STATE_DATA_CURSOR_BLINKING = 12;
const GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_HAS_VALUE = 14;
const GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_X = 15;
const GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_Y = 16;
const GHOSTTY_RENDER_STATE_DATA_ROW_ITERATOR = 4;
const GHOSTTY_RENDER_STATE_ROW_DATA_CELLS = 3;
const GHOSTTY_RENDER_STATE_ROW_DATA_SELECTION = 4;
const GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_BG_COLOR = 5;
const GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_FG_COLOR = 6;
const GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_UTF8 = 9;
const GHOSTTY_TERMINAL_OPT_SELECTION = 21;
const GHOSTTY_TERMINAL_DATA_SCROLLBAR = 9;
const GHOSTTY_TERMINAL_DATA_MOUSE_TRACKING = 11;
const GHOSTTY_POINT_TAG_VIEWPORT = 1;
const GHOSTTY_MODE_BRACKETED_PASTE = 2004;
const GHOSTTY_SCROLL_VIEWPORT_TOP = 0;
const GHOSTTY_SCROLL_VIEWPORT_BOTTOM = 1;
const GHOSTTY_SCROLL_VIEWPORT_DELTA = 2;
const GHOSTTY_MOUSE_ACTION_PRESS = 0;
const GHOSTTY_MOUSE_ACTION_RELEASE = 1;
const GHOSTTY_MOUSE_ACTION_MOTION = 2;
const GHOSTTY_MOUSE_BUTTON_LEFT = 1;
const GHOSTTY_MOUSE_BUTTON_RIGHT = 2;
const GHOSTTY_MOUSE_BUTTON_MIDDLE = 3;
const GHOSTTY_MOUSE_BUTTON_FOUR = 4;
const GHOSTTY_MOUSE_BUTTON_FIVE = 5;
const GHOSTTY_MOUSE_ENCODER_OPT_SIZE = 2;
const GHOSTTY_MOUSE_ENCODER_OPT_ANY_BUTTON_PRESSED = 3;
const GHOSTTY_MOUSE_ENCODER_OPT_TRACK_LAST_CELL = 4;
const GHOSTTY_MODS_SHIFT = 1 << 0;
const GHOSTTY_MODS_CTRL = 1 << 1;
const GHOSTTY_MODS_ALT = 1 << 2;
const GHOSTTY_MODS_SUPER = 1 << 3;
const TERMINAL_PADDING_PX = 10;

export class GhosttyVt {
  private constructor(
    private readonly exports: WasmExports,
    private readonly layout: TypeLayout,
    private readonly terminal: number,
    private readonly renderState: number,
    private readonly mouseEncoder: number,
    private cols: number,
    private rows: number,
  ) {}

  static async create(cols: number, rows: number): Promise<GhosttyVt> {
    const wasm = await WebAssembly.instantiateStreaming(fetch('/ghostty-vt.wasm'), {
      env: {
        log: () => undefined,
      },
    });
    const exports = wasm.instance.exports as WasmExports;
    const layout = readTypeLayout(exports);
    const optsSize = layout.GhosttyTerminalOptions.size;
    const optsPtr = exports.ghostty_wasm_alloc_u8_array(optsSize);
    new Uint8Array(exports.memory.buffer, optsPtr, optsSize).fill(0);
    const optsView = new DataView(exports.memory.buffer, optsPtr, optsSize);
    setField(layout, optsView, 'GhosttyTerminalOptions', 'cols', cols);
    setField(layout, optsView, 'GhosttyTerminalOptions', 'rows', rows);
    setField(layout, optsView, 'GhosttyTerminalOptions', 'max_scrollback', 10_000);

    const terminalPtrPtr = exports.ghostty_wasm_alloc_opaque();
    const result = exports.ghostty_terminal_new(0, terminalPtrPtr, optsPtr);
    exports.ghostty_wasm_free_u8_array(optsPtr, optsSize);

    if (result !== GHOSTTY_SUCCESS) {
      exports.ghostty_wasm_free_opaque(terminalPtrPtr);
      throw new Error(`ghostty_terminal_new failed with result ${result}`);
    }

    const terminal = new DataView(exports.memory.buffer).getUint32(terminalPtrPtr, true);
    exports.ghostty_wasm_free_opaque(terminalPtrPtr);

    const renderStatePtrPtr = exports.ghostty_wasm_alloc_opaque();
    const renderStateResult = exports.ghostty_render_state_new(0, renderStatePtrPtr);
    if (renderStateResult !== GHOSTTY_SUCCESS) {
      exports.ghostty_wasm_free_opaque(renderStatePtrPtr);
      exports.ghostty_terminal_free(terminal);
      throw new Error(`ghostty_render_state_new failed with result ${renderStateResult}`);
    }

    const renderState = new DataView(exports.memory.buffer).getUint32(renderStatePtrPtr, true);
    exports.ghostty_wasm_free_opaque(renderStatePtrPtr);
    const updateResult = exports.ghostty_render_state_update(renderState, terminal);
    if (updateResult !== GHOSTTY_SUCCESS) {
      exports.ghostty_render_state_free(renderState);
      exports.ghostty_terminal_free(terminal);
      throw new Error(`ghostty_render_state_update failed with result ${updateResult}`);
    }

    const mouseEncoderPtrPtr = exports.ghostty_wasm_alloc_opaque();
    const mouseEncoderResult = exports.ghostty_mouse_encoder_new(0, mouseEncoderPtrPtr);
    if (mouseEncoderResult !== GHOSTTY_SUCCESS) {
      exports.ghostty_wasm_free_opaque(mouseEncoderPtrPtr);
      exports.ghostty_render_state_free(renderState);
      exports.ghostty_terminal_free(terminal);
      throw new Error(`ghostty_mouse_encoder_new failed with result ${mouseEncoderResult}`);
    }
    const mouseEncoder = new DataView(exports.memory.buffer).getUint32(mouseEncoderPtrPtr, true);
    exports.ghostty_wasm_free_opaque(mouseEncoderPtrPtr);

    return new GhosttyVt(exports, layout, terminal, renderState, mouseEncoder, cols, rows);
  }

  dispose() {
    this.exports.ghostty_mouse_encoder_free(this.mouseEncoder);
    this.exports.ghostty_render_state_free(this.renderState);
    this.exports.ghostty_terminal_free(this.terminal);
  }

  write(data: Uint8Array) {
    if (data.length === 0) return;
    const dataPtr = this.exports.ghostty_wasm_alloc_u8_array(data.length);
    new Uint8Array(this.exports.memory.buffer).set(data, dataPtr);
    this.exports.ghostty_terminal_vt_write(this.terminal, dataPtr, data.length);
    this.exports.ghostty_wasm_free_u8_array(dataPtr, data.length);
  }

  resize(cols: number, rows: number, cellWidthPx: number, cellHeightPx: number) {
    const oldCols = this.cols;
    const oldRows = this.rows;
    if (cols < oldCols && rows < oldRows) {
      this.resizeTerminal(oldCols, rows, cellWidthPx, cellHeightPx);
    }

    this.cols = cols;
    this.rows = rows;
    this.resizeTerminal(cols, rows, cellWidthPx, cellHeightPx);
  }

  private resizeTerminal(cols: number, rows: number, cellWidthPx: number, cellHeightPx: number) {
    const result = this.exports.ghostty_terminal_resize(
      this.terminal,
      cols,
      rows,
      cellWidthPx,
      cellHeightPx,
    );
    if (result !== GHOSTTY_SUCCESS) {
      throw new Error(`ghostty_terminal_resize failed with result ${result}`);
    }
  }

  scrollViewport(delta: number) {
    const behavior = this.layout.GhosttyTerminalScrollViewport;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(behavior.size);
    new Uint8Array(this.exports.memory.buffer, ptr, behavior.size).fill(0);
    const view = new DataView(this.exports.memory.buffer, ptr, behavior.size);
    view.setUint32(field(this.layout, 'GhosttyTerminalScrollViewport', 'tag').offset, GHOSTTY_SCROLL_VIEWPORT_DELTA, true);
    view.setBigInt64(field(this.layout, 'GhosttyTerminalScrollViewport', 'value').offset, BigInt(delta), true);
    this.exports.ghostty_terminal_scroll_viewport(this.terminal, ptr);
    this.exports.ghostty_wasm_free_u8_array(ptr, behavior.size);
  }

  scrollToBottom() {
    this.scrollViewportTagged(GHOSTTY_SCROLL_VIEWPORT_BOTTOM);
  }

  mouseTrackingActive() {
    return this.terminalBool(GHOSTTY_TERMINAL_DATA_MOUSE_TRACKING);
  }

  selectViewportRange(start: { x: number; y: number }, end: { x: number; y: number }) {
    const startRef = this.viewportGridRef(start.x, start.y);
    const endRef = this.viewportGridRef(end.x, end.y);
    if (!startRef || !endRef) return false;

    const selection = this.layout.GhosttySelection;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(selection.size);
    new Uint8Array(this.exports.memory.buffer, ptr, selection.size).fill(0);
    const view = new DataView(this.exports.memory.buffer, ptr, selection.size);
    view.setUint32(field(this.layout, 'GhosttySelection', 'size').offset, selection.size, true);
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      ptr + field(this.layout, 'GhosttySelection', 'start').offset,
      startRef,
      startRef + this.layout.GhosttyGridRef.size,
    );
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      ptr + field(this.layout, 'GhosttySelection', 'end').offset,
      endRef,
      endRef + this.layout.GhosttyGridRef.size,
    );
    view.setUint8(field(this.layout, 'GhosttySelection', 'rectangle').offset, 0);
    const result = this.exports.ghostty_terminal_set(this.terminal, GHOSTTY_TERMINAL_OPT_SELECTION, ptr);
    this.exports.ghostty_wasm_free_u8_array(startRef, this.layout.GhosttyGridRef.size);
    this.exports.ghostty_wasm_free_u8_array(endRef, this.layout.GhosttyGridRef.size);
    this.exports.ghostty_wasm_free_u8_array(ptr, selection.size);
    return result === GHOSTTY_SUCCESS;
  }

  clearSelection() {
    this.exports.ghostty_terminal_set(this.terminal, GHOSTTY_TERMINAL_OPT_SELECTION, 0);
  }

  selectWordAt(point: { x: number; y: number }) {
    const ref = this.viewportGridRef(point.x, point.y);
    if (!ref) return false;

    const options = this.layout.GhosttyTerminalSelectWordOptions;
    const optionsPtr = this.exports.ghostty_wasm_alloc_u8_array(options.size);
    new Uint8Array(this.exports.memory.buffer, optionsPtr, options.size).fill(0);
    const optionsView = new DataView(this.exports.memory.buffer, optionsPtr, options.size);
    optionsView.setUint32(field(this.layout, 'GhosttyTerminalSelectWordOptions', 'size').offset, options.size, true);
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      optionsPtr + field(this.layout, 'GhosttyTerminalSelectWordOptions', 'ref').offset,
      ref,
      ref + this.layout.GhosttyGridRef.size,
    );

    const selection = this.layout.GhosttySelection;
    const selectionPtr = this.exports.ghostty_wasm_alloc_u8_array(selection.size);
    new Uint8Array(this.exports.memory.buffer, selectionPtr, selection.size).fill(0);
    new DataView(this.exports.memory.buffer, selectionPtr, selection.size).setUint32(field(this.layout, 'GhosttySelection', 'size').offset, selection.size, true);

    const result = this.exports.ghostty_terminal_select_word(this.terminal, optionsPtr, selectionPtr);
    const setResult = result === GHOSTTY_SUCCESS ? this.exports.ghostty_terminal_set(this.terminal, GHOSTTY_TERMINAL_OPT_SELECTION, selectionPtr) : result;
    this.exports.ghostty_wasm_free_u8_array(selectionPtr, selection.size);
    this.exports.ghostty_wasm_free_u8_array(optionsPtr, options.size);
    this.exports.ghostty_wasm_free_u8_array(ref, this.layout.GhosttyGridRef.size);
    return setResult === GHOSTTY_SUCCESS;
  }

  selectWordsBetween(start: { x: number; y: number }, end: { x: number; y: number }) {
    const startRef = this.viewportGridRef(start.x, start.y);
    const endRef = this.viewportGridRef(end.x, end.y);
    if (!startRef || !endRef) return false;

    const forwardSelection = this.wordBetweenSelection(startRef, endRef);
    const reverseSelection = this.wordBetweenSelection(endRef, startRef);
    if (!forwardSelection || !reverseSelection) {
      if (forwardSelection) this.exports.ghostty_wasm_free_u8_array(forwardSelection, this.layout.GhosttySelection.size);
      if (reverseSelection) this.exports.ghostty_wasm_free_u8_array(reverseSelection, this.layout.GhosttySelection.size);
      this.exports.ghostty_wasm_free_u8_array(startRef, this.layout.GhosttyGridRef.size);
      this.exports.ghostty_wasm_free_u8_array(endRef, this.layout.GhosttyGridRef.size);
      return false;
    }

    const selection = this.layout.GhosttySelection;
    const selectionPtr = this.exports.ghostty_wasm_alloc_u8_array(selection.size);
    new Uint8Array(this.exports.memory.buffer, selectionPtr, selection.size).fill(0);
    const selectionView = new DataView(this.exports.memory.buffer, selectionPtr, selection.size);
    selectionView.setUint32(field(this.layout, 'GhosttySelection', 'size').offset, selection.size, true);
    const startOffset = field(this.layout, 'GhosttySelection', 'start').offset;
    const endOffset = field(this.layout, 'GhosttySelection', 'end').offset;
    const startBeforeEnd = terminalOrder(start.x, start.y, end.x, end.y) <= 0;
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      selectionPtr + startOffset,
      (startBeforeEnd ? forwardSelection : reverseSelection) + startOffset,
      (startBeforeEnd ? forwardSelection : reverseSelection) + startOffset + this.layout.GhosttyGridRef.size,
    );
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      selectionPtr + endOffset,
      (startBeforeEnd ? reverseSelection : forwardSelection) + endOffset,
      (startBeforeEnd ? reverseSelection : forwardSelection) + endOffset + this.layout.GhosttyGridRef.size,
    );
    selectionView.setUint8(field(this.layout, 'GhosttySelection', 'rectangle').offset, 0);
    const setResult = this.exports.ghostty_terminal_set(this.terminal, GHOSTTY_TERMINAL_OPT_SELECTION, selectionPtr);

    this.exports.ghostty_wasm_free_u8_array(selectionPtr, selection.size);
    this.exports.ghostty_wasm_free_u8_array(forwardSelection, selection.size);
    this.exports.ghostty_wasm_free_u8_array(reverseSelection, selection.size);
    this.exports.ghostty_wasm_free_u8_array(startRef, this.layout.GhosttyGridRef.size);
    this.exports.ghostty_wasm_free_u8_array(endRef, this.layout.GhosttyGridRef.size);
    return setResult === GHOSTTY_SUCCESS;
  }

  private wordBetweenSelection(startRef: number, endRef: number) {
    const options = this.layout.GhosttyTerminalSelectWordBetweenOptions;
    const optionsPtr = this.exports.ghostty_wasm_alloc_u8_array(options.size);
    new Uint8Array(this.exports.memory.buffer, optionsPtr, options.size).fill(0);
    const optionsView = new DataView(this.exports.memory.buffer, optionsPtr, options.size);
    optionsView.setUint32(field(this.layout, 'GhosttyTerminalSelectWordBetweenOptions', 'size').offset, options.size, true);
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      optionsPtr + field(this.layout, 'GhosttyTerminalSelectWordBetweenOptions', 'start').offset,
      startRef,
      startRef + this.layout.GhosttyGridRef.size,
    );
    new Uint8Array(this.exports.memory.buffer).copyWithin(
      optionsPtr + field(this.layout, 'GhosttyTerminalSelectWordBetweenOptions', 'end').offset,
      endRef,
      endRef + this.layout.GhosttyGridRef.size,
    );

    const selection = this.layout.GhosttySelection;
    const selectionPtr = this.exports.ghostty_wasm_alloc_u8_array(selection.size);
    new Uint8Array(this.exports.memory.buffer, selectionPtr, selection.size).fill(0);
    new DataView(this.exports.memory.buffer, selectionPtr, selection.size).setUint32(field(this.layout, 'GhosttySelection', 'size').offset, selection.size, true);

    const result = this.exports.ghostty_terminal_select_word_between(this.terminal, optionsPtr, selectionPtr);
    this.exports.ghostty_wasm_free_u8_array(optionsPtr, options.size);
    if (result === GHOSTTY_SUCCESS) return selectionPtr;

    this.exports.ghostty_wasm_free_u8_array(selectionPtr, selection.size);
    return undefined;
  }

  encodeTextInput(value: string): Uint8Array {
    return new TextEncoder().encode(value);
  }

  encodePasteInput(value: string): Uint8Array {
    const input = new TextEncoder().encode(value);
    const dataLen = Math.max(1, input.length);
    const dataPtr = this.exports.ghostty_wasm_alloc_u8_array(dataLen);
    new Uint8Array(this.exports.memory.buffer, dataPtr, dataLen).fill(0);
    new Uint8Array(this.exports.memory.buffer).set(input, dataPtr);

    const outLenPtr = this.exports.ghostty_wasm_alloc_usize();
    const bracketed = this.modeEnabled(GHOSTTY_MODE_BRACKETED_PASTE) ? 1 : 0;
    this.exports.ghostty_paste_encode(dataPtr, input.length, bracketed, 0, 0, outLenPtr);
    const requiredLen = new DataView(this.exports.memory.buffer).getUint32(outLenPtr, true);
    if (requiredLen === 0) {
      this.exports.ghostty_wasm_free_u8_array(dataPtr, dataLen);
      this.exports.ghostty_wasm_free_usize(outLenPtr);
      return new Uint8Array();
    }

    const outPtr = this.exports.ghostty_wasm_alloc_u8_array(requiredLen);
    const result = this.exports.ghostty_paste_encode(dataPtr, input.length, bracketed, outPtr, requiredLen, outLenPtr);
    const outLen = new DataView(this.exports.memory.buffer).getUint32(outLenPtr, true);
    const output = result === GHOSTTY_SUCCESS ? new Uint8Array(this.exports.memory.buffer, outPtr, outLen).slice() : new Uint8Array();
    this.exports.ghostty_wasm_free_u8_array(outPtr, requiredLen);
    this.exports.ghostty_wasm_free_u8_array(dataPtr, dataLen);
    this.exports.ghostty_wasm_free_usize(outLenPtr);
    return output;
  }

  encodeMouseInput(input: TerminalMouseInput): Uint8Array {
    this.exports.ghostty_mouse_encoder_setopt_from_terminal(this.mouseEncoder, this.terminal);
    this.configureMouseEncoder(input);

    const mouseEventPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const mouseEventResult = this.exports.ghostty_mouse_event_new(0, mouseEventPtrPtr);
    if (mouseEventResult !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_opaque(mouseEventPtrPtr);
      return new Uint8Array();
    }

    const mouseEvent = new DataView(this.exports.memory.buffer).getUint32(mouseEventPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(mouseEventPtrPtr);
    this.exports.ghostty_mouse_event_set_action(mouseEvent, mouseAction(input.action));
    const button = mouseButton(input.button);
    if (button === 0) this.exports.ghostty_mouse_event_clear_button(mouseEvent);
    else this.exports.ghostty_mouse_event_set_button(mouseEvent, button);
    this.exports.ghostty_mouse_event_set_mods(mouseEvent, mouseMods(input.mods));

    const positionPtr = this.exports.ghostty_wasm_alloc_u8_array(this.layout.GhosttyMousePosition.size);
    const positionView = new DataView(this.exports.memory.buffer, positionPtr, this.layout.GhosttyMousePosition.size);
    const scaled = scaledMouseGeometry(input);
    positionView.setFloat32(field(this.layout, 'GhosttyMousePosition', 'x').offset, scaled.x, true);
    positionView.setFloat32(field(this.layout, 'GhosttyMousePosition', 'y').offset, scaled.y, true);
    this.exports.ghostty_mouse_event_set_position(mouseEvent, positionPtr);
    this.exports.ghostty_wasm_free_u8_array(positionPtr, this.layout.GhosttyMousePosition.size);

    const outLenPtr = this.exports.ghostty_wasm_alloc_usize();
    let result = this.exports.ghostty_mouse_encoder_encode(this.mouseEncoder, mouseEvent, 0, 0, outLenPtr);
    const requiredLen = new DataView(this.exports.memory.buffer).getUint32(outLenPtr, true);
    if (requiredLen === 0) {
      this.exports.ghostty_wasm_free_usize(outLenPtr);
      this.exports.ghostty_mouse_event_free(mouseEvent);
      return new Uint8Array();
    }

    const outBufPtr = this.exports.ghostty_wasm_alloc_u8_array(requiredLen);
    result = this.exports.ghostty_mouse_encoder_encode(this.mouseEncoder, mouseEvent, outBufPtr, requiredLen, outLenPtr);
    const outLen = new DataView(this.exports.memory.buffer).getUint32(outLenPtr, true);
    const output = result === GHOSTTY_SUCCESS ? new Uint8Array(this.exports.memory.buffer, outBufPtr, outLen).slice() : new Uint8Array();
    this.exports.ghostty_wasm_free_u8_array(outBufPtr, requiredLen);
    this.exports.ghostty_wasm_free_usize(outLenPtr);
    this.exports.ghostty_mouse_event_free(mouseEvent);
    return output;
  }

  snapshot(): TerminalSnapshot {
    this.exports.ghostty_render_state_update(this.renderState, this.terminal);
    const colors = this.colors();
    return {
      cols: this.cols,
      rows: this.rows,
      text: '',
      html: '',
      cursor: this.cursor(),
      background: colors.background,
      foreground: colors.foreground,
      cells: this.renderCells(colors),
      scrollbar: this.scrollbar(),
    };
  }

  private scrollViewportTagged(tag: number) {
    const behavior = this.layout.GhosttyTerminalScrollViewport;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(behavior.size);
    new Uint8Array(this.exports.memory.buffer, ptr, behavior.size).fill(0);
    new DataView(this.exports.memory.buffer, ptr, behavior.size).setUint32(
      field(this.layout, 'GhosttyTerminalScrollViewport', 'tag').offset,
      tag,
      true,
    );
    this.exports.ghostty_terminal_scroll_viewport(this.terminal, ptr);
    this.exports.ghostty_wasm_free_u8_array(ptr, behavior.size);
  }

  private scrollbar(): TerminalScrollbar {
    const info = this.layout.GhosttyTerminalScrollbar;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(info.size);
    new Uint8Array(this.exports.memory.buffer, ptr, info.size).fill(0);
    const result = this.exports.ghostty_terminal_get(this.terminal, GHOSTTY_TERMINAL_DATA_SCROLLBAR, ptr);
    const view = new DataView(this.exports.memory.buffer, ptr, info.size);
    const scrollbar = result === GHOSTTY_SUCCESS
      ? {
          total: readU64(view, field(this.layout, 'GhosttyTerminalScrollbar', 'total').offset),
          offset: readU64(view, field(this.layout, 'GhosttyTerminalScrollbar', 'offset').offset),
          len: readU64(view, field(this.layout, 'GhosttyTerminalScrollbar', 'len').offset),
        }
      : { total: this.rows, offset: 0, len: this.rows };
    this.exports.ghostty_wasm_free_u8_array(ptr, info.size);
    return scrollbar;
  }

  private colors() {
    const colors = this.layout.GhosttyRenderStateColors;
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(colors.size);
    new Uint8Array(this.exports.memory.buffer, ptr, colors.size).fill(0);
    new DataView(this.exports.memory.buffer, ptr, colors.size).setUint32(
      field(this.layout, 'GhosttyRenderStateColors', 'size').offset,
      colors.size,
      true,
    );
    const result = this.exports.ghostty_render_state_colors_get(this.renderState, ptr);
    if (result !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_u8_array(ptr, colors.size);
      return { background: '#090e1d', foreground: '#e6edf7' };
    }

    const background = readColor(
      this.exports.memory,
      this.layout,
      ptr + field(this.layout, 'GhosttyRenderStateColors', 'background').offset,
    );
    const foreground = readColor(
      this.exports.memory,
      this.layout,
      ptr + field(this.layout, 'GhosttyRenderStateColors', 'foreground').offset,
    );
    this.exports.ghostty_wasm_free_u8_array(ptr, colors.size);
    return { background, foreground };
  }

  private renderCells(colors: { background: string; foreground: string }) {
    const updateResult = this.exports.ghostty_render_state_update(this.renderState, this.terminal);
    if (updateResult !== GHOSTTY_SUCCESS) return blankCells(this.rows, this.cols, colors);

    const iteratorPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const iteratorResult = this.exports.ghostty_render_state_row_iterator_new(0, iteratorPtrPtr);
    if (iteratorResult !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_opaque(iteratorPtrPtr);
      return blankCells(this.rows, this.cols, colors);
    }
    const getIteratorResult = this.exports.ghostty_render_state_get(
      this.renderState,
      GHOSTTY_RENDER_STATE_DATA_ROW_ITERATOR,
      iteratorPtrPtr,
    );
    const iterator = new DataView(this.exports.memory.buffer).getUint32(iteratorPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(iteratorPtrPtr);
    if (getIteratorResult !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_render_state_row_iterator_free(iterator);
      return blankCells(this.rows, this.cols, colors);
    }

    const rows: TerminalRenderCell[][] = [];
    while (this.exports.ghostty_render_state_row_iterator_next(iterator)) {
      rows.push(this.renderRow(iterator, colors));
    }
    this.exports.ghostty_render_state_row_iterator_free(iterator);

    while (rows.length < this.rows) rows.push(blankRow(this.cols, colors));
    return rows.slice(0, this.rows);
  }

  private renderRow(iterator: number, colors: { background: string; foreground: string }) {
    const cellsPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const cellsResult = this.exports.ghostty_render_state_row_cells_new(0, cellsPtrPtr);
    if (cellsResult !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_opaque(cellsPtrPtr);
      return blankRow(this.cols, colors);
    }
    const rowGetResult = this.exports.ghostty_render_state_row_get(iterator, GHOSTTY_RENDER_STATE_ROW_DATA_CELLS, cellsPtrPtr);
    const cellsHandle = new DataView(this.exports.memory.buffer).getUint32(cellsPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(cellsPtrPtr);
    if (rowGetResult !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_render_state_row_cells_free(cellsHandle);
      return blankRow(this.cols, colors);
    }

    const row: TerminalRenderCell[] = [];
    const selection = this.rowSelection(iterator);
    while (this.exports.ghostty_render_state_row_cells_next(cellsHandle)) {
      row.push(this.renderCell(cellsHandle, colors, selection, row.length));
    }
    this.exports.ghostty_render_state_row_cells_free(cellsHandle);
    while (row.length < this.cols) row.push({ text: '', fg: colors.foreground, bg: colors.background, selected: false });
    return row.slice(0, this.cols);
  }

  private rowSelection(iterator: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(8);
    new Uint8Array(this.exports.memory.buffer, ptr, 8).fill(0);
    const view = new DataView(this.exports.memory.buffer, ptr, 8);
    view.setUint32(0, 8, true);
    const result = this.exports.ghostty_render_state_row_get(iterator, GHOSTTY_RENDER_STATE_ROW_DATA_SELECTION, ptr);
    const selection = result === GHOSTTY_SUCCESS
      ? { start: view.getUint16(4, true), end: view.getUint16(6, true) }
      : undefined;
    this.exports.ghostty_wasm_free_u8_array(ptr, 8);
    return selection;
  }

  private renderCell(
    cellsHandle: number,
    colors: { background: string; foreground: string },
    selection: { start: number; end: number } | undefined,
    x: number,
  ): TerminalRenderCell {
    return {
      text: this.cellText(cellsHandle),
      fg: this.cellColor(cellsHandle, GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_FG_COLOR) ?? colors.foreground,
      bg: this.cellColor(cellsHandle, GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_BG_COLOR) ?? colors.background,
      selected: selection ? x >= selection.start && x <= selection.end : false,
    };
  }

  private viewportGridRef(x: number, y: number) {
    const point = this.layout.GhosttyPoint;
    const pointPtr = this.exports.ghostty_wasm_alloc_u8_array(point.size);
    new Uint8Array(this.exports.memory.buffer, pointPtr, point.size).fill(0);
    const view = new DataView(this.exports.memory.buffer, pointPtr, point.size);
    view.setUint32(field(this.layout, 'GhosttyPoint', 'tag').offset, GHOSTTY_POINT_TAG_VIEWPORT, true);
    const valueOffset = field(this.layout, 'GhosttyPoint', 'value').offset;
    view.setUint16(valueOffset + field(this.layout, 'GhosttyPointCoordinate', 'x').offset, clampCell(x, this.cols), true);
    view.setUint32(valueOffset + field(this.layout, 'GhosttyPointCoordinate', 'y').offset, clampCell(y, this.rows), true);

    const refPtr = this.exports.ghostty_wasm_alloc_u8_array(this.layout.GhosttyGridRef.size);
    new Uint8Array(this.exports.memory.buffer, refPtr, this.layout.GhosttyGridRef.size).fill(0);
    new DataView(this.exports.memory.buffer, refPtr, this.layout.GhosttyGridRef.size).setUint32(
      field(this.layout, 'GhosttyGridRef', 'size').offset,
      this.layout.GhosttyGridRef.size,
      true,
    );
    const result = this.exports.ghostty_terminal_grid_ref(this.terminal, pointPtr, refPtr);
    this.exports.ghostty_wasm_free_u8_array(pointPtr, point.size);
    if (result !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_u8_array(refPtr, this.layout.GhosttyGridRef.size);
      return undefined;
    }
    return refPtr;
  }

  private cellText(cellsHandle: number) {
    const bufferSize = this.layout.GhosttyBuffer.size;
    const queryPtr = this.exports.ghostty_wasm_alloc_u8_array(bufferSize);
    new Uint8Array(this.exports.memory.buffer, queryPtr, bufferSize).fill(0);
    this.exports.ghostty_render_state_row_cells_get(cellsHandle, GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_UTF8, queryPtr);
    const view = new DataView(this.exports.memory.buffer, queryPtr, bufferSize);
    const requiredLen = view.getUint32(field(this.layout, 'GhosttyBuffer', 'len').offset, true);
    this.exports.ghostty_wasm_free_u8_array(queryPtr, bufferSize);
    if (requiredLen === 0) return '';

    const textPtr = this.exports.ghostty_wasm_alloc_u8_array(requiredLen);
    const bufferPtr = this.exports.ghostty_wasm_alloc_u8_array(bufferSize);
    new Uint8Array(this.exports.memory.buffer, bufferPtr, bufferSize).fill(0);
    const bufferView = new DataView(this.exports.memory.buffer, bufferPtr, bufferSize);
    bufferView.setUint32(field(this.layout, 'GhosttyBuffer', 'ptr').offset, textPtr, true);
    bufferView.setUint32(field(this.layout, 'GhosttyBuffer', 'cap').offset, requiredLen, true);
    const result = this.exports.ghostty_render_state_row_cells_get(cellsHandle, GHOSTTY_RENDER_STATE_ROW_CELLS_DATA_GRAPHEMES_UTF8, bufferPtr);
    const outLen = bufferView.getUint32(field(this.layout, 'GhosttyBuffer', 'len').offset, true);
    const text = result === GHOSTTY_SUCCESS ? new TextDecoder().decode(new Uint8Array(this.exports.memory.buffer, textPtr, outLen)) : '';
    this.exports.ghostty_wasm_free_u8_array(textPtr, requiredLen);
    this.exports.ghostty_wasm_free_u8_array(bufferPtr, bufferSize);
    return text;
  }

  private cellColor(cellsHandle: number, data: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(this.layout.GhosttyColorRgb.size);
    const result = this.exports.ghostty_render_state_row_cells_get(cellsHandle, data, ptr);
    const color = result === GHOSTTY_SUCCESS ? readColor(this.exports.memory, this.layout, ptr) : undefined;
    this.exports.ghostty_wasm_free_u8_array(ptr, this.layout.GhosttyColorRgb.size);
    return color;
  }

  private cursor(): TerminalCursor {
    const updateResult = this.exports.ghostty_render_state_update(this.renderState, this.terminal);
    if (updateResult !== GHOSTTY_SUCCESS) return invisibleCursor();

    const visible = this.renderBool(GHOSTTY_RENDER_STATE_DATA_CURSOR_VISIBLE);
    const hasViewportValue = this.renderBool(GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_HAS_VALUE);
    if (!visible || !hasViewportValue) return invisibleCursor();

    return {
      visible: true,
      blinking: this.renderBool(GHOSTTY_RENDER_STATE_DATA_CURSOR_BLINKING),
      x: this.renderU16(GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_X),
      y: this.renderU16(GHOSTTY_RENDER_STATE_DATA_CURSOR_VIEWPORT_Y),
      style: cursorStyle(this.renderU32(GHOSTTY_RENDER_STATE_DATA_CURSOR_VISUAL_STYLE)),
    };
  }

  private renderBool(data: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(1);
    const result = this.exports.ghostty_render_state_get(this.renderState, data, ptr);
    const value = result === GHOSTTY_SUCCESS && new Uint8Array(this.exports.memory.buffer, ptr, 1)[0] !== 0;
    this.exports.ghostty_wasm_free_u8_array(ptr, 1);
    return value;
  }

  private terminalBool(data: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(1);
    const result = this.exports.ghostty_terminal_get(this.terminal, data, ptr);
    const value = result === GHOSTTY_SUCCESS && new Uint8Array(this.exports.memory.buffer, ptr, 1)[0] !== 0;
    this.exports.ghostty_wasm_free_u8_array(ptr, 1);
    return value;
  }

  private modeEnabled(mode: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(1);
    const result = this.exports.ghostty_terminal_mode_get(this.terminal, mode, ptr);
    const value = result === GHOSTTY_SUCCESS && new Uint8Array(this.exports.memory.buffer, ptr, 1)[0] !== 0;
    this.exports.ghostty_wasm_free_u8_array(ptr, 1);
    return value;
  }

  private renderU16(data: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(2);
    const result = this.exports.ghostty_render_state_get(this.renderState, data, ptr);
    const value = result === GHOSTTY_SUCCESS ? new DataView(this.exports.memory.buffer, ptr, 2).getUint16(0, true) : 0;
    this.exports.ghostty_wasm_free_u8_array(ptr, 2);
    return value;
  }

  private renderU32(data: number) {
    const ptr = this.exports.ghostty_wasm_alloc_u8_array(4);
    const result = this.exports.ghostty_render_state_get(this.renderState, data, ptr);
    const value = result === GHOSTTY_SUCCESS ? new DataView(this.exports.memory.buffer, ptr, 4).getUint32(0, true) : 0;
    this.exports.ghostty_wasm_free_u8_array(ptr, 4);
    return value;
  }

  private configureMouseEncoder(input: TerminalMouseInput) {
    const size = this.layout.GhosttyMouseEncoderSize;
    const sizePtr = this.exports.ghostty_wasm_alloc_u8_array(size.size);
    new Uint8Array(this.exports.memory.buffer, sizePtr, size.size).fill(0);
    const sizeView = new DataView(this.exports.memory.buffer, sizePtr, size.size);
    const scaled = scaledMouseGeometry(input);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'size', size.size);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'screen_width', scaled.screenWidth);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'screen_height', scaled.screenHeight);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'cell_width', scaled.cellWidth);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'cell_height', scaled.cellHeight);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'padding_top', TERMINAL_PADDING_PX);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'padding_bottom', TERMINAL_PADDING_PX);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'padding_right', TERMINAL_PADDING_PX);
    setField(this.layout, sizeView, 'GhosttyMouseEncoderSize', 'padding_left', TERMINAL_PADDING_PX);
    this.exports.ghostty_mouse_encoder_setopt(this.mouseEncoder, GHOSTTY_MOUSE_ENCODER_OPT_SIZE, sizePtr);
    this.exports.ghostty_wasm_free_u8_array(sizePtr, size.size);

    const boolPtr = this.exports.ghostty_wasm_alloc_u8_array(1);
    new Uint8Array(this.exports.memory.buffer, boolPtr, 1)[0] = input.action === 'motion' && input.button ? 1 : 0;
    this.exports.ghostty_mouse_encoder_setopt(this.mouseEncoder, GHOSTTY_MOUSE_ENCODER_OPT_ANY_BUTTON_PRESSED, boolPtr);
    new Uint8Array(this.exports.memory.buffer, boolPtr, 1)[0] = 1;
    this.exports.ghostty_mouse_encoder_setopt(this.mouseEncoder, GHOSTTY_MOUSE_ENCODER_OPT_TRACK_LAST_CELL, boolPtr);
    this.exports.ghostty_wasm_free_u8_array(boolPtr, 1);
  }

  private format(format: number): string {
    const formatter = this.createFormatter(format);
    const outPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const outLenPtr = this.exports.ghostty_wasm_alloc_usize();
    const result = this.exports.ghostty_formatter_format_alloc(formatter, 0, outPtrPtr, outLenPtr);

    if (result !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_formatter_free(formatter);
      this.exports.ghostty_wasm_free_opaque(outPtrPtr);
      this.exports.ghostty_wasm_free_usize(outLenPtr);
      throw new Error(`ghostty_formatter_format_alloc failed with result ${result}`);
    }

    const view = new DataView(this.exports.memory.buffer);
    const outPtr = view.getUint32(outPtrPtr, true);
    const outLen = view.getUint32(outLenPtr, true);
    const bytes = new Uint8Array(this.exports.memory.buffer, outPtr, outLen);
    const text = new TextDecoder().decode(bytes);

    this.exports.ghostty_free(0, outPtr, outLen);
    this.exports.ghostty_wasm_free_opaque(outPtrPtr);
    this.exports.ghostty_wasm_free_usize(outLenPtr);
    this.exports.ghostty_formatter_free(formatter);

    return text;
  }

  private createFormatter(format: number): number {
    const optsSize = this.layout.GhosttyFormatterTerminalOptions.size;
    const optsPtr = this.exports.ghostty_wasm_alloc_u8_array(optsSize);
    new Uint8Array(this.exports.memory.buffer, optsPtr, optsSize).fill(0);
    const optsView = new DataView(this.exports.memory.buffer, optsPtr, optsSize);
    setField(this.layout, optsView, 'GhosttyFormatterTerminalOptions', 'size', optsSize);
    setField(
      this.layout,
      optsView,
      'GhosttyFormatterTerminalOptions',
      'emit',
      format,
    );
    setField(this.layout, optsView, 'GhosttyFormatterTerminalOptions', 'unwrap', 0);
    setField(this.layout, optsView, 'GhosttyFormatterTerminalOptions', 'trim', 0);

    const extraOffset = field(this.layout, 'GhosttyFormatterTerminalOptions', 'extra').offset;
    const extraSize = this.layout.GhosttyFormatterTerminalExtra.size;
    const extraSizeField = field(this.layout, 'GhosttyFormatterTerminalExtra', 'size');
    optsView.setUint32(extraOffset + extraSizeField.offset, extraSize, true);
    setNestedBool(this.layout, optsView, extraOffset, 'GhosttyFormatterTerminalExtra', 'palette', true);

    const screenOffset = field(this.layout, 'GhosttyFormatterTerminalExtra', 'screen').offset;
    const screenSize = this.layout.GhosttyFormatterScreenExtra.size;
    const screenSizeField = field(this.layout, 'GhosttyFormatterScreenExtra', 'size');
    optsView.setUint32(extraOffset + screenOffset + screenSizeField.offset, screenSize, true);
    const screenBaseOffset = extraOffset + screenOffset;
    setNestedBool(this.layout, optsView, screenBaseOffset, 'GhosttyFormatterScreenExtra', 'cursor', true);
    setNestedBool(this.layout, optsView, screenBaseOffset, 'GhosttyFormatterScreenExtra', 'style', true);
    setNestedBool(this.layout, optsView, screenBaseOffset, 'GhosttyFormatterScreenExtra', 'hyperlink', true);

    const formatterPtrPtr = this.exports.ghostty_wasm_alloc_opaque();
    const result = this.exports.ghostty_formatter_terminal_new(
      0,
      formatterPtrPtr,
      this.terminal,
      optsPtr,
    );
    this.exports.ghostty_wasm_free_u8_array(optsPtr, optsSize);

    if (result !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_opaque(formatterPtrPtr);
      throw new Error(`ghostty_formatter_terminal_new failed with result ${result}`);
    }

    const formatter = new DataView(this.exports.memory.buffer).getUint32(formatterPtrPtr, true);
    this.exports.ghostty_wasm_free_opaque(formatterPtrPtr);
    return formatter;
  }
}

function invisibleCursor(): TerminalCursor {
  return { visible: false, blinking: false, x: 0, y: 0, style: 'block' };
}

function cursorStyle(style: number): TerminalCursor['style'] {
  if (style === GHOSTTY_CURSOR_STYLE_BAR) return 'bar';
  if (style === GHOSTTY_CURSOR_STYLE_UNDERLINE) return 'underline';
  if (style === GHOSTTY_CURSOR_STYLE_BLOCK_HOLLOW) return 'hollowBlock';
  return 'block';
}

function readColor(memory: WebAssembly.Memory, layout: TypeLayout, offset: number) {
  const color = field(layout, 'GhosttyColorRgb', 'r');
  const r = new Uint8Array(memory.buffer, offset + color.offset, 1)[0];
  const g = new Uint8Array(memory.buffer, offset + field(layout, 'GhosttyColorRgb', 'g').offset, 1)[0];
  const b = new Uint8Array(memory.buffer, offset + field(layout, 'GhosttyColorRgb', 'b').offset, 1)[0];
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function readU64(view: DataView, offset: number) {
  const value = view.getBigUint64(offset, true);
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}

function hex(value: number) {
  return value.toString(16).padStart(2, '0');
}

function blankCells(rows: number, cols: number, colors: { background: string; foreground: string }) {
  return Array.from({ length: rows }, () => blankRow(cols, colors));
}

function blankRow(cols: number, colors: { background: string; foreground: string }) {
  return Array.from({ length: cols }, () => ({ text: '', fg: colors.foreground, bg: colors.background, selected: false }));
}

function clampCell(value: number, max: number) {
  return Math.max(0, Math.min(Math.max(0, max - 1), Math.floor(value)));
}

function terminalOrder(leftX: number, leftY: number, rightX: number, rightY: number) {
  if (leftY !== rightY) return leftY - rightY;
  return leftX - rightX;
}

function mouseAction(action: TerminalMouseInput['action']) {
  if (action === 'release') return GHOSTTY_MOUSE_ACTION_RELEASE;
  if (action === 'motion') return GHOSTTY_MOUSE_ACTION_MOTION;
  return GHOSTTY_MOUSE_ACTION_PRESS;
}

function mouseButton(button: TerminalMouseInput['button']) {
  if (button === 'left') return GHOSTTY_MOUSE_BUTTON_LEFT;
  if (button === 'right') return GHOSTTY_MOUSE_BUTTON_RIGHT;
  if (button === 'middle') return GHOSTTY_MOUSE_BUTTON_MIDDLE;
  if (button === 'wheelUp') return GHOSTTY_MOUSE_BUTTON_FOUR;
  if (button === 'wheelDown') return GHOSTTY_MOUSE_BUTTON_FIVE;
  return 0;
}

function mouseMods(mods: TerminalMouseInput['mods']) {
  let value = 0;
  if (mods.shift) value |= GHOSTTY_MODS_SHIFT;
  if (mods.ctrl) value |= GHOSTTY_MODS_CTRL;
  if (mods.alt) value |= GHOSTTY_MODS_ALT;
  if (mods.super) value |= GHOSTTY_MODS_SUPER;
  return value;
}

function scaledMouseGeometry(input: TerminalMouseInput) {
  const cellWidth = Math.max(1, Math.round(input.cellWidth));
  const cellHeight = Math.max(1, Math.round(input.cellHeight));
  const scaleX = cellWidth / input.cellWidth;
  const scaleY = cellHeight / input.cellHeight;

  return {
    cellWidth,
    cellHeight,
    screenWidth: Math.max(1, Math.round(TERMINAL_PADDING_PX * 2 + (input.screenWidth - TERMINAL_PADDING_PX * 2) * scaleX)),
    screenHeight: Math.max(1, Math.round(TERMINAL_PADDING_PX * 2 + (input.screenHeight - TERMINAL_PADDING_PX * 2) * scaleY)),
    x: TERMINAL_PADDING_PX + (input.x - TERMINAL_PADDING_PX) * scaleX,
    y: TERMINAL_PADDING_PX + (input.y - TERMINAL_PADDING_PX) * scaleY,
  };
}

function setNestedBool(
  layout: TypeLayout,
  view: DataView,
  baseOffset: number,
  structName: string,
  fieldName: string,
  value: boolean,
) {
  const fieldInfo = field(layout, structName, fieldName);
  if (fieldInfo.type !== 'bool') {
    throw new Error(`Expected bool field: ${structName}.${fieldName}`);
  }
  view.setUint8(baseOffset + fieldInfo.offset, value ? 1 : 0);
}

function readTypeLayout(exports: WasmExports): TypeLayout {
  const jsonPtr = exports.ghostty_type_json();
  const bytes = new Uint8Array(exports.memory.buffer, jsonPtr, exports.memory.buffer.byteLength - jsonPtr);
  return JSON.parse(new TextDecoder().decode(bytes).split('\0')[0]) as TypeLayout;
}

function field(layout: TypeLayout, structName: string, fieldName: string) {
  return layout[structName].fields[fieldName];
}

function setField(
  layout: TypeLayout,
  view: DataView,
  structName: string,
  fieldName: string,
  value: number,
) {
  const fieldInfo = field(layout, structName, fieldName);
  switch (fieldInfo.type) {
    case 'u8':
    case 'bool':
      view.setUint8(fieldInfo.offset, value);
      break;
    case 'u16':
      view.setUint16(fieldInfo.offset, value, true);
      break;
    case 'u32':
    case 'enum':
      view.setUint32(fieldInfo.offset, value, true);
      break;
    case 'u64':
      view.setBigUint64(fieldInfo.offset, BigInt(value), true);
      break;
    default:
      throw new Error(`Unsupported field type: ${fieldInfo.type}`);
  }
}
