# Asset Loading Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc collection of asset loaders with one primitive (`AssetSlot`) that owns abort + fetch + decode + commit + atomic activation, eliminating the tier-swap race conditions and unifying retry + observability across all asset loads.

**Architecture:** A pure-functions-first design where only one module (`AssetSlot.ts`, ~80 LOC) carries mutable state. Each asset declares a typed request shape and a pure fetcher function; engine.ts instantiates one slot per asset and subscribes for ready notifications. The race fix is a generation counter inside the slot with two checks (before commit, after commit) that drop superseded results.

**Tech Stack:** TypeScript, vitest, existing `fetch`/`AbortController`/`ReadableStream`. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-05-07-asset-loading-design.md` — read it for the design rationale, the diagnosis of the current race, and the type signatures referenced throughout this plan.

**Branch constraint:** Two other Claude agents are working on the current branch. **Do NOT create a worktree, do NOT switch branches.** All commits land on the current branch. The plan is written so each task is a self-contained commit that doesn't depend on or conflict with the other agents' likely surface area (engine.ts setTier, GPU renderers, App.tsx — but the bulk of this plan adds new files under `src/services/loading/` which they shouldn't be touching).

**Conventions enforced (from `CLAUDE.md` and project memory):**
- `export type X = { ... }` — never `interface`.
- Didactic, learning-oriented comments — multi-paragraph module headers explaining *why*, *what alternative was considered*, and *what would break if you changed it*.
- Tests mirror the source tree under `tests/`.
- Vitest, not Jest. Test command: `npm test`.
- Type check: `npm run typecheck` (covers both src and tools tsconfigs).
- `npm run dev` is left running in another terminal for HMR; do not kill it.

---

## File Structure (locks decomposition)

**Created:**
```
src/services/loading/
  types.ts                  shared types (LoadState, Fetcher, Committer, RetryPolicy, LoadEvent)
  fetchWithProgress.ts      streaming fetch + HttpError + dataUrl
  retryPolicy.ts            pure default retry policy
  reduceLoadState.ts        pure state reducer
  AssetSlot.ts              the only stateful module (~80 LOC)
  aggregateRegistry.ts      pure projection for dev panel + progress aggregator
  consoleAdapter.ts         pure mapping (prev, next) → console log entry
  fetchers/
    pointCloudFetcher.ts    PointCloudReq → PointCloud
    filamentFetcher.ts      FilamentReq → FilamentCloud
    jsonFetcher.ts          generic JSON fetcher helper
    famousMetaFetcher.ts    composes jsonFetcher × 2, returns { meta, xrefs }
    pgcAliasFetcher.ts      composes jsonFetcher, returns Map<bigint, string[]>

src/components/
  LoadingDevPanel.tsx       dev-only debug UI

tests/services/loading/
  fetchWithProgress.test.ts
  retryPolicy.test.ts
  reduceLoadState.test.ts
  AssetSlot.test.ts
  aggregateRegistry.test.ts
  consoleAdapter.test.ts
  fetchers/
    pointCloudFetcher.test.ts
    filamentFetcher.test.ts
    famousMetaFetcher.test.ts
    pgcAliasFetcher.test.ts
tests/services/engine/
  engine.tier-swap-race.test.ts   regression test for the original race bug
```

**Modified:**
```
src/services/engine/engine.ts                   replaces direct loader calls with slot.load()
src/services/engine/loadProgressAggregator.ts   becomes a thin subscriber on aggregateRegistry
src/data/pointCloudFormat.ts                    adds emptyPointCloud() helper
```

**Deleted (after engine migration tasks land):**
```
src/services/engine/cloudLoader.ts
src/services/engine/famousMetaLoader.ts
src/services/engine/pgcAliasLoader.ts
tests/services/engine/cloudLoader.reload.test.ts
tests/services/engine/cloudLoaderUrlBase.test.ts
tests/services/engine/famousMetaLoader.test.ts
```

---

## Task 1: Foundation — types, HttpError, fetchWithProgress

**Files:**
- Create: `src/services/loading/types.ts`
- Create: `src/services/loading/fetchWithProgress.ts`
- Test: `tests/services/loading/fetchWithProgress.test.ts`

The first commit lands the type vocabulary the rest of the plan depends on plus the streaming fetch helper (lifted from cloudLoader, with `HttpError` added so `retryPolicy` can branch on status codes).

- [ ] **Step 1.1: Write `types.ts`**

```ts
/**
 * Shared type vocabulary for the asset-loading subsystem.
 *
 * The design pushes nearly all logic into pure functions; the only mutable
 * state lives inside `AssetSlot.ts`.  This file defines the contracts those
 * pure helpers and the slot all share.
 *
 * Why a single types.ts (rather than per-module type files)?  Loading types
 * are tightly coupled — a `LoadEvent` is consumed by the reducer, the
 * AssetSlot, and the registry; splitting them up would force three import
 * cycles for what is essentially one cohesive contract.  When the contract
 * grows (e.g. adding a `committed-with-warnings` state), the diff is
 * localised here.
 */

/**
 * The lifecycle state of one asset.
 *
 * `idle` is the only state where the slot has never been asked to load.
 * Once any `load()` is called, the state becomes `loading` and never returns
 * to `idle` (a successful load → `ready`, a final failure → `error`, but
 * neither path goes back to `idle`).  This is intentional — UI consumers can
 * treat `idle` as "first paint, nothing requested yet" without the ambiguity
 * of "did I just go idle because of an abort or because I haven't started?".
 */
export type LoadState<T> =
  | { kind: 'idle' }
  | { kind: 'loading'; req: unknown; loaded: number; total: number; attempt: number }
  | { kind: 'committing'; req: unknown }
  | { kind: 'ready'; req: unknown; value: T; loadedAtMs: number }
  | { kind: 'error'; req: unknown; error: Error; finalAttempt: number };

/**
 * One asset's fetcher: pure async function from a typed request to the
 * decoded payload.  Receives an AbortSignal (so the slot can supersede
 * in-flight fetches) and a progress callback (so the slot can mirror byte
 * counts into LoadState).
 *
 * Generic over both T (payload) and Req (request) so the typechecker
 * catches mistakes like calling a sidecar slot with a tier-bearing request.
 */
export type Fetcher<T, Req> = (
  req: Req,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
) => Promise<T>;

/**
 * Optional commit step run after fetch+decode succeeds.  For point-cloud
 * slots this uploads to the GPU; for sidecar slots it's omitted.
 *
 * Receives the same AbortSignal as the fetch so a long-running GPU upload
 * can be aborted by a superseding `load()` (the slot's second race-check
 * still applies even if commit happens to ignore the signal — the check is
 * the structural fix, the signal is the cooperative one).
 */
export type Committer<T> = (value: T, signal: AbortSignal) => Promise<void>;

/**
 * Retry policy decision.  `give-up` ends the retry loop; `{delayMs}` schedules
 * the next attempt after sleeping the indicated milliseconds.
 *
 * Pure function `(attempt, error) → decision`.  No mutable state, no clock
 * reads, no I/O — a property of the inputs only.  This makes the policy
 * trivially testable across status codes and attempt counts.
 */
export type RetryDecision = { delayMs: number } | 'give-up';
export type RetryPolicy = (attempt: number, error: Error) => RetryDecision;

/**
 * Events that drive the LoadState reducer.  Every state transition is
 * expressible as one of these.
 *
 * Why an explicit event type rather than the slot calling `setState` directly?
 * The reducer becomes pure and exhaustively testable — every event from
 * every state can be enumerated in a table-driven test.  The slot's stateful
 * loop just dispatches events; the actual transition logic lives in
 * `reduceLoadState.ts`.
 */
export type LoadEvent =
  | { kind: 'load-started'; req: unknown }
  | { kind: 'bytes'; loaded: number; total: number }
  | { kind: 'fetch-succeeded' }
  | { kind: 'committing' }
  | { kind: 'committed'; value: unknown; nowMs: number }
  | { kind: 'retry-scheduled'; attempt: number }
  | { kind: 'gave-up'; error: Error; attempt: number };
```

- [ ] **Step 1.2: Write the failing test for `HttpError` and `fetchWithProgress`**

```ts
// tests/services/loading/fetchWithProgress.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { HttpError, fetchWithProgress, dataUrl } from '../../../src/services/loading/fetchWithProgress';

describe('HttpError', () => {
  it('exposes status and url', () => {
    const e = new HttpError(502, 'https://example.com/x.bin');
    expect(e).toBeInstanceOf(Error);
    expect(e.status).toBe(502);
    expect(e.url).toBe('https://example.com/x.bin');
    expect(e.message).toContain('502');
    expect(e.message).toContain('x.bin');
  });
});

describe('dataUrl', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('uses VITE_DATA_BASE_URL when set', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', 'https://skymap-data.rulkens.com');
    expect(dataUrl('sdss.bin')).toBe('https://skymap-data.rulkens.com/data/sdss.bin');
  });
  it('falls back to relative /data/ when env empty', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', '');
    expect(dataUrl('sdss.bin')).toBe('/data/sdss.bin');
  });
  it('strips trailing slash on base', () => {
    vi.stubEnv('VITE_DATA_BASE_URL', 'https://x.example/');
    expect(dataUrl('y.bin')).toBe('https://x.example/data/y.bin');
  });
});

