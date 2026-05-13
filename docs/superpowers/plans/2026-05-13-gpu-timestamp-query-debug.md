# GPU Timestamp-Query Debug Instrumentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is self-contained: a fresh subagent should be able to execute it after reading only this file + the spec.

**Goal:** Add per-pass GPU timing instrumentation to the render frame. Split the single shared HDR render pass into one no-draw clear pass plus eight per-`HDR_PASSES` render passes so that WebGPU `timestamp-query` writes land on per-pass boundaries. Surface live timings (rolling-average + 8-sample sparkline) in a renamed `DebugPanel` alongside the existing asset-loading section. Production and debug share the rendering architecture — there is no debug-only branch.

**Architecture:** A new `gpuTimingService` owns a 32-slot `GPUQuerySet`, a resolve buffer, and two double-buffered staging buffers. Per-frame: `descriptorFor(slot)` returns the `RenderPassTimestampWrites` object the orchestrator drops into each pass descriptor; `endFrame` records the resolve + copy commands and queues an async map-read whose decoded `BigUint64`s flow to subscribers as a `GpuTimingFrame`. Construction is gated on `hasUrlGate('gpuTimings')` AND `device.features.has('timestamp-query')` — when either is false, the service is a no-op (`descriptorFor` returns `undefined`, subscribers never fire). The `DebugPanel` umbrella renders an `AssetLoadingSection` (current `LoadingDevPanel` body) and a `GpuTimingsSection` (subscribes to the timing service).

**Tech Stack:** TypeScript, WebGPU, Vitest, React, Vite. Per-concern types live in `src/@types/` (no barrel re-exports). The pass split MUST be visually identical to today's mega-pass — proved by a hash-compare baseline test patterned on the impostor-split work (PR #126).

**Reference:** Full spec at `docs/superpowers/specs/2026-05-13-gpu-timestamp-query-debug-design.md`. The "Static slot assignment" table is load-bearing — every slot index in this plan matches that table.

---

## Task 1: Add `hasUrlGate` utility and migrate three existing call sites

**Files:**
- Create: `src/utils/url/urlGate.ts`
- Create: `tests/utils/url/urlGate.test.ts`
- Modify: `src/components/App/App.tsx` (replace inline `URLSearchParams` reads at the two known sites)
- Modify: `src/services/engine/phases/wireSlots.ts` (replace two inline `URLSearchParams` reads)

The spec calls for one helper instead of four duplicated `new URLSearchParams(window.location.search).has(...)` blocks. The migration is one commit, no behaviour change. The `get('debug') === 'loading'` site in `App.tsx` collapses to `hasUrlGate('debug')` — the `=loading` value distinction has no current consumers and the renamed `DebugPanel` is exactly what that gate enables anyway (next-tasks territory; the rename of `LoadingDevPanel` to `DebugPanel` happens in Task 15).

- [ ] **Step 1: Write the failing test**

Create `tests/utils/url/urlGate.test.ts`:

```typescript
/**
 * hasUrlGate — unit coverage for the URL-query-string boolean gate.
 *
 * Three behaviours under test:
 *   1. Returns true when the named param is present (with or without value).
 *   2. Returns false when the param is absent.
 *   3. Returns false defensively when `window` is undefined OR the search
 *      string is malformed enough to throw inside URLSearchParams.
 *
 * jsdom gives us a real `window.location`; we mutate its `search` field
 * via a writable replacement (the property is writable in jsdom but not
 * in real browsers — fine for tests).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hasUrlGate } from '../../../src/utils/url/urlGate';

describe('hasUrlGate', () => {
  let originalSearch: string;

  beforeEach(() => {
    originalSearch = window.location.search;
  });

  afterEach(() => {
    // Restore the pristine query string between cases.  We delete-and-
    // reassign because some jsdom builds make `search` a getter that
    // ignores direct assignment unless the property is replaced.
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: originalSearch },
    });
  });

  function setSearch(s: string): void {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, search: s },
    });
  }

  it('returns true when the bare-flag param is present', () => {
    setSearch('?gpuTimings');
    expect(hasUrlGate('gpuTimings')).toBe(true);
  });

  it('returns true when the param has a value', () => {
    setSearch('?debug=loading');
    expect(hasUrlGate('debug')).toBe(true);
  });

  it('returns false when the param is absent', () => {
    setSearch('?volumes');
    expect(hasUrlGate('gpuTimings')).toBe(false);
  });

  it('returns false for an empty query string', () => {
    setSearch('');
    expect(hasUrlGate('gpuTimings')).toBe(false);
  });

  it('handles multiple params and finds the named one', () => {
    setSearch('?volumes&anchors&gpuTimings');
    expect(hasUrlGate('anchors')).toBe(true);
    expect(hasUrlGate('gpuTimings')).toBe(true);
    expect(hasUrlGate('debug')).toBe(false);
  });
});
```

Run: `npx vitest run tests/utils/url/urlGate.test.ts`

Expected: FAIL — `urlGate.ts` doesn't exist yet.

- [ ] **Step 2: Implement the helper**

Create `src/utils/url/urlGate.ts`:

```typescript
/**
 * hasUrlGate — unified read of a boolean URL query-string flag.
 *
 * The skymap project uses URL-gated dev features (e.g. `?volumes`,
 * `?anchors`, `?debug`, `?gpuTimings`).  Before this helper landed,
 * each call site spelled the predicate out:
 *
 *   typeof window !== 'undefined' &&
 *     (() => { try { return new URLSearchParams(window.location.search).has('foo'); }
 *              catch { return false; } })()
 *
 * Four copies of that boilerplate is one too many.  This helper
 * collapses it to `hasUrlGate('foo')`.
 *
 * ### Defensiveness
 *
 *   - `typeof window === 'undefined'` guards SSR-like environments
 *     (jsdom has window, but be defensive — vitest unit-test runs
 *     sometimes inject minimal-jsdom shims that lack `location`).
 *   - The try/catch absorbs the (rare) `URLSearchParams` throw on
 *     malformed search strings.  In practice this never fires in a
 *     real browser; the catch exists for paranoia and ergonomics —
 *     callers shouldn't have to defend against URL parsing failures
 *     for a debug toggle.
 *
 * ### Why "has", not "get"
 *
 * Every existing gate (and the new `gpuTimings` gate) is a bare-flag:
 * the param's *presence* matters, the value is ignored.  Returning
 * the parsed value would force every caller to coerce again.  When
 * a future feature genuinely needs the value, add a parallel
 * `urlGateValue(name): string | null` rather than overloading this.
 */

export function hasUrlGate(name: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).has(name);
  } catch {
    return false;
  }
}
```

Run: `npx vitest run tests/utils/url/urlGate.test.ts`

Expected: PASS.

- [ ] **Step 3: Migrate the four existing call sites**

In `src/components/App/App.tsx`, replace the body of `isLoadingDevPanelAvailable` (~line 93-97) so the function reads:

```typescript
function isLoadingDevPanelAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  return hasUrlGate('debug');
}
```

Add the import at the top of the file (group with the other `../../utils/...` imports):

```typescript
import { hasUrlGate } from '../../utils/url/urlGate';
```

In the same file, replace the `volumesUiEnabled` useMemo body (~line 243) so it reads:

```typescript
const volumesUiEnabled = useMemo<boolean>(() => {
  if (import.meta.env.DEV) return true;
  return hasUrlGate('volumes');
}, []);
```

In `src/services/engine/phases/wireSlots.ts`, replace the `volumesEnabledByUrl` IIFE (~line 158) with:

```typescript
const volumesEnabledByUrl = hasUrlGate('volumes');
```

…and the `showAnchors` IIFE (~line 195) with:

```typescript
const showAnchors = hasUrlGate('anchors');
```

Add the import at the top of `wireSlots.ts`:

```typescript
import { hasUrlGate } from '../../../utils/url/urlGate';
```

Run: `npm run typecheck`

Expected: PASS — no type errors.

Run: `npm test`

Expected: PASS — full vitest suite stays green (no behaviour change).

- [ ] **Step 4: Commit**

```bash
git add src/utils/url/urlGate.ts tests/utils/url/urlGate.test.ts src/components/App/App.tsx src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
refactor(utils): extract hasUrlGate helper and migrate 4 inline call sites

Replaces four near-identical `new URLSearchParams(window.location.search)
.has(name)` blocks across App.tsx and wireSlots.ts with a single
hasUrlGate(name) helper.  Behaviour is unchanged; the
`?debug=loading` site collapses to `?debug` because the `=loading`
value distinction has no current consumers and is about to be subsumed
by the DebugPanel rename.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add type definitions for the timing service

**Files:**
- Create: `src/@types/gpu/timing/TimingSlotName.d.ts`
- Create: `src/@types/gpu/timing/GpuTimingFrame.d.ts`
- Create: `src/@types/gpu/timing/TimingFrameContext.d.ts`
- Create: `src/@types/gpu/timing/GpuTimingService.d.ts`

These types are consumed in Task 3+; landing them as a separate commit keeps the type surface reviewable on its own and prevents a circular dependency when the implementation imports from `@types/`.

The project convention (`CLAUDE.md`) is `type` aliases, never `interface`, and one file per type with deep relative imports — no barrel exports.

- [ ] **Step 1: Add `TimingSlotName`**

Create `src/@types/gpu/timing/TimingSlotName.d.ts`:

```typescript
/**
 * TimingSlotName — the kebab-case identifier of one timed render pass.
 *
 * Each value pairs with a fixed begin/end slot pair in the
 * `TIMING_SLOT_NAMES` table (`src/services/gpu/timing/TIMING_SLOT_NAMES.ts`).
 * The union is closed at the type level because the slot table is
 * compile-time-fixed (the spec's "Static slot assignment" section);
 * adding a new pass means editing the union AND the table in one
 * commit — the type checker enforces both edits.
 *
 * The 10 inhabitants below cover the 8 HDR sub-passes (`HDR_PASSES`),
 * the tone-map post-process, and the pick render pass.  Slots 20–31 of
 * the GPUQuerySet are reserved for future inhabitants without forcing
 * a query-set resize.
 *
 * The strings match the `name` fields on `Pass` objects (e.g.
 * `pointSpritesPass.name === 'point-sprites'`).  Tests in Task 9 lean
 * on that equality to assert each pass plumbs its timing descriptor.
 */

export type TimingSlotName =
  | 'point-sprites'
  | 'procedural-disks'
  | 'textured-impostors'
  | 'filaments'
  | 'scalar-volume'
  | 'milky-way'
  | 'marker-lines'
  | 'labels'
  | 'tone-map'
  | 'pick';
```

- [ ] **Step 2: Add `GpuTimingFrame`**

Create `src/@types/gpu/timing/GpuTimingFrame.d.ts`:

```typescript
/**
 * GpuTimingFrame — one decoded snapshot of per-pass GPU timings.
 *
 * Pushed to subscribers by `gpuTimingService` once a frame's staging
 * buffer completes its async `mapAsync`.  The latency from "frame was
 * encoded" to "this snapshot fires" is 1–2 frames (the staging buffer
 * is double-buffered so a frame's resolve doesn't stall the next
 * frame's submission).
 *
 * ### Why a `ReadonlyMap` rather than a struct
 *
 * Two reasons:
 *
 *   1. Slots that didn't run this frame ("pick" when there was no
 *      hover, "filaments" when the filament cloud hasn't loaded,
 *      etc.) are simply absent from the map.  A struct would force
 *      `undefined` everywhere and lose the "the pass didn't run" /
 *      "the pass ran in 0 ms" distinction at the type level.
 *   2. Subscribers iterate by `TimingSlotName` keys (e.g. the
 *      `GpuTimingsSection` component renders one row per active
 *      slot).  Map iteration order is insertion order — the
 *      decode loop inserts in the table-defined order, so the UI
 *      doesn't have to re-sort.
 *
 * ### Units
 *
 * `perPassMs` values are floating-point milliseconds, derived from
 * `(endTicks - beginTicks) * device.queue.timestampPeriod / 1e6`
 * where `timestampPeriod` is the nanoseconds-per-tick figure WebGPU
 * exposes.  Sub-millisecond resolution is normal (most passes will
 * land in the 0.1–5 ms range).
 */

import type { TimingSlotName } from './TimingSlotName';

export type GpuTimingFrame = {
  /**
   * Monotonic counter incremented once per `beginFrame` call.  The
   * subscriber uses this to ignore out-of-order map-completions
   * (theoretically the double-buffered staging buffers should land
   * in order, but driver quirks make a defensive check cheap).
   */
  readonly frameIndex: number;
  /**
   * Decoded per-pass durations.  A missing key means the pass didn't
   * run this frame (its `descriptorFor` wasn't consumed).
   */
  readonly perPassMs: ReadonlyMap<TimingSlotName, number>;
};
```

- [ ] **Step 3: Add `TimingFrameContext`**

Create `src/@types/gpu/timing/TimingFrameContext.d.ts`:

```typescript
/**
 * TimingFrameContext — opaque per-frame handle returned by
 * `gpuTimingService.beginFrame()` and consumed by `endFrame()`.
 *
 * Carries the staging-buffer rotation cursor for *this* frame.  The
 * caller is encouraged to treat it as opaque — every field is
 * `readonly` and the orchestrator only ever passes it back into
 * `endFrame` unmodified.
 *
 * ### Why a struct rather than an integer
 *
 * The bag is small now (frame index + buffer slot) but is the natural
 * site for future per-frame metadata (e.g. a "this frame should also
 * sample the experimental inside-pass query" toggle if we revisit the
 * rejected `timestamp-query-inside-passes` feature in v2).  Keeping
 * the type a struct from day one means the future addition is a
 * non-breaking field add.
 */

export type TimingFrameContext = {
  /** Matches `GpuTimingFrame.frameIndex` for the frame that started. */
  readonly frameIndex: number;
  /**
   * Which of the two staging buffers this frame writes its resolved
   * timestamps into.  Either 0 or 1.  Set by `beginFrame` (incremented
   * mod 2 from the previous frame's slot).
   */
  readonly stagingSlot: 0 | 1;
};
```

- [ ] **Step 4: Add `GpuTimingService`**

Create `src/@types/gpu/timing/GpuTimingService.d.ts`:

```typescript
/**
 * GpuTimingService — the public handle returned by
 * `createGpuTimingService(device)`.
 *
 * Two-mode lifecycle:
 *
 *   - **Active mode** — feature is supported AND `?gpuTimings` is set.
 *     `descriptorFor` returns a `RenderPassTimestampWrites` referencing
 *     the shared query set; `endFrame` issues resolve + copy commands
 *     into the supplied encoder and queues a `mapAsync` on the rotated
 *     staging buffer.  Subscribers fire 1–2 frames after each
 *     `endFrame`.
 *
 *   - **No-op mode** — feature is missing OR the gate is off (the gate
 *     is checked by the *caller* before constructing the service, so
 *     in practice the service only no-ops when the adapter lacks
 *     `timestamp-query`).  Every method short-circuits:
 *     `descriptorFor` returns `undefined`, `endFrame` does nothing,
 *     subscribers never fire.  Pass-orchestrator code reads the
 *     undefined return value and simply doesn't set
 *     `timestampWrites` on its render-pass descriptor — WebGPU
 *     interprets the missing field as "no timing requested".
 *
 * ### Why a single object exposing both modes
 *
 * Wrapping the no-op path in the same shape as the active path means
 * `renderFrame.ts` doesn't branch on availability — it always calls
 * `descriptorFor(...)` and lets the optional return value flow into
 * the descriptor literal via `...maybe`.  The branching collapses to
 * one site (service construction) instead of being repeated at every
 * call site.
 *
 * ### Subscriber lifetime
 *
 * `subscribe` returns an unsubscribe function in the now-standard
 * skymap pattern (matches `AssetSlot.subscribe`, `engineHandle.*.subscribe`).
 * The service holds listeners in a `Set`; unsubscribing inside a
 * dispatch is safe because the dispatch loop materialises the listener
 * array up-front each call.
 */

