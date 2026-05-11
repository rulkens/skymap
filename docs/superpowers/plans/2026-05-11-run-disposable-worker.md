# `runDisposableWorker` + `clonePointCloudForTransfer` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the byte-for-byte-duplicated worker-runner ceremony from three sites (`defaultSchechterRunner`, `defaultAngularRunner`, `defaultWorkerRunner`) into one generic helper, and factor the PointCloud slice-and-transfer ceremony into a separate cloud-aware helper.

**Architecture:** Two small helpers, single-responsibility each. `runDisposableWorker<TIn, TOut>(WorkerCtor, input, transfer, label)` owns the worker lifecycle (spawn → onmessage/onerror → terminate). `clonePointCloudForTransfer(cloud)` owns the 10-field typed-array slice-then-transfer ceremony — the one place that needs to change when a new `PointCloud` field is added. The three runners collapse from ~40 lines each to ~8 lines.

**Tech Stack:** TypeScript, Vitest. No new runtime dependencies. No Worker support needed at test time — Vitest doesn't run `?worker` imports, and the helpers are designed to be testable with a fake Worker class.

---

## Context for an engineer with no skymap background

skymap runs three compute-heavy "bakes" off the main thread:
- **Schechter ratio** (per-galaxy luminosity-function ratios for bias correction)
- **Angular weight** (HEALPix-cell galaxy-count weights for bias correction)
- **Point interleaved buffer** (the GPU-ready vertex buffer build)

Each bake is implemented as a Web Worker chunk. The production runners spawn a fresh worker per call (no shared state, automatic OS-level concurrency), serialize the input cloud + transferable typed-array buffers, listen for the result, terminate the worker, and resolve.

Before this plan: the spawn/listen/terminate/resolve ceremony is open-coded three times. The 10-field PointCloud slice-then-transfer ceremony is open-coded three times. Adding a new `PointCloud` field (e.g., a future `redshiftZ` array) requires editing all three sites in lockstep; a missed edit silently sends `undefined` into the worker.

After this plan: the ceremony lives in one helper, the cloud transfer-list lives in another. The three runners stay separately exported (they remain DI-pluggable for tests) but their bodies become trivial wrappers.

## File Structure

**Create:**
- `src/data/pointCloudTransfer.ts` — `clonePointCloudForTransfer(cloud)` helper.
- `src/utils/worker/runDisposableWorker.ts` — generic `runDisposableWorker` helper.
- `tests/data/pointCloudTransfer.test.ts`
- `tests/utils/worker/runDisposableWorker.test.ts`

**Modify:**
- `src/services/engine/subsystems/biasCorrectionSubsystem.ts` (sites at ~lines 189 and ~245)
- `src/services/gpu/renderers/pointRenderer.ts` (site at ~line 432)

The PointCloud transfer helper lives under `src/data/` next to `pointCloudFormat.ts` because both are PointCloud-aware utilities (one for disk format, one for cross-thread transfer). The generic worker helper lives under `src/utils/worker/` — a new subdirectory — because it has zero domain knowledge and may grow to host other worker utilities (timeouts, pool, etc.) later.

---

## Task 1: `clonePointCloudForTransfer` helper + tests

