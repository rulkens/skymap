/**
 * RingTextureId — the id of a ring-strip texture, a distinct key space from the
 * spherical `BodyTextureId` because a ring is drawn as an annulus (with an alpha
 * channel), not wrapped on a sphere.
 *
 * Only Saturn's ring is modelled today (Uranus's rings are near-black and
 * Jupiter's are gossamer — spec §8), so this is a one-member union. It stays a
 * union rather than a bare string literal so the ring asset key routes through
 * the same keyed `bodyTextures` slot family and tier-clamp machinery as the body
 * textures, and a new ring is a one-line addition here.
 */

export type RingTextureId = 'saturn-ring';
