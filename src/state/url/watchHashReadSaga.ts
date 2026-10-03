/**
 * watchHashReadSaga — the URL→store half of the hash sync. It applies the hash
 * the visitor arrived on once at boot, then drains `createHashChangeChannel`
 * forever, applying every subsequent navigation the same way. What each param
 * means lives in `HASH_PARAM_SOURCES` and `linkIntentFrom`; this saga is the
 * uniform pump, exactly as `watchKeyboardEventsSaga` is for keys.
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
 * ### Two passes
 *
 * The boot read hands its intent to `arrivalSaga`, which owns the first view;
 * a back/forward navigation is applied here. They also differ in what an
 * ABSENT param means. On arrival it means nothing at all — the store has just
 * booted at its defaults, so there is nothing to restore. On a navigation it
 * means "this history entry claims no value here", and the param must return
 * to its default or the entry is a lie: `#orientation=galactic` → Back would
 * otherwise leave the camera galactic forever.
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
 * hash-write trigger, and `applyNavigation` dispatches one action at a time — so
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
import { hashNavigationStarted } from './hashNavigationStarted';
import { arrivalPending } from '../arrival/arrivalSlice';
import { navigateSaga } from '../navigation/navigateSaga';
import { linkIntentFrom } from '../../utils/url/linkIntentFrom';
import { createHashChangeChannel } from '../../services/url/createHashChangeChannel';
import { readHashBody } from '../../services/url/readHashBody';
import { parseHashParams } from '../../utils/url/parseHashParams';

/**
 * Apply one navigation to the store: what the link says (`navigateSaga`, which
 * flies), then each ABSENT row's default.
 */
function* applyNavigation(body: string) {
  yield* put(hashNavigationStarted());
  yield* call(navigateSaga, linkIntentFrom(body), 'fly' as const);

  const params = parseHashParams(body);
  for (const source of HASH_PARAM_SOURCES) {
    // Falsy, NOT `=== undefined`: `#focus=` (a URL truncated in a chat client)
    // is present but says nothing, so it restores the default like an absence
    // — the same test by which `linkIntentFrom` keeps `''` from any row's `read`.
    if (params.get(source.key)) continue;
    for (const action of source.readAbsent()) yield* put(action);
  }
}

export function* watchHashReadSaga() {
  const channel = yield* call(createHashChangeChannel);
  try {
    // The boot read sits INSIDE the try. It is the pass most likely to throw —
    // it is the only one fed a URL nobody in this session composed — and a
    // throw outside would leave the DOM listener attached with no owner.
    yield* put(arrivalPending(linkIntentFrom(yield* call(readHashBody))));
    while (true) {
      yield* call(applyNavigation, yield* take(channel));
    }
  } finally {
    channel.close();
  }
}
