/**
 * createViewportInput — pointer/wheel interpretation for Viewport's canvas: orbit-camera
 * pan/zoom AND the gizmo hover/pick/drag state machine share these handlers (a gizmo hit
 * short-circuits the orbit drag), so they move together rather than split across two
 * modules. Viewport owns DOM subscription and the render-loop's `points`/`box` state;
 * this module owns the hover/drag closures and applies drag deltas through the same
 * grid/view setters Viewport used to call inline.
 */
import type { AppState } from '../../@types/AppState';
import type { GizmoDragState } from '../../@types/GizmoDragState';
import type { GizmoHandleId } from '../../@types/GizmoHandleId';
import type { Store } from '../../@types/Store';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { multiplyQuat } from '../../../../src/utils/math/multiplyQuat';
import { quatFromAxisAngle } from '../../../../src/utils/math/quatFromAxisAngle';
import { exponentialZoomDistance } from '../../../utils/camera/exponentialZoomDistance';
import { orbitDragDelta } from '../../../utils/camera/orbitDragDelta';
import { boxAxesFor } from '../field/boxAxesFor';
import { deriveGridBox } from '../field/deriveGridBox';
import { applyResizeDrag } from '../gizmo/applyResizeDrag';
import { applyTranslateDrag } from '../gizmo/applyTranslateDrag';
import { closestPointOnRayToLine } from '../gizmo/closestPointOnRayToLine';
import { dragRotate } from '../gizmo/dragRotate';
import { gizmoHandleGeometry } from '../gizmo/gizmoHandleGeometry';
import { pickGizmoHandle } from '../gizmo/pickGizmoHandle';
import { setManualCenterMpc, setManualSizeMpc, setRotation } from '../state/slices/gridSlice';
import { setCameraDistance, setCameraTarget, setCameraYawPitch } from '../state/slices/viewSlice';
import { arrowLengthMpcFor } from './arrowLengthMpcFor';
import { isAxisDrag } from './isAxisDrag';
import { rayFromPointer } from './rayFromPointer';
import { ringReferenceDirFor } from './ringReferenceDirFor';

const DRAG_SPEED = 0.005;
// Exponential in the raw wheel delta — galaxy-renderer's createOrbitCameraInput
// constant, so both tools zoom with the same hand feel; a sign-only step ignores
// delta magnitude and crawls on trackpads.
const ZOOM_SPEED = 0.0018;
const PAN_SPEED = 0.0016;

export type ViewportInputDeps = {
  readonly canvas: HTMLCanvasElement;
  readonly store: Store<AppState>;
  /** The persistent-toggle/post-edit-flash pair of boxWireframeVisible's three reasons
   *  (F1.7) — Viewport's own render-loop state (`showGridBox`, `boxPreviewUntil`). The
   *  third reason, an in-flight gizmo drag, is this module's own state and is ORed in by
   *  `isWireframeVisible` below, so callers never recombine the three by hand. */
  readonly isPreviewVisible: (s: AppState, now: number) => boolean;
};

export type ViewportInput = {
  readonly onPointerDown: (e: PointerEvent) => void;
  readonly onPointerUp: () => void;
  /** A cancelled sequence (OS gesture takeover, tab switch, stylus lift) gets the exact
   *  same end-of-drag treatment as pointerup — otherwise gizmoDragging stays set and every
   *  later pointermove keeps mutating the grid box with a capture that no longer exists. */
  readonly onPointerCancel: () => void;
  readonly onPointerMove: (e: PointerEvent) => void;
  /** Clears the hover highlight when the pointer leaves the canvas — it is not otherwise
   *  recomputed once the pointer stops moving over the canvas. */
  readonly onPointerLeave: () => void;
  readonly onWheel: (e: WheelEvent) => void;
  readonly onContextMenu: (e: Event) => void;
  /** F1.7's hover glyph highlight — recomputed every non-dragging pointermove. */
  getHoverHandle(): GizmoHandleId | null;
  /** The handle currently being dragged, or null — drawBoxPreview's `activeHandle`. */
  getDragHandleId(): GizmoHandleId | null;
  /** boxWireframeVisible's full OR (F1.7): the gizmo hit-test/hover-pick below must agree
   *  with frame()'s draw call exactly, or picking an invisible handle would hijack an
   *  orbit click while the wireframe is off. */
  isWireframeVisible(s: AppState, now: number): boolean;
};

