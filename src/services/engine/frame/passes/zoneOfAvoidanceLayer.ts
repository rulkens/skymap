/**
 * zoneOfAvoidanceLayer — galactic-plane dust-band guide overlay.
 *
 * ### What it draws
 *
 * A translucent additive shell between two placeholder radii, masked to the
 * longitude-dependent galactic-latitude wedge (`zoneOfAvoidanceBLimitDeg`'s
 * shape, ported to WGSL in `zoneOfAvoidance/fragment.wesl`) — the visual
 * explainer for why the real catalogs thin out near the galactic plane
 * (dust extinction). See `zoneOfAvoidanceRenderer.ts` for the ray-marched-
 * shell technique (same family as `horizonShellLayer`).
 *
 * ### When it draws
 *
 * `zoneOfAvoidanceLayerOpacity` (Task 7) composes TWO factors: the
 * Local-Group-framing camera-distance band (`SCALE_FADE_BANDS.zoneOfAvoidance`
 * — gone within 0.3 Mpc of Earth, full by 8 Mpc) times the fade-registry
 * toggle opacity (`state.settings.zoneOfAvoidance.enabled`, seeded via the
 * `{ kind: 'zoneOfAvoidance' }` `FadeId`). Both `enabled` and `draw`
 * recompute this from the frame-frozen camera distance so a fade-out
 * continues drawing after the toggle flips off until opacity hits 0 —
 * mirroring `filamentsLayer`'s settings-toggle + fade-registry-opacity
 * shape, composed through the Task 7 helper rather than
 * `horizonShellLayer`'s bespoke camera-distance-only function (which has no
 * settings toggle to fold in).
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
 * ### Placeholder shape constants
 *
 * `innerRadiusMpc` / `outerRadiusMpc` / `bulgeDeg` / `anticenterDeg` below
 * are visual-pass placeholders — Task 9's checkpoint tunes them; Task 13's
 * DebugPanel section is where they eventually become dials, if they need to
 * (the tuning cluster's other four fields already are). `LABEL_RADIUS_MPC`
 * (Task 10) is the same kind of placeholder for the curved lettering's fixed
 * radius — see `zoneOfAvoidanceRenderer.ts`'s header for how it and
 * `LABEL_EM_MPC` jointly set the text's on-screen size.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { resolveLayerOpacity } from '../../presentation/focusRecession';
import { zoneOfAvoidanceLayerOpacity } from '../../presentation/zoneOfAvoidanceLayerOpacity';

/** Shell inner radius, Mpc — visual-checkpoint placeholder (Task 9). */
const INNER_RADIUS_MPC = 3;
/** Shell outer radius, Mpc — visual-checkpoint placeholder (Task 9). */
const OUTER_RADIUS_MPC = 380;
/** Latitude half-width toward the galactic bulge (l=0), degrees — visual-checkpoint placeholder (Task 9). */
const BULGE_DEG = 15;
/** Latitude half-width toward the galactic anticenter (l=π), degrees — visual-checkpoint placeholder (Task 9). */
const ANTICENTER_DEG = 5;
/** Radius of the curved-lettering's galactic-plane circle, Mpc — visual-checkpoint placeholder (Task 10). */
const LABEL_RADIUS_MPC = 40;

export const zoneOfAvoidanceLayer: ContentLayer = {
  name: 'zone-of-avoidance',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    const camDistMpc = Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]);
    const bandOpacity = zoneOfAvoidanceLayerOpacity(
      camDistMpc,
      resolveLayerOpacity(
        state.subsystems.fades,
        { kind: 'zoneOfAvoidance' },
        ctx.focusBlend,
        ctx.nowMs,
        state.subsystems.clipPlayer,
      ),
    );
    const labelOpacity = zoneOfAvoidanceLayerOpacity(
      camDistMpc,
      resolveLayerOpacity(
        state.subsystems.fades,
        { kind: 'labelLayer', layer: 'zoneOfAvoidance' },
        ctx.focusBlend,
        ctx.nowMs,
        state.subsystems.clipPlayer,
      ),
    );
    // OR, not AND: the band and its lettering toggle independently (see the
    // module header), so this layer must still run a frame where only ONE
    // of the two has non-zero opacity — e.g. the band toggled off but its
    // label toggled on.
    return bandOpacity > 0 || labelOpacity > 0;
  },

  draw(pass, view, ctx, state) {
    if (state.gpu.zoneOfAvoidanceRenderer === null) return;

    const camDistMpc = Math.hypot(view.camPos[0], view.camPos[1], view.camPos[2]);
    const opacity = zoneOfAvoidanceLayerOpacity(
      camDistMpc,
      resolveLayerOpacity(
        state.subsystems.fades,
        { kind: 'zoneOfAvoidance' },
        ctx.focusBlend,
        ctx.nowMs,
        state.subsystems.clipPlayer,
      ),
    );
    const labelOpacity = zoneOfAvoidanceLayerOpacity(
      camDistMpc,
      resolveLayerOpacity(
        state.subsystems.fades,
        { kind: 'labelLayer', layer: 'zoneOfAvoidance' },
        ctx.focusBlend,
        ctx.nowMs,
        state.subsystems.clipPlayer,
      ),
    );

    state.gpu.zoneOfAvoidanceRenderer.draw(
      pass,
      ctx.cam,
      view.viewportPx,
      state.settings.zoneOfAvoidance,
      INNER_RADIUS_MPC,
      OUTER_RADIUS_MPC,
      BULGE_DEG,
      ANTICENTER_DEG,
      opacity,
    );
    // Same (target, slab) render step as the band draw above, so the
    // lettering composites into the SAME hdr accumulation this frame —
    // order here just decides which glyph pixels sum in first (additive,
    // so it's a listing choice, not a compositing one).
    state.gpu.zoneOfAvoidanceRenderer.drawLabels(
      pass,
      view.vp,
      view.viewportPx,
      LABEL_RADIUS_MPC,
      labelOpacity,
    );
  },
};
