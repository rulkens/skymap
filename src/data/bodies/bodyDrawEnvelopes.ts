import { CLOUD_SHELL_PARAMS } from './cloudShellParams';
import { SGR_A_STAR } from './sceneSgrAStar';
import { sgrAStarLensEnvelopeM } from './sgrAStarLensEnvelope';

/**
 * BODY_DRAW_ENVELOPES — per-body extra radius `bodyDrawRadiusM` maxes in on
 * top of the footprint/atmosphere/ring shells every body shares: a row here
 * is for a shell a specific PASS paints, sized by view (distance, pixel
 * scale), not by the body's own geometry — `earth`'s cloud shell is a fixed
 * ratio of its footprint, but `SGR_A_STAR`'s lens envelope grows with the
 * view's `pxPerRad` and camera distance. Keyed by string, not `BodyId`:
 * `SceneBody['id']` is `string` across every union arm (no arm narrows it),
 * so a registry typed by the closed `BodyId` set could not be indexed by a
 * `body.id` read off a live `SceneBody`.
 */
export const BODY_DRAW_ENVELOPES: Readonly<
  Record<string, (footprintM: number, distM: number, pxPerRad: number) => number>
> = {
  earth: (footprintM) => footprintM * CLOUD_SHELL_PARAMS.radiusRatio,
  [SGR_A_STAR.id]: (_footprintM, distM, pxPerRad) => sgrAStarLensEnvelopeM(distM, pxPerRad),
};