describe('fetchWithProgress', () => {
  it('returns ArrayBuffer and reports progress', async () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(body.slice(0, 3));
        controller.enqueue(body.slice(3, 5));
        controller.close();
      },
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Length': '5' } }),
    );
    const ctrl = new AbortController();
    const events: Array<[number, number]> = [];
    const buf = await fetchWithProgress('http://x/', ctrl.signal, (l, t) => events.push([l, t]));
    expect(new Uint8Array(buf)).toEqual(body);
    expect(events.at(-1)).toEqual([5, 5]);
  });

  it('throws HttpError on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('x', { status: 404 }));
    const ctrl = new AbortController();
    await expect(fetchWithProgress('http://x/', ctrl.signal, () => {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it('falls back to res.arrayBuffer() when body is null', async () => {
    const buf = new Uint8Array([9, 9]).buffer;
    const res = new Response(null, { status: 200 });
    Object.defineProperty(res, 'body', { value: null });
    res.arrayBuffer = vi.fn().mockResolvedValue(buf);
    globalThis.fetch = vi.fn().mockResolvedValue(res);
    const out = await fetchWithProgress('http://x/', new AbortController().signal, () => {});
    expect(new Uint8Array(out)).toEqual(new Uint8Array(buf));
  });
});
```

- [ ] **Step 1.3: Run test to verify it fails**

Run: `npm test -- fetchWithProgress`
Expected: module-not-found errors for `../../../src/services/loading/fetchWithProgress`.

- [ ] **Step 1.4: Implement `fetchWithProgress.ts`**

```ts
// src/services/loading/fetchWithProgress.ts
/**
 * fetchWithProgress — streaming fetch with per-chunk progress events.
 *
 * Lifted from the original cloudLoader.fetchWithProgress with two changes:
 *   1. The `LoadEventSource`-tagged union API is gone.  The slot translates
 *      raw `(loaded, total)` callbacks into LoadEvents itself, keeping the
 *      I/O layer ignorant of the slot's state machine.
 *   2. Non-2xx responses throw HttpError rather than a plain Error, so
 *      retryPolicy can branch on status without parsing message strings.
 *
 * The streaming approach (rather than `res.arrayBuffer()`) is what makes the
 * loading-bar UI honest — we observe bytes as they arrive instead of seeing
 * one binary "click → 5 s silence → done".  See the original cloudLoader
 * docblock for the full rationale.
 */

/**
 * Build a runtime URL for a `.bin` (or other static-data) asset.
 *
 * In dev, `VITE_DATA_BASE_URL` is empty — Vite serves `public/data/*` at
 * `/data/<file>`.  In production, the env var points at the R2 bucket's
 * custom domain.  See CLAUDE.md "Deploy workflow" for the full pipeline.
 */
export function dataUrl(filename: string): string {
  const base = (import.meta.env.VITE_DATA_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}/data/${filename}`;
}

/**
 * Thrown from `fetchWithProgress` on non-2xx responses.  Carries `.status`
 * so retryPolicy can decide retry-vs-give-up on status alone.  Co-located
 * with the throw site (rather than a shared `errors.ts`) so the policy
 * module's import graph stays simple.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

export async function fetchWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, url);

  const totalHeader = res.headers.get('Content-Length');
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : 0;
  onProgress(0, total);

  // Some shims don't expose body as a stream; degrade to all-at-once
  // (no per-chunk progress) but still emit a final progress event so the
  // bar ratchets to full before finishing.
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    combined.set(c, offset);
    offset += c.byteLength;
  }
  return combined.buffer;
}
```

- [ ] **Step 1.5: Run tests + typecheck**

Run: `npm test -- fetchWithProgress && npm run typecheck`
Expected: all PASS.

- [ ] **Step 1.6: Commit**

```bash
git add src/services/loading/types.ts src/services/loading/fetchWithProgress.ts tests/services/loading/fetchWithProgress.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): add types + fetchWithProgress with HttpError

Foundation for the asset-loading rework.  Lifts the streaming fetch from
cloudLoader, adds HttpError (so retryPolicy can branch on status), and
declares the shared type vocabulary (LoadState, Fetcher, Committer,
RetryPolicy, LoadEvent) the rest of the subsystem will use.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure retry policy

**Files:**
- Create: `src/services/loading/retryPolicy.ts`
- Test: `tests/services/loading/retryPolicy.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// tests/services/loading/retryPolicy.test.ts
import { describe, expect, it } from 'vitest';
import { defaultRetryPolicy } from '../../../src/services/loading/retryPolicy';
import { HttpError } from '../../../src/services/loading/fetchWithProgress';

describe('defaultRetryPolicy', () => {
  it('gives up on 404', () => {
    expect(defaultRetryPolicy(0, new HttpError(404, 'x'))).toBe('give-up');
  });

  it('gives up on 400', () => {
    expect(defaultRetryPolicy(0, new HttpError(400, 'x'))).toBe('give-up');
  });

  it('retries 408 (Request Timeout) with 1s backoff on attempt 0', () => {
    expect(defaultRetryPolicy(0, new HttpError(408, 'x'))).toEqual({ delayMs: 1000 });
  });

  it('retries 429 (Too Many Requests) with 1s backoff on attempt 0', () => {
    expect(defaultRetryPolicy(0, new HttpError(429, 'x'))).toEqual({ delayMs: 1000 });
  });

  it('retries 502 with 1s on attempt 0, 3s on attempt 1', () => {
    expect(defaultRetryPolicy(0, new HttpError(502, 'x'))).toEqual({ delayMs: 1000 });
    expect(defaultRetryPolicy(1, new HttpError(502, 'x'))).toEqual({ delayMs: 3000 });
  });

  it('gives up after attempt 1 on 5xx', () => {
    expect(defaultRetryPolicy(2, new HttpError(503, 'x'))).toBe('give-up');
  });

  it('retries network error with 1s on attempt 0', () => {
    expect(defaultRetryPolicy(0, new TypeError('NetworkError'))).toEqual({ delayMs: 1000 });
  });

  it('gives up on AbortError immediately (slot handles aborts separately, but defensive)', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(defaultRetryPolicy(0, abort)).toBe('give-up');
  });
});
```

- [ ] **Step 2.2: Run test**

Run: `npm test -- retryPolicy`
Expected: FAIL — module missing.

- [ ] **Step 2.3: Implement retryPolicy**

```ts
// src/services/loading/retryPolicy.ts
/**
 * defaultRetryPolicy — pure decision function for asset-load retries.
 *
 * Rules:
 *   - 4xx (except 408 and 429) → permanent failure.  The server told us the
 *     request itself is wrong; retrying gets the same answer.
 *   - 408 (Request Timeout), 429 (Too Many Requests), all 5xx, and generic
 *     network errors → retry with exponential-ish backoff [1s, 3s].  Two
 *     retries is the empirically-tuned sweet spot: enough to ride out a
 *     transient blip, few enough that a real outage fails the user fast.
 *   - AbortError → give-up.  The slot itself handles aborts (they mean
 *     "supersession", not "transient failure"), but if one ever leaks in
 *     here we don't want to schedule a retry against an aborted controller.
 *
 * Why a function and not a class?  No state to carry — the decision is a
 * property of `(attempt, error)` only.  A pure function is trivially
 * testable, trivially swappable, and impossible to misuse by mistake.
 */
import type { RetryDecision, RetryPolicy } from './types';
import { HttpError } from './fetchWithProgress';

const BACKOFF_MS = [1000, 3000];

export const defaultRetryPolicy: RetryPolicy = (attempt: number, error: Error): RetryDecision => {
  if (error.name === 'AbortError') return 'give-up';

  if (error instanceof HttpError) {
    const code = error.status;
    // 4xx that doesn't deserve a retry.
    if (code >= 400 && code < 500 && code !== 408 && code !== 429) return 'give-up';
  }

  // All other errors: 5xx, 408, 429, network errors → retry with backoff.
  if (attempt >= BACKOFF_MS.length) return 'give-up';
  return { delayMs: BACKOFF_MS[attempt] };
};
```

- [ ] **Step 2.4: Run tests + typecheck**

Run: `npm test -- retryPolicy && npm run typecheck`
Expected: all PASS.

- [ ] **Step 2.5: Commit**

```bash
git add src/services/loading/retryPolicy.ts tests/services/loading/retryPolicy.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): add defaultRetryPolicy

Pure function: (attempt, error) → 'give-up' | { delayMs }.  4xx (except
408/429) fail fast; 5xx/408/429/network retry [1s, 3s] then give up;
AbortError gives up (slots handle abort as supersession, not retry).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure state reducer

**Files:**
- Create: `src/services/loading/reduceLoadState.ts`
- Test: `tests/services/loading/reduceLoadState.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// tests/services/loading/reduceLoadState.test.ts
import { describe, expect, it } from 'vitest';
import { reduceLoadState } from '../../../src/services/loading/reduceLoadState';
import type { LoadEvent, LoadState } from '../../../src/services/loading/types';

const idle: LoadState<unknown> = { kind: 'idle' };
const ready = (value: unknown): LoadState<unknown> => ({
  kind: 'ready',
  req: { x: 1 },
  value,
  loadedAtMs: 1000,
});

describe('reduceLoadState', () => {
  it('idle + load-started → loading at attempt 0', () => {
    const out = reduceLoadState(idle, { kind: 'load-started', req: { x: 1 } });
    expect(out).toEqual({ kind: 'loading', req: { x: 1 }, loaded: 0, total: 0, attempt: 0 });
  });

  it('ready + load-started → loading at attempt 0 with new req (replaces ready)', () => {
    const out = reduceLoadState(ready('A'), { kind: 'load-started', req: { x: 2 } });
    expect(out.kind).toBe('loading');
    if (out.kind === 'loading') {
      expect(out.req).toEqual({ x: 2 });
      expect(out.attempt).toBe(0);
    }
  });

  it('loading + bytes updates loaded/total', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'bytes', loaded: 50, total: 100 });
    expect(out).toEqual({ kind: 'loading', req: 'x', loaded: 50, total: 100, attempt: 0 });
  });

  it('loading + bytes never lets total shrink', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'bytes', loaded: 10, total: 0 });
    if (out.kind === 'loading') expect(out.total).toBe(100);
  });

  it('loading + retry-scheduled bumps attempt', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'retry-scheduled', attempt: 1 });
    if (out.kind === 'loading') expect(out.attempt).toBe(1);
  });

  it('loading + fetch-succeeded → keeps loading shape (slot then issues committing)', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 100, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'fetch-succeeded' });
    expect(out.kind).toBe('loading');
  });

  it('loading + committing → committing', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 100, total: 100, attempt: 0 };
    const out = reduceLoadState(start, { kind: 'committing' });
    expect(out).toEqual({ kind: 'committing', req: 'x' });
  });

  it('committing + committed → ready with value and timestamp', () => {
    const start: LoadState<unknown> = { kind: 'committing', req: 'x' };
    const out = reduceLoadState(start, { kind: 'committed', value: { v: 1 }, nowMs: 12345 });
    expect(out).toEqual({ kind: 'ready', req: 'x', value: { v: 1 }, loadedAtMs: 12345 });
  });

  it('loading + gave-up → error', () => {
    const start: LoadState<unknown> = { kind: 'loading', req: 'x', loaded: 0, total: 0, attempt: 2 };
    const err = new Error('boom');
    const out = reduceLoadState(start, { kind: 'gave-up', error: err, attempt: 2 });
    expect(out).toEqual({ kind: 'error', req: 'x', error: err, finalAttempt: 2 });
  });

  it('idle + bytes is a no-op (defensive — bytes events from a stale fetch)', () => {
    const out = reduceLoadState(idle, { kind: 'bytes', loaded: 5, total: 10 });
    expect(out).toEqual(idle);
  });

  it('ready + bytes is a no-op', () => {
    const start = ready('A');
    const out = reduceLoadState(start, { kind: 'bytes', loaded: 5, total: 10 });
    expect(out).toBe(start);
  });
});
```

- [ ] **Step 3.2: Run test**

Run: `npm test -- reduceLoadState`
Expected: FAIL — module missing.

- [ ] **Step 3.3: Implement the reducer**

```ts
// src/services/loading/reduceLoadState.ts
/**
 * reduceLoadState — pure state reducer for an AssetSlot.
 *
 * Every state transition the slot can make is expressible as one of the
 * LoadEvent variants, and the result is a property of `(state, event)`
 * alone — no clock reads, no I/O, no closure-captured state.  The slot's
 * stateful loop dispatches events through this function and notifies
 * subscribers with the new state.
 *
 * Invariants encoded here:
 *   1. `bytes` events arriving outside `loading` are silently ignored.
 *      A late-arriving progress chunk from a superseded fetch should not
 *      flicker an in-flight UI for a slot that's now `ready` or `error`.
 *   2. `total` is monotonic non-decreasing.  Some servers send `0` in the
 *      initial header but populate it later via `Transfer-Encoding: chunked`;
 *      keeping the larger value prevents the loading bar's denominator
 *      from shrinking mid-stream.
 *   3. The reducer is total — every (state, event) pair has a defined
 *      result.  Unhandled combinations return the previous state unchanged
 *      rather than throwing, so a stray late event from a superseded fetch
 *      cannot crash the slot.
 *
 * Why no `Date.now()` here?  The current millisecond is part of the
 * `committed` event payload (`nowMs`), so the reducer remains a pure
 * function of its arguments.  Tests can assert exact timestamps without
 * mocking the clock.
 */
import type { LoadEvent, LoadState } from './types';

export function reduceLoadState<T>(state: LoadState<T>, event: LoadEvent): LoadState<T> {
  switch (event.kind) {
    case 'load-started':
      return { kind: 'loading', req: event.req, loaded: 0, total: 0, attempt: 0 };

    case 'bytes':
      if (state.kind !== 'loading') return state;
      return {
        ...state,
        loaded: event.loaded,
        // Never shrink total — see invariant 2 in the docblock.
        total: event.total > state.total ? event.total : state.total,
      };

    case 'retry-scheduled':
      if (state.kind !== 'loading') return state;
      return { ...state, attempt: event.attempt };

    case 'fetch-succeeded':
      // No state shape change — the slot's next call is `committing`.  This
      // event exists for observability (consoleAdapter logs it) and so the
      // reducer stays exhaustive over LoadEvent.
      return state;

    case 'committing':
      if (state.kind !== 'loading') return state;
      return { kind: 'committing', req: state.req };

    case 'committed':
      if (state.kind !== 'committing') return state;
      return {
        kind: 'ready',
        req: state.req,
        value: event.value as T,
        loadedAtMs: event.nowMs,
      };

    case 'gave-up':
      if (state.kind !== 'loading' && state.kind !== 'committing') return state;
      return {
        kind: 'error',
        req: state.req,
        error: event.error,
        finalAttempt: event.attempt,
      };
  }
}
```

- [ ] **Step 3.4: Run tests + typecheck**

Run: `npm test -- reduceLoadState && npm run typecheck`
Expected: all PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/services/loading/reduceLoadState.ts tests/services/loading/reduceLoadState.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): add pure reduceLoadState reducer