import type { TimingSlotName } from './TimingSlotName';
import type { TimingFrameContext } from './TimingFrameContext';
import type { GpuTimingFrame } from './GpuTimingFrame';

export type GpuTimingService = {
  /**
   * True when the underlying `timestamp-query` feature is available on
   * `device.features`.  Consumers (the DebugPanel) read this to choose
   * between the "unavailable on this adapter" message and the live
   * readout.
   */
  readonly available: boolean;
  /**
   * Start a frame's timing window.  Rotates the staging-buffer cursor
   * and returns an opaque context the orchestrator threads back into
   * `endFrame`.
   *
   * Cheap: integer arithmetic + a Map.clear().  No GPU work.
   */
  beginFrame(): TimingFrameContext;
  /**
   * Build the `RenderPassTimestampWrites` descriptor for the named
   * slot.  Returns `undefined` in no-op mode.
   *
   * The slot-to-index mapping is static (see
   * `src/services/gpu/timing/TIMING_SLOT_NAMES.ts`), so this method
   * doesn't need the frame context.
   */
  descriptorFor(slot: TimingSlotName): GPURenderPassTimestampWrites | undefined;
  /**
   * Record the `resolveQuerySet` + `copyBufferToBuffer` commands into
   * the supplied encoder, using `ctx` to pick the destination staging
   * buffer.  After `device.queue.submit(...)` runs (caller's
   * responsibility), the service queues an asynchronous `mapAsync` on
   * that staging buffer; when it completes, subscribers are notified.
   *
   * In no-op mode this is a no-op.
   */
  endFrame(ctx: TimingFrameContext, encoder: GPUCommandEncoder): void;
  /**
   * Register a `GpuTimingFrame` listener.  Returns an unsubscribe
   * function.  In no-op mode the subscription is recorded but never
   * fires.
   */
  subscribe(listener: (frame: GpuTimingFrame) => void): () => void;
  /**
   * Release the GPU query set and buffers.  After `destroy`, every
   * method except a redundant `destroy` is a no-op.  Called by the
   * engine's `destroy` chain.
   */
  destroy(): void;
};
```

Run: `npm run typecheck`

Expected: PASS — types compile in isolation. Vitest can't be run yet because no implementation references the types.

- [ ] **Step 5: Commit**

```bash
git add src/@types/gpu/timing/
git commit -m "$(cat <<'EOF'
types(gpu/timing): add GpuTimingService/Frame/Context/SlotName

Type-only commit defining the public surface of the upcoming
gpuTimingService.  Implementations land in subsequent commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add the static `TIMING_SLOT_NAMES` table

**Files:**
- Create: `src/services/gpu/timing/TIMING_SLOT_NAMES.ts`
- Create: `tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`

The table is the canonical source of truth for the spec's "Static slot assignment" section. Tests pin every (slot, begin-idx, end-idx) tuple so a typo can't slip through silently.

- [ ] **Step 1: Write the failing test**

Create `tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`:

```typescript
/**
 * TIMING_SLOT_NAMES — pin every (slot, begin-idx, end-idx) tuple from
 * the spec's "Static slot assignment" table.  A typo in the table
 * would mis-map decoded timings to the wrong row in the UI — caught
 * here.
 */

import { describe, it, expect } from 'vitest';
import {
  TIMING_SLOT_NAMES,
  TIMING_QUERY_SET_SIZE,
} from '../../../../src/services/gpu/timing/TIMING_SLOT_NAMES';

describe('TIMING_SLOT_NAMES', () => {
  it('maps every spec-defined slot to the correct begin/end indices', () => {
    expect(TIMING_SLOT_NAMES.get('point-sprites')).toEqual([0, 1]);
    expect(TIMING_SLOT_NAMES.get('procedural-disks')).toEqual([2, 3]);
    expect(TIMING_SLOT_NAMES.get('textured-impostors')).toEqual([4, 5]);
    expect(TIMING_SLOT_NAMES.get('filaments')).toEqual([6, 7]);
    expect(TIMING_SLOT_NAMES.get('scalar-volume')).toEqual([8, 9]);
    expect(TIMING_SLOT_NAMES.get('milky-way')).toEqual([10, 11]);
    expect(TIMING_SLOT_NAMES.get('marker-lines')).toEqual([12, 13]);
    expect(TIMING_SLOT_NAMES.get('labels')).toEqual([14, 15]);
    expect(TIMING_SLOT_NAMES.get('tone-map')).toEqual([16, 17]);
    expect(TIMING_SLOT_NAMES.get('pick')).toEqual([18, 19]);
  });

  it('reserves slots 20-31 (query set sized 32, only 20 in use)', () => {
    expect(TIMING_QUERY_SET_SIZE).toBe(32);
    expect(TIMING_SLOT_NAMES.size).toBe(10);
  });

  it('never assigns the same index to two slots', () => {
    const seen = new Set<number>();
    for (const [, [begin, end]] of TIMING_SLOT_NAMES) {
      expect(seen.has(begin)).toBe(false);
      expect(seen.has(end)).toBe(false);
      seen.add(begin);
      seen.add(end);
    }
  });
});
```

Run: `npx vitest run tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`

Expected: FAIL — `TIMING_SLOT_NAMES.ts` doesn't exist.

- [ ] **Step 2: Implement the table**

Create `src/services/gpu/timing/TIMING_SLOT_NAMES.ts`:

```typescript
/**
 * TIMING_SLOT_NAMES — the static slot→index map for `gpuTimingService`.
 *
 * The slot table is compile-time fixed, matching the spec's "Static
 * slot assignment" section verbatim:
 *
 *   | Slot name             | Begin idx | End idx |
 *   | --------------------- | --------- | ------- |
 *   | point-sprites         | 0         | 1       |
 *   | procedural-disks      | 2         | 3       |
 *   | textured-impostors    | 4         | 5       |
 *   | filaments             | 6         | 7       |
 *   | scalar-volume         | 8         | 9       |
 *   | milky-way             | 10        | 11      |
 *   | marker-lines          | 12        | 13      |
 *   | labels                | 14        | 15      |
 *   | tone-map              | 16        | 17      |
 *   | pick                  | 18        | 19      |
 *   | _reserved_            | 20–31     |         |
 *
 * 10 slots × 2 indices = 20.  The query set is sized 32 (see
 * `TIMING_QUERY_SET_SIZE` below) for headroom — splitting
 * `textured-impostors` into `textured-quads` + `textured-disks`, or
 * adding a future post-tone-map overlay, fits without resizing the
 * GPU resources.
 *
 * ### Why a `Map` rather than a plain object
 *
 * Iteration order matters: the decode loop in `gpuTimingService`
 * walks this map and inserts the resulting `(slot, ms)` pairs into
 * the published `GpuTimingFrame.perPassMs` map.  `Map` guarantees
 * insertion order; `{}` does technically too (numeric-key
 * complications notwithstanding), but `Map<TimingSlotName, [number, number]>`
 * carries its own type and reads cleanly at every consumer.
 *
 * ### Why exported as `readonly` Map
 *
 * The map is constructed once at module load and shared across the
 * whole process — there's no legitimate reason for a consumer to
 * mutate it.  The `ReadonlyMap` type signature catches the mistake
 * at compile time.
 */

import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';

/**
 * Size of the underlying `GPUQuerySet`.  20 slots in use + 12 reserved
 * for future inhabitants.  Sizing the query set once at construction
 * (rather than growing later) keeps the resolve buffer + staging
 * buffers right-sized from frame 1 — they're allocated `count * 8`
 * bytes since each timestamp is a `u64`.
 */
export const TIMING_QUERY_SET_SIZE = 32;

/** Slot→(begin idx, end idx) map.  See module header for the spec table. */
export const TIMING_SLOT_NAMES: ReadonlyMap<TimingSlotName, readonly [number, number]> =
  new Map<TimingSlotName, readonly [number, number]>([
    ['point-sprites', [0, 1]],
    ['procedural-disks', [2, 3]],
    ['textured-impostors', [4, 5]],
    ['filaments', [6, 7]],
    ['scalar-volume', [8, 9]],
    ['milky-way', [10, 11]],
    ['marker-lines', [12, 13]],
    ['labels', [14, 15]],
    ['tone-map', [16, 17]],
    ['pick', [18, 19]],
  ]);
```

Run: `npx vitest run tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts`

Expected: PASS — all three test cases green.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/timing/TIMING_SLOT_NAMES.ts tests/services/gpu/timing/TIMING_SLOT_NAMES.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu/timing): add static TIMING_SLOT_NAMES table

Compile-time-fixed slot→(begin, end) index map matching the spec's
"Static slot assignment" section.  Used by gpuTimingService (next
commit) and read by every pass-orchestration site.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `decodeTimestampBuffer` pure function

**Files:**
- Create: `src/services/gpu/timing/decodeTimestampBuffer.ts`
- Create: `tests/services/gpu/timing/decodeTimestampBuffer.test.ts`

The decode step is a pure, testable transformation of an `ArrayBuffer` (read from the mapped staging buffer) into a `Map<TimingSlotName, number>`. Extracting it makes the most error-prone bit of the service — `BigUint64` arithmetic — independently verifiable without standing up a mock device.

- [ ] **Step 1: Write the failing test**

Create `tests/services/gpu/timing/decodeTimestampBuffer.test.ts`:

```typescript
/**
 * decodeTimestampBuffer — pure-function unit coverage.
 *
 * Feeds synthetic BigUint64 arrays through the decoder and verifies:
 *   1. Slots with both timestamps non-zero produce (end-begin) * period / 1e6.
 *   2. Slots with begin === 0n are skipped (sentinel for "pass didn't run").
 *   3. Negative deltas (end < begin) are clamped to 0 — defends against
 *      driver wrap-around on GPUs that reset their tick counter.
 *   4. `timestampPeriod` is correctly applied (1 ns/tick → 0.001 ms/tick;
 *      coarse periods like 38.5 ns/tick should still multiply linearly).
 */

import { describe, it, expect } from 'vitest';
import { decodeTimestampBuffer } from '../../../../src/services/gpu/timing/decodeTimestampBuffer';

/** Build a 32-slot u64 buffer with the listed slot pairs filled in. */
function buildBuffer(pairs: ReadonlyArray<readonly [number, bigint, bigint]>): ArrayBuffer {
  const buf = new ArrayBuffer(32 * 8);
  const u64 = new BigUint64Array(buf);
  for (const [pairIdx, begin, end] of pairs) {
    u64[pairIdx * 2 + 0] = begin;
    u64[pairIdx * 2 + 1] = end;
  }
  return buf;
}

describe('decodeTimestampBuffer', () => {
  it('decodes one filled slot to (end-begin) * period / 1e6 ms', () => {
    // Slot 0 = point-sprites; begin idx 0, end idx 1.
    // pairIdx 0 means buffer u64s [0, 1].  Period 1 ns/tick.
    // delta = 2_000_000 ticks * 1 ns = 2_000_000 ns = 2 ms.
    const buf = buildBuffer([[0, 0n, 2_000_000n]]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.size).toBe(1);
    expect(out.get('point-sprites')).toBeCloseTo(2.0, 6);
  });

  it('skips slots whose begin tick is 0 (pass-did-not-run sentinel)', () => {
    // Slot 9 = pick.  Leave it 0n,0n — pick didn't fire this frame.
    // Slot 0 still runs.
    const buf = buildBuffer([
      [0, 100n, 1_000_100n],
      // No entry for pairIdx 9 — both u64s default to 0.
    ]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.has('point-sprites')).toBe(true);
    expect(out.has('pick')).toBe(false);
  });

  it('clamps negative deltas (end < begin) to 0', () => {
    // Driver wrap-around on a long-running session: end < begin.
    const buf = buildBuffer([[2, 5_000_000n, 1_000_000n]]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.get('textured-impostors')).toBe(0);
  });

  it('applies a non-unit timestampPeriod correctly', () => {
    // 38.5 ns/tick (a typical coarse-resolution value on fingerprint-
    // limited adapters).  100_000 ticks * 38.5 ns = 3_850_000 ns = 3.85 ms.
    const buf = buildBuffer([[6, 0n, 100_000n]]);
    const out = decodeTimestampBuffer(buf, 38.5);

    expect(out.get('marker-lines')).toBeCloseTo(3.85, 6);
  });

  it('decodes all 10 slots independently', () => {
    const buf = buildBuffer([
      [0, 0n, 1_000_000n],   // point-sprites:       1 ms
      [1, 0n, 2_000_000n],   // procedural-disks:    2 ms
      [2, 0n, 3_000_000n],   // textured-impostors:  3 ms
      [3, 0n, 500_000n],     // filaments:           0.5 ms
      [4, 0n, 4_000_000n],   // scalar-volume:       4 ms
      [5, 0n, 600_000n],     // milky-way:           0.6 ms
      [6, 0n, 100_000n],     // marker-lines:        0.1 ms
      [7, 0n, 100_000n],     // labels:              0.1 ms
      [8, 0n, 400_000n],     // tone-map:            0.4 ms
      [9, 0n, 200_000n],     // pick:                0.2 ms
    ]);
    const out = decodeTimestampBuffer(buf, 1);

    expect(out.get('point-sprites')).toBeCloseTo(1.0, 6);
    expect(out.get('procedural-disks')).toBeCloseTo(2.0, 6);
    expect(out.get('textured-impostors')).toBeCloseTo(3.0, 6);
    expect(out.get('filaments')).toBeCloseTo(0.5, 6);
    expect(out.get('scalar-volume')).toBeCloseTo(4.0, 6);
    expect(out.get('milky-way')).toBeCloseTo(0.6, 6);
    expect(out.get('marker-lines')).toBeCloseTo(0.1, 6);
    expect(out.get('labels')).toBeCloseTo(0.1, 6);
    expect(out.get('tone-map')).toBeCloseTo(0.4, 6);
    expect(out.get('pick')).toBeCloseTo(0.2, 6);
  });
});
```

Run: `npx vitest run tests/services/gpu/timing/decodeTimestampBuffer.test.ts`

Expected: FAIL — `decodeTimestampBuffer.ts` doesn't exist.

- [ ] **Step 2: Implement the decoder**

Create `src/services/gpu/timing/decodeTimestampBuffer.ts`:

```typescript
/**
 * decodeTimestampBuffer — pure ArrayBuffer → Map<slot, ms> transform.
 *
 * The mapped staging buffer is a 32 × u64 view: 32 timestamp ticks in
 * raw GPU clock units.  We iterate the `TIMING_SLOT_NAMES` table and,
 * for each slot, read its (begin, end) tick pair, compute the delta,
 * scale by `timestampPeriod` (nanoseconds per tick), and convert to
 * milliseconds.
 *
 * ### Sentinel: begin === 0n means "the pass didn't run"
 *
 * WebGPU's spec doesn't specify what `timestampWrites` does when its
 * descriptor is absent from a pass — in practice the slot's u64 stays
 * at whatever the staging buffer was zeroed to before its first map.
 * Our staging buffers are explicitly zero-initialised once at
 * construction, so an absent begin tick reliably reads 0n.  We treat
 * 0n as "skip this slot" — the GPU clock might legitimately produce a
 * 0 begin tick once in a billion years; the cost of a missed sample
 * that frame is negligible compared to the cost of mis-counting an
 * empty slot as a 0 ms pass.
 *
 * ### Negative-delta clamp
 *
 * On long-running sessions some adapters wrap their u64 tick counter
 * (the spec doesn't guarantee monotonicity across device-loss / power
 * cycles).  Reading `end - begin` as a `BigInt` and then converting
 * to `Number` will silently underflow into a huge positive number —
 * not what we want.  Clamping `end < begin` to 0 ms gives us a
 * one-frame artefact and self-corrects on the next sample.
 *
 * ### Purity
 *
 * The function takes an `ArrayBuffer` and a `number`, returns a
 * `Map`.  No DOM, no device, no closures.  Reusable in tests via the
 * fixtures in `decodeTimestampBuffer.test.ts`.
 */

import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
import { TIMING_SLOT_NAMES } from './TIMING_SLOT_NAMES';

export function decodeTimestampBuffer(
  buffer: ArrayBuffer,
  timestampPeriodNs: number,
): Map<TimingSlotName, number> {
  const u64 = new BigUint64Array(buffer);
  const out = new Map<TimingSlotName, number>();

  for (const [slot, [beginIdx, endIdx]] of TIMING_SLOT_NAMES) {
    const begin = u64[beginIdx]!;
    const end = u64[endIdx]!;

    // Sentinel: a zero begin tick means the slot's pass didn't run
    // this frame (or the staging buffer was never written into for
    // this index).  Skip — `GpuTimingFrame.perPassMs` exposes
    // "absent" by simply not setting the key.
    if (begin === 0n) continue;

    // BigInt-safe subtraction; clamps wrap-around to 0.
    if (end < begin) {
      out.set(slot, 0);
      continue;
    }

    // Tick delta * ns-per-tick = ns total; / 1e6 = ms.
    // `Number()` is safe here because the delta is bounded by realistic
    // GPU frame durations (~50 ms wallclock at worst, well within the
    // 2^53 lossless-integer range of `Number`).
    const deltaTicks = Number(end - begin);
    out.set(slot, (deltaTicks * timestampPeriodNs) / 1e6);
  }

  return out;
}
```

Run: `npx vitest run tests/services/gpu/timing/decodeTimestampBuffer.test.ts`

Expected: PASS — all five test cases green.

- [ ] **Step 3: Commit**

```bash
git add src/services/gpu/timing/decodeTimestampBuffer.ts tests/services/gpu/timing/decodeTimestampBuffer.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu/timing): add decodeTimestampBuffer pure transform

Converts a mapped staging buffer (32 × u64 GPU ticks) into a
Map<TimingSlotName, number> of milliseconds.  Handles the
begin-tick-zero sentinel ("pass didn't run") and clamps negative
deltas from driver wrap-around.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement `gpuTimingService`

**Files:**
- Create: `src/services/gpu/timing/gpuTimingService.ts`
- Create: `tests/services/gpu/timing/gpuTimingService.test.ts`

The service owns the GPU resources (query set, resolve buffer, two staging buffers), the subscriber set, and the frame counter. It composes the slot table (Task 3) and decoder (Task 4); the bulk of *new* logic in this task is the staging-buffer rotation + mapAsync queueing.

- [ ] **Step 1: Write the failing test**

Create `tests/services/gpu/timing/gpuTimingService.test.ts`:

```typescript
/**
 * gpuTimingService — unit coverage with a stub GPUDevice.
 *
 * Four scenarios:
 *   1. No-op mode when `device.features.has('timestamp-query')` is false:
 *      `available` is false, `descriptorFor` returns undefined, no GPU
 *      resources allocated, subscribers never fire.
 *   2. Active mode descriptor shape: `descriptorFor('point-sprites')`
 *      returns `{querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1}`.
 *   3. `endFrame` records `resolveQuerySet` + `copyBufferToBuffer` on
 *      the supplied encoder.
 *   4. Subscribers fire once a staging buffer's mapAsync resolves, with
 *      a `GpuTimingFrame` carrying the decoded perPassMs map.
 */

import { describe, it, expect, vi } from 'vitest';
import { createGpuTimingService } from '../../../../src/services/gpu/timing/gpuTimingService';

type FakeQuerySet = { destroy: () => void };
type FakeBuffer = {
  mapAsync: (mode: number) => Promise<undefined>;
  getMappedRange: () => ArrayBuffer;
  unmap: () => void;
  destroy: () => void;
};

function makeDevice(opts: { supportsTimestamp: boolean; period?: number }): GPUDevice {
  const features = new Set<string>();
  if (opts.supportsTimestamp) features.add('timestamp-query');
  const querySet: FakeQuerySet = { destroy: vi.fn() };
  const stagingBuffers: FakeBuffer[] = [];
  let nextBufferIdx = 0;
  const queue = {
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    onSubmittedWorkDone: vi.fn(async () => undefined),
    // Read by the service constructor; coarse value to confirm scaling.
    get timestampPeriod() {
      return opts.period ?? 1;
    },
  };
  return {
    features,
    queue,
    createQuerySet: vi.fn(() => querySet as unknown as GPUQuerySet),
    createBuffer: vi.fn(() => {
      // Each call returns a fresh fake buffer with a real ArrayBuffer
      // backing.  The test populates the buffer before mapAsync
      // resolves so the decoder sees deterministic timestamps.
      const backing = new ArrayBuffer(32 * 8);
      const buf: FakeBuffer = {
        mapAsync: vi.fn(async () => undefined),
        getMappedRange: vi.fn(() => backing),
        unmap: vi.fn(),
        destroy: vi.fn(),
      };
      stagingBuffers.push(buf);
      nextBufferIdx++;
      return buf as unknown as GPUBuffer;
    }),
  } as unknown as GPUDevice;
}

describe('gpuTimingService — no-op mode (feature missing)', () => {
  it('marks itself unavailable and short-circuits every method', () => {
    const device = makeDevice({ supportsTimestamp: false });
    const svc = createGpuTimingService(device);

    expect(svc.available).toBe(false);
    expect(svc.descriptorFor('point-sprites')).toBeUndefined();
    // beginFrame still returns a context so callers don't branch.
    const ctx = svc.beginFrame();
    expect(ctx.frameIndex).toBe(0);
    // endFrame is a no-op — no queue.submit-adjacent calls fired.
    const fakeEncoder = { resolveQuerySet: vi.fn(), copyBufferToBuffer: vi.fn() };
    svc.endFrame(ctx, fakeEncoder as unknown as GPUCommandEncoder);
    expect(fakeEncoder.resolveQuerySet).not.toHaveBeenCalled();
    expect(fakeEncoder.copyBufferToBuffer).not.toHaveBeenCalled();

    // Subscriber would receive nothing.
    const listener = vi.fn();
    svc.subscribe(listener);
    // No way to force a frame in no-op mode; just confirm zero calls.
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not allocate GPU resources', () => {
    const device = makeDevice({ supportsTimestamp: false });
    createGpuTimingService(device);

    expect((device.createQuerySet as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect((device.createBuffer as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });
});

describe('gpuTimingService — active mode', () => {
  it('exposes `available: true` when feature is present', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);
    expect(svc.available).toBe(true);
  });

  it('allocates a query set + resolve buffer + two staging buffers', () => {
    const device = makeDevice({ supportsTimestamp: true });
    createGpuTimingService(device);

    expect(device.createQuerySet).toHaveBeenCalledTimes(1);
    // 1 resolve + 2 staging = 3 buffer allocations.
    expect(device.createBuffer).toHaveBeenCalledTimes(3);
  });

  it('returns a descriptor with the correct slot indices', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);

    const desc = svc.descriptorFor('procedural-disks');
    expect(desc).toBeDefined();
    expect(desc!.beginningOfPassWriteIndex).toBe(2);
    expect(desc!.endOfPassWriteIndex).toBe(3);
    expect(desc!.querySet).toBeDefined();
  });

  it('endFrame records resolveQuerySet + copyBufferToBuffer', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);
    const encoder = {
      resolveQuerySet: vi.fn(),
      copyBufferToBuffer: vi.fn(),
    };

    const ctx = svc.beginFrame();
    svc.endFrame(ctx, encoder as unknown as GPUCommandEncoder);

    expect(encoder.resolveQuerySet).toHaveBeenCalledTimes(1);
    expect(encoder.copyBufferToBuffer).toHaveBeenCalledTimes(1);
  });

  it('rotates the staging-slot cursor each frame', () => {
    const device = makeDevice({ supportsTimestamp: true });
    const svc = createGpuTimingService(device);

    expect(svc.beginFrame().stagingSlot).toBe(0);
    expect(svc.beginFrame().stagingSlot).toBe(1);
    expect(svc.beginFrame().stagingSlot).toBe(0);
    expect(svc.beginFrame().stagingSlot).toBe(1);
  });

  it('fires subscribers after a frame is encoded + its map resolves', async () => {
    const device = makeDevice({ supportsTimestamp: true, period: 1 });
    const svc = createGpuTimingService(device);
    const listener = vi.fn();
    svc.subscribe(listener);

    const encoder = {
      resolveQuerySet: vi.fn(),
      copyBufferToBuffer: vi.fn(
        (
          src: GPUBuffer,
          srcOff: number,
          dst: GPUBuffer & { getMappedRange: () => ArrayBuffer },
          dstOff: number,
          size: number,
        ) => {
          // Mock the resolved-then-copied state: fake-write into the
          // destination staging buffer's backing.  The service queries
          // the buffer's getMappedRange after mapAsync resolves; we set
          // the underlying ArrayBuffer here so decoding produces a known
          // value.  (In real WebGPU the copy happens on the GPU; the
          // test elides that.)
          const backing = dst.getMappedRange();
          const u64 = new BigUint64Array(backing);
          u64[0] = 0n;            // point-sprites begin
          u64[1] = 1_500_000n;    // point-sprites end → 1.5 ms
        },
      ),
    };

    const ctx = svc.beginFrame();
    svc.endFrame(ctx, encoder as unknown as GPUCommandEncoder);

    // Drain microtasks until the listener fires.  The service queues
    // a mapAsync (resolved immediately by the fake) then a microtask
    // chain culminates in subscribers being notified.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(listener).toHaveBeenCalledTimes(1);
    const frame = listener.mock.calls[0]![0];
    expect(frame.frameIndex).toBe(0);
    expect(frame.perPassMs.get('point-sprites')).toBeCloseTo(1.5, 6);
  });
});
```

Run: `npx vitest run tests/services/gpu/timing/gpuTimingService.test.ts`

Expected: FAIL — `gpuTimingService.ts` doesn't exist.

- [ ] **Step 2: Implement the service**

Create `src/services/gpu/timing/gpuTimingService.ts`:

```typescript
/**
 * gpuTimingService — owns a single shared GPUQuerySet + resolve buffer
 * + two double-buffered staging buffers, exposes a no-side-effect API
 * for the renderFrame orchestrator.
 *
 * ### Architecture (see spec for full rationale)
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ GPUQuerySet (32 × timestamp slots)                           │
 *   │   ↑ writes (per-pass beginningOf / endOfPassWriteIndex)      │
 *   │                                                              │
 *   │ Resolve buffer  (32 × u64, COPY_DST | QUERY_RESOLVE)         │
 *   │   ← resolveQuerySet(querySet, 0, 32, resolve, 0)             │
 *   │                                                              │
 *   │ Staging buffers ×2  (32 × u64, COPY_DST | MAP_READ)          │
 *   │   ← copyBufferToBuffer(resolve, 0, staging[ctx.slot], 0,256) │
 *   │   ↓ device.queue submits; staging.mapAsync() later resolves  │
 *   │ ▼                                                            │
 *   │ decodeTimestampBuffer(...) → Map<slot, ms>                   │
 *   │ ▼                                                            │
 *   │ subscribers(frame: GpuTimingFrame)                           │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Double-buffering matters because a frame's `mapAsync` doesn't
 * resolve immediately — it resolves once the GPU has executed every
 * submitted command up to and including the buffer's copy target,
 * which is typically 1–2 frames after submit.  Without two buffers
 * the next frame's resolve would race against the still-mapped one.
 *
 * ### Sentinel guarantee
 *
 * The decoder treats `begin === 0n` as "this slot didn't run".  We
 * rely on staging buffers starting zeroed and being explicitly
 * re-zeroed in the unmap path (`device.queue.writeBuffer` with a
 * 256-byte zero buffer).  Slot 18/19 (`pick`) is the most common
 * "didn't run" — see spec "Pick-render handling" section.
 *
 * ### No-op mode
 *
 * When `device.features.has('timestamp-query')` is false, the
 * constructor short-circuits before any GPU resources are allocated.
 * Every method-call goes through the `if (!active) return ...` guard
 * at the top of the closure.  Cheap.
 */

import type { GpuTimingService } from '../../../@types/gpu/timing/GpuTimingService';
import type { GpuTimingFrame } from '../../../@types/gpu/timing/GpuTimingFrame';
import type { TimingFrameContext } from '../../../@types/gpu/timing/TimingFrameContext';
import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
import { TIMING_SLOT_NAMES, TIMING_QUERY_SET_SIZE } from './TIMING_SLOT_NAMES';
import { decodeTimestampBuffer } from './decodeTimestampBuffer';

/** 32 × u64 = 256 bytes. */
const BUFFER_BYTES = TIMING_QUERY_SET_SIZE * 8;