export function createViewportInput(deps: ViewportInputDeps): ViewportInput {
  const { canvas, store, isPreviewVisible } = deps;

  let dragging = false;
  let panning = false;
  let lastX = 0;
  let lastY = 0;
  // Closure-local, per spec §5's "State flow" — not store fields. gizmoDragging's anchor
  // is captured once at pointer-down; hoverHandle is recomputed every non-dragging move,
  // purely for drawBoxPreview's glyph highlight.
  let gizmoDragging: GizmoDragState | null = null;
  let hoverHandle: GizmoHandleId | null = null;

  function isWireframeVisible(s: AppState, now: number): boolean {
    return isPreviewVisible(s, now) || gizmoDragging !== null;
  }

  const onPointerDown = (e: PointerEvent): void => {
    const s = store.getSnapshot();
    if (isWireframeVisible(s, performance.now())) {
      const pendingBox = deriveGridBox(s.grid);
      const ray = rayFromPointer(canvas, e, s);
      const arrowLengthMpc = arrowLengthMpcFor(canvas, s, pendingBox.centerMpc);
      const axes = boxAxesFor(pendingBox.rotation);
      const hit = pickGizmoHandle(ray, gizmoHandleGeometry(pendingBox, axes, arrowLengthMpc));
      if (hit && hit.kind === 'rotate') {
        const axisDir = axes[hit.axis];
        const referenceDir = ringReferenceDirFor(axisDir);
        const anchorAngleRad = dragRotate(ray, pendingBox.centerMpc, axisDir, referenceDir);
        // null only on a ray parallel to the ring's own plane — an edge-on view a real click
        // on the visible ring can't produce in practice; falls through to orbit rather than
        // starting an undefined-angle drag.
        if (anchorAngleRad !== null) {
          gizmoDragging = { handle: hit, anchorAngleRad, anchorRotation: pendingBox.rotation };
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      } else if (hit) {
        const anchorAxisParam = closestPointOnRayToLine(ray, pendingBox.centerMpc, axes[hit.axis]);
        gizmoDragging = { handle: hit, anchorAxisParam, anchorBox: pendingBox };
        canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    dragging = true;
    panning = e.button === 2 || e.button === 1;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };

  const endDragState = (): void => {
    dragging = false;
    panning = false;
    gizmoDragging = null;
  };
  const onPointerUp = endDragState;
  const onPointerCancel = endDragState;

  const onPointerLeave = (): void => {
    hoverHandle = null;
  };

  const onPointerMove = (e: PointerEvent): void => {
    const s = store.getSnapshot();

    if (gizmoDragging) {
      if (isAxisDrag(gizmoDragging)) {
        const drag = gizmoDragging;
        const axisDir = boxAxesFor(drag.anchorBox.rotation)[drag.handle.axis];
        const ray = rayFromPointer(canvas, e, s);
        const param = closestPointOnRayToLine(ray, drag.anchorBox.centerMpc, axisDir);
        const deltaMpc = param - drag.anchorAxisParam;
        if (drag.handle.kind === 'translate') {
          const centerMpc = applyTranslateDrag(drag.anchorBox, axisDir, deltaMpc);
          store.setState((st) => ({ ...st, grid: setManualCenterMpc(st.grid, centerMpc) }));
        } else {
          const { centerMpc, sizeMpc } = applyResizeDrag(
            drag.anchorBox,
            drag.handle.axis,
            axisDir,
            drag.handle.sign,
            deltaMpc,
          );
          store.setState((st) => ({
            ...st,
            grid: setManualSizeMpc(setManualCenterMpc(st.grid, centerMpc), sizeMpc),
          }));
        }
      } else {
        // Fixed-anchor recompute (spec §5): every pointermove recomputes rotation' from the
        // SAME anchorRotation captured at pointerdown — no incremental accumulation onto the
        // previous frame's rotation, no renormalize. axisDir is invariant under its own
        // rotation (rotating about an axis never moves that axis), so deriving it from
        // anchorRotation rather than the live (already-changing) box rotation is exact, not
        // an approximation. centerMpc alone is read live: unlike translate/resize, a rotate
        // drag never writes it, so there is no re-derive feedback loop to guard against
        // (drag.anchorBox's whole reason to exist for THAT pair).
        const drag = gizmoDragging;
        const axisDir = boxAxesFor(drag.anchorRotation)[drag.handle.axis];
        const referenceDir = ringReferenceDirFor(axisDir);
        const centerMpc = deriveGridBox(s.grid).centerMpc;
        const ray = rayFromPointer(canvas, e, s);
        const angleNow = dragRotate(ray, centerMpc, axisDir, referenceDir);
        if (angleNow !== null) {
          const rotation = multiplyQuat(
            quatFromAxisAngle(axisDir, angleNow - drag.anchorAngleRad),
            drag.anchorRotation,
          );
          store.setState((st) => ({ ...st, grid: setRotation(st.grid, rotation) }));
        }
      }
      return;
    }

    if (!dragging) {
      if (isWireframeVisible(s, performance.now())) {
        const box = deriveGridBox(s.grid);
        const ray = rayFromPointer(canvas, e, s);
        const arrowLengthMpc = arrowLengthMpcFor(canvas, s, box.centerMpc);
        hoverHandle = pickGizmoHandle(
          ray,
          gizmoHandleGeometry(box, boxAxesFor(box.rotation), arrowLengthMpc),
        );
      } else {
        hoverHandle = null;
      }
      return;
    }

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (panning) {
      // Right/middle-drag pans the orbit target along the camera's right/up axes,
      // grab-the-world signs and screen-constant dist*0.0016 px rate — both
      // galaxy-renderer's createOrbitCameraInput, so the two tools share one hand feel.
      store.setState((s) => {
        const { yaw, pitch, distance, targetMpc } = s.view.camera;
        const cosY = Math.cos(yaw);
        const sinY = Math.sin(yaw);
        const cosP = Math.cos(pitch);
        const sinP = Math.sin(pitch);
        const k = distance * PAN_SPEED;
        const next: Vec3 = [
          targetMpc[0] + (-cosY * dx + -sinP * sinY * dy) * k,
          targetMpc[1] + cosP * dy * k,
          targetMpc[2] + (sinY * dx + -sinP * cosY * dy) * k,
        ];
        return { ...s, view: setCameraTarget(s.view, next) };
      });
      return;
    }
    const { dYaw, dPitch } = orbitDragDelta(dx, dy, DRAG_SPEED);
    store.setState((s) => ({
      ...s,
      view: setCameraYawPitch(s.view, s.view.camera.yaw - dYaw, s.view.camera.pitch + dPitch),
    }));
  };

  const onContextMenu = (e: Event): void => e.preventDefault();
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    store.setState((s) => ({
      ...s,
      view: setCameraDistance(
        s.view,
        exponentialZoomDistance(s.view.camera.distance, e.deltaY, ZOOM_SPEED),
      ),
    }));
  };

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onPointerMove,
    onPointerLeave,
    onWheel,
    onContextMenu,
    getHoverHandle: () => hoverHandle,
    getDragHandleId: () => gizmoDragging?.handle ?? null,
    isWireframeVisible,
  };
}
