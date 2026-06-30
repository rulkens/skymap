/**
 * buildClipPathLines — sample a compiled flyPath's eye path into a marker-line
 * polyline for the debug overlay.
 *
 * The camera (eye) flies the path's centripetal spline. When debugging a
 * flyPath it is hard to "guess if we're on the right track" from the moving
 * camera alone, so this helper turns the static eye path into a visible polyline
 * the `markerLineRenderer` draws in-scene. It samples each `PathTrack`'s
 * `sample(localSec)` at a fixed resolution, reconstructs the eye position from
 * the pose via the orbit convention, and emits one `MarkerLine` per segment.
 *
 * ### Stable, path-keyed ids
 *
 * The `labelDirector` keys its GPU re-upload on the line ids (positions are
 * deliberately excluded from its change-signature). A static set of ids would
 * therefore go stale when a DIFFERENT clip plays — same ids, new positions, no
 * re-upload. We fold the rounded path endpoints into the id, so a different
 * route yields different ids and forces a fresh upload, while the same route
 * re-emits identical ids and uploads only once.
 */

import type { PathTrack } from '../../../@types/animation/CompiledClip';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Vec4 } from '../../../@types/math/Vec4';

/** Eye samples per track — enough for a smooth polyline without flooding the buffer. */
const EYE_SAMPLES = 48;
/** Cyan, premultiplied-alpha (alpha 1) — reads clearly over the HDR sky. */
const PATH_COLOR: Vec4 = [0, 0.85, 1, 1];
const PATH_WIDTH_PX = 2;

/** Reconstruct the eye position from a pose via the orbit convention. */
function eyeOf(target: Vec3, distance: number, yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [
    target[0] + distance * (cp * Math.sin(yaw)),
    target[1] + distance * Math.sin(pitch),
    target[2] + distance * (cp * Math.cos(yaw)),
  ];
}

function key(p: Vec3): string {
  return `${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])}`;
}

export function buildClipPathLines(tracks: readonly PathTrack[]): MarkerLine[] {
  const lines: MarkerLine[] = [];
  tracks.forEach((track, ti) => {
    const over = track.endSec - track.startSec;
    const pts: Vec3[] = [];
    for (let i = 0; i < EYE_SAMPLES; i++) {
      const localSec = (i / (EYE_SAMPLES - 1)) * over;
      const s = track.sample(localSec);
      pts.push(eyeOf(s.target, s.distance, s.yaw, s.pitch));
    }
    const k = `${key(pts[0]!)}-${key(pts[pts.length - 1]!)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      lines.push({
        id: `clippath:${ti}:${k}:${i}`,
        fromWorld: pts[i]!,
        toWorld: pts[i + 1]!,
        pixelWidth: PATH_WIDTH_PX,
        color: PATH_COLOR,
        fadeAlpha: 1,
      });
    }
  });
  return lines;
}
