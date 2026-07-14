// diskRadiusRing/vertex.wesl — emit a closed ring lying IN THE DISK
// PLANE at the galaxy's procedural-disk radius.
//
// Bindings live here, not in io.wesl — WESL has no global state, so the
// '@group/@binding' declarations are module-local.  We re-declare both
// uniforms using the structs imported from io.wesl (same split as
// selectionRing/vertex.wesl and texturedDisks/vertex.wesl).
//
// ## Why the basis MUST match texturedDisks
//
// This overlay exists to answer one calibration question: 'does the
// textured disk's projected edge fall on the ring?'  For that to be an
// apples-to-apples comparison, the ring's in-plane basis has to be the
// EXACT same world-space (major, minor) frame texturedDisks places its
// quad in.  So we reuse 'lib/orientation::diskAxes' with the identical
// inputs: 'cosI = max(axisRatio, 0.05)', 'sinI = sqrt(1 - cosI²)',
// 'paRad = paDeg * pi/180'.  Any divergence here would make the ring
// trace a DIFFERENT ellipse than the disk, defeating the overlay.

import package::diskRadiusRing::io::DiskRadiusRingUniforms;
import package::diskRadiusRing::io::VsOut;
import package::lib::camera::CameraUniforms;
import package::lib::camera::worldToClip;
import package::lib::orientation::DiskAxes;
import package::lib::orientation::diskAxes;

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(0) @binding(1) var<uniform> ring: DiskRadiusRingUniforms;

// Segment count for the line strip.  The CPU draws SEGMENTS + 1 = 97
// vertices: vertex 'SEGMENTS' wraps to theta = 2*pi, landing back on
// vertex 0 so the strip closes.  This literal MUST stay in lockstep with
// the 'SEGMENTS_PLUS_ONE = 97' draw count in renderers/devTools/diskRadiusRing.ts —
// a mismatch leaves the ring open or overruns the loop.
const SEGMENTS: u32 = 96u;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  // Angular parameter around the ring.  'vi' runs 0..SEGMENTS inclusive,
  // so t spans [0, 1] and theta spans [0, 2*pi] — the last vertex closes
  // onto the first.
  let t = f32(vi) / f32(SEGMENTS);
  let theta = t * 6.2831853;

  // Disk-plane basis (PA + inclination → world-space major / minor),
  // built IDENTICALLY to texturedDisks/vertex.wesl so the ring lies in
  // the same plane as the textured quad.  axisRatio is clamped to the
  // same 0.05 floor BEFORE the trig; the lib intentionally doesn't
  // re-clamp (see lib/orientation.wesl).
  let cosI = max(ring.axisRatio, 0.05);
  let sinI = sqrt(max(0.0, 1.0 - cosI * cosI));
  let paRad = ring.paDeg * 3.14159265 / 180.0;
  let axes = diskAxes(ring.center, paRad, cosI, sinI);
  let major = axes.major;
  let minor = axes.minor;

  // Place the ring vertex on the disk-plane ellipse of radius
  // 'radiusWorld'.  (major, minor) are unit-length and orthogonal, so
  // 'major*cos + minor*sin' traces the disk's true (inclination-
  // foreshortened) ellipse once projected.
  let world = ring.center + (major * cos(theta) + minor * sin(theta)) * ring.radiusWorld;

  var out: VsOut;
  out.pos = worldToClip(cam, world);
  return out;
}
