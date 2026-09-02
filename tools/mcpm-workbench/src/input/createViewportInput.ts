/**
 * createViewportInput — adopts the main app's gesture recognizer
 * (`attachOrbitControls`) + per-frame aggregator instead of hand-rolled DOM
 * handlers. A `dragAnchor` is hit-tested against the gizmo handles once, at
 * gesture start: a hit routes the whole gesture into the gizmo drag math
 * below (dispatched per move, unchanged); a miss routes it into a plain
 * camera register that reaches the store once, at `gestureEnd` or a
 * rest-wheel tick — no per-move dispatch.
 */
import { createInputAggregator } from '../../../../src/services/engine/subsystems/inputAggregator';
import { attachOrbitControls } from '../../../../src/services/camera/orbitControls';
import type { InputGestureEvent } from '../../../../src/@types/camera/InputGestureEvent';
import type { InputStep } from '../../../../src/@types/camera/InputStep';
import type { GizmoDragState } from '../../@types/GizmoDragState';
import type { GizmoHandleId } from '../../@types/GizmoHandleId';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { ViewSlice } from '../../@types/ViewSlice';
import { multiplyQuat } from '../../../../src/utils/math/multiplyQuat';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';
import { orbitDragDelta } from '../../../utils/camera/orbitDragDelta';
import { boxAxesFor } from '../field/boxAxesFor';
import { deriveGridBox } from '../field/deriveGridBox';
import { applyResizeDrag } from '../gizmo/applyResizeDrag';
import { applyTranslateDrag } from '../gizmo/applyTranslateDrag';
import { closestPointOnRayToLine } from '../gizmo/closestPointOnRayToLine';
import { dragRotate } from '../gizmo/dragRotate';
import { gizmoHandleGeometry } from '../gizmo/gizmoHandleGeometry';
import { pickGizmoHandle } from '../gizmo/pickGizmoHandle';
import { setManualCenterMpc, setManualSizeMpc, setRotation } from '../state/grid/gridSlice';
import { commitCameraPose, PITCH_LIMIT, CAMERA_DISTANCE_FLOOR } from '../state/view/viewSlice';
import type { RootState, WorkbenchStore } from '../store/types';
import { arrowLengthMpcFor } from './arrowLengthMpcFor';
import { isAxisDrag } from './isAxisDrag';
import { rayFromPointer } from './rayFromPointer';
import { ringReferenceDirFor } from './ringReferenceDirFor';

const DRAG_SPEED = 0.005;
// Right/middle-drag pans the orbit target along the camera's right/up axes, screen-constant
// dist*0.0016 px rate — galaxy-renderer's createOrbitCameraInput, so the two tools share one
// hand feel. Wheel zoom no longer has its own speed constant here: the shared aggregator
// folds wheel/pinch into a `factor` already scaled by ITS OWN rate (WHEEL_ZOOM_K), applied
// to the register directly below — the same contract `applyInputToCamera`'s zoom branch uses.
const PAN_SPEED = 0.0016;

export type ViewportInputDeps = {
  readonly canvas: HTMLCanvasElement;
  readonly store: WorkbenchStore;
  /** The post-edit-flash reason of boxWireframeVisible's three (F1.7/F1.8) — Viewport's
   *  own `boxPreviewUntil` timer. Deliberately ignores pointer position: the user's mouse
   *  is on a panel control outside the canvas when the flash is the whole point. The other
   *  two reasons (`showGridBox`, an in-flight gizmo drag) are this module's own state,
   *  folded in by `isWireframeVisible` below. */
  readonly isFlashVisible: (now: number) => boolean;
  /** Marks the render-on-demand loop dirty for closure-state-only changes (hover
   *  highlight, gizmo-drag start/end) that neither a store write nor a drained input
   *  step would otherwise surface. */
  readonly markDirty: () => void;
};