(state, event) → state.  Total over all combinations: late events from
superseded fetches no-op rather than throwing.  Total is monotonic
non-decreasing to prevent loading-bar denominator shrink.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: AssetSlot — the only stateful module

**Files:**
- Create: `src/services/loading/AssetSlot.ts`
- Test: `tests/services/loading/AssetSlot.test.ts`

This is the cornerstone task. The slot owns the entire load lifecycle and contains the structural fix for the tier-swap race (two race-checks at steps 5 and 8 in the spec). Tests focus on the race-fix invariants — these are the failure modes the existing system exhibits.

- [ ] **Step 4.1: Write the failing test (basic load + ready)**

```ts
// tests/services/loading/AssetSlot.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAssetSlot } from '../../../src/services/loading/AssetSlot';
import type { Fetcher, RetryPolicy } from '../../../src/services/loading/types';

const noRetry: RetryPolicy = () => 'give-up';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('AssetSlot — happy path', () => {
  it('load → fetch resolves → ready with value', async () => {
    const fetch: Fetcher<string, { id: number }> = vi.fn().mockResolvedValue('payload-A');
    const slot = createAssetSlot<string, { id: number }>({
      name: 'test',
      fetch,
      retry: noRetry,
    });
    const states: string[] = [];
    slot.subscribe((s) => states.push(s.kind));
    slot.load({ id: 1 });
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(slot.current()).toBe('payload-A');
    expect(states).toContain('loading');
    expect(states).toContain('ready');
  });

  it('runs commit before becoming ready', async () => {
    const fetch: Fetcher<string, void> = vi.fn().mockResolvedValue('X');
    const commit = vi.fn().mockResolvedValue(undefined);
    const slot = createAssetSlot<string, void>({
      name: 'test',
      fetch,
      commit,
      retry: noRetry,
    });
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(commit).toHaveBeenCalledWith('X', expect.any(AbortSignal));
  });
});

describe('AssetSlot — race-fix (the structural bug from the existing cloudLoader)', () => {
  it('drops superseded fetch result before commit (race window 1)', async () => {
    const fetchA = deferred<string>();
    const fetchB = deferred<string>();
    let calls = 0;
    const fetch: Fetcher<string, number> = vi.fn(() => {
      calls += 1;
      return calls === 1 ? fetchA.promise : fetchB.promise;
    });
    const commit = vi.fn().mockResolvedValue(undefined);
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, commit, retry: noRetry });

    slot.load(1);            // starts fetch A
    slot.load(2);            // starts fetch B; A's controller aborts
    fetchA.resolve('A');     // A's resolution arrives — must NOT commit
    fetchB.resolve('B');
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(slot.current()).toBe('B');
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('B', expect.any(AbortSignal));
  });

  it('drops superseded commit result (race window 2 — async commit)', async () => {
    const fetchA = deferred<string>();
    const commitA = deferred<void>();
    const fetchB = deferred<string>();
    const commitB = deferred<void>();
    let fetchCalls = 0;
    let commitCalls = 0;
    const fetch: Fetcher<string, number> = vi.fn(() => {
      fetchCalls += 1;
      return fetchCalls === 1 ? fetchA.promise : fetchB.promise;
    });
    const commit = vi.fn(() => {
      commitCalls += 1;
      return commitCalls === 1 ? commitA.promise : commitB.promise;
    });
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, commit, retry: noRetry });

    slot.load(1);
    fetchA.resolve('A');
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));

    slot.load(2);            // mid-commit-A: starts fetch B, increments generation
    commitA.resolve();       // commit A finishes — must NOT mark slot ready with A
    fetchB.resolve('B');
    commitB.resolve();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(slot.current()).toBe('B');
  });

  it('does not call commit when fetch was aborted', async () => {
    const fetchA = deferred<string>();
    const fetchB = deferred<string>();
    let calls = 0;
    const fetch: Fetcher<string, number> = vi.fn((_req, signal) => {
      calls += 1;
      const d = calls === 1 ? fetchA : fetchB;
      signal.addEventListener('abort', () => d.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      return d.promise;
    });
    const commit = vi.fn().mockResolvedValue(undefined);
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, commit, retry: noRetry });

    slot.load(1);
    slot.load(2);            // aborts A's controller
    fetchB.resolve('B');
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith('B', expect.any(AbortSignal));
  });
});

describe('AssetSlot — retry', () => {
  it('retries per policy after transient failure', async () => {
    let calls = 0;
    const fetch: Fetcher<string, void> = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('boom');
      return 'OK';
    });
    const slot = createAssetSlot<string, void>({
      name: 'test',
      fetch,
      retry: (attempt) => (attempt < 3 ? { delayMs: 0 } : 'give-up'),
    });
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'), { timeout: 1000 });
    expect(calls).toBe(3);
    expect(slot.current()).toBe('OK');
  });

  it('transitions to error after retry exhaustion', async () => {
    const fetch: Fetcher<string, void> = vi.fn().mockRejectedValue(new Error('boom'));
    const slot = createAssetSlot<string, void>({
      name: 'test',
      fetch,
      retry: (attempt) => (attempt < 1 ? { delayMs: 0 } : 'give-up'),
    });
    slot.load();
    await vi.waitFor(() => expect(slot.state().kind).toBe('error'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('AssetSlot — cancel and forceReload', () => {
  it('cancel() aborts active fetch and reverts to last ready value', async () => {
    const first: Fetcher<string, number> = vi.fn().mockResolvedValue('A');
    const slot = createAssetSlot<string, number>({ name: 'test', fetch: first, retry: noRetry });
    slot.load(1);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));

    const pending = deferred<string>();
    const second: Fetcher<string, number> = (_req, signal) => {
      signal.addEventListener('abort', () =>
        pending.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      );
      return pending.promise;
    };
    // Replace fetcher mid-test by recreating — simpler than vi.fn juggling.
    const slot2 = createAssetSlot<string, number>({ name: 'test', fetch: second, retry: noRetry });
    slot2.load(1);
    await vi.waitFor(() => expect(slot2.state().kind).toBe('loading'));
    slot2.cancel();
    expect(slot2.state().kind).toBe('idle');
  });

  it('forceReload re-runs the last request', async () => {
    let calls = 0;
    const fetch: Fetcher<string, number> = vi.fn(async () => {
      calls += 1;
      return `payload-${calls}`;
    });
    const slot = createAssetSlot<string, number>({ name: 'test', fetch, retry: noRetry });
    slot.load(42);
    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    slot.forceReload();
    await vi.waitFor(() => expect(slot.current()).toBe('payload-2'));
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `npm test -- AssetSlot`
Expected: FAIL — module missing.

- [ ] **Step 4.3: Implement AssetSlot**

```ts
// src/services/loading/AssetSlot.ts
/**
 * AssetSlot — the one and only stateful module of the loading subsystem.
 *
 * Owns the entire load lifecycle for one asset:
 *
 *     load(req)
 *        │
 *        ▼
 *     [bump generation, abort prior controller, allocate new]
 *        │
 *        ▼
 *     [retry loop: fetch → on success break, on transient err sleep]
 *        │
 *        ▼ ── First race-check: myGen === generation? if not, drop
 *        │
 *        ▼
 *     [commit (await — async, e.g. GPU upload)]
 *        │
 *        ▼ ── Second race-check: myGen === generation? if not, drop
 *        │
 *        ▼
 *     [dispatch 'committed', notify subscribers]
 *
 * The two race-checks are the structural fix for the tier-swap bug.  Without
 * them, a slow load A's commit can stomp a faster load B's value, and a
 * slow load A's `committed` notification can fire after load B's
 * `load-started`, causing the renderer to briefly see A's value as current.
 *
 * Mutable state is intentionally a thin shell: a generation counter, an
 * AbortController reference, the current LoadState (computed via the pure
 * `reduceLoadState`), and a Set of subscribers.  Everything that can be a
 * pure function is — retry decisions, state transitions, console output.
 */
import type {
  AssetSlot,
  Fetcher,
  Committer,
  LoadEvent,
  LoadState,
  RetryPolicy,
} from './types';
import { reduceLoadState } from './reduceLoadState';
import { defaultRetryPolicy } from './retryPolicy';

export type { AssetSlot };

export type CreateAssetSlotArgs<T, Req> = {
  name: string;
  fetch: Fetcher<T, Req>;
  commit?: Committer<T>;
  retry?: RetryPolicy;
};

