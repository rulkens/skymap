/**
 * MeshTextureField — which baked material map a mesh texture is. One per
 * `MESH_TEXTURE_SLOTS` row, and the key that map arrives under on a
 * `MeshAsset`, so the bake, the fetch and the bind all name a slot the same way.
 */
export type MeshTextureField = 'albedo' | 'metalRough' | 'normalMap';
