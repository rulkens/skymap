/**
 * MeshSeatKind — how a `SurfaceFixedSite` mesh sits on its host.
 * `resting`: site = the recentred mesh's origin; seat height = the highest
 * drawn ground in the bounding radius; up fitted to the slope; the Blender
 * AO/contact prebake is required. `anchored`: the mesh's source is
 * georeferenced; the build shifts its origin onto the site; seat height =
 * the source anchor's height; up = the anchor's up seen from the site; no
 * prebake stamps, no contact decal; not pickable.
 */
export type MeshSeatKind = 'resting' | 'anchored';
