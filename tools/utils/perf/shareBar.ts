/**
 * shareBar — render a fraction (0..1) as a left-filled unicode bar of exactly
 * `width` characters, using the eighth-block ramp for sub-cell resolution. It is
 * the inline magnitude channel next to each pass's share-of-section %: a bar is
 * scannable in a way a column of percentages is not.
 *
 * ### Why eighth blocks, and why space-padded
 *
 * Full blocks alone would quantise every share to 1/width, so a 3% pass in a
 * 15-wide bar would render as an empty cell — invisible, when the whole point is
 * to show it is nonzero. The eighth-block ramp (' ▏▎▍▌▋▊▉█') gives 8× finer
 * resolution on the leading partial cell, so small-but-real shares still draw a
 * sliver. The remainder is padded with SPACES, not a track glyph like '░',
 * because a space is exactly one column in every monospace font while box-drawing
 * fill can render double-width — and this bar sits inside an aligned table, so a
 * width surprise would shear the columns to its right.
 *
 * Guard: a NaN or negative fraction (a guarded 0/0 share, say) renders as an
 * all-space bar rather than throwing or drawing garbage.
 */

const RAMP = ' ▏▎▍▌▋▊▉█';

export function shareBar(fraction: number, width: number): string {
  // Clamp into [0,1]; NaN fails both comparisons and falls through to 0.
  const clamped = fraction > 0 ? (fraction < 1 ? fraction : 1) : 0;
  const filled = clamped * width;
  const full = Math.floor(filled);
  // The partial cell is one glyph from the ramp, indexed by the leftover eighths.
  // Rounding to 8 means "so close to a full cell it reads as one" — emit '█',
  // which then counts toward the width like any full block.
  const partialIndex = Math.round((filled - full) * 8);
  const partial = partialIndex > 0 ? RAMP[partialIndex]! : '';
  const bar = '█'.repeat(full) + partial;
  return bar.length >= width ? bar.slice(0, width) : bar.padEnd(width);
}
