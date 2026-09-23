import { CLOUD_SHELL_PARAMS } from './cloudShellParams';

/**
 * BODY_DRAW_ENVELOPES — per-body extra radius `bodyDrawRadiusM` maxes in on
 * top of the footprint/atmosphere/ring shells every body shares: a row here
 * is for a shell a specific PASS paints, which may be sized by view
 * (distance, pixel scale) as well as by the body's own geometry — `earth`'s cloud shell is a
 * fixed ratio of its footprint. Keyed by `string`: `SceneBody['id']` never
 * narrows.
 */
export const BODY_DRAW_ENVELOPES: Readonly<
  Record<string, (footprintM: number, distM: number, pxPerRad: number) => number>
> = {
  earth: (footprintM) => footprintM * CLOUD_SHELL_PARAMS.radiusRatio,
};
