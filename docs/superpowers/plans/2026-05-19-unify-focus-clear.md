# Unify Focus & Clear (Galaxy + POI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse four pairs of mirrored galaxy/POI codepaths — engine focus methods, engine clear methods, InfoCard props, and URL-sync hooks — into single dispatching primitives that accept `GalaxyInfo | PointOfInterest`. End state: `handle.camera.focusOn(target)` and `handle.selection.clear()` handle both kinds; `InfoCard` has unified `hovered`/`selected`/`onFocus`/`onClose`; one `useUrlSync` hook owns the whole `location.hash`.

**Architecture:** A small runtime predicate (`isPoi`) discriminates the union. Engine internals keep their two implementation paths (`commitFocus` vs `commitPoiFocus`, galaxy-clear vs POI-clear) — the unification is at the public handle surface only, dispatched by the predicate. The merged URL hook eliminates the cross-hook segment-prefix coordination (`hashIsFocusOrEmpty` / `hashIsPoiOrEmpty`) because one owner can't race itself. Aliases (`focusOnPoi`, `clearPoiFocus`) survive intermediate commits so every checkpoint typechecks; Task 7 removes them.

**Tech Stack:** TypeScript, Vitest (node env, no DOM), React 18, Vite. No new runtime deps.

**Branch + PR strategy:** Already in worktree branch `worktree-unify-focus-clear`; each task ends in its own commit. Open one PR against `main` after Task 8.

## Decisions worth sanity-checking

1. **Union name = `FocusableTarget`** (in `src/@types/engine/FocusableTarget.d.ts`). Deliberately distinct from existing `FocusTarget` in `@types/camera/FocusTarget.d.ts`, which describes a URL-parsed deep-link target (different shape, different role).
2. **Predicate location** — `src/services/engine/isPoi.ts` (runtime `.ts`, not `.d.ts`, carries a function body). Single line: `'category' in target`. Confirmed safe: `GalaxyInfo` has no top-level `category` field; its galaxy-morphology category is nested at `galaxyType.category`.
3. **`computeDesiredHash` generalises rather than splits.** One helper takes both `focused` and `focusedPoiId`; the engine-side mutex means at most one is set, but the helper handles "both set" deterministically (galaxy wins — matches engine click-handler precedence). No separate `computeDesiredPoiHash`.
4. **`selection.clear()` containment**: galaxy-clear and POI-clear both fire; if one throws the other still runs. Documented as "close-the-card means close everything" semantic.
5. **Legacy `tests/hooks/useFocusUrlSync.test.ts` is deleted, not migrated** — coverage is strictly subsumed by the new `tests/hooks/useUrlSync.test.ts`.
6. **Aliases kept across Tasks 2–6, removed in Task 7** so every intermediate commit typechecks even while `wireInput.ts` still calls the old method names.

---

### Task 1: `FocusableTarget` union + `isPoi` predicate

**Files:**
- Create: `src/@types/engine/FocusableTarget.d.ts`
- Create: `src/services/engine/isPoi.ts`
- Create: `tests/services/engine/isPoi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/isPoi.test.ts`:

```ts
/**
 * isPoi — type predicate distinguishing PointOfInterest from GalaxyInfo
 * inside a FocusableTarget union.
 *
 * The discriminant is the top-level `category` field, which PointOfInterest
 * carries but GalaxyInfo doesn't.  GalaxyInfo *does* have a nested
 * `galaxyType.category`, but the predicate checks the top-level key only —
 * structural type-checking would otherwise widen GalaxyInfo into the POI
 * branch and break the dispatcher.
 */
import { describe, it, expect } from 'vitest';
import { isPoi } from '../../../src/services/engine/isPoi';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

describe('isPoi', () => {
  it('returns true for a PointOfInterest', () => {
    const poi: PointOfInterest = {
      id: 'virgo-cluster',
      name: 'Virgo Cluster',
      category: 'cluster',
      worldPos: [0, 0, 0],
    };
    expect(isPoi(poi)).toBe(true);
  });

  it('returns false for a GalaxyInfo-shaped object (no top-level category)', () => {
    const fakeGalaxy = { index: 0, x: 1, y: 2, z: 3, galaxyType: { category: 'spiral' } } as unknown as GalaxyInfo;
    expect(isPoi(fakeGalaxy)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- isPoi`
Expected: FAIL with "Cannot find module './isPoi'".

- [ ] **Step 3: Create the FocusableTarget type**

Create `src/@types/engine/FocusableTarget.d.ts`:

```ts
import type { GalaxyInfo } from './GalaxyInfo';
import type { PointOfInterest } from './subsystems/PointOfInterest';

/**
 * FocusableTarget — discriminated union of the two things the camera can
 * focus on: a single galaxy point or a point-of-interest anchor (cluster,
 * supercluster, void, famous-galaxy POI).
 *
 * Used by the public `camera.focusOn(target)` handle (which dispatches via
 * the `isPoi` predicate in `services/engine/isPoi.ts`) and by InfoCard's
 * unified `hovered` / `selected` props.  Deliberately distinct from
 * `FocusTarget` in `@types/camera/FocusTarget.d.ts`, which is the
 * URL-parsed deep-link descriptor (`{ kind: 'pgc' | 'objid' | 'famous', ...}`)
 * — that one is a *request* to find a target; this one is the *resolved*
 * target itself.
 */
export type FocusableTarget = GalaxyInfo | PointOfInterest;
```

- [ ] **Step 4: Create the predicate**

Create `src/services/engine/isPoi.ts`:

```ts
import type { GalaxyInfo } from '../../@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../@types/engine/subsystems/PointOfInterest';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';

/**
 * isPoi — runtime type predicate for FocusableTarget.
 *
 * Uses `'category' in target` as the discriminant because PointOfInterest
 * declares a top-level `category: PoiCategory` field, while GalaxyInfo
 * carries category information only at the nested `galaxyType.category`
 * path.  `'in'` checks the top-level key only, so a GalaxyInfo never
 * widens into the POI branch by accident.
 *
 * Centralising the discriminant here means every public-handle dispatch
 * and every InfoCard render-branch agree on the same predicate.
 * Changing the discriminant later (e.g. adding an explicit `kind` field)
 * is then a single-file change.
 */
export function isPoi(target: FocusableTarget): target is PointOfInterest {
  return 'category' in target;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- isPoi`
