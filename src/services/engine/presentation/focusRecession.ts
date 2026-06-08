/**
 * focusRecession — the pure recession strand of the focus-fade interface.
 *
 * ### Compose, don't braid
 *
 * Every fadeable layer's final on-screen opacity is two independent
 * concerns multiplied together:
 *
 *   final = opacityOf(handle)        // the toggle / load-in / tier-swap fade
 *         × focusRecession(handle)   // how far this layer recedes under focus
 *
 * Those two strands have separate authoritative homes and must stay
 * separate. `opacityOf` lives in the FadeRegistry — its sole job is fade
 * *controllers* (load-in, tier swap, category on/off). The recession
 * factor lives HERE, as a stateless function of the handle and the focus
 * `blend`. We deliberately do NOT fold recession into the registry
 * (no `setFocusBlend`, no `toggle × recession` baked into `opacityOf`):
 * the blend's authoritative home is `structureFocusSubsystem`
 * (`FocusUniformsValue.blend`), and caching it in the registry would be a
 * value×place mirror (the stale-mirror bug class). Toggle fade and focus
 * recession vary independently, so they are *composed* at the consumer,
 * never braided into one stateful place.
 *
 * Orthogonality also makes the composition correct: recession multiplies
 * *on top of* the toggle fade. A layer toggled off (0) stays off
 * (`0 × anything = 0`); a half-faded layer recedes from where it is. And
 * survey ("points") handles simply never get a recession target — the
 * separation is structural, not a defensive runtime guard.
 *
 * ### Recession membership is an exhaustive switch
 *
 * Recession is *selective*: POI / galaxy-name labels and the diffuse
 * filament/volume fields recede under focus, but the YOU-ARE-HERE pin and
 * the scale bar must not. `recessionTargetFor` expresses that membership
 * as an exhaustive `switch (h.kind)` with NO `default` arm — every union
 * kind is handled explicitly (non-recessing kinds `return undefined`).
 * Mirroring `serializeFadeHandle`'s exhaustiveness discipline, a NEW
 * union kind then becomes a compile error until it declares its recession
 * stance, rather than silently falling through a catch-all.
 *
 * A function beats a flat string-keyed table here because some kinds
 * recede across *all* their discriminator values (`markerLayer` for every
 * category) while others recede for *some* (`labelLayer` for
 * `structure`/`galaxyNames` only). The switch says exactly that without
 * repetition.
 */

import type { FadeHandle } from '../../../@types/animation/FadeHandle';
import type { FadeRegistry } from '../../../@types/animation/FadeRegistry';
import { lerp } from '../../../utils/math/lerp';

// Per-layer recession targets — the opacity each tagged layer settles to
// at full focus (blend = 1). Markers/labels dim moderately; the large
// diffuse filament/volume fields recede harder.
//
// TUNED VISUALLY ON THE DEV SERVER, not final. These are placeholders;
// the real values come from eyeballing the focus animation live.
export const FILAMENT_RECESSION = 0.15;
export const VOLUME_RECESSION = 0.15;
export const MARKER_RECESSION = 0.25;
export const LABEL_RECESSION = 0.25;

/**
 * The opacity this handle recedes *to* at full focus, or `undefined` when
 * the handle does not recede (factor stays 1.0 at every blend).
 *
 * Exhaustive over `FadeHandle['kind']` with no `default` arm — a new
 * union kind must add a case here (a compile error otherwise).
 */
export function recessionTargetFor(h: FadeHandle): number | undefined {
  switch (h.kind) {
    case 'filaments':
      return FILAMENT_RECESSION;
    case 'volumesMaster':
      return VOLUME_RECESSION;
    case 'markerLayer':
      return MARKER_RECESSION; // all categories recede
    case 'labelLayer':
      // Structure labels (any category) and famous-galaxy labels recede;
      // famous labels reuse the 'galaxyNames' handle. The YOU-ARE-HERE
      // pin ('youAreHere') and scale bar ('scaleBar') do not.
      return h.layer === 'structure' || h.layer === 'galaxyNames' ? LABEL_RECESSION : undefined;
    // Non-recessing kinds — explicit so a new union member can't silently
    // skip declaring its stance.
    case 'survey':
      return undefined;
    case 'scalarField':
      return undefined;
    case 'overlay':
      return undefined;
  }
}

/**
 * The recession factor for a handle at the given focus `blend` (0 = no
 * focus, 1 = full focus). Lerps from 1.0 (unfocused) toward the handle's
 * recession target; an untagged handle has no target and stays at 1.0 for
 * every blend.
 */
export function focusRecession(h: FadeHandle, blend: number): number {
  return lerp(1, recessionTargetFor(h) ?? 1, blend);
}

/**
 * Composition sugar for whole-layer consumers: the handle's toggle opacity
 * times its recession factor. Per-instance consumers (markers / labels
 * with a focused-instance exemption) take the two parts separately and
 * combine them themselves.
 */
export function resolveLayerOpacity(
  fades: FadeRegistry,
  h: FadeHandle,
  blend: number,
  now: number,
): number {
  return fades.opacityOf(h, now) * focusRecession(h, blend);
}
