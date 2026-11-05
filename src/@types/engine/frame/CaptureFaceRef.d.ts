/**
 * CaptureFaceRef — which `APP_CUBEMAP_CAPTURE_REGISTRY` row a render step re-draws the
 * sky into, and which of its six faces.
 */

import type { CubeFace } from '../../rendering/CubeFace';
import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';

export type CaptureFaceRef = {
  readonly key: CubemapCaptureKey;
  readonly face: CubeFace;
};