Expected: PASS, 2 cases.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/@types/engine/FocusableTarget.d.ts src/services/engine/isPoi.ts tests/services/engine/isPoi.test.ts
git commit -m "feat(engine): add FocusableTarget union + isPoi predicate"
```

---

### Task 2: Widen `camera.focusOn` to accept the union

**Files:**
- Modify: `src/@types/engine/handles/EngineCameraHandle.d.ts`
- Modify: `src/services/engine/engine.ts` (~lines 906–928, plus public handle export ~1418)
- Modify: `tests/services/engine/engine.test.ts` (or whichever existing engine test covers focusOn — search and find)
- Create: `tests/services/engine/focusOnDispatch.test.ts`

Goal: `camera.focusOn(target: FocusableTarget)` dispatches galaxy targets through the existing `commitFocus` path and POI targets through `commitPoiFocus`. Keep `focusOnPoi` as a temporary alias so Task 5/6/7 can still compile while migrating call sites.

- [ ] **Step 1: Write the failing dispatch test**

Create `tests/services/engine/focusOnDispatch.test.ts`:

```ts
/**
 * focusOn dispatch — verifies that the unified public-handle method routes
 * GalaxyInfo through commitFocus and PointOfInterest through commitPoiFocus
 * via the isPoi predicate.
 *
 * Engine bootstrap is heavy, so this test mocks the two commit helpers and
 * drives the handle's `focusOn` directly.  We exercise the dispatching
 * surface, not the tween logic (tween logic is already covered in
 * tests/services/engine/camera/).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// NOTE: bootstrap a minimal engine in the same shape existing engine
// tests do — copy the helper from the nearest engine.test.ts.
// Replace the two imports below with the project's existing mock factory.
import { createTestEngine } from '../../helpers/createTestEngine';
import type { GalaxyInfo } from '../../../src/@types/engine/GalaxyInfo';
import type { PointOfInterest } from '../../../src/@types/engine/subsystems/PointOfInterest';

describe('camera.focusOn dispatch', () => {
  let engine: ReturnType<typeof createTestEngine>;
  beforeEach(() => { engine = createTestEngine(); });

  it('routes GalaxyInfo through the galaxy focus path', () => {
    const galaxy = engine.fixtures.galaxyInfo();
    const spy = vi.spyOn(engine.internals, 'commitFocus');
    engine.handle.camera.focusOn(galaxy);
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), galaxy);
  });

  it('routes PointOfInterest through the POI focus path', () => {
    const poi: PointOfInterest = engine.fixtures.poi();
    const spy = vi.spyOn(engine.internals, 'commitPoiFocus');
    engine.handle.camera.focusOn(poi);
    expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), poi, { tween: true });
  });
});
```

If a `createTestEngine` helper doesn't exist, find the nearest existing engine test (search `tests/services/engine/` for an existing test that constructs an engine) and copy its bootstrap pattern inline. If existing tests bootstrap via a different mechanism, write the dispatch test using vi.spyOn against the commit helpers exported from engine.ts (export them temporarily if necessary).

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- focusOnDispatch`
Expected: FAIL — either the helper isn't exported or `focusOn(poi)` throws because the current signature is `(info: GalaxyInfo)`.

- [ ] **Step 3: Update the type**

Modify `src/@types/engine/handles/EngineCameraHandle.d.ts`. Replace:

```ts
  /** Smoothly tween the camera so the given galaxy becomes the new orbit target. */
  focusOn: (info: GalaxyInfo) => void;
```

With:

```ts
  /**
   * Smoothly tween the camera so the given target becomes the new orbit
   * focus.  Dispatches by type:
   *   - GalaxyInfo → the galaxy focus path (commitFocus + onFocusChange).
   *   - PointOfInterest → the POI focus path (commitPoiFocus, framing
   *     distance derived from the POI category + onPoiFocusChange).
   *
   * Discrimination uses the `isPoi` predicate from `services/engine/isPoi.ts`.
   * Pre-bootstrap behaviour mirrors the per-kind paths: galaxy focus is
   * a no-op when `state.cam` is null; POI focus still fires the
   * subsystem flag + React-side callback even with no camera (deep-link
   * drains that race bootstrap rely on that).
   */
  focusOn: (target: FocusableTarget) => void;
```

Add `FocusableTarget` to the import block at the top of the file:

```ts
import type { FocusableTarget } from '../FocusableTarget';
```

Leave the existing `focusOnPoi` declaration in place for now — Task 7 deletes it.

- [ ] **Step 4: Rename internal galaxy focus + add the dispatcher**

In `src/services/engine/engine.ts`, lines ~906–928:

Rename the existing `focusOn(info: GalaxyInfo)` to `focusOnGalaxy(info: GalaxyInfo)` (internal-only). Keep its body unchanged.

Immediately above (or below) `focusOnGalaxy` / `focusOnPoi`, add the new dispatcher:

```ts
function focusOn(target: FocusableTarget): void {
  // Dispatch by type — the public handle exposes a single method but the
  // two internal commit paths stay separate (different tween shapes,
  // different cam-null gating, different callback surface).  See
  // `isPoi.ts` for the discriminant rationale.
  if (isPoi(target)) {
    focusOnPoi(target);
  } else {
    focusOnGalaxy(target);
  }
}
```

Add imports near the top of `engine.ts`:

```ts
import { isPoi } from './isPoi';
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
```

The public handle export at line ~1418 already wires `focusOn` — no change needed there; the new dispatcher takes over the export slot.

- [ ] **Step 5: Run dispatch test — verify pass**

Run: `npm test -- focusOnDispatch`
Expected: PASS, 2 cases.

- [ ] **Step 6: Run the full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all 590+ tests pass; typecheck clean.

If any existing test that mocks the handle's `focusOn` breaks because it expected the galaxy signature, update it to pass the unified shape — the union is wider, so a GalaxyInfo still passes.

- [ ] **Step 7: Commit**

```bash
git add src/@types/engine/handles/EngineCameraHandle.d.ts src/services/engine/engine.ts tests/services/engine/focusOnDispatch.test.ts
git commit -m "feat(engine): widen camera.focusOn to accept GalaxyInfo | PointOfInterest"
```

---

### Task 3: Widen `selection.clear` to tear down both

**Files:**
- Modify: `src/@types/engine/handles/EngineSelectionHandle.d.ts`
- Modify: `src/services/engine/engine.ts` (clear definition + handle export)
- Create: `tests/services/engine/clearDispatch.test.ts`

Goal: `selection.clear()` clears the galaxy selection AND the POI selection in one call. `clearPoiFocus` survives as a temporary alias on the camera handle until Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/services/engine/clearDispatch.test.ts`:

