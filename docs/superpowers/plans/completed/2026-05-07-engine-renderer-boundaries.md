# Engine ↔ Renderer Boundary Tightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push five renderer-internal concerns out of `engine.ts` and back into the renderer/loading layer so engine.ts stops duplicating renderer state.

**Architecture:** Five independent PRs, each shipping one item from the spec. Each PR adds methods or files in the renderer/loading layer, deletes the equivalent leaked code in engine.ts, and ships with one regression test for the contract being moved. Engine.ts shrinks by ~150 lines; no structural reorganisation (deferred to spec B).

**Tech Stack:** TypeScript 5, Vitest, WebGPU (mocked in tests), existing `AssetSlot` machinery from the asset-loading subsystem.

**Spec:** [`docs/superpowers/specs/2026-05-07-engine-renderer-boundaries-design.md`](../specs/2026-05-07-engine-renderer-boundaries-design.md)

---

## Conventions for this plan

- **Branch + PR per phase.** Every PR ships from its own branch off `main`; never commit directly to `main`. Use `gh pr create` after the branch is pushed.
- **Commits.** Use the user's git identity (no `--author=Claude…`). Add `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` in the message body.
- **Test runner.** `npx vitest run path/to/test.test.ts` for a single file; `npm test` for the full suite.
- **Type-check.** `npm run typecheck` before each commit.
- **Dev server.** Leave `npm run dev` running in the background; it provides HMR visual checks for any UI-adjacent change.
- **PR ordering.** Ship PRs in the order below. Each PR's branch starts from `main` after the previous PR has merged.

---

## Phase 1 — Synthetic-as-slot (item #11)

Wire the synthetic point cloud through the existing `AssetSlot` machinery so the bootstrap fallback flows through the same `fetch → commit → upload` path as every other survey.

### Task 1: Synthetic point fetcher

**Files:**
- Create: `src/services/loading/fetchers/syntheticPointFetcher.ts`
- Test: `tests/services/loading/fetchers/syntheticPointFetcher.test.ts`

- [ ] **Step 1: Create branch off main**

```bash
git checkout main && git pull
git checkout -b chore/synthetic-as-slot
```

- [ ] **Step 2: Write the failing test**

Create `tests/services/loading/fetchers/syntheticPointFetcher.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { syntheticPointFetcher, SYNTHETIC_POINT_COUNT } from '../../../../src/services/loading/fetchers/syntheticPointFetcher';
import { Source } from '../../../../src/data/sources';

describe('syntheticPointFetcher', () => {
  it('returns a deterministic synthetic cloud regardless of request fields', async () => {
    const ac = new AbortController();
    const cloud = await syntheticPointFetcher(
      { source: Source.Synthetic, tier: 'medium' },
      ac.signal,
      () => {},
    );
    expect(cloud.count).toBe(SYNTHETIC_POINT_COUNT);
    expect(cloud.positions.length).toBe(SYNTHETIC_POINT_COUNT * 3);
  });

  it('ignores tier — same cloud for medium and large', async () => {
    const ac = new AbortController();
    const a = await syntheticPointFetcher(
      { source: Source.Synthetic, tier: 'medium' },
      ac.signal,
      () => {},
    );
    const b = await syntheticPointFetcher(
      { source: Source.Synthetic, tier: 'large' },
      ac.signal,
      () => {},
    );
    expect(a.count).toBe(b.count);
    // Deterministic seed → identical first triple of coordinates
    expect(a.positions[0]).toBe(b.positions[0]);
    expect(a.positions[1]).toBe(b.positions[1]);
    expect(a.positions[2]).toBe(b.positions[2]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/services/loading/fetchers/syntheticPointFetcher.test.ts
```

Expected: FAIL with `Cannot find module '.../syntheticPointFetcher'`.

- [ ] **Step 4: Write the fetcher**

Create `src/services/loading/fetchers/syntheticPointFetcher.ts`:

