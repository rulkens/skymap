/**
 * meshBodyUniformLayout — the size of the `MeshBodyUniforms` struct, read by
 * the packer that fills it and by the renderer that sizes its buffer and its
 * `minBindingSize`. The FIELD layout lives ONCE beside the struct, in
 * `shaders/bodies/meshBody/io.wesl`'s header.
 */

/** f32 count of `MeshBodyUniforms`. */
export const MESH_BODY_UNIFORM_FLOATS = 44;

/** Byte size of `MeshBodyUniforms` — 176 bytes. */
export const MESH_BODY_UNIFORM_BYTES = MESH_BODY_UNIFORM_FLOATS * 4;
