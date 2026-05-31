import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const wasmPath = resolve(root, 'public/ghostty-vt.wasm');
const bytes = readFileSync(wasmPath);
const wasm = await WebAssembly.instantiate(bytes, {
  env: {
    log: () => undefined,
  },
});

const exports = wasm.instance.exports;
const memory = exports.memory;
const layout = readTypeLayout();
const terminal = createTerminal(80, 24);

writeVt(terminal, 'Hello, Cortex!\r\n\x1b[1;32mGhostty VT works\x1b[0m\r\n');
const text = formatPlain(terminal);
assert.match(text, /Hello, Cortex!/);
assert.match(text, /Ghostty VT works/);
const html = formatHtml(terminal);
assert.match(html, /Ghostty VT works/);
assert.match(html, /(?:color:|--vt-palette-)/);
const renderText = formatRenderState(terminal);
assert.match(renderText, /Hello, Cortex!/);
assert.match(renderText, /Ghostty VT works/);
verifyScrollback();

exports.ghostty_terminal_free(terminal);
console.log('libghostty-vt WASM verification passed');

function readTypeLayout() {
  const ptr = exports.ghostty_type_json();
  const raw = new Uint8Array(memory.buffer, ptr, memory.buffer.byteLength - ptr);
  return JSON.parse(new TextDecoder().decode(raw).split('\0')[0]);
}

function field(structName, fieldName) {
  return layout[structName].fields[fieldName];
}

