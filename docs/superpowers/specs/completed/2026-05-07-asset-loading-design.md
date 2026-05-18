# Asset Loading Infrastructure — Design

**Status:** Draft (2026-05-07)
**Owner:** @rulkens
**First consumer:** Existing `.bin` catalog and sidecar loaders; future CF-4 density volume and MSDF labels both depend on this primitive.

## Goal

Replace the ad-hoc collection of asset loaders (`cloudLoader`, `famousMetaLoader`, `pgcAliasLoader`, plus the implicit pattern the upcoming CF-4 and MSDF specs already promise to "mirror") with a single primitive that owns the full lifecycle: fetch → decode → commit (e.g. GPU upload) → atomic activation. Eliminate the tier-swap race conditions that today require mouse movement to reveal newly-loaded data and that occasionally render two tiers' worth of points overlapped. Provide structured failure handling, a dev-only debug panel, and a console-logging adapter — all built on top of the same primitive so adding a new loader is a one-line `createAssetSlot` call rather than a fresh copy of the old patterns.

**Non-goals:**

- The runtime galaxy thumbnail subsystem (`galaxyImageFetcher`, `galaxyImageQueue`, `textureAtlas`) is **out of scope**. It has a fundamentally different lifecycle (hundreds of concurrent fetches, LRU eviction tied to the GPU atlas, per-galaxy priority gating) and its current machinery works. The new loader infra explicitly does not try to subsume it.
- Persistent (IndexedDB) caching. We rely entirely on the browser's HTTP cache + R2's `max-age=86400` for catalog `.bin` files. No application-level cache layer.
- Server-side caching headers. Already configured (`public/_headers` for Workers Assets, `tools/syncR2.ts` for R2).
- Resumable downloads (Range requests). The largest asset (`glade-large.bin`, ~130 MB) downloads in tens of seconds on a typical desktop connection; resume-on-disconnect adds complexity for a marginal UX gain. Punt.
- Worker-thread decoding. The existing decode functions (`decodePointCloud`, `decodeFilaments`) run on the main thread today and that's not currently a bottleneck — punt unless profiling later proves otherwise.

## Why this is needed

### The race condition (primary motivator)

The current tier-swap path threads orchestration across four modules:

1. `engine.setTier` calls `reloadSource(source, tier, onResult, onEvent)` for each source whose target count differs.
2. `cloudLoader.reloadSource` aborts whatever's currently in `inflightControllers` and starts a new fetch.
3. The fetch's `.then` invokes `onResult`, which calls `renderer.upload(source, cloud)` (async, fire-and-forget) and *immediately* calls `scheduler.requestRender()` next to it.
4. The next frame draws — but `renderer.upload`'s GPU buffer write may not be complete yet, so the frame uses the OLD buffer. Mouse movement → another `requestRender` → by now upload landed → new tier appears.

Two specific bugs:

- **`requestRender` runs before `upload` completes.** `pointRenderer.upload` returns a Promise (it `await`s `device.queue.onSubmittedWorkDone()` internally for the buffer-replace path). The orchestration never awaits it; the Promise is dropped on the floor with `.catch(...)`.
- **Microtask race in the abort registry.** `loadAllClouds` registers its `AbortController` *inside* a `.then` continuation, after the wrapped fetch starts. There is a window between "loadAllClouds starts" and "controller is in the registry" where a `reloadSource` call's `prior.abort()` finds nothing to abort. Both fetches run; whichever lands second writes last.

These behave differently in dev vs production because the timing windows scale with network latency. In dev (Vite serving from localhost), the fetch resolves in milliseconds and most races never open; in production (R2, transatlantic, ~300 ms+), the windows widen and races become reliable.

The fix is structural, not vigilance-based: a single "asset slot" owns abort + fetch + decode + commit + activation as one indivisible operation, with a generation counter that drops superseded results both before and after the (async) commit step. The slot is the only place that talks to `requestRender`, and it does so only after commit has resolved.

### Pattern fragmentation (secondary motivator)

Five different fetch patterns exist today across `cloudLoader.ts`, `famousMetaLoader.ts`, `pgcAliasLoader.ts`, the implicit `loadFilaments` style, and the upcoming CF-4 density loader's spec ("Mirrors `loadFilaments()` exactly"). The MSDF labels spec promises a sixth. Each rolls its own variant of fetch + decode + error handling + (sometimes) progress events. New renderers will keep adding variants until we stop.

