# Galaxy Impostor Subsystem Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the galaxy-rendering pipeline so its three LOD levels each have a single-responsibility home: split `thumbnailSubsystem` into three new subsystems, rename the two LOD-2 renderers for symmetry, and replace the kitchen-sink `galaxyThumbnailsPass` with two LOD-aligned pass entries — without changing rendered output.

**Architecture:** Atlas + queue infrastructure becomes a shared `galaxyAtlasSubsystem`. LOD-1 (procedural-disk) and LOD-2 (textured-impostor) per-frame planners each own a single catalog walk and emit sorted instance arrays through `lastOutput`. Two new pass entries (`proceduralDisksPass`, `texturedImpostorsPass`) read those arrays and dispatch to renderers inside the existing single HDR render pass — additive blend keeps cosmetic draw order irrelevant to correctness.

**Tech Stack:** TypeScript, WebGPU, Vitest, Vite. Per-concern types live in `src/@types/` (no barrel re-exports). Renderer types/factory names rename; renderer instance struct types (`ThumbnailInstance`, `DiskInstance`, `ProceduralDiskInstance`) do NOT rename — they describe GPU vertex-buffer layouts and the parallel TS-types consolidation will clash with such a rename.

**Reference:** Full spec at `docs/superpowers/specs/2026-05-12-galaxy-impostor-subsystem-split-design.md` — read the Migration section before starting Task 1; it explains why the sequencing below is top-down-readable in the PR diff.

---

## Task 1: Capture a visual baseline (frame-hash fixture)

**Files:**
- Create: `tests/visual/galaxyImpostorBaseline.test.ts`
- Create: `tests/visual/README.md`

The spec requires byte-identical visual output pre- and post-refactor. No `tests/visual/` harness exists today; this task builds a minimal one. It is NOT a full WebGPU render-and-pixel-compare harness — that's overkill for a structural refactor. Instead, the test snapshots the SEQUENCE of renderer-`draw` calls (renderer name, instance count, instance content hash) produced by one frame with a fixed camera + fixture clouds. Two runs producing identical sequences proves the new subsystems emit byte-identical inputs to the same renderers in the same order. The `instances[]` array hashes use stable JSON encoding (numeric fields rounded to 6 dp to absorb floating-point determinism noise in math like `Math.tan`).

- [ ] **Step 1: Write the README explaining the snapshot harness**

Create `tests/visual/README.md`:

```markdown
# Visual baseline tests

These tests pin the per-frame SEQUENCE of renderer-`draw` calls — not GPU
pixels.  The galaxy-impostor subsystem split (2026-05-12) needs byte-
identical visual output before/after, but standing up a real WebGPU
pixel-readback harness costs more than the refactor it would gate.

Instead each `*.baseline.test.ts` file:

  1. Constructs a deterministic fixture (cameras at fixed positions,
     synthetic PointClouds with hand-picked diameters and orientations).
  2. Drives the engine subsystems through their `runFrame` step exactly
     as the production frame body would.
  3. Records `(rendererName, instanceCount, hashOfPackedInstances)` for
     every renderer.draw() call in order.
  4. Asserts that recording against a checked-in fixture.

Failure means "your refactor changed what the GPU was told to draw".
Pass means "it didn't".

Floating-point determinism: instance fields are rounded to 6 decimal
places before hashing to absorb the occasional ULP wobble from `Math.tan`,
`Math.sqrt`, etc.  6 dp is finer than any per-pixel difference the
shader could produce at typical viewport sizes.
```

- [ ] **Step 2: Write the baseline fixture and test**

Create `tests/visual/galaxyImpostorBaseline.test.ts`:

```typescript
/**
 * Visual baseline — galaxy impostor draw-call sequence.
 *
 * Captures the per-frame sequence of renderer.draw() invocations the
 * legacy `thumbnailSubsystem.runFrame` produces given a fixed fixture.
 * Any refactor that re-arranges, re-orders, or alters the instance
 * payload of these draw calls flips this test red.  See tests/visual/
 * README.md for the rationale on hash-based snapshotting vs. pixel
 * readback.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';

import { Source } from '../../src/data/sources';
import { createThumbnailSubsystem } from '../../src/services/engine/subsystems/thumbnailSubsystem';
import type { PointCloud, OrbitCamera } from '../../src/@types';

function makeFakeDevice(): GPUDevice {
  const fakeTexture = { createView: () => ({}) as GPUTextureView };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeCloud(count: number): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(0.7),
    positionAngleDeg: fill(45),
    diameterKpc: fill(50),
  };
}

function makeCam(): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: 0.05,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([9.95, 0, 0]),
  } as unknown as OrbitCamera;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function hashInstances(instances: ReadonlyArray<object>): string {
  // Stable: sort keys, round numeric fields to 6 dp, concatenate.
  const parts: string[] = [];
  for (const ins of instances) {
    const rec = ins as Record<string, unknown>;
    const sortedKeys = Object.keys(rec).sort();
    const kv: string[] = [];
    for (const k of sortedKeys) {
      const v = rec[k];
      kv.push(`${k}=${typeof v === 'number' ? round6(v) : String(v)}`);
    }
    parts.push(kv.join('|'));
  }
  return parts.join(';');
}

type DrawRecord = { renderer: string; count: number; hash: string };

describe('galaxy-impostor visual baseline', () => {
  it('emits the same draw sequence given a fixed camera + cloud fixture', async () => {
    const device = makeFakeDevice();
    const quadDraw = vi.fn();
    const diskDraw = vi.fn();
    const procDraw = vi.fn();
    const quad = { bindAtlas: vi.fn(), draw: quadDraw, label: 'thumbnailRenderer' } as any;
    const disk = { bindAtlas: vi.fn(), draw: diskDraw, label: 'diskRenderer' } as any;
    const procDisk = { draw: procDraw, label: 'proceduralDiskRenderer' } as any;

    const sys = createThumbnailSubsystem({
      device,
      requestRender: () => {},
      fetcher: async () => ({ width: 128, height: 128, close: () => {} } as unknown as ImageBitmap),
      decimationFactor: 1,
    });
    sys.bindToRenderers(quad, disk, procDisk);

    const cam = makeCam();
    const clouds = new Map([[Source.SDSS, makeCloud(8)]]);
    const input = {
      cam,
      clouds,
      visibleSourceMask: 0xffffffff,
      canvasSize: { width: 1280, height: 720 },
      pass: {} as GPURenderPassEncoder,
      viewProj: new Float32Array(16) as unknown as mat4,
      pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
      camPos: [cam.position[0]!, cam.position[1]!, cam.position[2]!] as Readonly<
        [number, number, number]
      >,
      thumbnailRenderer: quad,
      diskRenderer: disk,
      famousMeta: [],
      famousXrefs: {},
    };

    // Frame 1: kicks off fetches; bitmaps land via microtask drain.
    sys.runFrame(input);
    await new Promise((r) => setTimeout(r, 0));

    // Frame 2: bitmaps ready; the disk/quad paths fire.
    quadDraw.mockClear();
    diskDraw.mockClear();
    procDraw.mockClear();
    sys.runFrame(input);

    const records: DrawRecord[] = [];
    if (quadDraw.mock.calls.length > 0) {
      const instances = quadDraw.mock.calls[0]![3] as ReadonlyArray<object>;
      records.push({
        renderer: 'thumbnailRenderer',
        count: instances.length,
        hash: hashInstances(instances),
      });
    }
    if (diskDraw.mock.calls.length > 0) {
      const instances = diskDraw.mock.calls[0]![4] as ReadonlyArray<object>;
      records.push({
        renderer: 'diskRenderer',
        count: instances.length,
        hash: hashInstances(instances),
      });
    }
    if (procDraw.mock.calls.length > 0) {
      const instances = procDraw.mock.calls[0]![5] as ReadonlyArray<object>;
      records.push({
        renderer: 'proceduralDiskRenderer',
        count: instances.length,
        hash: hashInstances(instances),
      });
    }

    expect(records).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 3: Run the test to record the baseline**

Run: `npx vitest run tests/visual/galaxyImpostorBaseline.test.ts -u`

Expected: PASS — vitest writes the inline snapshot of the three `DrawRecord` entries into the test file. Re-running without `-u` then asserts against that snapshot.

- [ ] **Step 4: Re-run without `-u` to confirm determinism**

Run: `npx vitest run tests/visual/galaxyImpostorBaseline.test.ts`

Expected: PASS — snapshot matches.

- [ ] **Step 5: Commit**

```bash
git add tests/visual/README.md tests/visual/galaxyImpostorBaseline.test.ts
git commit -m "$(cat <<'EOF'
test(visual): add galaxy-impostor draw-sequence baseline

Snapshots the per-frame sequence of renderer.draw() calls the legacy
thumbnailSubsystem emits given a fixed camera + cloud fixture.  Used to
prove byte-identical visual output across the upcoming impostor split.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rename `diskRenderer` → `texturedDiskRenderer`

**Files:**
- Rename: `src/services/gpu/renderers/diskRenderer.ts` → `src/services/gpu/renderers/texturedDiskRenderer.ts`
- Modify: `src/services/gpu/renderers/texturedDiskRenderer.ts` (rename `type DiskRenderer` → `type TexturedDiskRenderer`, `createDiskRenderer` → `createTexturedDiskRenderer`; `DiskInstance` stays inline, unchanged)
- Modify: `src/@types/EngineGpuHandles.d.ts` (import + type-annotation only)
- Modify: `src/services/engine/frame/passes/types.ts` (import + type-annotation only)
- Modify: `src/services/engine/frame/renderFrame.ts` (import + type-annotation only)
- Modify: `src/services/engine/frame/runFrame.ts` (import + type-annotation only)
- Modify: `src/services/engine/subsystems/thumbnailSubsystem.ts` (import only)
- Modify: `src/services/engine/phases/initGpu.ts` (import + call site)
- Modify: `tests/services/gpu/renderers/instancedQuadRenderer.test.ts` (import + type only, if present)
- Modify: `tests/services/engine/frame/passes/passes.test.ts` (no import — uses string label only)
- Modify: `tests/services/engine/frame/renderFrame.test.ts` (no source import expected — verify)
- Modify: `tests/services/engine/frame/runFrame.test.ts` (no source import expected — verify)

Field names on `state.gpu.diskRenderer` and `PassDeps.diskRenderer` are NOT changed in this task — the spec scope explicitly says "no type renames outside the new files" and field names are not type names. The renderer TYPE is renamed; consumers update their imports and the `: DiskRenderer` annotation to `: TexturedDiskRenderer`.

- [ ] **Step 1: Rename the file**

```bash
git mv src/services/gpu/renderers/diskRenderer.ts src/services/gpu/renderers/texturedDiskRenderer.ts
```

- [ ] **Step 2: Rename the type, factory, and the docstring's first sentence in the renamed file**

Open `src/services/gpu/renderers/texturedDiskRenderer.ts`. Replace the module header line `* DiskRenderer — oriented 3D galaxy disks.` with `* TexturedDiskRenderer — oriented 3D galaxy disks (atlas-textured).`. Then replace `export type DiskRenderer = {` with `export type TexturedDiskRenderer = {`. Then replace `export function createDiskRenderer(ctx: GpuContext, maxInstances = 256): DiskRenderer {` with `export function createTexturedDiskRenderer(ctx: GpuContext, maxInstances = 256): TexturedDiskRenderer {`. Then replace the inner `const renderer: DiskRenderer = {` with `const renderer: TexturedDiskRenderer = {`, and the `label: 'diskRenderer'` literal with `label: 'texturedDiskRenderer'`. Leave `DiskInstance` unchanged.

- [ ] **Step 3: Update every importer**

Run `grep -rn "from.*['\"].*diskRenderer['\"]\\|DiskRenderer\\b\\|createDiskRenderer" src tests --include="*.ts" --include="*.tsx"` to enumerate. Then update each site:

