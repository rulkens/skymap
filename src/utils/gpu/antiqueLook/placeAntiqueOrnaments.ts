/**
 * placeAntiqueOrnaments — this frame's ornament instances, in device px.
 *
 * Sky-anchored rows project through the view and turn with the sky (their up to
 * celestial north on screen); sheet rows sit at a corner. Each fades in only
 * while it is a sensible size on screen and while the camera is in its regime
 * (near the Sun for a constellation, out among the galaxies for the Zone of
 * Avoidance), so nothing pops and nothing balloons past the plate.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { AntiqueOrnament } from '../../../@types/rendering/AntiqueOrnament';
import type { AntiqueOrnamentAtlas } from '../../../@types/rendering/AntiqueOrnamentAtlas';
import type { AntiqueOrnamentInstance } from '../../../@types/rendering/AntiqueOrnamentInstance';
import type { Size } from '../../../@types/rendering/Size';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ScreenRectPx } from '../../../@types/rendering/ScreenRectPx';
import { GAL_TO_EQ_MATRIX } from '../../../data/superGalacticTransform';
import {
  ANTIQUE_FIGURE_VANTAGE_MPC,
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_REGIME_MPC,
} from '../../../data/rendering/antiqueLook';
import { raDecDistToCartesian } from '../../math/raDecDistToCartesian';
import { rotateVec3ByTightMat3 } from '../../math/rotateVec3ByTightMat3';
import { projectDirToPx } from '../../camera/projection/projectDirToPx';
import { overlapShare } from '../../render/overlapShare';
import { sheetAnchorCentre } from '../../render/sheetAnchorCentre';
import { rayThroughPx } from '../../camera/projection/rayThroughPx';
import { smoothstep } from '../../math/smoothstep';
import { screenNorthAngle } from '../../camera/projection/screenNorthAngle';
import { onScreenShare } from '../../render/onScreenShare';
import { offScreen } from '../../render/offScreen';
import { antiqueSheetAnchor } from './antiqueSheetAnchor';

const DEG = Math.PI / 180;

/** A sky ornament shows between these on-screen widths, as a share of the canvas height. */
const SKY_FADE_IN = [0.12, 0.13] as const;
const SKY_FADE_OUT = [0.9, 1.4] as const;
// Half the subject's box at the plate centre, as a share of each canvas side.
const SUBJECT_HALF_SHARE = 0.12;

