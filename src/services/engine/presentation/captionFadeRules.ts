/**
 * captionFadeRules — per-caption-kind fade routing for the foreground scene-body
 * captions, AS DATA. Sibling of `captionPriority` (which answers "who wins a
 * collision"): this table answers "should this caption be visible, and how
 * hard". Four facts hang off a caption's `kind` and always move together, so
 * they live as one row rather than parallel dispatches scattered through
 * `foregroundLabelsLayer.draw`:
 *
 *   1. `labelEnabled` — the caption axis of the kind's own settings row
 *      (muting is per-row, not one cross-cutting bag).
 *   2. `subjectVisible` — the kind's separate VISIBILITY axis, so a caption
 *      never outlives the dot it names; `UNGATED` when there is none.
 *   3. `fadeTarget` — the distance band the caption rides once both gates
 *      are open, so its name eases in rather than popping at a threshold.
 *   4. `fadeHandle` — the fade-registry id this kind's opacity ramps through
 *      on a Labels toggle. `null` states "this kind composes its own
 *      registry read elsewhere" rather than leaving the row silent.
 *
 * `Record<CaptionKind, …>` makes the table compiler-complete: a new
 * `CaptionKind` fails the build until it gets a row. An annotation rather
 * than `as const satisfies`, because the const form would pin each row's
 * INFERRED arity and reject a caller passing both `fadeTarget` arguments to
 * a row that only reads `distanceMpc`.
 *
 * The rows are pure functions of an explicit settings bag — nothing here
 * closes over a frame's locals — so the table is a module-level constant
 * the per-label loop indexes without allocating.
 */

import type { CaptionKind } from './captionPriority';
import type { EngineSettingsState } from '../../../@types/settings/EngineSettingsState';
import type { FadeId } from '../../../@types/animation/FadeId';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SGR_A_STAR_ENTRY } from '../../../data/sources/sgr-a-star';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../frame/solarSystemLabelMaxDistance';

/**
 * One caption kind's fade routing. `distanceMpc` is the caption anchor's
 * distance from the camera — for the Sun that IS the camera's distance from the
 * heliocentric origin, which is exactly what its band keys on. `camDistMpc` is
 * the camera's own orbit distance, the quantity the layer gate reads; only the
 * kinds whose REACH is the solar system's consult it (see `SOLAR_SYSTEM_REACH`).
 */
export type CaptionFadeRule = {
  readonly labelEnabled: (settings: EngineSettingsState) => boolean;
  readonly subjectVisible: (settings: EngineSettingsState) => boolean;
  readonly fadeTarget: (distanceMpc: number, camDistMpc: number) => number;
  /** Required, not optional: a new CaptionKind must STATE its stance. */
  readonly fadeHandle: FadeId | null;
};

/** An axis a kind doesn't carry: the gate is permanently open. */
const UNGATED = (): boolean => true;

/**
 * On inside the solar system's caption range, off outside it — per-kind
 * because the Galactic Centre's reach is not the solar neighbourhood's: its
 * name has to survive out past the disc while Earth's and the planets' must
 * not, and a layer-wide gate can express only one reach.
 */
const SOLAR_SYSTEM_REACH = (_distanceMpc: number, camDistMpc: number): number =>
  camDistMpc < SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC ? 1 : 0;

/**
 * The caption's target is supplied by its PRODUCER, not by this table: it is a
 * function of something other than the anchor distance every other row keys on,
 * so there is no honest band to write here. Returns 0 rather than borrowing a
 * neighbouring kind's band — silence beats a plausible-looking wrong pace.
 */
const PRODUCER_SUPPLIED = (): number => 0;

