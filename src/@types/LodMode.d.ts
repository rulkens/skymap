/**
 * LodMode — level-of-detail rendering mode selector. Controls how many points
 * are drawn each frame based on camera distance or explicit user preference.
 */

/**
 * Level-of-detail rendering mode.
 *
 * 'auto'   → the engine picks the point count based on camera distance.
 * 'manual' → the caller controls the active LOD level directly.
 */
export type LodMode = 'auto' | 'manual';
