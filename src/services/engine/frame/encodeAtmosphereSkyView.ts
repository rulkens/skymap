/**
 * encodeAtmosphereSkyView — the per-frame sky-view LUT bake, a compute step in
 * the prelude of the frame's single command encoder. The shell fragment SAMPLES
 * this LUT and it folds in the camera altitude + sun direction, so it is re-baked
 * every frame (transmittance and multi-scatter are view-independent, baked once
 * at construction). Prelude placement — ahead of the `foreground:0` render step —
 * is what orders the two: WebGPU inserts the storage barrier between the compute
 * write and the later fragment read within the one encoder. Bodies come from
 * `atmosphereDrawList` (see its header), empty away from the near field.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import { atmosphereDrawList } from './atmosphereDrawList';

export function encodeAtmosphereSkyView(
  encoder: GPUCommandEncoder,
  ctx: ReadyFrameContext,
  state: EngineState,
): void {
  const renderer = state.gpu.atmosphereShellRenderer;
  if (renderer === null) return;

  // The entry's OWN `camLocal`/`sunLocal`, off the body-slab pose seam the shell's
  // MVP is composed from — never a second Mpc-side re-derivation, or bake and
  // fragment read two different cameras.
  for (const { body, params, camLocal, sunLocal } of atmosphereDrawList(state, ctx)) {
    const radius = Math.hypot(camLocal[0], camLocal[1], camLocal[2]);
    // camLocal is in atmosphere-top-radius units, so this is the camera radius in
    // km — the km-baked LUT's parametrisation.
    const viewHeightKm = radius * params.atmosphereTopKm;
    // cos of the sun's zenith angle at the camera; the guard keeps a degenerate
    // centre pose (radius 0) from baking a NaN.
    const sunZenithCos =
      radius > 0
        ? (camLocal[0] * sunLocal[0] + camLocal[1] * sunLocal[1] + camLocal[2] * sunLocal[2]) /
          radius
        : 0;

    // These ride the per-frame SkyViewParams rather than the construction-written
    // ScatteringParams, which is what keeps the rebake self-contained.
    const twilight = params.twilightSoftness;
    const twilightIntensity = params.twilightIntensity;

    // f32 [viewHeightKm, sunZenithCos, twilightSoftness, twilightIntensity] — the
    // 16-byte SkyViewParams record the renderer writes VERBATIM, layout fixed by
    // AtmosphereShellRenderer.d.ts (a mis-pack mis-indexes the LUT silently).
    renderer.encodeSkyView(
      encoder,
      body.id,
      new Float32Array([viewHeightKm, sunZenithCos, twilight, twilightIntensity]),
    );
  }
}