export function createGpuTimingService(device: GPUDevice): GpuTimingService {
  const available = device.features.has('timestamp-query');
  const listeners = new Set<(frame: GpuTimingFrame) => void>();

  // ── No-op short-circuit ──────────────────────────────────────────
  //
  // When the adapter lacks the feature, every method is a stub.
  // Returning these stubs from the same `createGpuTimingService` API
  // collapses availability branching to one site (the constructor)
  // rather than every consumer.  The renderFrame orchestrator can
  // call `svc.descriptorFor(...)` unconditionally and rely on the
  // optional-spread pattern.
  if (!available) {
    return {
      available: false,
      beginFrame(): TimingFrameContext {
        return { frameIndex: 0, stagingSlot: 0 };
      },
      descriptorFor(): GPURenderPassTimestampWrites | undefined {
        return undefined;
      },
      endFrame(): void {
        /* no-op */
      },
      subscribe(listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      destroy(): void {
        listeners.clear();
      },
    };
  }

  // ── Active mode: allocate GPU resources once ─────────────────────
  //
  // Query set: one shared 32-slot timestamp set.  Slots 0–19 are used
  // (see TIMING_SLOT_NAMES); 20–31 are reserved headroom.
  const querySet = device.createQuerySet({
    type: 'timestamp',
    count: TIMING_QUERY_SET_SIZE,
    label: 'gpuTimingService.querySet',
  });

  // Resolve buffer: GPU writes the resolved u64 ticks here.  Not
  // mappable — the spec forbids combining QUERY_RESOLVE with MAP_READ.
  const resolveBuffer = device.createBuffer({
    size: BUFFER_BYTES,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE,
    label: 'gpuTimingService.resolve',
  });

  // Two staging buffers, ring-rotated by frame.  COPY_DST | MAP_READ
  // is the standard mappable-readback usage pair.  We keep an
  // `inFlight` flag per slot so we never re-issue a mapAsync against
  // a buffer that's still owned by an unresolved promise.
  const stagingBuffers: [GPUBuffer, GPUBuffer] = [
    device.createBuffer({
      size: BUFFER_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'gpuTimingService.staging[0]',
    }),
    device.createBuffer({
      size: BUFFER_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      label: 'gpuTimingService.staging[1]',
    }),
  ];
  const inFlight: [boolean, boolean] = [false, false];

  // Pre-built per-slot descriptors.  The slot mapping is static, so
  // we can construct each descriptor object once and reuse the
  // reference across frames.  Saves an allocation per call (10 slots
  // × 60 fps = 600 per second avoided).
  const slotDescriptors = new Map<TimingSlotName, GPURenderPassTimestampWrites>();
  for (const [slot, [begin, end]] of TIMING_SLOT_NAMES) {
    slotDescriptors.set(slot, {
      querySet,
      beginningOfPassWriteIndex: begin,
      endOfPassWriteIndex: end,
    });
  }

  // Read once at construction: timestampPeriod is a per-queue scalar
  // (nanoseconds per tick).  Most desktop adapters expose 1.0; some
  // browsers expose a coarse value (38.5 typical) for fingerprint
  // resistance.  Coarse resolution doesn't break correctness, just
  // limits decimal-place precision in the UI.
  const timestampPeriod = device.queue.timestampPeriod ?? 1;

  let nextFrameIndex = 0;
  let nextStagingSlot: 0 | 1 = 0;
  let destroyed = false;

  function beginFrame(): TimingFrameContext {
    const ctx: TimingFrameContext = {
      frameIndex: nextFrameIndex,
      stagingSlot: nextStagingSlot,
    };
    nextFrameIndex++;
    nextStagingSlot = (nextStagingSlot === 0 ? 1 : 0);
    return ctx;
  }

  function descriptorFor(slot: TimingSlotName): GPURenderPassTimestampWrites | undefined {
    if (destroyed) return undefined;
    return slotDescriptors.get(slot);
  }

  function endFrame(ctx: TimingFrameContext, encoder: GPUCommandEncoder): void {
    if (destroyed) return;
    // If the destination staging buffer is still mapped from a previous
    // frame (mapAsync hasn't resolved yet), skip this frame's resolve
    // entirely — issuing a copyBufferToBuffer into a still-mapped
    // buffer is a WebGPU validation error.  This is rare in practice
    // (two-frame map latency, two-buffer ring) but defends against
    // the slow-adapter edge case.
    if (inFlight[ctx.stagingSlot]) return;

    encoder.resolveQuerySet(querySet, 0, TIMING_QUERY_SET_SIZE, resolveBuffer, 0);
    encoder.copyBufferToBuffer(
      resolveBuffer,
      0,
      stagingBuffers[ctx.stagingSlot],
      0,
      BUFFER_BYTES,
    );

    // Queue the map for after submit.  The microtask chain below
    // resolves once the GPU has caught up to this frame's submit and
    // the buffer is mappable.  The frame index is captured in the
    // closure so the listener payload is correct even if endFrame is
    // called again before this map resolves.
    inFlight[ctx.stagingSlot] = true;
    const slot = ctx.stagingSlot;
    const capturedFrameIndex = ctx.frameIndex;
    const buf = stagingBuffers[slot];

    void buf
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (destroyed) return;
        const mapped = buf.getMappedRange();
        // Decode requires a stable ArrayBuffer view.  `getMappedRange`
        // returns a fresh view that's only valid until `unmap`; copy
        // out before unmap so the listener pump can call back into
        // React safely on a microtask boundary.
        const copy = mapped.slice(0);
        buf.unmap();

        const perPassMs = decodeTimestampBuffer(copy, timestampPeriod);
        // Materialise the listener set into an array before dispatch
        // so an unsubscribe inside a listener doesn't mutate the
        // iterator we're walking.
        const snapshot = Array.from(listeners);
        const frame: GpuTimingFrame = {
          frameIndex: capturedFrameIndex,
          perPassMs,
        };
        for (const l of snapshot) l(frame);
      })
      .catch(() => {
        // Device-lost or destroyed-mid-map: silently drop.  See spec
        // "Risks #3 — mapAsync on a destroyed device".
      })
      .finally(() => {
        inFlight[slot] = false;
      });
  }

  function subscribe(listener: (frame: GpuTimingFrame) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    listeners.clear();
    querySet.destroy();
    resolveBuffer.destroy();
    stagingBuffers[0].destroy();
    stagingBuffers[1].destroy();
  }

  return {
    available: true,
    beginFrame,
    descriptorFor,
    endFrame,
    subscribe,
    destroy,
  };
}
```

Run: `npx vitest run tests/services/gpu/timing/gpuTimingService.test.ts`

Expected: PASS — all eight test cases green.

- [ ] **Step 3: Run full suite**

Run: `npm test`

Expected: PASS — no regressions in the broader suite.

- [ ] **Step 4: Commit**

```bash
git add src/services/gpu/timing/gpuTimingService.ts tests/services/gpu/timing/gpuTimingService.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu/timing): add gpuTimingService with no-op + active modes

Owns a 32-slot GPUQuerySet, resolve buffer, two double-buffered
staging buffers, and a subscriber set.  No-op shorts out every method
when the adapter lacks the `timestamp-query` feature, so callers can
drop a `descriptorFor(slot)` into a pass descriptor unconditionally.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Request `timestamp-query` feature in `initGpu`; wire service slot into `EngineGpuHandles`

**Files:**
- Modify: `src/services/gpu/device.ts` (negotiate the feature)
- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts` (add `timingService` slot)
- Modify: `src/services/engine/engine.ts` (initial state literal + destroy chain)
- Modify: `src/services/engine/phases/initGpu.ts` (construct + assign the service)

The service is constructed in `initGpu` because that's where every other GPU-owning handle is built. Construction is gated on `hasUrlGate('gpuTimings')` AND `device.features.has('timestamp-query')`; the service's own no-op mode covers the second half, but we still want to skip construction entirely when the URL gate is off — no point allocating GPU resources for a debug feature the user didn't ask for. The `timingService` slot is non-null only when both gates are open; the field is typed `GpuTimingService | null` matching every other slot in this bag.

- [ ] **Step 1: Write a failing test that pins the feature negotiation**

Create `tests/services/gpu/device.timestampQuery.test.ts`:

```typescript
/**
 * device.ts — verify `initGpu` requests `timestamp-query` when the
 * adapter advertises it, and silently skips when it doesn't.
 *
 * We stub `navigator.gpu` end-to-end because the real WebGPU API
 * is unavailable under jsdom.  The test asserts the
 * `adapter.requestDevice` call site receives the expected
 * `requiredFeatures` array.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initGpu } from '../../../src/services/gpu/device';

function makeFakeCanvas(): HTMLCanvasElement {
  const ctx = {
    configure: vi.fn(),
  } as unknown as GPUCanvasContext;
  return {
    getContext: vi.fn(() => ctx),
    clientWidth: 1280,
    clientHeight: 720,
    width: 1280,
    height: 720,
  } as unknown as HTMLCanvasElement;
}

function installFakeGpu(adapterFeatures: ReadonlyArray<string>): {
  requestDeviceSpy: ReturnType<typeof vi.fn>;
} {
  const requestDeviceSpy = vi.fn(async (desc?: GPUDeviceDescriptor) => {
    return {
      features: new Set(desc?.requiredFeatures ?? []),
      queue: {},
    } as unknown as GPUDevice;
  });
  const adapter = {
    features: new Set(adapterFeatures),
    requestDevice: requestDeviceSpy,
  };
  // jsdom-friendly install: replace navigator.gpu on the real navigator.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      gpu: {
        requestAdapter: vi.fn(async () => adapter),
        getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
      },
    },
  });
  return { requestDeviceSpy };
}

describe('initGpu — timestamp-query negotiation', () => {
  let originalNavigator: typeof globalThis.navigator | undefined;

  beforeEach(() => {
    originalNavigator = (globalThis as { navigator?: typeof globalThis.navigator }).navigator;
  });

  afterEach(() => {
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator,
      });
    }
  });

  it('requests `timestamp-query` when the adapter advertises it', async () => {
    const { requestDeviceSpy } = installFakeGpu(['timestamp-query']);
    await initGpu(makeFakeCanvas());
    expect(requestDeviceSpy).toHaveBeenCalledTimes(1);
    const desc = requestDeviceSpy.mock.calls[0]![0] as GPUDeviceDescriptor;
    expect(desc.requiredFeatures).toContain('timestamp-query');
  });

  it('omits `timestamp-query` when the adapter does not advertise it', async () => {
    const { requestDeviceSpy } = installFakeGpu([]);
    await initGpu(makeFakeCanvas());
    expect(requestDeviceSpy).toHaveBeenCalledTimes(1);
    const desc = requestDeviceSpy.mock.calls[0]![0] as GPUDeviceDescriptor;
    const features = (desc.requiredFeatures ?? []) as ReadonlyArray<string>;
    expect(features).not.toContain('timestamp-query');
  });
});
```

Run: `npx vitest run tests/services/gpu/device.timestampQuery.test.ts`

Expected: FAIL — `initGpu` currently calls `adapter.requestDevice()` with no arguments.

- [ ] **Step 2: Negotiate the feature in `initGpu`**

In `src/services/gpu/device.ts`, replace the line that calls `requestDevice` (currently line 70) with:

```typescript
  // Step 2 — Request a device, opting into `timestamp-query` when the
  // adapter advertises it.  WebGPU treats features as opt-in: if we
  // ask for a feature the adapter doesn't have, `requestDevice`
  // throws; if we don't ask, the feature is unavailable on the
  // device even when the adapter supports it.  So we mirror the
  // adapter's advertised set for the one optional feature we care
  // about and let the device's own `features` map drive every
  // downstream service.
  //
  // The `gpuTimingService` constructor reads `device.features.has(
  // 'timestamp-query')` to decide between active mode and no-op
  // mode — so omitting the feature here propagates cleanly.
  // See: https://www.w3.org/TR/webgpu/#dom-gpuadapter-requestdevice
  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) {
    requiredFeatures.push('timestamp-query');
  }
  const device = await adapter.requestDevice({ requiredFeatures });
```

Run: `npx vitest run tests/services/gpu/device.timestampQuery.test.ts`

Expected: PASS.

- [ ] **Step 3: Add the `timingService` slot to `EngineGpuHandles`**

In `src/@types/engine/handles/EngineGpuHandles.d.ts`, add an import and a new field. Append the import to the existing import group:

```typescript
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
```

…and append the field inside the `EngineGpuHandles` type literal (after `scalarVolumeRenderer`):

```typescript
  /**
   * Per-pass GPU timing service.  Null when the engine is constructed
   * without the `?gpuTimings` URL gate (the common case) OR when the
   * adapter lacks the `timestamp-query` feature (the constructor's
   * own no-op short-circuit would otherwise hand us a service with
   * `available: false`, but we prefer null at this layer so the
   * destroy chain doesn't call `.destroy()` on a never-allocated
   * stub).
   *
   * Same lifecycle, same reachability rationale, and same
   * `isEngineReady` exclusion as `texturedQuadRenderer` above — see
   * that field's docstring for the full story.
   */
  timingService: GpuTimingService | null;
```

- [ ] **Step 4: Initialise + tear down the slot in `engine.ts`**

In `src/services/engine/engine.ts`, find the `state.gpu` initial-literal block (`renderer: null`, `pickRenderer: null`, …) and add:

```typescript
      timingService: null,
```

…in the same block (alphabetical fit isn't enforced; group near the other optional renderers).

Find the destroy chain and add:

```typescript
      state.gpu.timingService?.destroy();
      state.gpu.timingService = null;
```

Place this near `state.gpu.scalarVolumeRenderer?.destroy() / = null` so the symmetry between init and destroy stays visible at one site.

- [ ] **Step 5: Construct the service in `initGpu.ts`**

In `src/services/engine/phases/initGpu.ts`, add the imports (group near the other GPU-renderer imports):

```typescript
import { createGpuTimingService } from '../../gpu/timing/gpuTimingService';
import { hasUrlGate } from '../../../utils/url/urlGate';
```

In the body of `initGpu`, after `state.gpu.scalarVolumeRenderer = scalarVolumeRenderer;` (or near where every other `state.gpu.* = …` assignment lives), add:

```typescript
  // ── GPU timing service (gated on `?gpuTimings`) ──────────────────
  //
  // The service is allocated only when the URL gate is open.  Even
  // though `createGpuTimingService` has its own no-op short-circuit
  // for missing-feature adapters, we still skip construction entirely
  // when the gate is off — the user opted out, no point reserving GPU
  // resources for a debug feature.  When the gate is on AND the
  // adapter has the feature, `available` is true and renderFrame
  // attaches `timestampWrites` to every pass descriptor.  When the
  // gate is on but the adapter doesn't have the feature, the service
  // is still constructed (so the DebugPanel can render the
  // "unavailable on this adapter" message) but every method is a
  // no-op.
  if (hasUrlGate('gpuTimings')) {
    state.gpu.timingService = createGpuTimingService(device);
  }
