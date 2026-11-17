/**
 * Every cubemap capture row: the root collects the Layers' `skyCaptures` and core's mesh-probe
 * rows. Imported from each Layer's leaf data file, never read off `APP_COMPOSITION`: `SkyCaptureKey`
 * derives from this table and `EngineState` names it, the circular alias `appVisibility.ts` explains.
 * A test pins it to the composition. Row order is the sweep order `scheduleSkyCaptures` bakes in.
 */

import type { CubemapCaptureKey } from '../@types/rendering/CubemapCaptureKey';
import type { SkyCaptureKey } from '../@types/rendering/SkyCaptureKey';
import { CORE_CUBEMAP_CAPTURES } from '../data/rendering/cubemapCaptures';
import { BLACK_HOLE_SKY_CAPTURES } from '../layers/blackHoles/lensing/data/blackHoleSkyCaptures';

export const APP_CUBEMAP_CAPTURE_REGISTRY = {
  ...BLACK_HOLE_SKY_CAPTURES,
  ...CORE_CUBEMAP_CAPTURES,
} as const;

/** The sky rows, in table order. */
export const APP_SKY_CAPTURE_KEYS: readonly SkyCaptureKey[] = (
  Object.keys(APP_CUBEMAP_CAPTURE_REGISTRY) as CubemapCaptureKey[]
).filter((key): key is SkyCaptureKey => APP_CUBEMAP_CAPTURE_REGISTRY[key].kind === 'sky');
