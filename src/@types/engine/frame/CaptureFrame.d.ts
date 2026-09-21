import type { OrbitCamera } from '../../camera/OrbitCamera';
import type { ReadyFrameContext } from './ReadyFrameContext';

/** `cubemapCaptureFrame`'s ready result: the frame snapshot plus the pose-true
 *  capture camera it was derived from, threaded beside it (K2) rather than
 *  read back off `snapshot.cam` — a face's `deriveView` needs both. */
export type CaptureFrame = {
  isReady: true;
  snapshot: ReadyFrameContext;
  cam: OrbitCamera;
};
