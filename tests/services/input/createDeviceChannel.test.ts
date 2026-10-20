// @vitest-environment jsdom

/**
 * createDeviceChannel — positions are canvas-relative (the dome's offset,
 * squared canvas gets correct rays), and window moves count only over the
 * canvas or for a pointer pressed on it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { EventChannel } from 'redux-saga';

import { createDeviceChannel } from '../../../src/services/input/createDeviceChannel';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';

let canvas: HTMLCanvasElement;
let panel: HTMLDivElement;
let channel: EventChannel<DeviceEvent>;
let events: DeviceEvent[];

function firePointer(target: Element, type: string, clientX: number, clientY: number): void {
  const e = new MouseEvent(type, { clientX, clientY, bubbles: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse' });
  target.dispatchEvent(e);
}

function drain(): void {
  channel.flush((batch) => {
    if (Array.isArray(batch)) events.push(...batch);
  });
}

beforeEach(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
  canvas = document.createElement('canvas');
  panel = document.createElement('div');
  document.body.append(canvas, panel);
  // The canvas sits 100 px right and 50 px down of the viewport origin, 200 × 100.
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 200, height: 100 }) as DOMRect;
  channel = createDeviceChannel(canvas);
  events = [];
});

afterEach(() => {
  channel.close();
  canvas.remove();
  panel.remove();
});

describe('createDeviceChannel', () => {
  it('a window move over another element with nothing pressed emits nothing', () => {
    firePointer(panel, 'pointermove', 150, 75);
    drain();
    expect(events).toEqual([]);
  });

  it('a move over the canvas emits hover input at canvas-relative units', () => {
    firePointer(canvas, 'pointermove', 150, 75);
    drain();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'move', at: { x: 0.25, y: 0.25 } });
  });

  it('a press started on the canvas keeps emitting moves outside it', () => {
    firePointer(canvas, 'pointerdown', 150, 75);
    firePointer(panel, 'pointermove', 400, 75);
    drain();
    expect(events.map((e) => e.kind)).toEqual(['down', 'move']);
    expect(events[1]).toMatchObject({ at: { x: 1.5, y: 0.25 } });
  });
});
