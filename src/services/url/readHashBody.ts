/**
 * readHashBody — the current URL hash with its leading `#` stripped.
 *
 * "Body" is the vocabulary the rest of the URL stack already speaks:
 * `parseHashParams` takes one, `composeHashParams` returns one, and a
 * `HashParamSource.write` contributes one param to one. This function is the
 * single place the `#` is removed, so no caller ever has to remember whether the
 * string it holds carries the sigil.
 *
 * The value passes through raw — no `decodeURIComponent`. That is deliberate and
 * matches `parseHashParams`'s encoding policy: skymap's hashes are un-encoded
 * slugs (`focus=cluster-virgo-m87`, `t=2026-07-29T12:00:00.000Z`), and decoding
 * them would change the bytes of every deep link already in circulation.
 *
 * ### The `typeof window` guard is load-bearing, not SSR insurance
 *
 * Skymap does not server-render, which makes this branch look like dead
 * defensive code that a tidy-up could delete. Deleting it breaks the test suite.
 * `createAppStore` forks `mainSaga`, and the hash read saga performs its arrival
 * read as soon as the saga context is registered rather than lazily on an action —
 * so `createTestStore`, which registers one, triggers it. A large share of the
 * suite boots such a store under vitest's default `node` environment, where
 * `window` is genuinely absent. Without the guard those tests die with
 * `ReferenceError: window is not defined` before reaching their own subject, and
 * the failure surfaces as an unrelated saga falling over rather than as anything
 * about URLs.
 *
 * Returning `''` rather than throwing is the honest answer, not a fallback: no
 * address bar means no hash, and an empty body is exactly how "no params" is
 * spelled everywhere else in this stack.
 *
 * The two siblings in this folder (`writeHashBody`, `createHashChangeChannel`)
 * carry the same guard for the same reason.
 */

export function readHashBody(): string {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash;
  return hash.startsWith('#') ? hash.slice(1) : hash;
}
