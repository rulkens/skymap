/**
 * The terrain-pick marker's own pointer read: it holds a position only for a hovering
 * mouse with the overlay on, and it is the only thing that wakes the loop for the marker.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTerrainPickCursor } from '../../../../../src/layers/body/terrainPick/subsystems/terrainPickCursor';

type Move = { pointerType?: string; buttons?: number; offsetX?: number; offsetY?: number };

function move(canvas: EventTarget, init: Move = {}): void {
  const { pointerType = 'mouse', buttons = 0, offsetX = 10, offsetY = 20 } = init;
  canvas.dispatchEvent(
    Object.assign(new Event('pointermove'), { pointerType, buttons, offsetX, offsetY }),
  );
}

const canvasOn = (viewRig: string): HTMLCanvasElement =>
  Object.assign(new EventTarget(), { dataset: { viewRig } }) as unknown as HTMLCanvasElement;

let on: boolean;
let requestRender: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  on = true;
  requestRender = vi.fn<() => void>();
  vi.stubGlobal('window', { devicePixelRatio: 2 });
});

describe('createTerrainPickCursor', () => {
  it('a hovering mouse with the overlay on lands in texture pixels and wakes a frame', () => {
    const canvas = canvasOn('mono');
    const cursor = createTerrainPickCursor(canvas, () => on, requestRender);
    move(canvas);
    expect(cursor.texPx).toEqual([20, 40]);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the overlay off', false, {}],
    ['a touch', true, { pointerType: 'touch' }],
    ['a pen', true, { pointerType: 'pen' }],
    ['a held button, which is a camera gesture', true, { buttons: 1 }],
  ] as const)('%s neither moves the cursor nor wakes a frame', (_name, overlay, init) => {
    on = overlay;
    const canvas = canvasOn('mono');
    const cursor = createTerrainPickCursor(canvas, () => on, requestRender);
    move(canvas, init);
    expect(cursor.texPx).toBeNull();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('a dome frame has no single cursor ray, so nothing is ever read there', () => {
    const canvas = canvasOn('dome');
    const cursor = createTerrainPickCursor(canvas, () => on, requestRender);
    move(canvas);
    expect(cursor.texPx).toBeNull();
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('destroy stops listening', () => {
    const canvas = canvasOn('mono');
    const cursor = createTerrainPickCursor(canvas, () => on, requestRender);
    cursor.destroy();
    move(canvas);
    expect(cursor.texPx).toBeNull();
    expect(requestRender).not.toHaveBeenCalled();
  });
});