```ts
/**
 * selection.clear unified teardown — verifies the public-handle method
 * tears down galaxy selection AND POI focus in a single call, and that
 * the order is "galaxy first, POI second" so an InfoCard observer who
 * subscribes to both signals sees them collapse together rather than
 * one-then-the-other across two frames.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestEngine } from '../../helpers/createTestEngine';

describe('selection.clear unified', () => {
  let engine: ReturnType<typeof createTestEngine>;
  beforeEach(() => { engine = createTestEngine(); });

  it('clears both galaxy and POI in one call', () => {
    engine.handle.selection.selectFamous('m31');
    engine.handle.camera.focusOn(engine.fixtures.poi());
    expect(engine.state.selectedGalaxy).not.toBeNull();
    expect(engine.state.subsystems.pois.getSelectedPoi()).not.toBeNull();

    engine.handle.selection.clear();

    expect(engine.state.selectedGalaxy).toBeNull();
    expect(engine.state.subsystems.pois.getSelectedPoi()).toBeNull();
  });

  it('still tears down POI when only POI is set', () => {
    engine.handle.camera.focusOn(engine.fixtures.poi());
    engine.handle.selection.clear();
    expect(engine.state.subsystems.pois.getSelectedPoi()).toBeNull();
  });

  it('still tears down galaxy when only galaxy is set', () => {
    engine.handle.selection.selectFamous('m31');
    engine.handle.selection.clear();
    expect(engine.state.selectedGalaxy).toBeNull();
  });
});
```

Adjust property-name accessors (`selectedGalaxy`, `getSelectedPoi()`) to match the engine's actual state shape — read `src/services/engine/engine.ts` around the existing `selection.clear` definition and the POI subsystem accessors to ground the test in real names.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- clearDispatch`
Expected: FAIL — `clear()` only clears galaxy today; the POI assertion fails.

- [ ] **Step 3: Locate the existing `clear` definition and broaden it**

In `engine.ts`, find the function passed as `selection.clear` in the public handle export (~line 1418 area). Today it clears galaxy selection only. Replace its body to call the existing internal `clearPoiFocus` (~line 930) AND the existing galaxy-clear logic.

Pseudo-shape (real names depend on the current implementation — read engine.ts around the existing clear to confirm):

```ts
function clearSelection(): void {
  // 1. Tear down galaxy selection — same body as before this refactor.
  //    Order: galaxy first, POI second.  An observer subscribed to both
  //    sees one render with the new (cleared, cleared) state rather
  //    than (null, still-set) followed by (null, null) one frame later.
  state.subsystems.selection.setSelected(null);
  cb.selection?.onSelectChange?.(null);

  // 2. Tear down POI selection via the internal helper.  Reusing the
  //    helper keeps the "subsystem first, callback second, request
  //    render" ordering identical to the original `clearPoiFocus` so
  //    the marker-alpha + URL-hash invariants don't drift.
  clearPoiFocus();
}
```

Wire `clearSelection` into the public handle's `selection.clear` slot. Keep the existing `clearPoiFocus` function in place — it stays addressable both as the internal helper and (temporarily) as `camera.clearPoiFocus` on the public handle until Task 7.

- [ ] **Step 4: Update the type doc**

Modify `src/@types/engine/handles/EngineSelectionHandle.d.ts`:

```ts
  /**
   * Programmatically clear the current selection — galaxy AND POI in one
   * call.  "Close the card" semantic: anywhere a user dismisses the
   * InfoCard (Esc, the × button, URL drift back to empty hash), both
   * sides collapse together.
   *
   * Order is deterministic: galaxy selection clears first (onSelectChange
   * fires), then POI selection (onPoiFocusChange fires).  Idempotent:
   * calling with neither selected is a no-op.
   *
   * For code paths that need to clear ONLY the POI without disturbing a
   * pinned galaxy, drop down to the engine internals — there's no public
   * narrow-clear method (we couldn't find a real consumer for one when
   * this was unified on 2026-05-19; revisit if a use case appears).
   */
  clear: () => void;
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/@types/engine/handles/EngineSelectionHandle.d.ts src/services/engine/engine.ts tests/services/engine/clearDispatch.test.ts
git commit -m "feat(engine): widen selection.clear to tear down POI focus too"
```

---

### Task 4: Unified `useUrlSync` hook

**Files:**
- Create: `src/hooks/useUrlSync.ts`
- Create: `src/@types/engine/UseUrlSyncInput.d.ts`
- Create: `src/@types/engine/UrlSyncReturn.d.ts`
- Create: `tests/hooks/useUrlSync.test.ts`

Goal: A single hook that owns `location.hash` end-to-end, handling both `#focus=…` and `#poi=…` segments via one popstate listener, one write effect, and one drain effect. The old hooks stay untouched in this task — App.tsx still uses them. Task 6 swaps the call site and deletes the legacy files.

The new hook keeps the existing pure helpers (`computeDesiredHash`, `initialPendingTarget` from `useFocusUrlSync.ts`) but generalises `computeDesiredHash` to handle both segments.

- [ ] **Step 1: Write the pure-helper test for the generalised computeDesiredHash**

