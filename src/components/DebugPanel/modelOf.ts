/** Derives CameraStateSection's PanelModel from a snapshot, the live tuning, and the marker radius. */

import type { CameraDebugSnapshot } from '../../@types/camera/CameraDebugSnapshot';
import type { CameraTuning } from '../../@types/camera/CameraTuning';
import type { PanelModel } from '../../@types/components/PanelModel';
import { frameKey } from '../../services/engine/camera/rungs/frameKey';
import { deg } from '../../utils/format/deg';
import { num } from '../../utils/format/num';

export function modelOf(
  snap: CameraDebugSnapshot,
  tuning: CameraTuning,
  markerRadiusM: number,
): PanelModel {
  const { dofs, deltas } = snap;
  const off = !tuning.northUp;
  return {
    header: `${frameKey(snap.framed.frame)} · ${snap.activeDriverId} · gesture: ${snap.gestureMode ?? 'none'}`,
    badge: snap.armMismatch ? 'ARM MISMATCH' : snap.epochMismatch ? 'EPOCH MISMATCH' : null,
    dofs: [
      { name: 'heading', off, row: dofs.heading, delta: deltas.heading },
      { name: 'tilt', off: false, row: dofs.tilt, delta: deltas.tilt },
      { name: 'roll', off, row: dofs.roll, delta: deltas.roll },
    ],
    band: [
      { key: 'h_over_R', value: num(snap.hOverR) },
      { key: 'altitude_m', value: num(snap.altitudeM) },
      { key: 'terrain_pick_height_m', value: num(snap.terrainPickHeightM) },
      // The gauge's own size: a height written down beside a buried fraction
      // means nothing without the sphere radius it was read against.
      { key: 'terrain_pick_marker_radius_m', value: num(markerRadiusM) },
      { key: 'resident_height_level_at_eye', value: num(snap.residentHeightLevelAtEye) },
      { key: 'band_up_weight', value: num(snap.bandUpWeight) },
      { key: 'engage/disengage_hr', value: `${tuning.engageHR} / ${tuning.disengageHR}` },
      { key: 'tilt_full/zero_hr', value: `${tuning.tiltFullHR} / ${tuning.tiltZeroHR}` },
      { key: 'blend_space', value: tuning.blendSpace },
      { key: 'north_up', value: String(tuning.northUp) },
      { key: 'remembered_tilt_rad', value: num(snap.rememberedTiltRad) },
    ],
    markerReadout:
      snap.hOverR === null
        ? '—'
        : `h/R ${snap.hOverR.toFixed(3)} · ${
            snap.altitudeM === null
              ? '—'
              : `${Math.round(snap.altitudeM).toLocaleString('en-US')} m`
          }`,
    weightReadout: snap.bandUpWeight === null ? '—' : snap.bandUpWeight.toFixed(3),
    rememberedTiltReadout: deg(snap.rememberedTiltRad),
    site:
      snap.sitePose === null
        ? null
        : [
            { key: 'heading', value: deg(snap.sitePose.headingRad) },
            { key: 'elevation', value: deg(snap.sitePose.elevationRad) },
            {
              key: 'range_m',
              value: `${Math.round(snap.sitePose.rangeM).toLocaleString('en-US')} m`,
            },
            {
              key: 'eye_height_m',
              // Above the site's tangent plane (spec §4.9) — the one number
              // that shows whether `clampedSitePose`'s floor is doing its job.
              value: `${(snap.sitePose.rangeM * Math.sin(snap.sitePose.elevationRad)).toFixed(2)} m`,
            },
          ],
    raw: [
      { key: 'stored_regime', value: frameKey(snap.storedFrame) },
      { key: 'rendered_arm', value: frameKey(snap.framed.frame) },
      { key: 'scene_frame', value: snap.orientationFrame },
      { key: 'distance_mpc', value: num(snap.distanceMpc) },
      {
        key: 'gesture_cursor_hit',
        value: snap.gestureCursorHit === null ? '—' : String(snap.gestureCursorHit),
      },
      {
        key: 'anchor_local_m',
        value: snap.anchorLocalM === null ? '—' : `[${snap.anchorLocalM.map(String).join(', ')}]`,
      },
      { key: 'eye_rel_anchor_m', value: num(snap.eyeRelAnchorMagM) },
      { key: 'rendered_sim_days', value: num(snap.lastRenderedSimDays) },
      { key: 'live_sim_days', value: num(snap.liveSimDays) },
      { key: 'delta_s', value: String(snap.epochDeltaDays * 86_400) },
    ],
  };
}
