/**
 * deriveMilkyWayFade — the app's Milky-Way visibility fade, evaluated against
 * this tool's camera. Imports the app's two fade PRIMITIVES rather than
 * restating them; band edges seed from the app's own constants. The app keys
 * both bands on distance from the SUN; this tool's camera orbits the
 * GALACTIC CENTRE, so `FadeAnchor` makes the difference a control — the
 * Sun's generator-space position is derived here (never hardcoded) from
 * `|Sgr A* world position|` and `milkyWayModelMatrix`'s own +x column.
 * `fadeBand` also covers the apparent-size band: `milkyWayFadeAlpha` is a
 * fixed `smoothstep` with no tunable edges, but produces the identical curve
 * at the seeded ones.
 */

import type { FadeAnchor } from '../../../@types/engine/FadeAnchor';
import type { MilkyWayFadeReadout } from '../../../@types/engine/MilkyWayFadeReadout';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import { MILKY_WAY_CENTER_WORLD } from '../../../../../src/data/milkyWay/galacticCenter';
import {
  MILKY_WAY_MODEL_SCALE,
  MILKY_WAY_RADIUS_MPC,
} from '../../../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { apparentDiameterPx } from '../../../../../src/utils/math/apparentDiameterPx';
import { fadeBand } from '../../../../../src/utils/math/fadeBand';

/** Generator units → kpc, for the readout. `MILKY_WAY_MODEL_SCALE` is Mpc/unit. */
const UNITS_TO_KPC = MILKY_WAY_MODEL_SCALE * 1000;

/**
 * The Sun in generator space: `|MILKY_WAY_CENTER_WORLD|` Mpc from the origin
 * along −x. See the module header for why −x.
 */
const SUN_ANCHOR: Vec3 = [
  -Math.hypot(MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]) /
    MILKY_WAY_MODEL_SCALE,
  0,
  0,
];

function anchorDistUnits(eye: Readonly<Vec3>, anchor: FadeAnchor): number {
  if (anchor !== 'sun') return Math.hypot(eye[0], eye[1], eye[2]);
  return Math.hypot(eye[0] - SUN_ANCHOR[0], eye[1] - SUN_ANCHOR[1], eye[2] - SUN_ANCHOR[2]);
}

/**
 * @param eye               Camera position in generator units.
 * @param fovYRad           Vertical field of view, as handed to `mat4.perspective`.
 * @param viewportHeightPx  CANVAS height, not the star target's — the
 *                          apparent-size band asks how big the disc looks to
 *                          the user, which is a canvas-relative fact (the same
 *                          reason the app passes `ctx.canvasSize.height`).
 * @param fade              The six band controls, unbundled from the render bag
 *                          they ride on so this module depends on the fade
 *                          rather than on the tool's whole settings shape.
 */
export function deriveMilkyWayFade(
  eye: Readonly<Vec3>,
  fovYRad: number,
  viewportHeightPx: number,
  fade: {
    readonly anchor: FadeAnchor;
    readonly enabled: boolean;
    /** Near-side approach band edges, GENERATOR units. */
    readonly approachFullAt: number;
    readonly approachGoneAt: number;
    /** Far-side apparent-size band edges, canvas px. */
    readonly fullPx: number;
    readonly gonePx: number;
  },
): MilkyWayFadeReadout {
  const centreUnits = Math.hypot(eye[0], eye[1], eye[2]);
  const distUnits = anchorDistUnits(eye, fade.anchor);
  const distMpc = distUnits * MILKY_WAY_MODEL_SCALE;

  // The same diameter `milkyWayFadeAlpha` measures, through the same helper.
  const apparentPx = apparentDiameterPx(
    2 * MILKY_WAY_RADIUS_MPC,
    distMpc,
    fovYRad,
    viewportHeightPx,
  );

  // `'none'` is the in-section A/B: the readout keeps tracking while the cloud
  // holds full strength, so both anchors can be compared against no fade at all
  // without collapsing the section via the master toggle.
  const live = fade.enabled && fade.anchor !== 'none';
  const approach = live
    ? fadeBand(
        {
          fullAt: fade.approachFullAt * MILKY_WAY_MODEL_SCALE,
          goneAt: fade.approachGoneAt * MILKY_WAY_MODEL_SCALE,
        },
        distMpc,
      )
    : 1;
  const apparent = live ? fadeBand({ fullAt: fade.fullPx, goneAt: fade.gonePx }, apparentPx) : 1;

  return {
    centreDistKpc: centreUnits * UNITS_TO_KPC,
    anchorDistKpc: distUnits * UNITS_TO_KPC,
    apparentPx,
    approach,
    apparent,
    alpha: approach * apparent,
  };
}
