/**
 * fitAntiqueCartouche — where the title cartouche goes this frame, and how big.
 * It shrinks to fit the canvas (a phone's narrow plate takes it under half its
 * width), then keeps its authored corner, shrinking there before it moves to the
 * next free corner (top left, top right, bottom left, bottom right): a reader
 * finds the title where the last plate had it. A shrunk cartouche closes in on
 * the neatline as an engraver would set a small one. Free means clear of the open
 * panels (`covers`) and of the subject's discs by a gap. With no place clear of
 * the subject it covers the least of it; with none clear of the panels, it
 * shrinks into its own corner, under a panel rather than over the subject.
 */

import type { AntiqueSheetAnchor } from '../../../@types/rendering/AntiqueSheetAnchor';
import type { ScreenDiscPx } from '../../../@types/rendering/ScreenDiscPx';
import type { ScreenRectPx } from '../../../@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../../@types/math/Vec2';
import { ANTIQUE_LADDER_UNITS } from '../../../data/rendering/antiqueLook';
import { rectDiscOverlapArea } from '../../render/rectDiscOverlapArea';
import { sheetAnchorCentre } from '../../render/sheetAnchorCentre';

const CORNERS: readonly AntiqueSheetAnchor['corner'][] = [
  'topLeft',
  'topRight',
  'bottomLeft',
  'bottomRight',
];
const SCALES = [1, 0.9, 0.8, 0.72, 0.65, 0.58, 0.5] as const;
/** Room kept between the cartouche and a panel, and the subject's limb (a band's width), print units. */
const GAP_UNITS = 14;
const SUBJECT_GAP_UNITS = 7;
/** The cartouche's widest share of the canvas width, and tallest of its height. */
const MAX_WIDTH_SHARE = 0.4;
const MAX_HEIGHT_SHARE = 0.46;
/** Subject a free place may still cover, as a share of the cartouche's full box (a ring's faint edge). */
const SUBJECT_SLACK = 0.01;
/** What shrinking a step costs against covering the subject, per unit of scale lost. */
const SHRINK_PRICE = 0.3;

export function fitAntiqueCartouche(input: {
  readonly anchor: AntiqueSheetAnchor;
  /** The sprite's height over its width. */
  readonly aspect: number;
  readonly size: Readonly<Vec2>;
  readonly unitPx: number;
  /** The open UI panels, device px. */
  readonly covers: readonly ScreenRectPx[];
  /** The plate's subject on screen, device px. */
  readonly subjects: readonly ScreenDiscPx[];
}): AntiqueSheetAnchor {
  const { anchor, aspect, unitPx, covers } = input;
  const [width, height] = input.size;
  const fullPx = anchor.sizeUnits * unitPx;
  const fit = Math.min(
    1,
    (MAX_WIDTH_SHARE * width) / fullPx,
    (MAX_HEIGHT_SHARE * height) / (fullPx * aspect),
  );
  const fullArea = (fullPx * fit) ** 2 * aspect;
  const gap = GAP_UNITS * unitPx;
  // The authored margins at full size, closing in on the neatline's band as it shrinks.
  const placed = (corner: AntiqueSheetAnchor['corner'], share: number): AntiqueSheetAnchor => {
    const sizeUnits = anchor.sizeUnits * share;
    const margin = (authored: number) =>
      ANTIQUE_LADDER_UNITS + (authored - ANTIQUE_LADDER_UNITS) * share;
    const half: Vec2 = [anchor.sizeUnits / 2, (anchor.sizeUnits * aspect) / 2];
    return {
      corner,
      sizeUnits,
      insetUnits: [
        margin(anchor.insetUnits[0] - half[0]) + half[0] * share,
        margin(anchor.insetUnits[1] - half[1]) + half[1] * share,
      ],
    };
  };
  // A disc holding every canvas corner is the ground the plate is drawn on, not a subject.
  const subjects = input.subjects
    .filter(
      (d) =>
        ![0, width].every((x) =>
          [0, height].every((y) => Math.hypot(x - d.centre[0], y - d.centre[1]) < d.radius),
        ),
    )
    .map((d) => ({ centre: d.centre, radius: d.radius + SUBJECT_GAP_UNITS * unitPx }));
  const order = [anchor.corner, ...CORNERS.filter((c) => c !== anchor.corner)];
  let best: { anchor: AntiqueSheetAnchor; score: number } | null = null;
  for (const corner of order) {
    for (const scale of SCALES) {
      const candidate = placed(corner, fit * scale);
      const { sizeUnits } = candidate;
      const [cx, cy] = sheetAnchorCentre(candidate, width, height, unitPx);
      const hw = (sizeUnits / 2) * unitPx;
      const hh = hw * aspect;
      if (
        covers.some(
          (c) =>
            cx - hw - gap < c.x1 &&
            cx + hw + gap > c.x0 &&
            cy - hh - gap < c.y1 &&
            cy + hh + gap > c.y0,
        )
      )
        continue;
      const box = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
      const covered = subjects.reduce((sum, d) => sum + rectDiscOverlapArea(box, d), 0) / fullArea;
      if (covered <= SUBJECT_SLACK)
        return fit === 1 && scale === 1 && corner === anchor.corner ? anchor : candidate;
      const score = covered + SHRINK_PRICE * (1 - scale);
      if (best === null || score < best.score) best = { anchor: candidate, score };
    }
  }
  return best?.anchor ?? placed(anchor.corner, fit * SCALES[SCALES.length - 1]!);
}
