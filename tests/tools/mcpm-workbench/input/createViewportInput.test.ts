import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import type { WorkbenchCameraPose } from '../../../../tools/mcpm-workbench/@types/WorkbenchCameraPose';
import { createViewportInput } from '../../../../tools/mcpm-workbench/src/input/createViewportInput';
import { gizmoArrowLengthMpc } from '../../../../tools/mcpm-workbench/src/gizmo/gizmoArrowLengthMpc';
import { createWorkbenchStore } from '../../../../tools/mcpm-workbench/src/store/createWorkbenchStore';
import type { PreloadedState } from '../../../../tools/mcpm-workbench/src/store/createWorkbenchStore';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';
import { commitCameraPose } from '../../../../tools/mcpm-workbench/src/state/view/viewSlice';

/**
 * The task input-port rewrite adopts the main app's `attachOrbitControls` recognizer
 * instead of hand-rolled DOM handlers, so these tests drive it the way
 * `tests/services/camera/orbitControls.test.ts` does: a recorder standing in for the
 * canvas plus a stubbed `window` (vitest runs `node`, no jsdom), firing real
 * pointer/wheel events rather than calling per-event methods that no longer exist on
 * the module's public surface (`drain`/`getCameraPose`/`getHoverHandle`/
 * `getDragHandleId`/`isWireframeVisible`/`destroy`).
 *
 * Camera fixed at yaw=0/pitch=0/target=[0,0,0]/distance=DISTANCE — cameraViewFor then
 * places eyeMpc at [0,0,DISTANCE] looking down -Z, so a pointer at NDC (ndcXForWorldX(x), 0)
 * ray-hits world point [x,0,0] exactly (the box's un-rotated axis0 line), the same
 * "aim the camera at the answer" trick gizmoPickWorldSpaceBasis.test.ts uses.
 */
const CANVAS_PX = 100;
// Far outside the 200 Mpc box (half-extent 100) — DISTANCE must not coincide with any
// handle's own world position, or that handle sits exactly at the ray origin (distance 0
// trivially) and out-picks the intended translate arrow.
const DISTANCE = 1000;
// cameraViewFor's own fixed FOV — not exported (module-private), pinned here too.
const FOV_Y_RAD = Math.PI / 4;
const TAN_HALF_FOV = Math.tan(FOV_Y_RAD / 2);

type Listener = (e: unknown) => void;

function makeRecorder() {
  const listeners: Array<{ type: string; handler: Listener }> = [];
  const target = {
    addEventListener(type: string, handler: Listener): void {
      listeners.push({ type, handler });
    },
    removeEventListener(type: string, handler: Listener): void {
      const idx = listeners.findIndex((l) => l.type === type && l.handler === handler);
      if (idx >= 0) listeners.splice(idx, 1);
    },
  };
  function fire(type: string, event: unknown): void {
    for (const l of [...listeners]) {
      if (l.type === type) l.handler(event);
    }
  }
  return { target, fire };
}

function makeCanvas(): { canvas: HTMLCanvasElement; fire: (type: string, event: unknown) => void } {
  const rec = makeRecorder();
  const canvas = Object.assign(rec.target, {
    width: CANVAS_PX,
    height: CANVAS_PX,
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: CANVAS_PX,
      height: CANVAS_PX,
      right: CANVAS_PX,
      bottom: CANVAS_PX,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  return { canvas: canvas as unknown as HTMLCanvasElement, fire: rec.fire };
}

// Inverse of rayFromPointer's ndc→ray chain for a camera at [0,0,DISTANCE] looking
// down -Z (aspect 1): a ray toward world [worldX,0,0] needs ndcX = worldX / (DISTANCE
// · tan(fovY/2)); clientXFor then re-derives the pixel rayFromPointer's own
// `(clientX/rect.width)*2-1` would turn back into that ndc.
function ndcXForWorldX(worldX: number): number {
  return worldX / (DISTANCE * TAN_HALF_FOV);
}
function clientXFor(ndcX: number): number {
  return ((ndcX + 1) / 2) * CANVAS_PX;
}

function mouseDown(clientX: number, clientY = CANVAS_PX / 2, pointerId = 1) {
  return { pointerId, pointerType: 'mouse', button: 0, clientX, clientY };
}
function mouseMove(clientX: number, clientY = CANVAS_PX / 2, pointerId = 1) {
  return { pointerId, clientX, clientY };
}
function mouseUp(clientX: number, clientY = CANVAS_PX / 2, pointerId = 1) {
  return { pointerId, clientX, clientY };
}

const FIXED_CAMERA: WorkbenchCameraPose & { autoRotate: boolean } = {
  yaw: 0,
  pitch: 0,
  distance: DISTANCE,
  autoRotate: false,
  targetMpc: [0, 0, 0],
};

let win: ReturnType<typeof makeRecorder>;
let originalWindow: unknown;

beforeEach(() => {
  win = makeRecorder();
  const g = globalThis as unknown as Record<string, unknown>;
  originalWindow = g.window;
  g.window = win.target;
});

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (originalWindow === undefined) {
    delete g.window;
  } else {
    g.window = originalWindow;
  }
});

