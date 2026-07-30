/**
 * writeHashBody — publish a hash *body* (no leading `#`) to the address bar,
 * skipping the write when the URL already says it.
 *
 * This is the write half of the `services/url` DOM seam; `readHashBody` and
 * `createHashChangeChannel` are the read half. Nothing above this folder touches
 * `window`, so the sagas reach the URL through `call` and a test can replace the
 * whole seam with three mocks.
 *
 * ### Why `pushState`, not `replaceState`
 *
 * Focusing a galaxy or a structure is a navigational act: Back should return to
 * the previous selection (galaxy ↔ structure ↔ empty), and only a new history
 * entry can offer that. `replaceState` would collapse a session's entire
 * selection history into one entry and make the first Back leave the app.
 *
 * `pushState` is also *silent* — it fires neither `hashchange` nor `popstate` —
 * so this write can never wake `createHashChangeChannel` and there is no
 * write↔read loop to break. That silence is load-bearing rather than incidental:
 * the obvious alternative, assigning `window.location.hash = body`, DOES fire
 * `hashchange`, and the read side would immediately pump the params it just wrote
 * back into the store.
 *
 * ### Compare-and-skip reads the live URL rather than remembering the last write
 *
 * Every call re-reads the hash and returns early when it already matches. The
 * alternative is to cache the last body written and compare against that, which
 * saves one property read and buys a cache-invalidation problem in exchange:
 * Back/Forward and a hand-edited address bar both move the URL without this
 * module's knowledge, so the cache would need its own `hashchange` listener to
 * stay honest — a module-level DOM subscription with no owner, no teardown, and
 * one more way to go stale. `window.location` already *is* that cache: it is
 * updated synchronously by `pushState` and it is never wrong. Writes fire on
 * selection, clock and orientation actions, never per frame, so the read costs
 * nothing worth defending against.
 *
 * The skip is what keeps the history stack usable. Without it, every action that
 * recomposes an identical body pushes a duplicate entry and Back walks the
 * visitor through a run of indistinguishable URLs. It is also what makes a cold
 * deep-link load quiet: the composed body matches the URL the visitor arrived on,
 * so no entry is pushed at all.
 *
 * ### An empty body drops the `#` entirely
 *
 * `writeHashBody('')` yields `pathname + search`, not a trailing `#`. A bare `#`
 * is legal but it is what the visitor then copies out of the address bar, and it
 * is a distinct URL from the clean one — so "nothing selected" would produce two
 * different shareable links depending on whether a selection had ever existed.
 *
 * The base is rebuilt from `pathname + search` on every write so the query string
 * survives. The `?` gates (`?tour`, `?cinema`, `?perf`, `?gpuTimings`) are read
 * live from `window.location.search`, so dropping it here would silently end a
 * tour the moment the visitor focused something.
 *
 * ### The `typeof window` guard is load-bearing, not SSR insurance
 *
 * See `readHashBody` — same reason, and the same suite breaks without it.
 */

import { readHashBody } from './readHashBody';

export function writeHashBody(body: string): void {
  if (typeof window === 'undefined') return;
  if (readHashBody() === body) return;
  const base = window.location.pathname + window.location.search;
  window.history.pushState(null, '', body ? `${base}#${body}` : base);
}