**Files:**
- Create: `src/data/pointCloudTransfer.ts`
- Create: `tests/data/pointCloudTransfer.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// tests/data/pointCloudTransfer.test.ts
/**
 * Tests for clonePointCloudForTransfer — the helper that slices every
 * PointCloud typed-array buffer into a fresh, detachable copy and
 * returns the matching Transferable[] list.
 *
 * ### What we assert here
 *
 * 1. The copy is a structurally complete PointCloud (every field present
 *    with the right type and length).
 * 2. Every typed-array view has a NEW underlying ArrayBuffer — i.e. the
 *    .slice(0) actually allocated, didn't just alias. This is the
 *    load-bearing invariant: if the copy aliased the original, the
 *    subsequent postMessage transfer would detach the engine's own
 *    buffers and break every later picker / InfoCard read.
 * 3. The transfer list points to the COPY's buffers, not the original's
 *    — for the same reason: the original cloud must survive the call.
 * 4. The transfer list contains exactly one entry per typed-array field
 *    (10 entries) and they appear in a stable order — so the helper
 *    doesn't accidentally drop a field when PointCloud grows.
 *
 * ### Why a stable field order matters
 *
 * Adding a new typed-array field to PointCloud must require editing
 * exactly one place (this helper). A test that pins the order catches
 * "added the field to the copy but forgot to add it to the transfer
 * list" — a class of bug that would silently send `undefined` through
 * the worker boundary.
 */

import { describe, it, expect } from 'vitest';
import { clonePointCloudForTransfer } from '../../src/data/pointCloudTransfer';
import type { PointCloud } from '../../src/@types/PointCloud';

function makeCloud(count: number): PointCloud {
  // Each field gets a distinct fill value so we can later assert which
  // index in the transfer list corresponds to which source field.
  return {
    count,
    objIDs: new BigUint64Array(count).fill(1n),
    positions: new Float32Array(count * 3).fill(0.5),
    magU: new Float32Array(count).fill(2),
    magG: new Float32Array(count).fill(3),
    magR: new Float32Array(count).fill(4),
    magI: new Float32Array(count).fill(5),
    magZ: new Float32Array(count).fill(6),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
  };
}

describe('clonePointCloudForTransfer', () => {
  it('returns a copy whose typed-array fields have new underlying buffers', () => {
    const cloud = makeCloud(4);
    const { copy } = clonePointCloudForTransfer(cloud);

    expect(copy.objIDs.buffer).not.toBe(cloud.objIDs.buffer);
    expect(copy.positions.buffer).not.toBe(cloud.positions.buffer);
    expect(copy.magU.buffer).not.toBe(cloud.magU.buffer);
    expect(copy.magG.buffer).not.toBe(cloud.magG.buffer);
    expect(copy.magR.buffer).not.toBe(cloud.magR.buffer);
    expect(copy.magI.buffer).not.toBe(cloud.magI.buffer);
    expect(copy.magZ.buffer).not.toBe(cloud.magZ.buffer);
    expect(copy.axisRatio.buffer).not.toBe(cloud.axisRatio.buffer);
    expect(copy.positionAngleDeg.buffer).not.toBe(cloud.positionAngleDeg.buffer);
    expect(copy.diameterKpc.buffer).not.toBe(cloud.diameterKpc.buffer);
  });

  it('preserves count and per-field values bit-for-bit', () => {
    const cloud = makeCloud(4);
    const { copy } = clonePointCloudForTransfer(cloud);

    expect(copy.count).toBe(4);
    expect(Array.from(copy.objIDs)).toEqual(Array.from(cloud.objIDs));
    expect(Array.from(copy.positions)).toEqual(Array.from(cloud.positions));
    expect(Array.from(copy.magG)).toEqual(Array.from(cloud.magG));
    expect(Array.from(copy.diameterKpc)).toEqual(Array.from(cloud.diameterKpc));
  });

  it('returns transfer list pointing to the COPY buffers, not the originals', () => {
    const cloud = makeCloud(4);
    const { copy, transfer } = clonePointCloudForTransfer(cloud);

    // Every transfer entry must be one of the copy buffers — never the
    // original. Sending an original-buffer entry to postMessage would
    // detach the engine's authoritative cloud.
    const copyBuffers = new Set<ArrayBufferLike>([
      copy.objIDs.buffer,
      copy.positions.buffer,
      copy.magU.buffer,
      copy.magG.buffer,
      copy.magR.buffer,
      copy.magI.buffer,
      copy.magZ.buffer,
      copy.axisRatio.buffer,
      copy.positionAngleDeg.buffer,
      copy.diameterKpc.buffer,
    ]);
    for (const t of transfer) {
      expect(copyBuffers.has(t as ArrayBufferLike)).toBe(true);
    }
  });

  it('transfer list has one entry per typed-array field (10 total)', () => {
    const cloud = makeCloud(4);
    const { transfer } = clonePointCloudForTransfer(cloud);
    expect(transfer.length).toBe(10);
  });

  it('handles count = 0 (empty cloud)', () => {
    const cloud = makeCloud(0);
    const { copy, transfer } = clonePointCloudForTransfer(cloud);
    expect(copy.count).toBe(0);
    expect(copy.objIDs.length).toBe(0);
    expect(copy.positions.length).toBe(0);
    expect(transfer.length).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data/pointCloudTransfer.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/data/pointCloudTransfer"`.

- [ ] **Step 3: Create the helper**

