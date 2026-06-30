/**
 * buildClipPathLines — render a precomputed `ClipPathSnapshot` as the debug
 * inspector's lines: a speed-coloured eye polyline plus a scrub gizmo.
 *
 * The route polyline is one segment per sample pair, each coloured by the
 * leading sample's normalised speed (`speedRamp`), so where the camera lingers
 * vs whips reads at a glance. The gizmo (`cameraGizmoLines`) draws the camera
 * sightline + frustum at the scrubbed instant — the sample nearest `scrubT`.
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
  scrubT: number,
  view: { fovYRad: number; aspect: number },
): DebugLine[] {
  const { durationSec, samples } = snapshot;
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

  // --- Scrub gizmo at the sample nearest scrubT ---
  const clampedT = scrubT < 0 ? 0 : scrubT > durationSec ? durationSec : scrubT;
  const idx =
    durationSec > 0
      ? Math.min(samples.length - 1, Math.round((clampedT / durationSec) * (samples.length - 1)))
      : 0;
  const g = samples[idx]!;
  lines.push(...cameraGizmoLines(g.eye, g.target, view.fovYRad, view.aspect));

  return lines;
}
