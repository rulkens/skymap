/**
 * CaptureFaceContexts — per capture row, the synthetic camera each face
 * scheduled this frame draws through. A face is scheduled IFF it has an entry
 * here, so the "all six faces or none" rule is the shape of one value.
 */

import type { CubeFace } from '../../rendering/CubeFace';
import type { CubemapCaptureKey } from '../../rendering/CubemapCaptureKey';
import type { ReadyFrameContext } from './ReadyFrameContext';

export type CaptureFaceContexts = ReadonlyMap<
  CubemapCaptureKey,
  ReadonlyMap<CubeFace, ReadyFrameContext>
>;