```ts
// src/data/pointCloudTransfer.ts
/**
 * pointCloudTransfer — slice-and-transfer ceremony for PointCloud
 * worker payloads.
 *
 * ### Why this module exists
 *
 * Sending a PointCloud across a Worker boundary with structured-clone
 * cost would be prohibitive at ~3.5M galaxies. The cheap alternative is
 * `postMessage(payload, transfer)` with a list of `ArrayBuffer`s to
 * transfer ownership of — but we can't transfer the engine's
 * authoritative buffers (the picker and InfoCard read them after the
 * bake kicks off). The pattern is:
 *
 *   1. `slice(0)` every typed-array's `.buffer` to mint a fresh,
 *      engine-disjoint copy.
 *   2. Wrap each fresh buffer in the right view (BigUint64Array for
 *      `objIDs`; Float32Array for everything else).
 *   3. Build a Transferable[] of the copy buffers.
 *   4. Hand both back to the caller; they call
 *      `worker.postMessage({ ...input, cloud: copy }, transfer)`.
 *
 * Pre-extraction this ceremony was open-coded three times across two
 * files. Adding a new PointCloud field meant editing all three sites
 * in lockstep; a missed edit silently sent `undefined` through the
 * worker boundary. This module is now the only place that knows
 * which fields PointCloud carries; future fields require one edit
 * here plus updating `tests/data/pointCloudTransfer.test.ts`'s field
 * count assertion.
 *
 * ### Note on BigUint64Array
 *
 * BigUint64Array itself is NOT on the Transferable allowlist, but its
 * underlying `.buffer` (a plain ArrayBuffer) IS. The receiving worker
 * reconstructs the BigUint64Array view over the transferred buffer
 * via the structured-clone roundtrip of the typed-array wrapper
 * (HTML spec §StructuredSerialize step "If value has [[ArrayBufferData]]…").
 */

import type { PointCloud } from '../@types/PointCloud';

export type ClonedPointCloud = {
  /** A structurally complete PointCloud whose typed-array buffers are fresh, transferable copies. */
  copy: PointCloud;
  /**
   * Transfer list of the copy's buffers in a stable order. Pass this
   * directly as the second argument to `worker.postMessage(payload, transfer)`.
   */
  transfer: Transferable[];
};

/**
 * Slice every typed-array buffer in `cloud` to produce a structurally
 * identical copy whose buffers are detached-ownership-ready, plus the
 * matching Transferable[] for `postMessage`.
 */
export function clonePointCloudForTransfer(cloud: PointCloud): ClonedPointCloud {
  const copy: PointCloud = {
    count: cloud.count,
    objIDs: new BigUint64Array(cloud.objIDs.buffer.slice(0)),
    positions: new Float32Array(cloud.positions.buffer.slice(0)),
    magU: new Float32Array(cloud.magU.buffer.slice(0)),
    magG: new Float32Array(cloud.magG.buffer.slice(0)),
    magR: new Float32Array(cloud.magR.buffer.slice(0)),
    magI: new Float32Array(cloud.magI.buffer.slice(0)),
    magZ: new Float32Array(cloud.magZ.buffer.slice(0)),
    axisRatio: new Float32Array(cloud.axisRatio.buffer.slice(0)),
    positionAngleDeg: new Float32Array(cloud.positionAngleDeg.buffer.slice(0)),
    diameterKpc: new Float32Array(cloud.diameterKpc.buffer.slice(0)),
  };
  const transfer: Transferable[] = [
    copy.objIDs.buffer,
    copy.positions.buffer,
    copy.magU.buffer,
    copy.magG.buffer,
    copy.magR.buffer,
    copy.magI.buffer,
    copy.magZ.buffer,
    copy.axisRatio.buffer,
    copy.positionAngleDeg.buffer,
    copy.diameterKpc.buffer,
  ];
  return { copy, transfer };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/data/pointCloudTransfer.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: pass; previous baseline + 5 new tests.

- [ ] **Step 6: Commit**

```bash
git add src/data/pointCloudTransfer.ts tests/data/pointCloudTransfer.test.ts
git commit -m "$(cat <<'EOF'
feat(data): clonePointCloudForTransfer helper

Single source of truth for the PointCloud slice-and-transfer
ceremony used by every off-thread bake (Schechter, angular, point
interleaved). Replaces three byte-for-byte-identical inline copies.
Adding a new PointCloud field now requires one edit here plus the
field-count assertion in the test, instead of editing three runners
in lockstep.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `runDisposableWorker` helper + tests

**Files:**
- Create: `src/utils/worker/runDisposableWorker.ts`
- Create: `tests/utils/worker/runDisposableWorker.test.ts`

