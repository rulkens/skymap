/**
 * createHashChangeChannel — wrap the DOM `hashchange` event in a redux-saga
 * `eventChannel` so a saga can `take` URL navigations as plain values.
 *
 * Same layering as `services/input/createKeyboardListener` ↔
 * `state/input/watchKeyboardEventsSaga`: the DOM subscription lives here, the
 * routing (which param means which action) lives in the consuming saga, and the
 * channel carries the smallest thing that crosses between them.
 *
 * That smallest thing is the hash *body* (no leading `#`), not the event. The
 * saga wants the string `parseHashParams` consumes, and emitting a
 * `HashChangeEvent` would drag a DOM type across the seam for nothing. The body
 * is re-read from `window.location` rather than parsed out of the event's
 * `newURL`, so a burst of navigations always reports the URL the browser
 * actually settled on instead of replaying intermediate ones.
 *
 * `hashchange` fires for Back/Forward across hash-only history entries and for a
 * hand-edited address bar. It does NOT fire for `history.pushState`, which is how
 * `writeHashBody` publishes — see that file for why the write can never feed this
 * channel.
 *
 * ### An empty body is a real event
 *
 * Navigating to a hashless URL emits `''`. redux-saga rejects `undefined` and
 * `null` on a channel but an ordinary empty string passes, so "the visitor went
 * Back to a bare URL" survives the seam — and it has to, because that is exactly
 * the case where every param has to restore its default.
 *
 * ### Buffering
 *
 * The default `buffers.none()` matches `createKeyboardListener`: an event that
 * arrives while no taker is parked is dropped. The consuming saga returns to its
 * `take` synchronously after dispatching, so the only losable event would be one
 * fired from inside that dispatch — which a hash navigation, driven by the user
 * or the history stack, cannot be. Buffering instead would queue stale bodies and
 * replay superseded URLs into the store.
 *
 * ### Headless guard — load-bearing, not SSR insurance
 *
 * With no `window` there is nothing to listen to, so the channel simply never
 * emits: `take(channel)` parks forever, exactly as it would in a browser tab
 * whose URL the visitor never changes, and `close()` stays safe to call. Letting
 * a `ReferenceError` escape instead would abort the consuming saga and, through
 * redux-saga's fork tree, its siblings under the same `all(...)` — turning "no
 * DOM" into "the root saga fell over". See `readHashBody` for why that path is
 * reached by the existing test suite rather than only by a hypothetical SSR pass.
 */

import { eventChannel, type EventChannel } from 'redux-saga';

import { readHashBody } from './readHashBody';

export function createHashChangeChannel(): EventChannel<string> {
  if (typeof window === 'undefined') {
    // No DOM ⇒ no navigation source. A channel that never emits and whose
    // teardown is a no-op, so `take(channel)` parks and `close()` is safe.
    return eventChannel<string>(() => () => {});
  }
  return eventChannel<string>((emit) => {
    const onHashChange = () => emit(readHashBody());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });
}
