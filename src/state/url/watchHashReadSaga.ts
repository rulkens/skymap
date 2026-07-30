/**
 * watchHashReadSaga — the URL→store half of the hash sync. It applies the hash
 * the visitor arrived on once at boot, then drains `createHashChangeChannel`
 * forever, applying every subsequent navigation the same way. Routing (which
 * param means which actions) lives entirely in `HASH_PARAM_SOURCES`; this saga
 * is the uniform pump, exactly as `watchKeyboardEventsSaga` is for keys.
 *
 * ### Why its dispatches need the engine context to exist
 *
 * This is the only saga in the tree that dispatches on its own initiative rather
 * than in response to an action. The dispatches themselves are ordinary
 * settings/selection writes, but the watchers they wake reach the engine through
 * `getContext` — `watchWakeSaga` wants `reconcile.requestRender`, the selection
 * reconciler wants `resolveDeps`. Reached with an empty context bag they throw,
 * and redux-saga propagates a watcher's throw to the root, cancelling every OTHER
 * watcher with it: one deep link would cost the session its wake, tier
 * transitions, selection resolution, tour and keyboard, and
 * `/#orientation=galactic` is enough to do it.
 *
 * So this saga must not start before the engine has registered those
 * capabilities. The wait is `watchHashSaga`'s, which holds both halves of the
 * bridge on the same signal. Forked on its own it reads the URL the instant it
 * starts — safe only where nothing downstream of its dispatches reaches for the
 * engine, which is true of its test and of nowhere in the app.
 *
 * ### Two passes, one flag
 *
 * The boot read and a back/forward navigation differ in precisely one respect:
 * what an ABSENT param means. On arrival it means nothing at all — the store
 * has just booted at its defaults, so there is nothing to restore. On a
 * navigation it means "this history entry claims no value here", and the param
 * must return to its default or the entry is a lie: `#orientation=galactic` →
 * Back would otherwise leave the camera galactic forever.
 *
 * That distinction is a property of the PASS, not of any row, which is why
 * `isInitial` is read exactly once, in `applyHash`, and never reaches a row.
 * See `applyHash` for what the alternative would have cost.
 *
 * ### Why the channel is opened before the boot read
 *
 * A hash navigation that lands while the boot read is still dispatching would be
 * lost if the listener were attached afterwards. Opening first cannot misorder
 * anything: the channel's taker does not exist until the boot read returns, and
 * `buffers.none()` drops what nobody is waiting for. What is dropped is never
 * lost, because `readHashBody` runs AFTER the channel is open — the boot read
 * always reads the live hash, which already includes any navigation that beat it.
 *
 * ### Why the write half can never feed this one
 *
 * `writeHashBody` publishes with `history.pushState`, which fires neither
 * `hashchange` nor `popstate`. The store→URL and URL→store halves therefore
 * run concurrently over one resource with no cycle between them — which is
 * what lets `watchHashSaga` fork both and forget about them.
 *
 * No cycle is not the same as no interaction, and the difference is where the
 * history stack gets damaged. Every action this saga dispatches is a candidate
 * hash-write trigger, and `applyHash` dispatches one row's worth at a time — so
 * a store part-way through the pass is a store that has applied SOME of the URL,
 * and any write composing from it publishes a hash that was never on any history
 * entry. A `pushState` during a Back navigation truncates the forward stack, so
 * that is a history bug rather than a cosmetic one: it is why the write half
 * coalesces to the trailing edge of the burst instead of answering each trigger
 * (`watchHashWriteSaga`), and why `tests/state/url/hashHistoryIntegrity` counts
 * the pushes a navigation is allowed (none).
 *
 * The pass makes no attempt to be atomic in exchange. Batching the whole table
 * into one dispatch would put the sequencing burden here, on the half that has
 * no idea what a settled store looks like, and it would still not help the hops
 * the selection reconciler takes AFTER the last row lands. Waiting for quiet is
 * the write half's question to answer, and it is the only half that can.
 */

import { take, call, put } from 'typed-redux-saga';

import { HASH_PARAM_SOURCES } from './hashParamSources';
import { createHashChangeChannel } from '../../services/url/createHashChangeChannel';
import { readHashBody } from '../../services/url/readHashBody';
import { parseHashParams } from '../../utils/url/parseHashParams';

/**
 * Apply one hash body to the store: walk the table, hand each row its value,
 * and `put` whatever actions come back.
 *
 * `isInitial` is consumed here and only here. Threading it into every row's
 * `read` instead — which is the shape this replaced — hands three rows a flag
 * they would all branch on identically, and turns "the boot read restores
 * nothing" into a claim re-stated once per row, free to drift in any one of
 * them. Stated at the pass, a new row inherits it by existing.
 */
function* applyHash(body: string, isInitial: boolean) {
  const params = parseHashParams(body);
  for (const source of HASH_PARAM_SOURCES) {
    const value = params.get(source.key);

    // The falsy check is deliberate and is NOT interchangeable with
    // `value !== undefined`. `#focus=` parses to the key `focus` mapped to
    // `''` — present on the URL, but saying nothing — and routing it to the
    // absent arm here is what makes `HashParamSource.read`'s "never called
    // with an empty value" contract true. No row carries an empty-string
    // guard of its own because of this line: widening it would have `focus`
    // request the id `''` and `t` try to parse `''` as a date, from a URL that
    // was merely truncated in a chat client.
    //
    // The boot read skips the absent arm entirely. The store has just booted
    // at its defaults so there is nothing for `readAbsent` to correct, and it
    // would not be inert: `clearSelection()` on a bare load races the engine's
    // own home seed (`wireInput`'s Earth focus/select), and whichever landed
    // second would win. Absence only carries meaning once something was there
    // to lose, which is exactly what a hashchange reports.
    const actions = value ? source.read(value) : isInitial ? [] : source.readAbsent();
    for (const action of actions) yield* put(action);
  }
}

export function* watchHashReadSaga() {
  const channel = yield* call(createHashChangeChannel);
  try {
    // The boot read sits INSIDE the try. It is the pass most likely to throw —
    // it is the only one fed a URL nobody in this session composed — and a
    // throw outside would leave the DOM listener attached with no owner.
    yield* call(applyHash, yield* call(readHashBody), true);
    while (true) {
      yield* call(applyHash, yield* take(channel), false);
    }
  } finally {
    channel.close();
  }
}
