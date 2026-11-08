/**
 * placeAntiqueOrnaments — this frame's ornament instances, in device px.
 *
 * The title cartouche comes first, where `antiquePlateCartouche` put it, its
 * title set level in its field. Sky-anchored rows project through the view and
 * turn with the sky (their up to celestial north on screen). Each fades in only
 * while it is a sensible size on screen and while the camera is in its regime
 * (near the Sun for a constellation, out among the galaxies for the Zone of
 * Avoidance), so nothing pops and nothing balloons past the plate.
 */

import type { ViewProjection } from '../../../@types/camera/projection/ViewProjection';
import type { AntiqueCartouche } from '../../../@types/rendering/AntiqueCartouche';
import type { AntiqueOrnament } from '../../../@types/rendering/AntiqueOrnament';
import type { AntiqueOrnamentAtlas } from '../../../@types/rendering/AntiqueOrnamentAtlas';
import type { AntiqueOrnamentInstance } from '../../../@types/rendering/AntiqueOrnamentInstance';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { AntiqueSheetAnchor } from '../../../@types/rendering/AntiqueSheetAnchor';
import { GAL_TO_EQ_MATRIX } from '../../../data/superGalacticTransform';
import {
  ANTIQUE_FIGURE_VANTAGE_MPC,
  ANTIQUE_NUMERAL_INSET_UNITS,
  ANTIQUE_REGIME_MPC,
} from '../../../data/rendering/antiqueLook';
import { raDecDistToCartesian } from '../../math/raDecDistToCartesian';
import { rotateVec3ByTightMat3 } from '../../math/rotateVec3ByTightMat3';
import { pxOfRay } from '../../camera/projection/viewProjection/pxOfRay';
import { pxPerRadAt } from '../../camera/projection/viewProjection/pxPerRadAt';
import { overlapShare } from '../../render/overlapShare';
import { sheetAnchorCentre } from '../../render/sheetAnchorCentre';
import { smoothstep } from '../../math/smoothstep';
import { screenNorthAngle } from '../../camera/projection/screenNorthAngle';
import { onScreenShare } from '../../render/onScreenShare';
import { offScreen } from '../../render/offScreen';

const DEG = Math.PI / 180;

/** A sky ornament shows between these on-screen widths, as a share of the canvas height. */
const SKY_FADE_IN = [0.12, 0.13] as const;
const SKY_FADE_OUT = [0.9, 1.4] as const;
// Half the subject's box at the plate centre, as a share of each canvas side.
const SUBJECT_HALF_SHARE = 0.12;

