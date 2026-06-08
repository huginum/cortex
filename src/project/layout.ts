// The terminal layout for a project is a binary tree. A leaf is a pane with a
// working directory relative to the repository root ('.' means the root). A
// split arranges two children horizontally or vertically with a size ratio.
// An empty project has a `null` layout (no panes).

export type Orientation = 'horizontal' | 'vertical';

export type PaneNode = {
  type: 'pane';
  id: string;
  /** Working directory relative to the repository root. '.' is the root. */
  cwd: string;
};

export type SplitNode = {
  type: 'split';
  id: string;
  orientation: Orientation;
  /** Fraction (0..1) of space given to `first`. */
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
};

export type LayoutNode = PaneNode | SplitNode;

/** A project's layout; `null` means an empty project with no panes. */
export type Layout = LayoutNode | null;

let nodeCounter = 0;

export function newPaneId(): string {
  nodeCounter += 1;
  return `pane-${nodeCounter}`;
}

export function newSplitId(): string {
  nodeCounter += 1;
  return `split-${nodeCounter}`;
}

export function createPane(cwd = '.'): PaneNode {
  return { type: 'pane', id: newPaneId(), cwd };
}

/** All panes in tree order. */
export function collectPanes(layout: Layout): PaneNode[] {
  if (!layout) return [];
  if (layout.type === 'pane') return [layout];
  return [...collectPanes(layout.first), ...collectPanes(layout.second)];
}

export function firstPaneId(layout: Layout): string | undefined {
  return collectPanes(layout)[0]?.id;
}

/** Replace the pane `targetId` with a split containing it and a new pane. */
export function splitPane(
  layout: Layout,
  targetId: string,
  orientation: Orientation,
  newPane: PaneNode,
): Layout {
  if (!layout) return newPane;
  return replacePane(layout, targetId, (pane) => ({
    type: 'split',
    id: newSplitId(),
    orientation,
    ratio: 0.5,
    first: pane,
    second: newPane,
  }));
}

/** Set the size ratio of the split identified by `splitId`. */
export function setRatio(node: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (node.type === 'pane') return node;
  if (node.id === splitId) return { ...node, ratio };
  return {
    ...node,
    first: setRatio(node.first, splitId, ratio),
    second: setRatio(node.second, splitId, ratio),
  };
}

/**
 * Replace the leaf with `targetId` using `replacer`, without recursing into the
 * replacement — so a leaf can be swapped for a split that still references it.
 */
function replacePane(
  node: LayoutNode,
  targetId: string,
  replacer: (pane: PaneNode) => LayoutNode,
): LayoutNode {
  if (node.type === 'pane') {
    return node.id === targetId ? replacer(node) : node;
  }
  return {
    ...node,
    first: replacePane(node.first, targetId, replacer),
    second: replacePane(node.second, targetId, replacer),
  };
}

/**
 * Remove the pane `targetId`. When it has a sibling, the parent split collapses
 * to that sibling. Returns `null` when the last pane is removed.
 */
export function closePane(layout: Layout, targetId: string): Layout {
  if (!layout) return null;
  if (layout.type === 'pane') {
    return layout.id === targetId ? null : layout;
  }

  if (layout.first.type === 'pane' && layout.first.id === targetId) {
    return layout.second;
  }
  if (layout.second.type === 'pane' && layout.second.id === targetId) {
    return layout.first;
  }

  return {
    ...layout,
    first: closePane(layout.first, targetId) ?? layout.first,
    second: closePane(layout.second, targetId) ?? layout.second,
  };
}

/** A pane's position within the canvas, expressed in percentages. */
export type PaneRect = { left: number; top: number; width: number; height: number };

export type PlacedPane = { pane: PaneNode; rect: PaneRect };

/** A draggable boundary between the two children of a split. */
export type PlacedDivider = {
  /** The split node's id, for `setRatio`. */
  id: string;
  orientation: Orientation;
  /** Position of the boundary line (zero-thickness in the split axis). */
  rect: PaneRect;
  /** The full region the split occupies, for converting a pointer to a ratio. */
  region: PaneRect;
};

export type Placement = { panes: PlacedPane[]; dividers: PlacedDivider[] };

const FULL_RECT: PaneRect = { left: 0, top: 0, width: 100, height: 100 };

/**
 * Flatten the layout tree into absolutely-positioned pane rectangles plus the
 * draggable dividers between splits. Rendering panes from this flat list (keyed
 * by pane id) keeps each `TerminalPane` mounted across splits, closes, and
 * resizes, so live shells survive layout changes.
 */
export function placeLayout(layout: Layout, rect: PaneRect = FULL_RECT): Placement {
  if (!layout) return { panes: [], dividers: [] };
  if (layout.type === 'pane') return { panes: [{ pane: layout, rect }], dividers: [] };

  const { id, orientation, ratio, first, second } = layout;
  const horizontal = orientation === 'horizontal';
  const firstSize = (horizontal ? rect.width : rect.height) * ratio;

  const firstRect = horizontal ? { ...rect, width: firstSize } : { ...rect, height: firstSize };
  const secondRect = horizontal
    ? { ...rect, left: rect.left + firstSize, width: rect.width - firstSize }
    : { ...rect, top: rect.top + firstSize, height: rect.height - firstSize };

  const a = placeLayout(first, firstRect);
  const b = placeLayout(second, secondRect);

  const divider: PlacedDivider = {
    id,
    orientation,
    region: rect,
    rect: horizontal
      ? { left: rect.left + firstSize, top: rect.top, width: 0, height: rect.height }
      : { left: rect.left, top: rect.top + firstSize, width: rect.width, height: 0 },
  };

  return { panes: [...a.panes, ...b.panes], dividers: [...a.dividers, ...b.dividers, divider] };
}

/**
 * Validate that an arbitrary parsed value is a structurally sound layout tree.
 * The document is repo-controlled and may be committed and shared, so a file
 * that is valid JSON but not a valid layout (e.g. a split missing its children)
 * must be rejected before `hydrate` descends into it. Orientation and ratio are
 * left to `hydrate` to normalize, so only structure is checked here.
 */
export function isLayoutNode(value: unknown): value is LayoutNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  if (node.type === 'pane') {
    return node.cwd === undefined || typeof node.cwd === 'string';
  }
  if (node.type === 'split') {
    return isLayoutNode(node.first) && isLayoutNode(node.second);
  }
  return false;
}

/**
 * Rebuild a persisted layout with fresh pane ids. The persisted document only
 * carries pane working directories and split structure — never live state — so
 * restoration spawns brand-new shells.
 */
export function hydrate(node: LayoutNode): LayoutNode {
  if (node.type === 'pane') {
    return { type: 'pane', id: newPaneId(), cwd: node.cwd || '.' };
  }
  return {
    type: 'split',
    id: newSplitId(),
    orientation: node.orientation === 'vertical' ? 'vertical' : 'horizontal',
    ratio: typeof node.ratio === 'number' && node.ratio > 0 && node.ratio < 1 ? node.ratio : 0.5,
    first: hydrate(node.first),
    second: hydrate(node.second),
  };
}
