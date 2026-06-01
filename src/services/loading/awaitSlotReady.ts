/**
 * awaitSlotReady — adapt an `AssetSlot`'s subscribe-based ready/error
 * lifecycle into a Promise that resolves with the loaded value, or
 * with a caller-supplied fallback on `error` / null-slot.
 *
 * `AssetSlot` (see `./types.ts`) is the project's typed I/O lifecycle
 * primitive.  Its public surface is event-shaped: `load(req)` triggers a
 * (re)fetch — non-idempotent, every call aborts any prior load and
 * re-fetches; `state()` returns a discriminated snapshot; `subscribe(fn)`
 * fires on every transition and returns an unsubscribe closure.  That shape is exactly what the slot needs —
 * but most consumers (the palette's `useAliasIndex`, future MSDF-label
 * lazy loaders, etc.) prefer to `await` a single value.  This helper
 * is the boring adapter that bridges the two without each consumer
 * reinventing the subscribe/resolve/unsubscribe dance and inevitably
 * getting one of the corner cases wrong.
 *
 * ### Why the caller calls `slot.load()`, not the helper
 *
 * Each slot's `load()` takes a different request payload — the
 * point-cloud slots want `{ source, tier }`, `pgcAlias` wants nothing,
 * a future label slot might want a glyph-set descriptor.  A generic
 * helper that called `load(req)` itself would force a third type
 * parameter and a per-call payload argument on every consumer, even
 * the void-request ones.  Keeping `load()` as the caller's
 * responsibility lets this helper stay focused on the wait-for-
 * transition part — which is the genuinely shared logic.  Two-line
 * call sites (`slot?.load(); return awaitSlotReady(slot, fallback);`)
 * are the explicit cost, and the gain is that callers with a
 * pre-bound request don't have to plumb it through a generic.
 *
 * ### Why the fast-path read of `state()` is load-bearing
 *
 * Once a slot transitions to `ready`, it stays there until the next
 * `load()` (which always re-fetches via a transient `loading` →
 * `committing` → `ready`).  Critically, `subscribe()` only fires on transitions —
 * a subscription registered against an already-`ready` slot will
 * never fire on its own.  Without the synchronous fast-path read,
 * repeat callers (the palette opens twice, the React strict-mode
 * double-mount, anything else that hits the same lazy slot more than
 * once after first success) would hang forever on a subscription
 * waiting for an event that already happened.  The fast-path is the
 * fix; the subscribe path is the cold-cache case.
 *
 * ### Why `error` resolves with the fallback rather than rejecting
 *
 * This matches the existing graceful-degradation contract that the
 * extracted `loadPgcAliases` codified: the palette's alias index is
 * an enrichment, not a hard dependency, and the famous-only search
 * still works against an empty Map.  Forcing every consumer to
 * `try`/`catch` around the helper would just push noise into call
 * sites that have no useful error-recovery action — they'd all
 * funnel back to the same fallback anyway.  If a future caller
 * actually wants to surface the error, they can read `slot.state()`
 * after this resolves and branch on `kind === 'error'`; or, if that
 * proves common enough to warrant first-class support, a sibling
 * `awaitSlotReadyOrThrow` can be added without complicating this
 * helper.  YAGNI for now.
 *
 * ### Why a null slot resolves with the fallback (not a crash)
 *
 * `assetSlots` is populated incrementally during engine bootstrap —
 * the GPU init IIFE mints each slot only after its dependencies (the
 * device, the cloud-ready callback, etc.) exist.  Public-handle
 * methods that touch a lazy slot can therefore be invoked before
 * that slot is non-null.  Same graceful-degradation reasoning as the
 * `error` branch: returning the fallback keeps the public method
 * total — no extra crashes during the bootstrap window — without
 * losing any signal a caller could actually act on.
 *
 * ### Why `unsubscribe()` runs before `resolve()`
 *
 * `subscribe()` keeps the closure alive on the slot's listener list
 * until its returned unsubscribe is called.  If we resolved first
 * and unsubscribed second, a ready→error or vice-versa transition
 * arriving between the two micro-ops would re-enter the closure and
 * call `resolve` a second time (the inner `if`s would still match —
 * the closure has no idea it already fired).  Promise-spec says the
 * second resolve is a silent no-op, but holding onto the listener
 * is a real leak: the closure pins the surrounding `Promise`'s
 * captured locals for the lifetime of the slot.  Unsubscribing
 * first eliminates both concerns and makes the test for
 * "subscriber stops being called after resolve" trivially pass.
 *
 * ### Why `F = T` by default
 *
 * The common case is a fallback of the same shape as the success
 * value — an empty `Map`, a zero-length array, a sentinel record
 * matching the success type's interface.  Defaulting `F` to `T` lets
 * `awaitSlotReady(slot, new Map())` infer cleanly with one type
 * argument's worth of context: the slot's payload type pins both `T`
 * and `F`, so the caller doesn't have to write `<PgcAliasMap, …>`
 * every time.  Callers that genuinely want a different fallback type
 * (e.g. resolving with a discriminated `{ ok: false, reason: 'fallback' }`)
 * can still pass the second argument explicitly and TypeScript will
 * widen `F` to the union.
 */

import type { AssetSlot } from '../../@types/loading/AssetSlot';

/**
 * Adapt an `AssetSlot`'s ready/error transition into a Promise.
 *
 * Resolves with the loaded value on `ready`, or with the supplied
 * `fallback` on `error` or when the slot is null.  Never rejects —
 * see the module header for the rationale.
 *
 * The caller is responsible for invoking `slot.load()` if the slot
 * needs a (re)fetch; this helper only waits for an already-pending or
 * already-cached transition to complete.
 */
export async function awaitSlotReady<T, F = T>(
  slot: AssetSlot<T, unknown> | null,
  fallback: F,
): Promise<T | F> {
  if (!slot) return fallback;
  // Fast-path: a slot that's already `ready` won't fire another
  // transition just because we subscribed, so reading `state()`
  // synchronously is the only way to resolve cached re-calls.  See
  // module header for the full rationale.
  const current = slot.state();
  if (current.kind === 'ready') return current.value;
  return new Promise<T | F>((resolve) => {
    const unsub = slot.subscribe((s) => {
      if (s.kind === 'ready') {
        // Unsubscribe before resolving so a subsequent transition
        // can't re-enter this closure (see module header).
        unsub();
        resolve(s.value);
      } else if (s.kind === 'error') {
        unsub();
        resolve(fallback);
      }
      // `loading` / `committing` / `idle` are transient — keep
      // listening; the slot's reducer guarantees we'll eventually
      // see `ready` or `error`.
    });
  });
}
