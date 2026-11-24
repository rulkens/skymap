/**
 * Mission-trail constants: full stroke width in px (twice the orbit trails'
 * `STROKE_PX` half-width of 2.5) and the chord sag budget of the trail polyline
 * against the Hermite curve. Per-craft tint lives on its `SAMPLED_BODIES` row.
 */

export const MISSION_TRAIL_WIDTH_PX = 5;
export const MISSION_TRAIL_MAX_SAG_KM = 10;

/** Cross-fade length after entry and after exit, as a fraction of the stay. */
export const TRAIL_STAY_FADE = 0.15;

/** A planet's piece fades to nothing toward where the craft entered, over this fraction of the reach. */
export const TRAIL_ENTRY_FADE_REACH = 0.5;

/** Opacity factor for a sampled craft's trail and caption while the other one is emphasised. */
export const MISSION_EMPHASIS_DIM = 0.25;
