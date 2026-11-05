/**
 * recognize — the pure device-event → gesture step. Positions arrive as unit
 * points and the clock is the event's own `t`, so a remote source can be
 * replayed in a test.
 *
 * Pixels appear only for the compares that need an isotropic metric (tap slop,
 * a pair's span and travel); the surface size comes from `resize` events.
 */

import type { DeviceEvent } from '../../@types/input/DeviceEvent';
import type { Gesture } from '../../@types/input/Gesture';
import type { PointerDeviceEvent } from '../../@types/input/PointerDeviceEvent';
import type { Press } from '../../@types/input/Press';
import type { RecognizeResult } from '../../@types/input/RecognizeResult';
import type { RecognizerPair } from '../../@types/input/RecognizerPair';
import type { RecognizerState } from '../../@types/input/RecognizerState';
import type { UnitPoint } from '../../@types/input/UnitPoint';
import { DOUBLE_TAP_MS } from '../../data/input/doubleTapMs';
import { DOUBLE_TAP_SLOP_PX } from '../../data/input/doubleTapSlopPx';
import { PAIR_LOCK_PX } from '../../data/input/pairLockPx';
import { TAP_SLOP_PX } from '../../data/input/tapSlopPx';

const lenPx = (s: RecognizerState, dx: number, dy: number): number =>
  Math.hypot(dx * s.widthPx, dy * s.heightPx);

const distSqPx = (s: RecognizerState, a: UnitPoint, b: UnitPoint): number =>
  lenPx(s, a.x - b.x, a.y - b.y) ** 2;

const midOf = ([a, b]: readonly [UnitPoint, UnitPoint]): UnitPoint => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

function onDown(s: RecognizerState, e: PointerDeviceEvent): RecognizeResult {
  // A mouse is strictly single-pointer: with no pointer capture a release outside
  // the window sends no `up`, and the stale entry would turn the next click into a
  // pinch. Touch gets implicit capture, so only a mouse heals.
  const base: RecognizerState = e.pointerType === 'mouse' ? { ...s, pointers: new Map() } : s;
  const pointers = new Map(base.pointers).set(e.pointer, e.at);
  if (base.pointers.size === 0) {
    const press: Press = { button: e.button, pointerType: e.pointerType, ...e.mods };
    return {
      state: {
        ...base,
        pointers,
        held: { press, driver: e.pointer, from: e.at },
        pair: null,
        pairBroken: false,
      },
      gestures: [{ kind: 'heldStart', press, at: e.at }],
    };
  }
  if (base.pointers.size === 1) {
    const [a, b] = pointers.values() as Iterable<UnitPoint> as readonly [UnitPoint, UnitPoint];
    const pair: RecognizerPair = {
      mode: 'pending',
      spanPx: lenPx(base, a.x - b.x, a.y - b.y),
      mid: midOf([a, b]),
    };
    return { state: { ...base, pointers, pair }, gestures: [] };
  }
  return { state: { ...base, pointers }, gestures: [] };
}

/** One move of the pair. A pending pair locks once it travels PAIR_LOCK_PX: moving together is a tilt, moving apart a pinch. */
function onPairMove(
  s: RecognizerState,
  pair: RecognizerPair,
  two: readonly [UnitPoint, UnitPoint],
): RecognizeResult {
  const [a, b] = two;
  const mid = midOf(two);
  if (pair.mode === 'tilt') {
    const drag: Gesture = {
      kind: 'drag',
      dx: mid.x - pair.mid.x,
      dy: mid.y - pair.mid.y,
      at: mid,
    };
    return { state: { ...s, pair: { ...pair, mid } }, gestures: [drag] };
  }
  const spanPx = lenPx(s, a.x - b.x, a.y - b.y);
  if (pair.mode === 'pinch') {
    if (spanPx === 0) return { state: s, gestures: [] };
    return {
      state: { ...s, pair: { ...pair, spanPx } },
      gestures: [{ kind: 'pinch', ratio: pair.spanPx / spanPx }],
    };
  }
  // The span's change, not the fingers' relative motion: on a phone one finger
  // always leads, and a lone finger's move would read as twice the travel.
  const travelPx = lenPx(s, mid.x - pair.mid.x, mid.y - pair.mid.y);
  const spreadPx = Math.abs(spanPx - pair.spanPx);
  if (Math.max(travelPx, spreadPx) < PAIR_LOCK_PX) return { state: s, gestures: [] };
  if (travelPx <= spreadPx) return onPairMove(s, { ...pair, mode: 'pinch' }, two);
  // The tilt is a different press from the one-finger drag before it, so it
  // closes that gesture and opens its own at the landing midpoint.
  const tilt = onPairMove(s, { ...pair, mode: 'tilt' }, two);
  return {
    state: tilt.state,
    gestures: [{ kind: 'heldEnd' }, { kind: 'tiltStart', at: pair.mid }, ...tilt.gestures],
  };
}

function onMove(s: RecognizerState, e: PointerDeviceEvent): RecognizeResult {
  const prev = s.pointers.get(e.pointer);
  if (!prev) {
    return {
      state: s,
      gestures:
        e.pointerType === 'mouse' && s.pointers.size === 0 ? [{ kind: 'hover', at: e.at }] : [],
    };
  }
  const pointers = new Map(s.pointers).set(e.pointer, e.at);
  if (s.pair) {
    const [a, b] = pointers.entries();
    const inPair = a?.[0] === e.pointer || b?.[0] === e.pointer;
    if (s.pairBroken || !inPair || !a || !b) return { state: { ...s, pointers }, gestures: [] };
    return onPairMove({ ...s, pointers }, s.pair, [a[1], b[1]]);
  }
  if (!s.held || s.held.driver !== e.pointer) return { state: { ...s, pointers }, gestures: [] };
  return {
    state: { ...s, pointers },
    gestures: [{ kind: 'drag', dx: e.at.x - prev.x, dy: e.at.y - prev.y, at: e.at }],
  };
}

function onUp(s: RecognizerState, e: PointerDeviceEvent): RecognizeResult {
  if (!s.pointers.has(e.pointer)) return { state: s, gestures: [] };
  const pointers = new Map(s.pointers);
  pointers.delete(e.pointer);
  if (pointers.size > 0)
    return { state: { ...s, pointers, pairBroken: s.pair !== null }, gestures: [] };

  const ended: RecognizerState = {
    ...s,
    pointers,
    held: null,
    pair: null,
    pairBroken: false,
  };
  const gestures: Gesture[] = [{ kind: 'heldEnd' }];
  const held = s.held;
  if (
    e.kind !== 'up' ||
    s.pair !== null ||
    !held ||
    distSqPx(s, held.from, e.at) >= TAP_SLOP_PX ** 2
  ) {
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

export function recognize(state: RecognizerState, event: DeviceEvent): RecognizeResult {
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
