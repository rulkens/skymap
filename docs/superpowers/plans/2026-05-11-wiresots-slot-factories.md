# wireSlots slot-factory split (H4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract each sidecar-slot minting block from `wireSlots.ts` (614 lines, 6 slot kinds inline) into its own factory file under `src/services/loading/slots/`. `wireSlots.ts` becomes a thin composer over those factories plus the orchestration logic (all-arrivals gate, progress emitter, thumbnail subsystem, status fires) that doesn't belong on a per-slot basis.

**Architecture:** One factory function per slot kind. Each factory takes `(state, cb)` (and any other dependencies it needs), creates the `AssetSlot`, wires its `subscribe` for side effects, writes to `state.assetSlots.<name>`, and returns the slot reference. `wireSlots.ts` calls each factory in sequence, collects the slot references into `allSlots`, and continues with the orchestration steps.

**Tech Stack:** TypeScript, vitest. No runtime dependency changes.

**Pre-conditions:** Branch `refactor/wiresots-slot-factories` off `origin/main` (which has H5 + M1 + M7). Baseline: 1085 tests passing, typecheck green.

**Spec reference:** Audit finding H4 (2026-05-11) — `wireSlots.ts` is a god phase that mints 6 different slot kinds inline. Splits informed by M7's coverage (PR #94, merged).

---

## Why split now

`wireSlots.ts` today:
- 614 lines
- Mints 6 different slot kinds inline (filament, cf4Density, famousMeta, pgcAlias, 3 synthetic volumes)
- Owns the load-progress emitter wiring, thumbnail subsystem construction, all-arrivals gate, synthetic fallback path, firstReadySource ref population
- Each slot kind adds ~50-100 lines whenever someone wants a new asset type

The mint blocks share a clear shape: `createAssetSlot(...)` → `subscribe(...)` for side effects → `state.assetSlots.<name> = slot`. Extracting them gives each asset kind one obvious home — adding a new asset is one new file plus one new line in `wireSlots`.

## Factory contract

```ts
// in src/services/loading/slots/types.ts (new shared type file)
export type SlotFactory<TPayload, TRequest> = (
  state: EngineState,
  cb: EngineCallbacks,
) => AssetSlot<TPayload, TRequest>;
```

Per-slot factory shape:
1. Build the slot via `createAssetSlot({ name, fetch, commit })`.
2. Subscribe to the slot for side effects (log, callback echoes, render wakes). These are bound at construction time and live for the slot's lifetime.
3. Write the slot to `state.assetSlots.<name>` so engine code that reads from state finds it.
4. Return the slot so `wireSlots` can register it in `allSlots`.

The factory does NOT call `slot.load(...)` — that's wireSlots' job (it owns the kick-off ordering and the all-arrivals gate).

The factory does NOT write to `allSlots` — that's a wireSlots-local concern (the Map is per-call, not per-slot).

## File map

**Create:**
- `src/services/loading/slots/types.ts` — `SlotFactory<TPayload, TRequest>` type
- `src/services/loading/slots/filamentSlot.ts` — `createFilamentSlot`
- `src/services/loading/slots/cf4DensitySlot.ts` — `createCf4DensitySlot` (gate-aware)
- `src/services/loading/slots/famousMetaSlot.ts` — `createFamousMetaSlot`
- `src/services/loading/slots/pgcAliasSlot.ts` — `createPgcAliasSlot`
- `src/services/loading/slots/syntheticVolumeSlots.ts` — `createSyntheticVolumeSlots` (the 3 dev fixtures)

**Modify:**
- `src/services/engine/phases/wireSlots.ts` — strip mint blocks; call factories instead

**Test files (may need light updates):**
- `tests/services/engine/phases/wireSlots.test.ts` — M7's tests stay green if the factories preserve behaviour exactly. If a test asserts on internal mint-block details, update.

---

## Task 1: Define the `SlotFactory` shared type

**Files:**
- Create: `src/services/loading/slots/types.ts`

