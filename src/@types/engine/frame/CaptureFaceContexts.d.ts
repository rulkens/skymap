/**
 * CaptureFaceContexts — per capture row, each face scheduled this frame. A
 * face is scheduled IFF it has an entry here, so the "all six faces or none"
 * rule is the shape of one value.
 */

import type { CubeFace } from '../../rendering/CubeFace';
import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';
import type { CaptureFace } from './CaptureFace';

export type CaptureFaceContexts = ReadonlyMap<
  CubemapCaptureKey,
  ReadonlyMap<CubeFace, CaptureFace>
>;
