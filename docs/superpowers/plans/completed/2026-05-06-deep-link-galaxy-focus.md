# Deep-Link Galaxy Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user focuses a galaxy, the URL hash updates to a stable, shareable identifier; visiting such a URL navigates the camera + selection to that galaxy after the necessary data has loaded. Users can paste a link in chat and have the recipient land on the same view.

**Architecture:** A pure id ↔ hash codec module (`focusUrl.ts`), a single React hook (`useFocusUrlSync`) that App.tsx mounts to keep the URL in step with selection state and drain a pending-focus target on load, and a small banner component for the "this galaxy is in a tier you don't have loaded" affordance. The engine gains no new public methods — deep-link resolution funnels into the existing `selectByAlias({ source, localIdx })` path that the in-flight NGC-search PR is adding. Selection state stays in `App.tsx` where the InfoCard already reads it.

**Tech Stack:** TypeScript, React (existing project setup). No new dependencies.

**Dependency on prior work:** This plan assumes the NGC-search PR (branch `feat/ngc-search`) is merged. That PR introduces `engine.selectByAlias`, the alias-index join over GLADE/2MRS PGCs, and the lazy-loaded `pgc_aliases.json` sidecar — all of which deep-link resolution piggybacks on. Do NOT start this plan while `feat/ngc-search` is still open.

---

## Decisions (locked — do not relitigate)

1. **URL form:** `#focus=<id>`. Hash, not query — pure-frontend, no Workers Assets routing changes needed. `replaceState` on selection change (not `pushState`) — back-button shouldn't navigate through every clicked galaxy.

2. **Identifier scheme** (priority order):
   - Famous → `<seed-id>` (e.g. `m31`, `c101`).
   - Any source with PGC > 0 → `pgc-<n>` (e.g. `pgc-2789`).
   - SDSS without famous mapping → `sdss-<objID>` (objID is bigint, base-10 in URL).
   - Fallback for 2MRS/GLADE with no PGC → `pos@<ra>,<dec>` where ra/dec are 4-decimal degrees (≈0.4″ — enough to disambiguate any two galaxies).
   - Synthetic source: not deep-linkable. URL hash is cleared when a synthetic galaxy is selected.

3. **Tier-coupling behavior:** Option B from the design discussion. If the deep-linked galaxy isn't resolvable in the currently-loaded tier set, show a non-blocking banner ("This galaxy is in the GLADE Large tier. [Load it]") rather than auto-upgrading. The user clicks to opt in.

4. **Selection vs. focus:** Treated as one concept. Deep links reproduce selection state. The camera follows because the galaxy was selected, not as a separate URL field.

5. **State location:** Selection lives in `App.tsx` (already does, via `selectedInfo: PointInfo | null` driving the InfoCard). URL sync is a side effect of that state. The codec is pure (testable in isolation); the hook is the React adapter.

---

## File Structure

- **Create:** `src/services/url/focusUrl.ts` — pure codec. `selectionToFocusId(info: PointInfo): string | null` and `parseFocusHash(hash: string): FocusTarget | null`.
- **Create:** `src/hooks/useFocusUrlSync.ts` — React hook. Reads/writes `location.hash` based on selection; surfaces a `pendingTarget` value while a deep link is unresolved.
- **Create:** `src/services/engine/resolveFocusTarget.ts` — given a `FocusTarget` and the engine's loaded clouds + alias map, returns `{ resolved: true, source, localIdx } | { resolved: false, reason: 'tier' | 'unknown' }`.
- **Create:** `src/components/DeepLinkBanner/DeepLinkBanner.tsx` (+ `.module.css`) — the "load larger tier" affordance.
- **Modify:** `src/App.tsx` — mount the hook + banner; on mount parse hash, then drain pending after clouds settle.
- **Modify:** `src/@types/PointInfo.d.ts` — if necessary to expose source/localIdx for id derivation (likely already there post-NGC-PR — verify before changing).
- **Modify:** `src/services/engine/cloudLoader.ts` — only if a "tier loaded" event isn't already exposed; otherwise reuse what exists.
- **Test:** `tests/services/url/focusUrl.test.ts`, `tests/services/engine/resolveFocusTarget.test.ts`, `tests/hooks/useFocusUrlSync.test.tsx`, `tests/components/DeepLinkBanner/DeepLinkBanner.test.tsx`.

---

### Task 1: Pure URL codec

**Files:**
- Create: `src/services/url/focusUrl.ts`
- Test: `tests/services/url/focusUrl.test.ts`

- [ ] **Step 1: Write the failing test** for `selectionToFocusId`

