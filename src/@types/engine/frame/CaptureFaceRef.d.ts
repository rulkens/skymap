/**
 * CaptureFaceRef — which `CUBEMAP_CAPTURES` row a render step re-draws the sky
 * into, and which of its six faces. The key travels with the step because the
 * executor resolves that face's synthetic camera from it and bills the step's
 * timing slot under it — so a second capture row needs no new plumbing, only a
 * second key.
 */

import type { CubeFace } from '../../rendering/CubeFace';
import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';

export type CaptureFaceRef = {
  readonly key: CubemapCaptureKey;
  readonly face: CubeFace;
};