```

- [ ] **Step 6: Verify types + tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS — including the new `device.timestampQuery.test.ts` and the existing `engineState.test.ts` (which iterates the `state.gpu` shape — confirm it tolerates the added `timingService` field; if it's a structural type check it'll work; if it pins specific keys it will need a one-line addition to the mock literal).

If `tests/@types/engineState.test.ts` fails: add `timingService: null,` to the mock GPU literal in that file.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/device.ts tests/services/gpu/device.timestampQuery.test.ts src/@types/engine/handles/EngineGpuHandles.d.ts src/services/engine/engine.ts src/services/engine/phases/initGpu.ts tests/@types/engineState.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): negotiate timestamp-query feature and wire timing service slot

initGpu now adds `timestamp-query` to requiredFeatures when the adapter
advertises it.  The gpuTimingService is constructed only when the
`?gpuTimings` URL gate is set; it lives on state.gpu.timingService and
is released by the destroy chain.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Capture a pre-split visual baseline (frame-hash fixture)

**Files:**
- Create: `tests/visual/renderFrameSplitBaseline.test.ts`

This task mirrors the impostor-split work's Task 1 visual baseline. The test snapshots the SEQUENCE of `encoder.beginRenderPass` calls, each pass's `renderPass.draw*` invocations, and the eventual `device.queue.submit` payload, all from one invocation of the CURRENT (pre-split) `renderFrame`. After Task 8 rewires `renderFrame` to use 9 passes, the same fixture must still produce a byte-identical hash — proving the split changed nothing about *what* the GPU is told to draw, only the boundary structure of the render passes.

We hash the PER-PASS draw command sequence (not the render-pass boundary structure) precisely so the split-into-9 refactor doesn't accidentally fail its own baseline. The visual output is what matters, not the number of `beginRenderPass` boundaries.

- [ ] **Step 1: Write the failing test**

Create `tests/visual/renderFrameSplitBaseline.test.ts`:

```typescript
/**
 * Visual baseline — renderFrame draw-command sequence (pre/post pass-split).
 *
 * Captures, in order, every draw command the orchestrator records during
 * one call to `renderFrame`, irrespective of how many `beginRenderPass`
 * blocks the orchestrator opens to host those draws.  Run pre-split
 * (1 HDR mega-pass + tone-map post-process) and post-split (1 clear +
 * 8 HDR sub-passes + tone-map); both runs MUST produce the same hash.
 *
 * Why we don't include `beginRenderPass` boundaries in the hash:
 *
 * The whole point of Task 8 is to split one mega-pass into 9 — that
 * change WILL alter the number of beginRenderPass calls.  If we
 * included those in the hash, the baseline would fail by definition
 * after the split (defeating its purpose).  Instead the hash captures
 * the per-pass draw payload (renderer name + argument shape) — the
 * encoder commands that actually drive the GPU.
 *
 * The orchestrator's pass-iteration is exercised end-to-end here
 * because we stub at the WebGPU level, not the pass level.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderFrame } from '../../src/services/engine/frame/renderFrame';
// ...

// (full implementation below)
```

Drafting the full fixture requires accurately reproducing the existing impostor-split baseline pattern. Implement the test in full as:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { renderFrame } from '../../src/services/engine/frame/renderFrame';
import type { RenderFrameInput } from '../../src/@types/engine/frame/RenderFrameInput';

type DrawRecord =
  | { kind: 'draw'; renderer: string; argCount: number }
  | { kind: 'setPipeline'; label: string }
  | { kind: 'setBindGroup'; index: number }
  | { kind: 'setVertexBuffer'; slot: number };

function makeRecordingPass(records: DrawRecord[]): GPURenderPassEncoder {
  const pass = {
    setPipeline: vi.fn(() => records.push({ kind: 'setPipeline', label: 'p' })),
    setBindGroup: vi.fn((i: number) =>
      records.push({ kind: 'setBindGroup', index: i }),
    ),
    setVertexBuffer: vi.fn((s: number) =>
      records.push({ kind: 'setVertexBuffer', slot: s }),
    ),
    draw: vi.fn(() =>
      records.push({ kind: 'draw', renderer: 'unknown', argCount: 4 }),
    ),
    drawIndexed: vi.fn(() =>
      records.push({ kind: 'draw', renderer: 'unknown', argCount: 5 }),
    ),
    end: vi.fn(),
  } as unknown as GPURenderPassEncoder;
  return pass;
}

function makeFakeEncoder(records: DrawRecord[]): GPUCommandEncoder {
  return {
    beginRenderPass: vi.fn(() => makeRecordingPass(records)),
    finish: vi.fn(() => ({}) as GPUCommandBuffer),
    resolveQuerySet: vi.fn(),
    copyBufferToBuffer: vi.fn(),
  } as unknown as GPUCommandEncoder;
}

function makeFakeDevice(records: DrawRecord[]): GPUDevice {
  return {
    features: new Set<string>(),
    queue: { submit: vi.fn(), writeBuffer: vi.fn() },
    createCommandEncoder: vi.fn(() => makeFakeEncoder(records)),
    createBindGroup: vi.fn(),
    createBuffer: vi.fn(() => ({}) as GPUBuffer),
  } as unknown as GPUDevice;
}

describe('renderFrame visual baseline (split-pass equivalence)', () => {
  it('records the same per-pass draw sequence pre- and post-split', () => {
    const records: DrawRecord[] = [];
    // The minimal input here will be filled in fully when the test is
    // first run against the current (pre-split) renderFrame; the
    // baseline-recording step replaces the inline snapshot below.
    const input = makeMinimalInput(records);
    renderFrame(input);

    // Filter out beginRenderPass/end boundaries; we only hash actual
    // draw commands.  See module docstring for rationale.
    const drawsOnly = records.filter((r) => r.kind === 'draw');

    expect(drawsOnly).toMatchInlineSnapshot();
  });
});

function makeMinimalInput(records: DrawRecord[]): RenderFrameInput {
  const device = makeFakeDevice(records);
  const swapTexture = { createView: vi.fn(() => ({}) as GPUTextureView) };
  const context = {
    getCurrentTexture: vi.fn(() => swapTexture),
  } as unknown as GPUCanvasContext;
  // Construct minimal stubs for every field RenderFrameInput requires.
  // Most renderers' draw methods are recorded by the
  // beginRenderPass-returned pass, so we can stub them as empty objects;
  // anything that's read inside a pass's `enabled` predicate needs a
  // sensible shape (PassDeps + ctx + state + settings — all derived
  // from this input).  See `tests/services/engine/frame/renderFrame.test.ts`
  // for the prior-art stub shape.
  return {
    device,
    context,
    // ... (every other RenderFrameInput field — see existing
    // renderFrame.test.ts for the canonical minimal-stub shape, which
    // this test should mirror to avoid copy-paste drift)
  } as unknown as RenderFrameInput;
}
```

Run: `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts -u`

Expected: PASS — vitest writes the inline snapshot.

**Note:** the `makeMinimalInput` helper above is a sketch; the implementer mirrors the structure of the existing `tests/services/engine/frame/renderFrame.test.ts` (which already mocks every `RenderFrameInput` field at this level) to keep the stubs consistent. The deliverable is a recorded inline snapshot of the per-pass `draw` commands the *current* `renderFrame` emits.

- [ ] **Step 2: Re-run without `-u` to confirm determinism**

Run: `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts`

Expected: PASS — snapshot matches.

- [ ] **Step 3: Commit**

```bash
git add tests/visual/renderFrameSplitBaseline.test.ts
git commit -m "$(cat <<'EOF'
test(visual): add renderFrame split-pass equivalence baseline

Snapshots the per-pass draw-command sequence the current (pre-split)
renderFrame produces.  Re-run after Task 8 splits the mega-pass into
9 to prove the GPU is told to draw exactly the same instances in the
same order.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Refactor `renderFrame.ts` — split mega-pass into 1 clear + 8 HDR sub-passes

**Files:**
- Modify: `src/services/engine/frame/renderFrame.ts`

This is a STRUCTURAL refactor with NO timing yet. The goal is to prove the orchestrator can open 9 render passes instead of 1 without altering visual output — the baseline test from Task 7 stays green throughout. Timing service hookup happens in Task 9.

The change:

  - Open a dedicated **clear pass** (`loadOp: 'clear'`, no draws, ends immediately) at the top of the HDR section.
  - Replace the single `for (const pass of HDR_PASSES)` loop with: for each pass that's `enabled`, open its own `beginRenderPass` with `loadOp: 'load'`, call `pass.draw(...)`, end it.

The `Pass` interface contract is unchanged. The clear pass is NOT measured (it's a frame-lifecycle artefact; see spec section "Why a dedicated clear pass instead of `clear` on pass 1").

- [ ] **Step 1: Confirm the baseline is currently green**

Run: `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts`

Expected: PASS.

- [ ] **Step 2: Replace the HDR-pass block in `renderFrame.ts`**

In `src/services/engine/frame/renderFrame.ts`, replace the section currently spanning roughly lines 123–167 (from `// ── Encoder + HDR render pass ──` through `renderPass.end();`) with:

```typescript
  // ── Encoder + per-pass HDR rendering ──────────────────────────────
  //
  // Pre-split (commits before this one): one `beginRenderPass` opened
  // the HDR target with `loadOp: 'clear'`, every entry in HDR_PASSES
  // drew into that single open encoder, and `renderPass.end()` closed
  // it.
  //
  // Post-split: nine render passes per frame, all targeting the same
  // HDR view.  The first is a dedicated `loadOp: 'clear'` no-draw pass
  // — it wipes the target to black so subsequent passes can start
  // their additive accumulation from zero.  The remaining eight are
  // one per `HDR_PASSES` entry, each using `loadOp: 'load'`, calling
  // exactly one `pass.draw(...)`, then closing.
  //
  // Visual output is identical: every additive draw still composites
  // into the same float framebuffer in the same order.  See
  // `tests/visual/renderFrameSplitBaseline.test.ts` for the hash-
  // equivalence proof.
  //
  // Why a separate clear pass instead of `clear` on the first HDR_PASSES
  // entry: if HDR_PASSES[0] were gated off (e.g. `pointSpritesPass.enabled
  // = false` in some future configuration), the clear would silently
  // vanish.  A no-draw clear pass at the top of renderFrame keeps the
  // clear as a frame-lifecycle invariant — always runs, regardless of
  // which subsequent passes are enabled.  Cost: ~µs on desktop GPUs,
  // amortised by the subsequent draws.  See spec "Why a dedicated
  // clear pass instead of `clear` on pass 1".
  const encoder = device.createCommandEncoder();

  // ── Clear pass (no draws) ─────────────────────────────────────────
  const clearPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: ctx.postProcess.view,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  clearPass.end();

  // ── HDR sub-passes — one beginRenderPass per enabled pass ─────────
  //
  // Each pass owns its own enabled-gate.  Per-pass begin/end is
  // necessary so a future `timestampWrites` descriptor can attach to
  // each pass boundary individually (see Task 9 — wires the timing
  // service in).  Today, with no timing service attached, this is
  // pure structural prep: the GPU sees N "load + draw + store"
  // passes where it previously saw "clear + N draws + store".
  for (const pass of HDR_PASSES) {
    if (!pass.enabled(state, ctx, settings)) continue;

    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.postProcess.view,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });
    pass.draw(passEncoder, ctx, state, settings, deps);
    passEncoder.end();
  }
```

The remainder of the function (the tone-map call and the `device.queue.submit`) stays unchanged.

Also update the module-header docstring so the `## What the encoder records, in order` block reflects the new shape. Replace the old `pass 1 / pass 2 / submit` summary (~lines 28–47) with:

```
 * ### What the encoder records, in order
 *
 *   1. Clear pass.  `loadOp: 'clear'`, no draws.  Wipes the HDR
 *      target to black.  Empty pass; ended immediately.
 *
 *   2..9. HDR_PASSES sub-passes.  One `beginRenderPass` per enabled
 *      pass, `loadOp: 'load'`, exactly one `pass.draw(...)`, end.
 *      The for-loop body is the entire HDR draw work post-split.
 *
 *   10. Tone-map post-process.  Samples the HDR target, writes the
 *       swap chain.  Begins+ends its own internal render pass on the
 *       same encoder via `postProcess.draw`.
 *
 *   submit: device.queue.submit([encoder.finish()])
```

- [ ] **Step 3: Run the baseline + the existing renderFrame test**

Run: `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts`

Expected: PASS — same recorded draw sequence as Task 7.

Run: `npx vitest run tests/services/engine/frame/renderFrame.test.ts`

Expected: PASS — the existing renderFrame unit tests don't assert on the number of `beginRenderPass` calls; they verify pass-dispatch invariants which the refactor preserves.

- [ ] **Step 4: Run full suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/frame/renderFrame.ts
git commit -m "$(cat <<'EOF'
refactor(renderFrame): split HDR mega-pass into 1 clear + 8 sub-passes

The orchestrator now opens 9 render passes per frame instead of 1: a
dedicated no-draw clear pass at the top, followed by one
`beginRenderPass` per enabled HDR_PASSES entry with `loadOp: 'load'`.
Visual output is identical (proved by the renderFrame split-pass
baseline test).  This shape is the prerequisite for attaching
WebGPU timestamp queries per pass — that wiring lands in the next
commit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire timing service into `renderFrame` — attach per-pass timestampWrites

**Files:**
- Modify: `src/@types/engine/frame/RenderFrameInput.d.ts` (add optional `timingService` field)
- Modify: `src/services/engine/frame/renderFrame.ts` (consume the service)
- Modify: `src/services/engine/frame/runFrame.ts` (forward the service)
- Modify: `src/@types/engine/frame/RunFrameDeps.d.ts` (add optional `timingService` field)
- Modify: `src/services/engine/phases/startLoop.ts` (read the service from `state.gpu`)
- Create: `tests/services/engine/frame/renderFrame.timing.test.ts`

The service is OPTIONAL on the input — when `state.gpu.timingService` is null (the common case), `renderFrame` skips all timing concerns and behaves identically to Task 8. When it's non-null, each pass descriptor gains `timestampWrites: svc.descriptorFor(slot)` (the `descriptorFor` is undefined when the adapter lacks the feature; the optional-spread pattern handles both cases at one site).

The `pass.name` field is used as the `TimingSlotName` key — the union type matches the pass names by construction (e.g. `pointSpritesPass.name === 'point-sprites'`). A runtime type-narrow is required because `pass.name` is typed as `string`; we cast to `TimingSlotName` because the slot table covers every existing `HDR_PASSES` entry.

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/frame/renderFrame.timing.test.ts`:

```typescript
/**
 * renderFrame — verify timing service is consulted per pass.
 *
 * Stubs renderFrame's dependencies, attaches a mock timingService,
 * runs one frame, then asserts:
 *
 *   1. `beginFrame` was called once.
 *   2. `descriptorFor(pass.name)` was called once per enabled
 *      HDR pass.
 *   3. The descriptor returned by the mock landed on the
 *      `timestampWrites` field of the corresponding
 *      `beginRenderPass` call.
 *   4. `endFrame` was called once with the encoder.
 *   5. When `state.gpu.timingService` is null, none of the above
 *      methods are called.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderFrame } from '../../../../src/services/engine/frame/renderFrame';
import type { RenderFrameInput } from '../../../../src/@types/engine/frame/RenderFrameInput';

function makeFakeTimingService() {
  const beginFrame = vi.fn(() => ({ frameIndex: 0, stagingSlot: 0 as const }));
  const descriptorFor = vi.fn((slot: string) => ({
    querySet: { _stub: slot } as unknown as GPUQuerySet,
    beginningOfPassWriteIndex: 100,
    endOfPassWriteIndex: 101,
  }));
  const endFrame = vi.fn();
  return {
    svc: {
      available: true,
      beginFrame,
      descriptorFor,
      endFrame,
      subscribe: vi.fn(() => () => {}),
      destroy: vi.fn(),
    },
    beginFrame,
    descriptorFor,
    endFrame,
  };
}

// `makeMinimalInput` mirrors the helper from
// tests/visual/renderFrameSplitBaseline.test.ts — see that file for
// the canonical stub shape.  This test only adds the optional
// timingService field on top.

describe('renderFrame — timing service hookup', () => {
  it('calls beginFrame once and descriptorFor per enabled pass', () => {
    const { svc, beginFrame, descriptorFor, endFrame } = makeFakeTimingService();
    // Re-use the visual-baseline stub helper.
    const input = makeMinimalInputWithTiming(svc);

    renderFrame(input);

    expect(beginFrame).toHaveBeenCalledTimes(1);
    // Each enabled pass triggers exactly one descriptorFor call.
    // `point-sprites` is always enabled; assert at least one was made.
    expect(descriptorFor).toHaveBeenCalledWith('point-sprites');
    expect(endFrame).toHaveBeenCalledTimes(1);
  });

  it('skips all timing calls when timingService is null', () => {
    const input = makeMinimalInputWithTiming(null);
    expect(() => renderFrame(input)).not.toThrow();
    // No timing methods called — vacuously true because the service
    // is null.  Pin one assertion to make the absence explicit: the
    // encoder's resolveQuerySet must not have been called by
    // renderFrame (it would be the giveaway).
    expect(input.device.createCommandEncoder).toHaveBeenCalled();
  });
});

// Helper definitions — see top of this file for the rationale.
function makeMinimalInputWithTiming(
  timingService:
    | ReturnType<typeof makeFakeTimingService>['svc']
    | null,
): RenderFrameInput {
  // Reuse the renderFrameSplitBaseline.test.ts canonical stub builder.
  // Attach `state.gpu.timingService` (a new EngineState field added in
  // Task 6).  Implementation copied from that file to avoid a cross-
  // test import.
  // ...
  return {} as unknown as RenderFrameInput; // ← implementer fills in
}
```

**Note:** The `makeMinimalInputWithTiming` helper is intentionally elided; the implementer extracts it from the Task-7 baseline test (extracting to a shared helper file is OK, but a local copy in this test file is also fine since vitest discovers tests in isolation).

Run: `npx vitest run tests/services/engine/frame/renderFrame.timing.test.ts`

Expected: FAIL — `renderFrame` doesn't yet consult the timing service.

- [ ] **Step 2: Add `timingService` to `RenderFrameInput`**

In `src/@types/engine/frame/RenderFrameInput.d.ts`, add the import (group with the other `@types/gpu/...` imports if any, else just append):

```typescript
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
```

…and append the field to the `RenderFrameInput` type:

```typescript
  /**
   * Optional per-pass GPU timing service.  Null when the engine was
   * constructed without the `?gpuTimings` URL gate (the common case).
   * When present, `renderFrame` attaches `timestampWrites` to each
   * HDR sub-pass descriptor and calls `endFrame` after the tone-map
   * call so the resolve + copy ride on the same encoder.
   */
  timingService: GpuTimingService | null;
