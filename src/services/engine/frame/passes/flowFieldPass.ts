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
 *   1. `slotReady(state.assetSlots.flow)` — the velocity cube has been committed;
 *      with no cube there is nothing to draw, even mid-fade.
 *   2. `state.settings.flow.enabled` OR a non-zero flow fade opacity — the
 *      setting is the user's intent, a non-zero fade is the visual state. The
 *      pass stays alive while EITHER is true so a fade-out keeps drawing after
 *      the user toggles off (until opacity hits 0), mirroring `filamentsPass`.
 * The renderer-null check lives in `draw` (the `Pass.enabled` signature has no
 * `deps`), mirroring `filamentsPass`.
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
import { slotReady } from '../../../loading/slotReady';

export const flowFieldPass: Pass = {
  name: 'flow',

  enabled(state) {
    // No cube committed → nothing to draw, even mid-fade.
    if (!slotReady(state.assetSlots.flow)) return false;
    // The setting is the user's intent; a non-zero fade opacity is the visual
    // state. Render while EITHER is true so a fade-out keeps drawing after the
    // user toggles off (until opacity hits 0).
    if (state.settings.flow.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'flow' }, performance.now()) > 0;
  },

  draw(pass, ctx, state, deps) {
    // Renderer-null check here rather than in `enabled` because `enabled`
    // doesn't receive `deps` — same pattern as filamentsPass. The renderer's
    // own `draw` also early-returns until a field is set, so this is belt +
    // suspenders against the bootstrap window.
    if (deps.flowFieldRenderer === null) return;
    // Hoist nowMs to a single call per draw, matching filamentsPass.
    const nowMs = performance.now();
    const { vp, canvasSize } = ctx;
    deps.flowFieldRenderer.draw(
      pass,
      vp,
      [canvasSize.width, canvasSize.height],
      state.settings.flow,
      state.subsystems.fades.opacityOf({ kind: 'flow' }, nowMs),
    );
  },
};
