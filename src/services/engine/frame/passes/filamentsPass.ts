/**
 * filamentsPass — cosmic-web filament-skeleton overlay.
 *
 * ### What it draws
 *
 * Line segments produced by the optional `npm run build-filaments`
 * pipeline (DisPerSE → `filaments.bin`).  Each segment is a thin
 * additive ridge stitched between density-field maxima — visually
 * the cosmic-web cartography threading between galaxy clusters.
 *
 * ### When it draws
 *
 * Gated on TWO conditions:
 *   1. `state.settings.filaments.enabled` — user toggle (off by default).
 *   2. `deps.filamentRenderer !== null` — the binary is an optional
 *      asset.  When the deployment doesn't ship `filaments.bin`,
 *      `state.gpu.filamentRenderer` is constructed but never
 *      populated; we treat that as "disabled" so the toggle's UI
 *      stays consistent (clicking it is a no-op rather than an
 *      error path).
 *
 * Both checks live in `enabled` so the inner `draw` body can
 * dereference `filamentRenderer` without a redundant null guard.
 *
 * ### State reads
 *
 * `enabled` reads `state.settings.filaments.enabled` (user toggle) and
 * `state.subsystems.fades.opacityOf` (fade-out tail).  `draw` reads
 * `state.settings.filaments.intensity` (line brightness scale).
 *
 * ### Why between thumbnails and Milky Way
 *
 * The pre-D.2 inline order was points → thumbnails → filaments →
 * milky-way, and that order is preserved by `HDR_PASSES` in
 * `index.ts`.  Rationale: the filament skeleton is a *local-universe
 * overlay* threaded between the galaxies it was computed from, so
 * it belongs visually on top of the per-galaxy billboards +
 * thumbnails.  The Milky Way impostor at the world origin is a
 * *bright foreground feature*; drawing it last keeps its bulge from
 * being veiled by overlapping filament strands when the camera sits
 * inside the local supercluster.  Additive blending makes per-
 * fragment colour mathematically order-independent, so this is a
 * deterministic-encoder-record decision (HMR-stable, easy to reason
 * about), not a correctness one.
 */

import type { Pass } from '../../../../@types/engine/frame/Pass';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

/**
 * Empirically pleasant line halfwidth in screen-space pixels.  The
 * filament shader expands each segment to a screen-space quad of
 * `2 × FILAMENT_LINE_HALFWIDTH_PX` thickness.  1.5 → ~3-px-thick
 * lines, fine enough to feel like a wireframe, thick enough to read
 * against dense galaxy fields.
 */
const FILAMENT_LINE_HALFWIDTH_PX = 1.5;

export const filamentsPass: Pass = {
  name: 'filaments',

  // The renderer-presence check is part of the gate (not a guard
  // inside `draw`) so tests can assert the gate flips correctly
  // when the binary fails to load.  We have to look at deps via the
  // closure — `enabled` doesn't take `deps` directly because most
  // passes don't need it.  Workaround: read the live setting and
  // accept that the renderer check happens in `draw` (skipping
  // there is equivalent CPU cost).
  //
  // Update: the runtime `draw` short-circuits anyway via the
  // `filamentRenderer === null` early return; `enabled` returning
  // true with a null renderer is a self-correcting near-miss.
  enabled(state, _ctx, _settings) {
    // State boolean is the user's intent; opacityOf > 0 is the visual
    // state. We render whenever EITHER is true so a fade-out continues
    // drawing after the user toggles off (until opacity hits 0). The
    // toggle handler in engine.ts flips the setting AND fires fadeTo
    // synchronously; this gate is what keeps the pass alive through the
    // ~100 ms ramp.
    if (state.settings.filaments.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'filament' }, performance.now()) > 0;
  },

  draw(pass, ctx, state, _settings, deps) {
    // Renderer-null check lives here rather than in `enabled` because
    // `enabled` doesn't receive `deps`.  Keeping this as a defensive
    // early-return makes the `enabled === true → draw runs` invariant
    // robust against a future deps-bag change that adds the renderer
    // to a cached snapshot the gate could read.
    if (deps.filamentRenderer === null) return;

    // Hoist nowMs to a single call per draw — only one consumer here
    // (filaments is single-instance, not per-source), but the pattern
    // matches pointSpritesPass.ts so future readers can copy-paste.
    const nowMs = performance.now();
    const { vp, canvasSize } = ctx;
    deps.filamentRenderer.draw(
      pass,
      vp,
      [canvasSize.width, canvasSize.height],
      FILAMENT_LINE_HALFWIDTH_PX,
      state.settings.filaments.intensity,
      // Focus recession is applied HERE (on the drawn opacity), not on the
      // `enabled` gate above: recession ∈ [FILAMENT_RECESSION, 1] can never
      // zero the layer, so the gate keeps reading the pure toggle opacity.
      resolveLayerOpacity(state.subsystems.fades, { kind: 'filament' }, ctx.focusBlend, nowMs),
    );
  },
};
