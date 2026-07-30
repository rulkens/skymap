/**
 * TextureKind — the *role* a body-texture map plays, orthogonal to which body it
 * belongs to. A body's texture family is keyed by `(bodyId, kind)`, so one body
 * (Earth) can carry several co-registered maps without minting fake body-ids.
 *
 * `surface` is the day/albedo map every textured body has — it is the DEFAULT
 * kind, and the one whose on-disk filename stays unsegmented (see
 * `bodyTextureFilename`). The other kinds are Earth-facing feature maps that land
 * with their own PRs: `night` (city lights), `clouds` (a body-agnostic shell
 * Venus/Titan can reuse), `material` (roughness/metalness packed for PBR), and
 * `normal` (tangent-space bump). Which kinds a given body actually has lives in
 * `BODY_TEXTURE_REGISTRY[id].kinds`, not here — this union is the full vocabulary,
 * the registry says which words each body speaks.
 */

export type TextureKind = 'surface' | 'night' | 'clouds' | 'material' | 'normal';
