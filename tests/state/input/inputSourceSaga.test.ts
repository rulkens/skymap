/**
 * inputSourceSaga over a hand-driven channel, with `nextAnimationFrame` stubbed
 * to a promise the test resolves, so "one dispatch per frame" is observable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buffers, eventChannel, runSaga, type Task } from 'redux-saga';

import { inputSourceSaga } from '../../../src/state/input/inputSourceSaga';
import {
  inputGestureEnded,
  inputGestureStarted,
  inputHovered,
  inputMoved,
  inputSourceAttached,
  inputSourceDetached,
  inputSourceResized,
  inputTapped,
} from '../../../src/state/input/inputSlice';
import { focusSelected } from '../../../src/state/selection/focusSelected';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';
import type { UnitPoint } from '../../../src/@types/input/UnitPoint';

let resolveFrame: () => void = () => {};
vi.mock('../../../src/utils/browser/nextAnimationFrame', () => ({
  nextAnimationFrame: () =>
    new Promise<void>((resolve) => {
      resolveFrame = resolve;
    }),
}));

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
const ALT = { ...NO_MODS, alt: true };
const intentsOf = (): unknown[] =>
  actions
    .filter((a) => a.type === inputGestureStarted.type)
    .map((a) => (a.payload as { intent: unknown }).intent);
let t = 0;

const resize = (widthPx: number, heightPx: number): DeviceEvent => ({
  kind: 'resize',
  t: (t += 10),
  widthPx,
  heightPx,
});
const pointer = (
  kind: 'down' | 'move' | 'up',
  at: UnitPoint,
  button: 0 | 1 | 2 = 0,
  mods = NO_MODS,
): DeviceEvent => ({
  kind,
  t: (t += 10),
  pointer: 1,
  pointerType: 'mouse',
  button,
  at,
  mods,
});
const wheel = (at: UnitPoint): DeviceEvent => ({
  kind: 'wheel',
  t: (t += 10),
  ratio: 1.1,
  at,
  mods: NO_MODS,
});

const A = { x: 0.5, y: 0.5 };
const B = { x: 0.6, y: 0.5 };

let emit: (e: DeviceEvent) => void;
let actions: { type: string; payload?: unknown }[];
let task: Task;
let scheme: 'skymap' | 'openspace';

const types = () => actions.map((a) => a.type);
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  t = 0;
  scheme = 'skymap';
  actions = [];
  const channel = eventChannel<DeviceEvent>((e) => {
    emit = e;
    return () => {};
  }, buffers.expanding());
  task = runSaga(
    {
      dispatch: (a: { type: string }) => actions.push(a),
      getState: () => ({ settings: { cameraControls: { scheme } } }),
    },
    inputSourceSaga,
    'canvas',
    channel,
  );
});

describe('inputSourceSaga', () => {
  it('the source attaches on the first resize with width over height as aspect', () => {
    emit(pointer('down', A));
    emit(resize(200, 100));
    expect(actions).toEqual([inputSourceAttached({ source: 'canvas', aspect: 2 })]);
  });

  it('an edge flushes buffered motion before it is put', () => {
    emit(resize(200, 100));
    emit(pointer('down', A));
    emit(pointer('move', B));
    emit(pointer('up', B));
    expect(types()).toEqual([
      inputSourceAttached.type,
      inputGestureStarted.type,
      inputMoved.type,
      inputGestureEnded.type,
    ]);
  });

  it('a resize flushes before inputSourceResized', () => {
    emit(resize(200, 100));
    emit(pointer('move', A));
    emit(resize(100, 100));
    expect(actions.slice(1)).toEqual([
      inputHovered({ source: 'canvas', at: A }),
      inputSourceResized({ source: 'canvas', aspect: 1 }),
    ]);
  });

  it('motion inside one frame is one inputMoved', async () => {
    emit(resize(200, 100));
    emit(pointer('down', A));
    emit(pointer('move', { x: 0.55, y: 0.5 }));
    emit(pointer('move', B));
    expect(types()).not.toContain(inputMoved.type);
    resolveFrame();
    await settle();
    const moved = actions.filter((a) => a.type === inputMoved.type);
    expect(moved).toHaveLength(1);
    expect((moved[0]!.payload as { motion: unknown[] }).motion).toHaveLength(2);
  });

  it('a wheel with no gesture open is held false; during one it is held true', async () => {
    emit(resize(200, 100));
    emit(wheel(A));
    resolveFrame();
    await settle();
    emit(pointer('down', A));
    emit(wheel(A));
    resolveFrame();
    await settle();
    const held = actions
      .filter((a) => a.type === inputMoved.type)
      .map((a) => (a.payload as { motion: { held: boolean }[] }).motion[0]!.held);
    expect(held).toEqual([false, true]);
  });

  it('a pan-bound tap is not reported', () => {
    emit(resize(200, 100));
    emit(pointer('down', A, 2));
    emit(pointer('up', A, 2));
    expect(types()).not.toContain(inputTapped.type);
  });

  it('a doubleTap puts inputTapped then focusSelected', () => {
    emit(resize(200, 100));
    emit(pointer('down', A));
    emit(pointer('up', A));
    emit(pointer('down', A));
    emit(pointer('up', A));
    expect(types().slice(-3)).toEqual([
      inputGestureEnded.type,
      inputTapped.type,
      focusSelected.type,
    ]);
  });

  it('cancelling the saga ends an open gesture before detaching', () => {
    emit(resize(200, 100));
    emit(pointer('down', A));
    task.cancel();
    expect(types().slice(-2)).toEqual([inputGestureEnded.type, inputSourceDetached.type]);
  });

  describe('under the openspace scheme', () => {
    beforeEach(() => {
      scheme = 'openspace';
    });

    it('a left tap selects and a double-tap focuses', () => {
      emit(resize(200, 100));
      emit(pointer('down', A));
      emit(pointer('up', A));
      expect(types()).toContain(inputTapped.type);
      emit(pointer('down', A));
      emit(pointer('up', A));
      expect(types().slice(-1)).toEqual([focusSelected.type]);
    });

    it('a right-button release does not pick', () => {
      emit(resize(200, 100));
      emit(pointer('down', A, 2));
      emit(pointer('up', A, 2));
      expect(types()).not.toContain(inputTapped.type);
      expect(types()).not.toContain(focusSelected.type);
    });

    it("a scheme toggle mid-drag keeps the running gesture's intent and tap rule", () => {
      emit(resize(200, 100));
      emit(pointer('down', A, 0, ALT));
      scheme = 'skymap';
      emit(pointer('up', A, 0, ALT));
      // Alt + left is navZoom under openspace, which never taps; under skymap it would be an
      // orbit and would pick. The next press reads the new scheme.
      expect(intentsOf()).toEqual(['navZoom']);
      expect(types()).not.toContain(inputTapped.type);
      emit(pointer('down', A));
      expect(intentsOf()).toEqual(['navZoom', 'orbit']);
    });
  });
});