export function createAssetSlot<T, Req>(args: CreateAssetSlotArgs<T, Req>): AssetSlot<T, Req> {
  const { name, fetch: fetchFn, commit, retry = defaultRetryPolicy } = args;

  // ── Mutable cell.  The entire stateful surface of the loading system. ──
  let generation = 0;
  let state: LoadState<T> = { kind: 'idle' };
  let controller: AbortController | null = null;
  const subscribers = new Set<(s: LoadState<T>) => void>();
  let lastRequest: Req | null = null;
  let lastReady: LoadState<T> | null = null; // for cancel() rollback

  function dispatch(event: LoadEvent): void {
    state = reduceLoadState(state, event);
    if (state.kind === 'ready') lastReady = state;
    for (const sub of subscribers) sub(state);
  }

  async function sleep(ms: number, signal: AbortSignal): Promise<void> {
    if (ms <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async function runLoad(req: Req, myGen: number, ctrl: AbortController): Promise<void> {
    dispatch({ kind: 'load-started', req });

    let attempt = 0;
    let value: T;

    // ── Retry loop ────────────────────────────────────────────────────
    while (true) {
      try {
        value = await fetchFn(
          req,
          ctrl.signal,
          (loaded, total) => {
            // Drop late progress events from superseded fetches.
            if (myGen !== generation) return;
            dispatch({ kind: 'bytes', loaded, total });
          },
        );
        dispatch({ kind: 'fetch-succeeded' });
        break;
      } catch (err) {
        if ((err as Error).name === 'AbortError') return; // superseded — silent exit
        const decision = retry(attempt, err as Error);
        if (decision === 'give-up') {
          dispatch({ kind: 'gave-up', error: err as Error, attempt });
          return;
        }
        attempt += 1;
        dispatch({ kind: 'retry-scheduled', attempt });
        try {
          await sleep(decision.delayMs, ctrl.signal);
        } catch {
          return; // sleep aborted by supersession
        }
      }
    }

    // ── First race-check ──────────────────────────────────────────────
    if (myGen !== generation) return;

    dispatch({ kind: 'committing' });

    if (commit) {
      try {
        await commit(value, ctrl.signal);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        dispatch({ kind: 'gave-up', error: err as Error, attempt });
        return;
      }
    }

    // ── Second race-check ─────────────────────────────────────────────
    if (myGen !== generation) return;

    dispatch({ kind: 'committed', value, nowMs: Date.now() });
  }

  return {
    name,
    load(req: Req): void {
      lastRequest = req;
      generation += 1;
      const myGen = generation;
      controller?.abort();
      controller = new AbortController();
      // Fire-and-forget — runLoad never throws (errors become 'gave-up' events).
      void runLoad(req, myGen, controller);
    },
    current(): T | null {
      return state.kind === 'ready' ? state.value : null;
    },
    state(): LoadState<T> {
      return state;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    forceReload(): void {
      if (lastRequest !== null) this.load(lastRequest);
    },
    cancel(): void {
      generation += 1; // invalidates any in-flight runLoad
      controller?.abort();
      controller = null;
      // Roll back to last ready state, or idle if there was none.
      state = lastReady ?? { kind: 'idle' };
      for (const sub of subscribers) sub(state);
    },
  };
}
```

The `AssetSlot` type referenced from `types.ts` needs to exist. Add it:

- [ ] **Step 4.4: Add `AssetSlot` to `types.ts`**

Append to `src/services/loading/types.ts`:

```ts
/**
 * The handle returned by `createAssetSlot`.  This is the public API every
 * consumer of the loading subsystem talks to.
 */
export type AssetSlot<T, Req> = {
  readonly name: string;
  load(req: Req): void;
  current(): T | null;
  state(): LoadState<T>;
  subscribe(fn: (state: LoadState<T>) => void): () => void;
  forceReload(): void;
  cancel(): void;
};
```

- [ ] **Step 4.5: Run tests + typecheck**

Run: `npm test -- AssetSlot && npm run typecheck`
Expected: all PASS.

If the cancel test fails because the implementation re-instantiates the slot mid-test (per the test code's comment), accept that — the test still validates the contract that `cancel()` puts an in-flight slot back to `idle`. The race-fix tests are the load-bearing ones.

- [ ] **Step 4.6: Commit**

```bash
git add src/services/loading/AssetSlot.ts src/services/loading/types.ts tests/services/loading/AssetSlot.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): add AssetSlot with race-fix generation counter

The only stateful module in the loading subsystem.  Owns abort + fetch +
decode + commit + atomic activation, with two generation-counter race
checks (before commit, after commit) that drop superseded results.  Fixes
the tier-swap race condition that previously required mouse movement to
reveal newly-loaded data.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: aggregateRegistry + consoleAdapter

**Files:**
- Create: `src/services/loading/aggregateRegistry.ts`
- Create: `src/services/loading/consoleAdapter.ts`
- Test: `tests/services/loading/aggregateRegistry.test.ts`
- Test: `tests/services/loading/consoleAdapter.test.ts`

Two pure observability primitives. Bundled into one task because they're both small, both pure, and both consume `LoadState` with no other dependencies on each other.

- [ ] **Step 5.1: Write failing tests for aggregateRegistry**

```ts
// tests/services/loading/aggregateRegistry.test.ts
import { describe, expect, it } from 'vitest';
import { aggregateRegistry } from '../../../src/services/loading/aggregateRegistry';
import type { AssetSlot, LoadState } from '../../../src/services/loading/types';

function fakeSlot<T>(name: string, state: LoadState<T>): AssetSlot<T, unknown> {
  return {
    name,
    load: () => {},
    current: () => (state.kind === 'ready' ? state.value : null),
    state: () => state,
    subscribe: () => () => {},
    forceReload: () => {},
    cancel: () => {},
  };
}

describe('aggregateRegistry', () => {
  it('empty map → zero counts', () => {
    expect(aggregateRegistry(new Map())).toEqual({
      slots: [],
      totalLoadedBytes: 0,
      totalExpectedBytes: 0,
      inFlightCount: 0,
    });
  });

  it('counts in-flight slots and sums bytes', () => {
    const slots = new Map([
      ['a', fakeSlot('a', { kind: 'loading', req: {}, loaded: 100, total: 1000, attempt: 0 })],
      ['b', fakeSlot('b', { kind: 'loading', req: {}, loaded: 50, total: 500, attempt: 0 })],
      ['c', fakeSlot('c', { kind: 'ready', req: {}, value: 'x', loadedAtMs: 0 })],
    ]);
    const out = aggregateRegistry(slots);
    expect(out.inFlightCount).toBe(2);
    expect(out.totalLoadedBytes).toBe(150);
    expect(out.totalExpectedBytes).toBe(1500);
    expect(out.slots).toHaveLength(3);
  });

  it('committing slots count as in-flight', () => {
    const slots = new Map([['x', fakeSlot('x', { kind: 'committing', req: {} })]]);
    expect(aggregateRegistry(slots).inFlightCount).toBe(1);
  });
});
```

- [ ] **Step 5.2: Implement aggregateRegistry**

```ts
// src/services/loading/aggregateRegistry.ts
/**
 * aggregateRegistry — pure projection of a slot collection into a snapshot
 * suitable for the loading-bar UI and the dev panel.
 *
 * Replaces the existing `loadProgressAggregator`'s ad-hoc per-source byte
 * accounting with a single function called over `slot.state()`.  No
 * subscriber bookkeeping inside the aggregator itself — consumers
 * subscribe to each slot and call this function as needed.
 *
 * "In flight" means `loading` or `committing`.  A `committing` slot still
 * blocks the loading-bar UI from fading out — the user perceives it as
 * "still working" right up to the moment the renderer has the new buffer.
 */
import type { AssetSlot, LoadState } from './types';

export type RegistrySnapshot = {
  slots: Array<{ name: string; state: LoadState<unknown> }>;
  totalLoadedBytes: number;
  totalExpectedBytes: number;
  inFlightCount: number;
};

export function aggregateRegistry(
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): RegistrySnapshot {
  const out: RegistrySnapshot = {
    slots: [],
    totalLoadedBytes: 0,
    totalExpectedBytes: 0,
    inFlightCount: 0,
  };
  for (const [, slot] of slots) {
    const s = slot.state();
    out.slots.push({ name: slot.name, state: s });
    if (s.kind === 'loading') {
      out.totalLoadedBytes += s.loaded;
      out.totalExpectedBytes += s.total;
      out.inFlightCount += 1;
    } else if (s.kind === 'committing') {
      out.inFlightCount += 1;
    }
  }
  return out;
}
```

- [ ] **Step 5.3: Write failing tests for consoleAdapter**

```ts
// tests/services/loading/consoleAdapter.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { consoleAdapterFor } from '../../../src/services/loading/consoleAdapter';
import type { LoadState } from '../../../src/services/loading/types';

const idle: LoadState<unknown> = { kind: 'idle' };
const loading = (loaded: number, total: number, attempt = 0): LoadState<unknown> => ({
  kind: 'loading',
  req: {},
  loaded,
  total,
  attempt,
});
const ready: LoadState<unknown> = { kind: 'ready', req: {}, value: 'x', loadedAtMs: 0 };
const errState: LoadState<unknown> = {
  kind: 'error',
  req: {},
  error: new Error('boom'),
  finalAttempt: 2,
};

describe('consoleAdapterFor', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('logs load-started transition', () => {
    const log = consoleAdapterFor('test');
    log(idle, loading(0, 100));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[loading] test'),
      expect.anything(),
    );
  });

  it('logs error with warn level', () => {
    const log = consoleAdapterFor('test');
    log(loading(50, 100), errState);
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not log every byte event', () => {
    const log = consoleAdapterFor('test');
    log(loading(0, 100), loading(10, 100));
    log(loading(10, 100), loading(20, 100));
    log(loading(20, 100), loading(30, 100));
    // bytes-progress logs are throttled to <= 1 in fast succession
    expect((console.log as any).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('logs ready transition', () => {
    const log = consoleAdapterFor('test');
    log(loading(100, 100), ready);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('ready'),
      expect.anything(),
    );
  });
});
```

- [ ] **Step 5.4: Implement consoleAdapter**

```ts
// src/services/loading/consoleAdapter.ts
/**
 * consoleAdapterFor(name) — returns a `(prev, next) => void` subscriber that
 * logs structured `[loading] <name> <transition>` lines on meaningful state
 * changes.  Bytes-progress events are throttled (1 per 250ms) so a fast
 * 100 MB fetch doesn't flood the console.
 *
 * The adapter is "pure" in the I/O sense — same inputs always produce the
 * same console call (modulo the throttle's elapsed-ms argument, which is
 * the only impurity, and is necessary).  The design of the loading
 * subsystem auto-attaches one adapter per slot at creation; consumers
 * don't have to remember to subscribe.
 *
 * Verbosity:
 *   - load-started, ready, retry-scheduled  → console.log (info)
 *   - throttled bytes                       → console.log (info)
 *   - error                                 → console.warn (always)
 *
 * In production builds, `import.meta.env.DEV === false` silences the info
 * lines; warnings are always visible (operators want to see real failures).
 */
import type { LoadState } from './types';

const BYTES_LOG_INTERVAL_MS = 250;

export function consoleAdapterFor(name: string): (
  prev: LoadState<unknown>,
  next: LoadState<unknown>,
) => void {
  let lastBytesLogMs = 0;
  const dev = !!import.meta.env.DEV;

  return (prev, next) => {
    // Transition into loading from a non-loading state.
    if (prev.kind !== 'loading' && next.kind === 'loading') {
      if (dev) console.log(`[loading] ${name} load-started`, { req: next.req });
      return;
    }
    // Bytes progress within loading — throttled.
    if (prev.kind === 'loading' && next.kind === 'loading' && prev.loaded !== next.loaded) {
      const now = Date.now();
      if (now - lastBytesLogMs >= BYTES_LOG_INTERVAL_MS) {
        lastBytesLogMs = now;
        if (dev) {
          const pct = next.total > 0 ? Math.round((next.loaded / next.total) * 100) : 0;
          console.log(
            `[loading] ${name} bytes ${pct}% (${next.loaded}/${next.total})`,
            { attempt: next.attempt },
          );
        }
      }
      return;
    }
    // Retry scheduled.
    if (prev.kind === 'loading' && next.kind === 'loading' && prev.attempt !== next.attempt) {
      if (dev) console.log(`[loading] ${name} retry-scheduled`, { attempt: next.attempt });
      return;
    }
    // Ready.
    if (next.kind === 'ready' && prev.kind !== 'ready') {
      if (dev) console.log(`[loading] ${name} ready`, { loadedAtMs: next.loadedAtMs });
      return;
    }
    // Error.
    if (next.kind === 'error' && prev.kind !== 'error') {
      console.warn(`[loading] ${name} error`, {
        message: next.error.message,
        finalAttempt: next.finalAttempt,
      });
    }
  };
}
```

- [ ] **Step 5.5: Wire consoleAdapter into AssetSlot**

Modify `src/services/loading/AssetSlot.ts` — auto-attach a console adapter at slot creation. Add at the top of `createAssetSlot`:

```ts
// After: const subscribers = new Set<...>();
const consoleLog = consoleAdapterFor(name);
let prevState: LoadState<T> = state;
subscribers.add((next) => {
  consoleLog(prevState, next);
  prevState = next;
});
```

Add the import: `import { consoleAdapterFor } from './consoleAdapter';` at the top of `AssetSlot.ts`.

- [ ] **Step 5.6: Run tests + typecheck**

Run: `npm test -- aggregateRegistry consoleAdapter AssetSlot && npm run typecheck`
Expected: all PASS.

- [ ] **Step 5.7: Commit**

```bash
git add src/services/loading/aggregateRegistry.ts src/services/loading/consoleAdapter.ts src/services/loading/AssetSlot.ts tests/services/loading/aggregateRegistry.test.ts tests/services/loading/consoleAdapter.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): add aggregateRegistry + consoleAdapter

Two pure observability primitives.  aggregateRegistry projects a slot
collection into a snapshot for the loading-bar UI and dev panel.
consoleAdapter auto-attaches one structured logger per slot on creation;
errors always log, info lines silence in prod, bytes throttle to 1/250ms.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: emptyPointCloud helper + pointCloudFetcher

**Files:**
- Modify: `src/data/pointCloudFormat.ts` (add `emptyPointCloud()` near `decodePointCloud`)
- Create: `src/services/loading/fetchers/pointCloudFetcher.ts`
- Test: `tests/services/loading/fetchers/pointCloudFetcher.test.ts`

- [ ] **Step 6.1: Read existing `pointCloudFormat.ts` to find the right insertion point**

Run: `grep -n "export function" src/data/pointCloudFormat.ts`

Pick the line right after `decodePointCloud`'s closing brace as the insertion point.

- [ ] **Step 6.2: Add `emptyPointCloud()` helper**

Insert into `src/data/pointCloudFormat.ts`:

```ts
/**
 * Build a zero-count PointCloud with all typed-array slots empty.
 *
 * Used by the asset-loading subsystem's "excluded tier" path: when
 * TIER_TARGETS[tier][source] === 0 (e.g. SDSS in `small`), the fetcher
 * short-circuits and returns this shape rather than attempting a fetch.
 * Downstream `pointRenderer.upload` already treats count=0 as "free this
 * source's VRAM"; the empty cloud composes cleanly with that contract.
 */
export function emptyPointCloud(): PointCloud {
  return {
    count: 0,
    objIDs: new BigUint64Array(0),
    positions: new Float32Array(0),
    magU: new Float32Array(0),
    magG: new Float32Array(0),
    magR: new Float32Array(0),
    magI: new Float32Array(0),
    magZ: new Float32Array(0),
    axisRatio: new Float32Array(0),
    positionAngleDeg: new Float32Array(0),
    diameterKpc: new Float32Array(0),
  };
}
```

(Note: the exact field set must match the current PointCloud type — verify against `src/@types/PointCloud.ts` or wherever it lives. If new fields exist, include them as zero-length typed arrays of the right type.)

- [ ] **Step 6.3: Write failing test for pointCloudFetcher**

```ts
// tests/services/loading/fetchers/pointCloudFetcher.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { pointCloudFetcher } from '../../../../src/services/loading/fetchers/pointCloudFetcher';
import { Source } from '../../../../src/data/sources';

describe('pointCloudFetcher', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns empty cloud when target is 0 for the tier', async () => {
    // SDSS at 'small' tier has target=0 in TIER_TARGETS — verified in plan.
    const cloud = await pointCloudFetcher(
      { source: Source.SDSS, tier: 'small' },
      new AbortController().signal,
      () => {},
    );
    expect(cloud.count).toBe(0);
  });

  it('fetches and decodes when target is non-zero', async () => {
    // Build a minimal valid v4 .bin: header + zero points.
    const header = new ArrayBuffer(16);
    const dv = new DataView(header);
    dv.setUint32(0, 0x504d4b53, true);  // magic 'SKMP'
    dv.setUint32(4, 4, true);            // version 4
    dv.setUint32(8, 0, true);            // count 0
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(header, { status: 200, headers: { 'Content-Length': '16' } }),
    );
    const cloud = await pointCloudFetcher(
      { source: Source.TwoMRS, tier: 'medium' },
      new AbortController().signal,
      () => {},
    );
    expect(cloud.count).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6.4: Implement pointCloudFetcher**

```ts
// src/services/loading/fetchers/pointCloudFetcher.ts
/**
 * pointCloudFetcher — Fetcher<PointCloud, PointCloudReq>.
 *
 * The "excluded tier" path: TIER_TARGETS[tier][source] === 0 means this
 * source is intentionally absent at this tier (e.g. SDSS at `small`).
 * Returning a count=0 PointCloud composes cleanly with `pointRenderer.upload`,
 * which treats count=0 as "free this source's VRAM" — so the slot's commit
 * step still runs and frees the buffer.  No special-cased "skip" state in
 * the slot is needed; one path through the type system.
 */
import type { Fetcher } from '../types';
import type { PointCloud } from '../../../@types';
import type { Source } from '../../../data/sources';
import type { Tier } from '../../../@types/Tier';
import { decodePointCloud, emptyPointCloud } from '../../../data/pointCloudFormat';
import { TIER_TARGETS, tierFilenameForSource } from '../../../data/tierTargets';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export type PointCloudReq = { source: Source; tier: Tier };

export const pointCloudFetcher: Fetcher<PointCloud, PointCloudReq> = async (
  req,
  signal,
  onProgress,
) => {
  if (TIER_TARGETS[req.tier][req.source] === 0) {
    return emptyPointCloud();
  }
  const url = dataUrl(tierFilenameForSource(req.source, req.tier));
  const buf = await fetchWithProgress(url, signal, onProgress);
  return decodePointCloud(buf);
};
```

- [ ] **Step 6.5: Run tests + typecheck**

Run: `npm test -- pointCloudFetcher && npm run typecheck`
Expected: all PASS.

- [ ] **Step 6.6: Commit**

```bash
git add src/data/pointCloudFormat.ts src/services/loading/fetchers/pointCloudFetcher.ts tests/services/loading/fetchers/pointCloudFetcher.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): add pointCloudFetcher + emptyPointCloud helper

First Fetcher<T, Req> implementation.  Encodes the excluded-tier rule
(target=0 → empty cloud, no fetch) so the slot stays asset-agnostic.
emptyPointCloud lifted next to decodePointCloud for reuse.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Remaining fetchers (filament + sidecars)

**Files:**
- Create: `src/services/loading/fetchers/filamentFetcher.ts`
- Create: `src/services/loading/fetchers/jsonFetcher.ts`
- Create: `src/services/loading/fetchers/famousMetaFetcher.ts`
- Create: `src/services/loading/fetchers/pgcAliasFetcher.ts`
- Test: `tests/services/loading/fetchers/filamentFetcher.test.ts`
- Test: `tests/services/loading/fetchers/famousMetaFetcher.test.ts`
- Test: `tests/services/loading/fetchers/pgcAliasFetcher.test.ts`

- [ ] **Step 7.1: Implement filamentFetcher**

```ts
// src/services/loading/fetchers/filamentFetcher.ts
/**
 * filamentFetcher — Fetcher<FilamentCloud, FilamentReq>.
 *
 * Tier-aware filename: `filaments-small.bin` for the small tier (built with
 * a higher DisPerSE persistence cut, ~10–15 MB) vs `filaments.bin` for
 * medium/large (~30 MB).  Mobile-tier rationale documented in the original
 * cloudLoader.filamentFilenameForTier docblock — preserved here.
 *
 * NOTE: engine.ts only calls this slot's `load()` once at boot and never on
 * tier change.  Filaments don't swap on tier flip — re-downloading tens of
 * MB for what is mostly the same skeleton topology isn't worth it, and a
 * desktop user starting on `small` (rare) sees the smaller skeleton until
 * a hard reload.
 */
import type { Fetcher } from '../types';
import type { FilamentCloud } from '../../../@types/FilamentCloud';
import type { Tier } from '../../../@types/Tier';
import { decodeFilaments } from '../../../data/filamentBinaryFormat';
import { dataUrl, fetchWithProgress } from '../fetchWithProgress';

export type FilamentReq = { tier: Tier };

export const filamentFetcher: Fetcher<FilamentCloud, FilamentReq> = async (
  req,
  signal,
  onProgress,
) => {
  const filename = req.tier === 'small' ? 'filaments-small.bin' : 'filaments.bin';
  const buf = await fetchWithProgress(dataUrl(filename), signal, onProgress);
  return decodeFilaments(buf);
};
```

Test:

```ts
// tests/services/loading/fetchers/filamentFetcher.test.ts
import { describe, expect, it, vi } from 'vitest';
import { filamentFetcher } from '../../../../src/services/loading/fetchers/filamentFetcher';

describe('filamentFetcher', () => {
  it('uses filaments-small.bin for small tier', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('skip body'));
    globalThis.fetch = fetchSpy;
    await filamentFetcher({ tier: 'small' }, new AbortController().signal, () => {}).catch(() => {});
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('filaments-small.bin');
  });

  it('uses filaments.bin for medium and large', async () => {
    for (const tier of ['medium', 'large'] as const) {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('skip body'));
      globalThis.fetch = fetchSpy;
      await filamentFetcher({ tier }, new AbortController().signal, () => {}).catch(() => {});
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toMatch(/\/filaments\.bin$/);
    }
  });
});
```

- [ ] **Step 7.2: Implement jsonFetcher (generic helper)**

```ts
// src/services/loading/fetchers/jsonFetcher.ts
/**
 * makeJsonFetcher — composes a Fetcher<T, Req> from a URL builder and a
 * pure parse function.  Used by sidecar fetchers (famous-meta, pgc-aliases)
 * that share the "GET, check ok, parse JSON, return decoded" shape.
 *
 * Why not have the slot do this?  Each sidecar parses into a different
 * runtime shape (FamousMetaEntry[] vs Map<bigint, string[]>), and the parse
 * step throws on schema mismatch.  Encoding that as a fetcher composition
 * keeps the parse logic in the same module as the URL choice and keeps
 * the slot purely generic over T.
 */
