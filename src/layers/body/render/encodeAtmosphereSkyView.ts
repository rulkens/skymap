/**
 * encodeAtmosphereSkyView: the per-frame sky-view LUT bake, a compute step in the
 * prelude of the frame's single encoder. The shell fragment SAMPLES this LUT; it
 * folds in camera altitude and sun direction, so it is re-baked every frame
 * (transmittance and multi-scatter are baked once). Prelude placement, ahead of the
 * `foreground:0` render step, is what orders the write before the read.
 *
 * ONE compute pass for the whole `atmosphereDrawList`: the step owns a single
 * GPU-timing slot, and per-body passes would each write that slot's two query
 * indices, the last body silently deciding the report. An empty list opens no pass,
 * so the slot stays unwritten and the panel drops the row.
 */

import type { PassState } from '../../../@types/engine/frame/PassState';
import type { AtmosphereShellRenderer } from '../@types/AtmosphereShellRenderer';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import { atmosphereDrawList } from '../present/atmosphereDrawList';

export function encodeAtmosphereSkyView(
  renderer: AtmosphereShellRenderer,
  encoder: GPUCommandEncoder,
  ctx: FrameView,
  state: PassState,
  claimTimestampWrites?: ClaimTimestampWrites,
): void {
  const entries = atmosphereDrawList(state, ctx);
  if (entries.length === 0) return;

  const pass = encoder.beginComputePass({
    label: 'atmosphere-skyview-pass',
    // Claimed only past the gate: a slot claimed on a frame that opens no pass reports stale ticks.
    ...(claimTimestampWrites?.() ?? {}),
  });
  for (const { body, params, camLocal, sunLocal } of entries) {
    const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
    const viewHeightKm = radius * params.atmosphereTopKm;
    const sunZenithCos =
      radius > 0
        ? (camLocal[0] * sunLocal[0] + camLocal[1] * sunLocal[1] + camLocal[2] * sunLocal[2]) /
          radius
        : 0;

    const twilight = params.twilightSoftness;
    const twilightIntensity = params.twilightIntensity;

    // Written VERBATIM by the renderer; a mis-pack mis-indexes the LUT silently.
    renderer.dispatchSkyView(
      pass,
      body.id,
      new Float32Array([viewHeightKm, sunZenithCos, twilight, twilightIntensity]),
    );
  }
  pass.end();
}