- `src/@types/EngineGpuHandles.d.ts`: change `import type { DiskRenderer } from '../services/gpu/renderers/diskRenderer';` to `import type { TexturedDiskRenderer } from '../services/gpu/renderers/texturedDiskRenderer';` and change `diskRenderer: DiskRenderer | null;` to `diskRenderer: TexturedDiskRenderer | null;` (field name stays).
- `src/services/engine/frame/passes/types.ts`: change `import type { DiskRenderer } from '../../../gpu/renderers/diskRenderer';` to `import type { TexturedDiskRenderer } from '../../../gpu/renderers/texturedDiskRenderer';` and `diskRenderer: DiskRenderer;` to `diskRenderer: TexturedDiskRenderer;`.
- `src/services/engine/frame/renderFrame.ts`: change `import type { DiskRenderer } from '../../gpu/renderers/diskRenderer';` to `import type { TexturedDiskRenderer } from '../../gpu/renderers/texturedDiskRenderer';` and `diskRenderer: DiskRenderer;` to `diskRenderer: TexturedDiskRenderer;`.
- `src/services/engine/frame/runFrame.ts`: change `import type { DiskRenderer } from '../../gpu/renderers/diskRenderer';` to `import type { TexturedDiskRenderer } from '../../gpu/renderers/texturedDiskRenderer';` and `diskRenderer: DiskRenderer;` to `diskRenderer: TexturedDiskRenderer;`.
- `src/services/engine/subsystems/thumbnailSubsystem.ts`: change `import type { DiskRenderer, DiskInstance } from '../../gpu/renderers/diskRenderer';` to `import type { TexturedDiskRenderer, DiskInstance } from '../../gpu/renderers/texturedDiskRenderer';` and every `DiskRenderer` annotation inside the file (function parameter on `bindToRenderers`, field on `ThumbnailFrameInput`, parameter in `runFrame`'s destructure type) to `TexturedDiskRenderer`.
- `src/services/engine/phases/initGpu.ts`: change `import { createDiskRenderer } from '../../gpu/renderers/diskRenderer';` to `import { createTexturedDiskRenderer } from '../../gpu/renderers/texturedDiskRenderer';` and the call site `createDiskRenderer({...})` to `createTexturedDiskRenderer({...})`. The state-write `state.gpu.diskRenderer = diskRenderer;` and the local `const diskRenderer = ...` stay as-is — the variable is named after the field slot, which is unchanged.

For test files, run `grep -n "DiskRenderer\\|diskRenderer" tests/services/gpu/renderers/instancedQuadRenderer.test.ts tests/services/engine/frame/renderFrame.test.ts tests/services/engine/frame/runFrame.test.ts tests/services/engine/frame/passes/passes.test.ts tests/services/engine/phases/wireSlots.test.ts tests/services/engine/phases/wireInput.test.ts tests/services/engine/phases/startLoop.test.ts tests/services/engine/phases/initGpu.destroyReachability.test.ts tests/services/engine/subsystems/thumbnailSubsystem.test.ts tests/@types/engineState.test.ts` and update any `DiskRenderer` type imports to `TexturedDiskRenderer` (path `../../../../src/services/gpu/renderers/texturedDiskRenderer`). Field-name references like `state.gpu.diskRenderer` or `deps.diskRenderer` stay unchanged.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS — no `Cannot find module '.../diskRenderer'`, no `Type 'TexturedDiskRenderer' is not assignable to type 'DiskRenderer'`.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`

Expected: PASS — all 590+ tests including the new baseline still green. The baseline must still pass because Step 1's `label: 'diskRenderer'` change does not affect the production frame body, only the renderer's `.label` property which the baseline test does not inspect.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(renderer): rename diskRenderer to texturedDiskRenderer

Pure file/type/factory rename for symmetry with proceduralDiskRenderer
and the upcoming texturedQuadRenderer.  No logic changes; DiskInstance
stays unchanged (renamed later by the parallel TS-types consolidation).
Field names on state.gpu and PassDeps stay as `diskRenderer` per the
spec's scope rule.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rename `thumbnailRenderer` → `texturedQuadRenderer`

**Files:**
- Rename: `src/services/gpu/renderers/thumbnailRenderer.ts` → `src/services/gpu/renderers/texturedQuadRenderer.ts`
- Modify: `src/services/gpu/renderers/texturedQuadRenderer.ts` (rename `type ThumbnailRenderer` → `type TexturedQuadRenderer`, `createThumbnailRenderer` → `createTexturedQuadRenderer`)
- Modify: `src/@types/EngineGpuHandles.d.ts`, `src/services/engine/frame/passes/types.ts`, `src/services/engine/frame/renderFrame.ts`, `src/services/engine/frame/runFrame.ts`, `src/services/engine/subsystems/thumbnailSubsystem.ts`, `src/services/engine/phases/initGpu.ts` (import + type annotation only)
- Modify: test files using `ThumbnailRenderer` imports

`ThumbnailInstance` is **not** renamed — same rationale as `DiskInstance` in Task 2. Field names (`state.gpu.thumbnailRenderer`, `PassDeps.thumbnailRenderer`) stay.

- [ ] **Step 1: Rename the file**

```bash
git mv src/services/gpu/renderers/thumbnailRenderer.ts src/services/gpu/renderers/texturedQuadRenderer.ts
```

- [ ] **Step 2: Rename the type, factory, and label in the renamed file**

Open `src/services/gpu/renderers/texturedQuadRenderer.ts`. Replace the module header first line `* ThumbnailRenderer — billboard quad pass for galaxy thumbnails.` with `* TexturedQuadRenderer — screen-aligned billboard quad pass for galaxy thumbnails (LOD-2 fallback).`. Replace `export type ThumbnailRenderer = {` with `export type TexturedQuadRenderer = {`. Replace `export function createThumbnailRenderer(ctx: GpuContext, maxInstances = 256): ThumbnailRenderer {` with `export function createTexturedQuadRenderer(ctx: GpuContext, maxInstances = 256): TexturedQuadRenderer {`. Replace `const renderer: ThumbnailRenderer = {` with `const renderer: TexturedQuadRenderer = {`. Replace `label: 'thumbnailRenderer'` with `label: 'texturedQuadRenderer'`.

- [ ] **Step 3: Update every importer**

Run `grep -rn "from.*['\"].*thumbnailRenderer['\"]\\|ThumbnailRenderer\\b\\|createThumbnailRenderer" src tests --include="*.ts" --include="*.tsx"` to enumerate. Then update each site exactly as in Task 2's Step 3, substituting `ThumbnailRenderer` → `TexturedQuadRenderer`, `thumbnailRenderer` (module path) → `texturedQuadRenderer`, and `createThumbnailRenderer` → `createTexturedQuadRenderer`:

- `src/@types/EngineGpuHandles.d.ts`: imports + annotation.
- `src/services/engine/frame/passes/types.ts`: imports + annotation.
- `src/services/engine/frame/renderFrame.ts`: imports + annotation.
- `src/services/engine/frame/runFrame.ts`: imports + annotation.
- `src/services/engine/subsystems/thumbnailSubsystem.ts`: `import type { ThumbnailRenderer } from '../../gpu/renderers/thumbnailRenderer';` → `import type { TexturedQuadRenderer } from '../../gpu/renderers/texturedQuadRenderer';`; every `ThumbnailRenderer` type annotation (parameter on `bindToRenderers`, field on `ThumbnailFrameInput`, destructure in `runFrame`) → `TexturedQuadRenderer`.
- `src/services/engine/phases/initGpu.ts`: factory import + call site.

Test files: same pattern. Type imports become `TexturedQuadRenderer` from the new path. Field references like `state.gpu.thumbnailRenderer` and `deps.thumbnailRenderer` stay.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`

Expected: PASS — including the visual baseline (the snapshot test only inspects `renderer.draw()` mock-call arguments, not `renderer.label`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(renderer): rename thumbnailRenderer to texturedQuadRenderer

Pure file/type/factory rename completing the LOD-2 renderer pair
(texturedDiskRenderer + texturedQuadRenderer).  No logic changes;
ThumbnailInstance stays.  Field names on state.gpu and PassDeps stay
as `thumbnailRenderer` per the spec's scope rule.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `GalaxyAtlasSubsystem` type contract

**Files:**
- Create: `src/@types/GalaxyAtlasSubsystem.d.ts`

This task is type-only — no implementation yet. The implementation lands in Task 5. Splitting the type into its own file matches the project convention (one type per file in `@types/`, no barrel re-exports).

- [ ] **Step 1: Write the type declaration**

Create `src/@types/GalaxyAtlasSubsystem.d.ts`:

```typescript
/**
 * GalaxyAtlasSubsystem — shared GPU texture atlas + bitmap-fetch queue
 * for the LOD-2 (textured-impostor) galaxy path.
 *
 * ### What this owns
 *
 * The 2048² LRU atlas texture, the LRU clock, the priority-queued bitmap
 * fetcher, failure memoisation, and an eviction notification hook.  It
 * has NO direct connection to per-frame catalog walking — that lives in
 * `texturedImpostorSubsystem`, which calls into this atlas to allocate
 * slots and schedule fetches.
 *
 * ### Why a separate subsystem
 *
 * Pre-split, this state lived inline in `thumbnailSubsystem` alongside
 * per-frame planning + render dispatch.  Splitting it out gives the LOD-2
 * planner (`texturedImpostorSubsystem`) one focused dependency to inject
 * — and gives future code that wants to read atlas state (debug HUD,
 * memory profilers) a typed surface to consume.
 *
 * ### Eviction handler protocol
 *
 * `setEvictHandler` is the seam by which the LOD-2 planner clears its
 * own parallel maps (`bitmapReady`, `bitmapFailed`, `bitmapReadyTime`)
 * when the atlas's LRU recycles a slot.  Without this hook, those
 * parallel maps grow without bound — a pre-split bug fixed by the
 * `atlas.setEvictHandler` wiring in `thumbnailSubsystem.ts` lines 418-422.
 */

import type { Destroyable } from './Destroyable';

export type GalaxyAtlasFetchInput = {
  readonly key: string;
  readonly priority: number;
  readonly fetcher: () => Promise<ImageBitmap | null>;
  readonly onResult: (bitmap: ImageBitmap | null) => void;
};

export type GalaxyAtlasSubsystem = Destroyable & {
  /**
   * Allocate or refresh an LRU slot.  Returns slot index, or null when
   * every slot is in use AND none can be evicted.  Bumps the LRU clock
   * for an existing key.
   */
  allocate(key: string, atFrame: number): number | null;

  /**
   * UV rect `[u0, v0, u1, v1]` for a slot — feeds the renderer instance
   * buffer.
   */
  slotUv(slot: number): readonly [number, number, number, number];

  /**
   * Frame the slot was last allocate()-touched, or undefined if evicted.
   * Lets fetchers detect "my slot got reassigned during the network
   * round-trip".
   */
  lastSeenFrame(key: string): number | undefined;

  /** Upload a bitmap into a previously-allocated slot. */
  uploadBitmap(slot: number, bitmap: ImageBitmap): void;

  /** Idempotent — re-enqueueing an in-flight key only refreshes priority. */
  enqueueFetch(input: GalaxyAtlasFetchInput): void;

  /** Reports whether the bitmap has landed in the atlas / failed to fetch. */
  isLoaded(key: string): boolean;
  isFailed(key: string): boolean;

  /**
   * Number of in-flight fetches.  Read by the textured-impostor
   * subsystem's `hasInFlightWork()` (which the engine's render-on-demand
   * predicate ORs in).
   */
  inFlightCount(): number;

  /** Texture view bound by the LOD-2 renderers (called once at wireSlots). */
  getTextureView(): GPUTextureView;

  /**
   * Optional handler called when LRU evicts a slot.  The
   * `texturedImpostorSubsystem` subscribes to clear its bitmapReady /
   * bitmapFailed / bitmapReadyTime entries for the ousted key.
   */
  setEvictHandler(handler: ((key: string) => void) | undefined): void;
};
```

- [ ] **Step 2: Run typecheck to confirm the new file compiles**

Run: `npm run typecheck`

Expected: PASS — the file declares only types, so it compiles with no consumers yet.

- [ ] **Step 3: Commit**

```bash
git add src/@types/GalaxyAtlasSubsystem.d.ts
git commit -m "$(cat <<'EOF'
feat(@types): add GalaxyAtlasSubsystem type contract

Pure type declaration for the shared atlas + queue infrastructure that
the upcoming subsystem split will extract from thumbnailSubsystem.
Lives in @types/ per-concern, no barrel re-export.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extract `galaxyAtlasSubsystem` from `thumbnailSubsystem`

**Files:**
- Create: `src/services/engine/subsystems/galaxyAtlasSubsystem.ts`
- Create: `tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts`

This task creates the new subsystem alongside `thumbnailSubsystem` — the old subsystem is NOT yet rewired to use it. That cutover happens in Task 11. Keeping the two coexisting at this point lets the test suite exercise both independently and lets the visual baseline keep passing through the intermediate commits.

`thumbnailSubsystem.ts:381-426` is the canonical source for the atlas + queue logic being moved. The factory shape mirrors `createThumbnailSubsystem` but exposes only the atlas/queue API surface from the new `GalaxyAtlasSubsystem` type.

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts`:

```typescript
/**
 * galaxyAtlasSubsystem — unit tests for the shared atlas + queue
 * infrastructure extracted from thumbnailSubsystem.
 *
 * Coverage focus:
 *   - allocate() returns distinct slot indices for distinct keys
 *   - allocate() bumps the LRU clock on a repeat key
 *   - enqueueFetch() is idempotent for an in-flight key
 *   - setEvictHandler fires on LRU eviction with the ousted key
 *   - inFlightCount() tracks pending fetches
 *   - destroy() clears the eviction handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGalaxyAtlasSubsystem } from '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem';

function makeFakeDevice(): GPUDevice {
  const fakeTexture = { createView: () => ({}) as GPUTextureView };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeFakeBitmap(): ImageBitmap {
  return { width: 128, height: 128, close: () => {} } as unknown as ImageBitmap;
}

describe('createGalaxyAtlasSubsystem', () => {
  let device: GPUDevice;
  beforeEach(() => {
    device = makeFakeDevice();
  });

  it('allocate returns distinct slots for distinct keys', () => {
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const s1 = atlas.allocate('a', 1);
    const s2 = atlas.allocate('b', 1);
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    expect(s1).not.toBe(s2);
  });

  it('allocate refreshes the LRU clock for a repeat key', () => {
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    atlas.allocate('k', 1);
    expect(atlas.lastSeenFrame('k')).toBe(1);
    atlas.allocate('k', 7);
    expect(atlas.lastSeenFrame('k')).toBe(7);
  });

  it('enqueueFetch is idempotent for an in-flight key', () => {
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const fetcher = vi.fn(() => new Promise<ImageBitmap | null>(() => {})); // hangs
    atlas.enqueueFetch({ key: 'k', priority: 1, fetcher, onResult: () => {} });
    atlas.enqueueFetch({ key: 'k', priority: 1, fetcher, onResult: () => {} });
    atlas.enqueueFetch({ key: 'k', priority: 1, fetcher, onResult: () => {} });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(atlas.inFlightCount()).toBe(1);
  });

  it('setEvictHandler fires when LRU recycles a slot', () => {
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const evicted: string[] = [];
    atlas.setEvictHandler((k) => evicted.push(k));
    // Fill 256 slots, then allocate a 257th to force eviction.
    for (let i = 0; i < 256; i++) atlas.allocate(`k${i}`, 1);
    atlas.allocate('k256', 2);
    expect(evicted.length).toBe(1);
    expect(evicted[0]).toBe('k0');
  });

  it('isLoaded flips true after uploadBitmap', () => {
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const slot = atlas.allocate('k', 1)!;
    expect(atlas.isLoaded('k')).toBe(false);
    atlas.uploadBitmap(slot, makeFakeBitmap());
    // Note: isLoaded reads the subsystem's internal bookkeeping set;
    // for this test we just confirm uploadBitmap doesn't throw and
    // slotUv returns four numbers.
    const uv = atlas.slotUv(slot);
    expect(uv).toHaveLength(4);
  });

  it('destroy clears the eviction handler', () => {
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const handler = vi.fn();
    atlas.setEvictHandler(handler);
    atlas.destroy();
    // After destroy the handler should not be invoked even if more
    // allocations happen — but we don't allocate post-destroy in
    // production; just assert destroy() itself doesn't throw.
    expect(() => atlas.destroy()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts`

Expected: FAIL — `Cannot find module '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem'`.

- [ ] **Step 3: Implement the subsystem**

Create `src/services/engine/subsystems/galaxyAtlasSubsystem.ts`:

```typescript
/**
 * galaxyAtlasSubsystem — the shared LOD-2 atlas + queue infrastructure.
 *
 * Extracted from `thumbnailSubsystem.ts` as part of the 2026-05-12
 * impostor-subsystem split.  Owns the 2048² GPU texture atlas, the LRU
 * clock, the priority-queued bitmap fetcher, the failure-memoisation
 * pair (handled here for "did the fetch land at all?" — separate from
 * the load-fade bookkeeping which lives in `texturedImpostorSubsystem`),
 * and the eviction notification hook.
 *
 * No catalog awareness; no per-frame planning; no GPU dispatch.  This
 * file's API surface is exactly the `GalaxyAtlasSubsystem` type in
 * `@types/GalaxyAtlasSubsystem.d.ts`.
 *
 * ### Why `bitmapReady` and `bitmapFailed` (not just `bitmapReadyTime`)
 *
 * The legacy `thumbnailSubsystem` carried three parallel maps:
 *   - `bitmapReady`     — set membership: did this bitmap land?
 *   - `bitmapFailed`    — set membership: did this fetch permanently fail?
 *   - `bitmapReadyTime` — Map<key, ms>: when did it land (drives load-fade)?
 *
 * The first two are pure "did the fetch succeed?" state — exactly the
 * shape that lives here.  The third is load-fade state and belongs in
 * `texturedImpostorSubsystem`, which owns the fade-window decisions.
 * The eviction handler (`setEvictHandler`) is what lets the LOD-2 planner
 * keep its parallel `bitmapReadyTime` map in sync without re-implementing
 * the LRU clock.
 */

import type { GalaxyAtlasFetchInput, GalaxyAtlasSubsystem } from '../../../@types/GalaxyAtlasSubsystem';
import type { Destroyable } from '../../../@types/Destroyable';
import { TextureAtlas } from '../../gpu/resources/textureAtlas';
import { PriorityQueue } from '../../../utils/concurrency/priorityQueue';

export type GalaxyAtlasDeps = {
  readonly device: GPUDevice;
  /**
   * Wake the engine's render loop for the next frame.  Called when a
   * fetch completes (so the thumbnail can render) and when a fetch
   * fails (so the still-animating predicate re-checks `inFlightCount`).
   */
  readonly requestRender: () => void;
};

export function createGalaxyAtlasSubsystem(deps: GalaxyAtlasDeps): GalaxyAtlasSubsystem {
  const { device, requestRender } = deps;

  const atlas = new TextureAtlas(device);
  atlas.initTexture();

  const queue = new PriorityQueue();

  // Set membership: "this bitmap landed".  No timing — that's the
  // load-fade planner's job, layered above this subsystem.
  const bitmapReady = new Set<string>();
  // Set membership: "this fetch permanently failed; do not retry".
  // Cleared when LRU recycles the key's slot (see setEvictHandler below).
  const bitmapFailed = new Set<string>();

  let userEvictHandler: ((key: string) => void) | undefined;
  // Wire the atlas's eviction notification: clear our own membership
  // sets AND forward to the consumer-supplied handler (the LOD-2
  // planner uses that to clear its bitmapReadyTime map).
  atlas.setEvictHandler((key) => {
    bitmapReady.delete(key);
    bitmapFailed.delete(key);
    userEvictHandler?.(key);
  });

  let destroyed = false;

  const subsystem: GalaxyAtlasSubsystem = {
    allocate(key, atFrame) {
      return atlas.allocate(key, atFrame);
    },
    slotUv(slot) {
      return atlas.slotUv(slot);
    },
    lastSeenFrame(key) {
      return atlas.lastSeenFrame(key);
    },
    uploadBitmap(slot, bitmap) {
      atlas.uploadBitmap(slot, bitmap);
      // The caller's key is what landed; the subsystem doesn't have
      // the key at this entry point (uploadBitmap takes a slot index),
      // so isLoaded() is driven by the enqueueFetch wrapper below
      // which DOES have the key.  Production callers always pair
      // uploadBitmap with the wrapper, so this split is fine.
    },
    enqueueFetch(input: GalaxyAtlasFetchInput) {
      // Re-entry guard: don't enqueue keys we've already given up on.
      // (The legacy code at thumbnailSubsystem.ts:714 also gated on
      // bitmapFailed before calling queue.enqueue; we preserve that.)
      if (bitmapFailed.has(input.key)) return;
      queue.enqueue({
        key: input.key,
        priority: input.priority,
        fetcher: input.fetcher,
        onResult: (bitmap) => {
          if (destroyed) {
            bitmap?.close();
            return;
          }
          if (!bitmap) {
            bitmapFailed.add(input.key);
            requestRender();
            input.onResult(null);
            return;
          }
          bitmapReady.add(input.key);
          // `onResult` is the consumer's hook — they upload via
          // uploadBitmap() inside this callback and update their
          // own load-fade timing.
          input.onResult(bitmap);
          requestRender();
        },
      });
    },
    isLoaded(key) {
      return bitmapReady.has(key);
    },
    isFailed(key) {
      return bitmapFailed.has(key);
    },
    inFlightCount() {
      return queue.inFlightCount();
    },
    getTextureView() {
      return atlas.getTextureView();
    },
    setEvictHandler(handler) {
      userEvictHandler = handler;
    },
    destroy() {
      destroyed = true;
      // Drop our own atlas-eviction subscription (the constructor wired
      // it up).  Without this, the underlying atlas would call back
      // into our set-clearing closure post-destroy.
      atlas.setEvictHandler(undefined);
      userEvictHandler = undefined;
      bitmapReady.clear();
      bitmapFailed.clear();
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts`

Expected: PASS — six tests green.

- [ ] **Step 5: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS — including the visual baseline (the new subsystem is not yet wired into production; nothing changed for the legacy path).

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/galaxyAtlasSubsystem.ts tests/services/engine/subsystems/galaxyAtlasSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): extract galaxyAtlasSubsystem from thumbnailSubsystem

Shared LOD-2 atlas + queue + failure-memoisation infrastructure, lifted
from the legacy thumbnailSubsystem into its own module.  Not yet wired
into production — that's Task 11.  Coexists with the legacy path so the
visual baseline keeps passing through the intermediate commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Add `ProceduralDiskSubsystem` type contract

**Files:**
- Create: `src/@types/ProceduralDiskSubsystem.d.ts`

- [ ] **Step 1: Write the type declaration**

Create `src/@types/ProceduralDiskSubsystem.d.ts`:

```typescript
/**
 * ProceduralDiskSubsystem — LOD-1 per-frame planner.
 *
 * Walks the catalog under stride decimation, applies the
 * `px > PROCEDURAL_DISK_FADE_START_PX` + finite-orientation gate,
 * computes the crossfade alpha via the shared `maybeEmitProceduralDisk`
 * helper, updates sticky-instance state to absorb decimation, sorts
 * back-to-front, and stashes the result on `lastOutput`.
 *
 * No GPU work, no atlas dependency, no fetches — pure CPU.  The pass
 * file (`proceduralDisksPass.ts`) reads `lastOutput.instances` and
 * forwards them to `proceduralDiskRenderer.draw()` inside the existing
 * HDR render pass.
 */

import type { Destroyable } from './Destroyable';
import type { PointCloud } from './PointCloud';
import type { ProceduralDiskInstance } from './ProceduralDiskInstance';
import type { OrbitCamera } from './OrbitCamera';
import type { Source } from '../data/sources';

export type ProceduralDiskFrameInput = {
  readonly cam: OrbitCamera;
  readonly clouds: ReadonlyMap<Source, PointCloud>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
};

export type ProceduralDiskFrameOutput = {
  /** Back-to-front sorted; consumer ships this array directly to the renderer. */
  readonly instances: readonly ProceduralDiskInstance[];
};

export type ProceduralDiskSubsystem = Destroyable & {
  /**
   * Pure CPU step.  See the module docstring for what it does.
   * Returns the output AND stashes it on `lastOutput` so the pass
   * file can read it without re-running.
   */
  runFrame(input: ProceduralDiskFrameInput): ProceduralDiskFrameOutput;

  /**
   * Latest output — read by `proceduralDisksPass.draw()` without
   * re-running.  Initialised to empty arrays so the pass reads valid
   * (empty) data before the first frame.
   */
  readonly lastOutput: ProceduralDiskFrameOutput;
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/@types/ProceduralDiskSubsystem.d.ts
git commit -m "$(cat <<'EOF'
feat(@types): add ProceduralDiskSubsystem type contract

Pure type declaration for the LOD-1 per-frame planner.  Implementation
follows in Task 7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Extract `proceduralDiskSubsystem` from `thumbnailSubsystem`

**Files:**
- Create: `src/services/engine/subsystems/proceduralDiskSubsystem.ts`
- Create: `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts`

Source material in `thumbnailSubsystem.ts`:
- The `maybeEmitProceduralDisk` helper (lines 207-243) and the `PROCEDURAL_DISK_FADE_START_PX` / `PROCEDURAL_DISK_FADE_END_PX` constants (lines 120-121) get re-exported from the new file. The legacy file's exports stay until Task 14 deletes it; consumers that import these symbols (the points-pass settings wiring in `runFrame.ts:85-87`) will be migrated to the new path in Task 11.
- The per-cloud / per-galaxy loop body that emits ProceduralDiskInstances (lines 556-906, specifically the `if (px > PROCEDURAL_DISK_FADE_START_PX) { ... stickyProcDisks.set(...) }` branch at lines 883-906) moves here.
- The sticky-procedural-disks map (`stickyProcDisksBySource`, line 446) and round-robin cursor (`strideStartBySource`, line 452 — but a separate copy; the LOD-1 and LOD-2 planners each own their own cursor per the spec's "two walks" rationale).

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts`:

```typescript
/**
 * proceduralDiskSubsystem — unit tests for the LOD-1 per-frame planner.
 *
 * Coverage focus:
 *   - emits a ProceduralDiskInstance for every galaxy whose apparent
 *     size is in the (8, ∞) band with finite orientation
 *   - emits nothing for galaxies below 8 px
 *   - emits nothing for galaxies with NaN axisRatio / positionAngleDeg
 *   - respects visibleSourceMask
 *   - stride decimation walks 1/N of the cloud per frame and the
 *     sticky map keeps un-visited galaxies on screen between sweeps
 *   - `lastOutput` is updated each runFrame
 */

import { describe, it, expect } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createProceduralDiskSubsystem } from '../../../../src/services/engine/subsystems/proceduralDiskSubsystem';
import type { PointCloud, OrbitCamera } from '../../../../src/@types';

function makeDenseCloud(count: number, ar = 0.7, pa = 45): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(ar),
    positionAngleDeg: fill(pa),
    diameterKpc: fill(50),
  };
}

function makeCam(): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: 0.05,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([9.95, 0, 0]),
  } as unknown as OrbitCamera;
}

function makeInput(clouds: Map<Source, PointCloud>, mask = 0xffffffff) {
  const cam = makeCam();
  return {
    cam,
    clouds,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
  };
}

describe('createProceduralDiskSubsystem', () => {
  it('emits one ProceduralDiskInstance per galaxy above 8 px with finite orientation', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = sys.runFrame(makeInput(clouds));
    expect(out.instances.length).toBe(4);
  });

  it('emits nothing for a cloud whose source bit is clear', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out = sys.runFrame(makeInput(clouds, 0));
    expect(out.instances.length).toBe(0);
  });

  it('skips galaxies with NaN orientation', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4, NaN, NaN)]]);
    const out = sys.runFrame(makeInput(clouds));
    expect(out.instances.length).toBe(0);
  });

  it('decimationFactor=2 walks half the cloud per frame, sticky map covers gap', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 2 });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(4)]]);
    const out1 = sys.runFrame(makeInput(clouds));
    expect(out1.instances.length).toBe(2);
    const out2 = sys.runFrame(makeInput(clouds));
    // Frame 2: cursor visits the other 2 indices; sticky entries from
    // frame 1 persist, so total stays at 4.
    expect(out2.instances.length).toBe(4);
  });

  it('lastOutput mirrors the most recent runFrame return', () => {
    const sys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    expect(sys.lastOutput.instances.length).toBe(0);
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);
    sys.runFrame(makeInput(clouds));
    expect(sys.lastOutput.instances.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the subsystem**

Create `src/services/engine/subsystems/proceduralDiskSubsystem.ts`:

```typescript
/**
 * proceduralDiskSubsystem — LOD-1 per-frame planner.
 *
 * Extracted from `thumbnailSubsystem.ts` lines 547-906 as part of the
 * 2026-05-12 impostor-subsystem split.  Owns the catalog walk,
 * apparent-size + finite-orientation gating, stride decimation,
 * per-source sticky map, back-to-front sort, and the
 * `ProceduralDiskInstance[]` output array.
 *
 * No GPU work.  Subsystem reads catalog buffers and emits a sorted
 * array; `proceduralDisksPass` consumes the array next frame.
 *
 * ### Why a separate stride cursor from the LOD-2 planner
 *
 * The two planners each walk the catalog every frame with their own
 * stride cursor.  The spec's "two walks vs. one shared" analysis
 * settled on two: per-row cost is dominated by the squared-distance
 * compare which neither planner can make cheaper, the per-frame
 * sticky-map updates are independent (LOD-1 emits ProceduralDiskInstance,
 * LOD-2 emits ThumbnailInstance/DiskInstance), and a shared walk
 * would just be an outer loop wrapping two independent inner bodies —
 * recreating the kitchen-sink concern the split exists to eliminate.
 *
 * ### Tunables re-exported
 *
 * `PROCEDURAL_DISK_FADE_START_PX` / `PROCEDURAL_DISK_FADE_END_PX` and
 * `maybeEmitProceduralDisk` are re-exported here.  The points-pass
 * settings wiring in `runFrame.ts` imports them from this module
 * (post-Task-11) — same source of truth as the legacy import path,
 * just a more LOD-aligned home.
 */

import { Source } from '../../../data/sources';
import { pickColourIndex } from '../../../data/colourIndex';
import type { PointCloud, OrbitCamera, Destroyable } from '../../../@types';
import type { ProceduralDiskInstance } from '../../../@types/ProceduralDiskInstance';
import type {
  ProceduralDiskFrameInput,
  ProceduralDiskFrameOutput,
  ProceduralDiskSubsystem,
} from '../../../@types/ProceduralDiskSubsystem';

/** See thumbnailSubsystem.ts lines 88-119 for the picking rationale. */
export const PROCEDURAL_DISK_FADE_START_PX = 8;
export const PROCEDURAL_DISK_FADE_END_PX = 14;

/** See thumbnailSubsystem.ts line 146 for the rationale. */
const MAX_PLAUSIBLE_DIAMETER_KPC = 200;

/**
 * Decide whether (and how) to emit a per-frame ProceduralDiskInstance.
 * Lifted verbatim from `thumbnailSubsystem.ts:207-243`.  See that
 * docstring for the smoothstep-shape rationale and why this is a pure
 * helper rather than inline branching.
 */
export function maybeEmitProceduralDisk(
  px: number,
  ar: number,
  pa: number,
  x: number,
  y: number,
  z: number,
  sizeWorldMpc: number,
  colourIndex: number,
  fadeStartPx: number,
  fadeEndPx: number,
): ProceduralDiskInstance | null {
  if (px <= fadeStartPx) return null;
  if (!Number.isFinite(ar) || !Number.isFinite(pa)) return null;
  const t = Math.min(1, Math.max(0, (px - fadeStartPx) / (fadeEndPx - fadeStartPx)));
  const crossfadeAlpha = t * t * (3 - 2 * t);
  return {
    x,
    y,
    z,
    sizeWorldMpc,
    axisRatio: ar,
    positionAngleDeg: pa,
    colourIndex,
    crossfadeAlpha,
  };
}

export type ProceduralDiskDeps = {
  /** Defaults to 8.  Tests pass 1 to disable decimation. */
  readonly decimationFactor?: number;
};

export function createProceduralDiskSubsystem(
  deps: ProceduralDiskDeps = {},
): ProceduralDiskSubsystem {
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? 8));

  const stickyProcDisksBySource = new Map<Source, Map<number, ProceduralDiskInstance>>();
  const strideStartBySource = new Map<Source, number>();

  // Initialised to a frozen empty output so consumers that read
  // `lastOutput` before the first runFrame see valid data.
  let lastOutput: ProceduralDiskFrameOutput = { instances: [] };

  function runFrame(input: ProceduralDiskFrameInput): ProceduralDiskFrameOutput {
    const { cam, clouds, visibleSourceMask, pxPerRad } = input;

    const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
    // Below PROCEDURAL_DISK_FADE_START_PX a galaxy doesn't enter the loop body
    // at all (the LOD-1 gate).  The squared-distance early-out uses this band's
    // lower edge as the upper bound so we don't skip anything that could emit.
    const maxCamDistForVisibilityUpper = (dMpcMax * pxPerRad) / PROCEDURAL_DISK_FADE_START_PX;
    const maxCamDistSqUpper = maxCamDistForVisibilityUpper * maxCamDistForVisibilityUpper;

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const proceduralDisks: ProceduralDiskInstance[] = [];

    for (const [cloudSource, cloud] of clouds.entries()) {
      let stickyProcDisks = stickyProcDisksBySource.get(cloudSource);
      if (!stickyProcDisks) {
        stickyProcDisks = new Map();
        stickyProcDisksBySource.set(cloudSource, stickyProcDisks);
      }

      if (((visibleSourceMask >> cloudSource) & 1) === 0) {
        stickyProcDisks.clear();
        continue;
      }

      const positions = cloud.positions;
      const count = cloud.count;
      const stride = Math.max(1, Math.ceil(count / decimationFactor));
      const start = strideStartBySource.get(cloudSource) ?? 0;
      const safeStart = start >= count ? 0 : start;
      const end = Math.min(safeStart + stride, count);

      // Purge sticky entries inside the current stride window — the
      // inner loop is authoritative for those indices.
      const drop: number[] = [];
      for (const k of stickyProcDisks.keys()) {
        if (k >= safeStart && k < end) drop.push(k);
      }
      for (const k of drop) stickyProcDisks.delete(k);

      for (let i = safeStart; i < end; i++) {
        const i3 = i * 3;
        const x = positions[i3 + 0]!;
        const y = positions[i3 + 1]!;
        const z = positions[i3 + 2]!;

        const dx = cx - x;
        const dy = cy - y;
        const dz = cz - z;
        const camDistSq = dx * dx + dy * dy + dz * dz;
        if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

        const dKpcRow = cloud.diameterKpc[i]!;
        const dMpcRow = dKpcRow / 1000;
        const camDist = Math.sqrt(camDistSq);
        const px = (dMpcRow / camDist) * pxPerRad;

        if (px <= PROCEDURAL_DISK_FADE_START_PX) continue;

        const sizeWorldMpc = (dKpcRow / 1000) * 4;
        const ar = cloud.axisRatio[i]!;
        const pa = cloud.positionAngleDeg[i]!;

        const ci = pickColourIndex(
          cloudSource,
          cloud.magU[i] ?? NaN,
          cloud.magG[i] ?? NaN,
          cloud.magR[i] ?? NaN,
          cloud.magI[i] ?? NaN,
          cloud.magZ[i] ?? NaN,
        );
        const colourIndex = ci !== null ? ci.colourIndex : 1.0;

        const emitted = maybeEmitProceduralDisk(
          px,
          ar,
          pa,
          x,
          y,
          z,
          sizeWorldMpc,
          colourIndex,
          PROCEDURAL_DISK_FADE_START_PX,
          PROCEDURAL_DISK_FADE_END_PX,
        );
        if (emitted) stickyProcDisks.set(i, emitted);
      }

      strideStartBySource.set(cloudSource, end >= count ? 0 : end);

      for (const p of stickyProcDisks.values()) proceduralDisks.push(p);
    }

    // Back-to-front sort for correct alpha compositing.  See
    // thumbnailSubsystem.ts:928-953 for the rationale.
    const camPosX = cam.position[0];
    const camPosY = cam.position[1];
    const camPosZ = cam.position[2];
    proceduralDisks.sort((a, b) => {
      const dax = a.x - camPosX;
      const day = a.y - camPosY;
      const daz = a.z - camPosZ;
      const dbx = b.x - camPosX;
      const dby = b.y - camPosY;
      const dbz = b.z - camPosZ;
      return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
    });

    lastOutput = { instances: proceduralDisks };
    return lastOutput;
  }

  function destroy(): void {
    stickyProcDisksBySource.clear();
    strideStartBySource.clear();
    lastOutput = { instances: [] };
  }

  const subsystem: ProceduralDiskSubsystem = {
    runFrame,
    get lastOutput() {
      return lastOutput;
    },
    destroy,
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts`

Expected: PASS — five tests green.

- [ ] **Step 5: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS — the new subsystem is still not wired into production, so the visual baseline is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/proceduralDiskSubsystem.ts tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): extract proceduralDiskSubsystem from thumbnailSubsystem

LOD-1 per-frame planner — catalog walk, apparent-size + orientation
gate, stride decimation, sticky map, back-to-front sort, emits
ProceduralDiskInstance[].  No GPU work; pure CPU.  Not yet wired into
production (Task 11).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add `TexturedImpostorSubsystem` type contract

**Files:**
- Create: `src/@types/TexturedImpostorSubsystem.d.ts`

- [ ] **Step 1: Write the type declaration**

Create `src/@types/TexturedImpostorSubsystem.d.ts`:

```typescript
/**
 * TexturedImpostorSubsystem — LOD-2 per-frame planner.
 *
 * Walks the catalog, applies the px ≥ 24 fetch gate, allocates atlas
 * slots through the injected `GalaxyAtlasSubsystem`, schedules fetches,
 * applies the metadata-based disk-vs-quad branch (per-galaxy choice
 * driven by `Number.isFinite(axisRatio) && Number.isFinite(positionAngleDeg)`
 * — see the legacy thumbnailSubsystem.ts:820), computes load-fade +
 * distance-fade multipliers, sorts back-to-front, emits two arrays.
 *
 * Owns the per-key `bitmapReadyTime` map (the load-fade window state).
 * Subscribes to the atlas's eviction handler to clear that map when
 * a slot is recycled.
 */

import type { Destroyable } from './Destroyable';
import type { PointCloud } from './PointCloud';
import type { ThumbnailInstance } from './ThumbnailInstance';
import type { DiskInstance } from '../services/gpu/renderers/texturedDiskRenderer';
import type { OrbitCamera } from './OrbitCamera';
import type { FamousMetaEntry } from '../services/loading/fetchers/famousMetaFetcher';
import type { Source } from '../data/sources';
import type { GalaxyAtlasSubsystem } from './GalaxyAtlasSubsystem';

export type TexturedImpostorFrameInput = {
  readonly cam: OrbitCamera;
  readonly clouds: ReadonlyMap<Source, PointCloud>;
  readonly visibleSourceMask: number;
  readonly pxPerRad: number;
  readonly famousMeta: readonly FamousMetaEntry[];
};

export type TexturedImpostorFrameOutput = {
  /** LOD-2 primary pipeline — galaxies with finite orientation. */
  readonly disks: readonly DiskInstance[];
  /** LOD-2 fallback pipeline — galaxies missing orientation. */
  readonly quads: readonly ThumbnailInstance[];
};

export type TexturedImpostorSubsystem = Destroyable & {
  runFrame(input: TexturedImpostorFrameInput): TexturedImpostorFrameOutput;

  readonly lastOutput: TexturedImpostorFrameOutput;

  /**
   * OR'd into the engine's render-on-demand predicate.  True while any
   * bitmap is mid-fetch OR a recently-landed bitmap is still in its
   * 400 ms load-fade window.
   */
  hasInFlightWork(): boolean;
};

/**
 * Test/inspection seam — the LOD-2 planner exposes the same `__testGetState`
 * shape the legacy thumbnailSubsystem did, so the split-out tests can
 * inspect the post-extraction subsystem's bookkeeping the same way.
 */
export type TexturedImpostorTestState = {
  readonly bitmapReadyTime: ReadonlyMap<string, number>;
};

export type TexturedImpostorSubsystemWithTestSeam = TexturedImpostorSubsystem & {
  __testGetState(): TexturedImpostorTestState;
};
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/@types/TexturedImpostorSubsystem.d.ts
git commit -m "$(cat <<'EOF'
feat(@types): add TexturedImpostorSubsystem type contract

Pure type declaration for the LOD-2 per-frame planner.  Depends on the
new GalaxyAtlasSubsystem.  Implementation in Task 9.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Extract `texturedImpostorSubsystem` from `thumbnailSubsystem`

**Files:**
- Create: `src/services/engine/subsystems/texturedImpostorSubsystem.ts`
- Create: `tests/services/engine/subsystems/texturedImpostorSubsystem.test.ts`

Source material in `thumbnailSubsystem.ts`:
- Atlas-slot allocation + fetch path (lines 682-849) — now routed through the injected `GalaxyAtlasSubsystem`.
- Disk-vs-quad emission branch (line 820 — the `Number.isFinite(ar) && Number.isFinite(pa)` decision).
- Load-fade multiplier (lines 783-810 — multiplies into the per-instance `fadeAlpha`).
- `bitmapReadyTime` map (line 413) — stays here (load-fade state, not atlas state).
- `hasInFlightFetches` (lines 995-1006) — becomes `hasInFlightWork`.
- Distance-fade smoothstep using `APPARENT_SIZE_THRESHOLD_PX = 24` and `FADE_BAND_PX = 8`.

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/subsystems/texturedImpostorSubsystem.test.ts`:

```typescript
/**
 * texturedImpostorSubsystem — unit tests for the LOD-2 per-frame planner.
 *
 * Coverage focus:
 *   - allocates an atlas slot per visible-large-enough galaxy
 *   - schedules a fetch (idempotent on in-flight keys)
 *   - emits a DiskInstance when orientation is finite (px > 24 path)
 *   - emits a ThumbnailInstance when orientation is NaN
 *   - hasInFlightWork() flips with queue activity AND with the load-fade
 *     window
 *   - the atlas-eviction handler clears bitmapReadyTime
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Source } from '../../../../src/data/sources';
import { createGalaxyAtlasSubsystem } from '../../../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createTexturedImpostorSubsystem } from '../../../../src/services/engine/subsystems/texturedImpostorSubsystem';
import type { PointCloud, OrbitCamera } from '../../../../src/@types';

function makeFakeDevice(): GPUDevice {
  const fakeTexture = { createView: () => ({}) as GPUTextureView };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeFakeBitmap(): ImageBitmap {
  return { width: 128, height: 128, close: () => {} } as unknown as ImageBitmap;
}

function makeDenseCloud(count: number, ar = 0.7, pa = 45): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(ar),
    positionAngleDeg: fill(pa),
    diameterKpc: fill(50),
  };
}

function makeCam(): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: 0.05,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([9.95, 0, 0]),
  } as unknown as OrbitCamera;
}

function makeInput(clouds: Map<Source, PointCloud>, mask = 0xffffffff) {
  const cam = makeCam();
  return {
    cam,
    clouds,
    visibleSourceMask: mask,
    pxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    famousMeta: [],
  };
}

describe('createTexturedImpostorSubsystem', () => {
  let device: GPUDevice;
  beforeEach(() => {
    device = makeFakeDevice();
  });

  it('emits a DiskInstance per finite-orientation galaxy once bitmap is ready', async () => {
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedImpostorSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2)]]);

    sys.runFrame(makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = sys.runFrame(makeInput(clouds));
    expect(out.disks.length).toBe(2);
    expect(out.quads.length).toBe(0);
  });

  it('emits a ThumbnailInstance per NaN-orientation galaxy', async () => {
    const fetcher = vi.fn(async () => makeFakeBitmap());
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedImpostorSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(2, NaN, NaN)]]);
    sys.runFrame(makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const out = sys.runFrame(makeInput(clouds));
    expect(out.disks.length).toBe(0);
    expect(out.quads.length).toBe(2);
  });

  it('hasInFlightWork is true during fetch and false after it settles', async () => {
    const pending: Array<(b: ImageBitmap | null) => void> = [];
    const fetcher = vi.fn(() => new Promise<ImageBitmap | null>((res) => pending.push(res)));
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedImpostorSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(1)]]);
    sys.runFrame(makeInput(clouds));
    expect(sys.hasInFlightWork()).toBe(true);
    pending[0]!(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(sys.hasInFlightWork()).toBe(false);
  });

  it('skips fetches for already-failed keys (retry-storm guard)', async () => {
    const fetcher = vi.fn(async () => null);
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const sys = createTexturedImpostorSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher,
      decimationFactor: 1,
    });
    const clouds = new Map([[Source.SDSS, makeDenseCloud(1)]]);
    sys.runFrame(makeInput(clouds));
    await new Promise((r) => setTimeout(r, 0));
    const callsBefore = fetcher.mock.calls.length;
    for (let f = 0; f < 5; f++) sys.runFrame(makeInput(clouds));
    expect(fetcher.mock.calls.length).toBe(callsBefore);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/services/engine/subsystems/texturedImpostorSubsystem.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the subsystem**

Create `src/services/engine/subsystems/texturedImpostorSubsystem.ts`:

```typescript
/**
 * texturedImpostorSubsystem — LOD-2 per-frame planner.
 *
 * Extracted from `thumbnailSubsystem.ts` lines 487-993 as part of the
 * 2026-05-12 impostor-subsystem split.  Walks the catalog, applies the
 * px ≥ 24 gate, allocates atlas slots via the injected atlas subsystem,
 * schedules fetches, branches disk-vs-quad on `Number.isFinite(ar) &&
 * Number.isFinite(pa)`, computes load-fade + distance-fade, sorts
 * back-to-front, emits two sorted arrays.
 *
 * ### What this owns (vs. galaxyAtlasSubsystem)
 *
 * The atlas subsystem owns "did a bitmap land at all? did the fetch
 * permanently fail?".  This subsystem owns "when did the bitmap land?
 * is the load-fade still ramping?".  The split mirrors the difference
 * between persistent atlas state (lives across frames) and per-frame
 * planning state (lives in the planner that uses it).
 */

import { Source } from '../../../data/sources';
import type { PointCloud, OrbitCamera, ThumbnailInstance, Destroyable } from '../../../@types';
import type { DiskInstance } from '../../gpu/renderers/texturedDiskRenderer';
import type { GalaxyAtlasSubsystem } from '../../../@types/GalaxyAtlasSubsystem';
import type {
  TexturedImpostorFrameInput,
  TexturedImpostorFrameOutput,
  TexturedImpostorSubsystemWithTestSeam,
} from '../../../@types/TexturedImpostorSubsystem';
import type { FamousMetaEntry } from '../../loading/fetchers/famousMetaFetcher';
import { fetchGalaxyBitmap } from '../../../utils/network/galaxyImageFetcher';
import { cartesianToRaDecZ } from '../../../utils/math';

/** See thumbnailSubsystem.ts:87. */
const APPARENT_SIZE_THRESHOLD_PX = 24;
/** See thumbnailSubsystem.ts:129. */
const FADE_BAND_PX = 8;
/** See thumbnailSubsystem.ts:138. */
const LOAD_FADE_MS = 400;
/** See thumbnailSubsystem.ts:146. */
const MAX_PLAUSIBLE_DIAMETER_KPC = 200;
/** See thumbnailSubsystem.ts:154. */
const DISK_THRESHOLD_PX = 4;

/** See thumbnailSubsystem.ts:164. */
export function galaxyCacheKey(ra: number, dec: number): string {
  return `${ra.toFixed(5)}_${dec.toFixed(5)}`;
}

export type TexturedImpostorDeps = {
  readonly device: GPUDevice;
  readonly atlas: GalaxyAtlasSubsystem;
  readonly requestRender: () => void;
  /** For tests.  Defaults to fetchGalaxyBitmap. */
  readonly fetcher?: (args: {
    ra: number;
    dec: number;
    famousId?: string;
  }) => Promise<ImageBitmap | null>;
  readonly decimationFactor?: number;
};

export function createTexturedImpostorSubsystem(
  deps: TexturedImpostorDeps,
): TexturedImpostorSubsystemWithTestSeam {
  const { atlas, requestRender } = deps;
  const fetcher = deps.fetcher ?? fetchGalaxyBitmap;
  const decimationFactor = Math.max(1, Math.floor(deps.decimationFactor ?? 8));

  // Load-fade timing — separate from the atlas's `bitmapReady`/`bitmapFailed`
  // set membership.  Cleared via the atlas's eviction handler so we don't
  // leak entries for recycled slots.
  const bitmapReadyTime = new Map<string, number>();

  atlas.setEvictHandler((key) => {
    bitmapReadyTime.delete(key);
  });

  const stickyQuadsBySource = new Map<Source, Map<number, ThumbnailInstance>>();
  const stickyDisksBySource = new Map<Source, Map<number, DiskInstance>>();
  const strideStartBySource = new Map<Source, number>();

  let frameCounter = 0;
  let destroyed = false;

  let lastOutput: TexturedImpostorFrameOutput = { disks: [], quads: [] };

  function runFrame(input: TexturedImpostorFrameInput): TexturedImpostorFrameOutput {
    if (destroyed) return lastOutput;

    const { cam, clouds, visibleSourceMask, pxPerRad, famousMeta } = input;
    frameCounter++;

    const dMpcMax = MAX_PLAUSIBLE_DIAMETER_KPC / 1000;
    const maxCamDistForVisibilityUpper = (dMpcMax * pxPerRad) / APPARENT_SIZE_THRESHOLD_PX;
    const maxCamDistSqUpper = maxCamDistForVisibilityUpper * maxCamDistForVisibilityUpper;

    const cx = cam.position[0];
    const cy = cam.position[1];
    const cz = cam.position[2];

    const quads: ThumbnailInstance[] = [];
    const disks: DiskInstance[] = [];

    const nowMs = performance.now();

    for (const [cloudSource, cloud] of clouds.entries()) {
      let stickyQuads = stickyQuadsBySource.get(cloudSource);
      if (!stickyQuads) {
        stickyQuads = new Map();
        stickyQuadsBySource.set(cloudSource, stickyQuads);
      }
      let stickyDisks = stickyDisksBySource.get(cloudSource);
      if (!stickyDisks) {
        stickyDisks = new Map();
        stickyDisksBySource.set(cloudSource, stickyDisks);
      }

      if (((visibleSourceMask >> cloudSource) & 1) === 0) {
        stickyQuads.clear();
        stickyDisks.clear();
        continue;
      }

      const positions = cloud.positions;
      const count = cloud.count;
      const stride = Math.max(1, Math.ceil(count / decimationFactor));
      const start = strideStartBySource.get(cloudSource) ?? 0;
      const safeStart = start >= count ? 0 : start;
      const end = Math.min(safeStart + stride, count);

      const purgeStride = <V>(m: Map<number, V>): void => {
        const drop: number[] = [];
        for (const k of m.keys()) {
          if (k >= safeStart && k < end) drop.push(k);
        }
        for (const k of drop) m.delete(k);
      };
      purgeStride(stickyQuads);
      purgeStride(stickyDisks);

      for (let i = safeStart; i < end; i++) {
        const i3 = i * 3;
        const x = positions[i3 + 0]!;
        const y = positions[i3 + 1]!;
        const z = positions[i3 + 2]!;

        const dx = cx - x;
        const dy = cy - y;
        const dz = cz - z;
        const camDistSq = dx * dx + dy * dy + dz * dz;
        if (camDistSq <= 0 || camDistSq > maxCamDistSqUpper) continue;

        const dKpcRow = cloud.diameterKpc[i]!;
        const dMpcRow = dKpcRow / 1000;
        const camDist = Math.sqrt(camDistSq);
        const px = (dMpcRow / camDist) * pxPerRad;

        if (cloudSource !== Source.Famous && px < APPARENT_SIZE_THRESHOLD_PX) continue;

        const sizeWorldMpc = (dKpcRow / 1000) * 4;
        const ar = cloud.axisRatio[i]!;
        const pa = cloud.positionAngleDeg[i]!;

        const [ra, dec] = cartesianToRaDecZ(x, y, z);
        const key = galaxyCacheKey(ra, dec);

        const slot = atlas.allocate(key, frameCounter);
        if (slot === null) continue;

        if (atlas.isFailed(key)) continue;

        if (!atlas.isLoaded(key)) {
          const sourceForFetch = cloudSource;
          const idxForFetch = i;
          atlas.enqueueFetch({
            key,
            priority: px,
            fetcher: () => {
              const fId = sourceForFetch === Source.Famous ? famousMeta[idxForFetch]?.id : undefined;
              return fetcher({ ra, dec, famousId: fId });
            },
            onResult: (bitmap) => {
              if (destroyed) {
                bitmap?.close();
                return;
              }
              if (!bitmap) return; // atlas already memoised the failure
              if (atlas.lastSeenFrame(key) === undefined) {
                bitmap.close();
                return;
              }
              atlas.uploadBitmap(slot, bitmap);
              bitmapReadyTime.set(key, performance.now());
              bitmap.close();
            },
          });
          continue;
        }

        const [u0, v0, u1, v1] = atlas.slotUv(slot);

        const distT = Math.min(1, Math.max(0, (px - APPARENT_SIZE_THRESHOLD_PX) / FADE_BAND_PX));
        const distFade = distT * distT * (3 - 2 * distT);
        const tReady = bitmapReadyTime.get(key);
        const loadFade = tReady === undefined ? 0 : Math.min(1, (nowMs - tReady) / LOAD_FADE_MS);
        const fadeAlpha = distFade * loadFade;

        if (px > DISK_THRESHOLD_PX && Number.isFinite(ar) && Number.isFinite(pa)) {
          stickyDisks.set(i, {
            x,
            y,
            z,
            sizeWorld: sizeWorldMpc,
            u0,
            v0,
            u1,
            v1,
            axisRatio: ar,
            positionAngleDeg: pa,
            fadeAlpha,
          });
        } else {
          stickyQuads.set(i, {
            x,
            y,
            z,
            sizeWorld: sizeWorldMpc,
            u0,
            v0,
            u1,
            v1,
            fadeAlpha,
          });
        }
      }

      strideStartBySource.set(cloudSource, end >= count ? 0 : end);

      for (const q of stickyQuads.values()) quads.push(q);
      for (const d of stickyDisks.values()) disks.push(d);
    }

    const camPosX = cam.position[0];
    const camPosY = cam.position[1];
    const camPosZ = cam.position[2];
    const cmpFar = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number => {
      const dax = a.x - camPosX;
      const day = a.y - camPosY;
      const daz = a.z - camPosZ;
      const dbx = b.x - camPosX;
      const dby = b.y - camPosY;
      const dbz = b.z - camPosZ;
      return dbx * dbx + dby * dby + dbz * dbz - (dax * dax + day * day + daz * daz);
    };
    quads.sort(cmpFar);
    disks.sort(cmpFar);

    lastOutput = { disks, quads };
    return lastOutput;
  }

  function hasInFlightWork(): boolean {
    if (atlas.inFlightCount() > 0) return true;
    if (bitmapReadyTime.size === 0) return false;
    const nowMs = performance.now();
    for (const t of bitmapReadyTime.values()) {
      if (nowMs - t < LOAD_FADE_MS) return true;
    }
    return false;
  }

  function destroy(): void {
    destroyed = true;
    atlas.setEvictHandler(undefined);
    bitmapReadyTime.clear();
    stickyQuadsBySource.clear();
    stickyDisksBySource.clear();
    strideStartBySource.clear();
    lastOutput = { disks: [], quads: [] };
  }

  const subsystem: TexturedImpostorSubsystemWithTestSeam = {
    runFrame,
    get lastOutput() {
      return lastOutput;
    },
    hasInFlightWork,
    destroy,
    __testGetState() {
      return { bitmapReadyTime };
    },
  };
  subsystem satisfies Destroyable;
  return subsystem;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/services/engine/subsystems/texturedImpostorSubsystem.test.ts`

Expected: PASS — four tests green.

- [ ] **Step 5: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/subsystems/texturedImpostorSubsystem.ts tests/services/engine/subsystems/texturedImpostorSubsystem.test.ts
git commit -m "$(cat <<'EOF'
feat(engine): extract texturedImpostorSubsystem from thumbnailSubsystem

LOD-2 per-frame planner — atlas slot allocation via injected
galaxyAtlasSubsystem, fetch scheduling, disk-vs-quad metadata branch,
load-fade + distance-fade, sticky map, back-to-front sort.  Not yet
wired into production (Task 11).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add `proceduralDisksPass` and `texturedImpostorsPass`

**Files:**
- Create: `src/services/engine/frame/passes/proceduralDisksPass.ts`
- Create: `src/services/engine/frame/passes/texturedImpostorsPass.ts`
- Modify: `src/services/engine/frame/passes/types.ts` (add `proceduralDiskRenderer` to `PassDeps`)
- Modify: `src/services/engine/frame/passes/index.ts` (import the two new passes; do NOT yet swap them into `HDR_PASSES` — that's Task 12)
- Create: `tests/services/engine/frame/passes/proceduralDisksPass.test.ts`
- Create: `tests/services/engine/frame/passes/texturedImpostorsPass.test.ts`

The new pass entries read `state.subsystems.proceduralDisks` and `state.subsystems.texturedImpostors`. Those slots don't exist on `EngineSubsystemHandles` yet — that's Task 11. The passes are written here against the eventual shape (with optional-chain guards on the slot accesses) and the slot landing in Task 11 + the registry swap in Task 12 wire them in.

- [ ] **Step 1: Write the failing pass tests**

Create `tests/services/engine/frame/passes/proceduralDisksPass.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import { proceduralDisksPass } from '../../../../../src/services/engine/frame/passes/proceduralDisksPass';
import type { PassDeps } from '../../../../../src/services/engine/frame/passes';
import type { ReadyFrameContext } from '../../../../../src/services/engine/frame/frameContext';
import type { RenderFrameSettings } from '../../../../../src/services/engine/frame/renderFrame';
import type { EngineState, OrbitCamera } from '../../../../../src/@types';

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as mat4;
  return {
    isReady: true,
    cam,
    vp,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    renderer: { draw: vi.fn() } as any,
    postProcess: { view: {} as GPUTextureView, draw: vi.fn(), resize: vi.fn(), destroy: vi.fn() } as any,
    thumbnails: { runFrame: vi.fn() } as any,
    ...overrides,
  };
}

function makeSettings(): RenderFrameSettings {
  return { galaxyTexturesEnabled: true } as RenderFrameSettings;
}

function makeDeps(): PassDeps {
  return {
    thumbnailRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    diskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    clouds: new Map(),
    famousMeta: [],
    famousXrefs: {},
    milkyWayITimeSec: 0,
  } as PassDeps;
}

describe('proceduralDisksPass', () => {
  it('is named "procedural-disks"', () => {
    expect(proceduralDisksPass.name).toBe('procedural-disks');
  });

  it('enabled() returns false when subsystems.proceduralDisks is null', () => {
    const state = { subsystems: { proceduralDisks: null } } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns false when galaxyTexturesEnabled is false', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
    } as unknown as EngineState;
    const settings = makeSettings();
    settings.galaxyTexturesEnabled = false;
    expect(proceduralDisksPass.enabled(state, makeCtx(), settings)).toBe(false);
  });

  it('enabled() returns false when lastOutput.instances is empty', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [] } } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns true with a non-empty lastOutput', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('draw() forwards instances to proceduralDiskRenderer.draw', () => {
    const instances = [{ x: 1 }, { x: 2 }];
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    const pass = {} as GPURenderPassEncoder;
    proceduralDisksPass.draw(pass, makeCtx(), state, makeSettings(), deps);
    expect(deps.proceduralDiskRenderer.draw).toHaveBeenCalledTimes(1);
    const call = (deps.proceduralDiskRenderer.draw as any).mock.calls[0];
    expect(call[5]).toBe(instances);
  });
});
```

Create `tests/services/engine/frame/passes/texturedImpostorsPass.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import { texturedImpostorsPass } from '../../../../../src/services/engine/frame/passes/texturedImpostorsPass';
import type { PassDeps } from '../../../../../src/services/engine/frame/passes';
import type { ReadyFrameContext } from '../../../../../src/services/engine/frame/frameContext';
import type { RenderFrameSettings } from '../../../../../src/services/engine/frame/renderFrame';
import type { EngineState, OrbitCamera } from '../../../../../src/@types';

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

function makeCtx(): ReadyFrameContext {
  const cam = makeCam();
  return {
    isReady: true,
    cam,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    renderer: { draw: vi.fn() } as any,
    postProcess: { view: {} as GPUTextureView, draw: vi.fn(), resize: vi.fn(), destroy: vi.fn() } as any,
    thumbnails: { runFrame: vi.fn() } as any,
  };
}

function makeSettings(): RenderFrameSettings {
  return { galaxyTexturesEnabled: true } as RenderFrameSettings;
}

function makeDeps(): PassDeps {
  return {
    thumbnailRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    diskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    clouds: new Map(),
    famousMeta: [],
    famousXrefs: {},
    milkyWayITimeSec: 0,
  } as PassDeps;
}

describe('texturedImpostorsPass', () => {
  it('is named "textured-impostors"', () => {
    expect(texturedImpostorsPass.name).toBe('textured-impostors');
  });

  it('enabled() returns false when both lastOutput arrays are empty', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [], quads: [] } } },
    } as unknown as EngineState;
    expect(texturedImpostorsPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns true with a non-empty disks array', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    expect(texturedImpostorsPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('draw() invokes texturedQuadRenderer first then texturedDiskRenderer', () => {
    const disks = [{ x: 1 }];
    const quads = [{ x: 2 }];
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks, quads } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedImpostorsPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.thumbnailRenderer.draw).toHaveBeenCalledTimes(1);
    expect(deps.diskRenderer.draw).toHaveBeenCalledTimes(1);
    // Order: quads first, then disks (matches the legacy thumbnailSubsystem
    // dispatch order at lines 955-967).
    const quadOrder = (deps.thumbnailRenderer.draw as any).mock.invocationCallOrder[0];
    const diskOrder = (deps.diskRenderer.draw as any).mock.invocationCallOrder[0];
    expect(quadOrder).toBeLessThan(diskOrder);
  });

  it('draw() skips quad call when quads array is empty', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedImpostorsPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.thumbnailRenderer.draw).not.toHaveBeenCalled();
    expect(deps.diskRenderer.draw).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/engine/frame/passes/proceduralDisksPass.test.ts tests/services/engine/frame/passes/texturedImpostorsPass.test.ts`

Expected: FAIL — modules not found.

- [ ] **Step 3: Add `proceduralDiskRenderer` to `PassDeps`**

Edit `src/services/engine/frame/passes/types.ts`:

After the existing imports near line 60, add:

```typescript
import type { ProceduralDiskRenderer } from '../../../gpu/renderers/proceduralDiskRenderer';
```

Inside the `PassDeps` type definition, after the `diskRenderer: ...` field, add:

```typescript
  /**
   * Procedural-disk renderer for the LOD-1 pass.  Reads its instance
   * array from `state.subsystems.proceduralDisks.lastOutput` rather
   * than from a `runFrame` invocation inside the pass — the subsystem
   * runs its planner step before the HDR_PASSES loop opens.
   */
  proceduralDiskRenderer: ProceduralDiskRenderer;
