/**
 * debugViewWeights — every debug view's crossfade weight, read out of the
 * render bag through `DEBUG_VIEWS`. One place turns settings keys into view
 * kinds; every consumer downstream (the uniform pack, the galaxy dimming, the
 * per-pass gates) speaks kinds and can no longer disagree about which views
 * exist.
 */
import type { DebugViewKind } from '../../../../../src/@types/galaxy/DebugViewKind';
import type { DebugViewWeights } from '../../../../../src/@types/galaxy/DebugViewWeights';
import type { RenderSettings } from '../../../@types/engine/RenderSettings';
import { DEBUG_VIEWS, DEBUG_VIEW_KINDS } from '../../data/debugViews';

export function debugViewWeights(render: RenderSettings): DebugViewWeights {
  // Accumulated as a Partial and asserted at the end: a loop cannot prove
  // totality to the compiler, but `DEBUG_VIEWS` is total over the union.
  const weights: Partial<Record<DebugViewKind, number>> = {};
  for (const kind of DEBUG_VIEW_KINDS) weights[kind] = render[DEBUG_VIEWS[kind].intensityKey];
  return weights as DebugViewWeights;
}
