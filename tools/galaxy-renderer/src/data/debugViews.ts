/**
 * DEBUG_VIEWS — the one place the four debug overlays are enumerated. Before
 * this they were listed independently in `debugGalaxyWeight`'s `Math.max`, in
 * `deriveFrameView`'s weight object, in `setRender`'s edge triggers and in
 * `drawFrame`'s pass gates, so a fifth view meant finding all four.
 *
 * A `Record` keyed by `DebugViewKind`, not an array: the compiler then
 * demands a row per kind. The `label`/`info` strings are here rather than in
 * DebugViewsSection so the panel can read them without a second copy — its
 * four view sliders are deliberately interleaved with five non-view ones, so
 * it cannot simply map this table.
 */

import type { DebugViewKind } from '../../@types/data/DebugViewKind';
import type { DebugViewSpec } from '../../@types/data/DebugViewSpec';

export const DEBUG_VIEWS: Readonly<Record<DebugViewKind, DebugViewSpec>> = {
  dust: {
    intensityKey: 'dustViewIntensity',
    label: 'Dust view',
    info: "Crossfades in the primary galaxy's dust-column map (a hot JWST/MIRI-ish palette) over the normal view. 0 is pure galaxy, 1 the map alone. Only has an effect while the analytic model pill is on.",
  },
  sfMap: {
    intensityKey: 'sfMapViewIntensity',
    label: 'SF map view',
    info: "Crossfades in the SSPSF automaton's log-polar output, same seam as the dust view. Step 1's only way to see the automaton — it feeds nothing else yet.",
  },
  orientation: {
    intensityKey: 'orientationViewIntensity',
    label: 'Orientation view',
    info: "Crossfades in the GPU structure-tensor pass chain's crest orientation (hue) and coherence (brightness), same seam again. Also gates the pass chain itself — it only (re-)dispatches while this is above 0.",
  },
  bubble: {
    intensityKey: 'bubbleViewIntensity',
    label: 'Bubble view',
    info: "Crossfades in the SF-event catalog's own bubble/cavity placements — a second, independent star-formation model nobody has ever seen, resolved from the same events the SSPSF automaton never reads. Amber shells are old relic bubbles, cyan shells are actively-swept HII cavities. The only way to compare this model against the SF map view above.",
  },
};

/**
 * The kinds, in declaration order. `Object.keys` widens to `string[]`, so the
 * assertion is unavoidable — it is sound because the Record above is total
 * over the union.
 */
export const DEBUG_VIEW_KINDS = Object.keys(DEBUG_VIEWS) as readonly DebugViewKind[];
