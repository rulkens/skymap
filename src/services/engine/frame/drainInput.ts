/**
 * drainInput — the single per-frame input-apply site, and the only gesture
 * writer of the live register (`cameraRuntime.lastPose`). Runs at the top of
 * `runFrame`, above the store read the driver table resolves against, so a
 * gesture that began between frames is visible to this frame's produce step.
 * Steps arrive in order, so a wheel tick between two drags still changes the
 * rate the second drag is applied at.
 *
 * Both arms fold the same way: each step folds the live pose into the next
 * and writes the register; the store commits only at gesture end and per
 * at-rest wheel notch (its own atomic gesture) — the live pose is a Resource,
 * not Intent (intent.md's carve-out).
 *
 * `beginDrag` / `cancelCameraTween` are NOT here — the emit sink dispatches them
 * at DOM time (`wireInput`) so a cancel cannot outlive the tween a double-click
 * starts in the same gap.
 */

import { applyInputToCamera } from '../../camera/applyInputToCamera';
import { applyWheelZoom } from '../camera/applyWheelZoom';
import { frameAlignedRoll } from '../camera/frameAlignedRoll';
import { pivotFraming } from '../camera/pivotRadiusMpc';
import { absoluteArm } from '../../../utils/camera/absoluteArm';
import { authoredWorldPose } from '../helpers/authoredWorldPose';
import { bodyMovesThisFrame } from '../../../utils/scene/bodyMovesThisFrame';
import { frameUp } from '../../../utils/camera/frameUp';
import { rotateVec3ByTightMat3T } from '../../../utils/math/rotateVec3ByTightMat3T';
import { deriveSimDays } from '../../../utils/time/deriveSimDays';
import { selectFocusRow } from '../../../state/selection/selectors';
import { selectTimeState } from '../../../state/time/selectors';
import { endDrag, commitCameraPose } from '../../../state/camera/cameraSlice';
import { deriveBodyStates } from './deriveBodyStates';
import { SCENE_BODIES } from '../../../data/bodies/sceneBodies';
import { ORIENTATION_FRAMES } from '../../../data/orientation/orientationFrames';

import type { BodyId } from '../../../@types/data/body/BodyId';
import type { BodyState } from '../../../@types/scene/BodyState';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { InputStep } from '../../../@types/camera/InputStep';
import type { RunFrameDeps } from '../../../@types/engine/frame/RunFrameDeps';
import type { Vec3 } from '../../../@types/math/Vec3';