- [ ] **Step 1: Write the failing test file**

```ts
// tests/utils/worker/runDisposableWorker.test.ts
/**
 * Tests for runDisposableWorker — the generic worker-lifecycle helper
 * shared by every off-thread bake.
 *
 * ### What we assert here
 *
 * 1. On success: postMessage receives (input, transfer); the Promise
 *    resolves with the worker's MessageEvent.data; the worker is
 *    terminated exactly once.
 * 2. On failure with an `event.error` set: the Promise rejects with
 *    that error; worker terminated once.
 * 3. On failure with only `event.message`: the Promise rejects with
 *    a new Error using the message and the supplied label as a
 *    fallback prefix.
 * 4. On failure with neither error nor message: the Promise rejects
 *    with `new Error('<label> worker error')` — the all-fallback path.
 *
 * ### Fake Worker — why and how
 *
 * Vitest does not natively run Vite's `?worker` chunks, so production
 * code injects a Worker constructor as the first argument to
 * runDisposableWorker. The test substitutes a FakeWorker class whose
 * `onmessage` / `onerror` we can drive synchronously after the helper
 * has wired them up. The class only implements the surface the helper
 * touches (postMessage, terminate, onmessage, onerror) — not the full
 * DOM Worker interface.
 */

import { describe, it, expect, vi } from 'vitest';
import { runDisposableWorker } from '../../../src/utils/worker/runDisposableWorker';

class FakeWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

/**
 * The latest FakeWorker constructed, captured so the test can drive
 * its onmessage/onerror callbacks after runDisposableWorker has
 * attached them.
 */
let lastWorker: FakeWorker | null = null;
class FakeWorkerCtor {
  constructor() {
    lastWorker = new FakeWorker();
    return lastWorker as unknown as FakeWorkerCtor;
  }
}

describe('runDisposableWorker', () => {
  it('resolves with event.data and terminates the worker on success', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<{ n: number }, number>(
      FakeWorkerCtor as unknown as new () => Worker,
      { n: 42 },
      [],
      'test',
    );

    expect(lastWorker).not.toBeNull();
    expect(lastWorker!.postMessage).toHaveBeenCalledTimes(1);
    expect(lastWorker!.postMessage).toHaveBeenCalledWith({ n: 42 }, []);

    lastWorker!.onmessage!({ data: 99 } as MessageEvent);

    await expect(promise).resolves.toBe(99);
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with event.error when present and terminates the worker', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<unknown, unknown>(
      FakeWorkerCtor as unknown as new () => Worker,
      {},
      [],
      'test',
    );

    const err = new Error('boom');
    lastWorker!.onerror!({ error: err, message: 'unused' } as ErrorEvent);

    await expect(promise).rejects.toBe(err);
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with a labelled Error built from event.message when event.error is missing', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<unknown, unknown>(
      FakeWorkerCtor as unknown as new () => Worker,
      {},
      [],
      'test-bake',
    );

    lastWorker!.onerror!({ error: null, message: 'something failed' } as unknown as ErrorEvent);

    await expect(promise).rejects.toThrow('something failed');
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('rejects with the label-only fallback when neither error nor message is set', async () => {
    lastWorker = null;
    const promise = runDisposableWorker<unknown, unknown>(
      FakeWorkerCtor as unknown as new () => Worker,
      {},
      [],
      'angular-weights',
    );

    lastWorker!.onerror!({ error: null, message: '' } as unknown as ErrorEvent);

    await expect(promise).rejects.toThrow('angular-weights worker error');
    expect(lastWorker!.terminate).toHaveBeenCalledTimes(1);
  });

  it('passes the transfer list through to postMessage verbatim', async () => {
    lastWorker = null;
    const transfer = [new ArrayBuffer(8), new ArrayBuffer(8)] as Transferable[];
    const promise = runDisposableWorker<{ x: number }, number>(
      FakeWorkerCtor as unknown as new () => Worker,
      { x: 1 },
      transfer,
      'test',
    );

    expect(lastWorker!.postMessage).toHaveBeenCalledWith({ x: 1 }, transfer);

    lastWorker!.onmessage!({ data: 0 } as MessageEvent);
    await promise;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/utils/worker/runDisposableWorker.test.ts`
Expected: FAIL — `Failed to resolve import "../../../src/utils/worker/runDisposableWorker"`.

- [ ] **Step 3: Create the helper**

