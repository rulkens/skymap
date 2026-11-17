// The mark's palette as hex, because a favicon file cannot read CSS variables. Each is a token's value
// (src/styles/tokens.css) without its alpha; keep them in step.
export const MARK_COLOURS = {
  ground: '#000000', // --color-bg
  panel: '#080c1c', // --surface-panel
  fg: '#e8eeff', // --color-fg
  fgTertiary: '#c8dcff', // --color-fg-tertiary
  accent: '#a8d0ff', // --color-accent
} as const;

// --site-line: the foreground at this opacity, the tile's hairline edge.
export const MARK_LINE_OPACITY = 0.22;