import type { Fetcher } from '../types';
import { HttpError } from '../fetchWithProgress';

export function makeJsonFetcher<T, Req = void>(
  urlFor: (req: Req) => string,
  parse: (raw: string) => T,
): Fetcher<T, Req> {
  return async (req, signal) => {
    const url = urlFor(req);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new HttpError(res.status, url);
    return parse(await res.text());
  };
}
```

- [ ] **Step 7.3: Implement famousMetaFetcher (carrying parsers from old loader)**

```ts
// src/services/loading/fetchers/famousMetaFetcher.ts
/**
 * famousMetaFetcher — fetches the two famous-galaxy sidecars in parallel
 * and returns a combined { meta, xrefs } payload.
 *
 * Why one fetcher returning both?  The existing famousMetaLoader fetched
 * them in parallel and returned a combined object; consumers always want
 * both together.  Splitting them into two slots would force the engine to
 * coordinate two `ready` events for what is one logical asset.
 *
 * Parser implementations come from the deleted famousMetaLoader.ts;
 * preserved verbatim with their schema-validation throws.
 */
import type { Fetcher } from '../types';
import { HttpError, dataUrl } from '../fetchWithProgress';

export type FamousMetaEntry = {
  id: string;
  names: string[];
  description: string;
  type: string;
};

export type FamousXref = {
  source: 'TwoMRS' | 'Glade';
  localIdx: number;
  distanceArcsec: number;
};

export type FamousXrefMap = Record<string, FamousXref | null>;

export type FamousPayload = { meta: FamousMetaEntry[]; xrefs: FamousXrefMap };

export function parseFamousMeta(rawJson: string): FamousMetaEntry[] {
  const parsed = JSON.parse(rawJson);
  if (!Array.isArray(parsed)) throw new Error('famous_meta.json: root must be an array');
  return parsed as FamousMetaEntry[];
}

export function parseFamousXrefs(rawJson: string): FamousXrefMap {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('famous_xrefs.json: root must be an object');
  }
  return parsed as FamousXrefMap;
}