```ts
// src/utils/worker/runDisposableWorker.ts
/**
 * runDisposableWorker — generic helper for the "spawn a Worker, send
 * one message, wait for one reply, terminate" lifecycle that every
 * off-thread bake in skymap follows.
 *
 * ### Why this module exists
 *
 * Three production sites (Schechter-ratio bake, angular-weight bake,
 * point interleaved-buffer bake) used to inline the same 12-line
 * Promise-wraps-Worker ceremony. The pattern is:
 *
 *   1. `new WorkerCtor()` — fresh worker per call (no shared state).
 *   2. Attach `onmessage` → terminate + resolve(event.data).
 *   3. Attach `onerror` → terminate + reject(event.error ?? message-based fallback).
 *   4. `postMessage(input, transfer)`.
 *
 * Pulling it here means: one place to fix bugs in the cleanup
 * sequence; one place to add a future timeout / abort signal; one
 * place to standardise error fallback messages across bakes.
 *
 * ### Why "disposable"
 *
 * The worker lives for exactly one round trip. The helper doesn't
 * support reuse — that's a different abstraction (a worker pool)
 * with a different lifecycle (cancellation, queuing, lifetime
 * management). The name pins that this is the one-shot variant.
 *
 * ### Error fallback chain
 *
 * Workers can emit ErrorEvents with `event.error`, `event.message`,
 * or neither set. The helper prefers (in order):
 *   1. `event.error` — the most informative form, usually a real Error.
 *   2. `new Error(event.message)` — wraps a plain string in an Error.
 *   3. `new Error('<label> worker error')` — last-resort label-only
 *      fallback so the rejection still carries the bake name.
 */

/**
 * Spawn `WorkerCtor`, post `input` (transferring `transfer`), and
 * resolve with the worker's first message — or reject if the worker
 * emits an error. Terminates the worker on either path.
 *
 * `label` is woven into the all-fallback error message so a rejection
 * with no message and no error still tells you which bake failed.
 */
export function runDisposableWorker<TIn, TOut>(
  WorkerCtor: new () => Worker,
  input: TIn,
  transfer: Transferable[],
  label: string,
): Promise<TOut> {
  return new Promise<TOut>((resolve, reject) => {
    const worker = new WorkerCtor();
    worker.onmessage = (event: MessageEvent<TOut>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event: ErrorEvent) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message || `${label} worker error`));
    };
    worker.postMessage(input, transfer);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/utils/worker/runDisposableWorker.test.ts`
Expected: PASS — 5 passing.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: pass; previous count + 5 new tests.

- [ ] **Step 6: Commit**

