/**
 * commitMilkyWayFocus — focus on the Milky Way singleton.  Parallel to
 * `commitGalaxyFocus` / `commitStructureFocus`: select, latch focus, tween.
 *
 * The Milky Way is a static target (`MILKY_WAY_INFO`), so both slots latch the
 * same const.  Unlike the old `focusOnMilkyWay` camera method — which dropped
 * the focus slot to null because there was no MW target to hold — we now have a
 * `MilkyWayInfo`, so the focus slot holds it: the InfoCard pins the MW card and
 * the URL fan-out fires (its `URL_HASH_FOR` row returns null, clearing
 * `#focus=`).  A milkyWay focus is non-structure, so `runFrame`'s
 * member-isolation fade collapses exactly as a galaxy focus does.
 *
 * The framing mirrors the retired `focusOnMilkyWay`: tween to Sgr A* at
 * `MILKY_WAY_VIEW_DISTANCE_MPC` (well inside the impostor's full-visibility
 * band) while preserving the user's current yaw / pitch / fov so the ride in
 * isn't a disorienting snap.  No-op when `state.cam` is null (pre-bootstrap /
 * post-destroy) — same guard the old method carried.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import { MILKY_WAY_INFO } from '../../../data/milkyWay/milkyWayInfo';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../data/milkyWay/galacticCenter';
import { tweenToCameraSnapshot } from '../camera/cameraSnapshot';

export function commitMilkyWayFocus(state: EngineState): void {
  const cam = state.cam;
  if (!cam) return;

  // Select first so the InfoCard's echo lands before the URL hash flips;
  // focus second so the hash update (cleared, per URL_HASH_FOR.milkyWay)
  // doesn't lap React state; tween last on a consistent frame.
  state.subsystems.selection.setSelected(MILKY_WAY_INFO);
  state.subsystems.selection.setFocused(MILKY_WAY_INFO);

  tweenToCameraSnapshot(state, {
    target: [MILKY_WAY_CENTER_WORLD[0], MILKY_WAY_CENTER_WORLD[1], MILKY_WAY_CENTER_WORLD[2]],
    distance: MILKY_WAY_VIEW_DISTANCE_MPC,
    yaw: cam.yaw,
    pitch: cam.pitch,
    fovYRad: cam.fovYRad,
    near: cam.near,
    far: cam.far,
  });
}
