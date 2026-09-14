/**
 * CaptureFaceRef — which `CUBEMAP_CAPTURES` row a render step re-draws the
 * sky into, and which of its six faces.
 */

import type { CubeFace } from '../../rendering/CubeFace';
import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';

export type CaptureFaceRef = {
  readonly key: CubemapCaptureKey;
  readonly face: CubeFace;
};
