import { invoke } from '@tauri-apps/api/core';
import type React from 'react';

export type TerminalSettings = {
  fontFamily?: string;
  fontSize?: number;
  adjustCellHeight?: number;
};

export const DEFAULT_TERMINAL_FONT_SIZE = 13;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 15;

export async function loadTerminalSettings(): Promise<TerminalSettings> {
  try {
    return await invoke<TerminalSettings>('get_terminal_settings');
  } catch {
    return {};
  }
}

export function terminalStyle(settings: TerminalSettings): React.CSSProperties {
  const fontSize = settings.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
  const lineHeight = Math.max(1, Math.round(fontSize * 1.15 + (settings.adjustCellHeight ?? 0)));

  return {
    '--terminal-font-family': fontFamilyStack(settings.fontFamily),
    '--terminal-font-size': `${fontSize}px`,
    '--terminal-line-height': `${lineHeight}px`,
  } as React.CSSProperties;
}

function fontFamilyStack(fontFamily?: string) {
  const families = splitFontFamilies(fontFamily ?? '');
  const stack = new Set<string>();

  for (const family of families) {
    stack.add(quoteFontFamily(family));
    for (const fallback of nerdFontFallbacks(family)) {
      stack.add(quoteFontFamily(fallback));
    }
  }

  stack.add('ui-monospace');
  stack.add('SFMono-Regular');
  stack.add('Menlo');
  stack.add('Monaco');
  stack.add('Consolas');
  stack.add('monospace');

  return Array.from(stack).join(', ');
}

function splitFontFamilies(value: string) {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function nerdFontFallbacks(fontFamily: string) {
  const fallbacks: string[] = [];
  if (fontFamily.includes('Nerd Font')) {
    fallbacks.push(fontFamily.replace(/\s+Mono$/, ''));
    fallbacks.push(fontFamily.replace(/\s+Nerd Font(?:\s+Mono)?$/, ' Nerd Font Mono'));
    fallbacks.push(fontFamily.replace(/\s+Nerd Font(?:\s+Mono)?$/, ' Nerd Font'));
    fallbacks.push('Symbols Nerd Font Mono');
    fallbacks.push('Symbols Nerd Font');
  }
  return fallbacks;
}

function quoteFontFamily(fontFamily: string) {
  if (/^(ui-monospace|monospace|serif|sans-serif|cursive|fantasy|system-ui)$/.test(fontFamily)) return fontFamily;
  return `"${fontFamily.replaceAll('"', '\\"')}"`;
}