export type ViewportInput = {
  /** Applies one frame's worth of aggregated gesture steps to the camera register
   *  (and, at a gesture boundary or rest-wheel, commits it). Returns whether any
   *  step was applied, so the caller can fold it into its own dirty flag. */
  drain(): boolean;
  /** The live camera: the register mid-gesture, the committed store value otherwise
   *  (the store→register adoption below keeps them equal at rest). */
  getCameraPose(): ViewSlice['camera'];
  /** F1.7's hover glyph highlight — recomputed every non-dragging pointermove. */
  getHoverHandle(): GizmoHandleId | null;
  /** The handle currently being dragged, or null — drawBoxPreview's `activeHandle`. */
  getDragHandleId(): GizmoHandleId | null;
  /** boxWireframeVisible's full OR (F1.7/F1.8): the gizmo hit-test/hover-pick below must
   *  agree with frame()'s draw call exactly, or picking an invisible/hidden handle would
   *  hijack an orbit click. `showGridBox` alone is gated on the pointer being over the
   *  canvas; the flash and an in-flight drag are not (F1.8's binding exceptions). */
  isWireframeVisible(s: RootState, now: number): boolean;
  destroy(): void;
};

function cloneTarget(t: Readonly<Vec3>): Vec3 {
  return [t[0], t[1], t[2]];
}