export function placeAntiqueOrnaments(input: {
  readonly ornaments: readonly AntiqueOrnament[];
  readonly atlas: AntiqueOrnamentAtlas;
  readonly basis: ViewBasis;
  readonly frustum: ViewFrustum;
  readonly size: Size;
  readonly unitPx: number;
  /** The eye in the world frame, Mpc from the Sun. */
  readonly camPosMpc: Readonly<Vec3>;
  /** Tab's hidden-UI mode: sheet-anchored title chrome (the cartouche) goes, the map's figures stay. */
  readonly chromeHidden: boolean;
  /** The plate's title (`antiquePlateTitle`): its block on the lettering sheet, normalised, and strength. */
  /** The open UI panels, device px: a clearing sheet ornament (the cartouche) moves off them. */
  readonly covers: readonly ScreenRectPx[];
  readonly title: {
    readonly rect: readonly [number, number, number, number];
    readonly weight: number;
  } | null;
}): readonly AntiqueOrnamentInstance[] {
  const { atlas, basis, frustum, size, unitPx } = input;
  const camDistMpc = Math.hypot(input.camPosMpc[0], input.camPosMpc[1], input.camPosMpc[2]);
  const cosmos = smoothstep(ANTIQUE_REGIME_MPC[0], ANTIQUE_REGIME_MPC[1], camDistMpc);
  const nearSun =
    1 - smoothstep(ANTIQUE_FIGURE_VANTAGE_MPC[0], ANTIQUE_FIGURE_VANTAGE_MPC[1], camDistMpc);
  const pxPerTan = size.height / (frustum.tanUp - frustum.tanDown);
  const placed: AntiqueOrnamentInstance[] = [];
  const reserved: { centre: readonly [number, number]; half: readonly [number, number] }[] = [];
  const subject = {
    centre: [size.width / 2, size.height / 2] as const,
    half: [size.width * SUBJECT_HALF_SHARE, size.height * SUBJECT_HALF_SHARE] as const,
  };

  for (const row of input.ornaments) {
    const rect = atlas.sprites[row.sprite];
    if (rect === undefined) continue;
    const regime = row.regime === 'always' ? 1 : row.regime === 'cosmos' ? cosmos : nearSun;
    if (regime <= 0) continue;
    const aspect = rect.h / rect.w;
    const uv = [
      rect.x / atlas.width,
      rect.y / atlas.height,
      (rect.x + rect.w) / atlas.width,
      (rect.y + rect.h) / atlas.height,
    ] as const;
    if (input.chromeHidden && row.anchor.kind === 'sheet') continue;
    const anchor =
      row.anchor.kind === 'sheet' && row.clearsBeneath
        ? antiqueSheetAnchor(row.anchor, aspect, [size.width, size.height], unitPx, input.covers)
        : row.anchor;

    let centre: [number, number];
    let widthPx: number;
    let opacity = row.opacity * regime;
    let dir: Vec3;
    if (anchor.kind === 'sky' || anchor.kind === 'space') {
      const raw = raDecDistToCartesian(anchor.lonDeg, anchor.latDeg, 1);
      const unit =
        anchor.kind === 'space' ? rotateVec3ByTightMat3(GAL_TO_EQ_MATRIX, raw, [0, 0, 0]) : raw;
      // A place is seen from the camera: its direction and distance from the eye.
      const cam = input.camPosMpc;
      const toward: Vec3 =
        anchor.kind === 'space'
          ? [
              unit[0] * anchor.distMpc - cam[0],
              unit[1] * anchor.distMpc - cam[1],
              unit[2] * anchor.distMpc - cam[2],
            ]
          : unit;
      const range = Math.hypot(toward[0], toward[1], toward[2]);
      dir = [toward[0] / range, toward[1] / range, toward[2] / range];
      const at = projectDirToPx(dir, basis, frustum, size);
      if (at === null) continue;
      centre = [at.x, at.y];
      const angle =
        anchor.kind === 'space'
          ? 2 * Math.atan(anchor.sizeMpc / (2 * range))
          : anchor.sizeDeg * DEG;
      widthPx = (Math.tan(angle * 0.5) * 2 * pxPerTan) / at.z;
      const share = widthPx / size.height;
      opacity *=
        smoothstep(SKY_FADE_IN[0], SKY_FADE_IN[1], share) *
        (1 - smoothstep(SKY_FADE_OUT[0], SKY_FADE_OUT[1], share));
    } else {
      centre = sheetAnchorCentre(anchor, size.width, size.height, unitPx);
      widthPx = anchor.sizeUnits * unitPx;
      dir = rayThroughPx(centre, basis, frustum, size);
    }
    const half: [number, number] = [widthPx * 0.5, widthPx * 0.5 * aspect];
    // A figure the numbered border cuts reads as a stray claw, not a crop (Mars's
    // sea serpent against the bottom neatline): a beast or a constellation figure
    // sails whole inside the border or not at all, bar a sliver.
    if (anchor.kind === 'sky' || anchor.kind === 'space') {
      const inset = ANTIQUE_NUMERAL_INSET_UNITS * unitPx;
      const plate = { width: size.width - 2 * inset, height: size.height - 2 * inset };
      const [lo, hi] = anchor.kind === 'sky' ? [0.85, 0.95] : [0.97, 0.995];
      opacity *= smoothstep(
        lo,
        hi,
        onScreenShare([centre[0] - inset, centre[1] - inset], half, plate),
      );
    }
    if (opacity <= 0.003 || offScreen(centre, half, size)) continue;
    // An engraving is on the plate or not: a beast that would run under a
    // cartouche is withdrawn rather than shown cut off or faded.
    if (anchor.kind !== 'sheet' && reserved.some((r) => overlapShare(centre, half, r) > 0.15))
      continue;
    if (anchor.kind === 'sheet' && row.clearsBeneath) reserved.push({ centre, half });
    // The focused subject and its name sit at the plate's centre: a sea beast
    // never sails over them (a constellation figure may lie behind, as it truly does).
    if (anchor.kind === 'space' && overlapShare(centre, half, subject) > 0) continue;
    // A negative half-width flips the sprite in the shader (local x runs backwards).
    if (row.mirrored) half[0] = -half[0];
    const north = row.facesNorth ? screenNorthAngle(dir, centre, basis, frustum, size) : 0;
    placed.push({
      centrePx: centre,
      halfPx: half,
      rotation: north,
      opacity,
      clearsBeneath: row.clearsBeneath,
      pigment: row.pigment,
      accent: row.accent,
      rect: [uv[0], uv[1], uv[2], uv[3]],
      lettering: false,
    });
    // The title is set level in the cartouche's blank interior, lettering-sheet ink on its paper.
    if (row.sprite === 'cartouche' && input.title !== null) {
      const oval = atlas.cartoucheOval;
      placed.push({
        centrePx: [
          centre[0] + (oval.cx - 0.5) * 2 * Math.abs(half[0]),
          centre[1] + (oval.cy - 0.5) * 2 * half[1],
        ],
        halfPx: [oval.rx * 2 * Math.abs(half[0]), oval.ry * 2 * half[1]],
        rotation: 0,
        opacity: opacity * input.title.weight,
        clearsBeneath: true,
        pigment: row.pigment,
        accent: row.accent,
        rect: [...input.title.rect],
        lettering: true,
      });
    }
  }
  return placed;
}
