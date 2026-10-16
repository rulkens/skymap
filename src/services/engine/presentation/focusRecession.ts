/**
 * focusRecession — the pure recession strand of the focus-fade interface.
 *
 * NOT folded into FadeRegistry (no `setFocusBlend`): the blend's home is
 * `structureFocusSubsystem`; caching it here is the stale-mirror bug class.
 * Membership is `satisfies Record<K, number | undefined>`, not a `switch` —
 * this tsconfig lacks `noImplicitReturns`, so a default-less switch has no
 * exhaustiveness guarantee; the table forces every kind to state its stance.
 * Raw-vs-canonical `opacityOf` rule: decision #18, docs/research/engine/decisions.md.
 */

import type { FadeId } from '../../../@types/animation/FadeId';
import type { LabelLayerId } from '../../../@types/animation/LabelLayerId';
import { lerp } from '../../../utils/math/lerp';

// The opacity a tagged layer settles to at full focus (blend = 1). Two strengths,
// named for the strength and not for a layer, since unrelated layers share each.
// Eye-tuned.
export const STRONG_RECESSION = 0.15;
export const MILD_RECESSION = 0.25;

// `undefined` = does not recede.
const RECESSION_BY_LABEL_LAYER = {
  // The COSMO name labels: structure labels (any item) and famous-galaxy
  // labels, which reuse the 'galaxy' id. These are the labels focus is meant
  // to quiet — they crowd the same slab as the focused subject.
  structure: MILD_RECESSION,
  galaxy: MILD_RECESSION,
  // The YOU-ARE-HERE pin: one label at the world origin, the anchor the focused
  // subject is read against. Receding it would dim the reference.
  milkyWay: undefined,
  // The scale bar is a readout, not scenery — it must stay legible at full focus.
  scaleBar: undefined,
  // The near-field caption layers never route through `resolveLayerOpacity`:
  // `composeForegroundCaption` reads this same table for them, so the rule
  // stays in one place. Focusing a parsec-scale structure drives the blend,
  // so they quiet like the COSMO labels.
  starCatalog: MILD_RECESSION,
  body: MILD_RECESSION,
  blackHoles: MILD_RECESSION,
} satisfies Record<LabelLayerId, number | undefined>;

const RECESSION_BY_KIND = {
  cosmicWebFilaments: STRONG_RECESSION,
  localBubble: STRONG_RECESSION,
  cosmicWebDensity: STRONG_RECESSION,
  structure: MILD_RECESSION, // all structure sources recede
  galaxyCatalog: undefined,
  cosmicWebDensityField: undefined,
  milkyWay: STRONG_RECESSION,
  flow: undefined,
  constellations: STRONG_RECESSION, // lines and captions both read this row
  orbitTrails: undefined, // near-field foreground trails never recede on focus
  missionTrails: undefined,
  overlay: undefined,
  zoneOfAvoidance: undefined, // a guide overlay, not scenery — stays put under focus
  lightTime: undefined, // a guide, stays put under focus
} satisfies Record<Exclude<FadeId['kind'], 'labelLayer'>, number | undefined>;

function recessionTargetFor(h: FadeId): number | undefined {
  return h.kind === 'labelLayer' ? RECESSION_BY_LABEL_LAYER[h.layer] : RECESSION_BY_KIND[h.kind];
}

const RECESSION_BY_STRENGTH = { strong: STRONG_RECESSION, mild: MILD_RECESSION } as const;

// A visibility entry's recession: the same lerp, keyed by the entry's declared strength.
export function recessionFactor(strength: 'strong' | 'mild' | undefined, blend: number): number {
  return strength === undefined ? 1 : lerp(1, RECESSION_BY_STRENGTH[strength], blend);
}

// `blend` is 0 = no focus, 1 = full focus; an untagged id stays at 1.0 throughout.
export function focusRecession(h: FadeId, blend: number): number {
  return lerp(1, recessionTargetFor(h) ?? 1, blend);
}