- [ ] **Step 1: Create the types file**

```ts
import type { AssetSlot } from '../types';
import type { EngineState, EngineCallbacks } from '../../../@types';

/**
 * SlotFactory — a function that mints one sidecar asset slot.
 *
 * Each factory:
 *   1. constructs the `AssetSlot` via `createAssetSlot`,
 *   2. wires `slot.subscribe` for any side effects (logs, callbacks,
 *      render-on-demand wakes),
 *   3. writes the slot to `state.assetSlots.<name>` so engine code that
 *      reads from state finds it,
 *   4. returns the slot so the caller can register it on a downstream
 *      aggregate (e.g. `allSlots` for the loading-progress emitter).
 *
 * The factory does NOT call `slot.load(...)` — load ordering belongs to
 * the wireSlots orchestrator, which kicks the survey loads, awaits the
 * all-arrivals gate, and (when appropriate) drives the synthetic fallback.
 *
 * Factory parameters are intentionally narrow.  Factories that need
 * additional dependencies (e.g. a renderer reference) take them via
 * extra parameters; the canonical (state, cb) prefix stays for
 * uniformity across the call sites in wireSlots.
 */
export type SlotFactory<TPayload, TRequest> = (
  state: EngineState,
  cb: EngineCallbacks,
) => AssetSlot<TPayload, TRequest>;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS — the new file is dangling but compiles.

- [ ] **Step 3: Commit**

```bash
git add src/services/loading/slots/types.ts
git commit -m "$(cat <<'EOF'
refactor(loading): add SlotFactory shared type for H4 split

Defines the contract every per-asset slot factory will satisfy.  Not
yet referenced — extraction lands in subsequent commits.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract the filament slot

**Files:**
- Create: `src/services/loading/slots/filamentSlot.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

- [ ] **Step 1: Read the existing block**

Find the filament-slot mint block in `wireSlots.ts` (search for `// ── Filament asset slot`, around line 131). Note:
- Imports used: `createAssetSlot`, `filamentFetcher`
- Slot contract: `{ name: 'filaments', fetch, commit }`
- Subscribe wires: log + `cb.filaments?.onReady` + render wake on ready
- State write: `state.assetSlots.filaments = filamentSlot`

- [ ] **Step 2: Create the factory file**

```ts
// src/services/loading/slots/filamentSlot.ts
import type { EngineCallbacks, EngineState } from '../../../@types';
import { createAssetSlot, type AssetSlot } from '../types';
import { filamentFetcher } from '../fetchers/filamentFetcher';
import type { FilamentCloud } from '../../../@types/FilamentCloud';
import type { SlotFactory } from './types';

/**
 * createFilamentSlot — the cosmic-web skeleton's asset slot.
 *
 * One-shot lifecycle: load() at boot, never on tier change (re-downloading
 * the ~30 MB skeleton every tier flip would tax bandwidth for a topology
 * that barely differs between tiers).  See filamentFetcher.ts for the
 * rationale.
 *
 * Pre-H4 this mint block lived inline in wireSlots.ts.  Extracted here as
 * part of the slot-factory split.
 */
export const createFilamentSlot: SlotFactory<FilamentCloud, { tier: import('../../../@types/Tier').Tier }> = (
  state,
  cb,
) => {
  const slot = createAssetSlot({
    name: 'filaments',
    fetch: filamentFetcher,
    commit: async (cloud) => {
      if (!state.gpu.filamentRenderer) return;
      await state.gpu.filamentRenderer.upload(cloud);
    },
  });
  slot.subscribe((s) => {
    // Loading-bar plumbing is owned by aggregateRegistry; this subscriber
    // only fires the app-visible side effects on the `ready` transition.
    if (s.kind === 'ready') {
      console.log(
        `[engine] filaments: ${s.value.stripCount} strips, ${s.value.vertexCount} verts`,
      );
      // One-shot UI signal — fires only when the optional binary actually
      // loaded.  See EngineCallbacks.filaments.onReady for the lifecycle.
      cb.filaments?.onReady?.(s.value.stripCount, s.value.vertexCount);
      state.subsystems.scheduler.requestRender();
    }
  });
  state.assetSlots.filaments = slot;
  return slot;
};
```

