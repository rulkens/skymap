/**
 * meshShadowCastersLayout — the size of the `MeshShadowCasters` struct, read by its packer and
 * by the surface-tile renderer that sizes its buffer. The field layout lives beside the struct,
 * in `shaders/lib/meshShadow.wesl`'s header.
 */

export const MESH_SHADOW_CASTERS_BYTES = 288;
