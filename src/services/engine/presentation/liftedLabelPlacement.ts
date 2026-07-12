/**
 * liftedLabelPlacement — the SINGLE derivation chain for a lifted caption and
 * its leader line, shared by every producer that floats a label above a dot
 * (famous galaxies, the Milky Way "You are here").
 *
 * ### The chain (one calculation, everything else derived)
 *
 *   1. lift      = max(MIN_LABEL_LIFT_PX, LEADER_LIFT_FACTOR × apparent size)
 *                  — floored so a tiny subject's caption still clears it
 *   2. label     = the dot lifted `lift` px straight up on screen
 *                  (`labelLeaderLine` — screen lift, un-projected to world)
 *   3. text bottom = label anchor + the measured ink bbox's `maxY`, scaled by
 *                  the SAME worldEm → px clamp the vertex shader applies —
 *                  the TRUE visual bottom of the glyph stack, descenders and
 *                  alignment shifts included, not a baseline approximation
 *   4. line top  = text bottom − LEADER_LINE_PADDING_PX
 *   5. line      = dot → line top; NOT emitted when the padded top lands at
 *                  or below the dot (no room for a line to mean anything)
 *
 * Deriving the line top FROM the measured text bottom (instead of computing
 * both independently, e.g. "line stops at 75 % of the lift") makes the
 * line-to-text gap a structural invariant: exactly the padding at every lift
 * and zoom. The vanish behaviour falls out of the same subtraction — no
 * separate threshold constant to keep in tune with the gap.
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
  MIN_LABEL_LIFT_PX,
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
  const liftPx = Math.max(MIN_LABEL_LIFT_PX, LEADER_LIFT_FACTOR * input.subjectSizePx);
  const leader = labelLeaderLine({
    anchorWorldPos: input.anchorWorldPos,
    vp: input.vp,
    viewportPx: input.viewportPx,
    liftPx,
  });
  if (leader === null) return null;

  // Reproduce the vertex shader's em sizing exactly (same math as the
  // director's declutter): worldEm projected through the anchor's clip-w to
  // pixels, clamped, then atlas px → screen px. Both the label anchor and the
  // dot share clip-w, so `leader.anchorClipW` is the right divisor for text
  // sized at the LIFTED anchor.
  const pxPerEm = (input.worldEmMpc / leader.anchorClipW) * (input.viewportPx[1] * 0.5);
  const displayEmPx = Math.min(Math.max(pxPerEm, input.minPixelSize), input.maxPixelSize);
  const atlasToScreen = displayEmPx / ATLAS_FONT_SIZE;

  // The text's true bottom sits `maxY · scale` px BELOW the label anchor
  // (atlas +Y and screen +Y agree — see LabelBBox), i.e. this many px above
  // the dot:
  const textBottomAboveDotPx = liftPx - (input.textBbox?.maxY ?? 0) * atlasToScreen;
  const lineTopPx = textBottomAboveDotPx - LEADER_LINE_PADDING_PX;

  // No room below the padded text bottom → caption alone, no line. (The lerp
  // below never divides by zero: liftPx is floored at MIN_LABEL_LIFT_PX.)
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
