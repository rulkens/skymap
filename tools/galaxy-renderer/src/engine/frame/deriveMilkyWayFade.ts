/**
 * deriveMilkyWayFade — the app's Milky-Way visibility fade, evaluated against
 * this tool's camera. The app's own composition is
 * `services/engine/frame/milkyWayCloudLiveness.ts`; it takes an `EngineState`
 * and so cannot be called here, but the two PRIMITIVES it folds are imported
 * rather than restated, and the band edges seed from the app's constants.
 *
 * ## The anchor is not the orbit target
 *
 * The app keys both bands on `hypot(drawCamPos)` — distance from the
 * heliocentric render origin, i.e. from the SUN. This tool's camera orbits the
 * generator origin, which is the galactic CENTRE. `FadeAnchor` makes the
 * difference a control; the Sun's generator-space position is derived here
 * (never hardcoded) from the two numbers that already own it: `|Sgr A* world
 * position|` is the Sun→centre distance, and `milkyWayModelMatrix`'s local +x
 * column is the direction from the centre TOWARD the Sun's line of sight, so
 * the Sun sits at −x by exactly that distance.
 *
 * ## Why fadeBand runs the apparent-size band too
 *
 * `milkyWayFadeAlpha` is `smoothstep(GONE_PX, FULL_PX, px)` over two module
 * constants — it has no tunable edges and cannot report the pixel size the
 * readout needs. `fadeBand` produces the identical curve for `fullAt > goneAt`,
 * so at the seeded edges this IS `milkyWayFadeAlpha`, with the edges movable
 * and `apparentPx` in hand.
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
