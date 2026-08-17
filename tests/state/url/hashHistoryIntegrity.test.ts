// @vitest-environment jsdom
/**
 * The hash bridge's HISTORY-STACK integrity — the one property no other test in
 * `tests/state/url/` can observe, because every other file mocks `writeHashBody`
 * away and therefore never sees a `pushState` at all.
 *
 * ### Why the final URL is the wrong thing to assert
 *
 * The reported browser bug reads as "Forward is dead": go to `#focus=body-mars`,
 * then `#focus=body-saturn`, press Back, and the app lands on Mars looking
 * entirely correct — but Saturn is now unreachable. Nothing about the visible
 * state is wrong. What is wrong is that answering the Back navigation took TWO
 * `pushState` calls, and a push during a back navigation truncates the forward
 * stack. So the subject here is the SEQUENCE of pushes, not the URL they settle
 * on: a case that asserted only the final hash would pass against the bug.
 *
 * ### The two independent ways a navigation grew an entry
 *
 * Both were mid-pass reads — a write composing the hash out of a store that had
 * applied part of the URL — and they are independent because either one alone
 * kills the forward stack.
 *
 *  - A TORN READ inside the `focus` row. Its `write` has a two-rung precedence
 *    ladder (`selection.pending.focus`, then `selectionRows.focus`), and the
 *    rungs were one action out of step: `updateSelectionFocus` retired the
 *    pending id while the derived row it hands off to arrived on the
 *    reconciler's `setSelectionRow` a step later. In that gap the ladder
 *    reported the PREVIOUS target. `clearSelection` tears the same ladder the
 *    same way and still does, because its reducer nulls `pending` directly while
 *    the row survives until the reconciler runs.
 *  - A CROSS-ROW gap. `applyHash` dispatches one table row's worth of actions at
 *    a time and each of them is a write trigger, so a two-param URL published
 *    itself half-applied — `focus=body-mars` while `orientation` was still the
 *    default — before publishing the real thing.
 *
 * The fix for both is one publish per SETTLED state: the write saga coalesces to
 * the trailing edge of the burst (`debounce(0, …)`) instead of answering every
 * trigger. That is why the cases below are mostly "pushes nothing" — and why the
 * last one is not. A bridge that never wrote at all would satisfy every empty
 * assertion here, so one case pins the write that SHOULD happen.
 *
 * ### Why the whole store, and the real `services/url` seam
 *
 * The defects are only visible while several sagas drain the same navigation.
 * Only a real store running the real root saga puts those pieces in the same
 * room, and only the real `writeHashBody` performs the compare-and-skip against
 * the live URL that decides whether a push happens. `pushState` is SPIED, not
 * stubbed: the spy calls through, so the address bar really moves and the
 * compare-and-skip sees what the browser sees. A stub that recorded without
 * navigating would freeze the live URL and silently skip every push after the
 * first, hiding exactly the pushes this file exists to count.
 *
 * Bodies are the subject rather than galaxies because a body is what fits inside
 * the gap. A galaxy deep link parks in `resolveFocusRefDeferring` until its
 * catalog pulses, so its ref write lands well after the read pass has finished
 * and no other row's trigger is left to fall into the window; a body resolves
 * inline off the static `SCENE_BODIES` table, mid-pass.
 *
 * ### The cases are NOT isolated from each other, and that is safe here
 *
 * `window` is a per-FILE singleton under jsdom and a store has no teardown, so
 * every store booted here keeps its `createHashChangeChannel` subscription for
 * the rest of the run: a `navigate()` in the third case is answered by the first
 * case's store as well. That leak can only ADD pushes to the recorded sequence,
 * never remove one, so it cannot turn a failing "pushes nothing" case into a
 * passing one — and the single case that expects a push dispatches into its own
 * store rather than navigating, which no other store can hear.
 *
 * Tearing the listeners down instead is a trap worth naming, because the obvious
 * way to do it silently disarms the whole file: spying on `window.addEventListener`
 * to record and forward has to reach the original, and
 * `EventTarget.prototype.addEventListener.call(window, …)` throws under jsdom
 * ("not a valid instance of EventTarget" — `window` is a proxy over the real
 * global). The channel then registers nothing, no navigation ever reaches a
 * store, and every `toEqual([])` passes for the worst possible reason. The real
 * repair is the backlog's "URL seam is a `window` singleton".
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';

import { createTestStore } from '../../support/createTestStore';
import { requestFocus } from '../../../src/state/selection/requestFocus';

/** A macrotask, so the write saga's debounce window has closed. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Move the address bar with no history entry and no event — pure setup. */
function seedHash(body: string) {
  const base = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', body ? `${base}#${body}` : base);
}

