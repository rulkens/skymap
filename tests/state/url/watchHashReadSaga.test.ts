/**
 * watchHashReadSaga — integration over a real store + saga middleware, with the
 * two `services/url` read seams mocked so the test owns the URL and no `window`
 * is touched (the suite runs under `environment: 'node'`). Only this saga is
 * forked, not `mainSaga`: the subject is what a hash body turns into, and a
 * full root fork would drag every other watcher's engine context in for it.
 *
 * ### What these cases are for
 *
 * The per-row `read` / `readAbsent` outputs are `hashParamSources`'s tests and
 * are not repeated here. What only this file can catch is the PASS logic — the
 * three decisions the saga makes before a row is ever consulted:
 *
 *  - a present value goes to `read`,
 *  - an absent one goes to `readAbsent` on a navigation but NOWHERE on boot,
 *  - and an EMPTY one counts as absent.
 *
 * Two of those are load-bearing far out of proportion to their line count. The
 * boot suppression is what stops a bare page load dispatching `clearSelection`
 * over the engine's Earth seed; the empty-value routing is the single
 * expression that makes `HashParamSource.read`'s "never called with an empty
 * value" contract true for every row at once.
 *
 * WHEN this saga may run at all is not a decision it makes: `watchHashSaga`
 * holds it (and the write half) until `sagaContextRegistered` lands. Forking it
 * bare here is only legitimate because the wait lives up there — asserting the
 * gate from this file would be asserting it against code that no longer contains
 * it. `tests/state/url/watchHashSaga.test.ts` covers it where it is.
 */

import { describe, it, expect, vi } from 'vitest';
import createSagaMiddleware from 'redux-saga';
import { eventChannel } from 'redux-saga';
import { configureStore, type Action, type Middleware } from '@reduxjs/toolkit';

vi.mock('../../../src/services/url/readHashBody', () => ({ readHashBody: vi.fn(() => '') }));
vi.mock('../../../src/services/url/createHashChangeChannel', () => ({
  createHashChangeChannel: vi.fn(),
}));

import { readHashBody } from '../../../src/services/url/readHashBody';
import { createHashChangeChannel } from '../../../src/services/url/createHashChangeChannel';
import { rootReducer } from '../../../src/store/rootReducer';
import { watchHashReadSaga } from '../../../src/state/url/watchHashReadSaga';
import { requestFocus } from '../../../src/state/selection/requestFocus';
import { requestSelect } from '../../../src/state/selection/requestSelect';
import { clearSelection } from '../../../src/state/selection/selectionSlice';
import { setOrientation } from '../../../src/state/settings/settingsSlice';
import { DEFAULT_ORIENTATION } from '../../../src/data/defaults';

/**
 * Boot the saga against a given arrival hash, and hand back the levers a case
 * needs: the actions that reached the store, an emitter standing in for a
 * browser navigation, the running task, and whether the channel's subscriber is
 * still attached (the stand-in for the real DOM listener).
 *
 * Forking the saga runs the arrival read to completion, synchronously, before
 * `run` returns — so a case inspects `recorded` straight after this call, and a
 * case about a NAVIGATION clears it first.
 */
function buildHarness(arrivalBody: string) {
  vi.mocked(readHashBody).mockReturnValue(arrivalBody);

  let emit = (_body: string) => {};
  let subscribed = true;
  const channel = eventChannel<string>((emitter) => {
    emit = emitter;
    return () => {
      subscribed = false;
    };
  });
  vi.mocked(createHashChangeChannel).mockReturnValue(channel);

  const recorded: Action[] = [];
  const recorder: Middleware = () => (next) => (action) => {
    recorded.push(action as Action);
    return next(action);
  };

  const sagaMiddleware = createSagaMiddleware();
  // The store is here for the real reducers the saga's `put`s land in and for
  // the middleware chain; no case reads its state back, so it needs no binding.
  configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(recorder, sagaMiddleware),
  });
  const task = sagaMiddleware.run(watchHashReadSaga);

  return {
    recorded,
    emit: (body: string) => emit(body),
    task,
    isSubscribed: () => subscribed,
  };
}

describe('watchHashReadSaga', () => {
  it('turns an arrival deep link into a select plus a fly', () => {
    const { recorded } = buildHarness('focus=m31');

    // Both actions, because arriving by URL is meant to look like a scene click
    // (pins the InfoCard) plus a fly (moves the camera) — a `read` that lost
    // one of them would still navigate, or still pin, and look almost right.
    expect(recorded).toEqual([requestSelect('m31'), requestFocus('m31')]);
  });

  it('dispatches nothing at all on a bare arrival URL', () => {
    const { recorded } = buildHarness('');

    // The most load-bearing case in this file. Every param is absent, and the
    // boot read must consult NO row's `readAbsent` — `clearSelection()` here
    // would race `wireInput`'s home seed on every ordinary page load, and the
    // loser is whichever landed first. `toEqual([])` rather than a
    // `not.toContainEqual(clearSelection())` so the same guarantee holds for a
    // row added later, which will have its own default to over-assert.
    expect(recorded).toEqual([]);
  });

  it('restores param defaults when a hashchange arrives bare', () => {
    const { recorded, emit } = buildHarness('focus=m31&orientation=galactic');
    // Only the navigation's own output is the subject; the arrival read's has
    // already landed by the time the harness returns.
    recorded.length = 0;

    emit('');

    // Back out of a shared link and every param the entry does not claim goes
    // home, not just `focus`. Orientation is the one that used to stick: a
    // history entry with no `orientation` on it left the camera galactic.
    expect(recorded).toContainEqual(clearSelection());
    expect(recorded).toContainEqual(setOrientation(DEFAULT_ORIENTATION));
  });

  it('routes an empty value to the absent arm rather than to read()', () => {
    const { recorded, emit } = buildHarness('focus=m31');
    recorded.length = 0;

    emit('focus=');

    // `#focus=` is what a truncated or hand-edited URL looks like: the key is
    // present, the value says nothing. The pass tests the value for TRUTH, not
    // for presence, so it lands in the absent arm — which is the reason no row
    // carries an empty-string guard. Rewriting that test as
    // `value !== undefined` reads tidier and silently sends `''` into
    // `focus.read`, requesting the id `''`.
    expect(recorded).toContainEqual(clearSelection());
    expect(recorded.map((action) => action.type)).not.toContain(requestFocus.type);
  });

  it('detaches the channel subscriber when cancelled', () => {
    // Cancelled from the steady state — parked on the channel, the arrival read
    // behind it — which is where a real engine teardown finds it.
    const { task, isSubscribed } = buildHarness('');
    expect(isSubscribed()).toBe(true);

    task.cancel();

    // The `finally` arm. In the browser this subscriber is a `hashchange`
    // listener on `window`; without the teardown a cancelled root saga leaves
    // it attached, emitting into a channel nothing will ever take from again.
    expect(isSubscribed()).toBe(false);
  });
});
