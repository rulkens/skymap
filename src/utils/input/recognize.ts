/**
 * recognize — the pure device-event → gesture step. Replaces the recognizing half
 * of `attachOrbitControls`: same rules, but positions arrive as unit points and
 * the clock is the event's own `t`, so a remote source can be replayed in a test.
 *
 * Pixels appear only for the two compares that need an isotropic metric (tap slop,
 * pinch span); the surface size comes from `resize` events.
 */

import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { Gesture } from '../../@types/input/Gesture';
import type { Press } from '../../@types/input/Press';
import type { RecognizerState } from '../../@types/input/RecognizerState';
import type { UnitPoint } from '../../@types/input/UnitPoint';
import { DOUBLE_TAP_MS } from '../../data/input/doubleTapMs';
import { DOUBLE_TAP_SLOP_PX } from '../../data/input/doubleTapSlopPx';
import { TAP_SLOP_PX } from '../../data/input/tapSlopPx';

type Step = { readonly state: RecognizerState; readonly gestures: readonly Gesture[] };

const spanPx = (s: RecognizerState, pts: Iterable<UnitPoint>): number => {
  const [a, b] = pts;
  return a && b ? Math.hypot((a.x - b.x) * s.widthPx, (a.y - b.y) * s.heightPx) : 0;
};

const distSqPx = (s: RecognizerState, a: UnitPoint, b: UnitPoint): number =>
  ((a.x - b.x) * s.widthPx) ** 2 + ((a.y - b.y) * s.heightPx) ** 2;

type PointerEv = Extract<DeviceEvent, { kind: 'down' | 'move' | 'up' | 'cancel' }>;

function onDown(s: RecognizerState, e: PointerEv): Step {
  // A mouse is strictly single-pointer: with no pointer capture a release outside
  // the window sends no `up`, and the stale entry would turn the next click into a
  // pinch. Touch gets implicit capture, so only a mouse heals.
  const base: RecognizerState =
    e.pointerType === 'mouse'
      ? { ...s, pointers: new Map(), held: null, pinching: false, pinchBroken: false }
      : s;
  const pointers = new Map(base.pointers).set(e.pointer, e.at);
  if (base.pointers.size === 0) {
    const press: Press = { button: e.button, pointerType: e.pointerType, ...e.mods };
    return {
      state: {
        ...base,
        pointers,
        held: { press, driver: e.pointer, from: e.at },
        pinching: false,
        pinchBroken: false,
      },
      gestures: [{ kind: 'heldStart', press, at: e.at }],
    };
  }
  if (base.pointers.size === 1) {
    return {
      state: { ...base, pointers, pinching: true, pinchSpanPx: spanPx(base, pointers.values()) },
      gestures: [],
    };
  }
  return { state: { ...base, pointers }, gestures: [] };
}

function onMove(s: RecognizerState, e: PointerEv): Step {
  const prev = s.pointers.get(e.pointer);
  if (!prev) {
    return {
      state: s,
      gestures:
        e.pointerType === 'mouse' && s.pointers.size === 0 ? [{ kind: 'hover', at: e.at }] : [],
    };
  }
  const pointers = new Map(s.pointers).set(e.pointer, e.at);
  if (s.pinching) {
    const inPair = [...pointers.keys()].slice(0, 2).includes(e.pointer);
    const span = spanPx(s, pointers.values());
    if (s.pinchBroken || !inPair || span === 0) return { state: { ...s, pointers }, gestures: [] };
    return {
      state: { ...s, pointers, pinchSpanPx: span },
      gestures: [{ kind: 'pinch', ratio: s.pinchSpanPx / span }],
    };
  }
  if (!s.held || s.held.driver !== e.pointer) return { state: { ...s, pointers }, gestures: [] };
  return {
    state: { ...s, pointers },
    gestures: [{ kind: 'drag', dx: e.at.x - prev.x, dy: e.at.y - prev.y, at: e.at }],
  };
}

function onUp(s: RecognizerState, e: PointerEv): Step {
  if (!s.pointers.has(e.pointer)) return { state: s, gestures: [] };
  const pointers = new Map(s.pointers);
  pointers.delete(e.pointer);
  if (pointers.size > 0)
    return { state: { ...s, pointers, pinchBroken: s.pinching }, gestures: [] };

  const ended: RecognizerState = {
    ...s,
    pointers,
    held: null,
    pinching: false,
    pinchBroken: false,
  };
  const gestures: Gesture[] = [{ kind: 'heldEnd' }];
  const held = s.held;
  if (e.kind !== 'up' || s.pinching || !held || distSqPx(s, held.from, e.at) >= TAP_SLOP_PX ** 2) {
    return { state: ended, gestures };
  }
  gestures.push({ kind: 'tap', press: held.press, at: e.at });
  const last = s.lastTap;
  const pairs =
    last !== null &&
    last.press.button === held.press.button &&
    last.press.pointerType === held.press.pointerType &&
    e.t - last.t <= DOUBLE_TAP_MS &&
    distSqPx(s, last.at, e.at) <= DOUBLE_TAP_SLOP_PX ** 2;
  if (pairs) gestures.push({ kind: 'doubleTap', press: held.press, at: e.at });
  return {
    state: { ...ended, lastTap: pairs ? null : { t: e.t, at: e.at, press: held.press } },
    gestures,
  };
}

export function recognize(state: RecognizerState, event: DeviceEvent): Step {
  switch (event.kind) {
    case 'resize':
      return {
        state: { ...state, widthPx: event.widthPx, heightPx: event.heightPx },
        gestures: [],
      };
    case 'down':
      return onDown(state, event);
    case 'move':
      return onMove(state, event);
    case 'up':
    case 'cancel':
      return onUp(state, event);
    case 'wheel':
      return {
        state,
        gestures: [{ kind: 'wheel', ratio: event.ratio, at: event.at, mods: event.mods }],
      };
    case 'leave':
      return { state, gestures: [{ kind: 'hover', at: null }] };
  }
}
