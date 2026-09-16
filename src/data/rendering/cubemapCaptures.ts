/**
 * cubemapCaptures — the frame's environment bakes, AS DATA: one row per
 * six-face capture. A `sky` row bakes the sky into a render-target row while its
 * anchor band is open; the `probe` row bakes a body's surroundings into its cube.
 *
 * A row's faces claim view slots `viewSlotBase … +5`, under `VIEW_SLOT_COUNT`
 * and disjoint from every other row's: two rows sharing a slot overwrite each
 * other's per-view uniform writes, with no error anywhere.
 */

import type { CubeFace } from '../../@types/rendering/CubeFace';
import type { ProbeCapture } from '../../@types/rendering/ProbeCapture';
import type { ProbeCaptureKey } from '../../@types/rendering/ProbeCaptureKey';
import type { SkyCapture } from '../../@types/rendering/SkyCapture';
import type { SkyCaptureKey } from '../../@types/rendering/SkyCaptureKey';
import { regionById } from '../../utils/regions/regionById';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import { SCALE_UNITS } from '../scaleUnits';

export const ALL_CUBE_FACES: readonly CubeFace[] = [0, 1, 2, 3, 4, 5];

/** The sky rows, in table order — what `scheduleSkyCaptures` sweeps. */
export const SKY_CAPTURE_KEYS: readonly SkyCaptureKey[] = ['sgrAStar', 'solarSystem'];

export const CUBEMAP_CAPTURES: Readonly<
  Record<SkyCaptureKey, SkyCapture> & Record<ProbeCaptureKey, ProbeCapture>
> = {
  sgrAStar: {
    kind: 'sky',
    target: 'sky-cubemap',
    anchor: regionById('galactic-centre'),
    band: SCALE_FADE_BANDS.sgrAStarLensing,
    nearMpc: 0.1 * SCALE_UNITS.AU_TO_MPC,
    viewSlotBase: 1,
    rebakeOnSettings: true,
  },
  // The star field a probe is captured over. One bake per band entry: a survey
  // toggle re-baking six faces on every slider frame near Earth buys nothing
  // observable in a reflection.
  solarSystem: {
    kind: 'sky',
    target: 'solar-system-sky',
    anchor: regionById('solar-system'),
    band: SCALE_FADE_BANDS.solarSystemSky,
    nearMpc: 0.1 * SCALE_UNITS.AU_TO_MPC,
    viewSlotBase: 7,
    rebakeOnSettings: false,
  },
  probe: {
    kind: 'probe',
    faceSizePx: 128,
    // A metre — a probe's subject is a mesh body metres across, so the capture
    // camera sits inside every scale the sky rows are cut for.
    nearMpc: 1 * SCALE_UNITS.M_TO_MPC,
    viewSlotBase: 13,
  },
};