```ts
// tests/services/url/focusUrl.test.ts
import { describe, it, expect } from 'vitest';
import { selectionToFocusId, parseFocusHash } from '../../../src/services/url/focusUrl';
import { Source } from '../../../src/data/sources';
import type { PointInfo } from '../../../src/@types';

const baseInfo = (overrides: Partial<PointInfo>): PointInfo => ({
  source: Source.Glade, localIdx: 0, globalIdx: 0,
  ra: 10.123, dec: -5.456, x: 0, y: 0, z: 0,
  diameterKpc: 30, displayName: 'X', catalogUrl: null,
  iauName: 'X', objID: 0n, magG: 18, ...overrides,
} as PointInfo);

describe('selectionToFocusId', () => {
  it('returns famous id when present', () => {
    expect(selectionToFocusId(baseInfo({ source: Source.Famous, famousId: 'm31' } as never))).toBe('m31');
  });
  it('returns pgc-<n> when objID > 0', () => {
    expect(selectionToFocusId(baseInfo({ source: Source.Glade, objID: 2789n }))).toBe('pgc-2789');
  });
  it('returns sdss-<n> for SDSS with objID', () => {
    expect(selectionToFocusId(baseInfo({ source: Source.SDSS, objID: 1237665128253423687n }))).toBe('sdss-1237665128253423687');
  });
  it('falls back to pos@ra,dec at 4 decimals', () => {
    expect(selectionToFocusId(baseInfo({ source: Source.TwoMRS, objID: 0n, ra: 10.1234567, dec: -5.4567 }))).toBe('pos@10.1235,-5.4567');
  });
  it('returns null for synthetic', () => {
    expect(selectionToFocusId(baseInfo({ source: Source.Synthetic }))).toBeNull();
  });
});

describe('parseFocusHash', () => {
  it('parses famous id', () => {
    expect(parseFocusHash('#focus=m31')).toEqual({ kind: 'famous', id: 'm31' });
  });
  it('parses pgc id', () => {
    expect(parseFocusHash('#focus=pgc-2789')).toEqual({ kind: 'pgc', pgc: 2789n });
  });
  it('parses sdss id (bigint)', () => {
    expect(parseFocusHash('#focus=sdss-1237665128253423687')).toEqual({ kind: 'sdss', objID: 1237665128253423687n });
  });
  it('parses pos id', () => {
    expect(parseFocusHash('#focus=pos@10.1235,-5.4567')).toEqual({ kind: 'pos', raDeg: 10.1235, decDeg: -5.4567 });
  });
  it('returns null for unrecognised hash', () => {
    expect(parseFocusHash('#bogus')).toBeNull();
    expect(parseFocusHash('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify failures**

Run: `npx vitest run tests/services/url/focusUrl.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `focusUrl.ts`**

```ts
// src/services/url/focusUrl.ts

/**
 * Codec for the `#focus=<id>` URL hash that makes a galaxy selection
 * shareable.  Pure functions only — no DOM access, no React, no engine
 * coupling — so the codec is testable in isolation and reusable from
 * both the client mount path and tooling/tests.
 *
 * The id formats mirror the priority ladder used elsewhere in the
 * project for "what name does this galaxy go by":
 *
 *   m31              — famous-catalog seed id
 *   pgc-2789         — any source with a PGC number we trust
 *   sdss-<objID>     — SDSS row whose objID is the canonical handle
 *   pos@<ra>,<dec>   — fallback for 2MRS/GLADE rows without a PGC
 *
 * 4-decimal RA/Dec gives ≈ 0.4 arcsec — fine enough that two galaxies
 * never collide in the fallback bucket.  Synthetic-source rows are
 * intentionally not link-encodable: their globalIdx isn't durable
 * across tooling regenerations.
 */

import type { PointInfo } from '../../@types';
import { Source } from '../../data/sources';

export type FocusTarget =
  | { kind: 'famous'; id: string }
  | { kind: 'pgc'; pgc: bigint }
  | { kind: 'sdss'; objID: bigint }
  | { kind: 'pos'; raDeg: number; decDeg: number };

export function selectionToFocusId(info: PointInfo): string | null {
  if (info.source === Source.Synthetic) return null;
  // Famous wins — the human-readable seed id is what users will share.
  // The NGC-search PR added `famousId` to PointInfo via famousMeta lookup.
  if ((info as PointInfo & { famousId?: string }).famousId) {
    return (info as PointInfo & { famousId?: string }).famousId!;
  }
  if (info.objID > 0n) {
    return info.source === Source.SDSS ? `sdss-${info.objID}` : `pgc-${info.objID}`;
  }
  return `pos@${info.raDeg.toFixed(4)},${info.decDeg.toFixed(4)}`;
}

const POS_RE = /^pos@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/;