export function placeAntiqueOrnaments(input: {
  readonly ornaments: readonly AntiqueOrnament[];
  readonly atlas: AntiqueOrnamentAtlas;
  readonly projection: ViewProjection;
  readonly unitPx: number;
  /** The eye in the world frame, Mpc from the Sun. */
  readonly camPosMpc: Readonly<Vec3>;
  /** The title cartouche as placed, its frame's strength and its title; null while Tab hides the UI. */
  readonly cartouche: {
    readonly row: AntiqueCartouche;
    readonly anchor: AntiqueSheetAnchor;
    readonly frame: number;
    /** The title's block on the lettering sheet, normalised, and its strength. */
    readonly title: {
      readonly rect: readonly [number, number, number, number];
      readonly weight: number;
    } | null;
  } | null;
}): readonly AntiqueOrnamentInstance[] {
  const { atlas, projection, unitPx } = input;
  const { size } = projection;
  const camDistMpc = Math.hypot(input.camPosMpc[0], input.camPosMpc[1], input.camPosMpc[2]);
  const cosmos = smoothstep(ANTIQUE_REGIME_MPC[0], ANTIQUE_REGIME_MPC[1], camDistMpc);
  const nearSun =
    1 - smoothstep(ANTIQUE_FIGURE_VANTAGE_MPC[0], ANTIQUE_FIGURE_VANTAGE_MPC[1], camDistMpc);
  const placed: AntiqueOrnamentInstance[] = [];
  const reserved: { centre: readonly [number, number]; half: readonly [number, number] }[] = [];
  const subject = {
    centre: [size.width / 2, size.height / 2] as const,
    half: [size.width * SUBJECT_HALF_SHARE, size.height * SUBJECT_HALF_SHARE] as const,
  };
  const uvOf = (rect: { x: number; y: number; w: number; h: number }) =>
    [
      rect.x / atlas.width,
      rect.y / atlas.height,
      (rect.x + rect.w) / atlas.width,
      (rect.y + rect.h) / atlas.height,
    ] as [number, number, number, number];

  const card = input.cartouche;
  const cardRect = card && atlas.sprites[card.row.sprite];
  if (card && cardRect && card.frame > 0.003) {
    const centre = sheetAnchorCentre(card.anchor, size.width, size.height, unitPx);
    const half: [number, number] = [
      (card.anchor.sizeUnits * unitPx) / 2,
      ((card.anchor.sizeUnits * unitPx) / 2) * (cardRect.h / cardRect.w),
    ];
    reserved.push({ centre, half });
    const { pigment } = card.row;
    placed.push({
      centrePx: centre,
      halfPx: half,
      rotation: 0,
      opacity: card.frame,
      clearsBeneath: true,
      pigment,
      rect: uvOf(cardRect),
      lettering: false,
      washed: true,
    });
    // The title is set level in the cartouche's blank field, lettering-sheet ink on its paper.
    const field = atlas.interiors[card.row.sprite];
    if (card.title !== null && field !== undefined)
      placed.push({
        centrePx: [
          centre[0] + (field.cx - 0.5) * 2 * half[0],
          centre[1] + (field.cy - 0.5) * 2 * half[1],
        ],
        halfPx: [field.rx * 2 * half[0], field.ry * 2 * half[1]],
        rotation: 0,
        opacity: card.title.weight,
        clearsBeneath: true,
        pigment,
        rect: [...card.title.rect],
        lettering: true,
        washed: false,
      });
  }

  for (const row of input.ornaments) {
    const rect = atlas.sprites[row.sprite];
    if (rect === undefined) continue;
    const regime = row.regime === 'cosmos' ? cosmos : nearSun;
    if (regime <= 0) continue;
    const aspect = rect.h / rect.w;
    const { anchor } = row;
    let opacity = row.opacity * regime;
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
    const dir: Vec3 = [toward[0] / range, toward[1] / range, toward[2] / range];
    const centre = pxOfRay(projection, dir);
    if (centre === null) continue;
    const angle =
      anchor.kind === 'space' ? 2 * Math.atan(anchor.sizeMpc / (2 * range)) : anchor.sizeDeg * DEG;
    const widthPx = Math.tan(angle * 0.5) * 2 * pxPerRadAt(projection, dir);
    const share = widthPx / size.height;
    opacity *=
      smoothstep(SKY_FADE_IN[0], SKY_FADE_IN[1], share) *
      (1 - smoothstep(SKY_FADE_OUT[0], SKY_FADE_OUT[1], share));
    const half: [number, number] = [widthPx * 0.5, widthPx * 0.5 * aspect];
    // A figure the numbered border cuts reads as a stray claw, not a crop (Mars's
    // sea serpent against the bottom neatline): a beast or a constellation figure
    // sails whole inside the border or not at all, bar a sliver.
    const inset = ANTIQUE_NUMERAL_INSET_UNITS * unitPx;
    const plate = { width: size.width - 2 * inset, height: size.height - 2 * inset };
    const [lo, hi] = anchor.kind === 'sky' ? [0.85, 0.95] : [0.97, 0.995];
    opacity *= smoothstep(
      lo,
      hi,
      onScreenShare([centre[0] - inset, centre[1] - inset], half, plate),
    );
    if (opacity <= 0.003 || offScreen(centre, half, size)) continue;
    // An engraving is on the plate or not: a beast that would run under a
    // cartouche is withdrawn rather than shown cut off or faded.
    if (reserved.some((r) => overlapShare(centre, half, r) > 0.15)) continue;
    // The focused subject and its name sit at the plate's centre: a sea beast
    // never sails over them (a constellation figure may lie behind, as it truly does).
    if (anchor.kind === 'space' && overlapShare(centre, half, subject) > 0) continue;
    // A negative half-width flips the sprite in the shader (local x runs backwards).
    if (row.mirrored) half[0] = -half[0];
    const north = row.facesNorth ? screenNorthAngle(dir, centre, projection) : 0;
    placed.push({
      centrePx: centre,
      halfPx: half,
      rotation: north,
      opacity,
      clearsBeneath: row.clearsBeneath,
      pigment: row.pigment,
      rect: uvOf(rect),
      lettering: false,
      washed: false,
    });
  }
  return placed;
}
