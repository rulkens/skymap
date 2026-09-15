/**
 * encodeAtmosphereSkyView — the per-frame sky-view LUT bake, a compute step in
 * the prelude of the frame's single command encoder. The shell fragment SAMPLES
 * this LUT and it folds in the camera altitude + sun direction, so it is re-baked
 * every frame (transmittance and multi-scatter are view-independent, baked once
 * at construction). Prelude placement — ahead of the `foreground:0` render step —
 * is what orders the two: WebGPU inserts the storage barrier between the compute
 * write and the later fragment read within the one encoder. Bodies come from
 * `atmosphereDrawList` (see its header), empty away from the near field.
 *
 * ONE compute pass for the whole list, not one per body: the step owns a single
 * GPU-timing slot, and per-body passes would each write that same slot's two
 * query indices — the last body silently deciding what the panel reports. An
 * empty list opens no pass at all, so the slot stays unwritten and the panel
 * drops the row rather than showing a stale 0.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { ClaimTimestampWrites } from '../../../@types/gpu/timing/ClaimTimestampWrites';
import { atmosphereDrawList } from './atmosphereDrawList';

export function encodeAtmosphereSkyView(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
  claimTimestampWrites?: ClaimTimestampWrites,
): void {
  const renderer = state.gpu.atmosphereShellRenderer;
  if (renderer === null) return;

  const entries = atmosphereDrawList(state, ctx);
  if (entries.length === 0) return;

  const pass = encoder.beginComputePass({
    label: 'atmosphere-skyview-pass',
    // Claimed only now, past both gates: a slot claimed on a frame that opens
    // no pass reports the ticks it last held (see `ClaimTimestampWrites`).
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

    // f32 [viewHeightKm, sunZenithCos, twilightSoftness, twilightIntensity], written
    // VERBATIM by the renderer — a mis-pack mis-indexes the LUT silently.
    renderer.dispatchSkyView(
      pass,
      body.id,
      new Float32Array([viewHeightKm, sunZenithCos, twilight, twilightIntensity]),
    );
  }
  pass.end();
}
