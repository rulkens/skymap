/**
 * fitAntiqueTitle — sets a cartouche title as large as it fits an elliptical
 * interior of half-axes `rx`, `ry` (px): of every combination of its groups'
 * breaks, the one whose block grows largest. A line too wide for the chord at
 * its height is condensed to its `minSqueeze` before the block shrinks, as
 * engravers cut it. Lines are centred on the interior; `top` is each ink box's
 * top edge relative to the centre. `measure` gives a line's ink box at a 1 px em.
 */

import type { AntiquePlacedTitleLine } from '../../../@types/rendering/AntiquePlacedTitleLine';
import type { AntiqueTitleGroup } from '../../../@types/rendering/AntiqueTitleGroup';
import type { AntiqueTitleLine } from '../../../@types/rendering/AntiqueTitleLine';
import type { AntiqueTitleLineMetrics } from '../../../@types/rendering/AntiqueTitleLineMetrics';

/** Share of the interior's height the block may fill, and its leading in first-line caps. */
const HEIGHT_FILL = 0.7;
const LEADING = 0.5;
/** Share of the interior's chord a line may span: keeps it inside the rule. */
const CHORD_FILL = 0.92;

export function fitAntiqueTitle(
  groups: readonly AntiqueTitleGroup[],
  measure: (line: AntiqueTitleLine) => AntiqueTitleLineMetrics,
  rx: number,
  ry: number,
): AntiquePlacedTitleLine[] {
  const layouts = groups.reduce<AntiqueTitleLine[][]>(
    (heads, { style, breaks }) =>
      heads.flatMap((head) =>
        breaks.map((texts) => [...head, ...texts.map((text) => ({ ...style, text }))]),
      ),
    [[]],
  );
  // Laid out at first-line cap height `c1` px, or undefined when it will not fit.
  const lay = (layout: readonly AntiqueTitleLine[], c1: number) => {
    const rows = layout.map((line) => {
      const m = measure(line);
      const em = (line.cap * c1) / m.cap;
      return { line, em, width: m.width * em, height: m.height * em };
    });
    const total = rows.reduce((sum, r) => sum + r.height, 0) + LEADING * c1 * (rows.length - 1);
    if (total > HEIGHT_FILL * 2 * ry) return undefined;
    let top = -total / 2;
    const placed: AntiquePlacedTitleLine[] = [];
    for (const r of rows) {
      const far = Math.max(Math.abs(top), Math.abs(top + r.height)) / ry;
      const chord = 2 * rx * Math.sqrt(Math.max(0, 1 - far * far)) * CHORD_FILL;
      const squeeze = Math.min(1, chord / r.width);
      if (squeeze < r.line.minSqueeze) return undefined;
      placed.push({ line: r.line, em: r.em, squeeze, top });
      top += r.height + LEADING * c1;
    }
    return placed;
  };
  let best: { c1: number; lines: AntiquePlacedTitleLine[] } | undefined;
  for (const layout of layouts) {
    let lo = 0;
    let hi = ry;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (lay(layout, mid)) lo = mid;
      else hi = mid;
    }
    const lines = lay(layout, lo);
    if (lines && (!best || lo > best.c1)) best = { c1: lo, lines };
  }
  return best?.lines ?? [];
}
