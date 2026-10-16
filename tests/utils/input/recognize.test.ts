import { describe, expect, it } from 'vitest';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';
import type { Gesture } from '../../../src/@types/input/Gesture';
import { DOUBLE_TAP_MS } from '../../../src/data/input/doubleTapMs';
import { DOUBLE_TAP_SLOP_PX } from '../../../src/data/input/doubleTapSlopPx';
import { TAP_SLOP_PX } from '../../../src/data/input/tapSlopPx';
import { initialRecognizerState } from '../../../src/utils/input/initialRecognizerState';
import { recognize } from '../../../src/utils/input/recognize';

const W = 200;
const H = 100;
const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
const resize: DeviceEvent = { t: 0, kind: 'resize', widthPx: W, heightPx: H };

type PtrOpts = { id?: number; type?: 'mouse' | 'touch' | 'pen'; button?: 0 | 1 | 2 };
const ptr =
  (kind: 'down' | 'move' | 'up' | 'cancel') =>
  (t: number, x: number, y: number, o: PtrOpts = {}): DeviceEvent => ({
    t,
    kind,
    pointer: o.id ?? 1,
    pointerType: o.type ?? 'mouse',
    button: o.button ?? 0,
    at: { x, y },
    mods: NO_MODS,
  });
const down = ptr('down');
const move = ptr('move');
const up = ptr('up');
const cancel = ptr('cancel');

function run(events: readonly DeviceEvent[]): Gesture[] {
  let state = initialRecognizerState();
  const out: Gesture[] = [];
  for (const e of [resize, ...events]) {
    const r = recognize(state, e);
    state = r.state;
    out.push(...r.gestures);
  }
  return out;
}
const kinds = (g: readonly Gesture[]) => g.map((x) => x.kind);

const slopUnit = TAP_SLOP_PX / W;
const dtSlopUnit = DOUBLE_TAP_SLOP_PX / W;