(Adjust the type imports to match what actually exists in the codebase. If `FilamentCloud` lives elsewhere or `createAssetSlot`'s return shape differs, follow the existing imports in wireSlots.ts.)

- [ ] **Step 3: Update `wireSlots.ts` to use the factory**

Replace the inline mint block (around lines 131-174) with:

```ts
import { createFilamentSlot } from '../../loading/slots/filamentSlot';

// ... inside wireSlots(state, deps):

const filamentSlot = createFilamentSlot(state, cb);
```

The rest of `wireSlots` that references `filamentSlot` (line ~471 `allSlots.set(filamentSlot.name, filamentSlot...)` and line ~577 `state.assetSlots.filaments?.load(...)`) keeps working because:
- The local `filamentSlot` variable is still in scope
- `state.assetSlots.filaments` is set inside the factory

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: 1085 tests pass. `wireSlots.test.ts` should still pass — the factory preserves behaviour exactly.

- [ ] **Step 6: Commit**

```bash
git add src/services/loading/slots/filamentSlot.ts src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
refactor(loading): extract filament slot factory

First slot extraction for H4.  Mint block + subscribe wiring + state
write are encapsulated in createFilamentSlot.  wireSlots calls the
factory once; allSlots registration and load kick-off remain in
wireSlots (those are per-call orchestration concerns, not per-slot).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract the CF-4 density slot

**Files:**
- Create: `src/services/loading/slots/cf4DensitySlot.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

The cf4Density mint is the most complex one — it has the volume-renderer commit logic that drove the original H3 audit finding (settings seed-and-forward pattern). Extraction also gives us a clean place to put the H3 dedup helper in a follow-up PR.

- [ ] **Step 1: Read the existing block**

Find `// ── CF-4 DM density volume slot` in `wireSlots.ts` (around line 201). Note: the block is wrapped in `if (volumesGateOpen) { ... }`. The factory should be callable without the gate; the gate stays in wireSlots.

- [ ] **Step 2: Create the factory file**

```ts
// src/services/loading/slots/cf4DensitySlot.ts
import type { EngineCallbacks, EngineState } from '../../../@types';
import { createAssetSlot, type AssetSlot } from '../types';
import { cf4DensityFetcher } from '../fetchers/cf4DensityFetcher';
import type { ScalarCube } from '../../../@types/ScalarCube';
import { getVolumeFieldDefaults } from '../../../data/volumeFieldDefaults';
import {
  DEFAULT_CF4_DENSITY_ENABLED,
  DEFAULT_VOLUME_FIELD_INTENSITY,
} from '../../../data/defaults';
import type { SlotFactory } from './types';

/**
 * createCf4DensitySlot — eager-at-boot fetch of public/data/cf4_density.scfd.
 *
 * On commit, hands the decoded ScalarCube to scalarVolumeRenderer.addField
 * under the handle 'cf4-density', then seeds per-field settings if not
 * already present (preserving any user-tuned intensity/palette across
 * sessions).
 *
 * Pre-H4 the gate (`volumesGateOpen`) lived inline and skipped the entire
 * mint block.  Now wireSlots evaluates the gate and only calls this
 * factory when open — keeping the factory itself unconditional.
 */
export const createCf4DensitySlot: SlotFactory<ScalarCube, void> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'cf4Density',
    fetch: cf4DensityFetcher,
    commit: async (cube) => {
      const renderer = state.gpu.scalarVolumeRenderer;
      if (!renderer) return;
      const handle = 'cf4-density';
      const defaults = getVolumeFieldDefaults(handle);
      renderer.addField(handle, cube);
      if (!state.settings.volumes.fields[handle]) {
        state.settings.volumes.fields[handle] = {
          enabled: DEFAULT_CF4_DENSITY_ENABLED,
          intensity: DEFAULT_VOLUME_FIELD_INTENSITY,
          contrast: defaults.contrast,
          densityScale: defaults.densityScale,
          paletteId: defaults.paletteId,
        };
      }
      const persisted = state.settings.volumes.fields[handle]!;
      renderer.setIntensity(handle, persisted.intensity);
      renderer.setEnabled(handle, persisted.enabled);
      renderer.setContrast(handle, persisted.contrast);
      renderer.setFieldPalette(handle, persisted.paletteId);
      renderer.setDensityScale(handle, persisted.densityScale);
      // Envelope is per-cube static (presentation property, not user-
      // tunable) so we apply it straight from the registry rather than
      // mirroring into `persisted`.
      renderer.setEnvelope(handle, defaults.envelope.inner, defaults.envelope.outer);
      cb.volumes?.onFieldsChanged?.();
      state.subsystems.scheduler.requestRender();
    },
  });
  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      console.log(
        `[engine] cf4Density: ${s.value.dims.join('x')} cube, ` +
          `min=${s.value.valueMin.toFixed(3)}, max=${s.value.valueMax.toFixed(3)}`,
      );
    }
  });
  state.assetSlots.cf4Density = slot;
  return slot;
};
```

(The full subscribe body extends past `if (s.kind === 'ready')` in the original — copy whatever's there verbatim.)

- [ ] **Step 3: Update wireSlots.ts**

Replace the inline `if (volumesGateOpen) { const cf4DensitySlot = createAssetSlot(...) ... }` block with:

```ts
import { createCf4DensitySlot } from '../../loading/slots/cf4DensitySlot';

// ... inside wireSlots:

if (volumesGateOpen) {
  createCf4DensitySlot(state, cb);
}
```

The `state.assetSlots.cf4Density` write is now inside the factory; the rest of wireSlots reads it through `state.assetSlots.cf4Density?.X` so no other changes needed.

- [ ] **Step 4: Typecheck + tests + commit**

Run: `npm run typecheck && npm test`
Expected: 1085 tests pass.

```bash
git add src/services/loading/slots/cf4DensitySlot.ts src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
refactor(loading): extract CF-4 density slot factory

Lifts the cf4Density mint + volume-field seed-and-forward block out of
wireSlots.  The gate (volumesGateOpen — DEV or ?volumes=1 URL param)
stays in wireSlots as a per-call orchestration concern.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract the famous-meta slot

**Files:**
- Create: `src/services/loading/slots/famousMetaSlot.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

- [ ] **Step 1: Read the existing block**

Find `// ── Famous-meta sidecar slot` in `wireSlots.ts` (around line 288).

- [ ] **Step 2: Create the factory**

Use the same pattern as filament slot. The factory creates the AssetSlot with the famous-meta fetcher and commit handlers, subscribes for side effects (probably none beyond loading-bar plumbing, which is handled by aggregateRegistry), and writes to `state.assetSlots.famousMeta`.

```ts
// src/services/loading/slots/famousMetaSlot.ts
import type { EngineCallbacks, EngineState } from '../../../@types';
import { createAssetSlot, type AssetSlot } from '../types';
import { famousMetaFetcher } from '../fetchers/famousMetaFetcher';
import type { SlotFactory } from './types';

export const createFamousMetaSlot: SlotFactory<...> = (state, cb) => {
  const slot = createAssetSlot({
    name: 'famous-meta',
    fetch: famousMetaFetcher,
    commit: async (data) => {
      // Same commit body as the inline version in wireSlots.ts.
      // Copy verbatim.
    },
  });
  // Subscribe (if present in original — copy verbatim)
  state.assetSlots.famousMeta = slot;
  return slot;
};
```

Fill in the types and commit body from the original block.

- [ ] **Step 3: Update wireSlots.ts to call the factory**

Replace the inline mint with:

```ts
const famousMetaSlot = createFamousMetaSlot(state, cb);
```

Keep the `famousMetaSlot.load();` line (around line 505) that fires the load — that's orchestration.

- [ ] **Step 4: Typecheck + tests + commit**

```bash
git add src/services/loading/slots/famousMetaSlot.ts src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
refactor(loading): extract famous-meta slot factory

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extract the PGC-alias slot

**Files:**
- Create: `src/services/loading/slots/pgcAliasSlot.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

Same pattern as Task 4. Find the inline block (around line 328 — search `// ── PGC-alias`). Copy fetcher + commit + subscribe verbatim into the factory file.

- [ ] **Step 1-4: Same shape as Task 4**

Commit message:
```
refactor(loading): extract PGC-alias slot factory

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

---

## Task 6: Extract the synthetic volume slots

**Files:**
- Create: `src/services/loading/slots/syntheticVolumeSlots.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`

The 3 synthetic slots (`debug-gaussian`, `debug-cartesian`, `debug-spherical`) all share a `mintSyntheticVolumeSlot(handle, isOnAtBoot)` helper inside the DEV-only `if (import.meta.env.DEV)` block (around lines 344-441). Extract the whole block as one factory that returns the 3-slot record.

- [ ] **Step 1: Create the factory file**

```ts
// src/services/loading/slots/syntheticVolumeSlots.ts
import type { EngineCallbacks, EngineState } from '../../../@types';
import { createAssetSlot, type AssetSlot } from '../types';
// ... other imports from the existing block

/**
 * createSyntheticVolumeSlots — mints the three DEV-only synthetic volume
 * fixtures (gaussian, cartesian, spherical).  Each one drives the same
 * scalarVolumeRenderer commit path as the real CF-4 density slot but
 * with procedurally-generated cube data.
 *
 * DEV-only: callers should gate on `import.meta.env.DEV` before invoking.
 * Returns the same shape `state.assetSlots.syntheticVolumes` expects.
 */
export function createSyntheticVolumeSlots(
  state: EngineState,
  cb: EngineCallbacks,
): {
  'debug-gaussian': AssetSlot<...>;
  'debug-cartesian': AssetSlot<...>;
  'debug-spherical': AssetSlot<...>;
} {
  const mintSyntheticVolumeSlot = (handle: string, onAtBoot: boolean) => {
    return createAssetSlot({
      name: handle,
      fetch: /* the synthetic fetcher — copy from original */,
      commit: /* same commit shape as cf4Density — copy verbatim */,
    });
    // Plus subscribe wiring if any.
  };

  const slots = {
    'debug-gaussian': mintSyntheticVolumeSlot('debug-gaussian', false),
    'debug-cartesian': mintSyntheticVolumeSlot('debug-cartesian', false),
    'debug-spherical': mintSyntheticVolumeSlot('debug-spherical', false),
  };
  state.assetSlots.syntheticVolumes = slots;
  return slots;
}
```

- [ ] **Step 2: Update wireSlots.ts**

Replace the DEV-guarded block (lines 344-441) with:

```ts
import { createSyntheticVolumeSlots } from '../../loading/slots/syntheticVolumeSlots';

// ... inside wireSlots:

if (import.meta.env.DEV) {
  createSyntheticVolumeSlots(state, cb);
}
```

The downstream `if (state.assetSlots.syntheticVolumes)` checks (around lines 484-488) continue to work — the factory writes the state field.

- [ ] **Step 3: Typecheck + tests + commit**

```bash
git add src/services/loading/slots/syntheticVolumeSlots.ts src/services/engine/phases/wireSlots.ts
git commit -m "$(cat <<'EOF'
refactor(loading): extract synthetic-volume slot factory (3 dev fixtures)

The DEV-only mintSyntheticVolumeSlot helper + 3 instantiations move
into a single factory module.  wireSlots gates on import.meta.env.DEV
and calls the factory; the factory returns the same shape
state.assetSlots.syntheticVolumes expects.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verify wireSlots is substantially smaller

After Tasks 2-6, run:

```bash
wc -l src/services/engine/phases/wireSlots.ts
```

Expected: <300 lines (was 614). The remaining content is the all-arrivals gate, synthetic fallback, progress emitter wiring, thumbnail subsystem construction, and the load-kick orchestration. Anything still over 350 lines means a mint block wasn't fully extracted — go back and check.

- [ ] **Step 1: Confirm the line-count reduction**

Run `wc -l src/services/engine/phases/wireSlots.ts`. Note the number for the PR description.

- [ ] **Step 2: Final typecheck + tests + build**

```bash
npm run typecheck
npm test
npm run build 2>&1 | tail -10
```

Expected: all clean.

- [ ] **Step 3: Visual smoke check**

Dev server full sweep. Confirm:
- All slots still load (filaments overlay appears when enabled; famous-meta hover text works; cf4Density renders when `?volumes=1`)
- Loading bar still updates
- Initial camera framing fires
- No console errors during bootstrap

- [ ] **Step 4: Push and open draft PR**

```bash
git push -u origin refactor/wiresots-slot-factories
gh pr create --draft --title "refactor(loading): H4 — split wireSlots into per-slot factories" --body "$(cat <<'EOF'
## Summary

Closes **H4** from the 2026-05-11 architectural audit.

`wireSlots.ts` shrinks from 614 → <300 lines.  Five new factory files under `src/services/loading/slots/` each own one slot kind's mint + subscribe + state-write logic.  wireSlots is now a thin composer: gate checks + factory calls + orchestration (all-arrivals gate, synthetic fallback, progress emitter, thumbnail subsystem, status fires).

## New files

- `src/services/loading/slots/types.ts` — `SlotFactory` contract
- `src/services/loading/slots/filamentSlot.ts`
- `src/services/loading/slots/cf4DensitySlot.ts`
- `src/services/loading/slots/famousMetaSlot.ts`
- `src/services/loading/slots/pgcAliasSlot.ts`
- `src/services/loading/slots/syntheticVolumeSlots.ts`

## Why this is low-risk

- M7 (PR #94) added bootstrap-phase tests as a safety net — they exercise the all-arrivals gate, the synthetic fallback path, and the slot registry shape. The extraction preserves behaviour at every step, so M7's tests guard the refactor.
- Each commit is one slot kind extracted at a time. Bisectable.
- The factories preserve fetch/commit/subscribe behaviour verbatim from the inline blocks.

## Test plan

- [x] `npm run typecheck` clean
- [x] `npm test` passes (1085)
- [x] `npm run build` clean
- [ ] Visual smoke (filaments toggle, famous-meta hover, `?volumes=1`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL in the report.

---

## Out of scope (deferred to H3 follow-up)

- The seed-and-forward dedup in `createCf4DensitySlot.commit` and (post-extraction) `createSyntheticVolumeSlots.commit` is still duplicated. H3 will extract `applyVolumeFieldDefaults()` and route both through it.
- The all-arrivals gate is still inline in `wireSlots.ts`. M7's implementer suggested extracting it as `awaitAllArrivals(slots, gate)`. Worth doing but separate scope.
- The `thumbnailSubsystem` construction in `wireSlots` (~line 511) stays put — extracting it is M5, not H4.

---

## Self-review

- **Spec coverage:** each slot kind has its own task. Synthetic-volume covers all 3 fixtures in one task because they share a helper. The remaining orchestration logic stays in wireSlots intentionally.
- **Placeholders:** the factory bodies for `famousMetaSlot`, `pgcAliasSlot`, and the synthetic-volume commit reference "copy from original" — these are areas where I haven't transcribed the full source. The implementer should read the corresponding wireSlots blocks and copy verbatim. **Not a plan failure — verbatim copying is the explicit instruction.**
- **Type consistency:** every factory satisfies `SlotFactory<TPayload, TRequest>` from `types.ts`. `state.assetSlots.<name>` writes use the existing keys (no renames). The factory names are uniform (`create<Foo>Slot`).