export const CAPTION_FADE_RULES: Readonly<Record<CaptionKind, CaptionFadeRule>> = {
  /**
   * The descent's aim point. Its own body row governs the name, so muting the
   * curated neighbourhood leaves the Sun captioning; `bodies.items.sun.enabled`
   * is the same flag `visibleStars` reads to hide the Sun's dot (unwritable
   * today — no setter exists — but reachable via a snapshot restore, so the
   * caption consults it rather than assuming it is always true). The band makes
   * the name fade IN smoothly on the way down: exactly 0 at the layer's enable
   * gate (no pop) up to full alpha by half that distance.
   */
  sun: {
    labelEnabled: (settings) => settings.bodies.items.sun.labelEnabled,
    subjectVisible: (settings) => settings.bodies.items.sun.enabled,
    fadeTarget: (distanceMpc) => fadeBand(SCALE_FADE_BANDS.sunCaption, distanceMpc),
    fadeHandle: { kind: 'labelLayer', layer: 'body', item: 'sun' },
  },

  /** Inside the caption range Earth is simply on — no band, no visibility axis. */
  earth: {
    labelEnabled: (settings) => settings.bodies.items.earth.labelEnabled,
    subjectVisible: UNGATED,
    fadeTarget: SOLAR_SYSTEM_REACH,
    fadeHandle: { kind: 'labelLayer', layer: 'body', item: 'earth' },
  },

  /**
   * The Moon rides the 'planet' kind, so it follows this row. Like Earth: on
   * inside the caption range.
   */
  planet: {
    labelEnabled: (settings) => settings.bodies.items.planet.labelEnabled,
    subjectVisible: UNGATED,
    fadeTarget: SOLAR_SYSTEM_REACH,
    fadeHandle: { kind: 'labelLayer', layer: 'body', item: 'planet' },
  },

  /**
   * The curated local star map. The visibility axis is BOTH levels, exactly as
   * `visibleStars` composes them — a caption must not survive the cluster master
   * that hid the dot it names. The band is a LOCAL STAR MAP rather than
   * per-body approach labels: full alpha inside the stellar neighbourhood (the
   * whole map reads from Earth), gone beyond it. It keys on PARSECS, hence the
   * named unit conversion.
   */
  star: {
    labelEnabled: (settings) => settings.starCatalogs.items.famousStar.labelEnabled,
    subjectVisible: (settings) =>
      settings.starCatalogs.enabled && settings.starCatalogs.items.famousStar.enabled,
    fadeTarget: (distanceMpc) =>
      fadeBand(SCALE_FADE_BANDS.starCaption, distanceMpc / SCALE_UNITS.PC_TO_MPC),
    fadeHandle: { kind: 'labelLayer', layer: 'starCatalog', item: 'famousStar' },
  },

  /**
   * The Galactic Centre's aim point. Its own body row governs the name — riding
   * the `star` row above would hide it whenever the famous-star catalog is
   * muted, and would key its band on a 2.3 kpc star map it sits 8 kpc outside.
   * No visibility axis: it draws nothing, so there is no dot the caption could
   * outlive (`bodies.items['sgr-a-star'].enabled` gates nothing — see that
   * registry row).
   *
   * It does NOT take Earth's and the planets' `SOLAR_SYSTEM_REACH` row: this is
   * the one caption that must survive OUTSIDE the solar system's range, since
   * the thing it names is 8 kpc away and the view that most needs it is the
   * one framing the whole galaxy.
   */
  sgrAStar: {
    labelEnabled: (settings) => settings.bodies.items[SGR_A_STAR_ENTRY.id].labelEnabled,
    subjectVisible: UNGATED,
    fadeTarget: (distanceMpc) => fadeBand(SCALE_FADE_BANDS.sgrAStarCaption, distanceMpc),
    fadeHandle: { kind: 'labelLayer', layer: 'body', item: SGR_A_STAR_ENTRY.id },
  },

  /**
   * The stick-figure names. They never reach the body-caption pipeline this
   * table drives — `sceneBodyLabels` emits only the body kinds above, and
   * `constellationCaptions` appends the figure names further down with their own
   * per-frame target (`constellationLayerOpacity`: the layer's distance band ×
   * the fade-registry toggle, keyed on the camera's origin distance, not on an
   * anchor distance). They carry no per-source caption toggle either — the one
   * `constellations.enabled` switch governs lines and names together through
   * that fade registry — so both gates are open and the target is the
   * producer's. The row exists so the table stays total over the kind union;
   * leaving the kind implicit would let it silently inherit the star map's
   * parsec band and the star map's visibility toggle. `fadeHandle` is `null`
   * for the same reason: `produceConstellationCaptions` already folds
   * `resolveLayerOpacity({kind:'constellations'})` into its own target, and a
   * second registry read here would double-count it.
   */
  constellation: {
    labelEnabled: UNGATED,
    subjectVisible: UNGATED,
    fadeTarget: PRODUCER_SUPPLIED,
    fadeHandle: null,
  },
};