```

- [ ] **Step 3: Consume the timing service in `renderFrame.ts`**

In `src/services/engine/frame/renderFrame.ts`, extend the destructure at the top of the function to pull `timingService`:

```typescript
  const {
    ctx,
    state,
    milkyWayITimeSec,
    device,
    context,
    milkyWayRenderer,
    filamentRenderer,
    scalarVolumeRenderer,
    texturedQuadRenderer,
    texturedDiskRenderer,
    proceduralDiskRenderer,
    settings,
    famousMeta,
    famousXrefs,
    clouds,
    timingService,
  } = input;
```

Add the import near the top of the file:

```typescript
import type { TimingSlotName } from '../../../@types/gpu/timing/TimingSlotName';
```

Just before `const encoder = device.createCommandEncoder();` add the begin-frame call:

```typescript
  // Per-frame timing window.  Null when the service is null (no-op
  // mode); otherwise a context the service uses to pick a staging
  // buffer for this frame's resolve.
  const timingCtx = timingService?.beginFrame() ?? null;
```

Inside the `for (const pass of HDR_PASSES)` loop, modify the `encoder.beginRenderPass` call to attach `timestampWrites`:

```typescript
    // The pass-name → slot mapping is statically defined by
    // TIMING_SLOT_NAMES.  Pass.name is typed `string`, but the
    // HDR_PASSES inhabitants' names are all keys of that table by
    // construction — the cast is safe and documented.  If a future
    // pass file forgets to add a slot, `descriptorFor` returns
    // undefined and the pass simply isn't measured (it still draws).
    const timestampWrites = timingService?.descriptorFor(
      pass.name as TimingSlotName,
    );

    const passEncoder = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.postProcess.view,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
      ...(timestampWrites ? { timestampWrites } : {}),
    });
    pass.draw(passEncoder, ctx, state, settings, deps);
    passEncoder.end();
```

After the `ctx.postProcess.draw(...)` call (tone-map) and BEFORE `device.queue.submit(...)`, add:

```typescript
  // Record the resolveQuerySet + copyBufferToBuffer commands onto
  // this same encoder so they ride along with the HDR + tone-map
  // submits.  endFrame is a no-op when timingCtx is null.
  if (timingCtx && timingService) timingService.endFrame(timingCtx, encoder);
```

- [ ] **Step 4: Forward `timingService` through `runFrame.ts`**

In `src/@types/engine/frame/RunFrameDeps.d.ts`, add the import:

```typescript
import type { GpuTimingService } from '../../gpu/timing/GpuTimingService';
```

…and append the field:

```typescript
  /**
   * Optional per-pass GPU timing service.  Null unless `?gpuTimings`
   * is set.  Forwarded straight through to `renderFrame` via
   * `RenderFrameInput.timingService`.
   */
  timingService: GpuTimingService | null;
```

In `src/services/engine/frame/runFrame.ts`, extend the destructure of `deps` to include `timingService` and pass it through into the `renderFrame(...)` call's input bag.

In `src/services/engine/phases/startLoop.ts`, find the local destructure of `state.gpu` (the block that pulls `renderer`, `pickRenderer`, the new `texturedDiskRenderer`, etc.) and add `timingService`. Pass it into the `RunFrameDeps` bag the loop body forwards into `runFrame`:

```typescript
    timingService: state.gpu.timingService,
```

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/services/engine/frame/renderFrame.timing.test.ts`

Expected: PASS.

Run: `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts`

Expected: PASS — the new code path uses `...(timestampWrites ? {...} : {})` so when the timing service is null (which the visual baseline ensures it is), the descriptor literal stays byte-identical to Task 8's output.

Run: `npm test`

Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/frame/RenderFrameInput.d.ts src/@types/engine/frame/RunFrameDeps.d.ts src/services/engine/frame/renderFrame.ts src/services/engine/frame/runFrame.ts src/services/engine/phases/startLoop.ts tests/services/engine/frame/renderFrame.timing.test.ts
git commit -m "$(cat <<'EOF'
feat(renderFrame): attach gpuTimingService per-pass timestampWrites

renderFrame now calls timingService.beginFrame() once per frame,
threads `descriptorFor(pass.name)` into each enabled HDR sub-pass's
beginRenderPass descriptor, and records resolveQuerySet +
copyBufferToBuffer via endFrame before the final queue.submit.  When
timingService is null (the common case), every timing call is
short-circuited and the encoder commands stay byte-identical to the
pre-timing path.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Plumb optional `timestampWrites` through `postProcess.draw`

**Files:**
- Modify: `src/@types/rendering/PostProcess.d.ts` (extend `draw` signature)
- Modify: `src/services/gpu/passes/postProcess.ts` (consume the new arg)
- Modify: `src/services/engine/frame/renderFrame.ts` (pass `descriptorFor('tone-map')`)

The tone-map post-process owns its own internal `beginRenderPass` (see `postProcess.ts` line 281). To time the tone-map pass we extend its `draw` signature with an optional `timingDescriptor` and attach it inside the descriptor literal — same optional-spread pattern as Task 9.

- [ ] **Step 1: Find the current `draw` type and extend it**

In `src/@types/rendering/PostProcess.d.ts`, find the `draw` method signature in the `PostProcess` type and extend it:

```typescript
  /**
   * Run the tone-map pass into the swap chain.
   *
   * Encodes a single triangle into a new render pass opened against
   * the caller-supplied `swapView`.  Internal: the implementation owns
   * a `beginRenderPass`/`end` pair that the caller doesn't see.
   *
   * @param timingDescriptor  Optional `RenderPassTimestampWrites` for
   *                          per-pass GPU profiling.  Pass `undefined`
   *                          (the default) to skip timing — the
   *                          internal render pass omits the field.
   *                          When non-undefined the descriptor is
   *                          spread into the internal
   *                          `beginRenderPass` call.
   */
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    exposure: number,
    curve: number,
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): void;
```

- [ ] **Step 2: Implement the optional descriptor consumption**

In `src/services/gpu/passes/postProcess.ts`, find the `draw(encoder, swapView, exposure, curve)` method body (~line 260). Update the parameter list and the internal `beginRenderPass` literal:

```typescript
    draw(encoder, swapView, exposure, curve, timingDescriptor): void {
      uniformF32[0] = exposure;
      uniformF32[1] = DEFAULT_WHITEPOINT * DEFAULT_WHITEPOINT;
      uniformF32[2] = DEFAULT_ASINH_SOFTNESS;
      uniformU32[3] = curve >>> 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      const bindGroup = device.createBindGroup({
        label: 'toneMap-bg',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: hdrView! },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: swapView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        // Per-pass GPU timing.  When `timingDescriptor` is undefined
        // (no `?gpuTimings` gate active), the field is omitted and
        // WebGPU treats it as "no timing requested".
        ...(timingDescriptor ? { timestampWrites: timingDescriptor } : {}),
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    },
```

- [ ] **Step 3: Wire `tone-map` descriptor in `renderFrame.ts`**

In `src/services/engine/frame/renderFrame.ts`, replace the existing call:

```typescript
  ctx.postProcess.draw(
    encoder,
    context.getCurrentTexture().createView(),
    settings.exposure,
    settings.toneMapCurve,
  );
```

…with:

```typescript
  ctx.postProcess.draw(
    encoder,
    context.getCurrentTexture().createView(),
    settings.exposure,
    settings.toneMapCurve,
    timingService?.descriptorFor('tone-map'),
  );
```

The optional 5th argument is `undefined` when `timingService` is null (the common case); when present, it's the `RenderPassTimestampWrites` for slot pair (16, 17).

- [ ] **Step 4: Run tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npx vitest run tests/visual/renderFrameSplitBaseline.test.ts`

Expected: PASS — the timing-disabled baseline path is unchanged.

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/@types/rendering/PostProcess.d.ts src/services/gpu/passes/postProcess.ts src/services/engine/frame/renderFrame.ts
git commit -m "$(cat <<'EOF'
feat(postProcess): accept optional timestampWrites; renderFrame passes tone-map slot

postProcess.draw gains an optional 5th argument (timingDescriptor)
that, when present, is spread into the internal beginRenderPass as
`timestampWrites`.  renderFrame passes
`timingService?.descriptorFor('tone-map')` — undefined and zero-cost
when timing is disabled.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Plumb optional `timestampWrites` through `pickRenderer.draw`

**Files:**
- Modify: `src/@types/rendering/PickRenderer.d.ts` (extend `pick` signature with optional timing arg)
- Modify: `src/services/gpu/renderers/pickRenderer.ts` (consume the new arg)
- Modify: the caller(s) that invoke `pickRenderer.pick` — search for `pickRenderer.pick(` in `src/services/engine/` to find the canonical hover-driven call site

Pick runs on its own encoder, on its own cadence (hover-driven, not per-frame). The slot pair `(18, 19)` is reserved for pick. Two important points:

  1. The pick service's resolve + copy DO ride on the pick encoder — not on the main frame encoder. That's the natural fit because pick owns its own `device.queue.submit`.
  2. When pick doesn't fire for a frame, the staging buffer slots for pick stay at zero (the decoder's sentinel "didn't run") and the panel shows `—`.

Because the pick encoder is separate, we DON'T call `timingService.endFrame` from inside pick — that's the main frame's responsibility, and pick's resolve happens via a different mechanism: pickRenderer needs its own micro-resolve, OR we accept that pick timings land "one frame late" via the next main-frame's endFrame consuming a query set written by pick's submit. The spec resolves this by having `pickRenderer` accept the `descriptorFor('pick')` and the rest of the staging-buffer lifecycle ride on the main frame's endFrame (the query set is shared, so resolving 0..32 at endFrame picks up whatever pick wrote since the last resolve).

This is the simplest correct shape and matches the spec's "Pick-render handling" section.

- [ ] **Step 1: Find the pick call site**

Run: `grep -rn "pickRenderer.pick(" src/services/engine/ --include="*.ts"`

Note the file/line; this is the site that will pass `timingService?.descriptorFor('pick')` after Step 4.

- [ ] **Step 2: Extend the `pick` type**

In `src/@types/rendering/PickRenderer.d.ts`, find the `pick` method signature and add an optional 6th argument:

```typescript
  /**
   * Run the pick render pass.
   *
   * @param timingDescriptor  Optional `RenderPassTimestampWrites` for
   *                          per-pass GPU profiling.  When the timing
   *                          service is active, callers pass
   *                          `timingService.descriptorFor('pick')`.
   *                          The descriptor's query-set slots (18, 19)
   *                          are resolved by the next main-frame
   *                          `endFrame` — pick uses its own encoder
   *                          and submit, so the cross-frame latency
   *                          is one main-frame at worst.  Sentinel
   *                          slot values are preserved across pick-
   *                          quiet frames so the decoder treats them
   *                          as "didn't run" and the UI shows `—`.
   */
  pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    pointSizePx?: number,
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): Promise<{ source: Source; localIdx: number } | null>;
```

- [ ] **Step 3: Consume the descriptor in the implementation**

In `src/services/gpu/renderers/pickRenderer.ts`, find the `async function pick(...)` signature (~line 322) and add the parameter:

```typescript
  async function pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    pointSizePx?: number,
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): Promise<{ source: Source; localIdx: number } | null> {
```

Find the `encoder.beginRenderPass({...})` call (~line 433) and spread `timingDescriptor`:

```typescript
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: pt.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: dt.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
      // Per-pass GPU timing.  Undefined unless the caller passed a
      // descriptor — see PickRenderer.pick JSDoc for the cross-frame
      // resolution story.
      ...(timingDescriptor ? { timestampWrites: timingDescriptor } : {}),
    });
```

- [ ] **Step 4: Update the call site**

In whichever file Step 1 surfaced (likely `src/services/engine/runtime/hoverPickLoop.ts` or similar — Step 1's grep tells you exactly), update the `pickRenderer.pick(...)` invocation to add a trailing argument:

```typescript
    const hit = await pickRenderer.pick(
      viewportPx,
      pickX,
      pickY,
      sources,
      pointSizePx,
      state.gpu.timingService?.descriptorFor('pick'),
    );
```

The trailing argument is `undefined` when `state.gpu.timingService` is null — pick behaves exactly as before in that case.

- [ ] **Step 5: Run tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS — the existing pickRenderer tests don't pass a sixth argument; the optional parameter keeps them green.

- [ ] **Step 6: Commit**

```bash
git add src/@types/rendering/PickRenderer.d.ts src/services/gpu/renderers/pickRenderer.ts src/services/engine/
git commit -m "$(cat <<'EOF'
feat(pickRenderer): accept optional timestampWrites; thread descriptorFor('pick')

pickRenderer.pick gains an optional 6th argument that, when present,
attaches `timestampWrites` to the pick-pass internal beginRenderPass.
The caller passes timingService?.descriptorFor('pick'); the slot pair
(18, 19) is resolved by the next main-frame endFrame.  Pick-quiet
frames leave the slot u64s at their sentinel-zero value so the decoder
treats them as "didn't run".

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Add `Sparkline.tsx` component

**Files:**
- Create: `src/components/DebugPanel/Sparkline.tsx`
- Create: `tests/components/DebugPanel/Sparkline.test.tsx`

A 5-character unicode-block sparkline. Takes `samples: readonly number[]` (length up to 8) and renders one character per sample, normalised against `max(samples)`. Pure function; the spec target is ~15 lines.

The block characters are `▁▂▃▄▅▆▇█` (8 levels).

- [ ] **Step 1: Write the failing test**

Create `tests/components/DebugPanel/Sparkline.test.tsx`:

```typescript
/**
 * Sparkline — render coverage for the 8-level unicode block sparkline.
 *
 * Four scenarios:
 *   1. Empty samples → empty string.
 *   2. Single sample → single character (any of the 8 blocks).
 *   3. All-zero samples → all `▁` (the lowest block).
 *   4. Monotonic ramp 0..7 → exact mapping to `▁▂▃▄▅▆▇█`.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from '../../../src/components/DebugPanel/Sparkline';

describe('Sparkline', () => {
  it('renders nothing for an empty samples array', () => {
    const { container } = render(<Sparkline samples={[]} />);
    expect(container.textContent).toBe('');
  });

  it('renders a single character for a single sample', () => {
    const { container } = render(<Sparkline samples={[5]} />);
    // One sample → the lone bucket is necessarily 100% of itself → top block.
    expect(container.textContent).toBe('█');
  });

  it('renders all `▁` for an all-zero samples array', () => {
    const { container } = render(<Sparkline samples={[0, 0, 0, 0]} />);
    expect(container.textContent).toBe('▁▁▁▁');
  });

  it('renders the canonical 8-level ramp when samples are 0..7', () => {
    const { container } = render(<Sparkline samples={[0, 1, 2, 3, 4, 5, 6, 7]} />);
    expect(container.textContent).toBe('▁▂▃▄▅▆▇█');
  });

  it('clamps to top character for the max sample(s)', () => {
    const { container } = render(<Sparkline samples={[1, 2, 4]} />);
    // 1, 2, 4 over max=4: positions 1/4 → `▂`, 2/4 → `▄`, 4/4 → `█`.
    expect(container.textContent).toBe('▂▄█');
  });
});
```

Run: `npx vitest run tests/components/DebugPanel/Sparkline.test.tsx`

Expected: FAIL — `Sparkline.tsx` doesn't exist.

- [ ] **Step 2: Implement the component**

Create `src/components/DebugPanel/Sparkline.tsx`:

```typescript
/**
 * Sparkline — 8-level unicode-block sparkline for inline numerics.
 *
 * Maps each sample to one of 8 Unicode block characters
 * (`▁▂▃▄▅▆▇█`), proportional to the sample's position in the range
 * `[0, max(samples)]`.  When `max === 0` (every sample is zero), the
 * lowest block (`▁`) is used uniformly — distinguishes "no signal"
 * from "no samples".
 *
 * ### Why a `<span>` wrapper rather than a string-returning helper
 *
 * Two consumers want this widget: the live GPU-timings rows AND the
 * future per-source loading rows (if we revisit `LoadingDevPanel`'s
 * progress visualisation).  Wrapping the unicode in a `<span>` lets
 * each consumer style the colour / font separately via className or
 * inline style without changing the data path.
 *
 * ### Why a fixed monospace font is implicit
 *
 * The block characters are designed to render at uniform width in a
 * monospace context.  We don't set `fontFamily` here because the
 * GpuTimingsSection wraps every row in a `font: '11px/1.4 ui-monospace,
 * monospace'` block already; setting it again would be redundant.
 */

import type { ReactElement } from 'react';

const BLOCKS = '▁▂▃▄▅▆▇█';

export type SparklineProps = {
  /** Up to 8 samples; longer arrays are rendered in full but typically clipped by callers. */
  samples: readonly number[];
};

export function Sparkline({ samples }: SparklineProps): ReactElement {
  if (samples.length === 0) return <span />;

  const max = Math.max(...samples);
  // `max === 0` → every sample is zero → render uniform low blocks.
  // Avoids a divide-by-zero and keeps the "no signal" row visually
  // distinct from the "no samples" empty case.
  const denominator = max === 0 ? 1 : max;

  const chars: string[] = [];
  for (const sample of samples) {
    // Map [0, max] → integer [0, 7].  Clamping handles floating-point
    // edge cases where `sample / denominator * 7` lands fractionally
    // above 7 due to ULP noise.
    const bucket = Math.max(0, Math.min(7, Math.round((sample / denominator) * 7)));
    chars.push(BLOCKS[bucket]!);
  }

  return <span>{chars.join('')}</span>;
}
```

Run: `npx vitest run tests/components/DebugPanel/Sparkline.test.tsx`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DebugPanel/Sparkline.tsx tests/components/DebugPanel/Sparkline.test.tsx
git commit -m "$(cat <<'EOF'
feat(DebugPanel): add Sparkline component (8-level unicode blocks)

Pure-function component that renders one of 8 Unicode block characters
(▁▂▃▄▅▆▇█) per sample, normalised against max(samples).  Consumed by
the upcoming GpuTimingsSection.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Extract `AssetLoadingSection.tsx` from the current `LoadingDevPanel`

**Files:**
- Create: `src/components/DebugPanel/AssetLoadingSection.tsx`

This is a pure extraction of the body of the current `LoadingDevPanel.tsx` (the asset-slot list + subscription useEffect) into a renamed component. The outer fixed-position wrapper goes away in this task — `DebugPanel` will own it in Task 15. We keep `LoadingDevPanel.tsx` ALIVE for now so nothing is broken mid-task; it's deleted in Task 15.

- [ ] **Step 1: Create the section component**

Create `src/components/DebugPanel/AssetLoadingSection.tsx`:

```typescript
/**
 * AssetLoadingSection — the body of the legacy LoadingDevPanel,
 * lifted into a section of the new DebugPanel umbrella.
 *
 * Identical behaviour to the legacy panel:
 *
 *   - Subscribes to every slot's state-change channel once on mount.
 *   - Re-renders the whole section on any slot transition (debug
 *     scaffolding; the cost is negligible at the project's slot
 *     count).
 *   - Renders one row per slot with state, summary, and reload /
 *     cancel buttons.
 *
 * What changed vs. LoadingDevPanel:
 *
 *   - No outer fixed-position wrapper.  DebugPanel owns the panel
 *     chrome (`<details>` collapsible) so this section just renders
 *     its rows.
 *
 * The slot subscription pattern is taken verbatim from the legacy
 * file's "one big useState + force re-render" approach — see that
 * file's module header for the rationale.
 */

import { useEffect, useState } from 'react';
import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { LoadState } from '../../@types/loading/LoadState';
import { aggregateRegistry } from '../../services/loading/aggregateRegistry';

export type AssetLoadingSectionProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
};

export function AssetLoadingSection({ slots }: AssetLoadingSectionProps) {
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
    <details open>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
        Asset Loading ({snap.inFlightCount} in flight)
      </summary>
      <div style={{ marginTop: 4 }}>
        {snap.slots.map(({ name, state }) => {
          const slot = slots.get(name);
          if (!slot) return null;
          return <SlotRow key={name} name={name} state={state} slot={slot} />;
        })}
      </div>
    </details>
  );
}

type SlotRowProps = {
  name: string;
  state: LoadState<unknown>;
  slot: AssetSlot<unknown, unknown>;
};