Collapsing them onto one primitive — a `Fetcher<T, Req>` function plus a `createAssetSlot` call — means future renderers add a fetcher fn and a slot wiring line. The orchestration is solved once.

### Failure handling and debug visibility

Today, every load failure dumps to `console.warn` and returns null/empty. The user has no in-app way to see *why* an asset didn't load (404? CORS? decode error? aborted?). When the production CDN occasionally serves a 502 or a slow byte stream, there is no automatic retry — one transient blip and the user is stuck with a missing layer until they hard-reload.

This spec adds: light retry (2× with `[1000, 3000]` ms backoff for 5xx + network errors; 4xx fails immediately except 408/429), a structured console-logger adapter (one log per state transition, not per byte), and a dev-only debug panel that lists every slot's current state with a per-slot "Reload" button.

## Architecture overview

```
┌─────────────────────────────────────────────────────┐
│  Pure helpers (no mutable state, exhaustively tested)│
│                                                      │
│  fetchWithProgress.ts   streaming fetch              │
│  retryPolicy.ts         (attempt, err) → action      │
│  reduceLoadState.ts     (state, event) → state       │
│  aggregateRegistry.ts   slots → snapshot             │
│  consoleAdapter.ts      (prev, next) → log entry?    │
└────────────┬─────────────────────────────────────────┘
             │ called by
             ▼
┌─────────────────────────────────────────────────────┐
│  AssetSlot.ts (the ONLY stateful module, ~80 LOC)   │
│                                                      │
│  Mutable cell: { generation, current, subscribers }  │
│  Owns: fetch → retry-loop → commit → swap → notify   │
└────────────┬─────────────────────────────────────────┘
             │ instantiated per-asset by
             ▼
┌─────────────────────────────────────────────────────┐
│  engine.ts                                           │
│  Creates slots: sdss, 2mrs, glade, famous,          │
│                 famousMeta, pgcAlias, filaments,    │
│                 cf4Density (future), msdf (future)   │
│  setTier(t) → slot.load({tier: t})                  │
└─────────────────────────────────────────────────────┘
```

The design intentionally pushes as much logic as possible into pure functions. Only `AssetSlot.ts` carries mutable state, and even there the state is a thin shell — every transition is computed by a pure reducer (`reduceLoadState`), and every retry decision by a pure policy fn (`retryPolicy`). This makes the test surface dominated by pure-function unit tests; the integration tests for `AssetSlot` itself are a small handful covering the race-fix invariants.

## Module breakdown

### `src/services/loading/types.ts`

Shared type definitions. Pure types, no implementation.

```ts
export type LoadState<T> =
  | { kind: 'idle' }
  | { kind: 'loading'; req: unknown; loaded: number; total: number; attempt: number }
  | { kind: 'committing'; req: unknown }
  | { kind: 'ready'; req: unknown; value: T; loadedAtMs: number }
  | { kind: 'error'; req: unknown; error: Error; finalAttempt: number };

export type Fetcher<T, Req> = (
  req: Req,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
) => Promise<T>;

export type Committer<T> = (value: T, signal: AbortSignal) => Promise<void>;

export type RetryDecision = { delayMs: number } | 'give-up';
export type RetryPolicy = (attempt: number, error: Error) => RetryDecision;
```

The request type is generic per asset — `pointCloudFetcher` declares `Fetcher<PointCloud, { source: Source; tier: Tier }>`, the famous-meta fetcher uses `Fetcher<FamousMetaPayload, void>`. The slot's `load(req)` is typed against the asset's request, so engine.ts cannot accidentally call a sidecar slot with a tier-bearing request.

### `src/services/loading/fetchWithProgress.ts`

Extracted from the existing `cloudLoader.fetchWithProgress`. Pure I/O over the fetch API. Streams the response body and reports progress per chunk. Falls back to `res.arrayBuffer()` when `res.body` is unavailable. Throws on non-2xx and on abort.

The signature simplifies — no more `LoadEventCallback` tagged union, just a plain `(loaded, total) => void` callback. The slot translates progress into state-machine events on the consumer side.

