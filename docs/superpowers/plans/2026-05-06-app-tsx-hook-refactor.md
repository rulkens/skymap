# App.tsx Hook Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the 33-`useState` / 4-`useEffect` body of `src/components/App/App.tsx` (909 lines) into 5 focused custom hooks under `src/hooks/`, leaving App.tsx as a thin wiring layer of ~300 lines.

**Architecture:** Six bite-sized refactors, each self-contained. Each hook owns one concern: `useFamousMeta` (sidecar fetch), `useAliasIndex` (lazy palette aliases), `useKeyboardShortcuts` (global keydown), `useEngineSettings` (the ~20 echoed settings + their setter callbacks), `useEngine` (engine lifecycle + engine-driven state). Each task moves code without changing behavior; tests cover any pure helpers extracted along the way.

**Tech Stack:** React 18, TypeScript, Vitest (node env — no DOM), WebGPU engine accessed via `EngineHandle` ref.

**Branch:** `refactor/app-hooks` (already created).

---

## File structure after refactor

| File | Status | Responsibility |
|---|---|---|
| `src/hooks/useFamousMeta.ts` | Create | Loads `loadFamousSidecars()` once at mount; returns `{ famousMeta, famousXrefs }`. |
| `src/hooks/useAliasIndex.ts` | Create | Lazy-loads PGC alias map on first palette open; returns `{ aliasIndex, aliasMap }`. |
| `src/hooks/buildAliasIndex.ts` | Create | Pure helper extracted from `useAliasIndex` for unit testing. |
| `src/hooks/useKeyboardShortcuts.ts` | Create | Owns the global `keydown` listener (Esc / f / h / l / Cmd+K / `/`). |
| `src/hooks/useEngineSettings.ts` | Create | Bundles ~20 settings useStates + the `EngineCallbacks` slice that echoes them. |
| `src/hooks/useEngine.ts` | Create | Owns `canvasRef`, `handleRef`, engine startup `useEffect`, and engine-driven session state. |
| `src/hooks/useFocusUrlSync.ts` | Unchanged | Already a hook from a prior plan. |
| `src/components/App/App.tsx` | Modify | Drops to ~300 lines: hook calls + JSX wiring. |
| `tests/hooks/buildAliasIndex.test.ts` | Create | Tests for the pure helper. |

Order rationale: small + independent first (Tasks 1–3), bulk-move next (Task 4), then the largest extraction (Task 5), then a cleanup pass (Task 6). Each task leaves App.tsx in a working state.

---

### Task 1: useFamousMeta

**Files:**
- Create: `src/hooks/useFamousMeta.ts`
- Modify: `src/components/App/App.tsx` (remove `famousMeta` / `famousXrefs` useState block + the loader `useEffect`; replace with `useFamousMeta()` call)

- [ ] **Step 1: Create the hook**

Write `src/hooks/useFamousMeta.ts`:

```ts
/**
 * `useFamousMeta` — load the famous-galaxy sidecars (`famous_meta.json`
 * and `famous_xrefs.json`) once at mount.  The engine *also* loads them
 * internally, but exposing a parallel copy here lets the React layer
 * (CommandPalette, deep-link drain) read them without reaching into
 * engine private state.  Double-loading is cheap because the browser
 * caches the JSON fetch — both readers hit the same response.
 *
 * Why a hook rather than a top-level await or a context provider?
 * `loadFamousSidecars` is async; we need the React render cycle to
 * pick up the result, which means state.  And every call site is a
 * single React tree, so a hook is lighter than a Context.
 */

import { useEffect, useState } from 'react';
import {
  loadFamousSidecars,
  type FamousMetaEntry,
  type FamousXrefMap,
} from '../services/engine/famousMetaLoader';

export type UseFamousMetaReturn = {
  famousMeta: readonly FamousMetaEntry[];
  famousXrefs: FamousXrefMap;
};

export function useFamousMeta(): UseFamousMetaReturn {
  const [famousMeta, setFamousMeta] = useState<readonly FamousMetaEntry[]>([]);
  const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});

  useEffect(() => {
    loadFamousSidecars().then((sc) => {
      setFamousMeta(sc.meta);
      setFamousXrefs(sc.xrefs);
    });
  }, []);

  return { famousMeta, famousXrefs };
}
```

- [ ] **Step 2: Wire into App.tsx**

In `src/components/App/App.tsx`:

Remove these imports from the existing block (around line 113):
```ts
import {
  loadFamousSidecars,
  type FamousMetaEntry,
  type FamousXrefMap,
} from '../../services/engine/famousMetaLoader';
```

Add the hook import (next to the existing `useFocusUrlSync` import):
```ts
import { useFamousMeta } from '../../hooks/useFamousMeta';
```

Remove the two useState lines (currently around lines 355 and 360):
```ts
const [famousMeta, setFamousMeta] = useState<FamousMetaEntry[]>([]);
const [famousXrefs, setFamousXrefs] = useState<FamousXrefMap>({});
```
…and the comments above them.

Remove the loader useEffect (currently around line 515):
```ts
useEffect(() => {
  loadFamousSidecars().then((sc) => {
    setFamousMeta(sc.meta);
    setFamousXrefs(sc.xrefs);
  });
}, []);
```
…and the comment block above it.

Add a single hook call near the top of the component body (just after the last useState, before the engine useEffect):
```ts
// ── Famous-galaxy sidecars (CommandPalette + deep-link drain) ────────────
const { famousMeta, famousXrefs } = useFamousMeta();
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests pass (no new tests added in this task — pure refactor).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFamousMeta.ts src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useFamousMeta hook

Move the famous-sidecar load (famous_meta.json + famous_xrefs.json) out
of App.tsx into a dedicated hook.  Pure relocation, no behavior change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: useAliasIndex (with extracted pure helper)

**Files:**
- Create: `src/hooks/buildAliasIndex.ts`
- Create: `tests/hooks/buildAliasIndex.test.ts`
- Create: `src/hooks/useAliasIndex.ts`
- Modify: `src/components/App/App.tsx` (remove alias state + the lazy-load `useEffect`; replace with `useAliasIndex(...)`)

- [ ] **Step 1: Write the failing test for `buildAliasIndex`**

Create `tests/hooks/buildAliasIndex.test.ts`:

```ts
/**
 * Tests for the pure alias-index builder extracted from `useAliasIndex`.
 *
 * The builder walks the engine's per-source `objIDs` arrays and joins
 * each non-zero PGC against an alias map (PGC → display names).  Pure
 * function so we can hammer every branch in node without spinning up
 * React or an engine.
 */