describe('createViewportInput — gizmo routing (dragAnchor hits a handle)', () => {
  it('translates the box along axis0 and clears importedBox (V3 ruling), never touching the camera register', () => {
    const arrowLengthMpc = gizmoArrowLengthMpc([0, 0, DISTANCE], [0, 0, 0], FOV_Y_RAD);
    const importedBox: GridBox = {
      centerMpc: [0, 0, 0],
      sizeMpc: [200, 200, 200],
      dims: [256, 256, 256],
      voxelSizeMpc: 200 / 256,
      rotation: [0, 0, 0, 1],
    };
    const state: PreloadedState = {
      ...defaultAppState,
      grid: { ...defaultAppState.grid, importedBox },
      view: { ...defaultAppState.view, camera: FIXED_CAMERA },
    };
    const { store } = createWorkbenchStore(state);
    const { canvas, fire } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false,
      markDirty: () => {},
    });

    // showGridBox's term of isWireframeVisible is pointer-gated (F1.8) — a real pointerdown
    // is always preceded by the browser's own pointerenter, so the fixture reproduces that.
    fire('pointerenter', {});
    fire('pointerdown', mouseDown(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.getDragHandleId()).toEqual({ kind: 'translate', axis: 0 });

    win.fire('pointermove', mouseMove(clientXFor(ndcXForWorldX(3 * arrowLengthMpc))));

    const grid = store.getState().grid;
    expect(grid.manualCenterMpc[0]).toBeCloseTo(2 * arrowLengthMpc, 6);
    expect(grid.manualCenterMpc[1]).toBeCloseTo(0, 6);
    expect(grid.manualCenterMpc[2]).toBeCloseTo(0, 6);
    expect(grid.importedBox).toBeNull();

    // A gizmo gesture must never touch the camera — neither the live register nor
    // (once it ends) the committed store value.
    expect(input.getCameraPose()).toEqual({
      yaw: 0,
      pitch: 0,
      distance: DISTANCE,
      targetMpc: [0, 0, 0],
    });
    win.fire('pointerup', mouseUp(clientXFor(ndcXForWorldX(3 * arrowLengthMpc))));
    expect(store.getState().view.camera).toEqual(FIXED_CAMERA);
  });

  it('pointercancel ends a gizmo drag exactly as pointerup does', () => {
    const arrowLengthMpc = gizmoArrowLengthMpc([0, 0, DISTANCE], [0, 0, 0], FOV_Y_RAD);
    const state: PreloadedState = {
      ...defaultAppState,
      view: { ...defaultAppState.view, camera: FIXED_CAMERA },
    };
    const { store } = createWorkbenchStore(state);
    const { canvas, fire } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false,
      markDirty: () => {},
    });

    fire('pointerenter', {});
    fire('pointerdown', mouseDown(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.getDragHandleId()).toEqual({ kind: 'translate', axis: 0 });

    win.fire('pointercancel', mouseUp(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.getDragHandleId()).toBeNull();

    // The recognizer drops the pointer on cancel, so a later move for the same id is
    // never even emitted — the grid box must stay exactly where the cancel left it.
    const centerAfterCancel = store.getState().grid.manualCenterMpc;
    win.fire('pointermove', mouseMove(clientXFor(ndcXForWorldX(3 * arrowLengthMpc))));
    expect(store.getState().grid.manualCenterMpc).toEqual(centerAfterCancel);
  });
});