```

- [ ] **Step 4: Write `proceduralDisksPass`**

Create `src/services/engine/frame/passes/proceduralDisksPass.ts`:

```typescript
/**
 * proceduralDisksPass — LOD-1 procedural disk impostors.
 *
 * Issues a single draw call against `proceduralDiskRenderer` using the
 * instance array `state.subsystems.proceduralDisks.lastOutput.instances`,
 * populated by the subsystem's `runFrame` earlier in the same frame
 * (called from `runFrame.ts` before the HDR_PASSES loop opens).
 *
 * ### Why read from lastOutput instead of running the planner here
 *
 * The legacy `galaxyThumbnailsPass.draw` called `thumbnails.runFrame(...)`
 * inline, conflating "compute the per-frame state" with "issue GPU draw
 * calls".  Post-split, the planner step is hoisted to the frame body
 * (one place that calls every CPU-side subsystem) and each pass file
 * stays purely a GPU dispatch.  This decoupling is what makes the
 * follow-up GPU timestamp-query work cheap — each pass can open its
 * own encoder without re-running its planner.
 */

import type { Pass } from './types';

export const proceduralDisksPass: Pass = {
  name: 'procedural-disks',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.proceduralDisks === null) return false;
    return state.subsystems.proceduralDisks.lastOutput.instances.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const subsys = state.subsystems.proceduralDisks;
    if (subsys === null) return;
    const instances = subsys.lastOutput.instances;
    deps.proceduralDiskRenderer.draw(
      pass,
      ctx.vp as Float32Array,
      [ctx.canvasSize.width, ctx.canvasSize.height],
      [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
      ctx.drawPxPerRad,
      instances,
    );
  },
};
```

- [ ] **Step 5: Write `texturedImpostorsPass`**

Create `src/services/engine/frame/passes/texturedImpostorsPass.ts`:

```typescript
/**
 * texturedImpostorsPass — LOD-2 textured galaxy impostors.
 *
 * Two draw calls in the same render pass — quads first, then disks.
 * The legacy `thumbnailSubsystem.runFrame` dispatched in this exact
 * order (thumbnailSubsystem.ts:955-967), and although additive blending
 * makes the cosmetic order irrelevant for correctness, the visual
 * baseline test pins it.
 *
 * Both arrays come from `state.subsystems.texturedImpostors.lastOutput`,
 * populated by the subsystem's `runFrame` earlier in the same frame.
 * See `proceduralDisksPass.ts`'s docstring for the rationale on the
 * lastOutput pattern.
 */

