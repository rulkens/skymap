/**
 * The dome's receiver over an in-memory link: the real reducer, the real input
 * pump per remote, fake timers for silence and the status throttle. Gestures
 * are presses only — a hover or drag would wait on `requestAnimationFrame`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { configureStore, type Middleware, type UnknownAction } from '@reduxjs/toolkit';

import { rootReducer } from '../../../src/store/rootReducer';
import { remoteReceiverSaga } from '../../../src/state/remote/remoteReceiverSaga';
import { selectRemote } from '../../../src/state/remote/selectors';
import { inputGestureEnded } from '../../../src/state/input/inputSlice';
import { setRate, pause, resume } from '../../../src/state/time/timeSlice';
import { setUiHidden } from '../../../src/state/ui/uiSlice';
import { inputRoute, uiRoute } from '../../../src/store/constants';
import { createMemoryTransport } from '../../helpers/remote/createMemoryTransport';
import type { DeviceEvent } from '../../../src/@types/input/DeviceEvent';

const NO_MODS = { shift: false, ctrl: false, alt: false, meta: false };
let t = 0;
const resize = (widthPx = 200, heightPx = 100): DeviceEvent => ({
  kind: 'resize',
  t: (t += 10),
  widthPx,
  heightPx,
});
const press = (kind: 'down' | 'up'): DeviceEvent => ({
  kind,
  t: (t += 10),
  pointer: 1,
  pointerType: 'touch',
  button: 0,
  at: { x: 0.5, y: 0.5 },
  mods: NO_MODS,
});

const settle = () => vi.advanceTimersByTimeAsync(0);

async function setup() {
  const actions: UnknownAction[] = [];
  const record: Middleware = () => (next) => (action) => {
    actions.push(action as UnknownAction);
    return next(action);
  };
  const mw = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (g) => g().concat(record, mw),
  });
  const link = createMemoryTransport();
  mw.run(remoteReceiverSaga, link.transport, []);
  await settle();
  const say = async (message: object) => {
    link.fromRemote(JSON.stringify(message));
    await settle();
  };
  const device = (from: string, ...events: DeviceEvent[]) =>
    events.reduce(
      (p, event) => p.then(() => say({ from, kind: 'device', event })),
      Promise.resolve(),
    );
  const input = () => store.getState()[inputRoute];
  const statuses = () => link.sent.filter((m) => m.kind === 'status');
  return { store, link, actions, say, device, input, statuses };
}

beforeEach(() => {
  t = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('remoteReceiverSaga', () => {
  it('opens its room and reports the pairing address', async () => {
    const { store, link } = await setup();
    expect(link.opened()).toBe('ROOM0000');
    expect(selectRemote(store.getState())).toEqual({
      phase: 'waiting',
      code: 'ROOM0000',
      pairingUrl: 'http://192.168.1.2:5173/remote.html#ROOM0000',
    });
  });

  it("a command message dispatches exactly its row's actions", async () => {
    const { actions, say } = await setup();
    const before = actions.length;
    await say({
      from: 'a',
      kind: 'command',
      command: { name: 'timeSetRate', payload: { rateIndex: 2 } },
    });
    const dispatched = actions.slice(before);
    expect(dispatched.map((a) => a.type)).toEqual([setRate.type]);
    expect(dispatched[0]!.payload).toMatchObject({ rateIndex: 2 });
  });

  it('an unknown command dispatches nothing', async () => {
    const { actions, say } = await setup();
    const before = actions.length;
    await say({ from: 'a', kind: 'command', command: { name: 'selfDestruct', payload: null } });
    expect(actions.length).toBe(before);
  });

  it('garbage text is dropped and the loop keeps running', async () => {
    const { actions, link, say } = await setup();
    link.fromRemote('not json');
    link.fromRemote('[1,2]');
    await say({
      from: 'a',
      kind: 'command',
      command: { name: 'timeSetRate', payload: { rateIndex: 'x' } },
    });
    const before = actions.length;
    await say({
      from: 'a',
      kind: 'command',
      command: { name: 'timeSetRate', payload: { rateIndex: 1 } },
    });
    expect(actions.slice(before).map((a) => a.type)).toEqual([setRate.type]);
  });

  it("a remote's device events reach the input slice under remote:<id>", async () => {
    const { device, input } = await setup();
    await device('a', resize(200, 100), press('down'));
    expect(input().sources['remote:a']).toEqual({ aspect: 2 });
    expect(input().owner).toBe('remote:a');
  });

  it('device events before any resize attach nothing', async () => {
    const { device, input } = await setup();
    await device('a', press('down'), press('up'));
    expect(input().sources['remote:a']).toBeUndefined();
    expect(input().owner).toBeNull();
  });

  it('three seconds of silence end an open gesture and detach the source', async () => {
    const { device, input } = await setup();
    await device('a', resize(), press('down'));
    await vi.advanceTimersByTimeAsync(2999);
    expect(input().owner).toBe('remote:a');
    await vi.advanceTimersByTimeAsync(1);
    expect(input().owner).toBeNull();
    expect(input().sources['remote:a']).toBeUndefined();
  });

  it('a closed link ends an open gesture and detaches every remote', async () => {
    const { device, input, link } = await setup();
    await device('a', resize(), press('down'));
    await device('b', resize());
    link.linkStatus('closed');
    await settle();
    expect(input().owner).toBeNull();
    expect(input().sources).toEqual({});
  });

  it('a returning remote attaches again with its last size', async () => {
    const { device, input } = await setup();
    await device('a', resize(300, 100), press('down'), press('up'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(input().sources['remote:a']).toBeUndefined();
    await device('a', press('down'));
    expect(input().sources['remote:a']).toEqual({ aspect: 3 });
    expect(input().owner).toBe('remote:a');
  });

  it("two remotes are two sources, and the second one's press takes the camera over", async () => {
    const { device, input } = await setup();
    await device('a', resize(), press('down'));
    await device('b', resize(100, 200), press('down'));
    expect(Object.keys(input().sources).sort()).toEqual(['remote:a', 'remote:b']);
    expect(input().owner).toBe('remote:b');
  });

  it('a reloaded remote (new id) takes over while the old id is still within its silence window', async () => {
    const { actions, device, input, say } = await setup();
    await device('old', resize(), press('down'));
    await vi.advanceTimersByTimeAsync(1000);
    await device('new', resize(), press('down'));
    expect(input().owner).toBe('remote:new');
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1000);
      await say({ from: 'new', kind: 'hello' });
    }
    expect(input().sources['remote:old']).toBeUndefined();
    expect(input().owner).toBe('remote:new');
    const ended = actions.filter((a) => inputGestureEnded.match(a)).map((a) => a.payload.source);
    expect(ended).toEqual(['remote:old']);
  });

  it('a search answers with the same requestId', async () => {
    const { link, say } = await setup();
    await say({ from: 'a', kind: 'search', requestId: 'r-7', query: 'andromeda' });
    expect(link.sent).toContainEqual(
      expect.objectContaining({ kind: 'searchResults', requestId: 'r-7' }),
    );
  });

  it('a hello is answered with a status', async () => {
    const { say, statuses } = await setup();
    await say({ from: 'a', kind: 'hello' });
    await vi.advanceTimersByTimeAsync(1000);
    const before = statuses().length;
    await say({ from: 'a', kind: 'hello' });
    expect(statuses().length).toBe(before + 1);
  });

  it('the first hello pairs and hides the UI, and a later one never hides it again', async () => {
    const { store, say } = await setup();
    await say({ from: 'a', kind: 'hello' });
    expect(selectRemote(store.getState()).phase).toBe('paired');
    expect(store.getState()[uiRoute].uiHidden).toBe(true);
    store.dispatch(setUiHidden(false));
    await say({ from: 'a', kind: 'hello' });
    expect(store.getState()[uiRoute].uiHidden).toBe(false);
  });

  it('fifty state changes in one second send at most four statuses', async () => {
    const { store, statuses } = await setup();
    // Changes at 0, 20, … 980 ms: all inside one second.
    for (let i = 0; i < 50; i++) {
      if (i > 0) await vi.advanceTimersByTimeAsync(20);
      store.dispatch(i % 2 === 0 ? pause({ nowMs: i }) : resume({ nowMs: i }));
    }
    await settle();
    expect(statuses().length).toBeLessThanOrEqual(4);
    await vi.advanceTimersByTimeAsync(1000);
    const last = statuses().at(-1);
    expect(last?.kind === 'status' && last.status.time.paused).toBe(false);
  });

  it('a change inside the cool-down still goes out once it ends', async () => {
    const { store, statuses } = await setup();
    await vi.advanceTimersByTimeAsync(1000);
    store.dispatch(pause({ nowMs: 0 }));
    await settle();
    const before = statuses().length;
    await vi.advanceTimersByTimeAsync(10);
    store.dispatch(resume({ nowMs: 10 }));
    await vi.advanceTimersByTimeAsync(250);
    expect(statuses().length).toBe(before + 1);
    const last = statuses().at(-1);
    expect(last?.kind === 'status' && last.status.time.paused).toBe(false);
  });
});