export function createViewportInput(deps: ViewportInputDeps): ViewportInput {
  const { canvas, store, isFlashVisible, markDirty } = deps;

  const aggregator = createInputAggregator();

  // The live drag register (spec's "camera register"): seeded from the committed store
  // value, mutated per aggregated step while a camera gesture is in flight, committed
  // back via `commitCameraPose` at gestureEnd / rest-wheel. Never aliases the store's
  // own `targetMpc` array — RTK's immutableCheck deep-freezes it, and a later pan would
  // throw trying to mutate a frozen array in place.
  let lastSeenCamera = store.getState().view.camera;
  const register: { yaw: number; pitch: number; distance: number; targetMpc: Vec3 } = {
    yaw: lastSeenCamera.yaw,
    pitch: lastSeenCamera.pitch,
    distance: lastSeenCamera.distance,
    targetMpc: cloneTarget(lastSeenCamera.targetMpc),
  };

  // Closure-local, per spec §5's "State flow" — not store fields. `gizmoDragging`'s anchor
  // is captured once at the routing decision (dragAnchor); `hoverHandle` is recomputed on
  // every non-dragging canvas pointermove, purely for drawBoxPreview's glyph highlight.
  let gizmoDragging: GizmoDragState | null = null;
  let hoverHandle: GizmoHandleId | null = null;
  // False on mount (no synthetic enter before the user's first real pointermove) — the
  // showGridBox term of isWireframeVisible stays hidden until a pointerenter proves the
  // mouse is actually over the canvas.
  let pointerInside = false;
  // Which gesture a `dragAnchor` resolved into — decided once per gesture, at the first
  // dragAnchor — and what routes `dragMove`/`gestureEnd` for the rest of it. `null` between
  // gestures (also while a `gestureStart` hasn't yet seen its anchor).
  let route: 'camera' | 'gizmo' | null = null;
  // `gestureStart` always precedes the routing decision (the recognizer emits both
  // synchronously on the first pointerdown), so it can't be forwarded to the aggregator
  // until `dragAnchor` decides the gesture is a camera one.
  let pendingGestureStart = false;

  function isWireframeVisible(s: RootState, now: number): boolean {
    return isFlashVisible(now) || gizmoDragging !== null || (s.grid.showGridBox && pointerInside);
  }

  function getCameraPose(): ViewSlice['camera'] {
    return register;
  }

  function currentPose(): ViewSlice['camera'] {
    return {
      yaw: register.yaw,
      pitch: register.pitch,
      distance: register.distance,
      targetMpc: cloneTarget(register.targetMpc),
    };
  }

  // ── Gizmo hit-test (dragAnchor routing) ─────────────────────────────────────

  function tryStartGizmoDrag(xPx: number, yPx: number): boolean {
    const s = store.getState();
    if (!isWireframeVisible(s, performance.now())) return false;

    const pendingBox = deriveGridBox(s.grid);
    const pointer = { clientX: xPx, clientY: yPx };
    const ray = rayFromPointer(canvas, pointer, getCameraPose());
    const arrowLengthMpc = arrowLengthMpcFor(canvas, getCameraPose(), pendingBox.centerMpc);
    const axes = boxAxesFor(pendingBox.rotation);
    const hit = pickGizmoHandle(ray, gizmoHandleGeometry(pendingBox, axes, arrowLengthMpc));
    if (!hit) return false;

    if (hit.kind === 'rotate') {
      const axisDir = axes[hit.axis];
      const referenceDir = ringReferenceDirFor(axisDir);
      const anchorAngleRad = dragRotate(ray, pendingBox.centerMpc, axisDir, referenceDir);
      // null only on a ray parallel to the ring's own plane — an edge-on view a real click
      // on the visible ring can't produce in practice; falls through to a camera gesture
      // rather than starting an undefined-angle drag.
      if (anchorAngleRad === null) return false;
      gizmoDragging = { handle: hit, anchorAngleRad, anchorRotation: pendingBox.rotation };
    } else {
      const anchorAxisParam = closestPointOnRayToLine(ray, pendingBox.centerMpc, axes[hit.axis]);
      gizmoDragging = { handle: hit, anchorAxisParam, anchorBox: pendingBox };
    }
    markDirty();
    return true;
  }

  function applyGizmoDragMove(xPx: number, yPx: number): void {
    if (!gizmoDragging) return;
    const s = store.getState();
    const pointer = { clientX: xPx, clientY: yPx };

    if (isAxisDrag(gizmoDragging)) {
      const drag = gizmoDragging;
      const axisDir = boxAxesFor(drag.anchorBox.rotation)[drag.handle.axis];
      const ray = rayFromPointer(canvas, pointer, getCameraPose());
      const param = closestPointOnRayToLine(ray, drag.anchorBox.centerMpc, axisDir);
      const deltaMpc = param - drag.anchorAxisParam;
      if (drag.handle.kind === 'translate') {
        store.dispatch(setManualCenterMpc(applyTranslateDrag(drag.anchorBox, axisDir, deltaMpc)));
      } else {
        const { centerMpc, sizeMpc } = applyResizeDrag(
          drag.anchorBox,
          drag.handle.axis,
          axisDir,
          drag.handle.sign,
          deltaMpc,
        );
        store.dispatch(setManualCenterMpc(centerMpc));
        store.dispatch(setManualSizeMpc(sizeMpc));
      }
      return;
    }

    // Fixed-anchor recompute (spec §5): every move recomputes rotation' from the SAME
    // anchorRotation captured at the routing decision — see the original F2.5 comment
    // this logic was ported from (createViewportInput's pre-recognizer version) for why
    // that must not incrementally accumulate onto the live box rotation.
    const drag = gizmoDragging;
    const axisDir = boxAxesFor(drag.anchorRotation)[drag.handle.axis];
    const referenceDir = ringReferenceDirFor(axisDir);
    const centerMpc = deriveGridBox(s.grid).centerMpc;
    const ray = rayFromPointer(canvas, pointer, getCameraPose());
    const angleNow = dragRotate(ray, centerMpc, axisDir, referenceDir);
    if (angleNow !== null) {
      const rotation = multiplyQuat(
        quatFromAxisAngle(axisDir, angleNow - drag.anchorAngleRad),
        drag.anchorRotation,
      );
      store.dispatch(setRotation(rotation));
    }
  }

  // ── Recognizer sink: routes each gesture event to gizmo state or the aggregator ──

  function handleGestureEvent(event: InputGestureEvent): void {
    switch (event.kind) {
      case 'gestureStart':
        route = null;
        pendingGestureStart = true;
        return;

      case 'dragAnchor':
        if (tryStartGizmoDrag(event.xPx, event.yPx)) {
          route = 'gizmo';
          pendingGestureStart = false;
          return;
        }
        route = 'camera';
        if (pendingGestureStart) {
          aggregator.push({ kind: 'gestureStart' });
          pendingGestureStart = false;
        }
        aggregator.push(event);
        return;

      case 'dragMove':
        if (route === 'gizmo') {
          applyGizmoDragMove(event.xPx, event.yPx);
        } else if (route === 'camera') {
          aggregator.push(event);
        }
        return;

      case 'pinchAnchor':
      case 'pinchMove':
        // No multi-touch gizmo gesture exists — a second contact during a gizmo drag
        // is ignored rather than folded into the camera register underneath it.
        if (route !== 'gizmo') aggregator.push(event);
        return;

      case 'wheel':
        // Re-key `duringGesture` on OUR route rather than the recognizer's raw pointer
        // count: a wheel tick during a gizmo drag must still zoom (old behaviour), which
        // means committing immediately (the "rest" path) since a gizmo gestureEnd never
        // commits the camera.
        aggregator.push({ kind: 'wheel', deltaY: event.deltaY, duringGesture: route === 'camera' });
        return;

      case 'gestureEnd':
        if (route === 'gizmo') {
          gizmoDragging = null;
          markDirty();
        } else if (route === 'camera') {
          aggregator.push(event);
        }
        route = null;
        return;
    }
  }

  // ── Per-frame drain: the one apply site for camera gesture steps ────────────

  function applyDragStep(step: Extract<InputStep, { kind: 'drag' }>): void {
    const dx = step.endPx[0] - step.startPx[0];
    const dy = step.endPx[1] - step.startPx[1];

    if (step.mode === 'pan') {
      const { yaw, pitch, distance, targetMpc } = register;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const k = distance * PAN_SPEED;
      register.targetMpc = [
        targetMpc[0] + (-cosY * dx + -sinP * sinY * dy) * k,
        targetMpc[1] + cosP * dy * k,
        targetMpc[2] + (sinY * dx + -sinP * cosY * dy) * k,
      ];
      return;
    }

    const { dYaw, dPitch } = orbitDragDelta(dx, dy, DRAG_SPEED);
    register.yaw -= dYaw;
    register.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, register.pitch + dPitch));
  }

  function drain(): boolean {
    const steps = aggregator.drain();
    if (steps.length === 0) return false;

    for (const step of steps) {
      switch (step.kind) {
        case 'gestureStart':
          // The register already mirrors the committed pose (store→register adoption,
          // below) — nothing to seed.
          break;
        case 'gestureEnd':
          store.dispatch(commitCameraPose(currentPose()));
          break;
        case 'drag':
          applyDragStep(step);
          break;
        case 'zoom':
          register.distance = Math.max(CAMERA_DISTANCE_FLOOR, register.distance * step.factor);
          if (!step.duringGesture) store.dispatch(commitCameraPose(currentPose()));
          break;
      }
    }
    return true;
  }

  // ── Store → register adoption (preset import, reset) ────────────────────────

  const unsubscribeAdopt = store.subscribe(() => {
    const camera = store.getState().view.camera;
    if (camera === lastSeenCamera) return;
    lastSeenCamera = camera;
    // Mid-gesture the register is authoritative; an external write during a drag
    // (there isn't one today, but nothing rules it out) must not yank the camera
    // out from under the user's hand.
    if (route !== null) return;
    register.yaw = camera.yaw;
    register.pitch = camera.pitch;
    register.distance = camera.distance;
    register.targetMpc = cloneTarget(camera.targetMpc);
  });

  // ── Hover / leave bindings (mirrors inputBindings.ts's shape: one small bag) ─

  const onHoverMove = (e: PointerEvent): void => {
    if (route !== null) return; // matches the old `if (!dragging)` gate
    const s = store.getState();
    if (isWireframeVisible(s, performance.now())) {
      const box = deriveGridBox(s.grid);
      const ray = rayFromPointer(canvas, e, getCameraPose());
      const arrowLengthMpc = arrowLengthMpcFor(canvas, getCameraPose(), box.centerMpc);
      hoverHandle = pickGizmoHandle(
        ray,
        gizmoHandleGeometry(box, boxAxesFor(box.rotation), arrowLengthMpc),
      );
    } else {
      hoverHandle = null;
    }
    markDirty();
  };
  const onPointerEnter = (): void => {
    pointerInside = true;
    markDirty(); // wakes render-on-demand so showGridBox's wireframe reappears this frame
  };
  const onPointerLeave = (): void => {
    // Mid-drag the gesture is window-tracked with no pointer capture (F1.8's first
    // exception), so this fires legitimately while a gizmo/camera drag is in flight —
    // `gizmoDragging !== null` in isWireframeVisible covers that, not a check here.
    pointerInside = false;
    hoverHandle = null;
    markDirty();
  };
  canvas.addEventListener('pointermove', onHoverMove);
  canvas.addEventListener('pointerenter', onPointerEnter);
  canvas.addEventListener('pointerleave', onPointerLeave);

  const detachRecognizer = attachOrbitControls(canvas, handleGestureEvent);

  return {
    drain,
    getCameraPose,
    getHoverHandle: () => hoverHandle,
    getDragHandleId: () => gizmoDragging?.handle ?? null,
    isWireframeVisible,
    destroy(): void {
      detachRecognizer();
      unsubscribeAdopt();
      canvas.removeEventListener('pointermove', onHoverMove);
      canvas.removeEventListener('pointerenter', onPointerEnter);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      aggregator.destroy();
    },
  };
}