Co-located in this module: a small `HttpError` class extending `Error` with a `.status: number` field. `fetchWithProgress` throws `new HttpError(res.status, url)` on non-2xx so `retryPolicy` can branch on status without parsing message strings. Keeping it next to the throw site (rather than a shared `errors.ts`) means the policy module imports from `fetchWithProgress` and there's no circular dep risk.

Also re-exports `dataUrl(filename)` (lifted unchanged from the existing `cloudLoader.ts`). Every fetcher composes URLs from `dataUrl()`, so it lives at the I/O boundary.

### `src/services/loading/retryPolicy.ts`

```ts
export const defaultRetryPolicy: RetryPolicy = (attempt, error) => {
  // 4xx (except 408 Request Timeout, 429 Too Many Requests) → permanent.
  if (isHttpError(error)) {
    const code = error.status;
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return 'give-up';
  }
  // 5xx and network errors → 2 retries with [1s, 3s] backoff.
  const backoff = [1000, 3000];
  if (attempt >= backoff.length) return 'give-up';
  return { delayMs: backoff[attempt] };
};
```

Pure function. `isHttpError` is a small predicate over a thrown `HttpError` class that `fetchWithProgress` raises with a `.status` property. Aborts are detected separately — the slot never feeds an `AbortError` to the policy because aborts mean "supersession", not "transient failure", and they should not trigger retry.

### `src/services/loading/reduceLoadState.ts`

```ts
export type LoadEvent =
  | { kind: 'load-started'; req: unknown }
  | { kind: 'bytes'; loaded: number; total: number }
  | { kind: 'fetch-succeeded' }
  | { kind: 'committing' }
  | { kind: 'committed'; value: unknown; nowMs: number }
  | { kind: 'retry-scheduled'; attempt: number }
  | { kind: 'gave-up'; error: Error; attempt: number };

export function reduceLoadState<T>(state: LoadState<T>, event: LoadEvent): LoadState<T>;
```

Pure reducer. The slot's stateful loop dispatches events through this function; the reducer has no side effects, no `Date.now()` calls (the timestamp is part of the `committed` event payload), no I/O.

This module gets exhaustive table-driven tests — every event type from every state, asserting either the new state or that the transition is illegal (and throws / falls through unchanged). Roughly 20-30 test rows.

### `src/services/loading/aggregateRegistry.ts`

```ts
export type RegistrySnapshot = {
  slots: Array<{ name: string; state: LoadState<unknown> }>;
  totalLoadedBytes: number;
  totalExpectedBytes: number;
  inFlightCount: number;
};

export function aggregateRegistry(slots: ReadonlyMap<string, AssetSlot<unknown>>): RegistrySnapshot;
```

Pure projection. Used by both the existing `loadProgressAggregator` (which becomes a thin subscriber on top of this) and the dev panel. The existing `loadProgressAggregator.ts` is rewritten as a one-liner `aggregateRegistry(slots) → emit(...)`.

### `src/services/loading/consoleAdapter.ts`

```ts
export function consoleAdapterFor(name: string): (prev: LoadState<unknown>, next: LoadState<unknown>) => void;
```

Returns a subscriber-shaped fn that logs structured `[loading]` lines on meaningful state transitions:

```
[loading] sdss-points  load-start  req={source:1, tier:'large'}
[loading] sdss-points  bytes       42% (9.7/23.1 MB)
[loading] sdss-points  ready       23.1 MB in 1247 ms
[loading] sdss-points  retry       attempt=2 in 3000ms (HTTP 502)
[loading] glade-points error       gave up after 3 attempts (NetworkError)
```

Bytes-progress logs are throttled (1 per 250 ms) so a fast 100 MB fetch doesn't flood the console. The adapter is pure: input is `(prev, next)`, output is a `console.log` call (or no-op if no transition is interesting). One adapter is auto-attached per slot at creation; verbosity is gated by `import.meta.env.DEV` (info-level transitions silenced in prod, errors always log).

### `src/services/loading/AssetSlot.ts`

The only stateful module. ~80 LOC including comments.

```ts
export type AssetSlot<T, Req> = {
  readonly name: string;
  load(req: Req): void;                       // fire-and-forget
  current(): T | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;                        // dev-panel "Reload" button
  cancel(): void;                             // dev-panel "Cancel" button — aborts active fetch, keeps last-ready value
};

export function createAssetSlot<T, Req>(args: {
  name: string;
  fetch: Fetcher<T, Req>;
  commit?: Committer<T>;                      // optional — sidecars without GPU upload omit
  retry?: RetryPolicy;                        // defaults to defaultRetryPolicy
}): AssetSlot<T, Req>;
```

