// lib/normalMap.wesl — the one tangent-space normal-map perturbation every
// relief-mapped body reads.
//
// A baked normal map stores a per-texel surface tilt in TANGENT space (the local
// east/north/up frame of the surface), so relief catches light without displacing
// the mesh. To apply it, each fragment rebuilds that tangent frame from its own
// interpolated geometric normal + east tangent (a TBN basis) and rotates the
// stored tilt into the body's local frame, where the lighting maths live.
// Centralising the maths here means Earth's fragment and the shared airless
// 'texturedBody' fragment perturb their normals through ONE definition, so the
// TBN sign convention can never drift between them.
//
// ## Decode -> reconstruct -> Gram-Schmidt -> rotate
//
//   1. Decode: the map is LINEAR RG in [0,1]; 'nxy = encRG * 2 - 1' maps it back
//      to the signed tangent-space nx (R, +u=east) and ny (G, +v=north).
//   2. Reconstruct: only nx, ny are stored; nz is always positive, recovered as
//      'sqrt(1 - nx^2 - ny^2)' (floored at 0 so a slightly-over-unit encoded
//      pair can't take the sqrt negative).
//   3. Gram-Schmidt: the interpolated tangent 'T' skews off-perpendicular across
//      a face, so it is re-orthonormalized against the geometric normal 'Ng'
//      before use ('Tn = normalize(T - Ng * dot(Ng, T))').
//   4. Rotate: 'Bt = cross(Ng, Tn)' is the bitangent, and the tangent-space
//      vector is rotated into local space as 'Tn*nx + Bt*ny + Ng*nz'.
//
// ## The bitangent sign is the shared contract with the bake
//
// 'Bt = cross(Ng, Tn)' points +v = NORTH: at the equator (lon=0) Ng=(1,0,0),
// Tn=(0,1,0) -> cross=(0,0,1) = celestial north, the direction of increasing
// latitude. That matches the axis 'tools/textures/bakeNormalMap.ts' encodes into
// G (see its 'Row / sign convention' section) -- so ny (G, +v=north) rides Bt
// with exactly the sign the bake stored. This function and bakeNormalMap.ts are
// the two ends of one convention; change one only with the other.
//
// ## Flat-sample identity (why the placeholder / no-map path is exact)
//
// A flat encoded sample 'encRG == (0.5, 0.5)' decodes to 'nxy == (0, 0)', so
// 'nz == sqrt(1) == 1' and the rotation collapses to 'Ng * 1 == Ng' (the Tn/Bt
// terms are zeroed). So a body with the (0,0,1) flat-normal placeholder bound --
// before its real baked map arrives -- shades identically to the un-perturbed
// geometric-normal path. The effect is fully data-gated: no map, no change.
//
// Single quotes in comments; no backticks (WESL parse rule).

fn perturbNormal(Ng: vec3<f32>, T: vec3<f32>, encRG: vec2<f32>) -> vec3<f32> {
  let nxy = encRG * 2.0 - 1.0; // [0,1] -> [-1,1]
  let nz = sqrt(max(1.0 - dot(nxy, nxy), 0.0)); // reconstruct +z
  let Tn = normalize(T - Ng * dot(Ng, T)); // Gram-Schmidt T against Ng
  let Bt = cross(Ng, Tn); // +v = north (the bake's G axis)
  return normalize(Tn * nxy.x + Bt * nxy.y + Ng * nz);
}