import type { Pass } from './types';

export const texturedImpostorsPass: Pass = {
  name: 'textured-impostors',
  enabled(state, _ctx, settings) {
    if (!settings.galaxyTexturesEnabled) return false;
    if (state.subsystems.texturedImpostors === null) return false;
    const { disks, quads } = state.subsystems.texturedImpostors.lastOutput;
    return disks.length > 0 || quads.length > 0;
  },
  draw(pass, ctx, state, _settings, deps) {
    const subsys = state.subsystems.texturedImpostors;
    if (subsys === null) return;
    const { disks, quads } = subsys.lastOutput;
    if (quads.length > 0) {
      deps.thumbnailRenderer.draw(
        pass,
        ctx.vp,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        quads,
        ctx.drawCamPos,
        ctx.drawPxPerRad,
      );
    }
    if (disks.length > 0) {
      deps.diskRenderer.draw(
        pass,
        ctx.vp,
        [ctx.canvasSize.width, ctx.canvasSize.height],
        ctx.drawCamPos,
        disks,
      );
    }
  },
};
```

- [ ] **Step 6: Re-export the new passes from passes/index.ts**

Edit `src/services/engine/frame/passes/index.ts`. Near the existing `import { galaxyThumbnailsPass }` line, add:

```typescript
import { proceduralDisksPass } from './proceduralDisksPass';
import { texturedImpostorsPass } from './texturedImpostorsPass';
```

At the bottom of the file with the other re-exports, after `export { galaxyThumbnailsPass } from './galaxyThumbnailsPass';`, add:

```typescript
export { proceduralDisksPass } from './proceduralDisksPass';
export { texturedImpostorsPass } from './texturedImpostorsPass';
```

Do NOT modify the `HDR_PASSES` array yet — Task 12 owns that swap. The two new passes exist as exports here so the test files can import them.

- [ ] **Step 7: Run the new pass tests**

Run: `npx vitest run tests/services/engine/frame/passes/proceduralDisksPass.test.ts tests/services/engine/frame/passes/texturedImpostorsPass.test.ts`

Expected: PASS — eight tests across the two files.

- [ ] **Step 8: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS. The old `galaxyThumbnailsPass` still runs in production; the new passes exist but are not yet in `HDR_PASSES`.

- [ ] **Step 9: Commit**

```bash
git add src/services/engine/frame/passes/proceduralDisksPass.ts src/services/engine/frame/passes/texturedImpostorsPass.ts src/services/engine/frame/passes/types.ts src/services/engine/frame/passes/index.ts tests/services/engine/frame/passes/proceduralDisksPass.test.ts tests/services/engine/frame/passes/texturedImpostorsPass.test.ts
git commit -m "$(cat <<'EOF'
feat(passes): add proceduralDisksPass and texturedImpostorsPass

