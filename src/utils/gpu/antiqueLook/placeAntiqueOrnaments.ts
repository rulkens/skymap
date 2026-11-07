/**
 * placeAntiqueOrnaments — this frame's ornament instances, in device px.
 *
 * Sky-anchored rows project through the view and turn with the sky (their up to
 * celestial north on screen); sheet rows sit at a corner. Each fades in only
 * while it is a sensible size on screen and while the camera is in its regime
 * (inside the Galaxy for the star chart, out among the galaxies for the Zone of
 * Avoidance), so nothing pops and nothing balloons past the plate.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { AntiqueOrnament } from '../../../@types/rendering/AntiqueOrnament';
import type { AntiqueOrnamentAtlas } from '../../../@types/rendering/AntiqueOrnamentAtlas';
import type { AntiqueOrnamentInstance } from '../../../@types/rendering/AntiqueOrnamentInstance';
import type { Size } from '../../../@types/rendering/Size';
import type { Vec3 } from '../../../@types/math/Vec3';
import { GAL_TO_EQ_MATRIX } from '../../../data/superGalacticTransform';
import { ANTIQUE_REGIME_MPC } from '../../../data/rendering/antiqueLook';
import { raDecDistToCartesian } from '../../math/raDecDistToCartesian';
import { rotateVec3ByTightMat3 } from '../../math/rotateVec3ByTightMat3';
import { projectDirToPx } from '../../camera/projection/projectDirToPx';
import { rayThroughPx } from '../../camera/projection/rayThroughPx';
import { smoothstep } from '../../math/smoothstep';

const DEG = Math.PI / 180;
/** A sky ornament shows between these on-screen widths, as a share of the canvas height. */
const SKY_FADE_IN = [0.12, 0.22] as const;
const SKY_FADE_OUT = [0.9, 1.4] as const;

export function placeAntiqueOrnaments(input: {
  readonly ornaments: readonly AntiqueOrnament[];
  readonly atlas: AntiqueOrnamentAtlas;
  readonly basis: ViewBasis;
  readonly frustum: ViewFrustum;
  readonly size: Size;
  readonly unitPx: number;
  readonly camDistMpc: number;
}): readonly AntiqueOrnamentInstance[] {
  const { atlas, basis, frustum, size, unitPx } = input;
  const cosmos = smoothstep(ANTIQUE_REGIME_MPC[0], ANTIQUE_REGIME_MPC[1], input.camDistMpc);
  const pxPerTan = size.height / (frustum.tanUp - frustum.tanDown);
  const placed: AntiqueOrnamentInstance[] = [];

  for (const row of input.ornaments) {
    const rect = atlas.sprites[row.sprite];
    if (rect === undefined) continue;
    const regime = row.regime === 'always' ? 1 : row.regime === 'cosmos' ? cosmos : 1 - cosmos;
    if (regime <= 0) continue;
    const aspect = rect.h / rect.w;
    const uv = [
      rect.x / atlas.width,
      rect.y / atlas.height,
      (rect.x + rect.w) / atlas.width,
      (rect.y + rect.h) / atlas.height,
    ] as const;
    const anchor = row.anchor;

    let centre: [number, number];
    let widthPx: number;
    let opacity = row.opacity * regime;
    let dir: Vec3;
    if (anchor.kind === 'sky') {
      const raw = raDecDistToCartesian(anchor.lonDeg, anchor.latDeg, 1);
      dir =
        anchor.frame === 'galactic' ? rotateVec3ByTightMat3(GAL_TO_EQ_MATRIX, raw, [0, 0, 0]) : raw;
      const at = projectDirToPx(dir, basis, frustum, size);
      if (at === null) continue;
      centre = [at.x, at.y];
      widthPx = (Math.tan(anchor.sizeDeg * DEG * 0.5) * 2 * pxPerTan) / at.z;
      const share = widthPx / size.height;
      opacity *=
        smoothstep(SKY_FADE_IN[0], SKY_FADE_IN[1], share) *
        (1 - smoothstep(SKY_FADE_OUT[0], SKY_FADE_OUT[1], share));
    } else {
      const [ix, iy] = anchor.insetUnits;
      const left = anchor.corner === 'topLeft' || anchor.corner === 'bottomLeft';
      const top = anchor.corner === 'topLeft' || anchor.corner === 'topRight';
      centre = [
        left ? ix * unitPx : size.width - ix * unitPx,
        top ? iy * unitPx : size.height - iy * unitPx,
      ];
      widthPx = anchor.sizeUnits * unitPx;
      dir = rayThroughPx(centre, basis, frustum, size);
    }
    const half: [number, number] = [widthPx * 0.5, widthPx * 0.5 * aspect];
    // A sky figure mostly off the plate reads as a cropped stray claw: fade it
    // out unless at least about half of it is on screen.
    if (anchor.kind === 'sky') opacity *= smoothstep(0.35, 0.6, onScreenShare(centre, half, size));
    if (opacity <= 0.003 || offScreen(centre, half, size)) continue;
    // A negative half-width flips the sprite in the shader (local x runs backwards).
    if (row.mirrored) half[0] = -half[0];
    const north = row.facesNorth ? screenNorthAngle(dir, centre, basis, frustum, size) : 0;
    placed.push({
      centrePx: centre,
      halfPx: half,
      rotation: north + row.rotationDeg * DEG,
      opacity,
      clearsBeneath: row.clearsBeneath,
      pigment: row.pigment,
      rect: [uv[0], uv[1], uv[2], uv[3]],
    });
  }
  return placed;
}

/** The screen angle (counter-clockwise from up) of celestial north at `dir`. */
function screenNorthAngle(
  dir: Readonly<Vec3>,
  at: readonly [number, number],
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
): number {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  const d: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
  // A small step toward the pole along the meridian, projected.
  const step = 0.01;
  const ahead = projectDirToPx(
    [d[0] - d[0] * d[2] * step, d[1] - d[1] * d[2] * step, d[2] + (1 - d[2] * d[2]) * step],
    basis,
    frustum,
    size,
  );
  if (ahead === null) return 0;
  return Math.atan2(-(ahead.x - at[0]), -(ahead.y - at[1]));
}

function onScreenShare(
  c: readonly [number, number],
  half: readonly [number, number],
  size: Size,
): number {
  const w = Math.max(0, Math.min(size.width, c[0] + half[0]) - Math.max(0, c[0] - half[0]));
  const h = Math.max(0, Math.min(size.height, c[1] + half[1]) - Math.max(0, c[1] - half[1]));
  return (w * h) / (4 * half[0] * half[1]);
}

function offScreen(
  c: readonly [number, number],
  half: readonly [number, number],
  size: Size,
): boolean {
  const r = Math.hypot(half[0], half[1]);
  return c[0] + r < 0 || c[1] + r < 0 || c[0] - r > size.width || c[1] - r > size.height;
}