```ts
/**
 * syntheticPointFetcher — `Fetcher<PointCloud, PointCloudReq>` that
 * resolves synchronously to a deterministic procedural cloud.
 *
 * ### Why this exists
 *
 * The boot path needs a fallback when every real survey is empty/errored
 * (no network, missing .bin files, dev launch with no data).  Pre-spec-A
 * the engine called `renderer.upload(Source.Synthetic, generateSyntheticCloud(...))`
 * directly, bypassing the slot machinery — two code paths for the same
 * conceptual "this source is now on the GPU" event.
 *
 * Routing the synthetic through a slot collapses both paths into one.
 * Synthetic gets the same fade-in, the same `LoadingDevPanel` row, the
 * same retry semantics, and the same race-checked commit ordering as
 * every real survey for free.
 *
 * ### Why a fixed count
 *
 * 100k matches the hard-coded value the legacy direct-upload path used.
 * The synthetic generator's reason-for-existing is "give the user
 * something to look at when no real data is available"; making the
 * count user-tunable would expand surface area for no real-world need.
 *
 * ### Why this fetcher ignores `req.source` and `req.tier`
 *
 * The slot's typed `Req = PointCloudReq = { source, tier }` because the
 * `state.assetSlots.points` Map is uniformly typed across every entry.
 * For the synthetic slot specifically, the request fields carry no
 * information — the cloud is pure procedural.  We accept the standard
 * shape so the slot wiring at the engine boot site is uniform with
 * every other source's `slot.load({ source, tier })` call.
 */

import type { Fetcher } from '../types';
import type { PointCloud } from '../../../@types';
import type { PointCloudReq } from './pointCloudFetcher';
import { generateSyntheticCloud } from '../../../data/synthetic';

/** Hard-coded synthetic cloud size — matches the legacy fallback. */
export const SYNTHETIC_POINT_COUNT = 100_000;

export const syntheticPointFetcher: Fetcher<PointCloud, PointCloudReq> = async () => {
  return generateSyntheticCloud(SYNTHETIC_POINT_COUNT);
};
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/services/loading/fetchers/syntheticPointFetcher.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/loading/fetchers/syntheticPointFetcher.ts tests/services/loading/fetchers/syntheticPointFetcher.test.ts
git commit -m "$(cat <<'EOF'
feat(loading): syntheticPointFetcher

Resolves synchronously to a deterministic 100k-point procedural cloud.
Accepts the standard `PointCloudReq` shape so the engine's slot-wiring
loop can include `Source.Synthetic` alongside every other survey.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 2: Wire synthetic slot into bootstrap

**Files:**
- Modify: `src/services/engine/engine.ts:718-764` (slot construction loop)
- Modify: `src/services/engine/engine.ts:1086-1093` (synthetic fallback block)
- Modify: `src/services/engine/engine.ts:1044-1046` (REAL_POINT_SOURCES / ALL_POINT_SOURCES constants — verify untouched)

- [ ] **Step 1: Add synthetic to the slot construction loop**

In `src/services/engine/engine.ts`, find the slot construction loop near line 718:

```ts
for (const source of [Source.SDSS, Source.TwoMRS, Source.Glade, Source.Famous]) {
```

Change it to include `Source.Synthetic`:

```ts
for (const source of [
  Source.SDSS,
  Source.TwoMRS,
  Source.Glade,
  Source.Famous,
  Source.Synthetic,
]) {
```

The body of the loop is unchanged — `pointCloudFetcher` is wrong for synthetic, so we need a per-source fetcher selection. Update the `createAssetSlot` call body:

```ts
const slotName = `${sourceName(source)}-points`;
const fetch = source === Source.Synthetic ? syntheticPointFetcher : pointCloudFetcher;
const slot = createAssetSlot({
  name: slotName,
  fetch,
  commit: async (cloud) => {
    // … existing commit body unchanged …
  },
});
```

Add the import near the top of `engine.ts` alongside the other fetcher imports:

```ts
import { syntheticPointFetcher } from '../loading/fetchers/syntheticPointFetcher';
```

- [ ] **Step 2: Replace the direct-upload synthetic fallback**

Find the block near line 1086:

```ts
if (!pointsAnyReady && state.gpu.renderer) {
  const synthetic = generateSyntheticCloud(100_000);
  await state.gpu.renderer.upload(Source.Synthetic, synthetic);
  state.sources.clouds.set(Source.Synthetic, synthetic);
  cb.onCloudReady?.(Source.Synthetic, synthetic.count);
  state.subsystems.scheduler.requestRender();
  firstReadySource = Source.Synthetic;
}
```

Replace with the slot-driven equivalent:

```ts
// Synthetic fallback — every real survey is empty/errored.  Drive
// through the synthetic slot so the same fetch → commit → upload path
// runs (fade-in, dev-panel row, race-checked commit).  See
// `syntheticPointFetcher.ts` for why this lives behind a slot.
if (!pointsAnyReady) {
  const synthSlot = state.assetSlots.points.get(Source.Synthetic);
  if (synthSlot) {
    await new Promise<void>((resolve) => {
      const unsub = synthSlot.subscribe((s) => {
        if (s.kind === 'ready' || s.kind === 'error') {
          unsub();
          resolve();
        }
      });
      synthSlot.load({ source: Source.Synthetic, tier: state.sources.tier });
    });
    if (synthSlot.state().kind === 'ready') {
      firstReadySource = Source.Synthetic;
    }
  }
}
```

- [ ] **Step 3: Drop the now-unused direct-upload import**

Check line 116 — `generateSyntheticCloud` was imported for the inline path that just got deleted. The new path imports it only via the fetcher. Remove the engine-side import:

```ts
// Delete this line in engine.ts (top of file imports):
import { generateSyntheticCloud } from '../../data/synthetic';
```

- [ ] **Step 4: Type-check + run full test suite**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, all 590+ tests pass. The synthetic-fallback path is exercised at engine boot via the existing engine-level tests.

- [ ] **Step 5: Manual smoke test**

Open the dev server (already running). With network DevTools throttling set to "Offline", reload. Confirm:
- Status bar shows "Synthetic" as the source.
- Dev panel (press `d`) shows a `synthetic-points` slot row that transitioned to `ready`.
- ~100k points visible in the scene.

If the dev server is not running, start it: `npm run dev`.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
refactor(engine): route synthetic fallback through slot machinery

The bootstrap's "no real survey loaded" fallback now uses the new
synthetic slot rather than calling renderer.upload directly.  One
upload path for every source; synthetic gets fade-in / dev-panel
visibility / race-checked commit for free.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 3: PR for Phase 1

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/synthetic-as-slot
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "chore(engine): synthetic fallback through asset slot" --body "$(cat <<'EOF'
## Summary
- Adds `syntheticPointFetcher` returning a deterministic 100k-point cloud.
- Wires `Source.Synthetic` into the engine's slot loop alongside the real surveys.
- Replaces the direct `renderer.upload(Source.Synthetic, ...)` fallback with a slot-driven `load()`.

Part of the engine↔renderer boundary tightening (spec A, item #11). One upload path for every source.

## Test plan
- [ ] `npm test` green (590+ tests).
- [ ] `npm run typecheck` clean.
- [ ] DevTools "Offline" reload: synthetic appears, dev panel shows the slot row, ~100k points visible.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review + merge before starting Phase 2**

---

## Phase 2 — Instance numbering on PointRenderer (item #7)

Move the global ↔ (source, localIdx) encoding into the renderer. Engine becomes a pure consumer.

### Task 4: Add `toGlobalIdx` and `fromGlobalIdx` to PointRenderer

**Files:**
- Modify: `src/services/gpu/pointRenderer.ts:1597-1605` (next to `instanceIdOffset`)
- Test: `tests/services/gpu/pointRenderer.test.ts`

- [ ] **Step 1: Create branch off main**

```bash
git checkout main && git pull
git checkout -b chore/instance-numbering
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/services/gpu/pointRenderer.test.ts` (within the existing test setup that registers `setBuildBufferRunner`):

```ts
describe('PointRenderer global-idx encoding', () => {
  it('toGlobalIdx + fromGlobalIdx round-trip across multiple sources', async () => {
    const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
    await renderer.upload(Source.SDSS, makeStubCloud(100));
    await renderer.upload(Source.TwoMRS, makeStubCloud(50));
    await renderer.upload(Source.Glade, makeStubCloud(200));

    // SDSS: localIdx 0 → globalIdx 0; TwoMRS: localIdx 0 → globalIdx 100;
    // Glade: localIdx 0 → globalIdx 150.
    expect(renderer.toGlobalIdx(Source.SDSS, 0)).toBe(0);
    expect(renderer.toGlobalIdx(Source.TwoMRS, 0)).toBe(100);
    expect(renderer.toGlobalIdx(Source.Glade, 199)).toBe(349);

    // fromGlobalIdx is the inverse.
    expect(renderer.fromGlobalIdx(0)).toEqual({ source: Source.SDSS, localIdx: 0 });
    expect(renderer.fromGlobalIdx(99)).toEqual({ source: Source.SDSS, localIdx: 99 });
    expect(renderer.fromGlobalIdx(100)).toEqual({ source: Source.TwoMRS, localIdx: 0 });
    expect(renderer.fromGlobalIdx(149)).toEqual({ source: Source.TwoMRS, localIdx: 49 });
    expect(renderer.fromGlobalIdx(150)).toEqual({ source: Source.Glade, localIdx: 0 });
    expect(renderer.fromGlobalIdx(349)).toEqual({ source: Source.Glade, localIdx: 199 });
  });

  it('fromGlobalIdx returns null for out-of-range indices', async () => {
    const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
    await renderer.upload(Source.SDSS, makeStubCloud(100));

    // Past the end of every loaded source.
    expect(renderer.fromGlobalIdx(100)).toBeNull();
    expect(renderer.fromGlobalIdx(1_000_000)).toBeNull();
  });

  it('toGlobalIdx returns 0 for unloaded sources (matches instanceIdOffset)', async () => {
    const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
    // Nothing uploaded — every source's offset is 0.
    expect(renderer.toGlobalIdx(Source.SDSS, 5)).toBe(5);
    expect(renderer.toGlobalIdx(Source.Glade, 5)).toBe(5);
  });
});
```

The test file already has helpers `makeStubDevice` and `makeStubCloud` from prior tests; if not, copy the patterns used by the existing `upload` test in the same file.

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/services/gpu/pointRenderer.test.ts -t "global-idx encoding"
```

Expected: FAIL with `renderer.toGlobalIdx is not a function`.

- [ ] **Step 4: Implement the methods**

In `src/services/gpu/pointRenderer.ts`, immediately after the existing `instanceIdOffset(source: Source): number` method (~line 1605), add:

```ts
  /**
   * Encode a (source, localIdx) pair into the global instance ID the
   * picker writes into the pick texture.  Inverse of `fromGlobalIdx`.
   *
   * Why this lives on the renderer: the encoding rule (sum of prior-
   * source counts in `Source` enum order) is the renderer's, baked
   * into every per-instance vertex buffer's `globalInstanceIdx` slot.
   * Engine consumers (the `selectFamous` / `selectByAlias` palette
   * paths) ask the renderer "what's the global ID for this source's
   * Nth point?" rather than re-deriving the rule themselves — keeps
   * the encoding to one source of truth.
   *
   * Returns `instanceIdOffset(source) + localIdx`; equivalent to
   * `instanceIdOffset(source) + localIdx` at the call site, expressed
   * as one method on the boundary instead of two.
   */
  toGlobalIdx(source: Source, localIdx: number): number {
    return (this.clouds.get(source)?.instanceIdOffset ?? 0) + localIdx;
  }

  /**
   * Decode a global instance ID into the (source, localIdx) pair that
   * lets a caller look the point up in its source-specific cloud.
   * Inverse of `toGlobalIdx`.
   *
   * Returns `null` when the global ID:
   *   - falls past the end of every loaded source, OR
   *   - decodes to a `localIdx >= count` for the resolved source
   *     (which can transiently happen during a tier-swap window —
   *     see the bounds-check comment for the user-visible bug this
   *     defends against).
   *
   * Walks `loadedSources()` in enum order and subtracts each source's
   * count from the running global ID.  Engine's previous
   * `resolveGlobalIdx` did this inline — moved here so the encoding
   * rule lives entirely inside the renderer.
   */
  fromGlobalIdx(globalIdx: number): { source: Source; localIdx: number } | null {
    let remaining = globalIdx;
    for (const entry of this.loadedSources()) {
      if (remaining < entry.count) {
        return { source: entry.source, localIdx: remaining };
      }
      remaining -= entry.count;
    }
    return null;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/services/gpu/pointRenderer.test.ts -t "global-idx encoding"
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/pointRenderer.ts tests/services/gpu/pointRenderer.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): toGlobalIdx + fromGlobalIdx on PointRenderer

Symmetric encode/decode of the cross-survey global instance ID space.
The encoding rule (running sum of prior-source counts in enum order)
moves out of engine.ts into the renderer where it's already baked
into the per-instance vertex buffer's globalInstanceIdx slot.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 5: Replace engine's `resolveGlobalIdx` and `pointInfoFromGlobal`

**Files:**
- Modify: `src/services/engine/engine.ts:474-511` (delete `resolveGlobalIdx`, simplify `pointInfoFromGlobal`)
- Modify: `src/services/engine/engine.ts:1110-1125` (simplify `clickResolver` callback)

- [ ] **Step 1: Delete `resolveGlobalIdx` and rewrite `pointInfoFromGlobal`**

In `src/services/engine/engine.ts`, find the block at lines 474-511 (currently `resolveGlobalIdx` + `pointInfoFromGlobal`).

Delete the entire `resolveGlobalIdx` function (lines 474-484).

Replace `pointInfoFromGlobal` (lines 487-511) with:

```ts
  /** Build a PointInfo from a global picker index, or null if unresolvable. */
  function pointInfoFromGlobal(globalIdx: number) {
    const resolved = state.gpu.renderer?.fromGlobalIdx(globalIdx);
    if (!resolved) return null;
    const c = state.sources.clouds.get(resolved.source);
    if (!c) return null;
    return buildPointInfo(
      c,
      resolved.localIdx,
      resolved.source,
      state.sources.famousMeta,
      state.sources.famousXrefs,
    );
  }
```

The `if (resolved.localIdx >= c.count) return null;` bounds check is gone — `fromGlobalIdx` returns `null` for that case.

- [ ] **Step 2: Simplify the `createClickResolver` `resolveGlobalIdx` callback**

Find the block at lines 1110-1125 in `src/services/engine/engine.ts` (`createClickResolver({ pickRenderer, resolveGlobalIdx: ..., buildPointInfo: ... })`).

Replace the `resolveGlobalIdx` callback body:

```ts
        resolveGlobalIdx: (globalIdx) => {
          const r = state.gpu.renderer?.fromGlobalIdx(globalIdx);
          if (!r) return null;
          const cloud = state.sources.clouds.get(r.source);
          if (!cloud) return null;
          return { source: r.source, localIdx: r.localIdx, cloud };
        },
```

The `if (r.localIdx >= cloud.count) return null;` bounds-check is gone; `fromGlobalIdx` already enforces it.

- [ ] **Step 3: Type-check + run full test suite**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass. The hover/click behaviour is identical (encoding rule moved, semantics unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
refactor(engine): consume renderer.fromGlobalIdx instead of inline resolver

Deletes engine.ts's duplicate of the global-idx decoding rule; engine
now asks the renderer for the (source, localIdx) pair.  The bounds-
check that defended against the tier-swap-window crash moves into
fromGlobalIdx — same protection, one source of truth.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 6: Replace `instanceIdOffset(source) + localIdx` encoding sites

**Files:**
- Modify: `src/services/engine/engine.ts:2117-2118` (selectFamous)
- Modify: `src/services/engine/engine.ts:2207-2208` (selectByAlias)

- [ ] **Step 1: Update `selectFamous`**

Find the block in `src/services/engine/engine.ts` near line 2117:

```ts
      const offset = state.gpu.renderer?.instanceIdOffset(Source.Famous) ?? 0;
      const globalIdx = offset + localIdx;
```

Replace with:

```ts
      const globalIdx = state.gpu.renderer?.toGlobalIdx(Source.Famous, localIdx) ?? localIdx;
```

The fallback (`?? localIdx`) preserves the prior behaviour: if the renderer is unavailable for some reason, `instanceIdOffset(...)` returned 0 so `globalIdx = 0 + localIdx = localIdx`. Same end result, expressed via the new method.

- [ ] **Step 2: Update `selectByAlias`**

Find the block in `src/services/engine/engine.ts` near line 2207:

```ts
      const offset = state.gpu.renderer?.instanceIdOffset(source) ?? 0;
      const globalIdx = offset + localIdx;
```

Replace with:

```ts
      const globalIdx = state.gpu.renderer?.toGlobalIdx(source, localIdx) ?? localIdx;
```

- [ ] **Step 3: Type-check + run full test suite**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
refactor(engine): consume renderer.toGlobalIdx in selectFamous/selectByAlias

Removes the inline `instanceIdOffset(source) + localIdx` encoding at
both palette entry points.  Symmetric counterpart to the
fromGlobalIdx migration — encoding now lives entirely on the
renderer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 7: PR for Phase 2

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/instance-numbering
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "refactor(gpu): own global-idx encoding in PointRenderer" --body "$(cat <<'EOF'
## Summary
- Adds `toGlobalIdx(source, localIdx)` and `fromGlobalIdx(globalIdx)` on `PointRenderer`.
- Engine deletes its duplicate `resolveGlobalIdx` and simplifies `pointInfoFromGlobal` + the click resolver hook.
- `selectFamous` / `selectByAlias` consume `toGlobalIdx` instead of inlining the offset+localIdx encoding.

The bounds-check that defended against the tier-swap-window crash moves into `fromGlobalIdx` — same protection, single source of truth.

Part of the engine↔renderer boundary tightening (spec A, item #7).

## Test plan
- [ ] `npm test` green (existing tests + 3 new unit tests for the round-trip).
- [ ] `npm run typecheck` clean.
- [ ] Manual: hover/click a galaxy and verify the InfoCard renders correctly across all loaded surveys.
- [ ] Manual: tier swap medium → large → medium; verify no crashes and the card resolves correctly mid-swap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review + merge before starting Phase 3**

---

## Phase 3 — Pick coupling (item #10)

Bind PickRenderer to its PointRenderer at construction time. Drop the per-call `uniformBuffer` arg. Make the public `pointRenderer.uniformBuffer` getter private.

### Task 8: Change `createPickRenderer` signature

**Files:**
- Modify: `src/services/gpu/pickRenderer.ts:138-155` (drop `sharedUniformBuffer` from `pick()`)
- Modify: `src/services/gpu/pickRenderer.ts:214` (constructor takes `pointRenderer`)
- Modify: `src/services/gpu/pickRenderer.ts:405-411` (read `this.pointRenderer.uniformBuffer` internally)

- [ ] **Step 1: Create branch off main**

```bash
git checkout main && git pull
git checkout -b chore/pick-coupling
```

- [ ] **Step 2: Write the failing test**

Modify `tests/services/gpu/pickRenderer.test.ts` (or create one if absent — check the directory first):

```bash
ls tests/services/gpu/pickRenderer.test.ts 2>/dev/null && echo "exists" || echo "missing"
```

If it doesn't exist, create `tests/services/gpu/pickRenderer.test.ts`:

```ts
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { createPickRenderer } from '../../../src/services/gpu/pickRenderer';
import { PointRenderer } from '../../../src/services/gpu/pointRenderer';

beforeAll(() => {
  // Same WebGPU global stubs the other gpu tests use; mirror their pattern.
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUTextureUsage ??= {
    COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10,
  };
  g.GPUBufferUsage ??= {
    MAP_READ: 0x01, COPY_SRC: 0x04, COPY_DST: 0x08,
    UNIFORM: 0x40, VERTEX: 0x20,
  };
  g.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
  g.GPUMapMode ??= { READ: 1, WRITE: 2 };
});

function makeStubDevice(): GPUDevice {
  // Minimal stub — enough for createPickRenderer construction.
  return {
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: () => ({}),
    })),
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
    })),
    createTexture: vi.fn(() => ({
      createView: () => ({}),
      destroy: vi.fn(),
    })),
    queue: { writeBuffer: vi.fn(), submit: vi.fn() },
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), setVertexBuffer: vi.fn(), draw: vi.fn(), end: vi.fn() }),
      copyTextureToBuffer: vi.fn(),
      finish: vi.fn(),
    })),
    createBindGroup: vi.fn(),
  } as unknown as GPUDevice;
}

