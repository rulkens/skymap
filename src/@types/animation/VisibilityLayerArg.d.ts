/**
 * VisibilityLayerArg — the layer vocabulary the clip authoring helpers
 * (`show`/`hide`/`fade`) accept: an atomic `VisibilityLayerKey`, OR an
 * authoring aggregate that stands for a fixed set of atomic keys.
 *
 * The aggregate is a convenience for the author, NOT a member of the fade
 * vocabulary. `VisibilityLayerKey` stays the atomic set every fade table keys
 * off; aggregates are expanded to atomic keys by `expandVisibilityLayers` at the
 * moment the effect is constructed, so nothing downstream (the fade registry,
 * the settings bridge, the opacity channel) ever sees an aggregate.
 *
 * Current aggregates:
 *   - `'labels'` — every text label: `surveyLabel` + `structureLabel` +
 *     `milkyWayLabel`. The authoring twin of the Labels panel's tri-state
 *     master, which fans a click out over the same set.
 */

import type { VisibilityLayerKey } from './VisibilityLayerKey';

export type VisibilityLayerArg = VisibilityLayerKey | 'labels';
