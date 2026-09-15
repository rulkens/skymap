// earthSurfaceTile/io.wesl — byte-layout contract (exceeds the usual header
// budget on that basis, per lib/camera.wesl's precedent): the per-patch
// instance record, the shared inter-stage 'VSOut' (mirroring
// bodies/earth/io.wesl's shape), and the draw's uniform block.
//
// One 'PatchInstance' per cut tile, selected by '@builtin(instance_index)';
// there is no vertex data at all -- 'vertex.wesl' derives every position
// from this record and '@builtin(vertex_index)'. The CPU packer in
// 'earthSurfaceTileLayout.ts' is the ONE matching statement of these
// structs' byte layout, and 'earthSurfaceTileLayout.test.ts' the only
// cross-check: a field reorder on one side alone scrambles every drawn
// patch with no compiler signal.
//
// The two vec4s must stay BEFORE 'heightSlotOrigin': a vec2<u32> declared
// earlier pads the record past its 80-byte stride (spec section 7's
// field-order note). Reordering the five scalars keeps the stride but
// re-maps offsets 12..31 with no compiler signal -- the layout test's
// per-field assertions are the only guard. 'heightCells' at 76 fills what
// was the struct's trailing pad, so the stride is still 80.
//
// 'datumRadiusM' is deliberately absent: it is the per-draw uniform
// 'SurfaceTileUniforms.radiusM' (offset 76), since one body is engaged per
// draw, and because both paths reach the GPU through an f32 write the
// uniform carries the identical word 'patchOriginRelEyeM' rounded to.
struct PatchInstance {
  // The patch's (lon0, lat0) corner scaled by radiusM, in the body's fixed
  // axes, minus the eye -- subtracted CPU-side in f64 from the f32-ROUNDED
  // anchor and narrowed once ('patchOriginRelEyeM'). At s = t = 0 the
  // vertex stage reproduces this exactly, so patch corners never crack.
  originRelEyeM: vec3<f32>,
  // clamp((nowMs - readyAtMs) / EARTH_TILE_CROSSFADE_MS, 0, 1), computed
  // once per tile in earthSurfaceTileRenderer.ts's draw() (nowMs sampled
  // once per frame, not per tile) -- 1.0 is the "no fade" fast path.
  fadeWeight: f32,
  // The patch's angular footprint (radians), the f32 half of the CPU/GPU
  // contract: the vertex stage rebuilds the ENU frame from THESE words.
  lon0Rad: f32,
  lat0Rad: f32,
  dLonRad: f32,
  dLatRad: f32,
  // This tile's already-resolved atlas rect ('SurfaceCutTile.albedo'),
  // flattened as (origin.xy, scale.xy) -- no page-table indirection.
  albedoRect: vec4<f32>,
  // The next resident ancestor strictly above the resolved tile, flattened
  // the same way -- the coarser imagery the fragment crossfades FROM
  // (fragment.wesl samples both). Equal to albedoRect (and fadeWeight
  // forced to 1) when no deeper resident ancestor exists --
  // 'SurfaceCutTile.albedo.fallback === null's CPU-side encoding, so the
  // fragment always has a valid second rect to sample.
  fallbackRect: vec4<f32>,
  // Post origin of this leaf's SUB-RECT in the r32float atlas: its resident
  // height tile's slot origin plus 'SurfaceCutTile.height.originPosts', so a
  // leaf flattened into an ancestor's slot (R14) needs no second field. Posts
  // are read with 'textureLoad' -- never a sampler, which would bleed the
  // neighbouring slot in along every patch edge.
  heightSlotOrigin: vec2<u32>,
  // One bit per edge in R9 order (west | east << 1 | south << 2 |
  // north << 3), set when that neighbouring leaf's HEIGHT LEVEL is exactly
  // one coarser: the vertex stage then samples that edge at doubled stride,
  // which IS the neighbour's own lattice. A step of two or more carries no
  // bit -- no stride meets it, and the skirt (on every edge, R15) hides it.
  edgeCoarser: u32,
  // Cells across the sub-rect above: 128 >> levelDelta, so 128 on a leaf
  // drawing its own tile. Fills what was the record's trailing pad.
  heightCells: u32,
};

// VSOut mirrors the shape of bodies/earth/io.wesl: clip position, an
// intra-tile uv, and a local normal/tangent pair for lighting parity with
// the base globe's PBR path. 'normalLocal' is forwarded RAW (unnormalized)
// the same way earth/vertex.wesl forwards its local position -- the fragment
// renormalizes after interpolation. 'atlasUvOrigin'/'atlasUvScale' are
// per-tile CONSTANTS, '@interpolate(flat)' so every fragment of a triangle
// reads the exact uploaded value rather than a barycentric restatement of
// it (see the shader-work convention: every varying costs bandwidth).
// 'viewDirLocal' is NOT flat: it is 'worldPosRelCam' (small, f64-composed
// then narrowed once) rotated into the local frame per vertex, forwarded
// raw for the fragment to normalize -- the cancellation-free replacement
// for 'camPosLocal - Ng', which subtracts two near-unit f32 vectors and
// degenerates at metre-scale altitude (see vertex.wesl).
struct VSOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) normalLocal: vec3<f32>,
  @location(2) tangent: vec3<f32>,
  @location(3) @interpolate(flat) atlasUvOrigin: vec2<f32>,
  @location(4) @interpolate(flat) atlasUvScale: vec2<f32>,
  @location(5) viewDirLocal: vec3<f32>,
  // Crossfade fallback rect + blend weight -- flat for the same reason
  // atlasUvOrigin/atlasUvScale are (per-tile constants, see above).
  @location(6) @interpolate(flat) fallbackUvOrigin: vec2<f32>,
  @location(7) @interpolate(flat) fallbackUvScale: vec2<f32>,
  @location(8) @interpolate(flat) fadeWeight: f32,
  // What the fragment needs to take its normal from the height cell it lies
  // in: the leaf's lattice as (origin.xy, cells) -- one location rather than
  // two, since a sub-rect origin without its cell count addresses nothing --
  // and the patch's (dLon, dLat) to turn a cell step into metres. Per-tile
  // constants, so flat; a u32 cannot interpolate at all.
  @location(9) @interpolate(flat) heightLattice: vec3<u32>,
  @location(10) @interpolate(flat) patchSpanRad: vec2<f32>,
};

