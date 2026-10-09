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
import type { ClipPlayer } from '../../../@types/engine/subsystems/ClipPlayer';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { lerp } from '../../../utils/math/lerp';
import { fadeIdToVisibilityKey } from './fadeIdToVisibilityKey';

// The opacity each tagged layer settles to at full focus (blend = 1): markers and
// labels dim moderately; scenery behind the subject (filaments, the Local Bubble,
// the Milky Way glow, constellation figures) and the density volume recede harder.
// Eye-tuned.
export const SCENERY_RECESSION = 0.15;
const VOLUME_RECESSION = 0.15;
export const MARKER_RECESSION = 0.25;
export const LABEL_RECESSION = 0.25;

// `undefined` = does not recede.
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
  // The near-field caption layers never route through `resolveLayerOpacity`:
  // `composeForegroundCaption` reads this same table for them, so the rule
  // stays in one place. Focusing a parsec-scale structure drives the blend,
  // so they quiet like the COSMO labels.
  starCatalog: LABEL_RECESSION,
  body: LABEL_RECESSION,
  blackHoles: LABEL_RECESSION,
} satisfies Record<LabelLayerId, number | undefined>;

const RECESSION_BY_KIND = {
  cosmicWebFilaments: SCENERY_RECESSION,
  localBubble: SCENERY_RECESSION,
  cosmicWebDensity: VOLUME_RECESSION,
  structure: MARKER_RECESSION, // all structure sources recede
  galaxyCatalog: undefined,
  cosmicWebDensityField: undefined,
  milkyWay: SCENERY_RECESSION,
  flow: undefined,
  constellations: SCENERY_RECESSION, // lines and captions both read this row
  orbitTrails: undefined, // near-field foreground trails never recede on focus
  overlay: undefined,
  zoneOfAvoidance: undefined, // a guide overlay, not scenery — stays put under focus
  lightTime: undefined, // a guide, stays put under focus
} satisfies Record<Exclude<FadeId['kind'], 'labelLayer'>, number | undefined>;

function recessionTargetFor(h: FadeId): number | undefined {
  return h.kind === 'labelLayer' ? RECESSION_BY_LABEL_LAYER[h.layer] : RECESSION_BY_KIND[h.kind];
}

// `blend` is 0 = no focus, 1 = full focus; an untagged id stays at 1.0 throughout.
export function focusRecession(h: FadeId, blend: number): number {
  return lerp(1, recessionTargetFor(h) ?? 1, blend);
}

// Unmapped ids (e.g. `overlay`) get a neutral 1 — no clip cue addresses them.
function clipFactorFor(clip: ClipPlayer, h: FadeId, now: number): number {
  const key = fadeIdToVisibilityKey(h);
  return key === undefined ? 1 : clip.clipOpacityOf(key, now);
}

/**
 * The canonical whole-layer opacity: toggle × recession × clip-owned transient.
 * Per-instance consumers (markers / labels with a focused-instance exemption) take
 * the three parts separately and combine them themselves.
 */
export function resolveLayerOpacity(
  state: Pick<EngineState, 'subsystems'>,
  ctx: FrameView,
  h: FadeId,
): number {
  const { fades, clipPlayer } = state.subsystems;
  const { nowMs, focusBlend } = ctx.snapshot;
  return (
    fades.opacityOf(h, nowMs) * focusRecession(h, focusBlend) * clipFactorFor(clipPlayer, h, nowMs)
  );
}
