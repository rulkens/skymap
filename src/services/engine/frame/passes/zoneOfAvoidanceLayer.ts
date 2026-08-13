/**
 * zoneOfAvoidanceLayer — the PRODUCER half of the galactic-plane dust-band
 * guide overlay: the ray-marched band, drawn into the reduced-resolution
 * `zoa` offscreen (gate-fix 6 — a fullscreen 32-step raymarch at full res
 * was "pretty horrendous" per the visual gate). The twin consumer,
 * `zoneOfAvoidanceUpsampleLayer`, composites this offscreen into HDR and
 * draws the band's curved lettering full-res — see that file for why the
 * text can't ride this reduced-res target. See `zoneOfAvoidanceRenderer.ts`
 * for the ray-marched-shell technique (same family as `horizonShellLayer`).
 *
 * ### When it draws
 *
 * `deriveZoneOfAvoidanceLiveness` (Task 7, folded into a shared liveness
 * derivation at gate-fix 6) composes THREE factors: the Milky-Way-scaled
 * camera-distance approach band (`SCALE_FADE_BANDS.zoneOfAvoidance`) times
 * the Local-Group-scaled recede band (`SCALE_FADE_BANDS.zoneOfAvoidanceRecede`
 * — the visibility WINDOW, gate-fix 7) times the fade-registry toggle opacity
 * (`state.settings.zoneOfAvoidance.enabled`, seeded via the
 * `{ kind: 'zoneOfAvoidance' }` `FadeId`) — see that module's header for the
 * full derivation and the landmine it closes (producer/consumer gates that
 * could disagree about which offscreen has live content this frame).
 *
 * `enabled` does NOT also check `state.gpu.zoneOfAvoidanceRenderer` — same
 * choice `filamentsLayer`/`horizonShellLayer` make (`ContentLayer.enabled`
 * COULD read `state.gpu.*`, but the incumbent convention leaves the
 * renderer-presence guard solely in `draw`'s own `=== null` early return).
 * One convention beats a belt-and-suspenders check in `enabled` too: a
 * null-renderer frame (only possible pre-`initGpu`) still reports
 * `enabled → true` and `draw` self-corrects into a no-op, exactly the
 * "self-correcting near-miss" `filamentsLayer` documents.
 *
 * ### Why the downscaled viewport (not the canvas viewport)
 *
 * `zoneOfAvoidanceRenderer.draw` takes `viewport` only to compute the
 * shell's `aspect` uniform (`viewport[0] / viewport[1]`) — its per-fragment
 * dither hash reads `@builtin(position)` directly, so it needs no viewport
 * threaded for frequency (unlike the volume raymarch's dither). The `zoa`
 * target is `1 / scale` of the canvas (the `'zoa'` row's `scale` in the
 * render-target table), and since both width and height divide by the SAME
 * scale the aspect ratio survives the floor-rounding — mirrors
 * `scalarVolumeLayer`'s downscaled-viewport computation, reading the
 * divisor off the spec row so it stays single-homed with the table.
 *
 * ### Placeholder shape constants
 *
 * `innerRadiusMpc` / `outerRadiusMpc` / `bulgeDeg` / `anticenterDeg` below
 * are visual-pass placeholders — Task 9's checkpoint tunes them; Task 13's
 * DebugPanel section is where they eventually become dials, if they need to
 * (the tuning cluster's other four fields already are).
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

/** Shell inner radius, Mpc — visual-checkpoint placeholder (Task 9). */
const INNER_RADIUS_MPC = 3;
/** Shell outer radius, Mpc — visual-checkpoint placeholder (Task 9). */
const OUTER_RADIUS_MPC = 380;
/** Latitude half-width toward the galactic bulge (l=0), degrees — visual-checkpoint placeholder, narrowed at the gate-fix pass (was 15). */
const BULGE_DEG = 10;
/** Latitude half-width toward the galactic anticenter (l=π), degrees — visual-checkpoint placeholder, narrowed at the gate-fix pass (was 5). */
const ANTICENTER_DEG = 3;

export const zoneOfAvoidanceLayer: ContentLayer = {
  name: 'zone-of-avoidance',
  slab: COSMO,
  target: 'zoa',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },

  // `view` is unused: the renderer's `draw` takes the raw `OrbitCamera`
  // (`ctx.cam`) and the manually-downscaled viewport below, not the resolved
  // SlabView's (full-canvas) `vp`/`viewportPx`.
  draw(pass, _view, ctx, state) {
    if (state.gpu.zoneOfAvoidanceRenderer === null) return;
    // Defensive re-derivation, mirroring scalarVolumeLayer: `enabled` already
    // proved liveness, but re-deriving keeps this a pure function of
    // (state, ctx) with no reliance on gate ordering.
    const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
    if (opacity === null) return;

    // Viewport matches the 'zoa' target's texture size — see the module
    // header on why the aspect ratio survives the downscale. Reading the
    // divisor off the spec row keeps it single-homed.
    const scale = ctx.renderTargets.specs.find((s) => s.id === 'zoa')!.scale;
    const vw = Math.max(1, Math.floor(ctx.canvasSize.width / scale));
    const vh = Math.max(1, Math.floor(ctx.canvasSize.height / scale));

    state.gpu.zoneOfAvoidanceRenderer.draw(
      pass,
      ctx.cam,
      [vw, vh],
      state.settings.zoneOfAvoidance,
      INNER_RADIUS_MPC,
      OUTER_RADIUS_MPC,
      BULGE_DEG,
      ANTICENTER_DEG,
      opacity,
    );
  },
};