describe('createViewportInput — camera routing (dragAnchor misses every handle)', () => {
  it('mutates only the live register while dragging, then commits once at gestureEnd', () => {
    const state: PreloadedState = {
      ...defaultAppState,
      view: { ...defaultAppState.view, camera: FIXED_CAMERA },
    };
    const { store } = createWorkbenchStore(state);
    const { canvas, fire } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false, // wireframe hidden -> dragAnchor never hit-tests a handle
      markDirty: () => {},
    });

    fire('pointerdown', mouseDown(50, 50));
    win.fire('pointermove', mouseMove(60, 50)); // dx=10, dy=0 -> orbit yaw only

    // Nothing applied yet — the aggregator only folds on drain().
    expect(store.getState().view.camera).toEqual(FIXED_CAMERA);
    expect(input.drain(performance.now())).toBe(true);

    // orbitDragDelta(10, 0, 0.005) -> dYaw=0.05; register.yaw -= dYaw (drag right orbits
    // the world toward the hand, per applyInputToCamera's convention).
    expect(input.getCameraPose().yaw).toBeCloseTo(-0.05, 10);
    // The register moved but nothing has been dispatched — no commit until gestureEnd.
    expect(store.getState().view.camera).toEqual(FIXED_CAMERA);

    win.fire('pointerup', mouseUp(60, 50));
    expect(input.drain(performance.now())).toBe(true);

    expect(store.getState().view.camera.yaw).toBeCloseTo(-0.05, 10);
    expect(store.getState().view.camera.pitch).toBe(0);
    expect(store.getState().view.camera.distance).toBe(DISTANCE);
    expect(store.getState().view.camera.targetMpc).toEqual([0, 0, 0]);
  });

  it('commits a rest-wheel zoom immediately, without waiting for a gesture', () => {
    const state: PreloadedState = {
      ...defaultAppState,
      view: { ...defaultAppState.view, camera: FIXED_CAMERA },
    };
    const { store } = createWorkbenchStore(state);
    const { canvas, fire } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false,
      markDirty: () => {},
    });

    fire('wheel', { deltaY: 100, preventDefault: vi.fn() });
    expect(input.drain(performance.now())).toBe(true);

    expect(store.getState().view.camera.distance).toBeCloseTo(DISTANCE * Math.exp(0.1), 6);
  });
});

describe('createViewportInput — store→register adoption', () => {
  it('adopts an external camera write (preset import / reset) when no gesture is in flight', () => {
    const state: PreloadedState = {
      ...defaultAppState,
      view: { ...defaultAppState.view, camera: FIXED_CAMERA },
    };
    const { store } = createWorkbenchStore(state);
    const { canvas } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false,
      markDirty: () => {},
    });

    store.dispatch(commitCameraPose({ yaw: 1, pitch: 0.2, distance: 50, targetMpc: [1, 2, 3] }));

    expect(input.getCameraPose()).toEqual({
      yaw: 1,
      pitch: 0.2,
      distance: 50,
      targetMpc: [1, 2, 3],
    });
  });
});

describe('createViewportInput — isWireframeVisible pointer-inside gating (F1.8)', () => {
  // showGridBox defaults to true (defaultAppState.grid) — every case below relies on that.
  it('hides the showGridBox-driven wireframe once the pointer leaves the canvas', () => {
    const { store } = createWorkbenchStore(defaultAppState);
    const { canvas, fire } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false,
      markDirty: () => {},
    });

    fire('pointerenter', {});
    expect(input.isWireframeVisible(store.getState(), performance.now())).toBe(true);

    fire('pointerleave', {});
    expect(input.isWireframeVisible(store.getState(), performance.now())).toBe(false);
  });

  it('keeps the wireframe visible while a gizmo drag is in flight, pointer outside or not', () => {
    const arrowLengthMpc = gizmoArrowLengthMpc([0, 0, DISTANCE], [0, 0, 0], FOV_Y_RAD);
    const state: PreloadedState = {
      ...defaultAppState,
      view: { ...defaultAppState.view, camera: FIXED_CAMERA },
    };
    const { store } = createWorkbenchStore(state);
    const { canvas, fire } = makeCanvas();
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => false,
      markDirty: () => {},
    });

    fire('pointerenter', {});
    fire('pointerdown', mouseDown(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.getDragHandleId()).not.toBeNull();

    // Gestures are window-tracked with no pointer capture — leaving the canvas mid-drag
    // is the expected, legitimate path (F1.8's first exception), not a corner case.
    fire('pointerleave', {});
    expect(input.isWireframeVisible(store.getState(), performance.now())).toBe(true);

    win.fire('pointerup', mouseUp(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.isWireframeVisible(store.getState(), performance.now())).toBe(false);
  });

  it('keeps the flash-window wireframe visible with the pointer outside the canvas', () => {
    const { store } = createWorkbenchStore(defaultAppState);
    const { canvas } = makeCanvas();
    let flashActive = true;
    const input = createViewportInput({
      canvas,
      store,
      isFlashVisible: () => flashActive,
      markDirty: () => {},
    });

    // Pointer never entered — the panel edit that triggers the flash happens with the
    // mouse on a slider outside the canvas (F1.8's second exception).
    expect(input.isWireframeVisible(store.getState(), performance.now())).toBe(true);

    flashActive = false;
    expect(input.isWireframeVisible(store.getState(), performance.now())).toBe(false);
  });
});
