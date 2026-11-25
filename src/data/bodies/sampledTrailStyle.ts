/**
 * Sampled-trail constants: full stroke width in px (twice the orbit trails'
 * `STROKE_PX` half-width of 2.5) and the chord sag budget of the trail polyline
 * against the Hermite curve. A body's tint lives on its `SampledTrailRow`.
 */

export const SAMPLED_TRAIL_WIDTH_PX = 5;
export const SAMPLED_TRAIL_MAX_SAG_KM = 10;

/** Cross-fade length after entry and after exit, as a fraction of the stay. */
export const TRAIL_STAY_FADE = 0.15;

/** A planet's piece fades to nothing toward where the craft entered, over this fraction of the reach. */
export const TRAIL_ENTRY_FADE_REACH = 0.5;
