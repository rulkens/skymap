/**
 * sceneRings — the authored table of planetary ring systems the ring renderer
 * draws (spec §4.4).
 *
 * ### Saturn only
 *
 * Of the four ringed giants, only Saturn's rings are bright and broad enough to
 * be worth rendering: Uranus's rings are near-black (albedo ~0.05, effectively
 * invisible at this scale) and Jupiter's are gossamer dust that carries no
 * legible structure (spec §8). Neptune's arcs are fainter still. So this is a
 * one-row table today; a new ring system is a single row here plus its
 * `RingTextureId` and raw-data entries.
 *
 * ### No plane frame stored here
 *
 * A ring row carries no orientation of its own. The ring plane IS the host
 * body's equatorial plane, so the renderer reuses Saturn's baked `orientation`
 * (from `ROTATION_ELEMENTS`) and `positionMpc` (from `SCENE_BODIES`) by looking
 * the body up via `bodyId`. Storing a second copy of that frame would be a sync
 * hazard — the ring could drift off the planet it belongs to — for no gain (spec
 * §4.4).
 */

import type { RingSpec } from '../../@types/scene/RingSpec';

/**
 * The modelled ring systems — Saturn alone today. `innerRadiusKm` /
 * `outerRadiusKm` are the C-ring inner (74_500 km) and A-ring outer (140_220 km)
 * boundaries, the visible extent of the main ring system; the fainter E/G rings
 * are omitted (no legible structure at render scale).
 */
export const SCENE_RINGS: readonly RingSpec[] = [
  {
    bodyId: 'saturn',
    innerRadiusKm: 74_500,
    outerRadiusKm: 140_220,
    textureId: 'saturn-ring',
  },
];