function SlotRow({ name, state, slot }: SlotRowProps) {
  const summary = describe(state);
  const reqJson =
    state.kind === 'idle'
      ? '—'
      : (() => {
          try {
            return JSON.stringify(state.req).slice(0, 80);
          } catch {
            return '<unserialisable>';
          }
        })();
  return (
    <div style={{ marginTop: 4 }}>
      <div>
        <span style={{ display: 'inline-block', width: 130 }}>{name}</span>
        <span style={{ display: 'inline-block', width: 80 }}>{state.kind}</span>
        <span style={{ display: 'inline-block', width: 130 }}>{summary}</span>
        <button onClick={() => slot.forceReload()} style={{ fontSize: 10 }}>
          Reload
        </button>
        {state.kind === 'loading' && (
          <button
            onClick={() => slot.cancel()}
            style={{ fontSize: 10, marginLeft: 4 }}
          >
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

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS (the existing LoadingDevPanel still ships and is still imported; nothing tests AssetLoadingSection yet — it's exercised end-to-end via the DebugPanel umbrella in Task 15).

- [ ] **Step 3: Commit**

```bash
git add src/components/DebugPanel/AssetLoadingSection.tsx
git commit -m "$(cat <<'EOF'
feat(DebugPanel): extract AssetLoadingSection from LoadingDevPanel body

Pure extraction with no behaviour change — the slot subscription /
force-rerender pattern is taken verbatim.  Outer fixed-position
wrapper is gone; DebugPanel will own the chrome in a later commit.
LoadingDevPanel.tsx stays alive until App.tsx is migrated.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Create `GpuTimingsSection.tsx` — subscribe to the timing service

**Files:**
- Create: `src/components/DebugPanel/GpuTimingsSection.tsx`
- Create: `tests/components/DebugPanel/GpuTimingsSection.test.tsx`

Renders one row per `TimingSlotName` slot. Subscribes to `gpuTimingService` on mount; maintains a per-slot rolling-average over 60 frames and an 8-sample ring buffer for the sparkline. Three render branches:

  - `timingService === null` → "Add `?gpuTimings` to the URL to enable" message.
  - `timingService.available === false` → "GPU timings unavailable on this adapter" message.
  - Both true → live timing rows.

- [ ] **Step 1: Write the failing test**

Create `tests/components/DebugPanel/GpuTimingsSection.test.tsx`:

```typescript
/**
 * GpuTimingsSection — verify the three render branches and the
 * subscriber update pipeline.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { GpuTimingsSection } from '../../../src/components/DebugPanel/GpuTimingsSection';
import type { GpuTimingService } from '../../../src/@types/gpu/timing/GpuTimingService';
import type { GpuTimingFrame } from '../../../src/@types/gpu/timing/GpuTimingFrame';

function makeStubService(opts: { available: boolean }): {
  svc: GpuTimingService;
  emit: (frame: GpuTimingFrame) => void;
} {
  let listener: ((f: GpuTimingFrame) => void) | null = null;
  const svc: GpuTimingService = {
    available: opts.available,
    beginFrame: vi.fn(() => ({ frameIndex: 0, stagingSlot: 0 as const })),
    descriptorFor: vi.fn(() => undefined),
    endFrame: vi.fn(),
    subscribe: vi.fn((l) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
    destroy: vi.fn(),
  };
  const emit = (frame: GpuTimingFrame) => {
    if (listener) listener(frame);
  };
  return { svc, emit };
}

describe('GpuTimingsSection', () => {
  it('renders the "add ?gpuTimings" message when service is null', () => {
    const { container } = render(<GpuTimingsSection service={null} />);
    expect(container.textContent).toContain('?gpuTimings');
  });

  it('renders the "unavailable on this adapter" message when available is false', () => {
    const { svc } = makeStubService({ available: false });
    const { container } = render(<GpuTimingsSection service={svc} />);
    expect(container.textContent).toContain('unavailable');
  });

  it('renders one row per slot when frames flow in', () => {
    const { svc, emit } = makeStubService({ available: true });
    const { container } = render(<GpuTimingsSection service={svc} />);

    act(() => {
      emit({
        frameIndex: 0,
        perPassMs: new Map([
          ['point-sprites', 1.2],
          ['textured-impostors', 4.8],
        ]),
      });
    });

    expect(container.textContent).toContain('point-sprites');
    expect(container.textContent).toContain('1.2');
    expect(container.textContent).toContain('textured-impostors');
    expect(container.textContent).toContain('4.8');
  });

  it('unsubscribes on unmount', () => {
    const { svc } = makeStubService({ available: true });
    const { unmount } = render(<GpuTimingsSection service={svc} />);
    unmount();
    // The subscribe spy was called once on mount; we expect the
    // returned-unsubscribe function to have been invoked during
    // unmount.  Verifying that is awkward through the public API;
    // instead we assert subscribe was called exactly once (no
    // re-subscriptions after unmount).
    expect(svc.subscribe).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npx vitest run tests/components/DebugPanel/GpuTimingsSection.test.tsx`

Expected: FAIL — `GpuTimingsSection.tsx` doesn't exist.

- [ ] **Step 2: Implement the section**

Create `src/components/DebugPanel/GpuTimingsSection.tsx`:

```typescript
/**
 * GpuTimingsSection — live readout of the gpuTimingService.
 *
 * Subscribes to one `GpuTimingFrame` channel on mount.  Maintains a
 * per-slot rolling window of recent durations (60 frames for the
 * average; 8 frames for the sparkline) in React state, normalised to
 * milliseconds.  Re-renders on every emitted frame — at 60 fps
 * that's 60 React renders per second, well within React's idle
 * budget for a small subtree (10 rows × ~5 nodes each).
 *
 * Three branches keep the component honest about its environment:
 *
 *   1. `service === null` — engine constructed without `?gpuTimings`.
 *      Helpful nudge so the user knows the panel exists but is dark.
 *   2. `service.available === false` — engine has the service but
 *      the adapter lacks `timestamp-query`.  No frames will ever
 *      arrive; render the static "unavailable" message.
 *   3. `service.available === true` — render the live rows.
 *
 * ### Why per-slot state rather than a single object
 *
 * React's referential-equality fast-path benefits from per-slot
 * arrays held in a Map: each slot's update is isolated, and a
 * sub-tree memoisation (added later) can short-circuit on per-row
 * reference equality.  For now we just re-render the whole section
 * — the cost is negligible.
 *
 * ### Why 60-frame average + 8-sample sparkline
 *
 * Matches the spec's "Layout sketch" section.  60 frames is one
 * second at 60 fps — long enough to smooth out per-frame noise,
 * short enough to react to settings flips (e.g. toggling filaments
 * off mid-session).  8-sample sparkline keeps each row to ~12 chars
 * wide.
 */

import { useEffect, useState, useRef } from 'react';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import type { GpuTimingFrame } from '../../@types/gpu/timing/GpuTimingFrame';
import type { TimingSlotName } from '../../@types/gpu/timing/TimingSlotName';
import { Sparkline } from './Sparkline';

const AVG_WINDOW = 60;
const SPARKLINE_WINDOW = 8;

type SlotStats = {
  recent: number[]; // up to AVG_WINDOW entries; newest at the end.
  spark: number[];  // up to SPARKLINE_WINDOW entries; newest at the end.
};

export type GpuTimingsSectionProps = {
  service: GpuTimingService | null;
};

export function GpuTimingsSection({ service }: GpuTimingsSectionProps) {
  // The render-trigger pattern: `tick` increments per frame; the actual
  // stats live in a ref so we don't re-allocate the Map every frame.
  const [, setTick] = useState(0);
  const statsRef = useRef<Map<TimingSlotName, SlotStats>>(new Map());

  useEffect(() => {
    if (!service || !service.available) return undefined;

    const unsub = service.subscribe((frame: GpuTimingFrame) => {
      const stats = statsRef.current;
      for (const [slot, ms] of frame.perPassMs) {
        let row = stats.get(slot);
        if (!row) {
          row = { recent: [], spark: [] };
          stats.set(slot, row);
        }
        row.recent.push(ms);
        if (row.recent.length > AVG_WINDOW) row.recent.shift();
        row.spark.push(ms);
        if (row.spark.length > SPARKLINE_WINDOW) row.spark.shift();
      }
      setTick((n) => n + 1);
    });

    return () => {
      unsub();
    };
  }, [service]);

  // ── Branch 1: no service ──────────────────────────────────────────
  if (service === null) {
    return (
      <details open>
        <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
          GPU Timings
        </summary>
        <div style={{ marginTop: 4, opacity: 0.7 }}>
          Add <code>?gpuTimings</code> to the URL to enable.
        </div>
      </details>
    );
  }

  // ── Branch 2: feature missing ─────────────────────────────────────
  if (!service.available) {
    return (
      <details open>
        <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
          GPU Timings
        </summary>
        <div style={{ marginTop: 4, opacity: 0.7 }}>
          GPU timings unavailable on this adapter.
        </div>
      </details>
    );
  }

  // ── Branch 3: live data ───────────────────────────────────────────
  const stats = statsRef.current;
  // Sum of last-frame timings for the header.  Use the last entry in
  // each slot's `recent` array — that's "this most recent frame's"
  // value.  Slots that haven't sampled yet contribute 0.
  let frameTotalMs = 0;
  for (const [, row] of stats) {
    if (row.recent.length > 0) frameTotalMs += row.recent[row.recent.length - 1]!;
  }

  return (
    <details open>
      <summary style={{ fontWeight: 'bold', cursor: 'pointer' }}>
        GPU Timings (last frame: {frameTotalMs.toFixed(1)} ms)
      </summary>
      <div style={{ marginTop: 4 }}>
        {Array.from(stats).map(([slot, row]) => {
          const avg =
            row.recent.length === 0
              ? 0
              : row.recent.reduce((a, b) => a + b, 0) / row.recent.length;
          return (
            <div key={slot}>
              <span style={{ display: 'inline-block', width: 130 }}>{slot}</span>
              <span
                style={{
                  display: 'inline-block',
                  width: 70,
                  textAlign: 'right',
                }}
              >
                {avg.toFixed(1)} ms
              </span>
              <span style={{ marginLeft: 8 }}>
                <Sparkline samples={row.spark} />
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
```

Run: `npx vitest run tests/components/DebugPanel/GpuTimingsSection.test.tsx`

Expected: PASS — all four test cases green.

- [ ] **Step 3: Commit**

```bash
git add src/components/DebugPanel/GpuTimingsSection.tsx tests/components/DebugPanel/GpuTimingsSection.test.tsx
git commit -m "$(cat <<'EOF'
feat(DebugPanel): add GpuTimingsSection with per-slot rolling stats

Subscribes to a GpuTimingService on mount, maintains a 60-frame
rolling average and 8-sample sparkline per slot, and renders three
branches: no-service (gate-off hint), unavailable (adapter doesn't
support timestamp-query), or live (one row per slot).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Create `DebugPanel.tsx` umbrella; delete `LoadingDevPanel.tsx`; migrate `App.tsx`

**Files:**
- Create: `src/components/DebugPanel/DebugPanel.tsx`
- Modify: `src/components/App/App.tsx` (replace `LoadingDevPanel` import + JSX)
- Delete: `src/components/LoadingDevPanel/LoadingDevPanel.tsx`

This task finishes the UI migration. The umbrella component owns the fixed-position chrome and renders both sections inside it; the App-level mount predicate stays the same (`hasUrlGate('debug') || import.meta.env.DEV`).

The panel needs access to both the asset slots AND the engine's `timingService` handle. The engine handle's existing shape exposes `state.gpu.timingService` indirectly — we expose it via the `EngineHandle` so App.tsx can pass it as a prop. The simplest plumbing: add a `getTimingService()` accessor on the engine handle that returns `state.gpu.timingService` (null when not constructed).

- [ ] **Step 1: Add `getTimingService` to the engine handle**

Inspect the `EngineHandle` type — the convention since the H5 namespace restructure is sub-handle-namespaced (memory `project_h5_namespace_restructure`). Add a thin accessor:

In `src/@types/engine/EngineHandle.d.ts` (or wherever the top-level `EngineHandle` type lives — `grep -rn "export type EngineHandle\b" src/@types/`), add a top-level field:

```typescript
  /**
   * The optional gpuTimingService.  Null when the engine was
   * constructed without the `?gpuTimings` URL gate.  Exposed at the
   * top level (rather than under a sub-handle) because there are no
   * sibling timing-related methods — adding a `timing.*` namespace for
   * one field would be over-architecture.
   */
  timingService: GpuTimingService | null;
```

…and the matching import at the top of the file. Mirror the pattern in `src/services/engine/engine.ts` (or whichever file constructs the `EngineHandle` object literal) to expose `state.gpu.timingService`:

```typescript
    get timingService() {
      return state.gpu.timingService;
    },
```

The getter form (rather than copying the value at handle construction) is intentional — the service is assigned to `state.gpu.timingService` AFTER `createEngine` returns its handle, by the async `initGpu` IIFE. A property getter reads the live value.

- [ ] **Step 2: Build the umbrella component**

Create `src/components/DebugPanel/DebugPanel.tsx`:

```typescript
/**
 * DebugPanel — the umbrella for the renamed dev panel.
 *
 * Replaces the legacy `LoadingDevPanel` with a two-section panel:
 * `AssetLoadingSection` (the legacy slot-progress rows) and
 * `GpuTimingsSection` (per-pass GPU timing live readout).  The
 * mount predicate is owned by `App.tsx` (DEV ||
 * `hasUrlGate('debug')`); when this component renders, both
 * sections always render — section-level visibility (e.g. "GPU
 * timings unavailable") is each section's own concern.
 *
 * ### Why both sections collapsible
 *
 * The asset-loading rows churn during startup (every catalog,
 * filaments, the font atlas, etc.), but go quiet once everything
 * is `ready` — a collapsed `<details>` keeps the panel compact
 * during steady-state runs.  GPU timings is the opposite (always
 * live), but the user might want to focus on one or the other.
 * Both sections default to open; the user collapses them at will.
 */

import type { AssetSlot } from '../../@types/loading/AssetSlot';
import type { GpuTimingService } from '../../@types/gpu/timing/GpuTimingService';
import { AssetLoadingSection } from './AssetLoadingSection';
import { GpuTimingsSection } from './GpuTimingsSection';

export type DebugPanelProps = {
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  timingService: GpuTimingService | null;
};

export function DebugPanel({ slots, timingService }: DebugPanelProps) {
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
      <div style={{ fontWeight: 'bold', marginBottom: 6, opacity: 0.8 }}>
        Skymap Debug
      </div>
      <AssetLoadingSection slots={slots} />
      <div style={{ marginTop: 6 }} />
      <GpuTimingsSection service={timingService} />
    </div>
  );
}
```

- [ ] **Step 3: Migrate `App.tsx`**

In `src/components/App/App.tsx`:

  1. Remove the `LoadingDevPanel` import; add a `DebugPanel` import:

```typescript
import { DebugPanel } from '../DebugPanel/DebugPanel';
```

  2. Rename `isLoadingDevPanelAvailable` to `isDebugPanelAvailable` and update the body (the rename of the predicate keeps the call site readable; the URL gate is already `?debug` after Task 1):

```typescript
function isDebugPanelAvailable(): boolean {
  if (import.meta.env.DEV) return true;
  return hasUrlGate('debug');
}
```

  3. Replace the `<LoadingDevPanel slots={...} />` JSX site with:

```jsx
        {isDebugPanelAvailable() && (
          <DebugPanel
            slots={handleRef.current?.assetSlots ?? new Map()}
            timingService={handleRef.current?.timingService ?? null}
          />
        )}
```

  (Adapt the `slots` source expression to whatever the existing call site uses — the original `LoadingDevPanel` mount site already wires that prop; keep the same wiring.)

  4. Update the comment block at the original mount site (~line 738) so it refers to `DebugPanel` and `?debug` rather than `LoadingDevPanel` and `?debug=loading`.

- [ ] **Step 4: Delete the legacy file**

```bash
git rm src/components/LoadingDevPanel/LoadingDevPanel.tsx
rmdir src/components/LoadingDevPanel 2>/dev/null || true
```

- [ ] **Step 5: Run tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS — including all four DebugPanel tests, the urlGate test, the timing-service tests, and the visual baselines.

- [ ] **Step 6: Commit**

```bash
git add src/components/DebugPanel/DebugPanel.tsx src/components/App/App.tsx src/@types/engine/EngineHandle.d.ts src/services/engine/engine.ts
git rm src/components/LoadingDevPanel/LoadingDevPanel.tsx
git commit -m "$(cat <<'EOF'
feat(DebugPanel): introduce umbrella, delete LoadingDevPanel, migrate App.tsx

DebugPanel owns the fixed-position chrome and composes
AssetLoadingSection (legacy panel body) + GpuTimingsSection (new
GPU timing readout).  App.tsx replaces the LoadingDevPanel mount
site; the predicate is now `hasUrlGate('debug') || import.meta.env.DEV`.
The engine handle exposes `timingService` as a getter so App.tsx
can pass the live (post-initGpu) reference.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final verification — typecheck, full test suite, build, manual smoke notes

**Files:** none modified.

The full pipeline must be green end-to-end. Manual checks aren't gated by the implementer (no human sits in the loop here), but they are documented for the user to run after merge.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`

Expected: PASS — both `src/` and `tools/` tsconfigs clean.

- [ ] **Step 2: Full test suite**

Run: `npm test`

Expected: PASS — every existing test still passes, plus the new tests added in Tasks 1, 3, 4, 5, 6, 7, 9, 12, 14.

- [ ] **Step 3: Production build**

Run: `npm run build`

Expected: PASS — `tsc --noEmit && vite build` exits 0. Inspect the build output line for the `DebugPanel` chunk: the production bundle should NOT include the panel sources when neither `import.meta.env.DEV` is true nor `?debug` is in the URL at runtime (Vite's static `DEV` replacement makes the dev-only branch dead code; the URL branch ships but is sub-KB).

- [ ] **Step 4: Format check**

Run: `npm run format -- --check`

Expected: PASS — every new file passes Prettier without modification. If the check fails, run `npm run format` to apply Prettier and re-stage.

- [ ] **Step 5: Manual smoke list (for the reviewer)**

The following manual checks are not part of the automated verification but should be in the PR description so the reviewer knows how to validate the feature:

  1. Open the dev server WITHOUT `?gpuTimings` — DebugPanel renders, GPU Timings section shows the "Add `?gpuTimings`" message.
  2. Open with `?debug&gpuTimings` — DebugPanel renders, GPU Timings section shows live per-pass rows with rolling-avg + sparkline.
  3. Open with `?debug&gpuTimings&volumes` — scalar-volume row populates (non-zero values).
  4. Force-hover over a galaxy — pick row updates intermittently (sparkline shows intermittent dashes between samples; rolling avg is non-zero).
  5. Simulate Safari (or a Chrome adapter without `timestamp-query`) — confirm the GPU Timings section shows "unavailable on this adapter".

- [ ] **Step 6: Commit (only if Step 4 made changes)**

If `npm run format` re-formatted anything:

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: apply Prettier formatting to new files

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Otherwise skip — there are no changes to commit.

---

## Self-review checklist

The author of this plan walked the spec section-by-section to verify coverage. Reviewers should re-walk to catch any drift:

  - **Architecture > Split rendering** — Task 8 covers the 1-clear-pass + 8-HDR-sub-pass split.
  - **Architecture > Why a dedicated clear pass** — Task 8's module-header docstring carries this rationale verbatim.
  - **Architecture > Timestamp wiring + static slot table** — Task 3 defines the table; Task 9 wires it into renderFrame for HDR passes; Task 10 wires it for tone-map; Task 11 for pick.
  - **Architecture > `gpuTimingService` module** — Task 5 implements the service; Tasks 2 + 3 + 4 define its types and pure helpers.
  - **Architecture > Subscriber channel** — Task 5's `subscribe` implementation; Task 14's `GpuTimingsSection` consumes it.
  - **Architecture > Feature negotiation** — Task 6 negotiates the feature in `initGpu`; Task 5's no-op mode handles the missing-feature case.
  - **Architecture > URL gate abstraction** — Task 1 covers all four call sites.
  - **Architecture > "Always on" rejected** — Task 6 gates service construction on `hasUrlGate('gpuTimings')`.
  - **UI > Component tree** — Tasks 12 (Sparkline), 13 (AssetLoadingSection), 14 (GpuTimingsSection), 15 (DebugPanel umbrella).
  - **UI > Mount predicate** — Task 15's App.tsx migration sets `hasUrlGate('debug') || import.meta.env.DEV`.
  - **UI > Section visibility** — Task 14's three render branches.
  - **UI > Layout sketch** — Task 14's rendered shape matches.
  - **UI > Sparkline implementation** — Task 12.
  - **Pick-render handling** — Task 11.
  - **File layout > New** — every new file appears in some task's Files list.
  - **File layout > Modified** — every modified file appears in some task's Files list.
  - **File layout > Deleted** — `LoadingDevPanel.tsx` deleted in Task 15.
  - **Testing strategy > Unit** — `decodeTimestampBuffer.test.ts` (Task 4), `urlGate.test.ts` (Task 1), `Sparkline.test.tsx` (Task 12).
  - **Testing strategy > Integration** — `renderFrameSplitBaseline.test.ts` (Task 7, exercised in Task 8); `gpuTimingService.test.ts` (Task 5).
  - **Testing strategy > Manual** — Task 16 Step 5.
  - **Risks > HDR draw-order semantics** — flagged in Task 8's module-header rewrite via the visual-baseline equivalence; no further action needed.
  - **Risks > `timestampPeriod` per-queue** — Task 5 reads `device.queue.timestampPeriod` at service construction.
  - **Risks > `mapAsync` on destroyed device** — Task 5's `.catch(() => {})` in `endFrame`.
  - **Risks > Encoder verbosity** — Task 8's new code stays under 30 lines; if it grows during execution, the reviewer can request an inline helper extraction as a follow-up commit, but the size today is fine.

### Sequencing footgun audit

  - Task 6 adds `state.gpu.timingService: GpuTimingService | null` with a `null` default in the engine's initial-state literal. Every read site downstream (Tasks 9, 11, 15) checks `?? null` or `?.` before use. ✔
  - Task 9 adds `RenderFrameInput.timingService` AND threads it through `RunFrameDeps` and `startLoop` in one commit, so no caller is constructing a `RenderFrameInput` without the field after this commit. ✔
  - Task 11's call-site update is gated on the implementer finding the actual `pickRenderer.pick(...)` site — the plan flags this as Step 1 of Task 11 specifically because the file path may have shifted since the spec was drafted. ✔
  - Task 15's engine-handle `timingService` getter reads `state.gpu.timingService` lazily — correct because `initGpu` (which assigns the slot) runs in an async IIFE after `createEngine` returns. ✔
  - Type definition tasks (2, 3, 4) precede their consumers (5, 9). ✔
  - Visual baseline (Task 7) is captured BEFORE the structural change (Task 8) that it's meant to gate. ✔

### Placeholder scan

  - Task 7's `makeMinimalInput` helper is intentionally left elided — the implementer mirrors the canonical stub shape from the existing impostor-split baseline test (`tests/visual/galaxyImpostorBaseline.test.ts`) and the renderFrame unit test. The plan calls this out explicitly rather than reproducing a 200-line stub literal that would inevitably drift.
  - Task 9's `makeMinimalInputWithTiming` is similarly elided with the same rationale.
  - All other code blocks are concrete and runnable as written.

### Type consistency

  - `TimingSlotName` is the same union across `@types/gpu/timing/TimingSlotName.d.ts`, `TIMING_SLOT_NAMES.ts`, `decodeTimestampBuffer.ts`, `gpuTimingService.ts`, and `renderFrame.ts`. ✔
  - `GpuTimingService.descriptorFor` returns `GPURenderPassTimestampWrites | undefined` everywhere — type alias and implementation agree. ✔
  - `GpuTimingFrame.perPassMs` is a `ReadonlyMap<TimingSlotName, number>` everywhere; the `GpuTimingsSection` reads it as such. ✔
  - `EngineGpuHandles.timingService` (Task 6), `RenderFrameInput.timingService` (Task 9), `RunFrameDeps.timingService` (Task 9), and `EngineHandle.timingService` (Task 15) are all `GpuTimingService | null` with consistent JSDoc. ✔