/**
 * What the browser does on Back/Forward across hash-only entries: the URL is
 * already the new one by the time `hashchange` fires, which is precisely the
 * condition that makes a mid-sequence write push. Driving it as an explicit
 * event rather than assigning `location.hash` keeps the case synchronous —
 * jsdom queues its own `hashchange` as a task.
 */
function navigate(body: string) {
  seedHash(body);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

describe('hash history integrity', () => {
  let pushState: MockInstance<History['pushState']>;

  /** The hash of every URL pushed since the last clear, in order. */
  const pushedHashes = () =>
    pushState.mock.calls.map(([, , url]) => new URL(String(url), window.location.href).hash);

  /**
   * The real store, the real root saga, the real URL seam — and `createTestStore`
   * rather than a hand-built harness precisely because registering the context is
   * what releases the hash bridge, so this call IS the arrival read. Its inert bag
   * is all a body deep link needs: `resolveFocusId` and `extractSelectionRow` both
   * resolve a scene body off the static `SCENE_BODIES` import, with no engine
   * resource in the path.
   */
  const boot = () => createTestStore();

  beforeEach(() => {
    pushState = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pushes nothing when Back returns to a previously focused body', async () => {
    seedHash('focus=body-mars');
    boot();
    await flush();

    navigate('focus=body-saturn');
    await flush();

    pushState.mockClear();
    navigate('focus=body-mars');
    await flush();

    // A back navigation is the browser moving the URL; the app's only job is to
    // catch up with it. ANY push here is a forward-stack truncation, so the
    // assertion is the empty sequence rather than a bound on its length — one
    // push would be as fatal as two, and the final URL is correct either way.
    expect(pushedHashes()).toEqual([]);
  });

  it('pushes nothing when Back returns to a bare URL', async () => {
    seedHash('focus=body-mars');
    boot();
    await flush();

    pushState.mockClear();
    navigate('');
    await flush();

    // One param, so nothing here is about rows racing each other: this is the
    // `focus` row tearing its own ladder. `clearSelection` nulls `pending.focus`
    // in its reducer, `selectionRows.focus` still holds Mars until the
    // reconciler runs, and a write landing between the two composes
    // `focus=body-mars` — over a URL the browser has already moved to bare.
    expect(pushedHashes()).toEqual([]);
  });

  it('pushes nothing when a navigation moves two params at once', async () => {
    seedHash('');
    boot();
    await flush();

    pushState.mockClear();
    navigate('focus=body-mars&orientation=galactic');
    await flush();

    // The cross-row gap with no torn read in it: both rows resolve cleanly, and
    // the entry is still spurious because the `focus` row's actions land before
    // the `orientation` row's. A write answering the first of them composes a
    // body no history entry ever carried.
    expect(pushedHashes()).toEqual([]);
    expect(window.location.hash).toBe('#focus=body-mars&orientation=galactic');
  });

  it('pushes nothing on a cold load of a body deep link', async () => {
    seedHash('focus=body-mars');

    boot();
    await flush();

    // What this case pins is `writeHashBody`'s compare-and-skip, which is one
    // deleted line away from not existing: the settled body of an arrival equals
    // the URL the visitor arrived on, and only the compare turns that publish
    // into a no-op. Without it a visitor following a shared link lands several
    // entries deep in a history they never navigated, every one of them the same
    // URL, and Back does nothing visible.
    expect(pushedHashes()).toEqual([]);
  });

  it('pushes nothing on a cold load of a two-param deep link', async () => {
    seedHash('focus=body-mars&orientation=galactic');

    boot();
    await flush();

    // The boot read skips `readAbsent`, which is why the single-param case above
    // was quiet even before the write coalesced — and why it did not cover this
    // one. With two params the boot pass dispatches for both rows, so the same
    // cross-row gap opens on a plain cold load: a shared two-param link cost the
    // visitor two history entries before they touched anything.
    expect(pushedHashes()).toEqual([]);
  });

  it('pushes exactly once for a selection the store makes on its own', async () => {
    seedHash('');
    const { store } = boot();
    await flush();

    pushState.mockClear();
    store.dispatch(requestFocus('body-mars'));
    await flush();

    // The counterweight to every empty assertion above: focusing something IS a
    // navigational act and MUST leave an entry, or Back stops undoing
    // selections. Coalescing the write must not become "publish less"; it is
    // "publish once, on the settled state". The single entry also pins that the
    // debounce fires at all rather than being cancelled forever by the
    // reconciler's own follow-up actions.
    expect(pushedHashes()).toEqual(['#focus=body-mars']);
  });
});
