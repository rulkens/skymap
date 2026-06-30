/**
 * buildClipPathLines — render a precomputed `ClipPathSnapshot` as the debug
 * inspector's lines: a speed-coloured eye polyline plus a scrub gizmo.
 *
 * The route polyline is one segment per sample pair, each coloured by the
 * leading sample's normalised speed (`speedRamp`), so where the camera lingers
 * vs whips reads at a glance. The gizmo (`cameraGizmoLines`) draws the camera
 * sightline + frustum at the scrubbed instant — the sample nearest `scrub01`.
 *
 * `scrub01` is a normalised position in `[0,1]`, NOT seconds. The scrubber UI
 * has no access to the clip's duration (it lives only in the off-store snapshot,
 * and `compileClip` throws on the focus-bearing demo clip), so the slider is a
 * pure 0→1 position and the gizmo maps it straight to the nearest sample index.
 *
 * Returns a flat `DebugLine[]` for the dedicated `debugLineRenderer`, route
 * first then gizmo (the order callers/tests rely on). The renderer rebuilds and
 * uploads wholesale each frame, so — unlike the old label-director path — these
 * carry no ids or re-upload keys.
 */

import type { ClipPathSnapshot } from '../../../@types/engine/debug/ClipPathSnapshot';
import type { DebugLine } from '../../../@types/rendering/DebugLine';
import { speedRamp } from '../../../utils/color/speedRamp';
import { cameraGizmoLines } from './cameraGizmoLines';

/** Full pixel width of the speed-coloured route (wider than the old 2px hint). */
const ROUTE_WIDTH_PX = 3;

export function buildClipPathLines(
  snapshot: ClipPathSnapshot,
  scrub01: number,
  view: { fovYRad: number; aspect: number },
): DebugLine[] {
  const { samples } = snapshot;
  if (samples.length < 2) return [];

  const lines: DebugLine[] = [];

  // --- Speed-coloured route polyline (one segment per sample pair) ---
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]!;
    lines.push({
      from: a.eye,
      to: samples[i + 1]!.eye,
      width: ROUTE_WIDTH_PX,
      color: speedRamp(a.speed01), // colour by the speed entering the segment
    });
  }

  // --- Scrub gizmo at the sample nearest scrub01 (a [0,1] position) ---
  const f = scrub01 < 0 ? 0 : scrub01 > 1 ? 1 : scrub01;
  const idx = Math.round(f * (samples.length - 1));
  const g = samples[idx]!;
  lines.push(...cameraGizmoLines(g.eye, g.target, view.fovYRad, view.aspect));

  return lines;
}