**Internal state (the entire mutable surface of the loading system):**

```ts
{
  generation: number;                        // monotonic, incremented on every load() call
  state: LoadState<T>;                       // result of running the reducer over events so far
  abortController: AbortController | null;   // active fetch's abort handle
  subscribers: Set<(state: LoadState<T>) => void>;
  lastRequest: Req | null;                   // for forceReload
}
```

**`load(req)` algorithm:**

1. Increment `generation`, capture `myGen = generation`.
2. Abort the current `abortController` (if any). Allocate a new one.
3. Dispatch `load-started` event through the reducer; notify subscribers.
4. Enter the retry loop:
   - Try `await fetch(req, signal, onProgress)`. `onProgress` dispatches `bytes` events through the reducer and notifies subscribers; if `myGen !== generation`, the progress events are dropped to avoid flickering an in-flight UI for a stale fetch.
   - On success: dispatch `fetch-succeeded`, break out of the retry loop.
   - On `AbortError`: return silently — the new load already fired its `load-started`.
   - On other error: ask `retryPolicy(attempt, error)`. If `give-up`: dispatch `gave-up`, notify, return. If `{delayMs}`: dispatch `retry-scheduled`, notify, `await sleep(delayMs)`, loop. The sleep is also abort-aware — a new `load()` arriving during the sleep will fire AbortError and exit cleanly.
5. **First race check:** if `myGen !== generation`, return without committing. The newer load owns the slot now.
6. Dispatch `committing`, notify.
7. `await commit(value, signal)` if present. If commit throws non-AbortError, treat as a load failure (dispatch `gave-up`, no retry on commit errors — those are programming errors, not network).
8. **Second race check:** if `myGen !== generation`, return without notifying. Another load won during commit.
9. Dispatch `committed`, notify.

The two race checks (step 5 and step 8) are the structural fix for the current bug. They cover both windows:

- Step 5 protects against: load A is decoding while load B starts. Without the check, A's commit runs after B's, B's value gets stomped by A's stale value.
- Step 8 protects against: load A is committing (e.g. uploading to GPU) while load B starts. Without the check, A's `committed` notification fires after B's `load-started`, the renderer sees A's value as "current" briefly.

`forceReload()` simply re-dispatches the last request: `if (lastRequest !== null) load(lastRequest)`.

`subscribe(fn)` returns an unsubscribe closure. Subscribers are notified synchronously after every state change (including bytes-progress events). The slot does NOT debounce bytes; downstream consumers (dev panel, console logger) handle their own throttling — this keeps the slot behavior deterministic for tests.

### `src/services/loading/fetchers/`

One file per asset type. Each is a single pure async function. Examples:

```ts
// pointCloudFetcher.ts
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';
import { tierFilenameForSource } from '../../../data/tierTargets';
import { TIER_TARGETS } from '../../../data/tierTargets';
import { decodePointCloud } from '../../../data/pointCloudFormat';

export type PointCloudReq = { source: Source; tier: Tier };

export const pointCloudFetcher: Fetcher<PointCloud, PointCloudReq> = async (req, signal, onProgress) => {
  if (TIER_TARGETS[req.tier][req.source] === 0) {
    return emptyPointCloud();       // excluded-tier path: no fetch, return shaped empty
  }
  const url = dataUrl(tierFilenameForSource(req.source, req.tier));
  const buf = await fetchWithProgress(url, signal, onProgress);
  return decodePointCloud(buf);
};
```

```ts
// filamentFetcher.ts
export type FilamentReq = { tier: Tier };

export const filamentFetcher: Fetcher<FilamentCloud, FilamentReq> = async (req, signal, onProgress) => {
  const filename = req.tier === 'small' ? 'filaments-small.bin' : 'filaments.bin';
  const buf = await fetchWithProgress(dataUrl(filename), signal, onProgress);
  return decodeFilaments(buf);
};
```