describe('createPickRenderer', () => {
  it('takes a PointRenderer at construction (no per-call uniformBuffer arg)', () => {
    const device = makeStubDevice();
    const pointRenderer = new PointRenderer(device, 'rgba16float');
    const pickRenderer = createPickRenderer(device, pointRenderer);

    // The compile-time test is the strongest one: this file would fail
    // to typecheck if `createPickRenderer` still required only a device
    // (or if `pick()` still wanted a sharedUniformBuffer arg).  Runtime
    // assertion is a sanity check that construction returned a usable
    // handle.
    expect(pickRenderer).toBeDefined();
    expect(typeof pickRenderer.pick).toBe('function');
    expect(typeof pickRenderer.destroy).toBe('function');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/services/gpu/pickRenderer.test.ts
```

Expected: FAIL — `createPickRenderer` currently takes 1 arg, not 2.

- [ ] **Step 4: Update `createPickRenderer` signature and `pick()` body**

In `src/services/gpu/pickRenderer.ts`:

Replace the `PickRenderer` type's `pick` signature (lines 138-155):

```ts
  pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    /**
     * The user's current `pointSizePx` setting.  Used to compute the
     * pick-pass floor: `pointSizePx + PICK_PADDING_PX` is written into
     * the shared uniform buffer just before the pick pass so distant
     * point-like galaxies become easier to hover/click.  See
     * `PICK_PADDING_PX` for the rationale.
     *
     * Optional for backwards compatibility — when omitted, the pick
     * pass reads whatever the visual frame last wrote (no boost).
     */
    pointSizePx?: number,
  ): Promise<number>;
```

Note: `sharedUniformBuffer` is gone; the doc paragraph that referenced it stays (it's now an internal detail).

Update the factory signature on line 214:

```ts
import type { PointRenderer } from './pointRenderer';

export function createPickRenderer(
  device: GPUDevice,
  pointRenderer: PointRenderer,
): PickRenderer {
```

Update the `pick` function body — replace the parameter list (line 405) and the internal uniform-buffer reads:

```ts
  async function pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    pointSizePx?: number,
  ): Promise<number> {
    const sharedUniformBuffer = pointRenderer.uniformBuffer;
    // … rest of the function body unchanged; the four internal references
    // to `sharedUniformBuffer` (the writeBuffer calls and the bindGroup
    // entry) all read from the local const above.
```

The body's three internal references stay the same — `device.queue.writeBuffer(sharedUniformBuffer, ...)` and `entries: [{ binding: 0, resource: { buffer: sharedUniformBuffer } }]`.

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/services/gpu/pickRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/pickRenderer.ts tests/services/gpu/pickRenderer.test.ts
git commit -m "$(cat <<'EOF'
refactor(gpu): bind PickRenderer to PointRenderer at construction

PickRenderer holds its PointRenderer reference for the uniform-buffer
read instead of having every caller thread the buffer through pick().
Visibility (`visibleSources`) stays as a per-call arg — that's engine
state, not renderer state.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 9: Update engine + clickHandler call sites; make `uniformBuffer` private

**Files:**
- Modify: `src/services/engine/engine.ts:1102` (createPickRenderer call)
- Modify: `src/services/engine/engine.ts:1271-1297` (`runPickAtCss` body — drop `uniformBuffer` from `cr.resolveClick(...)`)
- Modify: `src/services/engine/engine.ts:1644-1654` (hover-pick site — drop `uniformBuffer` from `pickRenderer.pick(...)`)
- Modify: `src/services/engine/clickHandler.ts:84-104` (`ClickResolveInput.uniformBuffer` removed)
- Modify: `src/services/engine/clickHandler.ts:148-172` (resolver passes through fewer args)
- Modify: `src/services/gpu/pointRenderer.ts:856` (make `uniformBuffer` getter private — change `get uniformBuffer()` to `get uniformBuffer()` with `private` modifier)

- [ ] **Step 1: Update the engine's createPickRenderer call**

In `src/services/engine/engine.ts` near line 1102:

```ts
      const pickRenderer = createPickRenderer(device);
```

Change to:

```ts
      const pickRenderer = createPickRenderer(device, renderer);
```

- [ ] **Step 2: Drop `uniformBuffer` from `runPickAtCss`**

Find the block in `src/services/engine/engine.ts` near line 1288:

```ts
        return cr.resolveClick({
          pickXPx: cssToTexPx(xCss),
          pickYPx: cssToTexPx(yCss),
          viewportPx: [canvas.width, canvas.height],
          visibleSources,
          uniformBuffer: r.uniformBuffer,
          pointSizePx: state.settings.pointSizePx,
        });
```

Remove the `uniformBuffer: r.uniformBuffer,` line:

```ts
        return cr.resolveClick({
          pickXPx: cssToTexPx(xCss),
          pickYPx: cssToTexPx(yCss),
          viewportPx: [canvas.width, canvas.height],
          visibleSources,
          pointSizePx: state.settings.pointSizePx,
        });
```

- [ ] **Step 3: Drop `uniformBuffer` from the hover-pick call**

Find the block near line 1644:

```ts
          state.gpu
            .pickRenderer!.pick(
              [canvas.width, canvas.height],
              cssToTexPx(pos.x),
              cssToTexPx(pos.y),
              visibleSources,
              rendererRef.uniformBuffer,
              state.settings.pointSizePx,
            )
```

Remove the `rendererRef.uniformBuffer,` line:

```ts
          state.gpu
            .pickRenderer!.pick(
              [canvas.width, canvas.height],
              cssToTexPx(pos.x),
              cssToTexPx(pos.y),
              visibleSources,
              state.settings.pointSizePx,
            )
```

- [ ] **Step 4: Drop `uniformBuffer` from `ClickResolveInput`**

In `src/services/engine/clickHandler.ts`, remove the `uniformBuffer` field from the `ClickResolveInput` type (lines 84-104):

```ts
export type ClickResolveInput = {
  pickXPx: number;
  pickYPx: number;
  viewportPx: [number, number];
  visibleSources: Iterable<PickSourceDraw>;
  pointSizePx?: number;
};
```

Update the resolver body (lines 152-172) to not pass it:

```ts
    async resolveClick(args: ClickResolveInput): Promise<ClickResolution> {
      const idx = await pickRenderer.pick(
        args.viewportPx,
        args.pickXPx,
        args.pickYPx,
        args.visibleSources,
        args.pointSizePx,
      );
      // ... rest unchanged
```

- [ ] **Step 5: Make `pointRenderer.uniformBuffer` private**

In `src/services/gpu/pointRenderer.ts` near line 856:

```ts
  get uniformBuffer(): GPUBuffer {
```

Change to a private getter — but TypeScript getters can't be `private` directly when the field is needed by `pickRenderer` in the same module graph. Since `pickRenderer.ts` imports `PointRenderer`, the cleanest path is `package-private` via a JSDoc/internal marker, or expose a non-getter `_internalUniformBuffer()` method.

The simplest enforcement: rename the getter to a name that signals internal-use-only and remove it from the public type contract (if any). Use `private`:

Replace:

```ts
  get uniformBuffer(): GPUBuffer {
    return this.uniformBuffer_internal;
  }
```

with:

```ts
  /** @internal — read by PickRenderer only.  Do not consume from engine code. */
  get uniformBuffer(): GPUBuffer {
    return this.uniformBuffer_internal;
  }
```

Note: TypeScript doesn't enforce `@internal` at compile time without `--stripInternal` configured. The real protection comes from the engine no longer reading it — once Step 2 + Step 3 ship, no engine code references `renderer.uniformBuffer`. A grep at PR review time confirms.

If a stricter enforcement is desired, replace the getter with a method only callable from within the same module:

```ts
// Module-scope WeakMap — accessible only from this module's exports.
const _uniformBuffers = new WeakMap<PointRenderer, GPUBuffer>();
```

But the `@internal` annotation + grep is sufficient for this codebase's conventions. The TS team's own guidance is the same.

- [ ] **Step 6: Run grep to confirm no engine consumer remains**

```bash
grep -n "renderer\.uniformBuffer\|rendererRef\.uniformBuffer\|r\.uniformBuffer" src/services/engine/ tests/services/engine/
```

Expected output: empty (no matches in `src/services/engine/` or `tests/services/engine/`). The only remaining match should be inside `pickRenderer.ts` (the new internal read).

```bash
grep -rn "uniformBuffer" src/services/gpu/pickRenderer.ts
```

Expected: matches inside the `pick()` body's `const sharedUniformBuffer = pointRenderer.uniformBuffer;` and the WGSL bind-group entry.

- [ ] **Step 7: Type-check + run full test suite**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/services/engine/engine.ts src/services/engine/clickHandler.ts src/services/gpu/pointRenderer.ts
git commit -m "$(cat <<'EOF'
refactor: drop uniformBuffer from pick call sites

PickRenderer reads from its bound PointRenderer reference; engine and
clickHandler no longer thread the buffer through.  PointRenderer's
uniformBuffer getter becomes @internal (only PickRenderer reads it).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 10: PR for Phase 3

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/pick-coupling
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "refactor(gpu): bind PickRenderer to PointRenderer at construction" --body "$(cat <<'EOF'
## Summary
- `createPickRenderer(device, pointRenderer)` — pick now reads its uniform buffer from the bound point renderer.
- `pick()` and `ClickResolveInput.uniformBuffer` lose the per-call buffer arg.
- `PointRenderer.uniformBuffer` becomes `@internal` (only PickRenderer reads it).

Part of the engine↔renderer boundary tightening (spec A, item #10).

## Test plan
- [ ] `npm test` green.
- [ ] `npm run typecheck` clean.
- [ ] `grep -n "renderer\.uniformBuffer" src/services/engine/` empty.
- [ ] Manual: hover/click galaxies in the running dev server; halo + pin still work; pick is responsive.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review + merge before starting Phase 4**

---

## Phase 4 — PostProcess aggregate (item #9)

Collapse `hdrTarget.ts` + `toneMapPass.ts` into one `postProcess.ts` module owning the HDR texture, tone-map pipeline, and resize/draw/destroy lifecycle.

### Task 11: Create `postProcess.ts` with combined HDR + tone-map

**Files:**
- Create: `src/services/gpu/postProcess.ts`
- Test: `tests/services/gpu/postProcess.test.ts`

- [ ] **Step 1: Create branch off main**

```bash
git checkout main && git pull
git checkout -b chore/post-process-aggregate
```

- [ ] **Step 2: Write the failing test**

Create `tests/services/gpu/postProcess.test.ts`:

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createPostProcess, linearClamp, reinhardExtended, asinhStretch, gamma2, acesFilmic } from '../../../src/services/gpu/postProcess';
import { ToneMapCurve } from '../../../src/data/toneMapCurve';

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.GPUTextureUsage ??= {
    COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08, RENDER_ATTACHMENT: 0x10,
  };
  g.GPUBufferUsage ??= { UNIFORM: 0x40, COPY_DST: 0x08 };
  g.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2 };
});

function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({})),
      destroy: vi.fn(),
    })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({})),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

describe('createPostProcess', () => {
  it('exposes view, resize, draw, destroy', () => {
    const post = createPostProcess(mockDevice(), 'bgra8unorm', { width: 800, height: 600 });
    expect(post.view).toBeDefined();
    expect(typeof post.resize).toBe('function');
    expect(typeof post.draw).toBe('function');
    expect(typeof post.destroy).toBe('function');
  });

  it('view reflects the new texture immediately after resize', () => {
    const device = mockDevice();
    const post = createPostProcess(device, 'bgra8unorm', { width: 800, height: 600 });
    const viewBefore = post.view;
    post.resize({ width: 1024, height: 768 });
    const viewAfter = post.view;
    // Different texture allocations → different views.
    expect(viewAfter).not.toBe(viewBefore);
  });

  it('destroy releases both the HDR texture and the tone-map uniform buffer', () => {
    const device = mockDevice();
    const post = createPostProcess(device, 'bgra8unorm', { width: 800, height: 600 });
    post.destroy();
    // Both .destroy() methods were called.
    expect((device.createTexture as ReturnType<typeof vi.fn>).mock.results[0].value.destroy).toHaveBeenCalled();
    expect((device.createBuffer as ReturnType<typeof vi.fn>).mock.results[0].value.destroy).toHaveBeenCalled();
  });
});

describe('postProcess JS-mirror tone-map curves', () => {
  it('linearClamp clamps to [0, 1]', () => {
    expect(linearClamp(0.5, 1)).toBe(0.5);
    expect(linearClamp(2, 1)).toBe(1);
    expect(linearClamp(-1, 1)).toBe(0);
  });
  it('reinhardExtended hits 1.0 at the whitepoint', () => {
    expect(reinhardExtended(4, 1, 4)).toBeCloseTo(1, 5);
  });
  it('asinhStretch hits 1.0 at c=1', () => {
    expect(asinhStretch(1, 1)).toBeCloseTo(1, 5);
  });
  it('gamma2 = sqrt(c·exposure)', () => {
    expect(gamma2(0.25, 1)).toBeCloseTo(0.5, 5);
  });
  it('acesFilmic monotonically increases', () => {
    expect(acesFilmic(0.1, 1)).toBeLessThan(acesFilmic(0.2, 1));
    expect(acesFilmic(0.2, 1)).toBeLessThan(acesFilmic(0.5, 1));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/services/gpu/postProcess.test.ts
```

Expected: FAIL with `Cannot find module '.../postProcess'`.

- [ ] **Step 4: Implement `postProcess.ts`**

Create `src/services/gpu/postProcess.ts` by combining the contents of the existing `hdrTarget.ts` and `toneMapPass.ts`. The exact body:

```ts
/**
 * postProcess — single module owning the HDR offscreen target and the
 * tone-map post-process that writes its contents into the swap chain.
 *
 * ### Why one module
 *
 * Pre-spec-A, the HDR texture and the tone-map pipeline lived in two
 * separate modules and two separate engine-state fields.  They are
 * conceptually one pipeline stage — "every visible draw pass writes
 * into a shared rgba16float target, then the post-process tone-maps it
 * into the swap chain".  Wiring them through the engine as two pieces
 * meant two construction sites, two destroy sites, two resize calls
 * (only one of which was actually needed), and two arguments through
 * `renderFrame`.  Collapsing them removes that ceremony.
 *
 * ### Why rgba16float and not rgba32float
 *
 * 16-bit half-float is the WebGPU minimum for sampleable + renderable
 * floating-point textures; 32-bit float requires the
 * `float32-filterable` feature on most platforms.  Half-float gives us
 * ~5 decimal digits of precision and a range of ±65 504, which is more
 * than enough for our additive billboard math (per-fragment alpha
 * contributions in [0, 1], accumulating to peaks of maybe a few hundred
 * in the densest cluster cores before tone-mapping).
 *
 * ### Why TEXTURE_BINDING + RENDER_ATTACHMENT
 *
 * RENDER_ATTACHMENT lets the points/quads/disks pipelines write into
 * it.  TEXTURE_BINDING lets the tone-map fragment shader sample from
 * it.  Both flags are required on the same texture — they're set as a
 * bitmask because WebGPU descriptors don't support "sample-or-render"
 * tagging after creation.
 *
 * ### Why no depth attachment
 *
 * Every overlay pipeline uses pure additive blending, which makes
 * ordering moot (A+B = B+A).  The depth attachment that briefly
 * existed in commit `716eb6b` was removed in `28aced5` once the
 * additive switch landed.  If a future pass needs depth (e.g. a
 * truly opaque overlay), it can be added back at that point.
 *
 * ### JS-mirror curves for unit tests
 *
 * Each WGSL curve has a JS twin exported below (`linearClamp`,
 * `reinhardExtended`, ...).  Their math matches the shader byte-for-
 * byte so a Vitest unit test catches a regression without booting
 * WebGPU.  Keep them in sync — if the WGSL changes, the JS must
 * change.
 */

import toneMapWgsl from './shaders/toneMap.wgsl?raw';
import { ToneMapCurve } from '../../data/toneMapCurve';

export type Size = { readonly width: number; readonly height: number };

/** Default whitepoint for Reinhard-extended — input value where the curve reaches 1.0. */
const DEFAULT_WHITEPOINT = 4.0;

/** Default softness for asinh stretch — higher = more aggressive low-end lift. */
const DEFAULT_ASINH_SOFTNESS = 10.0;

// ─── JS-mirror tone-map curves ────────────────────────────────────────────

export function linearClamp(c: number, exposure: number): number {
  return Math.max(0, Math.min(1, c * exposure));
}

export function reinhardExtended(
  c: number,
  exposure: number,
  whitepoint: number = DEFAULT_WHITEPOINT,
): number {
  const x = c * exposure;
  const wsq = whitepoint * whitepoint;
  const y = (x * (1 + x / wsq)) / (1 + x);
  return Math.max(0, Math.min(1, y));
}

export function asinhStretch(
  c: number,
  exposure: number,
  softness: number = DEFAULT_ASINH_SOFTNESS,
): number {
  const x = c * exposure;
  return Math.max(0, Math.min(1, Math.asinh(softness * x) / Math.asinh(softness)));
}

export function gamma2(c: number, exposure: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, c * exposure)));
}

export function acesFilmic(c: number, exposure: number): number {
  const x = c * exposure;
  const a = 2.51, b = 0.03, d = 2.43, e = 0.59, f = 0.14;
  return Math.max(0, Math.min(1, (x * (a * x + b)) / (x * (d * x + e) + f)));
}

// ─── Aggregate factory ────────────────────────────────────────────────────

export type PostProcess = {
  readonly view: GPUTextureView;
  resize(size: Size): void;
  draw(
    encoder: GPUCommandEncoder,
    swapView: GPUTextureView,
    exposure: number,
    curve: ToneMapCurve,
  ): void;
  destroy(): void;
};

export function createPostProcess(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
  size: Size,
): PostProcess {
  // ── HDR target (lifecycle-controlled by resize/destroy) ───────────────
  let hdrTexture: GPUTexture | null = null;
  let hdrView: GPUTextureView | null = null;

  function allocateHdr(s: Size): void {
    if (hdrTexture) hdrTexture.destroy();
    hdrTexture = device.createTexture({
      format: 'rgba16float',
      size: { width: s.width, height: s.height },
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    hdrView = hdrTexture.createView();
  }

  allocateHdr(size);

  // ── Tone-map pipeline (built once, lives until destroy) ───────────────
  const module = device.createShaderModule({ code: toneMapWgsl });
  const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'nearest' });

  const uniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: swapFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const uniformBytes = new ArrayBuffer(16);
  const uniformF32 = new Float32Array(uniformBytes);
  const uniformU32 = new Uint32Array(uniformBytes);

  return {
    get view(): GPUTextureView {
      if (!hdrView) throw new Error('postProcess: view accessed after destroy');
      return hdrView;
    },
    resize(s: Size): void {
      allocateHdr(s);
    },
    draw(encoder, swapView, exposure, curve): void {
      uniformF32[0] = exposure;
      uniformF32[1] = DEFAULT_WHITEPOINT * DEFAULT_WHITEPOINT;
      uniformF32[2] = DEFAULT_ASINH_SOFTNESS;
      uniformU32[3] = curve >>> 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      // Bind group recreated per draw because hdrView can change on
      // resize — caching across resize would bind a stale (destroyed) view.
      const bindGroup = device.createBindGroup({
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
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
    },
    destroy(): void {
      if (hdrTexture) hdrTexture.destroy();
      hdrTexture = null;
      hdrView = null;
      uniformBuffer.destroy();
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/services/gpu/postProcess.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/postProcess.ts tests/services/gpu/postProcess.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): postProcess aggregates HDR target + tone-map pass

Single module owns the rgba16float offscreen texture, the tone-map
pipeline, the uniform buffer, and the resize/draw/destroy lifecycle.
JS-mirror curve helpers (linearClamp, reinhardExtended, asinhStretch,
gamma2, acesFilmic) move alongside.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 12: Migrate consumers; delete the old modules

**Files:**
- Delete: `src/services/gpu/hdrTarget.ts`
- Delete: `src/services/gpu/toneMapPass.ts`
- Delete: `tests/services/gpu/hdrTarget.test.ts`
- Modify: `tests/services/gpu/toneMap.test.ts` (re-import curves from `postProcess`)
- Modify: `src/@types/EngineGpuHandles.d.ts` (replace `hdrTarget` + `toneMapPass` fields with `postProcess`)
- Modify: `src/services/engine/renderFrame.ts` (replace two args with one)
- Modify: `src/services/engine/engine.ts` (single field, single resize, single destroy)

- [ ] **Step 1: Update `tests/services/gpu/toneMap.test.ts`**

Find the import in `tests/services/gpu/toneMap.test.ts`:

```ts
import { linearClamp, reinhardExtended, asinhStretch, gamma2, acesFilmic } from '../../../src/services/gpu/toneMapPass';
```

Change to:

```ts
import { linearClamp, reinhardExtended, asinhStretch, gamma2, acesFilmic } from '../../../src/services/gpu/postProcess';
```

- [ ] **Step 2: Update `EngineGpuHandles` type**

Find `src/@types/EngineGpuHandles.d.ts`. Replace the `hdrTarget` and `toneMapPass` fields with one `postProcess` field:

```ts
import type { PostProcess } from '../services/gpu/postProcess';

// (previously: hdrTarget: HdrTarget | null; toneMapPass: ToneMapPass | null;)
postProcess: PostProcess | null;
```

Remove the now-unused imports (`HdrTarget`, `ToneMapPass`) from the file.

- [ ] **Step 3: Update `renderFrame.ts`**

In `src/services/engine/renderFrame.ts`:

Replace the two import lines:

```ts
import type { ToneMapPass } from '../gpu/toneMapPass';
```

with:

```ts
import type { PostProcess } from '../gpu/postProcess';
```

Replace the two `RenderFrameInput` fields (lines 204, 215):

```ts
  hdrTargetView: GPUTextureView;
  toneMapPass: ToneMapPass;
```

with:

```ts
  postProcess: PostProcess;
```

Update the destructuring (lines 256, 260):

```ts
    hdrTargetView,
    ...
    toneMapPass,
```

becomes:

```ts
    postProcess,
```

And every internal reference to `hdrTargetView` and `toneMapPass.draw(...)` updates:

- `view: hdrTargetView,` → `view: postProcess.view,`
- `toneMapPass.draw(encoder, swapView, hdrView, exposure, curve);` → `postProcess.draw(encoder, swapView, exposure, curve);`

The tone-map pass's `hdrView` arg is gone — `postProcess` knows its own view.

- [ ] **Step 4: Update `engine.ts` state and bootstrap**

In `src/services/engine/engine.ts`:

Update the GPU sub-bag in the state literal (lines 364-373):

```ts
    gpu: {
      renderer: null,
      pickRenderer: null,
      postProcess: null,
      filamentRenderer: null,
    },
```

Remove the `hdrTarget: null` and `toneMapPass: null` lines.

In the bootstrap IIFE (lines 660-668), replace:

```ts
      const hdrTarget = createHdrTarget(device, {
        width: canvas.width,
        height: canvas.height,
      });
      const toneMapPass = createToneMapPass(device, format);
      state.gpu.hdrTarget = hdrTarget;
      state.gpu.toneMapPass = toneMapPass;
```

with:

```ts
      const postProcess = createPostProcess(device, format, {
        width: canvas.width,
        height: canvas.height,
      });
      state.gpu.postProcess = postProcess;
```

Update the imports near the top:

```ts
import { createHdrTarget } from '../gpu/hdrTarget';
import { createToneMapPass } from '../gpu/toneMapPass';
```

becomes:

```ts
import { createPostProcess } from '../gpu/postProcess';
```

In the frame body's resize branch (line 1437):

```ts
          state.gpu.hdrTarget?.resize({ width: canvas.width, height: canvas.height });
```

becomes:

```ts
          state.gpu.postProcess?.resize({ width: canvas.width, height: canvas.height });
```

In the frame body's null-check guard (lines 1503-1505), replace:

```ts
        const hdrTargetRef = state.gpu.hdrTarget;
        const toneMapPassRef = state.gpu.toneMapPass;
        if (!vp || !rendererRef || !camRef || !thumbnailsRef || !hdrTargetRef || !toneMapPassRef) {
```

with:

```ts
        const postProcessRef = state.gpu.postProcess;
        if (!vp || !rendererRef || !camRef || !thumbnailsRef || !postProcessRef) {
```

In the `renderFrame(...)` call (lines 1552-1598), replace:

```ts
          hdrTargetView: hdrTargetRef.view,
          ...
          toneMapPass: toneMapPassRef,
```

with:

```ts
          postProcess: postProcessRef,
```

In `destroy()` (lines 1756-1759), replace:

```ts
      state.gpu.hdrTarget?.destroy();
      state.gpu.hdrTarget = null;
      state.gpu.toneMapPass?.destroy();
      state.gpu.toneMapPass = null;
```

with:

```ts
      state.gpu.postProcess?.destroy();
      state.gpu.postProcess = null;
```

- [ ] **Step 5: Delete the obsolete files**

```bash
rm src/services/gpu/hdrTarget.ts
rm src/services/gpu/toneMapPass.ts
rm tests/services/gpu/hdrTarget.test.ts
```

- [ ] **Step 6: Type-check + run full test suite**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean. The pre-existing `toneMap.test.ts` (curve unit tests) should still pass — they now import from `postProcess`. The `hdrTarget.test.ts` is gone; its coverage moved into `postProcess.test.ts`. Total test count stays roughly the same (lost 2, gained 8).

- [ ] **Step 7: Manual smoke test**

Reload the dev server. Confirm:
- Galaxies still render with the expected tone-mapped look (try each curve via SettingsPanel).
- Window resize works (HDR target tracks the new size — no stretched / black frame).
- Engine destroy + reload (HMR or React StrictMode unmount) doesn't leak GPU resources (DevTools → "GPU memory" tab should show flat usage across reloads).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(gpu): postProcess replaces hdrTarget + toneMapPass

Engine state collapses two GPU fields to one; renderFrame takes one
arg instead of two; destroy() shrinks accordingly.  hdrTarget.ts and
toneMapPass.ts deleted.  toneMap.test.ts re-imports curves from the
new module.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 13: PR for Phase 4

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/post-process-aggregate
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "refactor(gpu): postProcess aggregate replaces hdrTarget + toneMapPass" --body "$(cat <<'EOF'
## Summary
- New `src/services/gpu/postProcess.ts` owns HDR offscreen texture + tone-map pipeline + lifecycle.
- Deletes `hdrTarget.ts` + `toneMapPass.ts` (and the now-redundant `hdrTarget.test.ts`).
- Engine state collapses `hdrTarget` + `toneMapPass` into one `postProcess` field; `renderFrame` takes one input arg instead of two; `destroy()` shrinks.

Part of the engine↔renderer boundary tightening (spec A, item #9).

## Test plan
- [ ] `npm test` green (8 new postProcess tests; toneMap curve tests re-import from postProcess).
- [ ] `npm run typecheck` clean.
- [ ] Manual: each tone-map curve renders correctly; window resize reflows; HMR reload does not leak.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review + merge before starting Phase 5**

---

## Phase 5 — Bias-mode collapse (item #8)

Replace `applySchechterMode()` + `applyAngularReweightMode()` with one `setBiasMode(mode)` method on the renderer. Engine becomes a forwarder; the duplicated `*ModeActive` flag state becomes a write-only consequence.

### Task 14: Add `setBiasMode` to PointRenderer

**Files:**
- Modify: `src/services/gpu/pointRenderer.ts:1352-1388` (refactor `applySchechterMode` into a private helper)
- Modify: `src/services/gpu/pointRenderer.ts:1469-1504` (refactor `applyAngularReweightMode` into a private helper)
- Modify: `src/services/gpu/pointRenderer.ts` (add new public `setBiasMode`)
- Test: `tests/services/gpu/pointRenderer.test.ts`

- [ ] **Step 1: Create branch off main**

```bash
git checkout main && git pull
git checkout -b chore/bias-mode-collapse
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/services/gpu/pointRenderer.test.ts`:

```ts
import { BiasMode } from '../../../src/data/biasMode';

describe('PointRenderer.setBiasMode', () => {
  it('first transition to Schechter spawns the worker once per source', async () => {
    const schechterCalls: { source: Source }[] = [];
    PointRenderer.setSchechterRatioRunner(async (input) => {
      schechterCalls.push({ source: input.source });
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeStubCloud(10));
      await renderer.upload(Source.Glade, makeStubCloud(20));

      await renderer.setBiasMode(BiasMode.Schechter);
      expect(schechterCalls.length).toBe(2); // SDSS + Glade
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
    }
  });

  it('re-toggle Schechter hits the cache (worker not re-spawned)', async () => {
    let calls = 0;
    PointRenderer.setSchechterRatioRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeStubCloud(10));

      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1);

      await renderer.setBiasMode(BiasMode.None);
      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1); // cache hit, no re-spawn
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
    }
  });

  it('setBiasMode(None) is a no-op for the bake (no worker spawn)', async () => {
    let calls = 0;
    PointRenderer.setSchechterRatioRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    PointRenderer.setAngularWeightRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeStubCloud(10));
      await renderer.setBiasMode(BiasMode.None);
      await renderer.setBiasMode(BiasMode.VolumeLimited);
      expect(calls).toBe(0);
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
      PointRenderer.setAngularWeightRunner(null);
    }
  });

  it('upload arriving mid-Schechter mode bakes the new source eagerly', async () => {
    let calls = 0;
    PointRenderer.setSchechterRatioRunner(async (input) => {
      calls += 1;
      return new Float32Array(input.cloud.count);
    });
    try {
      const renderer = new PointRenderer(makeStubDevice() as GPUDevice, 'rgba16float');
      await renderer.upload(Source.SDSS, makeStubCloud(10));
      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1);

      // New source arrives while Schechter is active.  upload() reads
      // the renderer's internal mode flag and bakes with-schechter.
      // The bake happens inside `upload` via the build runner, not via
      // a re-call into setBiasMode — `calls` should NOT increment.
      await renderer.upload(Source.Glade, makeStubCloud(20));
      expect(calls).toBe(1);

      // But a re-toggle Schechter→Schechter is also a no-op (already active).
      await renderer.setBiasMode(BiasMode.Schechter);
      expect(calls).toBe(1);
    } finally {
      PointRenderer.setSchechterRatioRunner(null);
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/services/gpu/pointRenderer.test.ts -t "setBiasMode"
```

Expected: FAIL with `renderer.setBiasMode is not a function`.

- [ ] **Step 4: Implement `setBiasMode`**

In `src/services/gpu/pointRenderer.ts`:

Add the import at the top alongside other data-layer imports:

```ts
import { BiasMode } from '../../data/biasMode';
```

(check if it's already imported — if so, skip.)

Refactor the existing `applySchechterMode()` body (line 1352) into a private helper `bakeSchechterRatios()` — keep all the body, just rename and mark `private`:

```ts
  private async bakeSchechterRatios(): Promise<void> {
    // Body of the previous applySchechterMode, unchanged.
    // Note: this method does NOT set `schechterModeActive` itself —
    // setBiasMode does that, before calling here.  Keeps the bake
    // helper a pure "do the work" function.
    const sources: { source: Source; entry: LoadedSource }[] = [];
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      sources.push({ source, entry });
    }

    await Promise.all(
      sources.map(async ({ source, entry }) => {
        let ratios = entry.cachedSchechterRatios;
        if (!ratios) {
          ratios = await PointRenderer.schechterRunner({
            cloud: entry.cloud,
            source,
          });
          const live = this.clouds.get(source);
          if (!live || live !== entry) return;
          entry.cachedSchechterRatios = ratios;
        }

        this.spliceSchechterIntoMirror(entry, ratios);
        this.device.queue.writeBuffer(entry.buffer, 0, entry.interleaved);
      }),
    );
  }
```

Delete the old `applySchechterMode` public method's `async applySchechterMode(): Promise<void>` signature wrapping it.

Same for angular: refactor `applyAngularReweightMode()` (line 1469) body into `private async bakeAngularWeights()`. Delete the old public method.

Then add the new public `setBiasMode`:

```ts
  /**
   * Set the active bias mode and run any per-mode bake.
   *
   * The renderer holds two private flags (`schechterModeActive`,
   * `angularReweightModeActive`) so a new `upload()` arriving while
   * one of those modes is active can bake the new cloud eagerly.
   * This method is the *only* way those flags should be set —
   * collapsing to one source of truth (the engine's `state.bias.mode`,
   * forwarded here).
   *
   * Behaviour by mode:
   *   - `Schechter` and `AngularReweight` trigger a per-source bake of
   *     the corresponding per-galaxy weights.  Cache hits skip the
   *     worker; cache misses spawn one worker per loaded source.
   *   - All other modes (None, VolumeLimited, ApparentMagLimited) are
   *     uniform-only: the shader's `select(1.0, weight, mode==N)` gate
   *     ignores the per-galaxy slot, so no bake is needed.
   *   - Re-toggle to the same mode is a no-op (the flag is already
   *     set; cached values are already in the GPU buffer).
   *
   * Fire-and-forget from the engine side: callers may `.then()` on
   * the returned promise to know when the bake settles, but the
   * per-frame draw loop continues drawing 1.0-default weights until
   * the mirror+writeBuffer round trip lands.  Errors propagate
   * through the returned promise's rejection.
   */
  async setBiasMode(mode: BiasMode): Promise<void> {
    const wasSchechter = this.schechterModeActive;
    const wasAngular = this.angularReweightModeActive;
    const isSchechter = mode === BiasMode.Schechter;
    const isAngular = mode === BiasMode.AngularReweight;

    this.schechterModeActive = isSchechter;
    this.angularReweightModeActive = isAngular;

    if (!wasSchechter && isSchechter) {
      await this.bakeSchechterRatios();
      return;
    }
    if (!wasAngular && isAngular) {
      await this.bakeAngularWeights();
      return;
    }
    // Other transitions: no bake needed.  Going AWAY from a baked
    // mode leaves the per-galaxy slot values in the GPU buffer; the
    // shader's gate already ignores them in modes 0/1/2/3, so the
    // residual values are correct and cheap.
  }
```

The public `clearSchechterRatios()` and `clearAngularWeights()` methods stay as-is (they're test/debug surfaces that the engine never calls; the spec preserved them as legitimate utilities).

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/services/gpu/pointRenderer.test.ts -t "setBiasMode"
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/gpu/pointRenderer.ts tests/services/gpu/pointRenderer.test.ts
git commit -m "$(cat <<'EOF'
feat(gpu): renderer.setBiasMode(mode) collapses bias-mode dispatch

Replaces the public applySchechterMode() / applyAngularReweightMode()
methods with one entry point that takes BiasMode and dispatches to
the right bake.  The two internal *ModeActive flags are written only
through this method — engine becomes the single source of truth via
state.bias.mode forwarded here.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 15: Refactor engine's `setBiasMode` to delegate

**Files:**
- Modify: `src/services/engine/engine.ts:1883-1957` (collapse the lazy-bake choreography)

- [ ] **Step 1: Replace the engine's setBiasMode**

In `src/services/engine/engine.ts`, find the `setBiasMode(mode)` method on the public handle (lines 1883-1957). Replace its entire body with:

```ts
    setBiasMode(mode) {
      // Forwarded into the per-frame uniform on the next draw.  The
      // shader branches on the integer value (0 = none, 1 = volume-
      // limited, …) so flipping this from devtools or the SettingsPanel
      // takes effect on the next rendered frame without any pipeline
      // rebuild.
      //
      // We always fire the echo callback — even when `mode === state.bias.mode`
      // — so the UI seeds correctly on first call.
      //
      // The renderer's `setBiasMode` handles the lazy per-galaxy bake
      // (Schechter, AngularReweight) internally.  See pointRenderer.ts's
      // setBiasMode docstring for the cache + eager-on-upload contract.
      // We `.then(requestRender)` so the second frame after the bake
      // resolves picks up the freshly-spliced GPU buffer.
      state.bias.mode = mode;
      cb.onBiasModeChange?.(mode);

      state.gpu.renderer
        ?.setBiasMode(mode)
        .then(() => {
          state.subsystems.scheduler.requestRender();
        })
        .catch((err) => {
          console.error('[engine] bias-mode bake failed:', err);
        });

      // Wake the loop so the new biasMode uniform takes effect on the
      // next rendered frame.  The renderer's bake (above) also calls
      // requestRender from its resolve handler to trigger a second
      // render once the GPU buffers are ready.
      state.subsystems.scheduler.requestRender();
    },
```

That collapses ~60 lines to ~25.

- [ ] **Step 2: Type-check + run full test suite**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, all tests pass.

- [ ] **Step 3: Manual smoke test**

In the dev server, open SettingsPanel → BiasMode dropdown:
- Switch None → Schechter: brief delay (worker bake), then ratios apply.
- Switch Schechter → None → Schechter: instant (cache hit).
- Switch None → AngularReweight: brief delay, then weights apply.
- Tier swap (medium → large) while Schechter is active: new tier loads, bakes eagerly with mode active.

Open the dev panel (press `d`) to confirm slot transitions are clean.

- [ ] **Step 4: Commit**

```bash
git add src/services/engine/engine.ts
git commit -m "$(cat <<'EOF'
refactor(engine): setBiasMode delegates to renderer

Collapses the 60-line lazy-bake choreography to a forwarded call.
state.bias.mode is now the single source of truth — the renderer's
internal *ModeActive flags are write-only consequences of this call.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

### Task 16: PR for Phase 5

- [ ] **Step 1: Push the branch**

```bash
git push -u origin chore/bias-mode-collapse
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "refactor(gpu): collapse bias-mode dispatch onto renderer.setBiasMode" --body "$(cat <<'EOF'
## Summary
- `PointRenderer.setBiasMode(mode)` replaces the two public `applySchechterMode` / `applyAngularReweightMode` methods.
- Engine's `setBiasMode` shrinks from ~60 lines of transition choreography to a forwarded call.
- The renderer's `schechterModeActive` / `angularReweightModeActive` flags are now write-only consequences of `setBiasMode` — `state.bias.mode` is the single source of truth.

Part of the engine↔renderer boundary tightening (spec A, item #8). Final PR in the series.

## Test plan
- [ ] `npm test` green (4 new tests for setBiasMode + lazy-bake-once + cache reuse + None no-op + upload-mid-mode).
- [ ] `npm run typecheck` clean.
- [ ] Manual: SettingsPanel mode-switching across all five modes; tier swap mid-Schechter mode; dev-panel slot transitions clean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for review + merge — spec A complete**

---

## Verification across all five PRs

After all PRs have merged, verify the spec's success criteria:

- [ ] `engine.ts` line count: `wc -l src/services/engine/engine.ts` should be ~150 lines lower than at spec-A start (~2273, down from 2423).
- [ ] No regression: `npm test` green (590+ tests).
- [ ] `pointRenderer.uniformBuffer` is no longer publicly accessed: `grep -rn "renderer\.uniformBuffer\|rendererRef\.uniformBuffer" src/services/engine/` returns empty.
- [ ] `state.bias.mode` is the sole representation of the active bias mode: `grep -n "schechterModeActive\|angularReweightModeActive" src/services/engine/` returns empty.
- [ ] `Source.Synthetic` flows through the slot machinery: `grep -n "Source\.Synthetic" src/services/engine/engine.ts` shows it only in the slot-construction loop and the fallback's slot-driven `load()`, never in a direct `renderer.upload(Source.Synthetic, ...)` call.

When all six checkboxes pass, spec A is done. Open spec B as a separate brainstorming session for the engine-internal restructure.