Create `tests/hooks/useUrlSync.test.ts`:

```ts
/**
 * useUrlSync — pure-helper coverage.
 *
 * The hook itself is DOM glue (effects over `location.hash` and
 * `history.pushState`) and runs in vitest's node env without a DOM, so we
 * test the pure decision functions only.  The interesting branches:
 *
 *   1. computeDesiredHash with neither set → empty body.
 *   2. computeDesiredHash with only focused → `focus=<id>` body.
 *   3. computeDesiredHash with only focusedPoiId → `poi=<id>` body.
 *   4. computeDesiredHash with BOTH set → galaxy wins (mutex precedence).
 *   5. computeDesiredHash short-circuits on matching currentHash.
 *   6. initialPendingX disambiguates `#focus=` vs `#poi=` vs empty.
 */
import { describe, it, expect } from 'vitest';
import {
  computeDesiredHash,
  initialPendingFromHash,
} from '../../src/hooks/useUrlSync';
import type { GalaxyInfo } from '../../src/@types/engine/GalaxyInfo';

const fakeFocused = (objID: bigint = 1n): GalaxyInfo => ({
  // Minimal shape — selectionToFocusId only reads `source` + identity field.
  // Use the same fixture pattern the existing useFocusUrlSync.test.ts uses;
  // copy it across if it has a builder.
} as unknown as GalaxyInfo);

describe('computeDesiredHash (unified)', () => {
  it('returns empty body when neither selection is set', () => {
    const out = computeDesiredHash({ focused: null, focusedPoiId: null, currentHash: '' });
    expect(out.desiredHashBody).toBe('');
    expect(out.matches).toBe(true);
  });

  it('returns focus=<id> when only a galaxy is focused', () => {
    const out = computeDesiredHash({ focused: fakeFocused(), focusedPoiId: null, currentHash: '' });
    expect(out.desiredHashBody).toMatch(/^focus=/);
    expect(out.matches).toBe(false);
  });

  it('returns poi=<id> when only a POI is focused', () => {
    const out = computeDesiredHash({ focused: null, focusedPoiId: 'virgo-cluster', currentHash: '' });
    expect(out.desiredHashBody).toBe('poi=virgo-cluster');
    expect(out.matches).toBe(false);
  });

  it('prefers galaxy when both are set (engine mutex precedence)', () => {
    const out = computeDesiredHash({ focused: fakeFocused(), focusedPoiId: 'virgo-cluster', currentHash: '' });
    expect(out.desiredHashBody).toMatch(/^focus=/);
  });

  it('short-circuits when currentHash already matches', () => {
    const out = computeDesiredHash({ focused: null, focusedPoiId: 'virgo-cluster', currentHash: '#poi=virgo-cluster' });
    expect(out.matches).toBe(true);
  });
});

describe('initialPendingFromHash', () => {
  it('parses #focus=… into a galaxy pending target', () => {
    const out = initialPendingFromHash('#focus=pgc:1234');
    expect(out.kind).toBe('galaxy');
    expect(out.target).not.toBeNull();
  });

  it('parses #poi=… into a poi pending id', () => {
    const out = initialPendingFromHash('#poi=virgo-cluster');
    expect(out.kind).toBe('poi');
    expect(out.poiId).toBe('virgo-cluster');
  });

  it('returns kind=null for an empty hash', () => {
    const out = initialPendingFromHash('');
    expect(out.kind).toBeNull();
  });
});
```

Refer to `tests/hooks/useFocusUrlSync.test.ts` for the existing test fixtures (object shape for `fakeFocused`) and copy them rather than re-inventing.

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- useUrlSync`
Expected: FAIL — `useUrlSync` module doesn't exist.

- [ ] **Step 3: Create the input/return types**

Create `src/@types/engine/UseUrlSyncInput.d.ts`:

```ts
import type { RefObject } from 'react';
import type { GalaxyInfo } from './GalaxyInfo';
import type { EngineHandle } from './handles/EngineHandle';
import type { EngineStatus } from './EngineStatus';
import type { FamousMetaEntry } from '../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../loading/FamousXrefMap';
import type { PgcAliasMap } from '../loading/PgcAliasMap';
import type { PointOfInterest } from './subsystems/PointOfInterest';

/**
 * Combined input for `useUrlSync` — both galaxy-side and POI-side state
 * the hook needs to keep `location.hash` in lock-step with engine
 * selection.  Mirror of the two legacy inputs (`UseFocusUrlInput` +
 * `UsePoiUrlSyncInput`) merged into one bag.
 */
export type UseUrlSyncInput = {
  // Galaxy side
  focused: GalaxyInfo | null;
  status: EngineStatus;
  sourceCounts: Readonly<Record<string, number>>;
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
  aliasMap: PgcAliasMap | null;
  // POI side
  focusedPoiId: string | null;
  ready: boolean;
  pois: readonly PointOfInterest[];
  // Shared
  engineHandleRef: RefObject<EngineHandle | null>;
};
```

Adjust the imports / property types to match the existing `UseFocusUrlInput` + `UsePoiUrlSyncInput` files — copy field-by-field rather than re-inferring.

Create `src/@types/engine/UrlSyncReturn.d.ts`:

```ts
import type { FocusTarget } from '../camera/FocusTarget';

export type UrlSyncReturn = {
  pendingTarget: FocusTarget | null;
  pendingPoiId: string | null;
};
```

- [ ] **Step 4: Implement the hook**

Create `src/hooks/useUrlSync.ts` modelled on the existing two hooks. Key shape:

```ts
/**
 * useUrlSync — single owner of `window.location.hash`, handles both
 * `#focus=<galaxyId>` (galaxy commit) and `#poi=<poiId>` (POI commit)
 * segments in one place.
 *
 * Replaces the legacy `useFocusUrlSync` + `usePoiUrlSync` pair.  Why
 * merging is now clean: both legacy hooks coordinated by guarding their
 * writes with a "is the hash someone else's segment?" check
 * (`hashIsFocusOrEmpty` / `hashIsPoiOrEmpty`).  One owner can't race
 * itself, so those guards collapse — the write effect just computes
 * the canonical body from whichever state slot is set.
 *
 * Five effects (mirror of the legacy structure, with the segment-guard
 * dance removed):
 *
 *   1. Mount + popstate — single listener that disambiguates by hash
 *      prefix and routes into the right pending slot.  An empty hash on
 *      popstate clears the galaxy selection via the handle (matches the
 *      legacy galaxy hook's behaviour); POI selection clears via the
 *      same call now that `selection.clear()` covers both kinds.
 *
 *   2. State → URL — derives the canonical body via
 *      `computeDesiredHash` and writes it via pushState if the URL is
 *      out of date.  No segment-guard skip — we own the hash.
 *
 *   3. Galaxy drain — resolves `pendingTarget` against the loaded
 *      catalogs (same logic as the legacy galaxy hook).
 *
 *   4. POI drain — resolves `pendingPoiId` against the POI table and
 *      dispatches via the unified `camera.focusOn(poi)` (Task 2's
 *      widened handle method).
 *
 *   5. Galaxy supersede — collapses `pendingTarget` once any focused
 *      galaxy commit lands (deep-link wins vs casual click race; same
 *      logic as the legacy galaxy hook's effect 3b).  No POI supersede
 *      because the POI table is synchronous and resolves on first paint.
 */

import { useEffect, useRef, useState } from 'react';
import type { UseUrlSyncInput } from '../@types/engine/UseUrlSyncInput';
import type { UrlSyncReturn } from '../@types/engine/UrlSyncReturn';
import type { FocusTarget } from '../@types/camera/FocusTarget';
import { parseFocusHash, selectionToFocusId } from '../services/url/focusUrl';
import { parsePoiHash, poiIdToHash } from '../services/url/poiUrl';
import { resolveFocusTarget } from '../services/engine/camera/resolveFocusTarget';
import { ALL_SOURCES, Source } from '../data/sources';

// ── Pure helpers (re-exported for unit tests) ──────────────────────────────

export type DesiredHashInput = {
  focused: UseUrlSyncInput['focused'];
  focusedPoiId: UseUrlSyncInput['focusedPoiId'];
  currentHash: string;
};

export type DesiredHashOutput = {
  desiredHashBody: string;
  matches: boolean;
};

export function computeDesiredHash(input: DesiredHashInput): DesiredHashOutput {
  // Galaxy wins when both are set — matches the engine-side mutex (POI
  // clicks clear the galaxy selection at the engine level today, so
  // "both set" doesn't occur in practice; the precedence here is the
  // belt-and-braces guarantee).
  let desiredHashBody = '';
  if (input.focused) {
    const id = selectionToFocusId(input.focused);
    if (id) desiredHashBody = `focus=${id}`;
  } else if (input.focusedPoiId) {
    desiredHashBody = poiIdToHash(input.focusedPoiId);
  }
  const currentBody = input.currentHash.startsWith('#')
    ? input.currentHash.slice(1)
    : input.currentHash;
  return { desiredHashBody, matches: currentBody === desiredHashBody };
}

export type InitialPending =
  | { kind: 'galaxy'; target: FocusTarget }
  | { kind: 'poi'; poiId: string }
  | { kind: null };

export function initialPendingFromHash(hash: string): InitialPending {
  const galaxy = parseFocusHash(hash);
  if (galaxy) return { kind: 'galaxy', target: galaxy };
  const poi = parsePoiHash(hash);
  if (poi) return { kind: 'poi', poiId: poi };
  return { kind: null };
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useUrlSync(input: UseUrlSyncInput): UrlSyncReturn {
  const {
    focused, status, sourceCounts, famousMeta, famousXrefs, aliasMap,
    focusedPoiId, ready, pois, engineHandleRef,
  } = input;

  const [pendingTarget, setPendingTarget] = useState<FocusTarget | null>(null);
  const [pendingPoiId, setPendingPoiId] = useState<string | null>(null);

  // Effect 1: mount + popstate
  const mountedRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mountedRef.current) return;
    mountedRef.current = true;
    const initial = initialPendingFromHash(window.location.hash);
    if (initial.kind === 'galaxy') setPendingTarget(initial.target);
    else if (initial.kind === 'poi') setPendingPoiId(initial.poiId);

    const onPopState = () => {
      const next = initialPendingFromHash(window.location.hash);
      if (next.kind === 'galaxy') { setPendingTarget(next.target); setPendingPoiId(null); }
      else if (next.kind === 'poi') { setPendingPoiId(next.poiId); setPendingTarget(null); }
      else {
        setPendingTarget(null);
        setPendingPoiId(null);
        engineHandleRef.current?.selection.clear();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect 2: state → URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (pendingTarget !== null || pendingPoiId !== null) return;
    const { desiredHashBody, matches } = computeDesiredHash({
      focused, focusedPoiId, currentHash: window.location.hash,
    });
    if (matches) return;
    const base = window.location.pathname + window.location.search;
    const next = desiredHashBody ? `${base}#${desiredHashBody}` : base;
    window.history.pushState(null, '', next);
  }, [focused, focusedPoiId, pendingTarget, pendingPoiId]);

  // Effect 3: galaxy drain
  useEffect(() => {
    if (!pendingTarget) return;
    if (status.kind !== 'ready') return;
    const handle = engineHandleRef.current;
    if (!handle?.sources || !handle?.selection) return;

    const catalogs = [];
    for (const source of ALL_SOURCES) {
      if (source === Source.Synthetic) continue;
      const catalog = handle.sources.getCloud(source);
      if (catalog) catalogs.push({ source, catalog });
    }
    if (catalogs.length === 0) return;

    const result = resolveFocusTarget({
      target: pendingTarget, catalogs, famousMeta, aliasMap,
    });
    if (result.resolved) {
      handle.selection.selectByAlias({
        source: result.source,
        localIdx: result.localIdx,
        famousMeta,
        famousXrefs,
      });
    }
  }, [pendingTarget, status, sourceCounts, famousMeta, famousXrefs, aliasMap, engineHandleRef]);

  // Effect 4: POI drain
  useEffect(() => {
    if (!pendingPoiId) return;
    if (!ready) return;
    if (pois.length === 0) return;
    const handle = engineHandleRef.current;
    if (!handle) return;
    const poi = pois.find((p) => p.id === pendingPoiId);
    if (!poi) return;
    handle.camera.focusOn(poi);
    setPendingPoiId(null);
  }, [pendingPoiId, ready, pois, engineHandleRef]);

  // Effect 5: galaxy supersede
  useEffect(() => {
    if (focused !== null) setPendingTarget(null);
  }, [focused]);

  return { pendingTarget, pendingPoiId };
}
```

Adjust import paths / field types to match the existing legacy hooks (read both end-to-end before writing). Lift in any guards the legacy hooks have that I missed.

- [ ] **Step 5: Run tests + typecheck**

Run: `npm test -- useUrlSync && npm run typecheck`
Expected: 8 cases pass. Typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useUrlSync.ts src/@types/engine/UseUrlSyncInput.d.ts src/@types/engine/UrlSyncReturn.d.ts tests/hooks/useUrlSync.test.ts
git commit -m "feat(hooks): add unified useUrlSync hook"
```

---

### Task 5: Collapse InfoCard props to unified shape

**Files:**
- Modify: `src/components/InfoCard/InfoCard.tsx`
- Modify: `src/components/InfoCard/FullCard.tsx` (if its prop types reference the old split)
- Modify: any InfoCard tests under `tests/components/InfoCard/`
- Modify: `src/components/App/App.tsx` (call site — only the `<InfoCard …>` element, NOT yet the URL-sync swap)

Goal: `InfoCard` accepts `hovered: FocusableTarget | null`, `selected: FocusableTarget | null`, `onFocus(target)`, `onClose()`. Routing logic dispatches by type via `isPoi`. The component's two display branches (POI body vs galaxy body) stay; the prop surface compresses.

App.tsx is updated in this task only at the InfoCard call site — passes `selected = focusedPoi ?? selected` and `hovered = hoveredPoi ?? hovered` (POI wins). URL sync stays on the two legacy hooks; Task 6 swaps them.

- [ ] **Step 1: Update InfoCard tests first**

Find existing InfoCard tests (`grep -rn "InfoCard" tests/`) and update them to use the new prop shape. Each prior test that passed `selectedPoi={...}` becomes one passing `selected={poiObject}`; same for hover.

If no InfoCard tests exist, write a minimum-coverage test that exercises both render branches:

```ts
// tests/components/InfoCard/InfoCard.routing.test.tsx (or .test.ts if the project tests render via something other than RTL)
import { describe, it, expect } from 'vitest';
// Import or stub a renderer suited to the project's existing test infra.
// If existing component tests use plain render-to-string, copy that pattern.
```

If the project doesn't run component tests (vitest is in node env per CLAUDE.md), skip RTL and add a pure logic test extracting whichever routing predicates InfoCard uses into a helper. Pragmatically: if no precedent test exists, drop this step and rely on Task 8's manual smoke. Document the choice in the commit message.

- [ ] **Step 2: Run the InfoCard tests — expect failure**

Run: `npm test -- InfoCard`
Expected: FAIL on prop-shape mismatches.

- [ ] **Step 3: Update InfoCard.tsx prop types**

In `src/components/InfoCard/InfoCard.tsx`, replace the `InfoCardProps` type:

```ts
import type { FocusableTarget } from '../../@types/engine/FocusableTarget';
import { isPoi } from '../../services/engine/isPoi';

export type InfoCardProps = {
  /** Target currently under the cursor, or null when over empty sky.
   *  Can be either a galaxy or a POI — InfoCard dispatches via `isPoi`. */
  hovered: FocusableTarget | null;
  /** Pinned target, or null when nothing is pinned.  Same dispatch as hover. */
  selected: FocusableTarget | null;
  /** Focus button callback — caller routes to the unified handle method. */
  onFocus?: (target: FocusableTarget) => void;
  /** Close (×) callback — caller routes to the unified handle clear. */
  onClose?: () => void;
};
```

Drop `selectedPoi`, `hoveredPoi`, `onPoiFocus`, `onPoiClose` from the prop list.

- [ ] **Step 4: Rewrite InfoCard routing**

Replace the body of `InfoCard()` with type-dispatching logic. The existing logic has three cases (POI-pinned, stacked galaxy-pair, single card). Recompose them as:

```ts
export function InfoCard({ hovered, selected, onFocus, onClose }: InfoCardProps): ReactNode {
  if (!hovered && !selected) return null;

  // Hover precedence: if a POI is hovered, it wins over a galaxy hover.
  // Both being set is a transient cross-render race; runtime mutex in
  // runFrame.ts means it shouldn't happen, but the dispatcher is safe
  // either way — isPoi is total over the union.
  const selectedPoi = selected && isPoi(selected) ? selected : null;
  const selectedGalaxy = selected && !isPoi(selected) ? selected : null;
  const hoveredPoi = hovered && isPoi(hovered) ? hovered : null;
  const hoveredGalaxy = hovered && !isPoi(hovered) ? hovered : null;

  const showPoiHover = hoveredPoi != null && hoveredPoi.id !== selectedPoi?.id;
  const showGalaxyHover = hoveredGalaxy != null && !showPoiHover;

  if (selectedPoi) {
    return (
      <div className={cx(styles.infoCardStack, 'infoCardStack')}>
        <FullCard
          mode={{ kind: 'poi', poi: selectedPoi }}
          pinned
          onPoiFocus={onFocus}
          onClose={onClose}
        />
        {showGalaxyHover && <CompactCard info={hoveredGalaxy!} />}
        {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
      </div>
    );
  }

  const isStacked = showGalaxyHover && selectedGalaxy != null
    && hoveredGalaxy!.index !== selectedGalaxy.index;
  const fullCardInfo = isStacked
    ? selectedGalaxy
    : (showGalaxyHover ? hoveredGalaxy : selectedGalaxy ?? null);
  const fullCardPinned = isStacked ? true : !showGalaxyHover;

  return (
    <div className={cx(styles.infoCardStack, 'infoCardStack')}>
      {fullCardInfo && (
        <FullCard
          info={fullCardInfo}
          pinned={fullCardPinned}
          onFocus={fullCardPinned ? onFocus : undefined}
          onClose={fullCardPinned ? onClose : undefined}
        />
      )}
      {isStacked && <CompactCard info={hoveredGalaxy!} />}
      {showPoiHover && <CompactPoiCard poi={hoveredPoi!} />}
    </div>
  );
}
```

Note: `FullCard`'s `onPoiFocus` callback type was `(poi: PointOfInterest) => void`. With unified `onFocus: (target: FocusableTarget) => void`, FullCard's POI branch now passes a POI to a wider-typed handler. That's covariant (any handler accepting `FocusableTarget` accepts a POI), so no shape change in FullCard.tsx is needed. Verify by typecheck after the edit; if FullCard's type signature breaks, widen its `onPoiFocus` param type to `FocusableTarget` and rename to `onFocus` in that file.

- [ ] **Step 5: Update App.tsx InfoCard call site**

Modify `src/components/App/App.tsx` lines 549–558:

```tsx
<InfoCard
  hovered={hoveredPoi ?? hovered}
  selected={focusedPoi ?? selected}
  onFocus={(target) => handleRef.current?.camera.focusOn(target)}
  onClose={() => handleRef.current?.selection.clear()}
/>
```

The `focusedPoi`/`hoveredPoi` resolved-POI variables (App.tsx ~474, ~493) stay — they're the lookups into `staticPois`. The render pass just feeds them into the unified slots; POI wins via `??`.

- [ ] **Step 6: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass. If any other component imports `InfoCardProps` and reads the removed fields, fix them now.

- [ ] **Step 7: Commit**

```bash
git add src/components/InfoCard/InfoCard.tsx src/components/InfoCard/FullCard.tsx src/components/App/App.tsx tests/components/InfoCard/
git commit -m "feat(infocard): unify hovered/selected/onFocus/onClose props"
```

---

### Task 6: Swap App.tsx to `useUrlSync`, delete legacy hooks

**Files:**
- Modify: `src/components/App/App.tsx`
- Delete: `src/hooks/useFocusUrlSync.ts`
- Delete: `src/hooks/usePoiUrlSync.ts`
- Delete: `tests/hooks/useFocusUrlSync.test.ts`
- Delete: `src/@types/engine/UseFocusUrlInput.d.ts`
- Delete: `src/@types/engine/FocusSyncReturn.d.ts`
- Delete: `src/@types/engine/UsePoiUrlSyncInput.d.ts`
- Delete: `src/@types/engine/PoiSyncReturn.d.ts`
- Delete: `src/@types/engine/DesiredHashInput.d.ts`
- Delete: `src/@types/engine/DesiredHashOutput.d.ts`

Goal: One hook call replaces two; legacy files removed.

- [ ] **Step 1: Replace the two hook calls in App.tsx**

In `src/components/App/App.tsx`, find the `useFocusUrlSync({...})` and `usePoiUrlSync({...})` call sites. Replace both with a single `useUrlSync({...})` call that bundles every input. The returned `{ pendingTarget, pendingPoiId }` is destructured — same names as before, so any downstream consumers (banner, etc.) still see the same identifiers.

Remove the legacy imports from App.tsx:

```ts
// DELETE:
import { useFocusUrlSync } from '../../hooks/useFocusUrlSync';
import { usePoiUrlSync } from '../../hooks/usePoiUrlSync';

// ADD:
import { useUrlSync } from '../../hooks/useUrlSync';
```

- [ ] **Step 2: Delete the legacy hook files + their type files**

```bash
git rm src/hooks/useFocusUrlSync.ts src/hooks/usePoiUrlSync.ts
git rm tests/hooks/useFocusUrlSync.test.ts
git rm src/@types/engine/UseFocusUrlInput.d.ts
git rm src/@types/engine/FocusSyncReturn.d.ts
git rm src/@types/engine/UsePoiUrlSyncInput.d.ts
git rm src/@types/engine/PoiSyncReturn.d.ts
git rm src/@types/engine/DesiredHashInput.d.ts
git rm src/@types/engine/DesiredHashOutput.d.ts
```

If `DesiredHashInput.d.ts` / `DesiredHashOutput.d.ts` are imported by any test or consumer outside the two deleted hooks, fix the imports to point at `useUrlSync`'s in-file exports instead.

- [ ] **Step 3: Run tests + typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass. URL-sync behaviours covered by `tests/hooks/useUrlSync.test.ts` (Task 4).

- [ ] **Step 4: Manual smoke**

Start dev server (if not running): `npm run dev`. In a browser:
- Open `localhost:5173` → hash is empty.
- Click a galaxy → `#focus=…` appears in the URL.
- Click a cluster ring → `#poi=…` replaces it.
- Press Esc → URL clears, both InfoCards disappear.
- Open `localhost:5173/#focus=pgc:50063` in a new tab → M104 loads + pins.
- Open `localhost:5173/#poi=virgo-cluster` in a new tab → Virgo POI focuses.
- Browser Back/Forward after a series of clicks → previous selections restore.

- [ ] **Step 5: Commit**

```bash
git add src/components/App/App.tsx
git commit -m "refactor(app): swap to unified useUrlSync; remove legacy hooks"
```

---

### Task 7: Migrate `wireInput.ts`, remove engine-handle aliases, doc updates

**Files:**
- Modify: `src/services/engine/phases/wireInput.ts` (lines 439, 451)
- Modify: `src/@types/engine/handles/EngineCameraHandle.d.ts` (remove `focusOnPoi` + `clearPoiFocus`)
- Modify: `src/services/engine/engine.ts` (remove the public-handle `focusOnPoi` + `clearPoiFocus` exports — internal functions stay)
- Modify: `src/hooks/useKeyboardShortcuts.ts` (update docstring around line 69)
- Modify: `src/@types/engine/UseKeyboardShortcutsInput.d.ts` (docstring line 10)
- Modify: `src/@types/engine/BootstrapDeps.d.ts` (docstring line 46)

- [ ] **Step 1: Update wireInput.ts click handlers**

In `src/services/engine/phases/wireInput.ts`, around lines 439 and 451:

```ts
// Around line 439:
handle?.camera.focusOnPoi(lastClickedPoi);
// becomes:
handle?.camera.focusOn(lastClickedPoi);

// Around line 451:
handle?.camera.focusOn(lastClickedInfo);
// stays — already calls the unified method.
```

- [ ] **Step 2: Remove the alias declarations from the camera handle type**

In `src/@types/engine/handles/EngineCameraHandle.d.ts`, delete:

```ts
focusOnPoi: (poi: PointOfInterest) => void;
clearPoiFocus: () => void;
```

The corresponding doc block above each line goes too.

- [ ] **Step 3: Remove the handle exports in engine.ts**

In `src/services/engine/engine.ts`, find the public-handle `camera` object literal (~line 1418). Remove the `focusOnPoi` and `clearPoiFocus` entries from the export. The internal functions of the same name stay — they're still called from the unified `focusOn` dispatcher and from `clearSelection`.

- [ ] **Step 4: Update the Esc-clear docstring in useKeyboardShortcuts.ts**

Around line 69, the existing comment / code:

```ts
engineHandleRef.current?.selection.clear();
```

Update any nearby docblock to mention that Esc now closes any open InfoCard (galaxy or POI) in one call — semantics changed in this PR. Example replacement comment:

```ts
// Esc — universal "close the card" gesture.  `selection.clear()` tears
// down both galaxy selection and POI focus (unified 2026-05-19), so this
// single call collapses whichever variant is on screen.
```

- [ ] **Step 5: Update docstrings in the two affected type files**

`src/@types/engine/UseKeyboardShortcutsInput.d.ts:10` — update the line that says `"Engine driver for selection.clear, camera.focusOn, camera.focusOnHome, camera.logState."` to reflect the unified surface (drop `focusOnPoi` if it was listed).

`src/@types/engine/BootstrapDeps.d.ts:46` — update the handler-fans-out comment to mention `focusOn(target)` instead of the split form.

- [ ] **Step 6: Run the full test suite + typecheck + format**

```bash
npm run typecheck
npm test
npm run format
```

All green.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/phases/wireInput.ts src/@types/engine/handles/EngineCameraHandle.d.ts src/services/engine/engine.ts src/hooks/useKeyboardShortcuts.ts src/@types/engine/UseKeyboardShortcutsInput.d.ts src/@types/engine/BootstrapDeps.d.ts
git commit -m "refactor(engine): remove focusOnPoi / clearPoiFocus aliases"
```

---

### Task 8: Verification + PR

- [ ] **Step 1: Full quality gate**

```bash
npm run typecheck
npm test
npm run format
npm run build
```

All green. Note the build runs `tsc --noEmit` + `vite build`; catches anything the watch-mode tests miss.

- [ ] **Step 2: Manual smoke (golden path)**

`npm run dev` should already be running. In a browser:

1. **Galaxy click** — Click a bright point, InfoCard appears with `pinned` badge after the cursor moves off. URL shows `#focus=…`.
2. **Galaxy Focus button** — Press the Focus button in the card. Camera tweens to the galaxy.
3. **POI click** — Click a cluster ring (zoom out to ~200 Mpc framing if needed). InfoCard switches to the POI body. URL changes to `#poi=…`.
4. **POI Fly Here** — Press the Fly Here button in the POI card. Camera tweens to the POI framing distance.
5. **Esc** — Press Esc. Both card variants close; URL clears.
6. **Deep link, galaxy** — Open `localhost:5173/#focus=pgc:50063` in a new tab. M104 loads + pins.
7. **Deep link, POI** — Open `localhost:5173/#poi=virgo-cluster` in a new tab. Virgo POI focuses on first paint.
8. **Mixed back/forward** — Click galaxy A, then POI B, then galaxy C. Press Back twice. Verify URL + selection rewind through B → A → empty. Press Forward → walk back forward through A → B → C.

- [ ] **Step 3: Manual smoke (edge cases)**

1. **Pre-bootstrap deep-link** — Hard reload `localhost:5173/#poi=virgo-cluster` 5x. POI should resolve cleanly each time (no race-conditions where the URL clears before the engine bootstraps).
2. **Pinned-galaxy + hover-POI** — Pin a galaxy. Hover a cluster ring without clicking. Both cards visible (POI compact stacked above galaxy compact, or vice versa per the existing layout).
3. **Pinned-POI + hover-galaxy** — Pin a cluster. Hover a galaxy. Both cards visible.
4. **Synthetic galaxy click** — If there's a synthetic source enabled, click one. No `#focus=…` should appear (existing behaviour preserved).

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "Unify galaxy + POI focus/clear codepaths" --body "$(cat <<'EOF'
## Summary

- Collapses four pairs of mirrored galaxy/POI codepaths into single dispatching primitives.
- `handle.camera.focusOn(target: GalaxyInfo | PointOfInterest)` replaces the two methods.
- `handle.selection.clear()` now closes both galaxy and POI selection in one call ("close the card" semantic).
- `InfoCard` collapses to unified `hovered` / `selected` / `onFocus` / `onClose` props.
- Two URL sync hooks (`useFocusUrlSync` + `usePoiUrlSync`) merged into one `useUrlSync` that owns the whole `location.hash`.

## Test plan

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual: galaxy click + Focus + Esc cycle
- [ ] Manual: POI click + Fly Here + Esc cycle
- [ ] Manual: deep-link `#focus=…` + `#poi=…` on first load
- [ ] Manual: Back/Forward across mixed selections

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Final commit (if any docs updates remain)**

If any documentation in `docs/` referenced the old API, update it. Otherwise no commit.

```bash
git status
# If clean, the PR command above already pushed the latest commit.  Done.
```
