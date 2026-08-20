// earthSurfaceTile/io.wesl — byte-layout contract (exceeds the usual header
// budget on that basis, per lib/camera.wesl's precedent): the two per-frame
// storage-array structs the vertex-pulling draw reads, the shared
// inter-stage 'VSOut' (mirroring bodies/earth/io.wesl's shape), and the
// draw's uniform block.
//
// ## NodeParams / TileVertex — the vertex-pulling addressing
//
// One 'NodeParams' per cut tile; one 'TileVertex' per drawn CORNER (the
// baked (resolution+1)^2-vertex grid is EXPANDED through its own indices at
// CPU pack time, not drawn indexed -- see the renderer's module header for
// why). 'vertex.wesl' derives 'tileSlot = vertex_index / u.vertsPerTile'
// and 'localVertex = vertex_index % u.vertsPerTile', then reads
// 'nodeParams[tileSlot]' and 'tileVerts[node.vertexBase + localVertex]'.
// The CPU packer in 'earthSurfaceTileLayout.ts' is the ONE matching
// statement of these two structs' byte layout; a field reorder on either
// side without the other moving is caught by
// 'earthSurfaceTileLayout.test.ts'.
struct NodeParams {
  // Tile origin (the uv-origin corner direction, Earth-oriented and
  // -scaled) minus the camera, subtracted CPU-side in f64 and narrowed
  // once -- the 'rebaseViewProj'-style precision seam (see the renderer's
  // module header).
  originRelCamMpc: vec3<f32>,
  vertexBase: u32,
  // This tile's already-resolved atlas rect ('SurfaceCutTile.resident',
  // Task 2's ancestor-fallback resolution) -- no page-table indirection.
  atlasUvOrigin: vec2<f32>,
  atlasUvScale: vec2<f32>,
};

struct TileVertex {
  // Unit-sphere-local position, relative to the tile's own origin
  // direction (bakeSurfaceTileMesh.ts's f32-safe local offset).
  position: vec3<f32>,
  // Intra-tile uv in [0,1]^2 -- NOT the whole-globe equirect uv.
  uv: vec2<f32>,
  // Local-frame unit +u (east) tangent, forwarded raw (the same convention
  // earth/vertex.wesl's tangent attribute uses).
  tangent: vec3<f32>,
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
};

// SurfaceTileUniforms — one record per draw call, shared by every instance
// (there is exactly one Earth). 'rotCol0/1/2' are the three columns of
// 'orientation' rather than a 'mat3x3<f32>' field: WGSL's uniform-address-
// space mat3x3 pads each column to a vec4, which is easy to get byte-wrong
// by hand; three explicit vec3 columns sidestep that trap entirely (see
// the wesl-shaders skill's alignment landmines). The vertex
// stage applies 'rot' to a tile-local delta ('rotCol0*x + rotCol1*y +
// rotCol2*z'); the fragment applies its transpose ('dot' against each
// column) to invert it -- valid because a rotation's inverse is its
// transpose.
//
// 'camPosRelBodyMpc' (Mpc, camera minus Earth-centre, f64-composed and
// narrowed once) is the one camera-relative-to-Earth fact left here --
// 'camPosLocal' (dimensionless, body-radius units) is GONE: its only
// reader was the fragment's ocean-glint view vector, which subtracted two
// near-unit f32 vectors and degenerated at metre-scale altitude (see
// vertex.wesl's 'viewDirLocal', VSOut's cancellation-free replacement).
//
// Byte layout (std140; the sibling-trick pattern 'lib/sphere.wesl' uses
// throughout -- each vec3's trailing 4-byte pad is filled by the next
// real scalar; 'sunDirLocal' is declared before 'sunIrradiance' so it
// lands on a 16-byte boundary with no padding gap):
//
//   offset   0..63:  vp                  mat4x4<f32>
//   offset  64..75:  rotCol0             vec3<f32>
//   offset  76..79:  radiusMpc           f32
//   offset  80..91:  rotCol1             vec3<f32>
//   offset  92..95:  vertsPerTile        u32
//   offset  96..107: rotCol2             vec3<f32>
//   offset 108..111: roughnessBase       f32
//   offset 112..123: camPosRelBodyMpc    vec3<f32>
//   offset 124..127: f0                  f32
//   offset 128..139: sunDirLocal         vec3<f32>
//   offset 140..143: sunIrradiance       f32
//   offset 144..147: ambientLight        f32
//   offset 148..151: oceanRoughness      f32
//   offset 152..155: cloudShadowStrength f32
//   offset 156..159: cloudShellRadius    f32
//   offset 160..163: debugLodOverlay     f32
//   offset 164..175: padding (true padding -- struct rounds to the mat4x4's
//                     16-byte alignment; nothing writes these bytes)
//   total: 176 bytes.
//
// The CPU side uploads 44 f32 words via a mixed Float32Array/Uint32Array
// DataView (only 'vertsPerTile', word 23, is written as a u32; words 41..43
// are left as the scratch ArrayBuffer's zero fill). The single source of
// truth for that packing is 'writeSurfaceTileUniforms' in
// 'earthSurfaceTileLayout.ts'.
struct SurfaceTileUniforms {
  vp: mat4x4<f32>,
  rotCol0: vec3<f32>,
  radiusMpc: f32,
  rotCol1: vec3<f32>,
  vertsPerTile: u32,
  rotCol2: vec3<f32>,
  roughnessBase: f32,
  camPosRelBodyMpc: vec3<f32>,
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
};