export function parseFocusHash(hash: string): FocusTarget | null {
  if (!hash || hash.length < 2) return null;
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
  const eq = trimmed.indexOf('=');
  if (eq < 0 || trimmed.slice(0, eq) !== 'focus') return null;
  const raw = decodeURIComponent(trimmed.slice(eq + 1));

  if (raw.startsWith('pgc-')) {
    const n = raw.slice(4);
    if (!/^\d+$/.test(n)) return null;
    return { kind: 'pgc', pgc: BigInt(n) };
  }
  if (raw.startsWith('sdss-')) {
    const n = raw.slice(5);
    if (!/^\d+$/.test(n)) return null;
    return { kind: 'sdss', objID: BigInt(n) };
  }
  const m = POS_RE.exec(raw);
  if (m) return { kind: 'pos', raDeg: parseFloat(m[1]!), decDeg: parseFloat(m[2]!) };

  // Anything else: treat as a famous-id token.  Famous ids in seed JSON
  // use lowercase letters + digits; anything matching that regex is a
  // safe candidate.  The resolver will reject if the id doesn't exist.
  if (/^[a-z0-9_-]+$/i.test(raw)) return { kind: 'famous', id: raw };
  return null;
}
```

Note about `info.raDeg`/`info.decDeg`: the existing `PointInfo` type uses `ra` / `dec` (no Deg suffix). Keep consistent with the repo — probe the type first and adjust the test accordingly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/url/focusUrl.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/url/focusUrl.ts tests/services/url/focusUrl.test.ts
git commit -m "$(cat <<'EOF'
feat(url): pure focus-id codec for deep-link hash

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Focus-target resolver

**Files:**
- Create: `src/services/engine/resolveFocusTarget.ts`
- Test: `tests/services/engine/resolveFocusTarget.test.ts`

The resolver takes a `FocusTarget` plus the engine's loaded data and returns either `{ resolved: true, source, localIdx }` or `{ resolved: false, reason }`.

- [ ] **Step 1: Write failing tests** covering:
  - famous-id resolves via `FamousMetaEntry[]` index
  - `pgc` resolves by walking GLADE objIDs first, then 2MRS objIDs
  - `pgc` returns `{ resolved: false, reason: 'tier' }` when the alias map says the PGC exists but the cloud doesn't have a row for it (alias-index miss but alias map hit) — flag means "user needs to load a larger tier"
  - `sdss` resolves by walking SDSS objIDs
  - `pos` resolves to nearest neighbour within 30 arcsec across all loaded clouds (reuse the same threshold the famous cross-match uses)
  - All return `{ resolved: false, reason: 'unknown' }` if no match

  Keep test fixtures tiny — synthetic 3-row clouds. No real bins.

- [ ] **Step 2: Run tests, verify they fail.**

- [ ] **Step 3: Implement `resolveFocusTarget.ts`** mirroring the test contract.

  Signature:
  ```ts
  export type ResolverInput = {
    target: FocusTarget;
    clouds: { source: Source; cloud: PointCloud }[];
    famousMeta: readonly FamousMetaEntry[];
    aliasMap: ReadonlyMap<bigint, readonly string[]>;
  };
  export type ResolverOutput =
    | { resolved: true; source: Source; localIdx: number }
    | { resolved: false; reason: 'tier' | 'unknown' };
  ```

  PGC walk: linear scan of `objIDs` BigUint64Array. 1.5M points × 5 sources is plenty fast for a one-shot lookup (it runs once on page load and once per shared link click).

- [ ] **Step 4: Run tests + typecheck.**

- [ ] **Step 5: Commit.**

---

### Task 3: `useFocusUrlSync` hook

**Files:**
- Create: `src/hooks/useFocusUrlSync.ts`
- Test: `tests/hooks/useFocusUrlSync.test.tsx`

Hook contract:
```ts
type UseFocusUrlSync = {
  selectedInfo: PointInfo | null;
};
type FocusSyncReturn = {
  pendingTarget: FocusTarget | null;
  clearPending: () => void;
};
function useFocusUrlSync({ selectedInfo }: UseFocusUrlSync): FocusSyncReturn;
```

Behavior:
- On mount: parse `window.location.hash`; if a `FocusTarget` parses, return it as `pendingTarget` and clear the hash from history (`replaceState` so reload doesn't re-fire).
- When `selectedInfo` changes: compute `selectionToFocusId(selectedInfo)`. If non-null, `replaceState` with `#focus=<id>`. If null (synthetic / cleared), `replaceState` with no hash.
- `clearPending()` resets `pendingTarget` to null. App calls this once it has dispatched the resolve.
- Listen for `hashchange` so back-button history-pop re-arms a new pending target. (Stretch — add only if straightforward.)

- [ ] **Step 1: Write failing tests** using `@testing-library/react`'s `renderHook`. Mock `window.location` and `history.replaceState`.