export function drainInput(state: EngineState, deps: RunFrameDeps, nowMs: number): void {
  const steps = state.subsystems.inputAggregator.drain();
  if (steps.length === 0) return;

  const store = deps.cb.store;
  const cssHeight = deps.canvas.clientHeight || 1;
  const register = state.cameraRuntime.lastPose;

  /**
   * The engaged arm's input owner (spec §6). The GATE is the stored regime
   * (`base.frame`, T15); the POSE is the live register, because the fold
   * commits on a regime EDGE only — mid-tween `base` holds the last crossing
   * pose while the register tracks the animation, and a latch taken against a
   * pose the user never saw sticks for the whole gesture (FW-G). `false`
   * hands the step back to the world-arm path.
   */
  const routeToSurface = (step: InputStep): boolean => {
    const root = store.getState();
    const base = root.camera.base;
    if (base.frame === 'absolute') return false;
    // A playing clip owns the camera in both arms (the driver table's rule).
    if (root.camera.clip !== null) return true;
    // Unreachable: the fold only ever names a body it resolved.
    const body = SCENE_BODIES.find((row) => row.id === base.frame.body);
    if (body === undefined) return true;
    const live = register.current;
    const from =
      live.frame !== 'absolute' && live.frame.body === base.frame.body ? live.pose : base.pose;
    // The configured scene up, rotated into the body's fixed axes for the
    // settle's band blend. A missing snapshot degrades to the pole: the
    // blend collapses to the body ENU.
    const bodyState = deriveBodyStates(deriveSimDays(selectTimeState(root), nowMs)).get(
      base.frame.body,
    );
    const sceneUpLocal: Vec3 = bodyState
      ? rotateVec3ByTightMat3T(frameUp(state.cameraRuntime.upBasis.current), bodyState.orientation)
      : [0, 0, 1];
    const next = state.cameraRuntime.surface.apply(
      from,
      step,
      [deps.canvas.clientWidth || 1, cssHeight],
      state.cameraRuntime.projection.fovYRad,
      body.radiusM,
      sceneUpLocal,
    );
    // EVERY step writes the register — a later step in the same drain chains
    // from it, so an at-rest notch left out of it would be folded over and
    // silently discarded by a drag arriving in the same frame window.
    register.current = { frame: base.frame, pose: next };
    if (step.kind === 'zoom' && !step.duringGesture) {
      // An at-rest notch is its own atomic gesture, so the commit is its
      // gesture end — a register-only write would be invisible (the resting
      // driver renders `base`). Identity, not equality: a declined step
      // returns its input by reference. `frame` rides along BY REFERENCE:
      // one fact in two fields, and the body never changes here.
      if (next !== from) store.dispatch(commitCameraPose(register.current));
    }
    return true;
  };

  /** World-arm fold: live pose → next pose, written to the register. */
  const applyWorldStep = (step: Extract<InputStep, { kind: 'drag' } | { kind: 'zoom' }>): void => {
    const root = store.getState();
    // Same rule as the body arm: a playing clip is not gesture-interruptible,
    // so the step is swallowed rather than folded invisibly under the clip.
    if (root.camera.clip !== null) return;
    const focus = selectFocusRow(root);
    // AUTHORED, not displayed: folding deltas over the projected pose and
    // re-pinning it is the R12b-1 loop (8,519 km of eye walk per frame). The
    // projection re-tilts the folded result at render, so the drag's mapping
    // composes below the tilt — the round-12c disclosed feel change.
    const world = authoredWorldPose(state);
    const poseBasis = ORIENTATION_FRAMES[state.settings.orientation];
    let next = applyInputToCamera(
      world,
      step,
      cssHeight,
      pivotFraming(focus),
      state.cameraRuntime.projection.fovYRad,
      poseBasis,
      state.cameraRuntime.upBasis.current,
    );
    if (step.kind === 'zoom') {
      // The roll ride runs on EVERY driven zoom path — a gesture-held wheel
      // moves altitude exactly like the at-rest one.
      const bodyStates = deriveBodyStates(
        deriveSimDays(selectTimeState(root), nowMs),
      ) as ReadonlyMap<BodyId, BodyState>;
      const roll = frameAlignedRoll(
        world,
        next,
        bodyStates,
        poseBasis,
        state.cameraRuntime.upBasis.current,
      );
      next = { ...next, roll };
    }
    if (step.kind === 'drag' && step.mode === 'pan' && bodyMovesThisFrame(focus)) {
      // Followed-body strafe: the pivot-pin owns the target
      // (`bodyPosition + followPanOffset`), so the pan step's own delta goes
      // to the clock offset the pin reads. Folding it here — where the delta
      // is in hand — is what lets the offset stay clean while the body moves.
      const off = state.cameraRuntime.clock.followPanOffset;
      state.cameraRuntime.clock.followPanOffset = [
        off[0] + next.target[0] - world.target[0],
        off[1] + next.target[1] - world.target[1],
        off[2] + next.target[2] - world.target[2],
      ];
    }
    register.current = absoluteArm(next);
  };

  for (const step of steps) {
    switch (step.kind) {
      case 'gestureStart':
        state.cameraRuntime.surface.onGestureStart();
        break;

      case 'gestureEnd': {
        // ONE commit site for both arms: bake the live register into `base`
        // before `endDrag`, so the resting driver resumes from the pose the
        // user released. Skipped while a clip owns the camera (the gesture was
        // swallowed whole) and across an arm mismatch (a clip ended mid-hold;
        // the fold owns regime edges, a commit here must never flip one).
        const root = store.getState();
        const live = register.current;
        const sameArm =
          live.frame === 'absolute'
            ? root.camera.base.frame === 'absolute'
            : root.camera.base.frame !== 'absolute' &&
              live.frame.body === root.camera.base.frame.body;
        // The register is AUTHORED (pre-projection, R12b-1), so it commits
        // VERBATIM — see `commitCameraPose`'s centre-looking invariant.
        if (root.camera.clip === null && sameArm) {
          store.dispatch(commitCameraPose(live));
        }
        state.cameraRuntime.surface.onGestureEnd();
        store.dispatch(endDrag());
        break;
      }

      case 'drag':
        if (!routeToSurface(step)) applyWorldStep(step);
        break;

      case 'zoom': {
        state.cameraRuntime.lastZoomFactor.current = step.factor; // debug readout
        // Both zoom owners route to the anchored step in a body arm: it owns
        // its range, so `applyWheelZoom`'s three owners go unconsulted (§7).
        if (routeToSurface(step)) break;
        if (step.duringGesture) {
          applyWorldStep(step);
          break;
        }
        // At rest the register is not rendered — `applyWheelZoom` routes the
        // factor to whichever driver actually owns the distance this frame.
        const root = store.getState();
        // Captured BEFORE the call: the followBody branch scales this in
        // place, and the roll ride below needs the notch's pre/post pair.
        const followTargetBefore = state.cameraRuntime.clock.followDistanceTarget;
        const zoomed = applyWheelZoom(
          state.cameraRuntime.clock,
          state.cameraRuntime.prevActiveId.current,
          root.camera.base,
          step.factor,
          root.camera.autoRotate,
          nowMs,
          pivotFraming(selectFocusRow(root)),
        );
        // Ruling 8: the world-arm notch also rides the roll target toward the
        // nearest body's frame — pre AND post poses go in, so the notch's own
        // target movement is ridden in full (a no-op outside the band —
        // `frameAlignedRoll` is where the altitude keying lives). One-deep
        // memo: `runFrame` re-derives the same instant, so this costs no
        // second Kepler solve.
        const bodyStates = deriveBodyStates(
          deriveSimDays(selectTimeState(root), nowMs),
        ) as ReadonlyMap<BodyId, BodyState>;
        const poseBasis = ORIENTATION_FRAMES[state.settings.orientation];
        const upBasis = state.cameraRuntime.upBasis.current;
        if (zoomed !== null && root.camera.base.frame === 'absolute') {
          // `base` is centre-looking by wiring (R12-1), so this pre/post pair
          // is self-consistent under an autoRotate-owned notch too: the
          // DISPLAYED forward differs only by the render-side tilt projection
          // — a pure function of altitude, never a committed pose to chase.
          const roll = frameAlignedRoll(
            root.camera.base.pose,
            zoomed,
            bodyStates,
            poseBasis,
            upBasis,
          );
          // Register too, not only the store: a drag later in this same drain
          // folds from the live register (the body-arm branch's I1 twin).
          register.current = absoluteArm({ ...zoomed, roll });
          store.dispatch(commitCameraPose(register.current));
        } else if (zoomed === null && root.camera.base.frame === 'absolute') {
          // The followBody owner swallowed the distance into its own target;
          // the roll ride must still see the notch's authored altitude move,
          // which HERE is the followDistanceTarget change — feeding the live
          // pose twice gave the ride a zero target delta and left the band
          // roll frozen on the default (focused) path. Pre/post = the live
          // rendered pose at the OLD and NEW target distances (the ease
          // arrives there; the roll may lead it by the sub-second ease lag).
          // Landed on `base.roll`, which the follow pose lerps toward.
          const basePose = root.camera.base.pose;
          const followTargetAfter = state.cameraRuntime.clock.followDistanceTarget;
          // Authored pair (like the branch above): the ride's pre/post poses
          // must live below the projection, or the roll target chases a
          // forward the commit path never holds.
          const live = authoredWorldPose(state);
          const roll = frameAlignedRoll(
            { ...live, distance: followTargetBefore ?? live.distance },
            { ...live, distance: followTargetAfter ?? live.distance },
            bodyStates,
            poseBasis,
            upBasis,
          );
          if (roll !== (basePose.roll ?? 0)) {
            store.dispatch(commitCameraPose(absoluteArm({ ...basePose, roll })));
          }
        }
        break;
      }
    }
  }
}
