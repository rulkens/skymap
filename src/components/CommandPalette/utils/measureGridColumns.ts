/**
 * measureGridColumns — the track count of a rendered CSS grid, read from its
 * computed `grid-template-columns` at key-press time so the column count
 * stays CSS's only home (breakpoints included). jsdom doesn't compute grid
 * layout, so it returns `''` there — 1 is the fallback.
 */
export function measureGridColumns(grid: HTMLElement): number {
  const tracks = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean);
  return tracks.length > 0 ? tracks.length : 1;
}
