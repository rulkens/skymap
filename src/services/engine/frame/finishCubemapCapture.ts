/**
 * finishCubemapCapture — what a capture row owes once its last face this frame
 * has submitted. A sky row owes nothing. A probe row's faces wrote only mip 0
 * of its subject's cube, and the mesh fragment reads specular by mip, so the
 * GGX prefilter fills the chain before the frame that samples it.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { CubemapCaptureKey } from '../../../@types/rendering/CubemapCaptureKey';
import { APP_CUBEMAP_CAPTURE_REGISTRY } from '../../../compositions/appCubemapCaptures';
import { prefilterCubeGgx } from '../../gpu/lib/prefilterCubeGgx';
import { subjectProbe } from './subjectProbe';

export function finishCubemapCapture(
  key: CubemapCaptureKey,
  state: EngineState,
  device: GPUDevice,
): void {
  if (APP_CUBEMAP_CAPTURE_REGISTRY[key].kind !== 'probe') return;
  prefilterCubeGgx(device, subjectProbe(state).cube);
}
