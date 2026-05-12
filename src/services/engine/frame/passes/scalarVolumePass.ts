/**
 * scalarVolumePass — draws all active scalar-field cubes.
 *
 * ### What it draws
 *
 * Volumetric raymarched cubes from the `ScalarVolumeRenderer`.  Each
 * registered field (CF-4 dark-matter density, MCPM reionization maps,
 * synthetic test fixtures, …) owns its own 3D r16float texture, palette
 * LUT, and uniform buffer.  The renderer iterates them in registration
 * order, dispatching one raymarched draw per active field with additive
 * blending — two overlapping cubes with distinct palettes read as two
 * superimposed halos rather than one overwriting the other.
 *
 * ### Gate: two conditions in series
 *
 *   1. `settings.volumesEnabled` — master user toggle.  When false, the
 *      pass is skipped before the renderer is even consulted.  This is
 *      the coarse "hide all volumes" escape hatch; per-field `enabled` /
 *      `intensity` on the renderer itself are the fine-grained controls.
 *   2. `deps.scalarVolumeRenderer?.hasActiveFields()` — at least one
 *      registered field is enabled with intensity > 0.  When all fields
 *      are disabled or at zero intensity, the pass is skipped at zero
 *      GPU cost.  The optional-chain handles the narrow bootstrap window
 *      where the renderer has not yet been assigned (see note below).
 *
 * Note on the optional-chain: `deps.scalarVolumeRenderer` is typed
 * `ScalarVolumeRenderer | null` because `EngineGpuHandles` initialises
 * every renderer to `null` before `initGpu` completes the async bootstrap.
 * In practice the engine's `isEngineReady` gate (run earlier in
 * `runFrame`) means we will never reach `scalarVolumePass.enabled` with
 * a null renderer — but the optional-chain keeps the type honest without
 * an assertion, and `null?.hasActiveFields()` safely evaluates to
 * `undefined`, which is falsy, so the pass is a silent no-op in that
 * window.
 *
 * ### Position in the HDR pass order
 *
 * After filaments (`'filaments'`), before Milky Way (`'milky-way'`).
 * Rationale: filaments are the per-galaxy large-scale-structure overlay;
 * volumes are the broader atmospherics (whole-survey density fields).
 * Both sit BEFORE the Milky Way because the MW impostor is a bright
 * near-field foreground that should composite over the volume halos, not
 * vice versa.  Post-tone-map compositing would clip the additive
 * contributions, so placing the pass inside the HDR block is load-
 * bearing for correctness: the tone-mapper compresses the HDR sum
 * (galaxy points + thumbnails + filaments + volume cubes + MW) in one
 * pass, preserving detail in the highlights.
 *
 * ### What it reads from deps
 *
 * - `deps.scalarVolumeRenderer` — the renderer instance.
 * - `ctx.vp` — combined view-projection matrix (mat4, column-major).
 * - `ctx.canvasSize` — backing-store viewport in texels.
 * - `ctx.drawCamPos` — camera world-space position (snapshotted tuple,
 *   no live Float32Array aliasing).  Pre-computed by `deriveFrameContext`;
 *   see `frameContext.ts` for the snapshot rationale.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';

export const scalarVolumePass: Pass = {
  name: 'scalar-volume',

  enabled(state, _ctx, settings) {
    // Master toggle first — short-circuit before touching the renderer.
    if (!settings.volumesEnabled) return false;

    // Belt-and-braces optional-chain: the renderer is always non-null
    // after bootstrap but typed nullable to match the zero-cost
    // initialisation pattern; see the module header for the full story.
    return state.gpu.scalarVolumeRenderer?.hasActiveFields() === true;
  },

  draw(pass, ctx, _state, _settings, deps) {
    // `deps.scalarVolumeRenderer` is always non-null when `enabled`
    // returned true (enabled checks the same renderer reference), but
    // we null-check defensively here rather than using `!` so future
    // refactors that reorder the gate can't silently skip the guard.
    // The cost is one reference read — negligible vs. the raymarch work.
    if (deps.scalarVolumeRenderer === null) return;

    const { vp, canvasSize, drawCamPos } = ctx;
    deps.scalarVolumeRenderer.draw(
      pass,
      vp,
      [canvasSize.width, canvasSize.height],
      [drawCamPos[0], drawCamPos[1], drawCamPos[2]],
    );
  },
};