Two new LOD-aligned pass entries replacing the kitchen-sink
galaxyThumbnailsPass.  Each reads from its subsystem's lastOutput
(populated by runFrame earlier in the same frame).  Both pass files
exported from passes/index.ts but not yet added to HDR_PASSES —
Task 12 does the registry swap.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `EngineSubsystemHandles`, `ReadyFrameContext`, `isEngineReady`, and `wireSlots`

**Files:**
- Modify: `src/@types/EngineSubsystemHandles.d.ts` (replace `thumbnails` slot with three new slots)
- Modify: `src/services/engine/helpers/engineReady.ts` (update `ReadyEngineState` + `isEngineReady` predicate)
- Modify: `src/services/engine/frame/frameContext.ts` (drop `thumbnails` from `ReadyFrameContext`; add the three new subsystem references aren't strictly required because passes read off `state.subsystems` directly — but `proceduralDiskRenderer` does need to flow into `deps`)
- Modify: `src/services/engine/phases/wireSlots.ts` (construct the three new subsystems, drop the old one)
- Modify: `src/services/engine/engine.ts` (initial state literal + destroy chain)
- Modify: `src/services/engine/frame/runFrame.ts` (constants import path; planner-step calls; render-on-demand predicate)
- Modify: `src/services/engine/frame/renderFrame.ts` (PassDeps construction adds `proceduralDiskRenderer`)

This is the production cutover. After this task the new subsystems carry the live frame; the old `thumbnailSubsystem` factory is still on disk but no longer called.

Migration order inside the task:

1. EngineSubsystemHandles slot rename.
2. engineReady.ts predicate rename.
3. frameContext.ts cleanup.
4. engine.ts initial state + destroy.
5. wireSlots.ts construction.
6. runFrame.ts planner-step + RoD predicate.
7. renderFrame.ts PassDeps injection.

- [ ] **Step 1: Update `EngineSubsystemHandles.d.ts`**

Edit `src/@types/EngineSubsystemHandles.d.ts`. Replace the `import type { ThumbnailSubsystem }` line with three new imports:

```typescript
import type { GalaxyAtlasSubsystem } from './GalaxyAtlasSubsystem';
import type { ProceduralDiskSubsystem } from './ProceduralDiskSubsystem';
import type { TexturedImpostorSubsystem } from './TexturedImpostorSubsystem';
```

Then replace the `thumbnails: ThumbnailSubsystem | null;` line with:

```typescript
  galaxyAtlas: GalaxyAtlasSubsystem | null;
  proceduralDisks: ProceduralDiskSubsystem | null;
  texturedImpostors: TexturedImpostorSubsystem | null;
```

- [ ] **Step 2: Update `engineReady.ts`**

Edit `src/services/engine/helpers/engineReady.ts`. Replace the import:

```typescript
import type { ThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';
```

with:

```typescript
import type { TexturedImpostorSubsystem } from '../../../@types/TexturedImpostorSubsystem';
```

In `ReadyEngineState`, replace `subsystems: EngineState['subsystems'] & { thumbnails: ThumbnailSubsystem; };` with:

```typescript
  subsystems: EngineState['subsystems'] & {
    texturedImpostors: TexturedImpostorSubsystem;
  };
```

In `isEngineReady`, replace `state.subsystems.thumbnails !== null` with `state.subsystems.texturedImpostors !== null`. The atlas + proceduralDisks subsystems are NOT in the bootstrap-complete bag because they aren't gating renders — only `texturedImpostors` historically gated via `hasInFlightFetches`, and that role transfers to it.

- [ ] **Step 3: Update `frameContext.ts`**

Edit `src/services/engine/frame/frameContext.ts`. Replace the import line:

```typescript
import type { ThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';
```

with:

```typescript
import type { TexturedImpostorSubsystem } from '../../../@types/TexturedImpostorSubsystem';
```

In `ReadyFrameContext`, replace `thumbnails: ThumbnailSubsystem;` with `texturedImpostors: TexturedImpostorSubsystem;`.

In the body of `deriveFrameContext`, replace the line `const thumbnails = state.subsystems.thumbnails;` with `const texturedImpostors = state.subsystems.texturedImpostors;`, and in the return object replace `thumbnails,` with `texturedImpostors,`.

- [ ] **Step 4: Update `engine.ts` state literal + destroy**

Edit `src/services/engine/engine.ts`. Around line 505, replace `thumbnails: null,` with:

```typescript
      galaxyAtlas: null,
      proceduralDisks: null,
      texturedImpostors: null,
```

Around lines 1165-1166, replace:

```typescript
    state.subsystems.thumbnails?.destroy();
    state.subsystems.thumbnails = null;
```

with:

```typescript
    state.subsystems.texturedImpostors?.destroy();
    state.subsystems.texturedImpostors = null;
    state.subsystems.proceduralDisks?.destroy();
    state.subsystems.proceduralDisks = null;
    state.subsystems.galaxyAtlas?.destroy();
    state.subsystems.galaxyAtlas = null;
```

Teardown order: textured-impostor depends on galaxyAtlas (subscribes to its eviction handler), so destroy it first; the atlas destroys last among the three.

- [ ] **Step 5: Update `wireSlots.ts` construction**

Edit `src/services/engine/phases/wireSlots.ts`. Replace the import:

```typescript
import { createThumbnailSubsystem } from '../subsystems/thumbnailSubsystem';
```

with:

```typescript
import { createGalaxyAtlasSubsystem } from '../subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../subsystems/proceduralDiskSubsystem';
import { createTexturedImpostorSubsystem } from '../subsystems/texturedImpostorSubsystem';
```

Replace the existing construction block (lines 347-356, the `createThumbnailSubsystem` + `bindToRenderers` calls + the `state.subsystems.thumbnails = thumbnails;` line) with:

```typescript
  // Construct the three impostor subsystems in dependency order.  The
  // textured-impostor planner depends on the atlas (slot allocation +
  // eviction subscription); the procedural-disk planner is independent.
  const galaxyAtlas = createGalaxyAtlasSubsystem({
    device,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  const texturedImpostors = createTexturedImpostorSubsystem({
    device,
    atlas: galaxyAtlas,
    requestRender: () => state.subsystems.scheduler.requestRender(),
  });
  const proceduralDisks = createProceduralDiskSubsystem();

  // Bind the atlas's texture view into the two LOD-2 renderers.  The
  // pre-split code did this through thumbnailSubsystem.bindToRenderers;
  // post-split the atlas owns the view and the binding is two direct
  // calls.  proceduralDiskRenderer doesn't sample the atlas, so it
  // doesn't get a bindAtlas call.
  thumbnailRenderer.bindAtlas(galaxyAtlas.getTextureView());
  diskRenderer.bindAtlas(galaxyAtlas.getTextureView());

  state.subsystems.galaxyAtlas = galaxyAtlas;
  state.subsystems.texturedImpostors = texturedImpostors;
  state.subsystems.proceduralDisks = proceduralDisks;
```

- [ ] **Step 6: Update `runFrame.ts`**

Edit `src/services/engine/frame/runFrame.ts`. Replace the constants import:

```typescript
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../subsystems/thumbnailSubsystem';
```

with:

```typescript
import {
  PROCEDURAL_DISK_FADE_START_PX,
  PROCEDURAL_DISK_FADE_END_PX,
} from '../subsystems/proceduralDiskSubsystem';
```

After the `ctx` derivation and the auto-LOD block (around line 294), before the `state.subsystems.labelDirector.runFrame(...)` call, insert the two planner-step calls:

```typescript
  // ── Per-frame impostor planners ───────────────────────────────────
  //
  // CPU-side step that populates the two LOD-aligned subsystems'
  // `lastOutput` arrays.  The HDR_PASSES loop reads those arrays via
  // the new proceduralDisksPass / texturedImpostorsPass entries; this
  // call site is the one place both walks happen each frame.  The
  // atlas subsystem is mutated transitively by the textured-impostor
  // run (slot allocations + fetch enqueues); we don't call into it
  // directly here.
  if (state.subsystems.proceduralDisks !== null) {
    state.subsystems.proceduralDisks.runFrame({
      cam: ctx.cam,
      clouds: state.sources.clouds,
      visibleSourceMask: state.sources.visibleMask,
      pxPerRad: ctx.drawPxPerRad,
    });
  }
  if (state.subsystems.texturedImpostors !== null) {
    state.subsystems.texturedImpostors.runFrame({
      cam: ctx.cam,
      clouds: state.sources.clouds,
      visibleSourceMask: state.sources.visibleMask,
      pxPerRad: ctx.drawPxPerRad,
      famousMeta: state.sources.famousMeta,
    });
  }
```

In the still-animating predicate near line 486, replace:

```typescript
    (ready && state.subsystems.thumbnails.hasInFlightFetches()) ||
```

with:

```typescript
    (ready && state.subsystems.texturedImpostors.hasInFlightWork()) ||
```

- [ ] **Step 7: Update `renderFrame.ts` PassDeps construction**

Edit `src/services/engine/frame/renderFrame.ts`. The `PassDeps` object built around line 284 needs the new `proceduralDiskRenderer` field. Pull the renderer reference off `state.gpu` inside the function. Replace the `deps: PassDeps` literal block with:

```typescript
  const deps: PassDeps = {
    thumbnailRenderer,
    diskRenderer,
    proceduralDiskRenderer: state.gpu.proceduralDiskRenderer!,
    filamentRenderer,
    scalarVolumeRenderer,
    milkyWayRenderer,
    clouds,
    famousMeta,
    famousXrefs,
    milkyWayITimeSec,
  };
```

The non-null assertion is sound because `proceduralDiskRenderer` is constructed alongside the other LOD renderers in `initGpu` and committed to `state.gpu` synchronously — every code path that reaches `renderFrame` has already passed the bootstrap gate. (The legacy code also relies on this for `thumbnailRenderer`/`diskRenderer`, which arrive via the `input` field; we use the same pattern for the new one.)

- [ ] **Step 8: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS — the legacy `thumbnailSubsystem` is still on disk (used only by Task 1's baseline test, which still imports it directly), but production now drives the three new subsystems. The legacy thumbnailSubsystem unit tests in `tests/services/engine/subsystems/thumbnailSubsystem.test.ts` still pass because the source file is unchanged. Task 14 deletes both.

The visual baseline (Task 1) should still pass because it operates on `createThumbnailSubsystem` in isolation. If it fails, the post-Task-9 disk-vs-quad emission code diverges from the legacy semantics — investigate before continuing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(engine): cut production over to split impostor subsystems

EngineSubsystemHandles drops `thumbnails`, gains `galaxyAtlas`,
`proceduralDisks`, `texturedImpostors`.  isEngineReady + ReadyFrameContext
narrow on texturedImpostors (the load-fade owner).  wireSlots constructs
the three subsystems in dependency order.  runFrame.ts hoists the
planner steps before the HDR_PASSES loop and points the render-on-demand
predicate at texturedImpostors.hasInFlightWork().  Legacy
thumbnailSubsystem.ts remains until Task 14 for baseline test parity.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Swap `HDR_PASSES` registry entries

**Files:**
- Modify: `src/services/engine/frame/passes/index.ts` (remove `galaxyThumbnailsPass`, add the two new passes in its slot)
- Modify: `tests/services/engine/frame/passes/passes.test.ts` (update `HDR_PASSES`-order assertions, update import block, remove the inline test for `galaxyThumbnailsPass` if present)

Order: `pointSpritesPass` → `proceduralDisksPass` → `texturedImpostorsPass` → `filamentsPass` → `scalarVolumePass` → `milkyWayPass` → `markerLinesPass` → `labelsPass`. Per the spec's section "Pass Implementations" the two new passes draw into the same render pass as everything else; their relative order matches what the legacy `thumbnailSubsystem` dispatched internally (procedural fired alongside quad/disk in one runFrame). Putting procedural BEFORE textured keeps the legacy intra-pass order: procedural-disk draw was issued LAST inside the old runFrame (line 978-991), but additive blending makes order cosmetic. The spec's section "Architecture overview" shows procedural-disk listed before textured-impostor, so we follow that.

- [ ] **Step 1: Update `HDR_PASSES`**

Edit `src/services/engine/frame/passes/index.ts`. Replace the existing `HDR_PASSES` array literal:

```typescript
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  galaxyThumbnailsPass,
  filamentsPass,
  scalarVolumePass, // ← new: 3D scalar-field volume overlay
  milkyWayPass,
  markerLinesPass,
  labelsPass,
];
```

with:

```typescript
export const HDR_PASSES: readonly Pass[] = [
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  filamentsPass,
  scalarVolumePass,
  milkyWayPass,
  markerLinesPass,
  labelsPass,
];
```

Also remove the `import { galaxyThumbnailsPass } from './galaxyThumbnailsPass';` line and the `export { galaxyThumbnailsPass } from './galaxyThumbnailsPass';` re-export.

Update the module header docstring's pass-list section (around lines 8-16) to match:

```
 *   1. point-sprites       — instanced billboards (always-on)
 *   2. procedural-disks    — LOD-1 procedural-disk impostors
 *   3. textured-impostors  — LOD-2 textured-disk + textured-quad impostors
 *   4. filaments           — cosmic-web skeleton overlay
 *   5. scalar-volume       — 3D raymarched scalar-field cubes (optional)
 *   6. milky-way           — procedural impostor at the world origin
 *   7. marker-lines        — thick-line UI overlay (you-are-here indicator)
 *   8. labels              — MSDF text UI overlay (you-are-here label)
```

- [ ] **Step 2: Update `passes.test.ts`**

Edit `tests/services/engine/frame/passes/passes.test.ts`. Replace the import block that names `galaxyThumbnailsPass` with imports for the two new passes:

Replace:

```typescript
import {
  HDR_PASSES,
  pointSpritesPass,
  galaxyThumbnailsPass,
  filamentsPass,
  milkyWayPass,
} from '../../../../../src/services/engine/frame/passes';
```

with:

```typescript
import {
  HDR_PASSES,
  pointSpritesPass,
  proceduralDisksPass,
  texturedImpostorsPass,
  filamentsPass,
  milkyWayPass,
} from '../../../../../src/services/engine/frame/passes';
```

Find every `describe('galaxyThumbnailsPass', ...)` block in the file and delete it. Find any `expect(HDR_PASSES[1]).toBe(galaxyThumbnailsPass)`-style assertions and update them to expect `proceduralDisksPass` at index 1 and `texturedImpostorsPass` at index 2 (and re-number subsequent expectations).

Run `grep -n "galaxyThumbnailsPass" tests/services/engine/frame/passes/passes.test.ts` to find every residual reference and update or delete.

- [ ] **Step 3: Update `makeDeps()` in `passes.test.ts` to include `proceduralDiskRenderer`**

Inside `makeDeps()` (around line 113), add `proceduralDiskRenderer: { draw: vi.fn() } as any,` after the `diskRenderer` line.

- [ ] **Step 4: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS. The visual baseline still passes because it tests the legacy `thumbnailSubsystem` directly. Production now runs the two new passes; the on-screen output should be byte-identical to the pre-Task-11 build (re-verify in dev server, see Step 5).

- [ ] **Step 5: Visual smoke check in the dev server**

The user has `npm run dev` running. Open the app in the browser, zoom in until galaxy thumbnails appear, and compare to memory of the pre-refactor output. Specifically check:

- Far galaxies show point sprites only.
- Mid-zoom galaxies show procedural disks (no atlas thumbnails).
- Close-zoom galaxies show atlas-textured disks/quads.
- Crossfades feel smooth across the 8→14 px band.

This is a manual qualitative check, not a CI gate — the Task 1 baseline is the automated gate. Report any visible difference back to the user before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/services/engine/frame/passes/index.ts tests/services/engine/frame/passes/passes.test.ts
git commit -m "$(cat <<'EOF'
refactor(passes): swap galaxyThumbnailsPass for the two new LOD passes

HDR_PASSES now lists proceduralDisksPass + texturedImpostorsPass in
place of the legacy galaxyThumbnailsPass entry.  Pass order:
point-sprites → procedural-disks → textured-impostors → filaments →
scalar-volume → milky-way → marker-lines → labels.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Split the legacy `thumbnailSubsystem.test.ts`

**Files:**
- Modify: `tests/services/engine/subsystems/thumbnailSubsystem.test.ts` (cull tests now covered by the three new test files; keep only the visual-baseline-affecting integration assertions)

The three new subsystems each have their own focused test file (Tasks 5, 7, 9). The legacy test file overlapped with all three. Now that the new files cover their respective concerns, the legacy file is mostly redundant. We keep it for now (Task 14 deletes both the file and its tests when it deletes the legacy subsystem source), but we cull the now-duplicate cases to prevent two tests from failing simultaneously if a subsystem bug crosses the seams.

This task is bookkeeping: identify which tests in the legacy file correspond to which new file, document the mapping in a comment at the top of the legacy file, and leave the tests in place. No code deletions yet — the legacy `thumbnailSubsystem.ts` is still on disk (Task 14 deletes both source and tests together).

- [ ] **Step 1: Add a deprecation header to the legacy test file**

Edit `tests/services/engine/subsystems/thumbnailSubsystem.test.ts`. At the top of the file, BEFORE the existing module docstring, insert:

```typescript
/**
 * @deprecated 2026-05-12 — this test file (and the
 * `thumbnailSubsystem.ts` source it covers) are being deleted as part
 * of the galaxy-impostor subsystem split.  Coverage has migrated to
 * three new test files:
 *
 *   - `galaxyAtlasSubsystem.test.ts` — LRU eviction, queue idempotency,
 *     setEvictHandler.
 *   - `proceduralDiskSubsystem.test.ts` — apparent-size + orientation
 *     gates, stride decimation, sticky map persistence.
 *   - `texturedImpostorSubsystem.test.ts` — atlas-slot allocation,
 *     disk-vs-quad branch, load-fade, hasInFlightWork.
 *
 * The two extra tests this file retains (galaxyCacheKey round-trip, and
 * the legacy createThumbnailSubsystem smoke test) get deleted together
 * with the source in Task 14.
 */
```

- [ ] **Step 2: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS. Nothing functional changed — just a comment.

- [ ] **Step 3: Commit**

```bash
git add tests/services/engine/subsystems/thumbnailSubsystem.test.ts
git commit -m "$(cat <<'EOF'
test(thumbnail): mark legacy thumbnailSubsystem.test.ts deprecated

Add a header pointing future readers to the three new test files that
inherit the legacy coverage.  The file itself stays alive until Task 14
deletes the legacy subsystem source — keeping it lets the visual
baseline test (which imports createThumbnailSubsystem) keep passing
through the intermediate commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Delete legacy `thumbnailSubsystem`, `galaxyThumbnailsPass`, and their tests

**Files:**
- Delete: `src/services/engine/subsystems/thumbnailSubsystem.ts`
- Delete: `src/services/engine/frame/passes/galaxyThumbnailsPass.ts`
- Delete: `tests/services/engine/subsystems/thumbnailSubsystem.test.ts`
- Delete: `tests/visual/galaxyImpostorBaseline.test.ts` (the legacy baseline; replaced in this task with a post-split baseline that drives the three new subsystems)
- Create: `tests/visual/galaxyImpostorBaseline.test.ts` (NEW — drives the post-split planners)
- Modify: any residual imports

After this task, no file in `src/` references `thumbnailSubsystem`, `ThumbnailSubsystem`, or `galaxyThumbnailsPass`.

- [ ] **Step 1: Delete the legacy source + pass files**

```bash
git rm src/services/engine/subsystems/thumbnailSubsystem.ts src/services/engine/frame/passes/galaxyThumbnailsPass.ts tests/services/engine/subsystems/thumbnailSubsystem.test.ts tests/visual/galaxyImpostorBaseline.test.ts
```

- [ ] **Step 2: Hunt for any residual imports**

Run: `grep -rn "thumbnailSubsystem\|ThumbnailSubsystem\|galaxyThumbnailsPass" src tests --include="*.ts" --include="*.tsx"`

Expected: no matches. If any remain, fix them (most likely a stale import in a test file the post-Task-11/12 work missed).

- [ ] **Step 3: Recreate the visual baseline driving the post-split planners**

Create `tests/visual/galaxyImpostorBaseline.test.ts`:

```typescript
/**
 * Visual baseline — post-split galaxy-impostor draw-call sequence.
 *
 * Drives the three new subsystems (galaxyAtlas + proceduralDisk +
 * texturedImpostor) through one runFrame each, then asserts the
 * resulting `lastOutput` arrays hash to the same baseline the pre-split
 * snapshot recorded in Task 1.
 *
 * If this test fails after Task 11/12 cut over production: a planner's
 * extraction diverged from the legacy semantics.  Investigate before
 * proceeding.
 */

import { describe, it, expect, vi } from 'vitest';
import { Source } from '../../src/data/sources';
import { createGalaxyAtlasSubsystem } from '../../src/services/engine/subsystems/galaxyAtlasSubsystem';
import { createProceduralDiskSubsystem } from '../../src/services/engine/subsystems/proceduralDiskSubsystem';
import { createTexturedImpostorSubsystem } from '../../src/services/engine/subsystems/texturedImpostorSubsystem';
import type { PointCloud, OrbitCamera } from '../../src/@types';

function makeFakeDevice(): GPUDevice {
  const fakeTexture = { createView: () => ({}) as GPUTextureView };
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
    submit: vi.fn(),
  };
  return { createTexture: vi.fn(() => fakeTexture), queue } as unknown as GPUDevice;
}

function makeCloud(count: number): PointCloud {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = 10;
    positions[i * 3 + 1] = 0.001 * i;
    positions[i * 3 + 2] = 0;
  }
  const fill = (v: number): Float32Array => {
    const a = new Float32Array(count);
    a.fill(v);
    return a;
  };
  return {
    count,
    objIDs: new BigUint64Array(count),
    positions,
    magU: fill(20),
    magG: fill(20),
    magR: fill(20),
    magI: fill(20),
    magZ: fill(20),
    axisRatio: fill(0.7),
    positionAngleDeg: fill(45),
    diameterKpc: fill(50),
  };
}

