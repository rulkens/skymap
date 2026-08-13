/**
 * zoneOfAvoidanceUpsampleLayer — the CONSUMER half of the galactic-plane
 * dust-band guide overlay: composites the reduced-resolution `zoa` offscreen
 * (the band raymarch `zoneOfAvoidanceLayer` drew) additively into HDR, THEN
 * draws the curved "Zone of Avoidance" lettering full-res into that same HDR
 * pass.
 *
 * ### Why the lettering lives HERE, not in the producer
 *
 * The band is smooth low-frequency haze — exactly what a reduced-res
 * raymarch + 4-tap upsample reconstructs losslessly (gate-fix 6). MSDF text
 * is the opposite: sharp glyph edges that a 1/5-res target would blur past
 * legibility. So the two halves of the original single-renderer draw split
 * across the target boundary — the band rides the reduced-res `zoa` offscreen
 * via `zoneOfAvoidanceLayer`, the lettering draws straight into full-res HDR
 * here, after the band composites in (additive, so this is a listing choice,
 * not a compositing one — same note the pre-split layer carried).
 *
 * ### Why it reuses the shared additive-upsample factory
 *
 * `createAdditiveUpsample` is fully generic: a covering-triangle pipeline
 * that filters whatever view it is handed and adds it into an `rgba16float`
 * target. The band's `zoa` offscreen meets its contract (additively summed,
 * bandlimited) the same way the scalar-volume and Milky-Way aggregate
 * offscreens do. This layer draws through its OWN instance
 * (`state.gpu.zoneOfAvoidanceUpsample`), not the volume's or the Milky Way's
 * — sharing one would braid three independently-gated subsystems onto a
 * single resource (the volumeLiveness header documents the exact landmine).
 *
 * ### Why `enabled` shares the zone-of-avoidance liveness projection
 *
 * The producer (`zoneOfAvoidanceLayer`) writes the offscreen this layer
 * consumes; both gate on the SAME `deriveZoneOfAvoidanceLiveness(...) !==
 * null`, so they can never disagree and this layer can never composite (or
 * caption) an offscreen nobody wrote this frame. See
 * `zoneOfAvoidanceLiveness.ts`.
 */

import type { ContentLayer } from '../../../../@types/engine/frame/ContentLayer';
import { COSMO } from '../slabs';
import { deriveZoneOfAvoidanceLiveness } from '../zoneOfAvoidanceLiveness';

/**
 * Radius of the curved-lettering's galactic-plane circle, Mpc —
 * visual-checkpoint placeholder (Task 10). Lives here (not the producer)
 * because the lettering draw moved to this layer at gate-fix 6.
 */
const LABEL_RADIUS_MPC = 40;

export const zoneOfAvoidanceUpsampleLayer: ContentLayer = {
  name: 'zone-of-avoidance-upsample',
  slab: COSMO,
  target: 'hdr',
  blend: 'additive',

  enabled(state, ctx) {
    return deriveZoneOfAvoidanceLiveness(state, ctx) !== null;
  },

  draw(pass, view, ctx, state) {
    // Defensive null-check, same pattern as the sibling upsample layers: the
    // gate proved liveness, but a future gate reordering can't silently skip
    // it. Independent of the lettering guard below — either handle can be
    // null on its own (pre-bootstrap) without disabling the other.
    if (state.gpu.zoneOfAvoidanceUpsample !== null) {
      state.gpu.zoneOfAvoidanceUpsample.draw(pass, ctx.renderTargets.viewOf('zoa'));
    }

    if (state.gpu.zoneOfAvoidanceRenderer === null) return;
    const opacity = deriveZoneOfAvoidanceLiveness(state, ctx);
    if (opacity === null) return;
    // Same (target, slab) render step as the band composite above, so the
    // lettering lands in the SAME hdr accumulation this frame, full-res —
    // see the module header on why it can't ride the reduced-res 'zoa'
    // offscreen. Same band opacity — the lettering has no independent toggle
    // or fade factor.
    state.gpu.zoneOfAvoidanceRenderer.drawLabels(
      pass,
      view.vp,
      view.viewportPx,
      state.settings.zoneOfAvoidance,
      LABEL_RADIUS_MPC,
      opacity,
    );
  },
};
