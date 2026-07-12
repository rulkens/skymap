/**
 * liftedLabelPlacement — the SINGLE derivation chain for a lifted caption and
 * its leader line, shared by every producer that floats a label above a dot
 * (famous galaxies, the Milky Way "You are here").
 *
 * ### The chain (one calculation, everything else derived)
 *
 *   1. lift      = max(MIN_LABEL_CLEARANCE_PX, LEADER_LIFT_FACTOR × apparent
 *                  size) — floored so a tiny subject's caption still clears it
 *   2. clearance = the lift is raised by the exact deficit whenever the
 *                  measured glyph-ink bottom at that lift would come within
 *                  MIN_LABEL_CLEARANCE_PX of the dot on screen. The guarantee
 *                  holds for the INK, not the anchor — the anchor is an
 *                  alignment artifact: a top-aligned caption hangs its whole
 *                  glyph block below its anchor, so an anchor-only floor lets
 *                  the text swallow the lift, cover the dot, and (via step 5)
 *                  suppress its own leader line. The bbox is anchor-relative,
 *                  so the deficit adds linearly to the lift — no iteration.
 *   3. label     = the dot lifted `lift` px straight up on screen
 *                  (`labelLeaderLine` — screen lift, un-projected to world)
 *   4. text bottom = label anchor + the measured ink bbox's `maxY`, scaled by
 *                  the SAME worldEm → px clamp the vertex shader applies —
 *                  the TRUE visual bottom of the glyph stack, descenders and
 *                  alignment shifts included, not a baseline approximation
 *   5. line top  = text bottom − LEADER_LINE_PADDING_PX
 *   6. line      = dot → line top; NOT emitted when the padded top lands at
 *                  or below the dot (no room for a line to mean anything)
 *
 * Deriving the line top FROM the measured text bottom (instead of computing
 * both independently, e.g. "line stops at 75 % of the lift") makes the
 * line-to-text gap a structural invariant: exactly the padding at every lift
 * and zoom. The vanish behaviour falls out of the same subtraction — no
 * separate threshold constant to keep in tune with the gap. With the
 * clearance guarantee the padded top always clears the dot by
 * `clearance − padding`, so step 6's omission arises only if the constants
 * are ever retuned to padding ≥ clearance — the rule stays derived rather
 * than becoming an assumption about today's numbers.
 *
 * Returns null when the dot is behind the camera (no projection → nothing to
 * place). A null `textBbox` (text laid out to no ink) degrades to a bottom at
 * the label anchor itself.
 *
 * Both leader endpoints share the dot's depth (same clip-w), so placing the
 * line top is a plain world-space lerp along the leader segment — parameter
 * fractions survive projection when the endpoints' w are equal, so
 * `lineTopPx / liftPx` in world space IS `lineTopPx / liftPx` on screen.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { LabelBBox } from '../../../@types/rendering/LabelBBox';
import { labelLeaderLine } from '../../../utils/camera/labelLeaderLine';
import { ATLAS_FONT_SIZE } from '../../../data/fonts';
import {
  LEADER_LIFT_FACTOR,
  LEADER_LINE_PADDING_PX,
  MIN_LABEL_CLEARANCE_PX,
} from './leaderLineStyle';

export function liftedLabelPlacement(input: {
  /** The dot (galaxy / body) position in the layer's world frame. */
  anchorWorldPos: Vec3;
  /** The view-projection the layer draws through (column-major, length 16). */
  vp: Float32Array;
  /** Backing-store viewport size in pixels, `[width, height]`. */
  viewportPx: Vec2;
  /** The subject's apparent size (px) — drives the proportional lift. */
  subjectSizePx: number;
  /** The caption's measured ink bbox (`labelRenderer.measure`), or null. */
  textBbox: LabelBBox | null;
  /** The caption's `worldEmMpc` — the shader's primary size driver. */
  worldEmMpc: number;
  /** The caption's projected-em pixel clamp, as the shader applies it. */
  minPixelSize: number;
  maxPixelSize: number;
}): { labelWorldPos: Vec3; line: { fromWorld: Vec3; toWorld: Vec3 } | null } | null {
  const proposedLiftPx = Math.max(MIN_LABEL_CLEARANCE_PX, LEADER_LIFT_FACTOR * input.subjectSizePx);
  const proposed = labelLeaderLine({
    anchorWorldPos: input.anchorWorldPos,
    vp: input.vp,
    viewportPx: input.viewportPx,
    liftPx: proposedLiftPx,
  });
  if (proposed === null) return null;

  // Reproduce the vertex shader's em sizing exactly (same math as the
  // director's declutter): worldEm projected through the anchor's clip-w to
  // pixels, clamped, then atlas px → screen px. Both the label anchor and the
  // dot share clip-w, so `proposed.anchorClipW` is the right divisor for text
  // sized at the LIFTED anchor — and, being a property of the DOT's depth, it
  // is identical at any lift, so it is safe to derive from the proposed-lift
  // projection even when the lift is raised below.
  const pxPerEm = (input.worldEmMpc / proposed.anchorClipW) * (input.viewportPx[1] * 0.5);
  const displayEmPx = Math.min(Math.max(pxPerEm, input.minPixelSize), input.maxPixelSize);
  const atlasToScreen = displayEmPx / ATLAS_FONT_SIZE;

  // How far the glyph ink extends BELOW the label anchor on screen (atlas +Y
  // and screen +Y agree — see LabelBBox). Positive when the block hangs below
  // the anchor (alignY 'top' hangs the whole text; 'baseline' just the
  // descenders); negative when the ink sits entirely above ('bottom').
  const inkDropPx = (input.textBbox?.maxY ?? 0) * atlasToScreen;

  // The clearance guarantee (chain step 2): raise the lift by the exact
  // deficit if the ink bottom at the proposed lift would come within
  // MIN_LABEL_CLEARANCE_PX of the dot. Re-running `labelLeaderLine` replays
  // the same forward projection of the same dot — it cannot flip to null —
  // and only moves the lifted world point; the guard keeps the type honest.
  const deficitPx = MIN_LABEL_CLEARANCE_PX + inkDropPx - proposedLiftPx;
  const liftPx = deficitPx > 0 ? proposedLiftPx + deficitPx : proposedLiftPx;
  const leader =
    deficitPx > 0
      ? labelLeaderLine({
          anchorWorldPos: input.anchorWorldPos,
          vp: input.vp,
          viewportPx: input.viewportPx,
          liftPx,
        })
      : proposed;
  if (leader === null) return null;

  // The text's true bottom sits `inkDropPx` px BELOW the label anchor, i.e.
  // this many px above the dot (≥ the clearance, by step 2):
  const textBottomAboveDotPx = liftPx - inkDropPx;
  const lineTopPx = textBottomAboveDotPx - LEADER_LINE_PADDING_PX;

  // No room below the padded text bottom → caption alone, no line. (The lerp
  // below never divides by zero: liftPx is floored at MIN_LABEL_CLEARANCE_PX.)
  if (lineTopPx <= 0) {
    return { labelWorldPos: leader.toWorld, line: null };
  }

  const t = lineTopPx / liftPx;
  const [fx, fy, fz] = leader.fromWorld;
  const [tx, ty, tz] = leader.toWorld;
  return {
    labelWorldPos: leader.toWorld,
    line: {
      fromWorld: leader.fromWorld,
      toWorld: [fx + (tx - fx) * t, fy + (ty - fy) * t, fz + (tz - fz) * t],
    },
  };
}
