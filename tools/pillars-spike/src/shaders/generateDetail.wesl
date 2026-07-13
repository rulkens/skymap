// generateDetail.wesl — one-time compute bake of a small TILING 3D detail
// texture, the Nubis/Horizon-Zero-Dawn "detail erosion" ingredient.
//
// Output texel (rgba8unorm, 64^3, seamlessly tiling in xyz):
//   r  billowy noise — creased/ridged, erodes rounded knobbly edges
//   g  wispy noise   — smooth fbm, erodes stringy tendrils
//   b/a unused
//
// ## Why a separate tiny texture instead of a bigger field bake
//
// The field volume caps detail at its voxel size (~0.015 world units) and
// scaling it up is cubic in memory. This texture decouples detail
// frequency from field resolution: the raymarcher samples it with a
// REPEAT sampler at many cycles per world unit and uses it to erode the
// field's dust profile near its gradient edges (see nebula.wesl), which
// grows sub-voxel tendrils and wisps for one extra fetch per march step.
// 64^3 rgba8 is 1 MB — the whole technique costs less than 5% of one
// field volume.
//
// Tiling is what makes it work: the marcher samples unbounded world
// coordinates, so any non-periodic pattern would seam at every repeat.
// Hence fbm3Tile (lacunarity exactly 2, wrapped lattice) rather than the
// free-running fbm3 the field bake uses.
//
// No uniforms: the detail pattern is seed-independent (reseeding the
// cloud changes the FIELD the detail erodes, which is variation enough),
// so this bakes exactly once at boot. The whole grid is one dispatch —
// 64^3 texels at ~24 lattice hashes each is the same work as ONE z-slab
// of the field bake, which is the empirically watchdog-safe unit.

import package::lib::noise::fbm3Tile;

@group(0) @binding(0) var outDetail: texture_storage_3d<rgba8unorm, write>;

// Base lattice cells across the texture. 8 cells over 64 texels leaves
// the 3rd octave (32 cells) still 2 texels per cell — the finest feature
// trilinear filtering can actually resolve.
const PERIOD = 8.0;

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outDetail);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) {
    return;
  }
  let uv = (vec3<f32>(gid) + vec3<f32>(0.5)) / vec3<f32>(dims);

  // Billowy: fold the fbm about its midline and invert — creases become
  // ridges, giving the rounded cauliflower lobes real cloud edges carry.
  // The pow sharpens the ridge shoulders so erosion bites cleanly.
  let b = fbm3Tile(uv * PERIOD, PERIOD, 3);
  let billow = pow(1.0 - abs(2.0 * b - 1.0), 1.6);

  // Wispy: straight fbm one octave finer — smooth filaments rather than
  // lobes. The marcher blends billow→wispy by local density so cores
  // erode chunky and thin skirts erode stringy.
  let wispy = fbm3Tile(uv * PERIOD * 2.0 + vec3<f32>(9.0, 17.0, 4.0), PERIOD * 2.0, 3);

  textureStore(outDetail, vec3<i32>(gid), vec4<f32>(billow, wispy, 0.0, 0.0));
}