```bash
git add src/utils/worker/runDisposableWorker.ts tests/utils/worker/runDisposableWorker.test.ts
git commit -m "$(cat <<'EOF'
feat(utils): runDisposableWorker helper for one-shot off-thread bakes

Generic shared ceremony for the "spawn a Worker, send one message,
wait for one reply, terminate" pattern used by Schechter, angular,
and point-bake runners. Standardises the error-fallback chain
(event.error → new Error(message) → '<label> worker error').
Migration of the three runners arrives in following commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Migrate `defaultSchechterRunner`

**Files:**
- Modify: `src/services/engine/subsystems/biasCorrectionSubsystem.ts` (the `defaultSchechterRunner` function around lines 189-231)

- [ ] **Step 1: Add the imports**

Near the top of `src/services/engine/subsystems/biasCorrectionSubsystem.ts`, with the existing imports (look for the `import ComputeSchechterRatiosWorker` block around line 108), add:

```ts
import { clonePointCloudForTransfer } from '../../../data/pointCloudTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';
```

(Path is relative from `src/services/engine/subsystems/` → up three levels to `src/`, then into `data/` or `utils/worker/`.)

- [ ] **Step 2: Replace the `defaultSchechterRunner` body**

Locate `function defaultSchechterRunner(...)` around line 189. Replace the entire function body (everything from `return new Promise(...)` through the closing `});`) so the function becomes:

```ts
function defaultSchechterRunner(input: ComputeSchechterRatiosInput): Promise<Float32Array> {
  const { copy, transfer } = clonePointCloudForTransfer(input.cloud);
  return runDisposableWorker<ComputeSchechterRatiosInput, Float32Array>(
    ComputeSchechterRatiosWorker,
    { ...input, cloud: copy },
    transfer,
    'schechter-ratio',
  );
}
```

(Keep the existing docblock above the function — its rationale about per-call workers, slice-then-transfer, and the spec history is still load-bearing.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS at the same count as Task 2's final number. The bias-correction tests inject a stub runner via DI, so the production worker code path doesn't run in test — but the function still has to typecheck and import cleanly.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/engine/subsystems/biasCorrectionSubsystem.ts
git commit -m "$(cat <<'EOF'
refactor(bias): defaultSchechterRunner uses shared helpers

Replace the inline 40-line slice-then-transfer + Promise-wraps-Worker
ceremony with clonePointCloudForTransfer + runDisposableWorker.
Behaviour identical — the DI seam stays intact for tests.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Migrate `defaultAngularRunner`

**Files:**
- Modify: `src/services/engine/subsystems/biasCorrectionSubsystem.ts` (the `defaultAngularRunner` function around lines 245-290)

The imports added in Task 3 are still present — only the function body changes.

- [ ] **Step 1: Replace the `defaultAngularRunner` body**

Locate `function defaultAngularRunner(...)` around line 245. Replace the entire function body so the function becomes:

```ts
function defaultAngularRunner(input: ComputeAngularWeightsInput): Promise<Float32Array> {
  const { copy, transfer } = clonePointCloudForTransfer(input.cloud);
  return runDisposableWorker<ComputeAngularWeightsInput, Float32Array>(
    ComputeAngularWeightsWorker,
    { ...input, cloud: copy },
    transfer,
    'angular-weights',
  );
}
```

(Keep its docblock above the function.)

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS unchanged.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/subsystems/biasCorrectionSubsystem.ts
git commit -m "$(cat <<'EOF'
refactor(bias): defaultAngularRunner uses shared helpers

Mirrors the Schechter migration in the same file — same shared
clonePointCloudForTransfer + runDisposableWorker call shape with
the angular-weights worker constructor and label.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Migrate point-bake `defaultWorkerRunner`

**Files:**
- Modify: `src/services/gpu/renderers/pointRenderer.ts` (the `defaultWorkerRunner` function around lines 432-490)

- [ ] **Step 1: Add the imports**

Near the top of `src/services/gpu/renderers/pointRenderer.ts`, with the existing imports (look for the `import BuildPointBufferWorker` line around line 61), add:

```ts
import { clonePointCloudForTransfer } from '../../../data/pointCloudTransfer';
import { runDisposableWorker } from '../../../utils/worker/runDisposableWorker';
```

(Path is relative from `src/services/gpu/renderers/` → up three levels to `src/`, then into `data/` or `utils/worker/`.)

- [ ] **Step 2: Replace the `defaultWorkerRunner` body**

Locate `function defaultWorkerRunner(...)` around line 432. Replace the entire body so the function becomes:

```ts
function defaultWorkerRunner(
  input: BuildPointInterleavedBufferInput,
): Promise<BuildPointInterleavedBufferResult> {
  const { copy, transfer } = clonePointCloudForTransfer(input.cloud);
  return runDisposableWorker<BuildPointInterleavedBufferInput, BuildPointInterleavedBufferResult>(
    BuildPointBufferWorker,
    { ...input, cloud: copy },
    transfer,
    'point-bake',
  );
}
```

(Keep the long docblock above this function — the BigUint64Array note and the "alternative considered" reasoning are still load-bearing context.)

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS unchanged.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the production build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Manual visual smoke test (recommendation to parent)**

The implementer must NOT perform this (no browser access). The parent should verify in the browser:

- A source upload still completes (the point-bake worker is invoked during `engine.points.uploadSource(...)` / source switch flows; if the migration broke the worker call path, no points would render after a tier or source change).
- Toggle a source visibility off and on — galaxies from that source still appear with the right colors.
- Switch tier (e.g. medium → large) — the new bake completes and points render.

If any of these fails, the implementer should revert all three migration commits (Tasks 3, 4, 5) and re-investigate; the helpers themselves are covered by unit tests so the bug is almost certainly in the call-site wiring.

- [ ] **Step 7: Commit**

```bash
git add src/services/gpu/renderers/pointRenderer.ts
git commit -m "$(cat <<'EOF'
refactor(point): defaultWorkerRunner uses shared helpers

Final migration — the point interleaved-buffer bake now uses the
same clonePointCloudForTransfer + runDisposableWorker pair as the
Schechter and angular bakes. Three byte-for-byte-identical
inline ceremonies are now zero.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification, push, PR

**Files:** none — verification + PR open.

