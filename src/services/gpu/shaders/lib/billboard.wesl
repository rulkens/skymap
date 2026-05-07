// lib/billboard.wesl — unit-quad corner mapping + screen-space billboard
// expansion helpers shared across instanced point/quad renderers.
//
// Four of the project's renderers (points, quads, disks, proceduralDisks)
// each draw one screen- or world-aligned quad per instance using the
// non-indexed 'triangle-list' topology — six vertices per quad, with the
// vertex stage looking up the corner offset from a small constant array
// keyed by '@builtin(vertex_index)'. The corner array was duplicated
// verbatim in three of those four shaders (only points used a slightly
// different ordering); the cornerUv remap '(corner + 1) * 0.5' was
// duplicated in all four. This module collapses that duplication into one
// canonical pair of helpers ('quadCorner', 'quadUv') and adds one
// renderer-agnostic expansion helper ('expandBillboardScreen') for the
// screen-pixel-sized billboard pattern that points uses.
//
// ## Why these three exports and no more
//
// The plan's Task 5 draft proposed a fourth helper, 'expandBillboardWorld',
// that would view-align a world-sized quad (camera-right + camera-up basis
// extracted from a 'view' matrix). Reading the actual call sites revealed
// that NONE of the four candidate renderers want a generic view-aligned
// world basis:
//
//   - 'quads' builds its basis from the projected celestial-north
//     direction at each galaxy's screen position (so the texture's
//     north-up orientation tracks sky-north, not the camera). That's
//     fundamentally renderer-specific math — see the long doc-block
//     around 'NORTH_WORLD' / 'upClip' in 'quads.wesl'.
//   - 'disks' and 'proceduralDisks' build their bases from the galaxy's
//     intrinsic position-angle and inclination (camera-INDEPENDENT — the
//     disk plane is a property of the galaxy in 3D space). That math
//     belongs in 'lib/orientation.wesl' (Task 6), not here.
//   - 'points' is screen-aligned (corner direction = pure screen X / Y),
//     which 'expandBillboardScreen' below covers.
//
// And the canonical CameraUniforms struct in 'lib/camera.wesl' carries
// only 'viewProj' + 'viewportPx' — there is no separate 'view' matrix to
// extract a camera-right / camera-up basis from. Adding one purely to
// satisfy a generic helper that no real renderer would call would bloat
// the shared 80-byte prefix for every renderer's UBO upload, with no
// functional benefit. We therefore omit 'expandBillboardWorld'; if a
// future renderer ever wants the view-aligned pattern, it can re-derive
// the basis from columns of the inverse-viewProj or accept a basis pair
// as parameters.
//
// ## What about the corner-ordering mismatch
//
// The four renderers historically used two slightly different 6-vertex
// orderings of the same unit square (both render an identical filled
// quad under WebGPU's default 'cullMode: none'):
//
//   - 'quads' / 'disks' / 'proceduralDisks':
//       BL, BR, TR,  BL, TR, TL
//   - 'points':
//       BL, BR, TL,  TL, BR, TR
//
// Both are valid CCW-front-face triangulations of the same square; they
// produce identical fragment coverage and identical interpolated UVs at
// every pixel inside the square (linear interpolation across two
// triangles whose union is the same convex region depends only on the
// vertex values at the corners, not on which diagonal splits the square).
// We therefore unify on the (BL, BR, TR, BL, TR, TL) ordering used by 3
// of the 4 callers and migrate 'points' to match — this lets 'points'
// use the same 'quadCorner(vid)' helper as everyone else, eliminating
// the const-array duplication entirely.

// CameraUniforms carries 'viewportPx', which 'expandBillboardScreen'
// below needs to convert pixel sizes into clip-space offsets.
import package::lib::camera::CameraUniforms;

// ── quadCorner ───────────────────────────────────────────────────────
//
// Map 'vid' (the GPU's per-vertex index, 0..5 for a triangle-list quad)
// to the corner offset in [-1, +1]². The table is hard-coded into a
// 'switch' rather than a 'const array' lookup because some WGSL drivers
// generate a uniform-buffer constant-array load for 'array<vec2<f32>,
// N>' even when the index is a literal, whereas a switch resolves to
// pure register moves. Both spellings produce identical results; we
// pick the one with no chance of incurring memory traffic.
//
// Triangle ordering (CCW in y-up screen space):
//   triangle 1: vid 0 (BL), vid 1 (BR), vid 2 (TR)
//   triangle 2: vid 3 (BL), vid 4 (TR), vid 5 (TL)
//
// The shared diagonal runs BL ↔ TR. Both triangles cover the same
// square, so the choice of diagonal is invisible in the fragment shader.

