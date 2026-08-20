/**
 * filamentsLayer — cosmic-web filament-skeleton overlay.
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
 *   2. `state.gpu.filamentRenderer !== null` — the binary is an optional
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
 * ### Position after Milky Way, before flow / volume
 *
 * Drawn after `milkyWayLayer` and before `flowFieldLayer` /
 * `volumeUpsampleLayer` in `CONTENT_LAYERS` (see that module's "Why
 * milky-way BEFORE filaments / scalar-volume?" section for the visual-
 * hierarchy rationale).  Additive blending makes per-fragment colour
 * mathematically order-independent, so this is a deterministic-
 * encoder-record decision (HMR-stable, easy to reason about), not a
 * correctness one.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { COSMO } from '../slabs';
import { resolveLayerOpacity } from '../../presentation/focusRecession';

/**
 * Empirically pleasant line halfwidth in screen-space pixels.  The
 * filament shader expands each segment to a screen-space quad of
 * `2 × FILAMENT_LINE_HALFWIDTH_PX` thickness.  1.5 → ~3-px-thick
 * lines, fine enough to feel like a wireframe, thick enough to read
 * against dense galaxy fields.
 */
const FILAMENT_LINE_HALFWIDTH_PX = 1.5;

/**
 * The two endpoints of the filament tint ramp (RGB), mixed per-fragment by local
 * density: `FILAMENT_BASE_TINT` the dim cool-purple tone at sparse tendrils,
 * `FILAMENT_HOT_TINT` the bright near-white violet at dense spines. The two have
 * similar luminance so the shift reads as colour temperature, not glare. This is
 * the one home for the layer's palette; the pass hands both to the renderer,
 * which packs them into the fragment shader's tint uniforms.
 */
const FILAMENT_BASE_TINT: Vec3 = [0.55, 0.45, 0.85];
const FILAMENT_HOT_TINT: Vec3 = [0.85, 0.75, 1.0];

export const filamentsLayer: ContentLayer = {
  name: 'filaments',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  // The renderer-presence check belongs in `draw` (see below), not here —
  // `ContentLayer.enabled` never receives the GPU handles (they live on
  // `state.gpu.*`, read directly by `draw`), so `enabled` reads the live
  // setting and accepts that a null renderer is checked at draw time.
  //
  // Update: the runtime `draw` short-circuits anyway via the
  // `filamentRenderer === null` early return; `enabled` returning
  // true with a null renderer is a self-correcting near-miss.
  enabled(state, ctx) {
    // State boolean is the user's intent; opacityOf > 0 is the visual
    // state. We render whenever EITHER is true so a fade-out continues
    // drawing after the user toggles off (until opacity hits 0). The
    // toggle handler in engine.ts flips the setting AND fires fadeTo
    // synchronously; this gate is what keeps the layer alive through the
    // ~100 ms ramp.
    if (state.settings.filaments.enabled) return true;
    return state.subsystems.fades.opacityOf({ kind: 'filament' }, ctx.nowMs) > 0;
  },

  draw(pass, view, ctx, state) {
    // Renderer-null check lives here rather than in `enabled` because
    // `enabled` doesn't receive the GPU handles.  Keeping this as a
    // defensive early-return makes the `enabled === true → draw runs`
    // invariant robust against a future `state.gpu` shape change.
    if (state.gpu.filamentRenderer === null) return;

    state.gpu.filamentRenderer.draw(
      pass,
      view.vp,
      view.viewportPx,
      FILAMENT_LINE_HALFWIDTH_PX,
      state.settings.filaments.intensity,
      // Focus recession is applied HERE (on the drawn opacity), not on the
      // `enabled` gate above: recession ∈ [FILAMENT_RECESSION, 1] can never
      // zero the layer, so the gate keeps reading the pure toggle opacity.
      resolveLayerOpacity(state, ctx, { kind: 'filament' }),
      FILAMENT_BASE_TINT,
      FILAMENT_HOT_TINT,
    );
  },
};