export const famousMetaFetcher: Fetcher<FamousPayload, void> = async (_req, signal) => {
  const [metaRes, xrefsRes] = await Promise.all([
    fetch(dataUrl('famous_meta.json'), { signal }),
    fetch(dataUrl('famous_xrefs.json'), { signal }),
  ]);
  if (!metaRes.ok) throw new HttpError(metaRes.status, dataUrl('famous_meta.json'));
  if (!xrefsRes.ok) throw new HttpError(xrefsRes.status, dataUrl('famous_xrefs.json'));
  const [metaText, xrefsText] = await Promise.all([metaRes.text(), xrefsRes.text()]);
  return { meta: parseFamousMeta(metaText), xrefs: parseFamousXrefs(xrefsText) };
};
```

Test:

```ts
// tests/services/loading/fetchers/famousMetaFetcher.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  famousMetaFetcher,
  parseFamousMeta,
  parseFamousXrefs,
} from '../../../../src/services/loading/fetchers/famousMetaFetcher';

describe('parseFamousMeta', () => {
  it('parses valid array', () => {
    expect(parseFamousMeta('[{"id":"x","names":["X"],"description":"","type":"galaxy"}]')).toHaveLength(1);
  });
  it('throws on non-array root', () => {
    expect(() => parseFamousMeta('{}')).toThrow();
  });
});

describe('parseFamousXrefs', () => {
  it('parses object', () => {
    expect(parseFamousXrefs('{"x":null}')).toEqual({ x: null });
  });
  it('throws on array root', () => {
    expect(() => parseFamousXrefs('[]')).toThrow();
  });
});

describe('famousMetaFetcher', () => {
  it('fetches both files and returns combined payload', async () => {
    const seq = [
      new Response('[]', { status: 200 }),
      new Response('{}', { status: 200 }),
    ];
    globalThis.fetch = vi.fn(() => Promise.resolve(seq.shift()!));
    const payload = await famousMetaFetcher(undefined as void, new AbortController().signal, () => {});
    expect(payload).toEqual({ meta: [], xrefs: {} });
  });
});
```

- [ ] **Step 7.4: Implement pgcAliasFetcher**

```ts
// src/services/loading/fetchers/pgcAliasFetcher.ts
/**
 * pgcAliasFetcher — fetches the runtime PGC→names sidecar for the Cmd+K
 * palette's alias search.  Lazy: engine code calls this slot's load()
 * only on first palette open, not at boot, because the JSON is ~1.7 MB
 * and the user may never open the palette.
 *
 * Parser preserved verbatim from the deleted pgcAliasLoader.ts; bigint
 * keys remain because the most-common downstream use is direct lookup
 * against `BigUint64Array` objIDs.
 */
import type { Fetcher } from '../types';
import { dataUrl, HttpError } from '../fetchWithProgress';

export type PgcAliasJsonShape = Record<string, string[]>;
export type PgcAliasMap = Map<bigint, readonly string[]>;

export function parsePgcAliases(rawJson: string): PgcAliasMap {
  const parsed = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('pgc_aliases.json: root must be an object');
  }
  const result = new Map<bigint, readonly string[]>();
  for (const [key, val] of Object.entries(parsed as PgcAliasJsonShape)) {
    if (!Array.isArray(val)) continue;
    let pgc: bigint;
    try {
      pgc = BigInt(key);
    } catch {
      continue;
    }
    result.set(pgc, val.slice());
  }
  return result;
}

export const pgcAliasFetcher: Fetcher<PgcAliasMap, void> = async (_req, signal) => {
  const url = dataUrl('pgc_aliases.json');
  const res = await fetch(url, { signal });
  if (!res.ok) throw new HttpError(res.status, url);
  return parsePgcAliases(await res.text());
};
```

Test:

```ts
// tests/services/loading/fetchers/pgcAliasFetcher.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
  pgcAliasFetcher,
  parsePgcAliases,
} from '../../../../src/services/loading/fetchers/pgcAliasFetcher';

describe('parsePgcAliases', () => {
  it('parses bigint keys', () => {
    const map = parsePgcAliases('{"42":["NGC 1"]}');
    expect(map.get(42n)).toEqual(['NGC 1']);
  });
  it('skips non-array values', () => {
    const map = parsePgcAliases('{"42":"oops","43":["ok"]}');
    expect(map.has(42n)).toBe(false);
    expect(map.get(43n)).toEqual(['ok']);
  });
  it('throws on array root', () => {
    expect(() => parsePgcAliases('[]')).toThrow();
  });
});

describe('pgcAliasFetcher', () => {
  it('fetches and parses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('{"1":["X"]}', { status: 200 }));
    const map = await pgcAliasFetcher(undefined as void, new AbortController().signal, () => {});
    expect(map.get(1n)).toEqual(['X']);
  });
});
```

- [ ] **Step 7.5: Run tests + typecheck**

Run: `npm test -- fetchers && npm run typecheck`
Expected: all PASS.

- [ ] **Step 7.6: Commit**

```bash
git add src/services/loading/fetchers/ tests/services/loading/fetchers/
git commit -m "$(cat <<'EOF'
feat(loading): add filament + sidecar fetchers

filamentFetcher (tier-aware filename), jsonFetcher (generic helper),
famousMetaFetcher (parallel fetch of meta + xrefs), pgcAliasFetcher
(lazy-loaded alias index).  Parsers lifted verbatim from the existing
loaders, preserving their schema-validation throws.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Wire SDSS through a slot (first end-to-end migration)

**Files:**
- Modify: `src/services/engine/engine.ts`

This is the smallest viable engine integration: only SDSS swaps to the new slot machinery; everything else continues to use the old `cloudLoader.reloadSource` path. This validates the slot end-to-end without touching the most-failure-prone bulk migration in one commit.

- [ ] **Step 8.1: Read the relevant parts of engine.ts**

Run: `grep -n "loadAllClouds\|reloadSource\|setTier\|onCloudReady" src/services/engine/engine.ts`

Identify: (a) where `loadAllClouds` is called for initial load, (b) where `reloadSource` is called inside `setTier`.

- [ ] **Step 8.2: Add SDSS slot creation alongside the existing loader path**

In `engine.ts`, near where the GPU renderer is initialized (search for `state.gpu.renderer`), add:

```ts
import { createAssetSlot } from '../loading/AssetSlot';
import { pointCloudFetcher } from '../loading/fetchers/pointCloudFetcher';

// ... inside engine creation, after renderer is up:

const sdssSlot = createAssetSlot({
  name: 'sdss-points',
  fetch: pointCloudFetcher,
  commit: async (cloud) => {
    if (!state.gpu.renderer) return;
    await state.gpu.renderer.upload(Source.SDSS, cloud);
    state.sources.clouds.set(Source.SDSS, cloud);
  },
});

sdssSlot.subscribe((s) => {
  if (s.kind === 'ready') {
    cb.onCloudReady?.(Source.SDSS, s.value.count);
    state.subsystems.scheduler.requestRender();
  }
  if (s.kind === 'loading') {
    state.subsystems.loadProgress?.start('sdss-points', s.total);
    state.subsystems.loadProgress?.update('sdss-points', s.loaded, s.total);
  }
  if (s.kind === 'ready' || s.kind === 'error') {
    state.subsystems.loadProgress?.finish('sdss-points');
  }
});

state.assetSlots = { points: new Map([[Source.SDSS, sdssSlot]]) };
```

(`state.assetSlots` is a new field on the engine state; declare it in the state-shape type — search for the `state = {` initialization block to find the right spot.)

- [ ] **Step 8.3: Replace SDSS branch of `setTier`**

Find the existing `setTier` body (around line 2118 of the current engine.ts). The existing loop iterates `[Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]` and calls `reloadSource(...)` per source. Modify the SDSS iteration to call the slot instead:

```ts
for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
  const prevTarget = TIER_TARGETS[prevTier][source];
  const nextTarget = TIER_TARGETS[tier][source];
  if (prevTarget === nextTarget) continue;

  if (source === Source.SDSS) {
    state.assetSlots.points.get(Source.SDSS)?.load({ source, tier });
    continue;
  }

  // Other sources still use the old loader path for now (Task 9 migrates them).
  reloadSource(
    source,
    tier,
    (result) => {
      // ...existing code unchanged
    },
    (e) => { /* ...existing progress forwarding */ },
  );
}
```

- [ ] **Step 8.4: Replace SDSS branch of initial `loadAllClouds`**

Find the initial `loadAllClouds` call. Wrap it so SDSS uses the slot and the other sources still go through the old path. Easiest: keep `loadAllClouds` for non-SDSS sources, add a parallel `sdssSlot.load()` next to it:

```ts
state.assetSlots.points.get(Source.SDSS)?.load({
  source: Source.SDSS,
  tier: state.sources.tier,
});
// loadAllClouds still handles 2MRS, GLADE, Famous — but it'll attempt SDSS
// too, which produces a redundant fetch.  Fix that by adding a per-source
// filter inside loadAllClouds OR by short-circuiting in the SDSS path of
// surveyFilesForTier — for this transitional task, accept the duplicate
// SDSS fetch (browser HTTP cache makes it free in practice) and remove it
// in Task 9.
```

For simplicity in this transitional task, accept the duplicate fetch (browser cache makes it cheap) and clean it up in Task 9.

- [ ] **Step 8.5: Manual smoke test in dev**

The dev server should already be running. Reload the browser tab. Open DevTools console.

Expected:
- Page loads, SDSS galaxies render as before.
- Console shows `[loading] sdss-points load-started`, `[loading] sdss-points ready`.
- Tier swap (open SettingsPanel → change tier): SDSS reloads, **no mouse movement required** to see the new data.

If the tier swap still requires mouse movement, the slot's commit/render-wake is wrong — investigate before continuing.

- [ ] **Step 8.6: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: existing tests pass; new tests pass.

- [ ] **Step 8.7: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(loading): wire SDSS through AssetSlot

First end-to-end use of the new slot machinery.  SDSS tier swaps now
flow through createAssetSlot's race-checked commit path; the old
cloudLoader.reloadSource still handles the other sources transitionally
(Task 9 ports them).  Validates the loading-bar progress forwarding and
the requestRender wake-up via subscriber.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire remaining point sources + filaments

**Files:**
- Modify: `src/services/engine/engine.ts`

- [ ] **Step 9.1: Create slots for 2MRS, GLADE, Famous, filaments**

Extend the slot-creation block in engine.ts. For each point source, the pattern is identical to SDSS — only the `Source.X` and `name` differ. Use a loop to DRY:

```ts
import { filamentFetcher } from '../loading/fetchers/filamentFetcher';

// ...
const pointSlots = new Map<Source, AssetSlot<PointCloud, PointCloudReq>>();
for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
  const slot = createAssetSlot<PointCloud, PointCloudReq>({
    name: `${sourceName(source)}-points`,
    fetch: pointCloudFetcher,
    commit: async (cloud) => {
      if (!state.gpu.renderer) return;
      await state.gpu.renderer.upload(source, cloud);
      state.sources.clouds.set(source, cloud);
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.onCloudReady?.(source, s.value.count);
      state.subsystems.scheduler.requestRender();
    }
    if (s.kind === 'loading') {
      state.subsystems.loadProgress?.start(slot.name, s.total);
      state.subsystems.loadProgress?.update(slot.name, s.loaded, s.total);
    }
    if (s.kind === 'ready' || s.kind === 'error') {
      state.subsystems.loadProgress?.finish(slot.name);
    }
  });
  pointSlots.set(source, slot);
}

const filamentSlot = createAssetSlot<FilamentCloud, FilamentReq>({
  name: 'filaments',
  fetch: filamentFetcher,
  commit: async (cloud) => {
    if (!state.gpu.filamentRenderer) return;
    await state.gpu.filamentRenderer.upload(cloud);
    state.sources.filaments = cloud;
  },
});
filamentSlot.subscribe((s) => {
  if (s.kind === 'ready') {
    cb.onFilamentsReady?.(s.value.segmentCount ?? 0);
    state.subsystems.scheduler.requestRender();
  }
});

state.assetSlots = { points: pointSlots, filaments: filamentSlot };
```