```ts
// jsonFetcher.ts (generic helper; sidecars compose it)
export function makeJsonFetcher<T, Req = void>(
  urlFor: (req: Req) => string,
  parse: (raw: string) => T,
): Fetcher<T, Req> {
  return async (req, signal) => {
    const res = await fetch(urlFor(req), { signal });
    if (!res.ok) throw new HttpError(res.status, urlFor(req));
    return parse(await res.text());
  };
}

// famousMetaFetcher.ts
export const famousMetaFetcher = makeJsonFetcher<FamousMetaEntry[]>(
  () => dataUrl('famous_meta.json'),
  parseFamousMeta,
);
```

The existing parse helpers (`parseFamousMeta`, `parseFamousXrefs`, `parsePgcAliases`) move from their current files into the fetchers' modules. The old loader files (`cloudLoader.ts`, `famousMetaLoader.ts`, `pgcAliasLoader.ts`) are deleted.

`emptyPointCloud()` (returns a fresh `PointCloud` with all typed-array slots zero-length, count=0) is added to `src/data/pointCloudFormat.ts` next to `decodePointCloud`. The current cloudLoader builds this inline; lifting it to the format module makes it available to both the fetcher and any tests that need a count=0 fixture.

Famous-meta currently fetches two JSONs in parallel and merges. The new shape: ONE fetcher returns `{ meta, xrefs }` by doing the parallel fetch internally. Slot subscribers see one ready event, not two.

### Engine integration

`engine.ts` creates one slot per asset at construction:

```ts
const sdssSlot = createAssetSlot<PointCloud, PointCloudReq>({
  name: 'sdss-points',
  fetch: pointCloudFetcher,
  commit: async (cloud) => {
    if (!state.gpu.renderer) return;          // engine torn down
    await state.gpu.renderer.upload(Source.SDSS, cloud);
    state.sources.clouds.set(Source.SDSS, cloud);
  },
});

sdssSlot.subscribe((s) => {
  if (s.kind === 'ready') {
    cb.onCloudReady?.(Source.SDSS, s.value.count);
    state.subsystems.scheduler.requestRender();
  }
});
```

The slot owns "request render after commit". Engine no longer calls `requestRender` from any load-result callback.