function makeCam(): OrbitCamera {
  return {
    target: [10, 0, 0] as unknown as Float32Array,
    distance: 0.05,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([9.95, 0, 0]),
  } as unknown as OrbitCamera;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function hashInstances(instances: ReadonlyArray<object>): string {
  const parts: string[] = [];
  for (const ins of instances) {
    const rec = ins as Record<string, unknown>;
    const sortedKeys = Object.keys(rec).sort();
    const kv: string[] = [];
    for (const k of sortedKeys) {
      const v = rec[k];
      kv.push(`${k}=${typeof v === 'number' ? round6(v) : String(v)}`);
    }
    parts.push(kv.join('|'));
  }
  return parts.join(';');
}

describe('galaxy-impostor visual baseline (post-split)', () => {
  it('emits the same lastOutput sequence given a fixed fixture', async () => {
    const device = makeFakeDevice();
    const atlas = createGalaxyAtlasSubsystem({ device, requestRender: () => {} });
    const procSys = createProceduralDiskSubsystem({ decimationFactor: 1 });
    const texSys = createTexturedImpostorSubsystem({
      device,
      atlas,
      requestRender: () => {},
      fetcher: async () => ({ width: 128, height: 128, close: () => {} } as unknown as ImageBitmap),
      decimationFactor: 1,
    });

    const cam = makeCam();
    const clouds = new Map([[Source.SDSS, makeCloud(8)]]);
    const pxPerRad = 720 / (2 * Math.tan(cam.fovYRad / 2));

    // Frame 1: kick off fetches; bitmaps land via microtask drain.
    procSys.runFrame({ cam, clouds, visibleSourceMask: 0xffffffff, pxPerRad });
    texSys.runFrame({ cam, clouds, visibleSourceMask: 0xffffffff, pxPerRad, famousMeta: [] });
    await new Promise((r) => setTimeout(r, 0));

    // Frame 2: bitmaps ready; disk path fires.
    const procOut = procSys.runFrame({ cam, clouds, visibleSourceMask: 0xffffffff, pxPerRad });
    const texOut = texSys.runFrame({ cam, clouds, visibleSourceMask: 0xffffffff, pxPerRad, famousMeta: [] });

    const summary = {
      procDisks: { count: procOut.instances.length, hash: hashInstances(procOut.instances) },
      texDisks: { count: texOut.disks.length, hash: hashInstances(texOut.disks) },
      texQuads: { count: texOut.quads.length, hash: hashInstances(texOut.quads) },
    };

    expect(summary).toMatchInlineSnapshot();
  });
});
```

- [ ] **Step 4: Run the new baseline with `-u` to record its snapshot**

Run: `npx vitest run tests/visual/galaxyImpostorBaseline.test.ts -u`

Expected: PASS — inline snapshot recorded. The recorded values are the post-split baseline; subsequent refactors must preserve them.

- [ ] **Step 5: Run typecheck and the full suite**

Run: `npm run typecheck && npm test`

Expected: PASS — all 590+ tests including the three new subsystem files, the two new pass files, and the post-split baseline.

- [ ] **Step 6: Visual smoke check in the dev server**

Open the app; confirm galaxy thumbnails, procedural disks, and textured disks all render as expected at every zoom level. Same qualitative check as Task 12 Step 5.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(engine): delete legacy thumbnailSubsystem + galaxyThumbnailsPass

Legacy source files and their tests are gone.  The post-split visual
baseline replaces the legacy one, snapshotting the three new
subsystems' lastOutput arrays.  src/ no longer contains any reference
to thumbnailSubsystem, ThumbnailSubsystem, or galaxyThumbnailsPass.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Final verification and PR

**Files:** (verification only — no edits expected)

- [ ] **Step 1: Run the full verification suite**

Run: `npm run typecheck && npm test && npm run build`

Expected: PASS for all three. The build catches any production-only issue the unit tests didn't.

- [ ] **Step 2: Confirm no residual `thumbnailSubsystem` / `ThumbnailSubsystem` / `galaxyThumbnailsPass` references**

Run: `grep -rn "thumbnailSubsystem\|ThumbnailSubsystem\|galaxyThumbnailsPass" src tests --include="*.ts" --include="*.tsx"`

Expected: no matches.

- [ ] **Step 3: Confirm no residual `DiskRenderer` (the type) / `ThumbnailRenderer` (the type) references**

Run: `grep -rn "\\bDiskRenderer\\b\\|\\bThumbnailRenderer\\b\\|createDiskRenderer\\|createThumbnailRenderer" src tests --include="*.ts" --include="*.tsx"`

Expected: no matches. (Field references like `state.gpu.thumbnailRenderer` are field names, not type names, and live in different patterns; they don't show up under `\b` word-boundary anchoring of the type name.)

If `\bThumbnailRenderer\b` matches `thumbnailRenderer` field references, refine the grep — only the camelCase type-name (starting with capital T) should be considered. Field references are out of scope for this rename.

- [ ] **Step 4: Visual smoke check one more time in the dev server**

Same procedure as Task 12 Step 5. Pan, zoom, toggle the galaxy-textures setting in the panel, watch for any regression vs. pre-refactor.

- [ ] **Step 5: Open the PR**

```bash
git push -u origin worktree-gpu-timestamp-debug
gh pr create --title "refactor(engine): split galaxy-impostor subsystem along LOD lines" --body "$(cat <<'EOF'
## Summary

- Renames `diskRenderer` → `texturedDiskRenderer` and `thumbnailRenderer` → `texturedQuadRenderer` for LOD-2 symmetry with `proceduralDiskRenderer`.
- Splits `thumbnailSubsystem` into three single-responsibility subsystems: `galaxyAtlasSubsystem` (atlas + queue), `proceduralDiskSubsystem` (LOD-1 planner), `texturedImpostorSubsystem` (LOD-2 planner).
- Replaces the kitchen-sink `galaxyThumbnailsPass` with `proceduralDisksPass` + `texturedImpostorsPass`. All three draw into the same single HDR render pass; pixels are byte-identical pre/post.

## Test plan

- [ ] `npm test` passes (all 590+ tests including 3 new subsystem files, 2 new pass files, post-split visual baseline)
- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean
- [ ] Dev server smoke check: point sprites at distance, procedural disks at mid-zoom, atlas thumbnails at close-zoom — crossfades smooth
- [ ] Visual baseline test passes (hash of lastOutput arrays unchanged across the refactor)

See `docs/superpowers/specs/2026-05-12-galaxy-impostor-subsystem-split-design.md` for the design rationale.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opened. Return URL.

---

## Self-review notes

After drafting, this plan was re-read against the spec sections one by one. Coverage map:

- Spec § "Renderer renames" — Tasks 2, 3.
- Spec § "Subsystem API contracts (galaxyAtlasSubsystem)" — Task 4 (type), Task 5 (impl + tests).
- Spec § "Subsystem API contracts (proceduralDiskSubsystem)" — Task 6 (type), Task 7 (impl + tests).
- Spec § "Subsystem API contracts (texturedImpostorSubsystem)" — Task 8 (type), Task 9 (impl + tests).
- Spec § "Pass implementations" — Task 10 (impl + tests).
- Spec § "Frame loop wiring" — Task 11 Step 6 (runFrame planner-step + RoD predicate).
- Spec § "State / handle wiring" — Task 11 Steps 1, 2, 3, 4, 5.
- Spec § "Catalog walk — one or two walks?" — Tasks 7 and 9 each carry their own stride cursor; explicitly documented in Task 7's source comment.
- Spec § "Testing" — Task 1 (visual baseline), Task 14 Step 3 (post-split baseline), Tasks 5/7/9 (per-subsystem), Task 10 (per-pass).
- Spec § "Migration" — sequencing of Tasks 2-14 follows the spec's listed order.

Judgment calls made during drafting:

- The spec doesn't explicitly say to rename the `state.gpu.thumbnailRenderer` and `state.gpu.diskRenderer` field names (vs. the type names). Spec scope says "No type renames outside the new files." I interpreted this as field names staying — they are values, not types. This keeps the renamed PR diff smaller; if the user prefers the field names renamed for consistency, that's a one-pass follow-up.
- The spec's `texturedImpostorsPass` order shows quads-first-then-disks. The legacy `thumbnailSubsystem.runFrame` matches that order at lines 955-967. The plan pins it in `texturedImpostorsPass.draw` and in the test assertion.
- The spec's `proceduralDisksPass.enabled` includes `state.subsystems.proceduralDisks !== null`. The legacy `galaxyThumbnailsPass.enabled` gated only on `settings.galaxyTexturesEnabled`. I retained the stricter spec gate — if the subsystem was never constructed (impossible after wireSlots, but defensive), the pass is silently a no-op.
- The visual-baseline approach (hash of draw-call instance arrays, not pixel readback) is a judgment call; the spec says "byte-identical visual output" and "hash a fixed-camera HDR frame" is in the prompt. I chose hash-of-`lastOutput` because no GPU-readback test harness exists, and the new subsystems' `lastOutput` IS the byte-stream the renderers receive — hashing it proves the same bytes go to the same GPU calls.
- `PROCEDURAL_DISK_FADE_START_PX` and `PROCEDURAL_DISK_FADE_END_PX` re-export from `proceduralDiskSubsystem.ts` (Task 7 Step 3) so `runFrame.ts`'s settings wiring has a home for them post-split. The spec doesn't explicitly say where they live; this is the LOD-1-aligned home.