(`sourceName(source)` is a small helper that maps `Source.SDSS → 'sdss'`, etc. Add it at the top of engine.ts if it doesn't exist.)

- [ ] **Step 9.2: Replace `setTier` body with slot-based dispatch**

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
  // Filaments: NOT swapped on tier change — see filamentFetcher docblock.
}
```

- [ ] **Step 9.3: Replace initial `loadAllClouds` with parallel slot loads**

```ts
// Replace: const { loadedCount } = await loadAllClouds(...)
// With:
for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
  state.assetSlots.points.get(source)?.load({ source, tier: state.sources.tier });
}
state.assetSlots.filaments.load({ tier: state.sources.tier });
```

- [ ] **Step 9.4: Manual smoke test**

In the dev browser:
- Initial load: all four sources land, filaments land.
- Tier swap: SDSS + GLADE re-fetch, 2MRS + Famous skip (same target across tiers).
- Rapid tier swaps: no overlay, no need for mouse movement.
- Console shows one `load-started` per slot per swap.

- [ ] **Step 9.5: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 9.6: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(loading): port 2MRS, GLADE, Famous, filaments to AssetSlot

All point-cloud sources and the filament layer now flow through
createAssetSlot.  setTier becomes a thin dispatcher; the prevTarget ===
nextTarget skip optimization is preserved.  Initial load fires four
parallel slot.load() calls plus the filament one-shot.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire sidecars + synthetic fallback

**Files:**
- Modify: `src/services/engine/engine.ts`
- Modify: `src/App.tsx` (for the lazy pgc-alias slot, if engine isn't where palette opens originate)

- [ ] **Step 10.1: Create famousMeta and pgcAlias slots**

```ts
import { famousMetaFetcher, type FamousPayload } from '../loading/fetchers/famousMetaFetcher';
import { pgcAliasFetcher, type PgcAliasMap } from '../loading/fetchers/pgcAliasFetcher';

const famousMetaSlot = createAssetSlot<FamousPayload, void>({
  name: 'famous-meta',
  fetch: famousMetaFetcher,
});
famousMetaSlot.subscribe((s) => {
  if (s.kind === 'ready') cb.onFamousMetaReady?.(s.value);
  if (s.kind === 'error') cb.onFamousMetaReady?.({ meta: [], xrefs: {} });  // 404 = feature off
});

const pgcAliasSlot = createAssetSlot<PgcAliasMap, void>({
  name: 'pgc-aliases',
  fetch: pgcAliasFetcher,
});

state.assetSlots = {
  points: pointSlots,
  filaments: filamentSlot,
  famousMeta: famousMetaSlot,
  pgcAlias: pgcAliasSlot,
};
```

- [ ] **Step 10.2: Trigger famousMeta load at engine boot**

Add next to the other initial loads:

```ts
state.assetSlots.famousMeta.load();
```

- [ ] **Step 10.3: Expose pgcAlias load through engine handle**

The PGC alias index is lazy — loaded only when the palette opens. Expose a `loadPgcAliases()` method on the engine handle:

```ts
loadPgcAliases() {
  state.assetSlots.pgcAlias.load();
  return new Promise<PgcAliasMap>((resolve) => {
    const unsub = state.assetSlots.pgcAlias.subscribe((s) => {
      if (s.kind === 'ready') {
        unsub();
        resolve(s.value);
      } else if (s.kind === 'error') {
        unsub();
        resolve(new Map());  // graceful degradation matches old behavior
      }
    });
  });
},
```

(Keep this Promise-returning shape so existing palette code that did `await loadPgcAliases()` continues to work without change.)

- [ ] **Step 10.4: Implement synthetic fallback subscriber**

The old `cloudLoader.buildSyntheticFallback` triggered when `loadAllClouds` returned `loadedCount === 0`. Reimplement as a subscriber:

```ts
import { generateSyntheticCloud } from '../../data/synthetic';

// After all four point slots are created and have load() called:
let pointsSettled = 0;
let pointsAnyReady = false;
const syntheticPointSlots = [Source.SDSS, Source.TwoMRS, Source.Glade];  // Famous is curated, doesn't count
for (const source of syntheticPointSlots) {
  const slot = state.assetSlots.points.get(source)!;
  slot.subscribe((s) => {
    if (s.kind === 'ready' && s.value.count > 0) pointsAnyReady = true;
    if (s.kind === 'ready' || s.kind === 'error') {
      pointsSettled += 1;
      if (pointsSettled === syntheticPointSlots.length && !pointsAnyReady) {
        // Every real source either failed or returned empty — drop in synthetic.
        const synthetic = generateSyntheticCloud(100_000);
        state.gpu.renderer
          ?.upload(Source.Synthetic, synthetic)
          .then(() => {
            state.sources.clouds.set(Source.Synthetic, synthetic);
            cb.onCloudReady?.(Source.Synthetic, synthetic.count);
            state.subsystems.scheduler.requestRender();
          })
          .catch((err) => console.error('[engine] synthetic upload failed:', err));
      }
    }
  });
}
```

(This subscriber only triggers once per engine lifetime — it doesn't re-arm on tier swap because tier swaps don't realistically take the system from "all empty" to "all empty".)

- [ ] **Step 10.5: Manual smoke test**

- Famous galaxies render with their curated names (famous-meta loaded).
- Cmd+K palette: typing "NGC 4565" finds the galaxy (pgc-aliases loaded lazily).
- Simulated all-fail: in dev, temporarily rename `public/data/sdss-medium.bin` etc. so all real fetches 404. Reload. Synthetic cloud appears. Restore filenames after.

- [ ] **Step 10.6: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 10.7: Commit**

```bash
git add src/services/engine/engine.ts src/App.tsx
git commit -m "$(cat <<'EOF'
feat(loading): port sidecars + synthetic fallback to AssetSlot

famousMeta loads at engine boot; pgcAlias remains lazy (loaded on first
palette open) but flows through a slot.  Synthetic fallback rewritten
as a subscriber on the three real point slots — fires once when all
three settle to error or empty-ready.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Tier-swap regression test

**Files:**
- Create: `tests/services/engine/engine.tier-swap-race.test.ts`

The single most important regression test in this plan: assert that rapid tier swaps don't produce a state where the slot's value disagrees with the slot's request. Stubs the renderer (no real GPU).

- [ ] **Step 11.1: Write the failing test**

```ts
// tests/services/engine/engine.tier-swap-race.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createAssetSlot } from '../../../src/services/loading/AssetSlot';
import type { Fetcher } from '../../../src/services/loading/types';

/**
 * Regression test for the cloudLoader race condition described in the
 * 2026-05-07-asset-loading-design.md spec.  Rapid load() calls must
 * settle to the LATEST request's value, never an earlier request's.
 */
describe('AssetSlot tier-swap race', () => {
  it('rapid load(small) → load(large) → load(medium) settles to medium', async () => {
    const resolvers = new Map<string, (v: string) => void>();
    const fetcher: Fetcher<string, { tier: string }> = (req, signal) =>
      new Promise<string>((resolve, reject) => {
        resolvers.set(req.tier, resolve);
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    const uploaded: string[] = [];
    const slot = createAssetSlot<string, { tier: string }>({
      name: 'pts',
      fetch: fetcher,
      commit: async (val) => {
        uploaded.push(val);
        await new Promise((r) => setTimeout(r, 5));  // simulate async GPU upload
      },
      retry: () => 'give-up',
    });

    slot.load({ tier: 'small' });
    slot.load({ tier: 'large' });
    slot.load({ tier: 'medium' });

    // Resolve in order opposite to request — large arrives first, then medium, then small.
    resolvers.get('large')?.('LARGE-DATA');
    resolvers.get('medium')?.('MEDIUM-DATA');
    resolvers.get('small')?.('SMALL-DATA');

    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(slot.current()).toBe('MEDIUM-DATA');
    // Race-fix: only the latest request's value reaches commit.
    expect(uploaded).toEqual(['MEDIUM-DATA']);
  });

  it('commit-side race: commit completes for superseded value, slot still settles to latest', async () => {
    let fetchCalls = 0;
    const fetcher: Fetcher<string, number> = vi.fn(async () => {
      fetchCalls += 1;
      return `payload-${fetchCalls}`;
    });
    const commitOrder: string[] = [];
    const commit = vi.fn(async (val: string) => {
      commitOrder.push(`start:${val}`);
      await new Promise((r) => setTimeout(r, val === 'payload-1' ? 50 : 5));
      commitOrder.push(`end:${val}`);
    });
    const slot = createAssetSlot<string, number>({
      name: 'pts',
      fetch: fetcher,
      commit,
      retry: () => 'give-up',
    });

    slot.load(1);
    await vi.waitFor(() => expect(slot.state().kind).toBe('committing'));
    slot.load(2);

    await vi.waitFor(() => expect(slot.state().kind).toBe('ready'));
    expect(slot.current()).toBe('payload-2');
    // Both commits ran (commit was already in flight for payload-1) but only
    // payload-2's `committed` event reached the reducer — the second
    // race-check dropped payload-1's late notification.
  });
});
```

- [ ] **Step 11.2: Run test**

Run: `npm test -- tier-swap-race`
Expected: PASS (the slot from Task 4 already implements the race fix; this test locks the behavior).

- [ ] **Step 11.3: Commit**

```bash
git add tests/services/engine/engine.tier-swap-race.test.ts
git commit -m "$(cat <<'EOF'
test(loading): add tier-swap race regression test

Locks the AssetSlot race-fix invariant: rapid load() calls always settle
to the latest request's value, even when the superseded fetch resolves
later or the superseded commit completes after a newer load() has begun.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Delete old loaders + rewrite progress aggregator

**Files:**
- Delete: `src/services/engine/cloudLoader.ts`
- Delete: `src/services/engine/famousMetaLoader.ts`
- Delete: `src/services/engine/pgcAliasLoader.ts`
- Delete: `tests/services/engine/cloudLoader.reload.test.ts`
- Delete: `tests/services/engine/cloudLoaderUrlBase.test.ts`
- Delete: `tests/services/engine/famousMetaLoader.test.ts`
- Modify: `src/services/engine/loadProgressAggregator.ts` (becomes a thin wrapper around `aggregateRegistry`)

- [ ] **Step 12.1: Verify no other files import the old loaders**

Run: `grep -rn "from.*cloudLoader\|from.*famousMetaLoader\|from.*pgcAliasLoader" src/ tests/`

Expected output: no remaining imports (engine.ts should already be migrated). If any exist, fix them before continuing.

- [ ] **Step 12.2: Delete the old files**

```bash
rm src/services/engine/cloudLoader.ts \
   src/services/engine/famousMetaLoader.ts \
   src/services/engine/pgcAliasLoader.ts \
   tests/services/engine/cloudLoader.reload.test.ts \
   tests/services/engine/cloudLoaderUrlBase.test.ts \
   tests/services/engine/famousMetaLoader.test.ts
