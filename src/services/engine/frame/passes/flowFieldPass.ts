/**
 * flowFieldPass — CF4++ peculiar-velocity ribbon overlay.
 *
 * ### What it draws
 *
 * Per-particle trail ribbons threaded through the velocity field, advanced by
 * the pre-HDR compute step (`encodeFlowCompute`). This pass only DRAWS the
 * trails the compute pass already integrated this frame — it owns no compute
 * work itself. Additive into the HDR target, like the other emission overlays.
 *
 * ### When it draws
 *
 * Gated on the singleton-overlay-layer contract:
 *   1. `state.settings.flow.enabled` — the user toggle (off by default).
 *   2. `state.data.flow.loaded` — the velocity cube has been committed.
 * Gating on both keeps the split-path from opening an empty render pass while
 * flow is enabled but still loading. The renderer-null check lives in `draw`
 * (the `Pass.enabled` signature has no `deps`), mirroring `filamentsPass`.
 *
 * ### Why after filamentsPass
 *
 * Flow is a local-universe overlay threaded between the same galaxies the
 * filament skeleton is, so it sits with the structure layers, after filaments
 * and before the Milky-Way foreground. Additive blending makes per-fragment
 * colour order-independent, so the position is a deterministic-encoder-record
 * choice (HMR-stable), not a correctness one — same rationale as filaments.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const flowFieldPass: Pass = {
  name: 'flow',

  enabled(state) {
    return state.settings.flow.enabled && state.data.flow.loaded;
  },

  draw(pass, ctx, state, _settings, deps) {
    // Renderer-null check here rather than in `enabled` because `enabled`
    // doesn't receive `deps` — same pattern as filamentsPass. The renderer's
    // own `draw` also early-returns until a field is set, so this is belt +
    // suspenders against the bootstrap window.
    if (deps.flowFieldRenderer === null) return;
    const { vp, canvasSize } = ctx;
    deps.flowFieldRenderer.draw(
      pass,
      vp,
      [canvasSize.width, canvasSize.height],
      state.settings.flow,
    );
  },
};