function setField(view, structName, fieldName, value) {
  const fieldInfo = field(structName, fieldName);
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

function createTerminal(cols, rows) {
  const optsSize = layout.GhosttyTerminalOptions.size;
  const optsPtr = exports.ghostty_wasm_alloc_u8_array(optsSize);
  new Uint8Array(memory.buffer, optsPtr, optsSize).fill(0);
  const optsView = new DataView(memory.buffer, optsPtr, optsSize);
  setField(optsView, 'GhosttyTerminalOptions', 'cols', cols);
  setField(optsView, 'GhosttyTerminalOptions', 'rows', rows);
  setField(optsView, 'GhosttyTerminalOptions', 'max_scrollback', 10000);

  const termPtrPtr = exports.ghostty_wasm_alloc_opaque();
  const result = exports.ghostty_terminal_new(0, termPtrPtr, optsPtr);
  exports.ghostty_wasm_free_u8_array(optsPtr, optsSize);
  assert.equal(result, 0);

  const terminal = new DataView(memory.buffer).getUint32(termPtrPtr, true);
  exports.ghostty_wasm_free_opaque(termPtrPtr);
  return terminal;
}

function writeVt(terminal, text) {
  const vtBytes = new TextEncoder().encode(text);
  const ptr = exports.ghostty_wasm_alloc_u8_array(vtBytes.length);
  new Uint8Array(memory.buffer).set(vtBytes, ptr);
  exports.ghostty_terminal_vt_write(terminal, ptr, vtBytes.length);
  exports.ghostty_wasm_free_u8_array(ptr, vtBytes.length);
}

function formatPlain(terminal) {
  return formatTerminal(terminal, 0);
}

function formatHtml(terminal) {
  return formatTerminal(terminal, 2);
}

function formatTerminal(terminal, emit) {
  const optsSize = layout.GhosttyFormatterTerminalOptions.size;
  const optsPtr = exports.ghostty_wasm_alloc_u8_array(optsSize);
  new Uint8Array(memory.buffer, optsPtr, optsSize).fill(0);
  const optsView = new DataView(memory.buffer, optsPtr, optsSize);
  setField(optsView, 'GhosttyFormatterTerminalOptions', 'size', optsSize);
  setField(optsView, 'GhosttyFormatterTerminalOptions', 'emit', emit);
  setField(optsView, 'GhosttyFormatterTerminalOptions', 'unwrap', 0);
  setField(optsView, 'GhosttyFormatterTerminalOptions', 'trim', 1);

  const extraOffset = field('GhosttyFormatterTerminalOptions', 'extra').offset;
  const extraSize = layout.GhosttyFormatterTerminalExtra.size;
  const extraSizeField = field('GhosttyFormatterTerminalExtra', 'size');
  optsView.setUint32(extraOffset + extraSizeField.offset, extraSize, true);
  setNestedBool(optsView, extraOffset, 'GhosttyFormatterTerminalExtra', 'palette', true);

  const screenOffset = field('GhosttyFormatterTerminalExtra', 'screen').offset;
  const screenSize = layout.GhosttyFormatterScreenExtra.size;
  const screenSizeField = field('GhosttyFormatterScreenExtra', 'size');
  optsView.setUint32(extraOffset + screenOffset + screenSizeField.offset, screenSize, true);
  const screenBaseOffset = extraOffset + screenOffset;
  setNestedBool(optsView, screenBaseOffset, 'GhosttyFormatterScreenExtra', 'cursor', true);
  setNestedBool(optsView, screenBaseOffset, 'GhosttyFormatterScreenExtra', 'style', true);
  setNestedBool(optsView, screenBaseOffset, 'GhosttyFormatterScreenExtra', 'hyperlink', true);

  const fmtPtrPtr = exports.ghostty_wasm_alloc_opaque();
  const fmtResult = exports.ghostty_formatter_terminal_new(0, fmtPtrPtr, terminal, optsPtr);
  exports.ghostty_wasm_free_u8_array(optsPtr, optsSize);
  assert.equal(fmtResult, 0);

  const formatter = new DataView(memory.buffer).getUint32(fmtPtrPtr, true);
  exports.ghostty_wasm_free_opaque(fmtPtrPtr);

  const outPtrPtr = exports.ghostty_wasm_alloc_opaque();
  const outLenPtr = exports.ghostty_wasm_alloc_usize();
  const formatResult = exports.ghostty_formatter_format_alloc(formatter, 0, outPtrPtr, outLenPtr);
  assert.equal(formatResult, 0);

  const view = new DataView(memory.buffer);
  const outPtr = view.getUint32(outPtrPtr, true);
  const outLen = view.getUint32(outLenPtr, true);
  const text = new TextDecoder().decode(new Uint8Array(memory.buffer, outPtr, outLen));

  exports.ghostty_free(0, outPtr, outLen);
  exports.ghostty_wasm_free_opaque(outPtrPtr);
  exports.ghostty_wasm_free_usize(outLenPtr);
  exports.ghostty_formatter_free(formatter);

  return text;
}

function formatRenderState(terminal) {
  const renderStatePtrPtr = exports.ghostty_wasm_alloc_opaque();
  assert.equal(exports.ghostty_render_state_new(0, renderStatePtrPtr), 0);
  const renderState = new DataView(memory.buffer).getUint32(renderStatePtrPtr, true);
  exports.ghostty_wasm_free_opaque(renderStatePtrPtr);

  assert.equal(exports.ghostty_render_state_update(renderState, terminal), 0);

  const iteratorPtrPtr = exports.ghostty_wasm_alloc_opaque();
  assert.equal(exports.ghostty_render_state_row_iterator_new(0, iteratorPtrPtr), 0);
  assert.equal(exports.ghostty_render_state_get(renderState, 4, iteratorPtrPtr), 0);
  const iterator = new DataView(memory.buffer).getUint32(iteratorPtrPtr, true);
  exports.ghostty_wasm_free_opaque(iteratorPtrPtr);

  const rows = [];
  while (exports.ghostty_render_state_row_iterator_next(iterator)) {
    rows.push(formatRenderStateRow(iterator));
  }

  exports.ghostty_render_state_row_iterator_free(iterator);
  exports.ghostty_render_state_free(renderState);
  return rows.join('\n');
}

function formatRenderStateRow(iterator) {
  const cellsPtrPtr = exports.ghostty_wasm_alloc_opaque();
  assert.equal(exports.ghostty_render_state_row_cells_new(0, cellsPtrPtr), 0);
  assert.equal(exports.ghostty_render_state_row_get(iterator, 3, cellsPtrPtr), 0);
  const cells = new DataView(memory.buffer).getUint32(cellsPtrPtr, true);
  exports.ghostty_wasm_free_opaque(cellsPtrPtr);

  let text = '';
  while (exports.ghostty_render_state_row_cells_next(cells)) {
    text += renderStateCellText(cells);
  }

  exports.ghostty_render_state_row_cells_free(cells);
  return text;
}

function renderStateCellText(cells) {
  const bufferSize = layout.GhosttyBuffer.size;
  const queryPtr = exports.ghostty_wasm_alloc_u8_array(bufferSize);
  new Uint8Array(memory.buffer, queryPtr, bufferSize).fill(0);
  exports.ghostty_render_state_row_cells_get(cells, 9, queryPtr);
  const requiredLen = new DataView(memory.buffer, queryPtr, bufferSize).getUint32(field('GhosttyBuffer', 'len').offset, true);
  exports.ghostty_wasm_free_u8_array(queryPtr, bufferSize);
  if (requiredLen === 0) return '';

  const textPtr = exports.ghostty_wasm_alloc_u8_array(requiredLen);
  const bufferPtr = exports.ghostty_wasm_alloc_u8_array(bufferSize);
  new Uint8Array(memory.buffer, bufferPtr, bufferSize).fill(0);
  const bufferView = new DataView(memory.buffer, bufferPtr, bufferSize);
  bufferView.setUint32(field('GhosttyBuffer', 'ptr').offset, textPtr, true);
  bufferView.setUint32(field('GhosttyBuffer', 'cap').offset, requiredLen, true);
  assert.equal(exports.ghostty_render_state_row_cells_get(cells, 9, bufferPtr), 0);
  const outLen = bufferView.getUint32(field('GhosttyBuffer', 'len').offset, true);
  const text = new TextDecoder().decode(new Uint8Array(memory.buffer, textPtr, outLen));
  exports.ghostty_wasm_free_u8_array(textPtr, requiredLen);
  exports.ghostty_wasm_free_u8_array(bufferPtr, bufferSize);
  return text;
}

function verifyScrollback() {
  const scrollbackTerminal = createTerminal(40, 8);
  writeVt(scrollbackTerminal, 'one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n');

  const before = terminalScrollbar(scrollbackTerminal);
  assert.ok(before.total > before.len);

  scrollViewport(scrollbackTerminal, -2);
  const after = terminalScrollbar(scrollbackTerminal);
  assert.ok(after.offset < before.offset);

  exports.ghostty_terminal_resize(scrollbackTerminal, 40, 4, 9, 18);
  exports.ghostty_terminal_resize(scrollbackTerminal, 24, 4, 9, 18);
  scrollViewportTop(scrollbackTerminal);
  const resizedText = formatRenderState(scrollbackTerminal);
  assert.match(resizedText, /one|two|three|four|five|six/);

  exports.ghostty_terminal_free(scrollbackTerminal);
}

function terminalScrollbar(terminal) {
  const scrollbarSize = layout.GhosttyTerminalScrollbar.size;
  const ptr = exports.ghostty_wasm_alloc_u8_array(scrollbarSize);
  new Uint8Array(memory.buffer, ptr, scrollbarSize).fill(0);
  assert.equal(exports.ghostty_terminal_get(terminal, 9, ptr), 0);
  const view = new DataView(memory.buffer, ptr, scrollbarSize);
  const scrollbar = {
    total: Number(view.getBigUint64(field('GhosttyTerminalScrollbar', 'total').offset, true)),
    offset: Number(view.getBigUint64(field('GhosttyTerminalScrollbar', 'offset').offset, true)),
    len: Number(view.getBigUint64(field('GhosttyTerminalScrollbar', 'len').offset, true)),
  };
  exports.ghostty_wasm_free_u8_array(ptr, scrollbarSize);
  return scrollbar;
}

function scrollViewport(terminal, delta) {
  const behaviorSize = layout.GhosttyTerminalScrollViewport.size;
  const ptr = exports.ghostty_wasm_alloc_u8_array(behaviorSize);
  new Uint8Array(memory.buffer, ptr, behaviorSize).fill(0);
  const view = new DataView(memory.buffer, ptr, behaviorSize);
  view.setUint32(field('GhosttyTerminalScrollViewport', 'tag').offset, 2, true);
  view.setBigInt64(field('GhosttyTerminalScrollViewport', 'value').offset, BigInt(delta), true);
  exports.ghostty_terminal_scroll_viewport(terminal, ptr);
  exports.ghostty_wasm_free_u8_array(ptr, behaviorSize);
}

function scrollViewportTop(terminal) {
  const behaviorSize = layout.GhosttyTerminalScrollViewport.size;
  const ptr = exports.ghostty_wasm_alloc_u8_array(behaviorSize);
  new Uint8Array(memory.buffer, ptr, behaviorSize).fill(0);
  new DataView(memory.buffer, ptr, behaviorSize).setUint32(field('GhosttyTerminalScrollViewport', 'tag').offset, 0, true);
  exports.ghostty_terminal_scroll_viewport(terminal, ptr);
  exports.ghostty_wasm_free_u8_array(ptr, behaviorSize);
}

function setNestedBool(view, baseOffset, structName, fieldName, value) {
  const fieldInfo = field(structName, fieldName);
  assert.equal(fieldInfo.type, 'bool');
  view.setUint8(baseOffset + fieldInfo.offset, value ? 1 : 0);
}
