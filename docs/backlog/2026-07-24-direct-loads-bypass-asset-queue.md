# Direct `slot.load()` sites bypass the bounded asset queue

`needs-design`

## The problem

`ASSET_QUEUE_CONCURRENCY = 2` reads as "at most two boot fetches in
flight", and its docblock argues the number from HTTP/2 pipe-splitting.
It is not that bound. It bounds only the fetches that go through
`evaluateRows`; five other call sites still invoke `slot.load()`
directly and start a download the queue never sees, at no rank and
against no limit.

The boot-load-priority spec scoped these out deliberately (spec §1
scope boundary) — they are not boot-path calls, so the feature's own
goal is unaffected. What is left behind is a constant whose name and
docblock claim more than the artifact delivers, and a fetch-ordering
policy with a hole in it.

## Verified current state

Direct `.load()` sites outside the queue:

- `src/services/engine/wiring/makeRunTierTransition.ts:65,72,84` — the
  tier-transition reload loop (points, MCPM, star catalogs). At a tier
  switch this can start every enabled catalog at once, which is the
  exact pattern the queue exists to prevent, just not at boot.
- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts:160` —
  `loadCompanionAssets`, reached from the tier transition above.
- `src/services/loading/AssetSlot.ts` `forceReload` — debug-panel
  Reload button.
- `src/services/engine/volume/maybeLazyLoadDebugVolume.ts:31` — dev
  synthetic volumes.

`reevaluateDemand`'s enqueued fetcher re-checks `slot.state().kind ===
'idle'` before loading, so a direct load racing a queued one is safe;
the gap is ordering and concurrency, not correctness.

## Directions to explore (design decides)

- Route the tier-transition reloads through the queue with the row's
  own `priority`. It is the site that most resembles a boot: many
  large payloads, one trigger, an ordering that matters. Needs a
  decision on whether a tier switch should drop whatever the previous
  tier left pending.
- Leave `forceReload` and the debug volume out — both are explicit
  one-shot user actions where a queue delay is a worse experience than
  a third concurrent fetch.
- If the remaining sites stay out, rename the constant to say what it
  bounds (the demand-driven queue), so it stops reading as a
  system-wide invariant.

## Related

- `backlog/2026-07-22-asset-loading-audit.md` — the eviction/residency
  half of the same wiring table.