// SurfaceTileUniforms — one record per draw call, shared by every instance
// (there is exactly one Earth). 'rotCol0/1/2' are the three columns of
// 'orientation' rather than a 'mat3x3<f32>' field: WGSL's uniform-address-
// space mat3x3 pads each column to a vec4, which is easy to get byte-wrong
// by hand; three explicit vec3 columns sidestep that trap entirely (see
// the wesl-shaders skill's alignment landmines). 'rotCol0/1/2' are
// inverted ('dot' per column) in the vertex stage for 'normalLocal' and
// 'viewDirLocal' only; the position path is composed directly from the
// anchor in body-local space and needs no rotation. Under the body-slab
// frame the CPU side always packs the IDENTITY here (see the renderer's
// module header): the pose seam already expresses every position in the
// body's fixed axes, so this rotation is a no-op kept only so the
// struct's byte layout (below) doesn't move.
//
// 'camPosRelBodyM' (metres, camera minus Earth-centre in the body's fixed
// axes -- the body-slab pose seam's own 'eyeRelBodyM', f64-composed and
// narrowed once) is the one camera-relative-to-Earth fact left here --
// 'camPosLocal' (dimensionless, body-radius units) is GONE: its only
// reader was the fragment's ocean-glint view vector, which subtracted two
// near-unit f32 vectors and degenerated at metre-scale altitude. In metres
// that degeneration is structurally impossible -- the vector no longer
// cancels, which is the point (see vertex.wesl's 'viewDirLocal', VSOut's
// cancellation-free replacement, kept for the same reason it was needed
// before).
//
// Byte layout (std140; the sibling-trick pattern 'lib/sphere.wesl' uses
// throughout -- each vec3's trailing 4-byte pad is filled by the next
// real scalar; 'sunDirLocal' is declared before 'sunIrradiance' so it
// lands on a 16-byte boundary with no padding gap):
//
//   offset   0..63:  vp                  mat4x4<f32>
//   offset  64..75:  rotCol0             vec3<f32>
//   offset  76..79:  radiusM             f32
//   offset  80..91:  rotCol1             vec3<f32>
//   offset  92..95:  meshResolution      u32
//   offset  96..107: rotCol2             vec3<f32>
//   offset 108..111: roughnessBase       f32
//   offset 112..123: camPosRelBodyM      vec3<f32>
//   offset 124..127: f0                  f32
//   offset 128..139: sunDirLocal         vec3<f32>
//   offset 140..143: sunIrradiance       f32
//   offset 144..147: ambientLight        f32
//   offset 148..151: oceanRoughness      f32
//   offset 152..155: cloudShadowStrength f32
//   offset 156..159: cloudShellRadius    f32
//   offset 160..163: debugLodOverlay     f32
//   offset 164..167: maxSkirtDepthM      f32
//   offset 168..175: padding (true padding -- struct rounds to the mat4x4's
//                     16-byte alignment; nothing writes these bytes)
//   total: 176 bytes.
//
// The CPU side uploads 44 f32 words via a mixed Float32Array/Uint32Array
// DataView (only 'meshResolution', word 23, is written as a u32; words 42..43
// are left as the scratch ArrayBuffer's zero fill). The single source of
// truth for that packing is 'writeSurfaceTileUniforms' in
// 'earthSurfaceTileLayout.ts'.
struct SurfaceTileUniforms {
  vp: mat4x4<f32>,
  rotCol0: vec3<f32>,
  radiusM: f32,
  rotCol1: vec3<f32>,
  // The template's 'n': the vertex stage splits '@builtin(vertex_index)'
  // into (i, j) over an (n+1)^2 grid.
  meshResolution: u32,
  rotCol2: vec3<f32>,
  roughnessBase: f32,
  camPosRelBodyM: vec3<f32>,
  f0: f32,
  sunDirLocal: vec3<f32>,
  sunIrradiance: f32,
  ambientLight: f32,
  oceanRoughness: f32,
  cloudShadowStrength: f32,
  cloudShellRadius: f32,
  // The 'earth-lod-overlay' DebugPanel toggle (0.0/1.0; the fragment reads
  // it with '> 0.5') -- a fresh field rather than a reused pad slot, since
  // the struct had none left (see the byte table above).
  debugLodOverlay: f32,
  // Ceiling on the vertex stage's skirt depth: this body's relief span
  // ('reliefSpanM'), the widest a height seam can open. The fraction-of-patch
  // heuristic scales with the PATCH and asks for 250 km at z3, which any edge
  // whose neighbour has not landed then draws as a sheet -- see vertex.wesl.
  maxSkirtDepthM: f32,
};