`setTier` becomes a dispatcher with the existing prevTarget/nextTarget skip optimization preserved (it's engine-domain logic, not loader logic):

```ts
setTier(tier) {
  if (tier === state.sources.tier) return;
  const prevTier = state.sources.tier;
  state.sources.tier = tier;
  cb.onTierChange?.(tier);
  for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
    if (TIER_TARGETS[prevTier][source] === TIER_TARGETS[tier][source]) continue;
    state.assetSlots.points.get(source)?.load({ source, tier });
  }
}
```

Initial parallel load uses the slots directly:

```ts
for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
  state.assetSlots.points.get(source)?.load({ source, tier: state.sources.tier });
}
```

The synthetic-fallback path (when every real fetch fails) is preserved: a separate `syntheticSlot` (commit = upload synthetic cloud) is `load()`-ed if all real point slots end up in `error` state after their initial attempts. This collapses the current `loadedCount === 0` check into a slot-subscriber: a small `syntheticFallbackController` subscribes to all four point slots, and triggers the synthetic when they've all settled to `error` or `ready` (with count=0).

Filament loading stays a one-shot: engine calls `filamentSlot.load({ tier })` once at init, never again on tier change. Preserves the long-standing "filaments don't swap on tier change" behavior documented in the existing `filamentFilenameForTier` docblock.

### Dev panel — `src/components/LoadingDevPanel.tsx`

Mounted by `App.tsx` when `import.meta.env.DEV === true` OR `new URLSearchParams(window.location.search).get('debug') === 'loading'` (production escape hatch for debugging real-world failures). Subscribes to the asset registry. Renders a fixed-position panel (top-right corner, collapsible) with one row per slot:

```
┌─────────────────────────────────────────────────────────────────┐
│ Asset Loading                                          [×]      │
├─────────────────────────────────────────────────────────────────┤
│ sdss-points       ready    23.1 MB  attempt 1   234ms  [Reload] │
│   req: {source: 1, tier: 'large'}                               │
│ glade-points      loading  47%  47.1/100.2 MB  attempt 1 [Cancel]│
│   req: {source: 3, tier: 'large'}                               │
│ famous-meta       error    HTTP 404                     [Retry] │
│   req: {}                                                       │
│ filaments         idle     —                                    │
└─────────────────────────────────────────────────────────────────┘
```

Per-row affordances:

- **Reload** button → calls `slot.forceReload()`. Live whenever state is `ready` or `error`.
- **Cancel** button → calls `slot.cancel()`, a method on `AssetSlot` that aborts the active fetch (if any) and reverts state to the previous `ready` value (or `idle` if there was none). Useful for testing the abort path without code changes. Adds one method to the AssetSlot public surface.
- **Request column** shows JSON-stringified request, truncated to 80 chars. The user mentioned diagnosing "wrong tier showing" — being able to see at a glance that the slot's last successful load was for tier=`medium` while the engine thinks it's on `large` is exactly the diagnostic this provides.

The component is defined in dev-only code paths so production builds tree-shake it — only the ~2 KB query-param escape stays in the bundle.

### Console logging

The structured-logger adapter (`consoleAdapterFor(name)`) is auto-attached to every slot at creation. Output styling:

- `info` (dev only): `load-started`, `bytes` (throttled 1/250ms), `committing`, `committed`, `retry-scheduled`.
- `warn` (always): `gave-up` after retries.
- `error` (always): commit failures (programming errors, no retry).

In production, only warnings + errors emit. Bytes-progress is silenced entirely in prod to avoid console noise.

## Tier handling — explicit

Tiers are encoded in each asset's request type and handled by the asset's fetcher:

| Asset             | Request shape                            | Tier semantics                                    |
|-------------------|------------------------------------------|---------------------------------------------------|
| `sdss-points`     | `{ source, tier }`                       | Reloads on tier swap when target count differs.   |
| `2mrs-points`     | `{ source, tier }`                       | Same .bin all tiers — engine skips `load()` call. |
| `glade-points`    | `{ source, tier }`                       | Reloads on every tier swap.                       |
| `famous-points`   | `{ source, tier }`                       | Same .bin all tiers — engine skips `load()` call. |
| `filaments`       | `{ tier }`                               | One-shot at boot; engine never calls again.       |
| `famous-meta`     | `void`                                   | Tier-agnostic.                                    |
| `pgc-aliases`     | `void`                                   | Tier-agnostic, lazy (loaded on first palette open).|
| `cf4-density` (future) | `void`                              | Tier-agnostic (32 MB, optional decorative layer). |
| `msdf-labels` (future) | `void` or `{ size: 'small' \| 'large' }` | Tier-coupling deferred to MSDF spec.        |

The "excluded tier" path (e.g. SDSS at `small` → target=0): the fetcher itself short-circuits and returns an empty `PointCloud`. The commit then uploads count=0 (which `pointRenderer.upload` already handles as "free this source's VRAM"). No special "skip" state in the slot.

The "same target across tiers" optimization: engine.ts's `setTier` checks `TIER_TARGETS[prevTier][source] === TIER_TARGETS[tier][source]` and skips the `load()` call. This is engine-domain logic (it owns the tier-targets table), not loader-domain.

## Failure modes

| Cause                          | Detection                       | Behavior                                              |
|--------------------------------|---------------------------------|-------------------------------------------------------|
| Network error (fetch rejection) | Promise rejection (not AbortError) | Retry per policy; after exhaustion → `error` state.  |
| HTTP 4xx (except 408, 429)     | `HttpError.status` in fetcher   | `error` state immediately, no retry.                  |
| HTTP 5xx, 408, 429             | `HttpError.status`              | Retry per policy.                                     |
| Decode error (corrupt bytes)   | Synchronous throw in decode fn  | `error` state, no retry (bytes are bytes; retrying gets the same bytes from cache). |
| Commit failure (e.g. GPU error)| Promise rejection in commit     | `error` state, no retry. Programming bug, surface loudly. |
| Abort (supersession)           | `AbortError` from fetch or sleep| Silent return — the new load owns the slot.          |
| All point slots fail           | Subscriber on registry          | `syntheticSlot.load()` triggers procedural fallback. |
| Optional asset 404 (filaments, sidecars) | `HttpError(404)`       | `error` state. Subscriber decides whether feature is "off" or whether to retry. For filaments and sidecars, the engine's subscriber treats `error` the same as `ready` with count=0 (feature silently disabled). |

The "404 = feature off" semantics for optional assets is handled at the **subscription** site, not in the slot. The slot itself doesn't know which assets are optional. This keeps the slot generic and pushes asset-specific policy out to the engine — same pattern as the current `loadFilaments` returning null.

## Testing strategy

The pure-functions-first design front-loads test coverage:

- **`retryPolicy.test.ts`**: table-driven over HTTP status codes (200, 400, 404, 408, 429, 500, 502, 503), network errors, abort errors, and across attempts 0..4. Asserts `give-up` vs `delayMs`. ~30 cases.
- **`reduceLoadState.test.ts`**: every event from every state. ~25 cases.
- **`aggregateRegistry.test.ts`**: empty, single-slot, multi-slot in mixed states, missing `total` (Content-Length absent). ~10 cases.
- **`consoleAdapter.test.ts`**: verifies the right transitions log; bytes throttling works; prod-vs-dev verbosity.
- **`AssetSlot.test.ts`** (the integration tests): the race-fix invariants. Roughly:
  - `load(A)` → fetch resolves → commit runs → state becomes ready with A's value.
  - `load(A); load(B)` while A's fetch is pending → A's commit never runs, B's does.
  - `load(A); await fetch resolves; load(B); await commit resolves for A` → A's `committed` notification is suppressed by the second race check.
  - `load(A); fetch fails 502; retry sleep starts; load(B)` → A's retry sleep is interrupted by abort; B starts cleanly.
  - `load(A); commit throws` → state is `error`; retry is NOT scheduled (commit errors are programming bugs).
  - `forceReload()` after `ready` → re-runs the last request.
  - `subscribe()`/`unsubscribe` correctly fires/stops.

  These tests stub `fetch` and `commit` directly with controllable Promises (no GPU). ~12 cases.

- **`pointCloudFetcher.test.ts`** etc.: per-fetcher tests verifying the URL building, the excluded-tier short-circuit, parse errors. ~3-5 cases per fetcher.

- **Engine smoke test** (`engine.tier-swap.test.ts`): rapid `setTier(small) → setTier(large) → setTier(medium)` results in only the final tier's data on the GPU, no race-induced overlay. Uses a stubbed renderer that records upload calls.

Existing engine-level tests stay green; the slot abstraction is a refactor of internals.

## Migration approach

Big-bang within a single feature branch (the user prefers this — see git memory). The diff is large but mechanical, and partial migration would require maintaining both old and new patterns simultaneously, which defeats the purpose.

Order:

1. Land the new `src/services/loading/` modules (pure helpers + AssetSlot) with full tests, no engine wiring yet. The old loaders still drive everything.
2. Land per-fetcher modules and their tests. Still no engine wiring.
3. Switch engine.ts to use slots for one source (SDSS first — most exercised, easiest to validate visually). Keep old loaders for others temporarily.
4. Port remaining sources, filaments, sidecars one at a time.
5. Delete the old loader files.
6. Land the dev panel.

Each step is a separate commit (the project's per-task commit convention); each step keeps tests green.

## File structure (final state)

```
src/services/loading/
  types.ts
  fetchWithProgress.ts          (moved from cloudLoader)
  retryPolicy.ts
  reduceLoadState.ts
  aggregateRegistry.ts
  consoleAdapter.ts
  AssetSlot.ts
  fetchers/
    pointCloudFetcher.ts
    filamentFetcher.ts
    jsonFetcher.ts              (generic helper)
    famousMetaFetcher.ts
    pgcAliasFetcher.ts

src/components/
  LoadingDevPanel.tsx           (dev-gated; small prod escape hatch)

src/services/engine/
  engine.ts                     (slimmed setTier + subscriber wiring)
  loadProgressAggregator.ts     (rewritten as ~10-line subscriber on registry)

DELETED:
  src/services/engine/cloudLoader.ts
  src/services/engine/famousMetaLoader.ts
  src/services/engine/pgcAliasLoader.ts

tests/services/loading/
  retryPolicy.test.ts
  reduceLoadState.test.ts
  aggregateRegistry.test.ts
  consoleAdapter.test.ts
  AssetSlot.test.ts
  fetchers/*.test.ts
tests/services/engine/
  engine.tier-swap.test.ts      (race-fix regression)
```

## Out-of-scope reminders (re-stated for clarity)

- No IndexedDB caching. Browser HTTP cache only.
- No worker-thread decode. Main-thread decode preserved.
- No Range-request resume.
- Galaxy thumbnail subsystem unchanged.
- No changes to `tools/buildAllBins.ts`, `public/_headers`, R2 sync, or any build/deploy machinery.
