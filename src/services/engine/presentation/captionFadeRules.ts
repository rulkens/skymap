/**
 * captionFadeRules — per-caption-kind fade routing for the foreground scene-body
 * captions, AS DATA. Sibling of `captionPriority` (which answers "who wins a
 * collision"): this table answers "how hard should this caption show" from where
 * it is. `fadeTarget` is the distance band the caption rides, so its name eases in
 * rather than popping at a threshold. Which label item switches a caption is its
 * producer's own data, never this table's.
 *
 * `Record<CaptionKind, …>` makes the table compiler-complete: a new
 * `CaptionKind` fails the build until it gets a row. An annotation rather
 * than `as const satisfies`, because the const form would pin each row's
 * INFERRED arity and reject a caller passing both `fadeTarget` arguments to
 * a row that only reads `distanceMpc`.
 *
 * The rows are pure functions of their arguments — nothing here closes over a
 * frame's locals — so the table is a module-level constant the per-label loop
 * indexes without allocating.
 */

import type { CaptionKind } from './captionPriority';
import { fadeBand } from '../../../utils/math/fadeBand';
import { SCALE_FADE_BANDS } from './scaleFadeBands';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { SOLAR_SYSTEM_LABEL_MAX_DISTANCE_MPC } from '../../../data/labels/solarSystemLabelMaxDistance';

/**
 * One caption kind's fade routing. `distanceMpc` is the caption anchor's
 * distance from the camera — for the Sun that IS the camera's distance from the
 * heliocentric origin, which is exactly what its band keys on. `camDistMpc` is
 * the camera's own orbit distance, the quantity the layer gate reads; only the
 * kinds whose REACH is the solar system's consult it (see `SOLAR_SYSTEM_REACH`).
 */
export type CaptionFadeRule = {
  readonly fadeTarget: (distanceMpc: number, camDistMpc: number) => number;
};

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
   * The descent's aim point. The band makes the name
   * fade IN smoothly on the way down: exactly 0 at the layer's enable gate (no
   * pop) up to full alpha by half that distance.
   */
  sun: {
    fadeTarget: (distanceMpc) => fadeBand(SCALE_FADE_BANDS.sunCaption, distanceMpc),
  },

  /** Inside the caption range Earth is simply on — no band. */
  earth: { fadeTarget: SOLAR_SYSTEM_REACH },

  /**
   * The Moon rides the 'planet' kind, so it follows this row. Like Earth: on
   * inside the caption range.
   */
  planet: { fadeTarget: SOLAR_SYSTEM_REACH },

  /**
   * The curated local star map. The band is a LOCAL STAR MAP rather than
   * per-body approach labels: full alpha inside the stellar neighbourhood (the
   * whole map reads from Earth), gone beyond it. It keys on PARSECS, hence the
   * named unit conversion.
   */
  star: {
    fadeTarget: (distanceMpc) =>
      fadeBand(SCALE_FADE_BANDS.starCaption, distanceMpc / SCALE_UNITS.PC_TO_MPC),
  },

  /**
   * The Galactic Centre's name: riding the `star` row above would key its band
   * on a 2.3 kpc star map it sits 8 kpc outside. Only its scale band gates it.
   *
   * It does NOT take Earth's and the planets' `SOLAR_SYSTEM_REACH` row: this is
   * the one caption that must survive OUTSIDE the solar system's range, since
   * the thing it names is 8 kpc away and the view that most needs it is the
   * one framing the whole galaxy.
   */
  sgrAStar: {
    fadeTarget: (distanceMpc) => fadeBand(SCALE_FADE_BANDS.sgrAStarCaption, distanceMpc),
  },

  /**
   * The whale and the petunias. They ride the planets' presentation partition
   * and sit in Earth orbit, so they take the planets' row wholesale — same
   * reach. Both bodies share the one registry row, hence one shared caption
   * toggle.
   */
  meshBody: { fadeTarget: SOLAR_SYSTEM_REACH },

  /**
   * The stick-figure names. They never reach the body-caption pipeline this
   * table drives — `sceneBodyLabels` emits only the body kinds above, and
   * `constellationCaptions` appends the figure names further down with their own
   * per-frame target (`constellationsBand` × the handed `label:constellations`
   * value, keyed on the camera's origin distance, not on an anchor distance). The row exists so the table stays total over the
   * kind union; leaving the kind implicit would let it silently inherit the star
   * map's parsec band.
   */
  constellation: { fadeTarget: PRODUCER_SUPPLIED },
};
