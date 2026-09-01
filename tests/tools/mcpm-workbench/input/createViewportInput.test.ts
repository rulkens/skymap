import { describe, expect, it } from 'vitest';
import type { GridBox } from '../../../../tools/mcpm-workbench/@types/GridBox';
import { createViewportInput } from '../../../../tools/mcpm-workbench/src/input/createViewportInput';
import { gizmoArrowLengthMpc } from '../../../../tools/mcpm-workbench/src/gizmo/gizmoArrowLengthMpc';
import { createWorkbenchStore } from '../../../../tools/mcpm-workbench/src/store/createWorkbenchStore';
import type { PreloadedState } from '../../../../tools/mcpm-workbench/src/store/createWorkbenchStore';
import { defaultAppState } from '../../../../tools/mcpm-workbench/src/state/defaultAppState';

/**
 * The task-R6 extraction opens a seam the pre-extraction Viewport.tsx closure never
 * had: the drag state machine driven by a synthetic pointer sequence, no DOM/store
 * double needed beyond the real `createWorkbenchStore`. This pins two things a DOM-level test
 * couldn't cheaply reach: the translate-drag delta math end to end, and the V3 ruling
 * (a drag through the grid controls clears `importedBox`) surviving the move.
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

function fakeCanvas(): HTMLCanvasElement {
  return {
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
    setPointerCapture: () => {},
  } as unknown as HTMLCanvasElement;
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

function pointerEvent(clientX: number, pointerId = 1): PointerEvent {
  return { clientX, clientY: CANVAS_PX / 2, button: 0, pointerId } as unknown as PointerEvent;
}

describe('createViewportInput — translate-drag state machine (task R6 seam)', () => {
  it('translates the box along axis0 and clears importedBox (V3 ruling)', () => {
    const arrowLengthMpc = gizmoArrowLengthMpc([0, 0, DISTANCE], [0, 0, 0], FOV_Y_RAD);
    // A non-null importedBox with the SAME shape as the manual fields below — proves
    // the drag clears it (V3) without also changing the hit-test geometry mid-test.
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
      view: {
        ...defaultAppState.view,
        camera: { yaw: 0, pitch: 0, distance: DISTANCE, autoRotate: false, targetMpc: [0, 0, 0] },
      },
    };
    const { store } = createWorkbenchStore(state);
    const input = createViewportInput({
      canvas: fakeCanvas(),
      store,
      isPreviewVisible: (s) => s.grid.showGridBox, // true by default — no flash timer needed
    });

    input.onPointerDown(pointerEvent(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.getDragHandleId()).toEqual({ kind: 'translate', axis: 0 });

    input.onPointerMove(pointerEvent(clientXFor(ndcXForWorldX(3 * arrowLengthMpc))));

    const grid = store.getState().grid;
    expect(grid.manualCenterMpc[0]).toBeCloseTo(2 * arrowLengthMpc, 6);
    expect(grid.manualCenterMpc[1]).toBeCloseTo(0, 6);
    expect(grid.manualCenterMpc[2]).toBeCloseTo(0, 6);
    expect(grid.importedBox).toBeNull();
  });

  it('pointercancel ends a gizmo drag exactly as pointerup does (minor 7)', () => {
    const arrowLengthMpc = gizmoArrowLengthMpc([0, 0, DISTANCE], [0, 0, 0], FOV_Y_RAD);
    const state: PreloadedState = {
      ...defaultAppState,
      view: {
        ...defaultAppState.view,
        camera: { yaw: 0, pitch: 0, distance: DISTANCE, autoRotate: false, targetMpc: [0, 0, 0] },
      },
    };
    const { store } = createWorkbenchStore(state);
    const input = createViewportInput({
      canvas: fakeCanvas(),
      store,
      isPreviewVisible: (s) => s.grid.showGridBox,
    });

    input.onPointerDown(pointerEvent(clientXFor(ndcXForWorldX(arrowLengthMpc))));
    expect(input.getDragHandleId()).toEqual({ kind: 'translate', axis: 0 });

    input.onPointerCancel();
    expect(input.getDragHandleId()).toBeNull();

    const centerAfterCancel = store.getState().grid.manualCenterMpc;
    // A cancelled sequence's later pointermove must fall to the un-captured branch (hover
    // recompute only) rather than the drag branch — nothing should mutate the grid box.
    input.onPointerMove(pointerEvent(clientXFor(ndcXForWorldX(3 * arrowLengthMpc))));
    expect(store.getState().grid.manualCenterMpc).toEqual(centerAfterCancel);
  });
});
