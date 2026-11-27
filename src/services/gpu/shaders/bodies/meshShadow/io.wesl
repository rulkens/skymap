// meshShadow/io.wesl — the depth-only sun pass that fills one layer of meshBodyRenderer's
// shadow array. One 64-byte uniform per slot: the slot's light matrix in the MESH frame
// ('meshShadowLightFromMesh.ts'), so the vertex position goes in untransformed.
//
//   offset 0..63: lightFromMesh (mat4x4<f32>, column-major)

struct MeshShadowDepthUniforms {
  lightFromMesh: mat4x4<f32>,
};