fn quadCorner(vid: u32) -> vec2<f32> {
  switch vid {
    case 0u: { return vec2<f32>(-1.0, -1.0); }  // bottom-left
    case 1u: { return vec2<f32>( 1.0, -1.0); }  // bottom-right
    case 2u: { return vec2<f32>( 1.0,  1.0); }  // top-right
    case 3u: { return vec2<f32>(-1.0, -1.0); }  // bottom-left (repeat)
    case 4u: { return vec2<f32>( 1.0,  1.0); }  // top-right   (repeat)
    case 5u: { return vec2<f32>(-1.0,  1.0); }  // top-left
    default: { return vec2<f32>( 0.0,  0.0); }  // unreachable
  }
}

// ── quadUv ───────────────────────────────────────────────────────────
//
// Same vertex-index → corner mapping as 'quadCorner', but remapped from
// [-1, +1]² to [0, 1]² so callers that want a UV-style coordinate (for
// atlas sampling, radial-mask distances from the quad centre, etc.) can
// skip the inline '(corner + 1) * 0.5' remap.
//
// Why a separate helper rather than letting every caller write
// '(quadCorner(vid) + 1) * 0.5'? Three of four billboard renderers
// already do exactly that — extracting the named version turns a
// duplicated 25-character expression into a single function call and
// gives the rename target if the UV convention ever changes (e.g. if a
// future renderer wants a flipped V).

fn quadUv(vid: u32) -> vec2<f32> {
  return (quadCorner(vid) + vec2<f32>(1.0, 1.0)) * 0.5;
}

// ── expandBillboardScreen ────────────────────────────────────────────
//
// Compute the clip-space XY offset that turns a projected billboard
// centre into a 'sizePx'-pixel-radius screen-aligned quad corner. The
// caller passes:
//
//   cam        — the shared CameraUniforms (for 'viewportPx')
//   centerClip — already-projected centre, 'cam.viewProj * vec4(p, 1.0)'
//   sizePx     — desired billboard half-extent in screen pixels
//   corner     — the unit-quad corner from 'quadCorner(vid)'
//
// Returns the clip-space XY delta to ADD to 'centerClip.xy'. The full
// corner clip position is then:
//
//   vec4<f32>(centerClip.xy + offset, centerClip.z, centerClip.w)
//
// ## Why it returns the offset rather than the full clip-space position
//
// 'points' applies a per-instance 'sizeScale' (8× radius for the
// selection halo) BEFORE the pixel→clip conversion, but AFTER the
// raw billboard sizing. Letting the helper return the delta lets the
// caller do its own scaling on either side of the call without
// having to thread additional parameters through. The two-line
// caller pattern then is:
//
//   let corner = quadCorner(vid);
//   let offset = expandBillboardScreen(u.cam, centerClip, sizePx, corner);
//   out.clip   = centerClip + vec4<f32>(offset, 0.0, 0.0);
//
// ## The 'centerClip.w' cancellation
//
// Clip-space X/Y span [-w, +w] before the perspective divide; one
// pixel of screen-space width therefore corresponds to a clip-space
// delta of '2 * centerClip.w / viewportPx.x' (the GPU divides the
// final clip XY by w to get NDC, which spans [-1, +1] across
// 'viewportPx' pixels). Multiplying by 'centerClip.w' cancels the
// perspective divide so the on-screen size of the billboard is
// exactly 'sizePx' pixels regardless of how far the centre is from
// the camera — which is the whole point of a screen-aligned, pixel-
// sized billboard.

fn expandBillboardScreen(
  cam: CameraUniforms,
  centerClip: vec4<f32>,
  sizePx: f32,
  corner: vec2<f32>,
) -> vec2<f32> {
  let pxToClip = vec2<f32>(2.0 / cam.viewportPx.x, 2.0 / cam.viewportPx.y);
  return corner * sizePx * pxToClip * centerClip.w;
}
