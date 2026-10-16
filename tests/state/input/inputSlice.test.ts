/**
 * inputSlice tests — a bare store over the real rootReducer (no sagas), so each
 * case reads exactly what the reducer folded.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import {
  inputSourceAttached,
  inputSourceResized,
  inputSourceDetached,
  inputGestureStarted,
  inputGestureEnded,
  inputMoved,
  inputHovered,
  inputTapped,
  inputConsumed,
  inputPickResolved,
} from '../../../src/state/input/inputSlice';
import { selectPendingInput, selectPickRequests } from '../../../src/state/input/selectors';
import { inputRoute } from '../../../src/store/constants';
import type { Motion } from '../../../src/@types/input/Motion';

function build() {
  const store = configureStore({ reducer: rootReducer });
  store.dispatch(inputSourceAttached({ source: 'canvas', aspect: 2 }));
  store.dispatch(inputSourceAttached({ source: 'remote', aspect: 1 }));
  return store;
}

const orbit = (over: Partial<Motion> = {}): Motion => ({
  intent: 'orbit',
  dx: 0.1,
  dy: 0.2,
  ratio: 1,
  at: { x: 0.5, y: 0.5 },
  held: true,
  ...over,
});

describe('inputSlice', () => {
  it('consecutive same-source same-intent motion merges: dx and dy add, ratio multiplies, at is the newest', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(
      inputMoved({
        source: 'canvas',
        motion: [
          orbit({ ratio: 2 }),
          orbit({ dx: 0.3, dy: 0.4, ratio: 3, at: { x: 0.1, y: 0.9 } }),
        ],
      }),
    );
    store.dispatch(inputMoved({ source: 'canvas', motion: [orbit()] }));
    expect(selectPendingInput(store.getState())).toEqual([
      { kind: 'start', source: 'canvas' },
      expect.objectContaining({
        kind: 'motion',
        dx: expect.closeTo(0.5),
        dy: expect.closeTo(0.8),
        ratio: 6,
        at: { x: 0.5, y: 0.5 },
      }),
    ]);
  });

  it('a change of intent or held starts a new pending step', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(
      inputMoved({
        source: 'canvas',
        motion: [orbit(), orbit({ intent: 'pan' }), orbit({ intent: 'pan', held: false })],
      }),
    );
    const kinds = selectPendingInput(store.getState()).map((s) =>
      s.kind === 'motion' ? `${s.intent}:${s.held}` : s.kind,
    );
    expect(kinds).toEqual(['start', 'orbit:true', 'pan:true', 'pan:false']);
  });

  it('motion is stamped with the source aspect at fold time, and a resize applies to later motion only', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(inputMoved({ source: 'canvas', motion: [orbit()] }));
    store.dispatch(inputSourceResized({ source: 'canvas', aspect: 0.5 }));
    store.dispatch(inputMoved({ source: 'canvas', motion: [orbit()] }));
    const aspects = selectPendingInput(store.getState()).flatMap((s) =>
      s.kind === 'motion' ? [s.aspect] : [],
    );
    expect(aspects).toEqual([2, 0.5]);
  });

  it("a takeover appends the old owner's end before the new start", () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(inputGestureStarted({ source: 'remote', intent: 'pan' }));
    expect(selectPendingInput(store.getState())).toEqual([
      { kind: 'start', source: 'canvas' },
      { kind: 'end', source: 'canvas' },
      { kind: 'start', source: 'remote' },
    ]);
    expect(store.getState()[inputRoute].owner).toBe('remote');
  });

  it('held motion from a non-owner is dropped; a held: false notch from it is kept', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(
      inputMoved({
        source: 'remote',
        motion: [orbit(), orbit({ intent: 'zoom', dx: 0, dy: 0, ratio: 1.1, held: false })],
      }),
    );
    const motion = selectPendingInput(store.getState()).filter((s) => s.kind === 'motion');
    expect(motion).toEqual([
      expect.objectContaining({ source: 'remote', intent: 'zoom', held: false, aspect: 1 }),
    ]);
  });

  it('inputGestureEnded from a non-owner is ignored', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(inputGestureEnded({ source: 'remote' }));
    expect(selectPendingInput(store.getState())).toEqual([{ kind: 'start', source: 'canvas' }]);
    expect(store.getState()[inputRoute].owner).toBe('canvas');
  });

  it('a gesture start replaces the hover request with at null', () => {
    const store = build();
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.2, y: 0.3 } }));
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    expect(selectPickRequests(store.getState()).hover).toEqual({
      source: 'canvas',
      at: null,
      seq: 2,
    });
  });

  it('hover is stored only while no source owns a gesture', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    const during = selectPickRequests(store.getState()).hover;
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.2, y: 0.3 } }));
    expect(selectPickRequests(store.getState()).hover).toBe(during);

    store.dispatch(inputGestureEnded({ source: 'canvas' }));
    store.dispatch(inputHovered({ source: 'canvas', at: { x: 0.2, y: 0.3 } }));
    expect(selectPickRequests(store.getState()).hover?.at).toEqual({ x: 0.2, y: 0.3 });
  });

  it('inputConsumed clears pending, and motion dispatched after it survives into the next read', () => {
    const store = build();
    store.dispatch(inputGestureStarted({ source: 'canvas', intent: 'orbit' }));
    store.dispatch(inputMoved({ source: 'canvas', motion: [orbit()] }));
    store.dispatch(inputConsumed());
    expect(selectPendingInput(store.getState())).toEqual([]);

    store.dispatch(inputMoved({ source: 'canvas', motion: [orbit()] }));
    expect(selectPendingInput(store.getState())).toEqual([
      expect.objectContaining({ kind: 'motion', source: 'canvas', dx: 0.1 }),
    ]);
  });

  it('a stale inputPickResolved leaves a newer request in place', () => {
    const store = build();
    store.dispatch(inputTapped({ source: 'canvas', at: { x: 0.1, y: 0.1 } }));
    store.dispatch(inputTapped({ source: 'canvas', at: { x: 0.9, y: 0.9 } }));
    store.dispatch(inputPickResolved({ which: 'select', seq: 1 }));
    expect(selectPickRequests(store.getState()).select).toEqual({
      source: 'canvas',
      at: { x: 0.9, y: 0.9 },
      seq: 2,
    });

    store.dispatch(inputPickResolved({ which: 'select', seq: 2 }));
    expect(selectPickRequests(store.getState()).select).toBeNull();
  });

  it('inputSourceDetached removes the source record', () => {
    const store = build();
    store.dispatch(inputSourceDetached({ source: 'remote' }));
    expect(store.getState()[inputRoute].sources).toEqual({ canvas: { aspect: 2 } });
  });
});