describe('recognize', () => {
  it('a press then a release within the slop is heldStart, heldEnd, tap', () => {
    expect(kinds(run([down(0, 0.5, 0.5), up(50, 0.5 + slopUnit / 2, 0.5)]))).toEqual([
      'heldStart',
      'heldEnd',
      'tap',
    ]);
  });

  it('a release beyond the slop is heldStart, heldEnd with no tap', () => {
    expect(kinds(run([down(0, 0.5, 0.5), up(50, 0.5 + slopUnit * 2, 0.5)]))).toEqual([
      'heldStart',
      'heldEnd',
    ]);
  });

  it('two taps inside the window and the distance add a doubleTap after the second tap', () => {
    const g = run([
      down(0, 0.5, 0.5),
      up(10, 0.5, 0.5),
      down(100, 0.5 + dtSlopUnit / 2, 0.5),
      up(110, 0.5 + dtSlopUnit / 2, 0.5),
    ]);
    expect(kinds(g)).toEqual([
      'heldStart',
      'heldEnd',
      'tap',
      'heldStart',
      'heldEnd',
      'tap',
      'doubleTap',
    ]);
  });

  it('a second tap after DOUBLE_TAP_MS is a plain tap', () => {
    const t2 = 10 + DOUBLE_TAP_MS + 1;
    const g = run([down(0, 0.5, 0.5), up(10, 0.5, 0.5), down(t2, 0.5, 0.5), up(t2 + 5, 0.5, 0.5)]);
    expect(kinds(g).filter((k) => k === 'doubleTap')).toEqual([]);
    expect(kinds(g).filter((k) => k === 'tap')).toHaveLength(2);
  });

  it('a second tap beyond DOUBLE_TAP_SLOP_PX is a plain tap', () => {
    const x2 = 0.5 + dtSlopUnit * 2;
    const g = run([down(0, 0.5, 0.5), up(10, 0.5, 0.5), down(100, x2, 0.5), up(110, x2, 0.5)]);
    expect(kinds(g).filter((k) => k === 'doubleTap')).toEqual([]);
  });

  it('a right-click tap then a left-click tap on the same spot is not a doubleTap', () => {
    const g = run([
      down(0, 0.5, 0.5, { button: 2 }),
      up(10, 0.5, 0.5, { button: 2 }),
      down(100, 0.5, 0.5),
      up(110, 0.5, 0.5),
    ]);
    expect(kinds(g)).not.toContain('doubleTap');
  });

  it('a third quick tap starts a new pair: tap, tap+doubleTap, tap', () => {
    const tap = (t: number) => [down(t, 0.5, 0.5), up(t + 5, 0.5, 0.5)];
    const g = run([...tap(0), ...tap(100), ...tap(200)]);
    expect(kinds(g).filter((k) => k === 'tap' || k === 'doubleTap')).toEqual([
      'tap',
      'tap',
      'doubleTap',
      'tap',
    ]);
  });

  it('only the first contact emits heldStart; a second contact emits nothing', () => {
    const g = run([
      down(0, 0.4, 0.5, { id: 1, type: 'touch' }),
      down(1, 0.6, 0.5, { id: 2, type: 'touch' }),
    ]);
    expect(kinds(g)).toEqual(['heldStart']);
  });

  it('a pinch on a 2:1 surface reports old span over new span in pixels', () => {
    const pair = [
      down(0, 0.4, 0.5, { id: 1, type: 'touch' }),
      down(1, 0.6, 0.5, { id: 2, type: 'touch' }),
    ];
    const horiz = run([...pair, move(2, 0.7, 0.5, { id: 2, type: 'touch' })]);
    const vert = run([...pair, move(2, 0.6, 0.6, { id: 2, type: 'touch' })]);
    expect((horiz.at(-1) as Extract<Gesture, { kind: 'pinch' }>).ratio).toBeCloseTo(40 / 60, 12);
    const pinch = vert.at(-1) as Extract<Gesture, { kind: 'pinch' }>;
    expect(pinch.ratio).toBeCloseTo(40 / Math.hypot(40, 10), 12);
  });

  it('lifting one of two pinch fingers leaves the survivor inert until it lifts, then heldEnd', () => {
    const t = { type: 'touch' as const };
    const g = run([
      down(0, 0.4, 0.5, { id: 1, ...t }),
      down(1, 0.6, 0.5, { id: 2, ...t }),
      up(2, 0.6, 0.5, { id: 2, ...t }),
      move(3, 0.3, 0.5, { id: 1, ...t }),
      up(4, 0.3, 0.5, { id: 1, ...t }),
    ]);
    expect(kinds(g)).toEqual(['heldStart', 'heldEnd']);
  });

  it('a pinch release is never a tap', () => {
    const t = { type: 'touch' as const };
    const g = run([
      down(0, 0.4, 0.5, { id: 1, ...t }),
      down(1, 0.4, 0.5, { id: 2, ...t }),
      up(2, 0.4, 0.5, { id: 2, ...t }),
      up(3, 0.4, 0.5, { id: 1, ...t }),
    ]);
    expect(kinds(g)).not.toContain('tap');
  });

  it('a move from a pointer that did not start the drag emits nothing', () => {
    const t = { type: 'touch' as const };
    // Third finger: the pair is pinching, and the extra contact is outside it.
    const g = run([
      down(0, 0.4, 0.5, { id: 1, ...t }),
      down(1, 0.6, 0.5, { id: 2, ...t }),
      down(2, 0.1, 0.1, { id: 3, ...t }),
      move(3, 0.2, 0.2, { id: 3, ...t }),
    ]);
    expect(kinds(g)).toEqual(['heldStart']);
  });

  it('drag dx and dy are unit deltas since the last point', () => {
    const g = run([down(0, 0.5, 0.5), move(1, 0.6, 0.45), move(2, 0.55, 0.5)]);
    const [, d1, d2] = g as Extract<Gesture, { kind: 'drag' }>[];
    expect(d1!.dx).toBeCloseTo(0.1, 12);
    expect(d1!.dy).toBeCloseTo(-0.05, 12);
    expect(d2!.dx).toBeCloseTo(-0.05, 12);
    expect(d2!.dy).toBeCloseTo(0.05, 12);
  });

  it('a wheel emits one wheel gesture, pressed or not', () => {
    const wheel: DeviceEvent = {
      t: 5,
      kind: 'wheel',
      ratio: 1.1,
      at: { x: 0.5, y: 0.5 },
      mods: NO_MODS,
    };
    expect(kinds(run([wheel]))).toEqual(['wheel']);
    expect(kinds(run([down(0, 0.5, 0.5), wheel]))).toEqual(['heldStart', 'wheel']);
  });

  it('mouse moves with nothing pressed hover; touch and pen moves never hover', () => {
    expect(run([move(0, 0.3, 0.3)])).toEqual([{ kind: 'hover', at: { x: 0.3, y: 0.3 } }]);
    expect(run([move(0, 0.3, 0.3, { type: 'touch' }), move(1, 0.3, 0.3, { type: 'pen' })])).toEqual(
      [],
    );
  });

  it('leave emits hover with at null', () => {
    expect(run([{ t: 0, kind: 'leave' }])).toEqual([{ kind: 'hover', at: null }]);
  });

  it('cancel ends the gesture with no tap', () => {
    expect(kinds(run([down(0, 0.5, 0.5), cancel(5, 0.5, 0.5)]))).toEqual(['heldStart', 'heldEnd']);
  });

  it('a mouse down heals a pointer whose up was never seen: heldStart, not a pinch', () => {
    const g = run([
      down(0, 0.5, 0.5, { id: 1 }),
      down(1000, 0.2, 0.2, { id: 2 }),
      move(1001, 0.3, 0.2, { id: 2 }),
    ]);
    expect(kinds(g)).toEqual(['heldStart', 'heldStart', 'drag']);
  });
});
