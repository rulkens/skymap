/**
 * focusRecession — the pure recession strand of the focus-fade interface.
 *
 * ### Compose, don't braid
 *
 * Every fadeable layer's final on-screen opacity is two independent
 * concerns multiplied together:
 *
 *   final = opacityOf(id)        // the toggle / load-in / tier-swap fade
 *         × focusRecession(id)   // how far this layer recedes under focus
 *
 * Those two strands have separate authoritative homes and must stay
 * separate. `opacityOf` lives in the FadeRegistry — its sole job is fade
 * *controllers* (load-in, tier swap, category on/off). The recession
 * factor lives HERE, as a stateless function of the id and the focus
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
 * galaxy catalog ("points") ids simply never get a recession target — the
 * separation is structural, not a defensive runtime guard.
 *
 * ### Recession membership is two exhaustive tables
 *
 * Recession is *selective*: structure / galaxy-name labels and the diffuse
 * filament/volume fields recede under focus, but the YOU-ARE-HERE pin and
 * the scale bar must not. Membership is constant per kind, so it lives in
 * data: one table keyed by `FadeId['kind']`, one by `LabelLayerId` (the
 * only kind whose sub-discriminator changes the answer), and a single
 * two-way branch to pick between them.
 *
 * `satisfies Record<K, number | undefined>` is what makes membership a
 * *choice* rather than an inheritance. A `Record` cannot be satisfied by
 * omission, so a new `FadeId` kind or a new `LabelLayerId` is a compile
 * error until someone writes its row — including the rows that say
 * `undefined`. A switch over `FadeId['kind']` could not promise that at
 * the outer level: this repo's tsconfig has no `noImplicitReturns`, so a
 * switch with no `default` arm gives no exhaustiveness guarantee at all —
 * a kind missing an arm falls through and returns `undefined` silently,
 * indistinguishable from a deliberate "does not recede". The table form
 * surfaces such a gap at build time instead of leaving it unstated.
 *
 * A predicate (`layer === 'structure' || layer === 'galaxy'`) reads more
 * compactly than the label-layer table but makes "does not recede" the
 * silent default for every layer added later — the stance a caption layer
 * would inherit without anyone choosing it. The table forces the choice.
 */

import type { FadeId } from '../../../@types/animation/FadeId';
import type { FadeRegistry } from '../../../@types/animation/FadeRegistry';
import type { LabelLayerId } from '../../../@types/animation/LabelLayerId';
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';
import { lerp } from '../../../utils/math/lerp';
import { fadeIdToVisibilityKey } from './fadeIdToVisibilityKey';

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
 * Recession target per label layer. `undefined` = does not recede.
 */
const RECESSION_BY_LABEL_LAYER = {
  // The COSMO name labels: structure labels (any item) and famous-galaxy
  // labels, which reuse the 'galaxy' id. These are the labels focus is meant
  // to quiet — they crowd the same slab as the focused subject.
  structure: LABEL_RECESSION,
  galaxy: LABEL_RECESSION,
  // The YOU-ARE-HERE pin: one label at the world origin, the anchor the focused
  // subject is read against. Receding it would dim the reference.
  milkyWay: undefined,
  // The scale bar is a readout, not scenery — it must stay legible at full focus.
  scaleBar: undefined,
  // The near-field caption layers draw on the NEAR0 slab through
  // `foregroundLabelsLayer`, which owns its OWN declutter (a screen-space
  // separation cull with priority tiers) and its own temporal envelope, and
  // never routes through `resolveLayerOpacity`. A recession factor here would
  // be a second, competing dimming authority over the same captions — and the
  // focus blend it keys on is driven at Mpc scales, where these pc-band
  // captions have already faded out. So they do not recede: the near field
  // declutters by its own mechanism.
  starCatalog: undefined,
  body: undefined,
} satisfies Record<LabelLayerId, number | undefined>;

/**
 * Recession target per `FadeId` kind, for the kinds with no sub-discriminator
 * that changes the answer. `undefined` = does not recede.
 */
const RECESSION_BY_KIND = {
  filament: FILAMENT_RECESSION,
  volumesMaster: VOLUME_RECESSION,
  structure: MARKER_RECESSION, // all structure sources recede
  galaxyCatalog: undefined,
  volumeField: undefined,
  milkyWay: undefined, // the MW disk does not recede on focus
  flow: undefined,
  constellations: undefined,
  orbitTrails: undefined, // near-field foreground trails never recede on focus
  overlay: undefined,
  zoneOfAvoidance: undefined, // a guide overlay, not scenery — stays put under focus
} satisfies Record<Exclude<FadeId['kind'], 'labelLayer'>, number | undefined>;

/**
 * The opacity this id recedes *to* at full focus, or `undefined` when
 * the id does not recede (factor stays 1.0 at every blend).
 *
 * Exhaustive over `FadeId['kind']` and over `LabelLayerId` through the two
 * tables' `satisfies Record<…>` constraints — a new union member is a compile
 * error until it declares its recession stance.
 */
export function recessionTargetFor(h: FadeId): number | undefined {
  return h.kind === 'labelLayer' ? RECESSION_BY_LABEL_LAYER[h.layer] : RECESSION_BY_KIND[h.kind];
}

/**
 * The recession factor for an id at the given focus `blend` (0 = no
 * focus, 1 = full focus). Lerps from 1.0 (unfocused) toward the id's
 * recession target; an untagged id has no target and stays at 1.0 for
 * every blend.
 */
export function focusRecession(h: FadeId, blend: number): number {
  return lerp(1, recessionTargetFor(h) ?? 1, blend);
}

/**
 * The clip-owned opacity factor for `h` at `now`, via `ClipPlayer.clipOpacityOf`.
 *
 * Maps the `FadeId` to its `VisibilityLayerKey` via `fadeIdToVisibilityKey`.
 * Returns 1 for unmapped ids (e.g. `overlay`) — no clip cue addresses them
 * via this bridge, so the factor is neutral. Kept as a tiny local so
 * `resolveLayerOpacity` stays a flat single expression rather than a nested
 * ternary or an inlined bridge call.
 */
function clipFactorFor(clip: ClipPlayer, h: FadeId, now: number): number {
  const key = fadeIdToVisibilityKey(h);
  return key === undefined ? 1 : clip.clipOpacityOf(key, now);
}

/**
 * Composition sugar for whole-layer consumers: the id's toggle opacity
 * times its recession factor times the clip-owned transient opacity.
 *
 * The optional `clip` arg adds a THIRD factor: when a cinematic clip is
 * playing it can independently dim a layer (e.g. fade to black, spotlight
 * one catalog). Callers that omit `clip` (or pass `undefined`) get factor
 * 1 by default — the clip channel is behaviour-neutral when no clip plays
 * and `ClipPlayer.clipOpacityOf` returns 1 for any untouched layer.
 *
 * Per-instance consumers (markers / labels with a focused-instance
 * exemption) take the three parts separately and combine them themselves.
 */
export function resolveLayerOpacity(
  fades: FadeRegistry,
  h: FadeId,
  blend: number,
  now: number,
  clip?: ClipPlayer,
): number {
  const clipFactor = clip === undefined ? 1 : clipFactorFor(clip, h, now);
  return fades.opacityOf(h, now) * focusRecession(h, blend) * clipFactor;
}