- [ ] **Step 1: Final test suite run**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS for both `tsconfig.json` and `tsconfig.tools.json`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 4: Verify git log**

Run: `git log --oneline main..HEAD`
Expected: 5 implementation commits + 1 plan commit (the plan was committed in a separate step before the implementation began). Order from oldest to newest:

```
<sha1>  docs(plans): runDisposableWorker + clonePointCloudForTransfer — audit #2 plan
<sha2>  feat(data): clonePointCloudForTransfer helper
<sha3>  feat(utils): runDisposableWorker helper for one-shot off-thread bakes
<sha4>  refactor(bias): defaultSchechterRunner uses shared helpers
<sha5>  refactor(bias): defaultAngularRunner uses shared helpers
<sha6>  refactor(point): defaultWorkerRunner uses shared helpers
```

- [ ] **Step 5: Push the branch**

Run: `git push -u origin refactor/run-disposable-worker`
Expected: branch pushed.

- [ ] **Step 6: Open the PR**

Run:

```bash
gh pr create --title "refactor: runDisposableWorker + clonePointCloudForTransfer" --body "$(cat <<'EOF'
## Summary

Addresses audit finding #2 from the second architectural audit
(2026-05-11): three byte-for-byte-identical worker-runner Promise
bodies (Schechter, angular, point-bake) plus three identical
PointCloud slice-and-transfer ceremonies, with no shared symbol.

This PR introduces two helpers (one generic, one PointCloud-aware)
and collapses each runner from ~40 lines to ~8.

### Files added
- \`src/data/pointCloudTransfer.ts\` — \`clonePointCloudForTransfer\`
- \`src/utils/worker/runDisposableWorker.ts\` — generic worker lifecycle helper
- \`tests/data/pointCloudTransfer.test.ts\` — 5 tests
- \`tests/utils/worker/runDisposableWorker.test.ts\` — 5 tests

### Migration
- \`defaultSchechterRunner\` (biasCorrectionSubsystem.ts)
- \`defaultAngularRunner\` (biasCorrectionSubsystem.ts)
- \`defaultWorkerRunner\` (pointRenderer.ts) — point interleaved-buffer bake

### Why this matters

Before: adding a new \`PointCloud\` field required editing three runner
sites in lockstep; a missed edit silently sent \`undefined\` through
the worker boundary. After: one helper owns the cloud transfer-list,
one helper owns the worker ceremony. Future runners are 8 lines.

## Test plan

- [x] \`npm test\` — passing (+ 10 new tests)
- [x] \`npm run typecheck\` — clean
- [x] \`npm run build\` — clean
- [x] Source upload + tier switch + visibility toggle work in the browser

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: gh prints the PR URL.

---

## Self-Review

**Spec coverage:**
- Audit #2 listed three sites + the shared PointCloud transfer list. Plan covers all three (Tasks 3, 4, 5) plus the helpers (Tasks 1, 2). ✓
- The fallback error message format (`event.error ?? new Error(event.message ?? '<label> worker error')`) is preserved verbatim in the new helper, asserted by test, and supplied by each migrated runner with its own label. ✓

**Placeholder scan:** No "TBD", "TODO", "implement later" in any task. Every step has concrete code + exact commands. ✓

**Type consistency:**
- `clonePointCloudForTransfer(cloud: PointCloud) → { copy: PointCloud; transfer: Transferable[] }` referenced identically in Tasks 1, 3, 4, 5.
- `runDisposableWorker<TIn, TOut>(WorkerCtor, input, transfer, label) → Promise<TOut>` referenced identically in Tasks 2, 3, 4, 5.
- Worker constructor types `new () => Worker` are satisfied by Vite's `?worker` default exports (existing usage proves this).
- Per-runner type instantiations (`ComputeSchechterRatiosInput → Float32Array`, etc.) are imported from existing modules and preserved.

**Known scope omissions (intentional):**
- The DI seam in `BiasCorrectionDeps.schechterRunner` / `BiasCorrectionDeps.angularRunner` and the module-level `buildRunner` binding in `pointRenderer.ts` are unchanged — tests still inject their stubs as before.
- The worker file paths (`?worker` Vite imports) are unchanged.
- No type aliases for `Runner = (input: ...) => Promise<...>` are added; they already exist in `biasCorrectionSubsystem.ts`.
- The audit's deeper observation that worker management could include cancellation / abort signals is deferred — out of scope for this dedup.