- [ ] **Step 2: Run tests, verify they fail.**

- [ ] **Step 3: Implement the hook.** Use `useEffect` for both directions; guard against SSR (no `window`).

- [ ] **Step 4: Run tests + typecheck.**

- [ ] **Step 5: Commit.**

---

### Task 4: App.tsx wiring

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1:** Import `useFocusUrlSync` and `resolveFocusTarget`. Call the hook with the existing `selectedInfo` state.

- [ ] **Step 2:** Add an effect that watches `pendingTarget` AND the engine's "all initial clouds loaded" signal (find the existing flag — `cloudLoader` exposes a `Promise<void>` for first-paint readiness, or App.tsx already has a `loadingPhase` state machine). When both are ready: call `resolveFocusTarget(...)`. On resolve: call `engine.selectByAlias({ source, localIdx })` then `clearPending()`. On unknown: `clearPending()` + a console warning. On tier: leave `pendingTarget` set; the banner will render.

- [ ] **Step 3:** Smoke-test in browser:
  - Open dev. Click a galaxy. URL hash updates to `#focus=…`.
  - Copy URL, open in new tab. Camera lands on the same galaxy after clouds load.
  - Use a famous galaxy (M31) and a non-famous GLADE galaxy with PGC.
  - Reload the page mid-tween — verify the URL still reflects the final selection, not an intermediate frame.

- [ ] **Step 4:** Commit.

---

### Task 5: Tier-mismatch banner

**Files:**
- Create: `src/components/DeepLinkBanner/DeepLinkBanner.tsx` + `.module.css`
- Test: `tests/components/DeepLinkBanner/DeepLinkBanner.test.tsx`

Spec:
- Renders only when `pendingTarget !== null` AND the resolver returned `{ reason: 'tier' }`.
- Compact bottom-anchored toast (matches existing UI vocab — see `StatusBar.module.css`).
- Body text: "This galaxy lives in the GLADE Large tier. Load it to see it." (Word it to match how SettingsPanel labels tiers — read the panel for the source of truth.)
- "Load larger tier" button → calls a callback that flips the user's tier-preference state to large. Once the larger cloud finishes loading the App effect re-runs the resolver and (assuming success) clears `pendingTarget`.
- Dismiss "×" → `clearPending()`.

- [ ] **Step 1: Write component tests** for the three render states (hidden when no pendingTarget, shown when reason==='tier', dismiss callback fires).
- [ ] **Step 2: Run, verify failures.**
- [ ] **Step 3: Implement component + CSS.**
- [ ] **Step 4: Wire into App.tsx alongside the hook from Task 4. Re-run resolver after tier upgrade.**
- [ ] **Step 5: Smoke-test:** start in `glade-small`, paste a link to a `glade-large`-only galaxy, see the banner, click load, see camera land on the galaxy after the bin downloads.
- [ ] **Step 6: Commit.**

---

### Task 6: PR + manual checklist

- [ ] **Step 1:** Push branch, open PR via `gh pr create`. Title: `feat(url): deep-link galaxy focus via #focus= hash`.
- [ ] **Step 2:** Body includes a manual test checklist:
  - [ ] Click famous galaxy → URL updates → reload reproduces view
  - [ ] Click GLADE-with-PGC galaxy → URL has `pgc-…` → share works
  - [ ] Click 2MRS-without-PGC galaxy → URL has `pos@…,…` → share works
  - [ ] Click synthetic galaxy → URL hash clears (synthetic isn't link-encodable)
  - [ ] Open link to galaxy not in current tier → banner appears → click load → galaxy resolves
  - [ ] Open link to invalid id → no crash, no spinner; URL hash clears silently

---

## Self-Review

- **Spec coverage:** All five locked decisions covered: hash form (Task 1), id ladder (Task 1), tier banner (Task 5), selection==focus (Task 4), state in App (Task 4 hook).
- **Type consistency:** `FocusTarget`, `ResolverOutput`, hook signature all reference each other coherently. Rename `raDeg`/`decDeg` to match `PointInfo`'s actual field names during implementation — flagged in Task 1 step 3.
- **Dependency order:** Tasks 1, 2 are pure and parallelisable; 3 depends on 1; 4 depends on 1+2+3; 5 depends on 4. Task 6 is the wrap-up.
- **No placeholders:** every step has either real code or an explicit test contract. The tier-banner copy intentionally references existing labels — implementer reads `SettingsPanel` for canonical wording.
- **Risk:** the resolver's `pos`-fallback nearest-neighbour search is naive O(N) over all clouds. Acceptable since it runs at most once per shared-link click. If profiling shows >50ms, fall back to source-by-source early exit. Not worth pre-optimising.
