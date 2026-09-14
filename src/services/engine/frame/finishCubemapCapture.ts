/**
 * finishCubemapCapture — what a capture row owes once its last face this frame
 * has submitted. A sky row owes nothing. A probe row's faces wrote only mip 0
 * of its subject's cube, and the mesh fragment reads specular by mip, so the
 * GGX prefilter fills the chain before the frame that samples it.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { CubemapCaptureKey } from '../../../@types/rendering/CubemapCaptureKey';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { prefilterCubeGgx } from '../../gpu/lib/prefilterCubeGgx';

export function finishCubemapCapture(
  key: CubemapCaptureKey,
  state: EngineState,
  device: GPUDevice,
): void {
  if (CUBEMAP_CAPTURES[key].kind !== 'probe') return;
  const subject = state.cubemapCaptures.probe.subject;
  const probe = subject === null ? null : state.gpu.meshBodyRenderer?.probeOf(subject);
  if (!probe) {
    throw new Error(`finishCubemapCapture: no probe for subject '${subject}'`);
  }
  prefilterCubeGgx(device, probe.cube);
}