import { describe, it, expect } from 'vitest';
import { buildAliasIndex } from '../../src/hooks/buildAliasIndex';
import { Source } from '../../src/data/sources';
import type { EngineHandle } from '../../src/@types';

/**
 * Build a minimal `EngineHandle` whose only live method is
 * `getCloudObjIds`.  Cast through `unknown` because the real handle has
 * ~30 methods we don't care about for this test.
 */
const fakeHandle = (
  objIdsBySource: Partial<Record<Source, BigUint64Array>>,
): EngineHandle =>
  ({
    getCloudObjIds: (s: Source) => objIdsBySource[s],
  }) as unknown as EngineHandle;

describe('buildAliasIndex', () => {
  it('emits one entry per (source, localIdx) where the PGC has aliases', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([100n, 200n, 300n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['NGC 1']],
      [300n, ['NGC 3']],
    ]);
    const out = buildAliasIndex({
      handle,
      aliasMap,
      sources: [Source.Glade],
    });
    expect(out).toEqual([
      { pgc: 100n, names: ['NGC 1'], source: Source.Glade, localIdx: 0 },
      { pgc: 300n, names: ['NGC 3'], source: Source.Glade, localIdx: 2 },
    ]);
  });

  it('skips zero PGCs (unmatched cross-match rows)', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([0n, 100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    const out = buildAliasIndex({
      handle,
      aliasMap,
      sources: [Source.Glade],
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.pgc).toBe(100n);
  });

  it('skips PGCs whose alias list is empty', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([100n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([[100n, []]]);
    expect(
      buildAliasIndex({ handle, aliasMap, sources: [Source.Glade] }),
    ).toEqual([]);
  });

  it('returns empty when a source is not loaded', () => {
    const handle = fakeHandle({}); // no clouds
    const aliasMap = new Map<bigint, readonly string[]>([[100n, ['NGC 1']]]);
    expect(
      buildAliasIndex({
        handle,
        aliasMap,
        sources: [Source.Glade, Source.TwoMRS],
      }),
    ).toEqual([]);
  });

  it('walks multiple sources in order', () => {
    const handle = fakeHandle({
      [Source.Glade]: new BigUint64Array([100n]),
      [Source.TwoMRS]: new BigUint64Array([200n]),
    });
    const aliasMap = new Map<bigint, readonly string[]>([
      [100n, ['G']],
      [200n, ['T']],
    ]);
    const out = buildAliasIndex({
      handle,
      aliasMap,
      sources: [Source.Glade, Source.TwoMRS],
    });
    expect(out.map((e) => e.source)).toEqual([Source.Glade, Source.TwoMRS]);
    expect(out.map((e) => e.localIdx)).toEqual([0, 0]);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run tests/hooks/buildAliasIndex.test.ts`
Expected: FAIL with "Cannot find module '../../src/hooks/buildAliasIndex'".

- [ ] **Step 3: Implement the pure helper**

Create `src/hooks/buildAliasIndex.ts`:

```ts
/**
 * Pure alias-index builder.  Walks each requested source's `objIDs`
 * array, looks up the PGC in the alias map, and emits one entry per
 * (source, localIdx) whose PGC has a non-empty alias list.
 *
 * Why pure / why a separate file?  `useAliasIndex` exists to drive a
 * React state update on first palette open, which is fundamentally
 * imperative.  But the logic *inside* the hook — "given these arrays
 * and this map, what entries should the index contain" — is pure
 * iteration with no React or DOM coupling.  Splitting it out lets us
 * test every branch (zero PGC, missing source, empty names) in node
 * without renderHook.  The hook's surrounding `useEffect` becomes
 * thin, unfailable glue.
 *
 * Two skip rules baked in:
 *   1. PGC === 0n means the cross-match never matched a HyperLEDA row;
 *      skip silently rather than emit a meaningless "PGC 0" entry.
 *   2. names.length === 0 means the alias loader had a key but no
 *      values (shouldn't happen with the current sidecar schema, but
 *      cheap defensive skip avoids an empty-string row in the palette).
 */

import type { EngineHandle } from '../@types';
import type { Source } from '../data/sources';
import type { AliasIndexEntry } from '../services/engine/pgcAliasLoader';

export type BuildAliasIndexInput = {
  handle: EngineHandle;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  sources: readonly Source[];
};

export function buildAliasIndex(input: BuildAliasIndexInput): AliasIndexEntry[] {
  const { handle, aliasMap, sources } = input;
  const out: AliasIndexEntry[] = [];
  for (const source of sources) {
    const objIds = handle.getCloudObjIds?.(source);
    if (!objIds) continue;
    for (let i = 0; i < objIds.length; i++) {
      const pgc = objIds[i]!;
      if (pgc === 0n) continue;
      const names = aliasMap.get(pgc);
      if (!names || names.length === 0) continue;
      out.push({ pgc, names, source, localIdx: i });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run tests/hooks/buildAliasIndex.test.ts`
Expected: PASS, 5/5 tests.

- [ ] **Step 5: Implement the hook**

Create `src/hooks/useAliasIndex.ts`:

```ts
/**
 * `useAliasIndex` — lazy two-phase pipeline that powers the command
 * palette's alias search:
 *
 *   1. Fetch `pgc_aliases.json` (the PGC → human-name Map, ~1.7 MB).
 *   2. Walk the engine's GLADE and 2MRS objID arrays, look up each
 *      non-zero PGC, emit one `AliasIndexEntry` per match.
 *
 * Both phases happen exactly once per session, on the first palette
 * open.  Why not at engine-ready time?  Most users never hit Cmd+K —
 * paying the 1.7 MB JSON download up front would be wasteful for them.
 *
 * `aliasIndex === null` means "not loaded yet"; `[]` means "loaded but
 * empty" (sidecar absent, or join produced no hits).  The palette
 * accepts undefined/empty without complaint.
 *
 * `aliasMap` (the raw Map) is also returned because the deep-link
 * resolver uses it as the "is this PGC a real galaxy in HyperLEDA?"
 * oracle for the tier-vs-unknown distinction.  Starts as an empty Map
 * so callers can call `.has(...)` without a null guard before the load
 * resolves; an empty map just collapses unknown PGCs to `unknown`
 * instead of `tier`, which is documented in `resolveFocusTarget.ts`.
 */

import { useEffect, useRef, useState, type RefObject } from 'react';
import type { EngineHandle } from '../@types';
import { Source } from '../data/sources';
import {
  loadPgcAliases,
  type AliasIndexEntry,
} from '../services/engine/pgcAliasLoader';
import { buildAliasIndex } from './buildAliasIndex';

export type UseAliasIndexInput = {
  paletteOpen: boolean;
  sourceCounts: Partial<Record<Source, number>>;
  engineHandleRef: RefObject<EngineHandle | null>;
};

export type UseAliasIndexReturn = {
  aliasIndex: readonly AliasIndexEntry[] | null;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
};

export function useAliasIndex(input: UseAliasIndexInput): UseAliasIndexReturn {
  const { paletteOpen, sourceCounts, engineHandleRef } = input;

  const [aliasIndex, setAliasIndex] = useState<readonly AliasIndexEntry[] | null>(null);
  const [aliasMap, setAliasMap] = useState<ReadonlyMap<bigint, readonly string[]>>(
    () => new Map(),
  );
  // Tracks whether we've already kicked off the lazy load — the
  // effect's `paletteOpen` dependency would otherwise re-trigger on
  // every open.
  const aliasLoadStarted = useRef(false);

  useEffect(() => {
    if (!paletteOpen) return;
    if (aliasLoadStarted.current) return;
    const handle = engineHandleRef.current;
    if (!handle?.getCloudObjIds) return;
    // Don't kick off until at least one of GLADE / 2MRS has started
    // loading.  Without this guard the join walks a missing array and
    // emits no entries, permanently caching an empty index.
    const gladeCount = sourceCounts[Source.Glade] ?? 0;
    const twoMrsCount = sourceCounts[Source.TwoMRS] ?? 0;
    if (gladeCount === 0 && twoMrsCount === 0) return;

    aliasLoadStarted.current = true;
    loadPgcAliases().then((loadedAliasMap) => {
      // Stash the raw Map first for the deep-link resolver oracle —
      // it only needs `.has(pgc)`, not the per-source localIdx join.
      setAliasMap(loadedAliasMap);
      setAliasIndex(
        buildAliasIndex({
          handle,
          aliasMap: loadedAliasMap,
          sources: [Source.Glade, Source.TwoMRS],
        }),
      );
    });
  }, [paletteOpen, sourceCounts, engineHandleRef]);

  return { aliasIndex, aliasMap };
}
```

- [ ] **Step 6: Wire into App.tsx**

In `src/components/App/App.tsx`:

Remove these imports (around line 117):
```ts
import {
  loadPgcAliases,
  type AliasIndexEntry,
} from '../../services/engine/pgcAliasLoader';
```

Add the hook import:
```ts
import { useAliasIndex } from '../../hooks/useAliasIndex';
```

Remove the alias state block (currently around lines 373–393), including all comments:
```ts
const [aliasIndex, setAliasIndex] = useState<readonly AliasIndexEntry[] | null>(null);
const aliasLoadStarted = useRef(false);
const [aliasMap, setAliasMap] = useState<ReadonlyMap<bigint, readonly string[]>>(
  () => new Map(),
);
```

Remove the lazy-load `useEffect` (currently around lines 541–580), including its comment block.

Add a hook call (place it AFTER `useFamousMeta()` and AFTER the line `const handleRef = useRef<EngineHandle | null>(null);` — `handleRef` must exist first):
```ts
// ── Lazy alias index for command palette ────────────────────────────────
const { aliasIndex, aliasMap } = useAliasIndex({
  paletteOpen,
  sourceCounts,
  engineHandleRef: handleRef,
});
```

NOTE: the call needs `paletteOpen` and `sourceCounts` to already be declared. Since both useState declarations sit above the engine `useEffect` in current App.tsx, place the `useAliasIndex` call right after them and before the engine effect.

- [ ] **Step 7: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests pass including the 5 new `buildAliasIndex` tests.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/buildAliasIndex.ts src/hooks/useAliasIndex.ts tests/hooks/buildAliasIndex.test.ts src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useAliasIndex hook + pure buildAliasIndex helper

Move the lazy palette-alias load out of App.tsx.  The pure
buildAliasIndex helper gets full unit coverage in node; the React glue
is a thin useEffect wrapper.  No behavior change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: useKeyboardShortcuts

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Modify: `src/components/App/App.tsx` (remove the keydown `useEffect`; replace with hook call)

- [ ] **Step 1: Create the hook**

Create `src/hooks/useKeyboardShortcuts.ts`:

```ts
/**
 * `useKeyboardShortcuts` — global keydown listener for the app's
 * top-level shortcuts:
 *
 *   - Cmd+K / Ctrl+K / `/`  → open the command palette
 *   - Esc                    → clear pinned selection
 *   - f / F                  → focus on the currently-pinned galaxy
 *   - h / H                  → return camera to home view
 *   - l                      → debug: log live camera state
 *
 * Why a hook?  The handler closes over `selected` and `paletteOpen`,
 * so we need a re-bind whenever those change.  Wrapping it in a hook
 * keeps the closure-management discipline (declarative deps array)
 * out of App.tsx and lets us evolve the shortcut set without touching
 * the wiring layer.
 *
 * Form-field guard: typing inside an `<input>`, `<textarea>`, or
 * `contenteditable` element should not hijack `f` and `h`.  The check
 * runs first so the rest of the dispatch sees only "real" keystrokes.
 */

import { useEffect, type RefObject } from 'react';
import type { EngineHandle, PointInfo } from '../@types';

export type UseKeyboardShortcutsInput = {
  /** The currently-pinned galaxy.  `f` is a no-op when null. */
  selected: PointInfo | null;
  /** Used to gate the `/` shortcut so the palette doesn't reopen on top of itself. */
  paletteOpen: boolean;
  /** Engine driver for clearSelection, focusOn, focusOnHome, logCameraState. */
  engineHandleRef: RefObject<EngineHandle | null>;
  /** App-side callback to flip palette state on Cmd+K / `/`. */
  onOpenPalette: () => void;
};

export function useKeyboardShortcuts(input: UseKeyboardShortcutsInput): void {
  const { selected, paletteOpen, engineHandleRef, onOpenPalette } = input;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ── Ignore keystrokes typed into form fields ────────────────
      const target = e.target as Element | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // ── Cmd+K / Ctrl+K opens the palette ────────────────────────
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenPalette();
        return;
      }
      // ── `/` opens the palette (only if not already open) ────────
      if (e.key === '/' && !paletteOpen) {
        e.preventDefault();
        onOpenPalette();
        return;
      }

      // ── Esc clears the pin ─────────────────────────────────────
      if (e.key === 'Escape') {
        engineHandleRef.current?.clearSelection();
        return;
      }

      // ── f focuses on the currently-pinned galaxy ───────────────
      if (e.key === 'f' || e.key === 'F') {
        if (selected) engineHandleRef.current?.focusOn(selected);
        return;
      }

      // ── h returns to the home / Earth view ─────────────────────
      if (e.key === 'h' || e.key === 'H') {
        engineHandleRef.current?.focusOnHome();
        return;
      }

      // ── l prints the live camera state (dev hotkey) ────────────
      // Lower-case only — capital L is reserved for future use.
      if (e.key === 'l') {
        engineHandleRef.current?.logCameraState();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected, paletteOpen, engineHandleRef, onOpenPalette]);
}
```

- [ ] **Step 2: Wire into App.tsx**

Add the import:
```ts
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
```

Remove the keydown `useEffect` (currently around lines 605–665), including its comment block.

Add a hook call where the deleted effect was:
```ts
// ── Global keyboard shortcuts (Cmd+K, Esc, f, h, l) ─────────────────────
useKeyboardShortcuts({
  selected,
  paletteOpen,
  engineHandleRef: handleRef,
  onOpenPalette: () => setPaletteOpen(true),
});
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useKeyboardShortcuts hook

Move the global keydown listener (Esc / f / h / l / Cmd+K / /) out of
App.tsx into a dedicated hook.  Pure relocation, no behavior change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: useEngineSettings

**Files:**
- Create: `src/hooks/useEngineSettings.ts`
- Modify: `src/components/App/App.tsx` (remove the ~20 settings useStates; replace with `useEngineSettings()`; spread `settingsCallbacks` into the existing `createEngine` call)

**Scope:** This task moves the *settings* useStates and their *echo callbacks*.  The engine-session callbacks (`onStatusChange`, `onHoverChange`, etc.) stay in App.tsx until Task 5.  The hook returns:

  - `settings` — read-only object of all current values.
  - `engineCallbacks` — the slice of `EngineCallbacks` the engine spreads into its options to drive the echoes.
  - Three App-owned setters (`setFilamentsEnabled`, `setFilamentIntensity`, `setExposure`) that don't have engine echoes and need to update React optimistically alongside the engine forward.

The `filamentCounts` one-shot is included here because it's tied to a settings concern (the Filaments overlay), not the engine session lifecycle.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useEngineSettings.ts`:

```ts
/**
 * `useEngineSettings` — the bulk of App.tsx's render-pass settings
 * state and the engine-callback slice that keeps it in sync.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The pattern this consolidates
 * ──────────────────────────────────────────────────────────────────────
 * Most fields here follow the same lifecycle:
 *
 *   1. React seeds an initial value from `data/defaults.ts` so the
 *      SettingsPanel renders a useful first paint before the engine's
 *      first echo lands.
 *   2. The engine fires an echo callback (e.g. `onPointSizeChange`)
 *      both at engine init AND on every `setPointSize` call, so the
 *      React copy always reflects the engine's authoritative value.
 *   3. The SettingsPanel onChange handler in App.tsx forwards user
 *      input to the engine handle (e.g. `handleRef.current?.setPointSize(v)`)
 *      and the engine echoes it right back, so no optimistic local
 *      update is needed — except for the three exceptions below.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The three App-owned exceptions
 * ──────────────────────────────────────────────────────────────────────
 *   - `filamentsEnabled` — engine has no echo callback for this; React
 *     owns it optimistically.  The hook exposes `setFilamentsEnabled`.
 *   - `filamentIntensity` — same as above.
 *   - `exposure` — engine echoes via `onExposureChange`, but the
 *     SettingsPanel's slider also nudges it locally for snappy thumb
 *     tracking (the engine's echo lands a frame later).  Exposed
 *     setter lets the App-side onChange handler do that.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why bundle into one hook?
 * ──────────────────────────────────────────────────────────────────────
 * Each individual setting is trivial; the win is collecting ~150 lines
 * of `useState` declarations + their inline rationale into one place
 * the SettingsPanel can read from.  App.tsx is freed to focus on the
 * higher-level wiring.
 */

import { useState } from 'react';
import type { EngineCallbacks } from '../@types/EngineCallbacks';
import type { LodMode } from '../@types/LodMode';
import { BiasMode } from '../data/biasMode';
import { ToneMapCurve } from '../data/toneMapCurve';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FILAMENT_INTENSITY,
  DEFAULT_FILAMENTS_ENABLED,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_LOD_MODE,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VISIBLE_SOURCE_MASK,
} from '../data/defaults';

export type EngineSettingsState = {
  pointSize: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  filamentsEnabled: boolean;
  filamentIntensity: number;
  filamentCounts: { stripCount: number; vertexCount: number } | null;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  visibleSourceMask: number;
  lodMode: LodMode;
  biasMode: BiasMode;
  absMagLimit: number;
  toneMapCurve: ToneMapCurve;
  exposure: number;
};

/**
 * The slice of `EngineCallbacks` this hook owns.  App.tsx spreads this
 * into its `createEngine(canvas, { ... })` options block so the engine
 * can fire echoes that drive React's settings state.
 */
export type EngineSettingsCallbacks = Pick<
  EngineCallbacks,
  | 'onPointSizeChange'
  | 'onBrightnessChange'
  | 'onAutoRotateChange'
  | 'onGalaxyTexturesEnabledChange'
  | 'onMilkyWayEnabledChange'
  | 'onHighlightFallbackChange'
  | 'onRealOnlyModeChange'
  | 'onDepthFadeEnabledChange'
  | 'onLodModeChange'
  | 'onSourceMaskChange'
  | 'onBiasModeChange'
  | 'onAbsMagLimitChange'
  | 'onToneMapCurveChange'
  | 'onExposureChange'
  | 'onFilamentsReady'
>;

export type UseEngineSettingsReturn = {
  settings: EngineSettingsState;
  engineCallbacks: EngineSettingsCallbacks;
  // App-owned optimistic setters for the no-echo / partial-echo cases
  setFilamentsEnabled: (v: boolean) => void;
  setFilamentIntensity: (v: number) => void;
  setExposure: (v: number) => void;
};

export function useEngineSettings(): UseEngineSettingsReturn {
  // ── Engine-echoed values ─────────────────────────────────────────
  const [pointSize, setPointSize] = useState<number>(DEFAULT_POINT_SIZE_PX);
  const [brightness, setBrightness] = useState<number>(DEFAULT_BRIGHTNESS);
  const [autoRotate, setAutoRotate] = useState<boolean>(DEFAULT_AUTO_ROTATE);
  const [galaxyTexturesEnabled, setGalaxyTexturesEnabled] = useState<boolean>(
    DEFAULT_GALAXY_TEXTURES_ENABLED,
  );
  const [milkyWayEnabled, setMilkyWayEnabled] = useState<boolean>(
    DEFAULT_MILKY_WAY_ENABLED,
  );
  const [highlightFallback, setHighlightFallback] = useState<boolean>(
    DEFAULT_HIGHLIGHT_FALLBACK,
  );
  const [realOnlyMode, setRealOnlyMode] = useState<boolean>(DEFAULT_REAL_ONLY_MODE);
  const [depthFadeEnabled, setDepthFadeEnabled] = useState<boolean>(
    DEFAULT_DEPTH_FADE_ENABLED,
  );
  const [visibleSourceMask, setVisibleSourceMask] = useState<number>(
    DEFAULT_VISIBLE_SOURCE_MASK,
  );
  const [lodMode, setLodMode] = useState<LodMode>(DEFAULT_LOD_MODE);
  const [biasMode, setBiasMode] = useState<BiasMode>(DEFAULT_BIAS_MODE);
  const [absMagLimit, setAbsMagLimit] = useState<number>(DEFAULT_ABS_MAG_LIMIT);
  const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurve>(
    DEFAULT_TONE_MAP_CURVE,
  );
  const [exposure, setExposure] = useState<number>(DEFAULT_EXPOSURE);

  // ── App-owned optimistic values (no engine echo) ─────────────────
  const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(
    DEFAULT_FILAMENTS_ENABLED,
  );
  const [filamentIntensity, setFilamentIntensity] = useState<number>(
    DEFAULT_FILAMENT_INTENSITY,
  );

  // ── One-shot from engine: filament strip + vertex counts ─────────
  const [filamentCounts, setFilamentCounts] = useState<{
    stripCount: number;
    vertexCount: number;
  } | null>(null);

  return {
    settings: {
      pointSize,
      brightness,
      autoRotate,
      galaxyTexturesEnabled,
      milkyWayEnabled,
      filamentsEnabled,
      filamentIntensity,
      filamentCounts,
      highlightFallback,
      realOnlyMode,
      depthFadeEnabled,
      visibleSourceMask,
      lodMode,
      biasMode,
      absMagLimit,
      toneMapCurve,
      exposure,
    },
    engineCallbacks: {
      onPointSizeChange: setPointSize,
      onBrightnessChange: setBrightness,
      onAutoRotateChange: setAutoRotate,
      onGalaxyTexturesEnabledChange: setGalaxyTexturesEnabled,
      onMilkyWayEnabledChange: setMilkyWayEnabled,
      onHighlightFallbackChange: setHighlightFallback,
      onRealOnlyModeChange: setRealOnlyMode,
      onDepthFadeEnabledChange: setDepthFadeEnabled,
      onLodModeChange: setLodMode,
      onSourceMaskChange: setVisibleSourceMask,
      onBiasModeChange: setBiasMode,
      onAbsMagLimitChange: setAbsMagLimit,
      onToneMapCurveChange: setToneMapCurve,
      onExposureChange: setExposure,
      onFilamentsReady: (stripCount, vertexCount) =>
        setFilamentCounts({ stripCount, vertexCount }),
    },
    setFilamentsEnabled,
    setFilamentIntensity,
    setExposure,
  };
}
```

- [ ] **Step 2: Wire into App.tsx — replace useStates**

In `src/components/App/App.tsx`:

Add the import:
```ts
import { useEngineSettings } from '../../hooks/useEngineSettings';
```

Remove these unused imports (they're now consumed inside the hook):
```ts
import { BiasMode } from '../../data/biasMode';
import { ToneMapCurve } from '../../data/toneMapCurve';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_AUTO_ROTATE,
  // ...all the DEFAULT_* imports for settings
} from '../../data/defaults';
```

Keep `DEFAULT_SPACE_MOUSE_SENSITIVITY` and `DEFAULT_VISIBLE_SOURCE_MASK` import if they're referenced outside the hook (they are not in this task, but `DEFAULT_VISIBLE_SOURCE_MASK` is used by `useEngineSettings`). Audit by removing the import block and re-adding only what TypeScript still needs.

Remove these useState declarations and their comment blocks (current line numbers approximate — between lines 189 and 346):
```ts
const [pointSize, setPointSize] = useState<number>(DEFAULT_POINT_SIZE_PX);
const [brightness, setBrightness] = useState<number>(DEFAULT_BRIGHTNESS);
const [autoRotate, setAutoRotate] = useState<boolean>(DEFAULT_AUTO_ROTATE);
const [galaxyTexturesEnabled, setGalaxyTexturesEnabled] = useState<boolean>(...);
const [milkyWayEnabled, setMilkyWayEnabled] = useState<boolean>(...);
const [filamentsEnabled, setFilamentsEnabled] = useState<boolean>(...);
const [filamentIntensity, setFilamentIntensity] = useState<number>(...);
const [filamentCounts, setFilamentCounts] = useState<...>(null);
const [highlightFallback, setHighlightFallback] = useState<boolean>(...);
const [realOnlyMode, setRealOnlyMode] = useState<boolean>(...);
const [depthFadeEnabled, setDepthFadeEnabled] = useState<boolean>(...);
const [visibleSourceMask, setVisibleSourceMask] = useState<number>(...);
const [lodMode, setLodMode] = useState<LodMode>(DEFAULT_LOD_MODE);
const [biasMode, setBiasMode] = useState<BiasMode>(DEFAULT_BIAS_MODE);
const [absMagLimit, setAbsMagLimit] = useState<number>(DEFAULT_ABS_MAG_LIMIT);
const [toneMapCurve, setToneMapCurve] = useState<ToneMapCurve>(DEFAULT_TONE_MAP_CURVE);
const [exposure, setExposure] = useState<number>(DEFAULT_EXPOSURE);
```

Add a single hook call near the top of the component body (just after the canvas/handle refs and `status`/`hovered`/`selected`/`focused`/`scale` useStates, since those stay in place this task):
```ts
// ── Engine-driven settings (point size, brightness, filaments, tone map, …) ──
const {
  settings,
  engineCallbacks: settingsCallbacks,
  setFilamentsEnabled,
  setFilamentIntensity,
  setExposure,
} = useEngineSettings();
```

- [ ] **Step 3: Wire into App.tsx — destructure settings + spread callbacks**

Right after the `useEngineSettings` call, destructure the settings for terse JSX access:
```ts
const {
  pointSize,
  brightness,
  autoRotate,
  galaxyTexturesEnabled,
  milkyWayEnabled,
  filamentsEnabled,
  filamentIntensity,
  filamentCounts,
  highlightFallback,
  realOnlyMode,
  depthFadeEnabled,
  visibleSourceMask,
  lodMode,
  biasMode,
  absMagLimit,
  toneMapCurve,
  exposure,
} = settings;
```

In the `createEngine(canvas, { ... })` options block, REMOVE the now-redundant individual echo callbacks (these duplicate `settingsCallbacks`):
```ts
onPointSizeChange: setPointSize,
onBrightnessChange: setBrightness,
onAutoRotateChange: setAutoRotate,
onGalaxyTexturesEnabledChange: setGalaxyTexturesEnabled,
onMilkyWayEnabledChange: setMilkyWayEnabled,
onHighlightFallbackChange: setHighlightFallback,
onRealOnlyModeChange: setRealOnlyMode,
onDepthFadeEnabledChange: setDepthFadeEnabled,
onLodModeChange: setLodMode,
onSourceMaskChange: setVisibleSourceMask,
onBiasModeChange: setBiasMode,
onAbsMagLimitChange: setAbsMagLimit,
onToneMapCurveChange: setToneMapCurve,
onExposureChange: setExposure,
onFilamentsReady: (stripCount, vertexCount) =>
  setFilamentCounts({ stripCount, vertexCount }),
```

ADD a spread of `settingsCallbacks` near the end of the options block:
```ts
const handle = createEngine(canvas, {
  // ── engine session callbacks (kept inline this task; extracted in Task 5) ──
  onStatusChange: setStatus,
  onHoverChange: setHovered,
  onSelectChange: setSelected,
  onFocusChange: setFocused,
  onScaleChange: setScale,
  onCloudReady: (source, count) =>
    setSourceCounts((prev) => ({ ...prev, [source]: count })),
  onFpsChange: setFps,
  onSpaceMouseConnectedChange: setSpaceMouseConnected,
  initialTier: currentTier,
  onTierChange: setCurrentTier,
  onLoadProgress: setLoadProgress,
  // ── settings echoes (driven by useEngineSettings) ──
  ...settingsCallbacks,
});
```

The `useEffect` dep array at the bottom of the engine startup effect stays `[]` — `settingsCallbacks` is recreated each render but the effect already runs only once at mount, so capturing the first-render reference is correct.

NOTE — eslint-react-hooks may flag this. If so, add `// eslint-disable-next-line react-hooks/exhaustive-deps` directly above the closing `}, []);` line, with a comment explaining the engine is a one-shot effect.

- [ ] **Step 4: Update SettingsPanel JSX to use destructured settings**

The existing JSX block (around lines 727–868) already references `pointSize`, `brightness`, etc. by name. Because the destructuring above puts those names back in scope, no JSX changes are needed.

Where the SettingsPanel onChange handler used to call a now-missing setter directly — `setFilamentsEnabled`, `setFilamentIntensity`, `setExposure` — the destructuring exposes them again, so the existing handlers still compile:

```tsx
onFilamentsChange={(enabled) => {
  setFilamentsEnabled(enabled);
  handleRef.current?.setFilamentsEnabled?.(enabled);
}}
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests pass.

Common typecheck failures and fixes:
- "Cannot find name 'setFilamentCounts'" — that setter is now internal to the hook; uses of it should have been removed when deleting the useState. Re-check Step 2.
- "DEFAULT_X is unused" — remove the import.
- "Property 'pointSize' does not exist" — destructuring missed it; re-check Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useEngineSettings.ts src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useEngineSettings hook

Move ~17 settings useStates and their EngineCallbacks echo slice into a
single hook.  App.tsx now spreads settingsCallbacks into createEngine.
The three App-owned setters (filaments enabled / intensity, exposure)
are returned from the hook for SettingsPanel onChange wiring.  Pure
relocation, no behavior change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: useEngine

**Files:**
- Create: `src/hooks/useEngine.ts`
- Modify: `src/components/App/App.tsx` (remove engine startup `useEffect`, refs, and engine-session useStates; replace with `useEngine(...)`)

**Scope:** Owns the engine lifecycle. Takes `extraCallbacks` (which App passes as `settingsCallbacks` from Task 4) so `useEngineSettings`'s echoes still reach the engine. Returns `canvasRef`, `handleRef`, and the engine-driven state slices.

- [ ] **Step 1: Create the hook**

Create `src/hooks/useEngine.ts`:

```ts
/**
 * `useEngine` — owns the WebGPU engine lifecycle and the React state
 * slices the engine itself drives.
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook owns
 * ──────────────────────────────────────────────────────────────────────
 *   - `canvasRef` — the DOM node the engine takes over.  React's only
 *     job is to render the `<canvas>` element with this ref attached;
 *     the engine sets up its own WebGPU context against it.
 *   - `handleRef` — the `EngineHandle` returned by `createEngine`,
 *     stored in a ref so other hooks (useFocusUrlSync, useAliasIndex,
 *     useKeyboardShortcuts) can call methods on it without dependency
 *     gymnastics.
 *   - Engine-driven state: status, hovered, selected, focused, scale,
 *     fps, sourceCounts, loadProgress, currentTier.  Each is fed by an
 *     engine callback that fires only when the value changes, so
 *     direct `setX` wiring is safe (no spurious re-renders).
 *
 * ──────────────────────────────────────────────────────────────────────
 * What this hook does NOT own
 * ──────────────────────────────────────────────────────────────────────
 * Settings echoes (point size, brightness, etc.) live in
 * `useEngineSettings`.  The caller passes that hook's
 * `engineCallbacks` slice in via `extraCallbacks`, and we spread it
 * into the createEngine options block alongside our session callbacks.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why empty `useEffect` deps?
 * ──────────────────────────────────────────────────────────────────────
 * Same rationale as the original App.tsx engine effect: the engine is
 * a one-shot side effect tied to the canvas's lifetime.  No inputs
 * should cause it to restart.  `extraCallbacks` is captured at first
 * render and held for the life of the engine — this is intentional
 * because the engine's echo callbacks are setState references, which
 * are stable for the component's lifetime.  Listing extraCallbacks in
 * the dep array would re-create the engine on every render.
 */

import { useEffect, useRef, useState } from 'react';
import { createEngine } from '../services/engine';
import type {
  EngineHandle,
  EngineStatus,
  PointInfo,
  ScaleInfo,
} from '../@types';
import type {
  EngineCallbacks,
  LoadProgressState,
} from '../@types/EngineCallbacks';
import type { Tier } from '../@types/Tier';
import { initialTierFromViewport } from '../utils/initialTierFromViewport';
import type { Source } from '../data/sources';

/**
 * Initial scale-bar value that renders something sensible before the
 * engine fires its first `onScaleChange`.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

export type UseEngineInput = {
  /**
   * Extra callbacks to layer onto the engine's options block.  In
   * practice this is the `engineCallbacks` slice from
   * `useEngineSettings` — settings echoes that drive React-side
   * SettingsPanel state.  Captured at first render; do not expect
   * subsequent changes to take effect.
   */
  extraCallbacks?: Partial<EngineCallbacks>;
};

export type UseEngineReturn = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleRef: React.RefObject<EngineHandle | null>;
  status: EngineStatus;
  hovered: PointInfo | null;
  selected: PointInfo | null;
  focused: PointInfo | null;
  scale: ScaleInfo;
  fps: number;
  sourceCounts: Partial<Record<Source, number>>;
  loadProgress: LoadProgressState | null;
  currentTier: Tier;
};

export function useEngine(input: UseEngineInput = {}): UseEngineReturn {
  const { extraCallbacks } = input;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleRef = useRef<EngineHandle | null>(null);

  const [status, setStatus] = useState<EngineStatus>({ kind: 'initializing' });
  const [hovered, setHovered] = useState<PointInfo | null>(null);
  const [selected, setSelected] = useState<PointInfo | null>(null);
  const [focused, setFocused] = useState<PointInfo | null>(null);
  const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);
  const [fps, setFps] = useState<number>(0);
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<Source, number>>>({});
  const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
  // Lazy-init from viewport — `window` is guarded for SSR / unit-test
  // hosts.  Echoed by the engine via `onTierChange`, so this state
  // mirrors engine truth after the first user-driven swap too.
  const [currentTier, setCurrentTier] = useState<Tier>(() =>
    typeof window !== 'undefined'
      ? initialTierFromViewport(window.innerWidth)
      : 'medium',
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handle = createEngine(canvas, {
      onStatusChange: setStatus,
      onHoverChange: setHovered,
      onSelectChange: setSelected,
      onFocusChange: setFocused,
      onScaleChange: setScale,
      onCloudReady: (source, count) =>
        setSourceCounts((prev) => ({ ...prev, [source]: count })),
      onFpsChange: setFps,
      initialTier: currentTier,
      onTierChange: setCurrentTier,
      onLoadProgress: setLoadProgress,
      ...extraCallbacks,
    });

    handleRef.current = handle;

    return () => {
      handle.destroy();
      handleRef.current = null;
    };
    // Engine is a one-shot effect — see hook header for rationale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    canvasRef,
    handleRef,
    status,
    hovered,
    selected,
    focused,
    scale,
    fps,
    sourceCounts,
    loadProgress,
    currentTier,
  };
}
```

- [ ] **Step 2: Wire into App.tsx**

Add the import:
```ts
import { useEngine } from '../../hooks/useEngine';
```

Remove these imports that are now consumed inside `useEngine`:
```ts
import { createEngine } from '../../services/engine';
import { initialTierFromViewport } from '../../utils/initialTierFromViewport';
import type { LoadProgressState } from '../../@types/EngineCallbacks';
```

Keep type imports App still uses (`EngineHandle`, `EngineStatus`, `PointInfo`, `ScaleInfo`, `LodMode`, `Tier`).

Remove the `INITIAL_SCALE` module constant (now inside the hook).

Remove these refs and useStates from App.tsx:
```ts
const canvasRef = useRef<HTMLCanvasElement>(null);
const handleRef = useRef<EngineHandle | null>(null);
const [status, setStatus] = useState<EngineStatus>({ kind: 'initializing' });
const [hovered, setHovered] = useState<PointInfo | null>(null);
const [selected, setSelected] = useState<PointInfo | null>(null);
const [focused, setFocused] = useState<PointInfo | null>(null);
const [scale, setScale] = useState<ScaleInfo>(INITIAL_SCALE);
const [fps, setFps] = useState<number>(0);
const [sourceCounts, setSourceCounts] = useState<Partial<Record<Source, number>>>({});
const [loadProgress, setLoadProgress] = useState<LoadProgressState | null>(null);
const [currentTier, setCurrentTier] = useState<Tier>(() =>
  typeof window !== 'undefined' ? initialTierFromViewport(window.innerWidth) : 'medium',
);
```

Remove the entire engine startup `useEffect` (currently around lines 397–507).

Add a hook call as the FIRST hook call in the component body (since other hooks depend on it):
```ts
// ── Engine lifecycle + engine-driven state ─────────────────────────────────
const {
  canvasRef,
  handleRef,
  status,
  hovered,
  selected,
  focused,
  scale,
  fps,
  sourceCounts,
  loadProgress,
  currentTier,
} = useEngine({ extraCallbacks: settingsCallbacks });
```

NOTE — `settingsCallbacks` must be declared BEFORE `useEngine`. So the order becomes:
1. `const { settings, engineCallbacks: settingsCallbacks, ... } = useEngineSettings();`
2. `const { canvasRef, handleRef, status, ... } = useEngine({ extraCallbacks: settingsCallbacks });`
3. `const { famousMeta, famousXrefs } = useFamousMeta();`
4. `const { aliasIndex, aliasMap } = useAliasIndex({ paletteOpen, sourceCounts, engineHandleRef: handleRef });`
5. `const { pendingTarget } = useFocusUrlSync({ ... });`
6. `useKeyboardShortcuts({ selected, paletteOpen, engineHandleRef: handleRef, onOpenPalette: () => setPaletteOpen(true) });`

(Settings declared first because it has no dependencies; engine consumes its callbacks; the rest consume the engine handle.)

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean, all tests pass.

Common typecheck failures:
- "Cannot find name 'setSpaceMouseConnected'" — that state is still in App at this stage; it will be deleted in Task 6. For now, keep the App-side useState for it AND keep `onSpaceMouseConnectedChange: setSpaceMouseConnected` inline in extraCallbacks, OR add it to `useEngineSettings.engineCallbacks` temporarily. Cleaner: keep the SpaceMouse state inline in App through this task; Task 6 deletes it.

Specifically, in Task 5, retain in App.tsx:
```ts
const [spaceMouseConnected, setSpaceMouseConnected] = useState<boolean>(false);
const [spaceMouseSensitivity, setSpaceMouseSensitivity] = useState<number>(
  DEFAULT_SPACE_MOUSE_SENSITIVITY,
);
```
…and merge `onSpaceMouseConnectedChange` into the `extraCallbacks` argument when calling `useEngine`:
```ts
const extraEngineCallbacks: Partial<EngineCallbacks> = {
  ...settingsCallbacks,
  onSpaceMouseConnectedChange: setSpaceMouseConnected,
};
const { canvasRef, handleRef, status, ... } = useEngine({
  extraCallbacks: extraEngineCallbacks,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useEngine.ts src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
refactor: extract useEngine hook for engine lifecycle + session state

Move createEngine startup, canvasRef, handleRef, and engine-driven
state (status, hovered, selected, focused, scale, fps, sourceCounts,
loadProgress, currentTier) out of App.tsx into a dedicated hook.
useEngine accepts extraCallbacks so useEngineSettings can layer in
its echo callbacks.  Pure relocation, no behavior change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Cleanup — delete dead SpaceMouse state, hoist mount-time constants

**Files:**
- Modify: `src/components/App/App.tsx`

The SpaceMouse panel section is gated off (`spaceMouseSupported={false}` in the JSX). The `spaceMouseConnected` state is written by the engine echo but never read; `spaceMouseSensitivity` is never read or written from outside its own setter. Both should be deleted along with the `isWebHIDSupported` import (also unused). Same audit pass: `initialMobile` / `initialPanelsOpen` are computed every render even though they are mount-time constants — wrap in a `useState(() => …)` initializer for clarity.

- [ ] **Step 1: Delete dead SpaceMouse state**

In `src/components/App/App.tsx`, remove:
```ts
const [spaceMouseConnected, setSpaceMouseConnected] = useState<boolean>(false);
const [spaceMouseSensitivity, setSpaceMouseSensitivity] = useState<number>(
  DEFAULT_SPACE_MOUSE_SENSITIVITY,
);
```
…and the comment block above them.

Remove the `onSpaceMouseConnectedChange: setSpaceMouseConnected` entry from the `extraEngineCallbacks` block (added in Task 5 Step 3).

If after this `extraEngineCallbacks` is just `settingsCallbacks` with no additions, simplify to:
```ts
const { canvasRef, handleRef, status, ... } = useEngine({
  extraCallbacks: settingsCallbacks,
});
```

Remove these unused imports:
```ts
import { isWebHIDSupported } from '../../services/input/spaceMouse';
import { DEFAULT_SPACE_MOUSE_SENSITIVITY } from '../../data/defaults'; // if still imported
```

- [ ] **Step 2: Hoist initialMobile / initialPanelsOpen to a stable initializer**

Replace:
```ts
const initialMobile =
  typeof window !== 'undefined' ? window.innerWidth < 768 : false;
const initialPanelsOpen = !initialMobile;
```

With:
```ts
// Mount-time, never re-evaluated — re-orienting a phone mid-session
// shouldn't yank the user's expanded panels back closed under them.
const [initialMobile] = useState<boolean>(() =>
  typeof window !== 'undefined' ? window.innerWidth < 768 : false,
);
const initialPanelsOpen = !initialMobile;
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: typecheck clean (no unused-import warnings), all tests pass.

- [ ] **Step 4: Visual smoke test (manual)**

The dev server should already be running per project convention. If it isn't:
```bash
npm run dev
```

In the browser:
- Confirm the canvas renders.
- Confirm Cmd+K opens the palette.
- Pin a galaxy via click; confirm InfoCard appears.
- Hit `f` while pinned; confirm camera tweens to focus.
- Hit `h`; confirm camera returns to home.
- Toggle a SettingsPanel slider (e.g. point size); confirm immediate visual change.
- Reload with `#focus=m81` in URL; confirm camera lands on M81.

If any of those break, the regression is in this task or an earlier one.

- [ ] **Step 5: Commit**

```bash
git add src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
chore: drop dead SpaceMouse state, hoist initialMobile

The SpaceMouse panel section was gated off long ago; its connected /
sensitivity useStates were write-only.  isWebHIDSupported import was
unused.  initialMobile / initialPanelsOpen were re-evaluated each
render despite being mount-time constants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push branch + open PR**

```bash
git push -u origin refactor/app-hooks
gh pr create --title "Refactor App.tsx into 5 focused hooks" --body "$(cat <<'EOF'
## Summary
- Extract `useFamousMeta`, `useAliasIndex` (+ pure `buildAliasIndex` helper), `useKeyboardShortcuts`, `useEngineSettings`, `useEngine` from App.tsx.
- App.tsx drops from ~909 lines to ~300 lines of hook calls + JSX wiring.
- Delete dead SpaceMouse state (`spaceMouseConnected` / `spaceMouseSensitivity` were write-only) and unused `isWebHIDSupported` import.
- Hoist `initialMobile` to a `useState` initializer so it isn't recomputed every render.

No behavior change.  All existing tests pass; 5 new tests added for the pure `buildAliasIndex` helper.

## Test plan
- [x] `npm run typecheck` clean
- [x] `npm test` green
- [ ] Visual: canvas renders, Cmd+K opens palette, click pin works, `f` focuses, `h` home, settings sliders apply, deep-link `#focus=m81` lands on M81.
EOF
)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Hook 1 — useFamousMeta — Task 1
- ✅ Hook 2 — useAliasIndex (+ buildAliasIndex helper) — Task 2
- ✅ Hook 3 — useKeyboardShortcuts — Task 3
- ✅ Hook 4 — useEngineSettings — Task 4
- ✅ Hook 5 — useEngine — Task 5
- ✅ Cleanup — Task 6

**Type consistency check:**
- `EngineSettingsCallbacks` is `Pick<EngineCallbacks, ...>` so the `engineCallbacks` field returned from `useEngineSettings` is type-compatible with the spread into `createEngine`. ✓
- `useEngine`'s `extraCallbacks` is `Partial<EngineCallbacks>`, which accepts both `EngineSettingsCallbacks` (a Pick) and a merged `{ ...settingsCallbacks, onSpaceMouseConnectedChange }` literal. ✓
- `handleRef` shape is `RefObject<EngineHandle | null>`, matching what `useFocusUrlSync` and `useAliasIndex` already accept. ✓
- `aliasMap` is `ReadonlyMap<bigint, readonly string[]>` end-to-end (hook return matches `useFocusUrlSync` input). ✓

**Placeholder scan:** No `TBD`, no "implement later", no "similar to Task N" — every step has either complete code or exact import / removal instructions.

**Order risk check:** Task 4 (useEngineSettings) introduces `settingsCallbacks` as a name that Task 5 then consumes. If Task 5 runs before Task 4 in subagent dispatch, the wiring won't exist. The plan's task order is the dispatch order — subagent-driven-development executes top to bottom. ✓

**Hidden coupling:** `useFocusUrlSync` already exists and takes `engineHandleRef: handleRef`. After Task 5 it consumes `handleRef` returned from `useEngine` — same shape, no change to the hook itself. ✓

Plan is ready.
