/**
 * commitPoiFocus — the shared "we have decided to focus on this POI"
 * protocol.  Parallel to `commitFocus` (galaxy version).
 *
 * ### Why a separate helper from `commitFocus`
 *
 * Galaxy focus and POI focus share the same shape (update subsystem,
 * fire React callback, optional camera tween) but diverge on every
 * concrete: which subsystem, which callback, which distance helper.
 * One helper that branched on a `kind` flag would couple the two
 * concerns; two parallel helpers keep each call surface narrow and the
 * per-domain comments local.
 *
 * ### Tween: built inline, not via `tweenToGalaxy`
 *
 * `tweenToGalaxy` derives its target distance from
 * `focusDistanceMpc(diameterKpc)` — a galaxy-shaped helper that takes
 * a kpc diameter and uses a flat 8× multiplier.  POIs don't have a kpc
 * diameter (they have a Mpc radius), and the per-category framing
 * multipliers (`poiFocusDistanceMpc`) differ across cluster /
 * supercluster / void.  Calling `tweenToGalaxy` with a fudged
 * `diameterKpc` would silently produce the wrong framing.
 *
 * Instead we build the `state.subsystems.tweens.start({...})` payload
 * here, mirroring `tweenToGalaxy`'s shape but plugging in
 * `poiFocusDistanceMpc(category, physicalRadiusMpc)` for `toDistance`.
 *
 * ### Why `setSelectedPoi` + `onPoiFocusChange` fire even when cam is null
 *
 * `state.cam` is null pre-bootstrap and post-destroy.  Skipping the
 * subsystem update + React callback in those windows would strand a
 * deep-link drain (`usePoiUrlSync` parses `#poi=…` and calls
 * `engine.camera.focusOn(poi)` the moment data is ready, BEFORE
 * the camera is necessarily live).  The subsystem update needs to
 * happen so the selected POI's marker descriptor renders with bumped
 * alpha as soon as the renderer comes up; the React callback needs
 * to fire so the URL hash mirrors the intent.
 *
 * Only the camera tween is gated on `state.cam !== null`.  This
 * deliberately diverges from `focusOn` (galaxy), which gates its
 * `onFocusChange` callback on cam availability too — focus on a
 * catalog galaxy without a live camera produces no observable result
 * because the selection halo subsystem also needs the camera to draw,
 * but the POI marker subsystem renders the bumped-alpha highlight from
 * its own per-frame producer regardless.
 */

import { vec3 } from 'gl-matrix';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { PointOfInterest } from '../../../@types/engine/subsystems/PointOfInterest';
import { FOCUS_TWEEN_MS } from '../camera/focusTween';
import { poiFocusDistanceMpc } from '../camera/poiFocusTween';

export type CommitPoiFocusOptions = {
  /** True for double-click (tween + open InfoCard); false for single-click (open only). */
  readonly tween: boolean;
};

/**
 * Run the shared POI focus-commit dance: update the POI subsystem's
 * selection state, fire `onPoiFocusChange`, then optionally start the
 * camera tween.
 *
 * Order matters: `setSelectedPoi` first so the marker descriptor for the
 * selected POI gets its alpha bump on the very next frame (before React
 * has even observed the callback), `onPoiFocusChange` second so the
 * URL hash + InfoCard echo the new focus, tween last so the camera
 * animation begins on a frame where every other state is consistent.
 *
 * `state.cam` null gates ONLY the tween — see module header.
 */
export function commitPoiFocus(
  state: EngineState,
  _cb: EngineCallbacks,
  poi: PointOfInterest,
  options: CommitPoiFocusOptions,
): void {
  // 1. Update the unified selection slot — selectionSubsystem fires
  //    `onPoiFocusChange(poi.id)` (and clears any prior galaxy via
  //    `onSelectChange(null)`) from inside the setter.  Happens
  //    regardless of cam-null state so deep-link drains still drive
  //    the marker bump + URL hash before the camera comes up.
  state.subsystems.selection.setSelected({ kind: 'poi', id: poi.id });

  // 2. Optional tween, gated on cam availability.  POIs without a
  //    physicalRadiusMpc are treated as zero radius by
  //    `poiFocusDistanceMpc`, which then clamps to the 1 Mpc minimum.
  //    In practice every cluster / SC / void POI sets the field, so
  //    this is belt-and-braces.
  if (!options.tween) return;
  const cam = state.cam;
  if (!cam) return;
  const radius = poi.physicalRadiusMpc ?? 0;
  state.subsystems.tweens.start({
    startMs: performance.now(),
    durationMs: FOCUS_TWEEN_MS,
    // vec3.clone copies the target tuple so later mutation of
    // cam.target doesn't corrupt the from-snapshot.
    fromTarget: vec3.clone(cam.target as vec3),
    toTarget: vec3.fromValues(poi.worldPos[0], poi.worldPos[1], poi.worldPos[2]),
    fromDistance: cam.distance,
    toDistance: poiFocusDistanceMpc(poi.category, radius),
    fromYaw: cam.yaw,
    toYaw: cam.yaw,
    fromPitch: cam.pitch,
    toPitch: cam.pitch,
  });
  // Wake the render loop — the tween's per-frame advance keeps it
  // ticking until completion.
  state.subsystems.scheduler.requestRender();
}