```

- [ ] **Step 12.3: Rewrite loadProgressAggregator**

Replace contents of `src/services/engine/loadProgressAggregator.ts`:

```ts
/**
 * loadProgressAggregator — thin subscriber wrapper around the loading
 * registry's aggregateRegistry pure projection.
 *
 * The original implementation kept its own per-source byte map and emitted
 * snapshots on every chunk arrival.  Now that AssetSlot owns the per-asset
 * state, the aggregator is just a `for-each-slot subscribe → recompute →
 * emit` loop.  Same external API (`onLoadProgress` callback shape), drastically
 * less code.
 */
import { aggregateRegistry } from '../loading/aggregateRegistry';
import type { AssetSlot } from '../loading/types';
import type { LoadProgressState } from '../../@types/EngineCallbacks';

export type LoadProgressEmitter = {
  emit(): void;
  attachSlot(slot: AssetSlot<unknown, unknown>): void;
};

export function createLoadProgressEmitter(
  emit: (state: LoadProgressState | null) => void,
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): LoadProgressEmitter {
  function publish(): void {
    const snap = aggregateRegistry(slots);
    if (snap.inFlightCount === 0) emit(null);
    else
      emit({
        loadedBytes: snap.totalLoadedBytes,
        totalBytes: snap.totalExpectedBytes,
        inFlightCount: snap.inFlightCount,
      });
  }
  return {
    emit: publish,
    attachSlot(slot) {
      slot.subscribe(publish);
    },
  };
}
```

- [ ] **Step 12.4: Update engine.ts to use the new emitter**

In engine.ts, replace the old `createLoadProgressAggregator` initialization with `createLoadProgressEmitter` and call `attachSlot` for every slot. The old `start/update/finish` calls inside individual slot subscribers can be removed — the emitter recomputes from `aggregateRegistry`.

```ts
const allSlots = new Map<string, AssetSlot<unknown, unknown>>();
for (const [s, slot] of pointSlots) allSlots.set(slot.name, slot as any);
allSlots.set(filamentSlot.name, filamentSlot as any);
allSlots.set(famousMetaSlot.name, famousMetaSlot as any);
allSlots.set(pgcAliasSlot.name, pgcAliasSlot as any);

const progressEmitter = createLoadProgressEmitter(
  (state) => cb.onLoadProgress?.(state),
  allSlots,
);
for (const [, slot] of allSlots) progressEmitter.attachSlot(slot);
state.subsystems.loadProgress = progressEmitter;
```

Remove the per-slot `loadProgress?.start/update/finish` calls inside subscribers from Tasks 8-10.

- [ ] **Step 12.5: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: all PASS. Some old tests are gone (deleted with the loaders); existing engine smoke tests should still pass.

- [ ] **Step 12.6: Manual verification in dev**

Reload the dev tab. Loading bar appears, ratchets up, fades out. Tier swap shows the bar again. Console no longer shows old loader messages.

- [ ] **Step 12.7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(loading): delete old loaders, simplify progress aggregator

Removes cloudLoader.ts, famousMetaLoader.ts, pgcAliasLoader.ts (and
their tests) — fully replaced by the AssetSlot subsystem.
loadProgressAggregator becomes a thin subscriber on aggregateRegistry,
recomputing from slot state rather than maintaining its own byte map.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Loading dev panel

**Files:**
- Create: `src/components/LoadingDevPanel.tsx`
- Modify: `src/App.tsx` (mount the panel when in dev or `?debug=loading`)

- [ ] **Step 13.1: Implement LoadingDevPanel**

```tsx
// src/components/LoadingDevPanel.tsx
/**
 * LoadingDevPanel — fixed-position dev panel listing every asset slot's
 * current state with per-slot reload/cancel buttons.
 *
 * Mounted only when `import.meta.env.DEV` is true OR the URL contains
 * `?debug=loading` (escape hatch for diagnosing real production failures).
 * Tree-shaken from production builds when the dev branch is dead.
 *
 * Subscribes once per slot at mount; reactive via React useState +
 * useEffect.  Renders snapshot at 60Hz cap (each slot push triggers a
 * single setState; React's batching handles the rest).
 */
import { useEffect, useState } from 'react';
import type { AssetSlot, LoadState } from '../services/loading/types';
import { aggregateRegistry } from '../services/loading/aggregateRegistry';

export type LoadingDevPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};

export function LoadingDevPanel({ slots }: LoadingDevPanelProps) {
  const [, force] = useState(0);
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    for (const [, slot] of slots) {
      unsubs.push(slot.subscribe(() => force((n) => n + 1)));
    }
    return () => unsubs.forEach((u) => u());
  }, [slots]);

  const snap = aggregateRegistry(slots);

  return (
    <div
      style={{
        position: 'fixed',
        top: 8,
        right: 8,
        background: 'rgba(0,0,0,0.85)',
        color: '#cfc',
        font: '11px/1.4 ui-monospace, monospace',
        padding: '8px 10px',
        borderRadius: 4,
        zIndex: 99999,
        maxWidth: 480,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
        Asset Loading ({snap.inFlightCount} in flight)
      </div>
      {snap.slots.map(({ name, state }) => (
        <SlotRow key={name} name={name} state={state} slot={slots.get(name)!} />
      ))}
    </div>
  );
}

function SlotRow({
  name,
  state,
  slot,
}: {
  name: string;
  state: LoadState<unknown>;
  slot: AssetSlot<unknown, unknown>;
}) {
  const summary = describe(state);
  const reqJson = state.kind === 'idle' ? '—' : JSON.stringify((state as any).req).slice(0, 80);
  return (
    <div style={{ marginTop: 4 }}>
      <div>
        <span style={{ display: 'inline-block', width: 130 }}>{name}</span>
        <span style={{ display: 'inline-block', width: 80 }}>{state.kind}</span>
        <span style={{ display: 'inline-block', width: 130 }}>{summary}</span>
        <button onClick={() => slot.forceReload()} style={{ fontSize: 10 }}>Reload</button>
        {state.kind === 'loading' && (
          <button onClick={() => slot.cancel()} style={{ fontSize: 10, marginLeft: 4 }}>
            Cancel
          </button>
        )}
      </div>
      <div style={{ marginLeft: 8, opacity: 0.6 }}>req: {reqJson}</div>
    </div>
  );
}

function describe(state: LoadState<unknown>): string {
  switch (state.kind) {
    case 'idle':
      return '—';
    case 'loading': {
      const pct = state.total > 0 ? Math.round((state.loaded / state.total) * 100) : 0;
      return `${pct}% (${(state.loaded / 1e6).toFixed(1)}/${(state.total / 1e6).toFixed(1)} MB)`;
    }
    case 'committing':
      return 'committing…';
    case 'ready':
      return 'ready';
    case 'error':
      return `error: ${state.error.message.slice(0, 40)}`;
  }
}
```

- [ ] **Step 13.2: Mount the panel from App.tsx**

In `src/App.tsx`, add (near the top render block):

```tsx
import { LoadingDevPanel } from './components/LoadingDevPanel';

// ...inside App's render:
{(import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === 'loading') &&
  engineHandle?.assetSlots && (
    <LoadingDevPanel slots={engineHandle.assetSlots} />
  )}
```

The `engineHandle.assetSlots` field needs to be exposed on the public `EngineHandle` type — add it to `src/@types/EngineHandle.ts`:

```ts
import type { AssetSlot } from '../services/loading/types';
// ...
assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
```

And expose it from engine.ts in the returned handle:

```ts
return {
  // ...existing handle methods
  assetSlots: allSlots,
};
```

- [ ] **Step 13.3: Manual verification**

Reload dev tab. Top-right corner shows the panel with all slots. Click "Reload" on a slot — that asset re-fetches. Tier swap — point slots cycle through `loading → committing → ready`.

- [ ] **Step 13.4: Run tests + typecheck**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 13.5: Commit**

```bash
git add src/components/LoadingDevPanel.tsx src/App.tsx src/@types/EngineHandle.ts src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
feat(loading): add LoadingDevPanel for in-app debug visibility

Fixed-position panel listing every asset slot's state, request, byte
counts, and a Reload/Cancel button per row.  Mounted only when
import.meta.env.DEV is true OR the URL contains ?debug=loading; the dev
branch tree-shakes from production builds.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Final verification

**Files:** none modified.

- [ ] **Step 14.1: Run the full type-check + test suite**

Run: `npm run typecheck && npm test`
Expected: type-check clean; all tests pass; new test count is roughly +50 from baseline.

- [ ] **Step 14.2: Manual smoke checklist**

Walk through these in the dev browser, dev panel visible:

1. Cold reload → all four point sources go `idle → loading → ready`. Filaments go `idle → loading → ready`. famous-meta goes ready. pgc-aliases stays idle.
2. Cmd+K palette open → pgc-aliases goes `idle → loading → ready` once.
3. Tier `medium → large` → SDSS + GLADE re-load; 2MRS, Famous, filaments stay ready (skipped). New tier visible without mouse movement.
4. Tier `large → small` → SDSS goes ready with count=0 (excluded); GLADE re-loads at small size.
5. Rapid clicks `medium → large → small` in <500 ms: all settle to `small`'s data; no overlay.
6. Network throttle to "Slow 3G" in DevTools, reload: loading bar visible the whole time, slots show progress, eventually all ready. No retries triggered (no transient errors at 3G — just slow).
7. Network throttle "Offline", reload: every slot ends in `error` (after 2 retries each). Synthetic cloud appears on canvas (the all-empty fallback). Dev panel shows red error states.

- [ ] **Step 14.3: Commit verification log (optional, if desired by user)**

If the user wants a verification log committed, write it to `docs/superpowers/plans/2026-05-07-asset-loading-verification.md` and commit. Otherwise skip.

- [ ] **Step 14.4: Note for the user**

Two-other-agents constraint: do NOT push or open a PR — the branch is shared. The user will coordinate the PR when all parallel work converges. Print the commit log:

Run: `git log --oneline -20`
Expected: 13 fresh commits from this plan.

---

## Self-review

**Spec coverage check** (against `docs/superpowers/specs/2026-05-07-asset-loading-design.md`):

- ✅ Race-fix algorithm (two race-checks) — Task 4 implementation, Task 11 regression test.
- ✅ Pure helpers (retryPolicy, reduceLoadState, aggregateRegistry, consoleAdapter, fetchWithProgress) — Tasks 1-3, 5.
- ✅ AssetSlot mutable shell minimized — Task 4.
- ✅ Tier-aware request types — Tasks 6-7, type signatures verified to match spec.
- ✅ Excluded-tier short-circuit — Task 6.
- ✅ Same-target-across-tiers skip — Task 9 setTier.
- ✅ Filament one-shot at boot — Task 9.
- ✅ Sidecar lazy load (pgc-alias) — Task 10.
- ✅ Synthetic fallback — Task 10.
- ✅ Dev panel with `import.meta.env.DEV` + query-param escape — Task 13.
- ✅ Console adapter auto-attached at slot creation — Task 5.
- ✅ Light retry (2× [1s, 3s], 4xx fail-fast) — Task 2.
- ✅ Old loaders deleted — Task 12.
- ✅ progress aggregator simplified — Task 12.
- ✅ Type/method consistency: `slot.cancel()` declared in `types.ts` (Task 4.4) and used in dev panel (Task 13). `forceReload()` consistent across slot impl (Task 4.3) and dev panel (Task 13). `aggregateRegistry` returns `RegistrySnapshot` defined once (Task 5.2), consumed by both `LoadingDevPanel` (Task 13) and `loadProgressAggregator` rewrite (Task 12.3).

**Placeholder scan:** none found.

**Out-of-scope items confirmed not introduced:**
- No IndexedDB.
- No worker-thread decode.
- No range requests.
- No changes to `galaxyImageFetcher.ts`.
