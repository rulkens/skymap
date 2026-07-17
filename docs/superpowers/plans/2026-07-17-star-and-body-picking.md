# Star & Foreground-Body Picking — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> to execute this plan (fresh subagent per task + spec review + quality review). Each
> task is TDD: failing test first, verify it fails, minimal green, verify it passes,
> commit. Dispatch implementers with `run_in_background: true`; the **main thread** runs
> `npm test` / `npm run typecheck` and makes the commits (background subagents cannot run
> npm).
>
> **Plan style (OVERRIDES upstream `writing-plans`):**
> [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) —
> **contract code yes, implementation code NO.** Type signatures, WGSL struct/byte
> layouts, and test names ARE contract (reproduced here); function bodies are not — cite
> `path:line` and let the implementer write the body from the test + the current file.
>
> **Testing discipline:** [`docs/superpowers/conventions/testing.md`](../conventions/testing.md).
> Round-trip / hand-computed / independent-property assertions only. NO runtime type
> tests, NO constant restatements, NO clamp-boundary mirrors, NO mirror tests. Shader
> correctness (pick footprint, depth-tested nearest-wins, ring placement) is verified
> **visually on the dev server** per the meticulous-WGSL rule, not pretended in vitest.

**Spec:** [`docs/superpowers/specs/2026-07-17-star-and-body-picking-design.md`](../specs/2026-07-17-star-and-body-picking-design.md)
— this plan implements it faithfully; every § maps to task(s). The **prep PR (P1 + P2,
§10)** must be MERGED before Task 1 starts (see Global Constraints).

## Goal

Make Gaia catalog stars and the NEAR0 foreground bodies (Earth, planets, the ≤25 seeded
scene stars incl. the Sun) click/hover-pickable through the **existing** unified pick
spine — no parallel pipeline. Picking a star or body then composes the full selection
experience galaxies already have: an InfoCard, a selection ring at the picked position, a
deep-linkable `#focus=` URL hash, and camera focus framing.

Three stages, each independently shippable: **stars → bodies → ring/card polish** (spec
§2).

```
pick(x,y)  →  per-slab r32uint pass (drawPick per pickable layer, DEPTH-TESTED)
           →  frontmostPick (near→far CPU fold)  →  unpackPick → { sourceCode, localIdx }
           →  RESOLVE_PICK[type]  → SelectionRef   (Stage 1: 'star'; Stage 2: 'body')
           →  extractSelectionRow → SelectionRow   (self-contained display projection)
           →  buildFocusable       → FocusableTarget (StarInfo / BodyInfo view-model)
```

The two new families join NEAR0 as additional `drawPick`-bearing layers and add
resolve/extract/build arms — nothing else. `pick:near0` is already allocated + depth-tested
(the Milky-Way impostor is a NEAR0 pickable today), so NEAR0 sits in front of COSMO for
free (`pickProgram.ts:38-50`).

## Architecture

Three shared seams the two families thread through, all pre-existing:

- **The pick spine is slab-parametric + demand-driven.** `pickablesBySlab`
  (`pickProgram.ts:221`) filters `CONTENT_LAYERS` by `l.drawPick && l.enabled(state, ctx)`
  and groups by slab; a NEAR0 pickable that opts in is additive. The cross-slab occlusion
  is a pure CPU fold (`unpackPick(frontmostPick(...))`, `pickProgram.ts:286`).
- **Identity encoding is fixed.** `packSelection(code, localIdx) = (code << 27) | localIdx`
  with a `+ PICK_SENTINEL_OFFSET` bias (`selectionEncoding.ts:40,59,68`; code 31 reserved
  sentinel `:82`). Codes are append-only: `Source.GaiaStars = 24`; bodies own
  `FamousStar = 21` / `Planet = 22` / `Earth = 23`. The 27-bit localIdx (134 M) dwarfs the
  largest star tier (~12.5 M records).
- **The dispatch tables are mapped types.** `EXTRACT_ROW`, `BUILD_FOCUSABLE`,
  `focusIdOf.ENCODE` are `[K in SelectionRef['type']]` / `[K in SelectionRow['type']]`;
  after prep P2, `FocusableTargetType = FocusableTarget['type']` is derived, so the three
  `Record<FocusableTargetType, …>` tables (`DETAIL_CARD`, `URL_HASH_FOR`,
  `TARGET_IDENTITY_KEY`) widen automatically, and `refOf`'s hand-spelled `REF_OF` errors
  at its `REF_OF[target.type]` index — a new arm is a **compile error until all four are
  filled**. Tasks are ordered so the type widening and every
  compiler-forced arm land in the SAME task (typecheck stays green at every commit).

### Ground preparation

**Prep P1 + P2 (spec §10) land as their OWN PR BEFORE this plan** — this plan ASSUMES they
are merged and is written against the post-prep shape:

- **P1** turned `resolveFocusId` (was a hand-ordered if/else prefix ladder,
  `resolveFocusId.ts:61-133`) into an **ordered decoder table** `[{ matches, decode }]`
  with the greedy famous-id regex as the explicit last row. Star / body land as table
  rows before that row — ordering is data, not comment discipline.
- **P2** derived `FocusableTargetType = FocusableTarget['type']`
  (`FocusableTargetType.d.ts`). The three `Record<FocusableTargetType, …>` tables track
  the union automatically; `refOf`'s hand-spelled `REF_OF` object errors at its
  `REF_OF[target.type]` index when the union widens — so adding a `FocusableTarget` arm
  compile-errors all four until filled.

No further prep-refactor is needed: the star pick shader grows via the galaxy points-family
idiom, the pick draw-list via the exported memoised `prepareStarCut`, and
`selectionRingRenderer` is reused unchanged (already slab-agnostic + px-based).

## Tech stack

TS + React + Vitest for the CPU/plumbing seams; raw WebGPU + WESL (`?static` linker) for
the pick renderers. No new deps. Reuses the pick spine (`pickProgram.ts`,
`selectionEncoding.ts`), the star format primitives (`starCatalogFormat.ts` —
`unpackStarRecord` / `lutIndexToAbsMag` / `colorIdxToBpRp`), `mortonDecode3`,
`rebaseViewProj` + `narrowMat4`, `selectionRingRenderer`, and the galaxy points-family
pick idiom (`galaxyCatalog/points/{io,vertex,pickFragment}.wesl` + `pickRenderer.ts`).

## Global constraints (house rules — these override defaults)

- **Prep P1 + P2 MUST be merged before Task 1.** The plan will not typecheck against a
  hand-written `FocusableTargetType` or a prefix-ladder `resolveFocusId`.
- **`type` aliases, never `interface`.** One `type` per file in `src/@types/` (filename =
  type name); one exported function per file in `src/utils/`. Deep relative imports, no
  barrels. `src/data/` + renderer modules may carry several related exports (precedent
  `pointRenderer.ts`).
- **`Vec3` / `Vec2` aliases**, never raw number tuples.
- **Append-only `Source` codes** — `GaiaStars = 24`, `FamousStar = 21`, `Planet = 22`,
  `Earth = 23` already exist; never renumber; code 31 stays the reserved sentinel.
- **React components** — any new / edited `src/components/**` file goes through the
  `create-component` skill (own folder, `<Name>.tsx` + `<Name>.module.css`, single
  component per file, `function Name() {}` + `export default Name`, top-level `.root`).
- **Each pick pipeline compiles its OWN `GPUShaderModule`** — never share a compiled module
  across pipelines (the WebGPU `auto`-layout / group-equivalent trap, `points/io.wesl:29-34`).
  Every NEAR0 pick layer binds its **own** slot-0 uniform (there is no shared @group(0)
  prefix on NEAR0 — that contract is COSMO-only, `ContentLayer.d.ts:70-91`).
- **WebGPU `writeBuffer` / `submit` ordering trap** — per-draw identity must be baked into
  a per-instance attribute or written once before the draws, never a uniform mutated
  mid-frame (CLAUDE.md "things that have bitten us").
- **WESL/WGSL house rules** — `?static` imports with literal `package::` paths; **NO
  backticks inside `.wesl` comments** (parse errors — use single quotes); be meticulous,
  slow down on shaders; shader tasks carry explicit visual-verification steps (dev server
  is already running — verification = ask the user to look).
- **Didactic timeless comments** — explain *why* / *what the alternative was*; no
  dates/PR refs/history; match the multi-paragraph module-header style of the files you touch.
- **Any file move/rename** uses `npm run move-files -- <from> <to>` (ts-morph rewrites
  imports; never `git mv` + hand-edited imports). None are expected in this plan.
- **Subagent implementers** run bash sequentially, cannot use `sed`/`awk`/`grep` (use
  Read/Grep tools) and cannot run npm — the main thread verifies + commits.
- **Never `git add -A` / `git add .`** — stage specific paths. **Format only touched files**
  (`npx prettier --write <paths>`), never a repo-wide rewrite.
- **Suite stays green** at every task; the entanglement-radar task ending each stage gates
  on `npm run typecheck` (both tsconfigs) + `npm test`.

## Locked interfaces consumed (do NOT redeclare)

```ts
// src/data/starCatalog/starCatalogFormat.ts
export function unpackStarRecord(rec: Uint8Array, at: number): { offset: Vec3; absMagIdx: number; colorIdx: number };
export function lutIndexToAbsMag(i: number): number;   // 7-bit → mag (bin centre)
export function colorIdxToBpRp(i: number): number;     // 6-bit → BP−RP (bin centre)
export const RECORD_BYTES = 6;
// src/data/selectionEncoding.ts
export function packSelection(sourceCode: number, localIdx: number): number;   // (code << 27) | idx
export const PICK_SENTINEL_OFFSET = 1;
// src/utils/math/mortonDecode3.ts     mortonDecode3(code: number): Vec3
// StarCatalog world-reconstruction (starCatalogFormat.ts:15-16, StarCatalog.d.ts):
//   nodeOriginPc = gridOrigin + mortonDecode3(node.mortonIndex) · (cellEdgePc · 2^node.level)
//   worldPc      = nodeOriginPc + (offset / 1024) · (cellEdgePc · 2^node.level)
//   positionMpc  = worldPc · SCALE_UNITS.PC_TO_MPC
```

---

# Stage 1 — Stars (spec §3–§7, §9 layer creation)

Gaia leaf stars become NEAR0 pickables; picking one shows a derived-data "Field star"
card, a ring at the reconstructed position, and a `star-<index>` deep link. Independently
shippable.

## Task 1 — Derived-card math helpers (spec §6, §11)

**Files:** `src/utils/star/apparentMagnitudeFromAbs.ts` (new, one fn),
`src/utils/star/spectralClassFromBpRp.ts` (new, one fn),
`tests/utils/star/apparentMagnitudeFromAbs.test.ts` (new),
`tests/utils/star/spectralClassFromBpRp.test.ts` (new).

**Signatures:**

```ts
export function apparentMagnitudeFromAbs(absMag: number, distancePc: number): number;
// = absMag + 5 · log10(distancePc / 10)   (the standard distance modulus)
export function spectralClassFromBpRp(bpRp: number): string;
// rough O/B → A/F → G → K → M bin from BP−RP (bluer = smaller BP−RP). A THRESHOLD
// CLASSIFIER: the implementer picks the bin edges; the ordering (blue→red) is the contract.
```

- [x] Add the test `apparentMagnitudeFromAbs is the absolute magnitude at 10 pc` asserting
      `apparentMagnitudeFromAbs(5, 10) === 5` (distance modulus 0 — **hand-computed**).
- [x] Add the test `apparentMagnitudeFromAbs dims by 5 mag per decade` asserting
      `apparentMagnitudeFromAbs(5, 100)` is `10` (5·log10(10)=5 — **hand-computed**, an
      independent value, not the source formula re-run).
- [x] Add the test `spectralClassFromBpRp bins a blue star vs a red star` with a couple of
      representative **hand-chosen** BP−RP values (e.g. a very blue `−0.3` → the O/B bin, a
      Sun-like `~0.82` → the G bin, a very red `~2.5` → the M bin). Monotone-classifier
      property, not a boundary mirror.
- [x] `npx vitest run tests/utils/star/apparentMagnitudeFromAbs.test.ts tests/utils/star/spectralClassFromBpRp.test.ts`
      → both files fail (functions absent), then implement, then pass.
- [x] Commit.

## Task 2 — `resolveStarRecord` (record-index → node bsearch + reconstruction) (spec §7, §11)

**Files:** `src/services/engine/helpers/resolveStarRecord.ts` (new),
`tests/services/engine/helpers/resolveStarRecord.test.ts` (new). Reuse
`SCALE_UNITS.PC_TO_MPC`, `mortonDecode3`, `unpackStarRecord`, `lutIndexToAbsMag`,
`colorIdxToBpRp` (do NOT reimplement dequant).

**Signature + contract (the load-bearing "the pick names the right star" guard):**

```ts
export function resolveStarRecord(
  catalog: StarCatalog,
  recordIndex: number,
): { positionMpc: Vec3; absMag: number; bpRp: number } | null;
// 1. Binary-search catalog.nodes for the owning LEAF node: the node whose
//    [firstRecord, firstRecord + recordCount) contains recordIndex. Leaf records are
//    laid out first with strictly-increasing firstRecord (StarCatalog.d.ts) — pick the
//    largest firstRecord <= recordIndex, then range-check recordCount. Out of range → null.
// 2. unpackStarRecord(catalog.records, recordIndex * RECORD_BYTES) → offset/absMagIdx/colorIdx.
// 3. Reconstruct worldPc via the locked formula, positionMpc = worldPc · PC_TO_MPC (heliocentric).
// 4. absMag = lutIndexToAbsMag(absMagIdx); bpRp = colorIdxToBpRp(colorIdx).
```

- [x] Add the test `round-trips a packed leaf star's position within quantisation` — build a
      small synthetic `StarCatalog` (a handful of leaf cells across ≥2 octree levels via the
      plan-02 `buildStarOctree` fixture pattern, or a hand-authored `nodes`/`records` pair),
      pick a known leaf `recordIndex`, and assert `resolveStarRecord`'s `positionMpc` matches
      the star's **hand-computed** reconstructed position within the 10-bit cell quantisation,
      and `absMag`/`bpRp` equal the exact dequantised bin centres. Independent round-trip —
      fails on a wrong bsearch or a wrong reconstruction.
      (Executed note: the bsearch runs over the LEAF subsequence, not `catalog.nodes` — nodes
      sort by (level, morton), so leaf/aggregate firstRecord interleave; whole-table bsearch
      is provably wrong. Reviewer-adjudicated, documented in resolveStarRecord.ts.)
- [x] Add the test `returns null for an out-of-range record index` (index ≥ starCount → null).
- [x] `npx vitest run tests/services/engine/helpers/resolveStarRecord.test.ts` → fail, implement, pass.
- [x] Commit.

## Task 3 — Star refs / rows / pick / URL plumbing (engine + url, no React) (spec §7, §11)

**Files:**
`src/@types/engine/SelectionRef.d.ts` (add star arm),
`src/@types/engine/SelectionRow.d.ts` (add star arm),
`src/@types/engine/ResolveDeps.d.ts` (add `stars` accessor),
`src/services/engine/engine.ts` (fill the new `resolveDeps().stars`, near `:525`),
`src/services/engine/helpers/resolvePickTable.ts` (add `starCatalog` arm, `:21`),
`src/services/engine/helpers/extractSelectionRow.ts` (add `star` arm, `:21`),
`src/services/engine/helpers/buildFocusable.ts` (add `star` arm → **`null` for now**, `:20`),
`src/services/engine/helpers/selectionHaloTable.ts` (add `star` arm, `:40`),
`src/services/url/starFocusId.ts` (new — `STAR_FOCUS_PREFIX = 'star-'`, mirrors `bodyFocusId.ts`),
`src/services/url/focusIdOf.ts` (add `star` `ENCODE` arm, `:50`),
`src/services/url/resolveFocusId.ts` (add the `star-` decoder-table row — the P1 table),
plus the mirror tests below.

**Type additions (spec §7 verbatim):**

```ts
// SelectionRef  — tier-scoped positional index, like the galaxy ref; stale → warn+null.
| { readonly type: 'star'; readonly index: number }
// SelectionRow  — self-contained display projection (framing/card read fields directly).
//   Carries `index` (from the ref) so buildFocusable can build a StarInfo that round-trips
//   through refOf / the `star-<index>` URL — the galaxy precedent (GalaxyRow carries index).
//   NOTE: the spec §7 SelectionRow sketch omits `index`; it is added here because the pure,
//   row-only buildFocusable needs it to reconstruct the ref/URL (resolved ambiguity).
| { readonly type: 'star'; readonly index: number; readonly positionMpc: Vec3; readonly absMag: number; readonly bpRp: number }
// ResolveDeps   — the sole loaded star catalog (v1 has one starCatalog source, Gaia);
//                 reads LIVE engine state each call like the other getters.
readonly stars: { current(): StarCatalog | null };
```

`engine.ts`'s `resolveDeps()` fills `stars.current()` from
`state.gpu.starCatalogRenderer?.loadedCatalogs()` (first entry, or null pre-load).

**Arm contracts:**

```ts
// RESOLVE_PICK (resolvePickTable.ts) — keyed on SourceEntry['type'], Partial<Record>.
starCatalog: (_entry, pick) => ({ type: 'star', index: pick.localIdx }),
// EXTRACT_ROW (extractSelectionRow.ts) — keyed on SelectionRef['type'].
star: (ref, deps) => {
  const r = resolveStarRecord(deps.stars.current(), ref.index);   // null-guard the catalog
  return r ? { type: 'star', index: ref.index, positionMpc: r.positionMpc, absMag: r.absMag, bpRp: r.bpRp } : null;
},
// selectionHaloTable — keyed on SelectionRow['type']; px-based ring (§9), so a tiny/zero
// radiusMpc that the NEAR0 ring layer floors to a px minimum, position from the row.
star: (row) => ({ radiusMpc: 0, worldPos: [row.positionMpc[0], row.positionMpc[1], row.positionMpc[2]] }),
// focusIdOf ENCODE — keyed on SelectionRef['type'].
star: (ref) => `${STAR_FOCUS_PREFIX}${ref.index}`,
// resolveFocusId — one P1 decoder-table row, placed BEFORE the famous fallback row:
//   { matches: (id) => id.startsWith(STAR_FOCUS_PREFIX),
//     decode: (id) => { const n = Number(id.slice(STAR_FOCUS_PREFIX.length));
//                       return Number.isInteger(n) && n >= 0 ? { type: 'star', index: n } : null; } }
// buildFocusable — TEMPORARY null (Task 4 flips it to StarInfo; keeps this task green
//                  without widening FocusableTarget yet, exactly as the body arm is null today).
star: () => null,
```

- [x] Add the `star` arms to `SelectionRef` + `SelectionRow` + `ResolveDeps` and fill
      `engine.ts`'s `resolveDeps().stars`.
- [x] Add the compiler-forced arms: `EXTRACT_ROW.star`, `selectionHaloTable.star`,
      `focusIdOf.ENCODE.star`, `buildFocusable.star` (`null`). Add the non-forced
      `RESOLVE_PICK.starCatalog` arm and the `resolveFocusId` decoder row + `starFocusId.ts`.
      (Executed note: `focusFraming.ts`'s exhaustive switch was also compiler-forced — a
      placeholder star framing via bodyFocusDistance + NOMINAL_STAR_RADIUS_KM landed there,
      marked for Task 4 refinement. Reviewer-adjudicated sound.)
- [x] Add the test `RESOLVE_PICK starCatalog maps a pick to a star ref` — a
      `{ sourceCode: Source.GaiaStars, localIdx: 42 }` pick resolves to
      `{ type: 'star', index: 42 }`.
- [x] Add the test `resolveFocusId round-trips star-<index> and beats the famous fallback` —
      `resolveFocusId('star-42', deps)` → `{ type: 'star', index: 42 }` (asserting it does NOT
      fall through to the famous scan for a `star-…` token), and `focusIdOf({type:'star',index:42})`
      → `'star-42'` (encode↔decode round-trip).
- [x] Add the test `EXTRACT_ROW star resolves against the loaded catalog` — a `deps.stars`
      stub returning a synthetic catalog; `EXTRACT_ROW.star({type:'star',index:k}, deps)`
      yields the row `resolveStarRecord` produces; a null catalog → null.
- [x] `npx vitest run tests/services/engine/helpers/resolvePickTable.test.ts tests/services/engine/helpers/extractSelectionRow.test.ts tests/services/url/resolveFocusId.test.ts`
      (create/extend the mirror files) → fail, implement, pass. `npm run typecheck` → green.
- [x] Commit.

## Task 4 — `StarInfo` focusable + cards + fill the four focusable tables (spec §6, §7)

**Files:**
`src/@types/engine/StarInfo.d.ts` (new type),
`src/@types/engine/FocusableTarget.d.ts` (add `StarInfo` to the union),
`src/services/engine/helpers/buildFocusable.ts` (flip `star` arm → real `StarInfo`),
`src/services/engine/helpers/refOf.ts` (add `star` arm),
`src/hooks/urlHashFor.ts` (add `star` arm),
`src/services/engine/helpers/targetIdentityKey.ts` (add `star` arm),
`src/components/InfoCard/detailCardTable.ts` (add `star` row),
`src/components/InfoCard/StarDetailCard/StarDetailCard.{tsx,module.css}` (new — via `create-component`),
`src/components/InfoCard/CompactStarCard/CompactStarCard.{tsx,module.css}` (new — via `create-component`),
plus mirror tests.

**`StarInfo` shape (parallel to `MilkyWayInfo` — a self-derived card view-model, §6):**

```ts
export type StarInfo = {
  readonly type: 'star';                 // union tag every FocusableTarget table keys on
  readonly index: number;                // the ref index (for refOf / URL round-trip)
  readonly displayName: string;          // 'Field star' — SKST v1 carries no identity (§6)
  readonly x: number; readonly y: number; readonly z: number;   // heliocentric Mpc, for framing
  readonly distancePc: number;           // length(positionMpc) → pc
  readonly absMag: number;
  readonly apparentMag: number;          // apparentMagnitudeFromAbs(absMag, distancePc)  (Task 1)
  readonly bpRp: number;
  readonly spectralClass: string;        // spectralClassFromBpRp(bpRp)  (Task 1)
};
```

**Forced arms (P2 makes each a compile error until filled):**

```ts
// buildFocusable.star(row) → StarInfo: derive distancePc/apparentMag/spectralClass via Task 1.
// refOf.star(t: StarInfo) → { type: 'star', index: t.index }
// urlHashFor.star(t) → t.type === 'star' ? `${STAR_FOCUS_PREFIX}${t.index}` : null
// targetIdentityKey.star(t) → t.type === 'star' ? `star:${t.index}` : ''
// detailCardTable.star → { Detail: StarDetailCard, Compact: CompactStarCard }  (bare card, no wrapper)
```

`StarDetailCard` renders the derived rows (title "Field star", distance in pc, absolute +
apparent magnitude, BP−RP, spectral class); `CompactStarCard` is the hover-preview twin
(title + distance + class). Both follow the existing galaxy/structure card structure and
the create-component conventions.

- [x] `create-component` for `StarDetailCard` + `CompactStarCard` (props `{ target: StarInfo }`
      / `{ info: StarInfo }` matching the existing card prop shape).
      _Executed note: the #444 (famous stars) merge subsequently renamed this task's
      artifacts to `FieldStarInfo` / `FieldStarDetailCard` / `CompactFieldStarCard` —
      main's famous-star `body` arm owns the `StarInfo` / `StarDetailCard` names._
- [x] Add `StarInfo.d.ts`; widen `FocusableTarget`. Fill `buildFocusable.star` (real),
      `refOf.star`, `urlHashFor.star`, `targetIdentityKey.star`, `detailCardTable.star`.
- [x] Add the test `buildFocusable star builds a StarInfo with derived fields` — a
      `{type:'star', positionMpc, absMag, bpRp}` row → a `StarInfo` whose `distancePc`,
      `apparentMag`, `spectralClass` match the Task-1 helpers on **hand-chosen** inputs
      (e.g. a 10-pc star has `apparentMag === absMag`). One targeted assertion per field —
      not a whole-object snapshot.
- [x] `npx vitest run tests/services/engine/helpers/buildFocusable.test.ts` → fail, implement, pass.
      `npm run typecheck` (both tsconfigs) → green (all four focusable tables filled).
- [x] Commit.

## Task 5 — NEAR0 selection-ring layer (spec §9)

**Files:** `src/services/engine/frame/passes/near0SelectionRingLayer.ts` (new — thin sibling
of `selectionRingLayer.ts`), `src/services/engine/frame/passes/index.ts` (register it in the
swap group, near `selectionRingLayer` `:222`),
`tests/services/engine/frame/passes/near0SelectionRingLayer.test.ts` (new — the pure `enabled`
gate only; the draw is visually verified).

**Contract:** a `ContentLayer` with `slab: NEAR0, target: 'swap', blend: 'over'`, reusing the
existing `state.gpu.selectionRingRenderer` **unchanged**. It gates on + sizes from the same
`selectionHalo` table (now with the star arm), and does the f64 rebase the other NEAR0 layers
do — `narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))` for the vp and a
**camera-relative** `worldPos − view.camPos` for the ring centre (the COSMO sibling passes an
absolute position + `view.vp`; NEAR0 passes the rebased pair — the renderer is unchanged).
`ringRadiusPx` comes from `selectionRingRadiusPx` with the star's tiny `radiusMpc` floored to
the px minimum (`selectionRingLayer.ts:64-69` idiom).

The COSMO `selectionRingLayer` gates its own kinds via `selectionHalo(row) !== null`; this
sibling gates the SAME way but is the layer that actually shows the star ring (a NEAR0-slab
concern). Two thin layers over one renderer is acceptable; a **third** slab flavour would be
the consolidation trigger (spec §10 "Adjacent").

> **Executed deviation (user-adjudicated):** the identical-gate design above is a
> writeBuffer/submit race — both layers share the one renderer's uniform buffers, all
> `writeBuffer`s land before the frame's single `submit`, so both draws read the last
> (NEAR0) write and the COSMO galaxy/Milky-Way halo vanishes. Fixed by **slab-tagged
> halo gating**: each `selectionHalo` arm declares its slab (`star` → NEAR0,
> `galaxyCatalog`/`milkyWay` → COSMO) and each layer draws only its own slab's halos —
> exactly one uniform writer per frame. Stage 2 body halo arms must carry the NEAR0 tag.

- [x] Add `near0SelectionRingLayer` with a didactic docblock (why a NEAR0 sibling; the f64
      rebase + camera-relative ring centre; renderer reused unchanged). Register it in
      `CONTENT_LAYERS`.
- [x] Add the test `enabled only when the selected row yields a NEAR0 halo` — a star row
      makes `enabled` true (renderer present); a null row / structure row makes it false.
      Behavioural gate check, mirroring the COSMO ring layer's gate.
      _Executed: plus a slab-exclusivity table test — never both layers enabled for any row kind._
- [x] `npx vitest run tests/services/engine/frame/passes/near0SelectionRingLayer.test.ts` → fail, implement, pass.
- [x] Commit.

## Task 6 — Star pick shaders + `starCatalogPickRenderer` (spec §5)

**Files:**
`src/services/gpu/shaders/starCatalog/io.wesl` (add `pickPass` + `VSOut.recordIdx`),
`src/services/gpu/shaders/starCatalog/vertex.wesl` (populate `recordIdx`; ~3 px pick clamp),
`src/services/gpu/shaders/starCatalog/pickFragment.wesl` (new),
`src/services/gpu/renderers/starCatalog/starCatalogPickRenderer.ts` (new),
`src/@types/rendering/StarCatalogPickRenderer.d.ts` (new type),
`src/services/gpu/renderers/starCatalog/starCatalogRenderer.ts` (expose a shared-pick-resource
accessor — the explicit BGLs + per-source `recordsBindGroup`),
`src/@types/engine/handles/EngineGpuHandles.d.ts` (add `starCatalogPickRenderer` handle),
`src/services/engine/phases/{initGpu,wireInput}.ts` (construct it alongside `starCatalogRenderer`).

**WESL contract (galaxy points-family idiom verbatim — `points/io.wesl` documents the shape):**

```
// io.wesl — StarUniforms gains, in the existing 16-byte rounding tail (struct stays 96 B):
//   offset 92  pickPass  u32   (0 = visual, 1 = pick)    ← float index 23, currently zero-pad
// io.wesl — VSOut gains:
//   recordIdx: u32 @interpolate(flat)                    (the bin-global record index, §3)
// vertex.wesl — set out.recordIdx = node.firstRecord + (ii - prefix[slotLo])  (the value it
//   already computes at :296); when u.pickPass == 1u, clamp the billboard to a ~3 px minimum
//   footprint so a sub-pixel star stays clickable at its true screen position (NO brightness
//   floor). The far-plane clip-z clamp (:374) carries over. WESL comments: single quotes, no backticks.
// pickFragment.wesl (NEW) — imports lib::selectionEncoding::{packSelection, PICK_SENTINEL_OFFSET}
//   and SOURCE_GAIA_STARS; discards outside the unit circle; writes
//   vec4<u32>(packSelection(SOURCE_GAIA_STARS, in.recordIdx + PICK_SENTINEL_OFFSET), 0u, 0u, 0u).
```

The visual draw leaves `pickPass` at its zero-init (float 23 is never written by
`writeCameraPrefix`, `starCatalogRenderer.ts:432-435`), so the visual pipeline is unchanged.

**`StarCatalogPickRenderer` contract (own module + own r32uint/depth pipeline, reuses the
records buffer):**

```ts
export type StarCatalogPickRenderer = Renderer & {
  // Draws one source's leaf cut into the OPEN r32uint pick pass. Packs its OWN per-source
  // nodeParams/prefix buffers (mirrors starCatalogRenderer.draw's packing, :438-488) and its
  // OWN StarUniforms buffer with pickPass = 1; binds the source's shared records bind group.
  draw(pass: GPURenderPassEncoder, args: StarCatalogPickDrawArgs): void;
  destroy(): void;
};
export type StarCatalogPickDrawArgs = {
  readonly source: SourceType;          // which loaded catalog's records to bind
  readonly vp: Float32Array;            // narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))
  readonly viewportPx: Vec2;
  readonly nodeDraws: readonly StarNodeDraw[];   // leaf stream, opacity > 0
  readonly originRelCamMpc: readonly Vec3[];
  readonly cellScaleMpc: readonly number[];
  readonly sizePx: number;
};
```

**Pipeline profile:** r32uint colour target, `depth32float` depth (`NEAR0_DEPTH_FORMAT`),
`depthCompare: 'less'`, `depthWriteEnabled: true` (the visual pass is depthless additive, but
the pick pass is depth-tested so the nearest star wins). Own vs/pickFragment `GPUShaderModule`;
explicit pipeline layout built from `starCatalogRenderer`'s exposed BGLs so the per-source
records bind group is compatible. No blending. `isAggregate` is packed 0 for every leaf draw.

- [x] Edit `io.wesl` (`pickPass` + `recordIdx`) and `vertex.wesl` (populate + ~3 px pick clamp),
      then add `pickFragment.wesl`. Add the `starCatalogPickRenderer` + type + the star renderer's
      shared-pick-resource accessor + the handle + construction. Didactic docblocks throughout.
      _Executed: constructed in `initGpu` only (mirrors `milkyWayPickRenderer`), not `wireInput`._
- [x] No unit test (WebGPU is unavailable in vitest; the pack logic is exercised via Task 7's
      pure helper). `npm run typecheck` (both tsconfigs) → green.
- [ ] **Visual verification (deferred to Task 7's wiring)** — recorded here: after Task 7, on the
      dev server, descend into the Gaia bubble and confirm hovering a star lands a pick (ring +
      "Field star" card) at the star's true screen position, and a bright star in front of a dim
      one wins the pick (depth-tested nearest).
- [x] Commit.

## Task 7 — `starCatalogLayer.drawPick` + pick draw-list + doc cleanup (spec §4, §5, §11, §12)

**Files:**
`src/services/engine/frame/passes/starCatalogLayer.ts` (add `drawPick`; **rewrite** the
"Not pickable" header paragraph `:94-100` — §12),
`src/services/gpu/renderers/starCatalog/starPickLeafDraws.ts` (new — the pure filter helper),
`src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts` (drop "not pickable", `:14` — §12),
`src/data/sources.ts` (rewrite the `starCatalog` "not pickable" line, `:29` — §12),
`tests/services/gpu/renderers/starCatalog/starPickLeafDraws.test.ts` (new).

**Pure helper (the unit-testable half of the pick draw-list — §11):**

```ts
export function starPickLeafDraws(
  prep: PreparedStarCut,                 // from prepareStarCut (exported, memoised per ctx)
): readonly { source: SourceType; nodeDraws: StarNodeDraw[]; originRelCamMpc: Vec3[]; cellScaleMpc: number[] }[];
// Per source: take the LEAF stream ONLY and drop nodes whose opacity === 0 (a newcomer at
// opacity 0, or a fully-faded leaf). Aggregates are structurally absent (they live in the
// aggregate stream). This is spec §4: leaf-only, visible-only.
```

`starCatalogLayer.drawPick` consumes `prepareStarCut(state, ctx)` (the SAME per-frame cut the
visual pass built — no re-traversal, `starCatalogLayer.ts:278`), runs `starPickLeafDraws`, and
calls `state.gpu.starCatalogPickRenderer.draw(...)` once per source with the rebased vp
(`drawStream`'s `narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))` idiom, `:428`). Because
`enabled` is `starCatalogVisible` (already carries the foreground-distance + crossfade gate,
`:196`), a cosmic-zoom frame never reaches this draw and `pick:near0` is not even allocated for it.

- [x] Add `starPickLeafDraws` (didactic docblock: why leaf-only + opacity>0; no re-traversal).
      Add `starCatalogLayer.drawPick`. Rewrite the three §12 doc sites so "not pickable" is no
      longer asserted (state what IS true: leaf stars pick via `drawPick` on NEAR0).
      _Executed notes: four additional comment sites whose 'sole pickable / alone in NEAR0'
      claims this task falsified were corrected, and the pickables pin test went four → five.
      The 'no re-traversal' framing above was itself inaccurate — the pick pass mints a fresh
      ctx, so 'prepareStarCut' re-walks at pick time against the last-rendered camera; the
      docblocks teach the real mechanism (reviewer-verified)._
- [x] Add the test `starPickLeafDraws excludes aggregates and zero-opacity leaves` — build a
      `PreparedStarCut` with (a) an aggregate node in the aggregate stream, (b) a leaf at
      opacity 0, (c) a leaf at opacity > 0; assert only (c) appears in the result. The
      load-bearing "an aggregate or a fully-faded leaf never enters the pick draw" guard.
- [x] `npx vitest run tests/services/gpu/renderers/starCatalog/starPickLeafDraws.test.ts` → fail, implement, pass.
- [ ] **Visual verification (dev server):** descend into the Gaia star bubble; hover a star →
      expect a NEAR0 selection ring at the star + a "Field star" InfoCard (distance, abs/apparent
      mag, BP−RP, spectral class); click → expect the `#focus=star-<index>` hash and a camera
      focus tween; reload the URL → expect the same star re-selected (or cleared after a tier
      switch — the accepted stale-index behaviour). Confirm an aggregate glow (no individual
      star resolved) is NOT pickable.
- [x] Commit.

## Task 8 — Entanglement-radar over the Stage 1 diff

**Files:** none (review + any fixes it surfaces, each with its own test if behavioural).

- [x] Run the `entanglement-radar` skill over the Stage 1 diff (Tasks 1–7). Name any complecting
      knot precisely (e.g. a second predicate on the pick discriminant, a mirrored constant, a
      renderer field shadowing engine state). Apply the un-braiding via `/simplify` where clear;
      otherwise capture it in `docs/BACKLOG.md` per backlog hygiene.
      _Executed: report in the SDD ledger dir. Applied — STAR_OFFSET_LEVELS single-sourced into
      starCatalogFormat. User-adjudicated dispositions: the NodeParams/StarUniforms packing
      duplication is fixed on this branch (shared packer + parity test, rides Stage 1.5); the
      solar-radius mirror + the star≈body framing-arm fold are absorbed into the Stage 1.5
      field-star sphere amendment, so no BACKLOG.md captures were needed. Union/table/slab-tag
      work reviewed clean._
- [x] `npm run typecheck` (both tsconfigs) + `npm test` → green.
- [x] Commit any fixes.

---

# Stage 1.5 — Field-star close-range sphere (amendment) (spec § "Amendment (2026-07-17)")

Adjudicated during Stage-1 visual verification: a focused Gaia field star has no
close-range geometry and its `starCatalog` sprite swims (f32 large-minus-large
cancellation within ~AU). This stage **builds the sphere** — a thin dedicated
NEAR0 foreground layer (`focusedFieldStarSphereLayer`) that reuses the existing
`starRenderer` on the f64 `composeBodyMvp` path (which does not wobble), tints it
from BP−RP via the one canonical ramp, and retires the wobbling near sprite
in-shader. It also absorbs Task-8 radar Findings 2 (solar-radius single-source)
and 4 (star≈body framing fold). Independently shippable.

**Mechanism (spec amendment):** option **B** (thin sphere layer reusing
`starRenderer`), NOT option A (transient scene-star injection) — B keeps the
authored scene-body star set free of runtime selection state and does not double
the picked star through the point-partition path it already has a sprite in.

**Amendment-specific constraints (in addition to the Global constraints above):**

- **Do NOT touch the shared `starCatalogLayout` packing surface**
  (`src/services/gpu/renderers/starCatalog/starCatalogLayout.ts` + the
  `StarUniforms` byte layout). A concurrent refactor owns it. The sprite-retire
  task (8e) is pure `vertex.wesl` math + one WESL const — **no uniform field
  added**. Reference the layout module abstractly if you brush it.
- **One canonical BP−RP ramp.** The single home is `starTint` in
  `starCatalog/tint.wesl`. Task 8c adds the CPU **evaluation** of that same ramp
  (anchors + breakpoints copied verbatim), never a second ramp.

## Task 8a — Single-source `SOLAR_RADIUS_KM` (spec amendment, radar Finding 2)

**Files:** `src/data/bodies/solarRadiusKm.ts` (new — one exported const),
`src/data/bodies/makers/star.ts` (drop the private `SOLAR_RADIUS_KM = 696340` at
`:31`, import the shared one).

**Interfaces:** produces `export const SOLAR_RADIUS_KM = 696340;` (km). Consumed
here by `makers/star.ts`; consumed in 8b by `extractSelectionRow.ts` +
`focusFraming.ts`.

**Contract:** the canonical value is **`696340`** — the value `makers/star.ts`
already scales `radiusSolar` by, so authored star radii do not move.
`focusFraming`'s `NOMINAL_STAR_RADIUS_KM = 6.957e5` is retired in 8b (the
~0.09% framing shift is accepted). Didactic docblock: one home for the Sun's
radius in km; the ~0.09%-drifted `focusFraming` copy folds in here.

- [x] Add `solarRadiusKm.ts` with the const + docblock; repoint `makers/star.ts`
      to import it (delete the module-local literal). No behaviour change (same
      value), so no new test — the existing star-maker tests cover the radius.
- [x] `npm run typecheck` (both tsconfigs) → green.
- [x] Commit.

## Task 8b — `star` row carries `radiusKm`; fold `focusFraming` star arm into body (spec amendment, radar Finding 4)

**Files:**
`src/@types/engine/SelectionRow.d.ts` (add `radiusKm` to the `star` arm, `:38-44`),
`src/services/engine/helpers/extractSelectionRow.ts` (set `radiusKm: SOLAR_RADIUS_KM` in the `star` arm, `:51-64`),
`src/services/engine/camera/bodyLikeFraming.ts` (new — the shared body/star framing helper),
`src/services/engine/camera/focusFraming.ts` (delete `NOMINAL_STAR_RADIUS_KM` `:61`; `body` + `star` arms each delegate to `bodyLikeFraming`),
`tests/services/engine/helpers/extractSelectionRow.test.ts` (extend),
`tests/services/engine/camera/focusFraming.test.ts` (extend).

**Type + signatures:**

```ts
// SelectionRow star arm — gains the nominal solar radius (spec amendment "Data delta").
| { readonly type: 'star'; readonly index: number; readonly positionMpc: Vec3;
    readonly absMag: number; readonly bpRp: number; readonly radiusKm: number }
// bodyLikeFraming — the shared frame-a-discrete-body-on-its-radius helper both
// the body and star arms of focusFraming delegate to (radar Finding 4 un-braid).
export function bodyLikeFraming(positionMpc: Vec3, radiusKm: number, fovYRad: number): FocusFraming;
//   radiusMpc = radiusKm · SCALE_UNITS.KM_TO_MPC;
//   { target: positionMpc, distance: bodyFocusDistance(radiusMpc, fovYRad), radius: radiusMpc }
```

The `star` and `body` arms STAY (their row shapes differ — the essential
asymmetry); only the duplicated framing body folds into `bodyLikeFraming`. Do NOT
try to merge the two switch cases into one.

- [x] Add `radiusKm` to the `star` `SelectionRow` arm; set it to `SOLAR_RADIUS_KM`
      in `extractSelectionRow.star`.
- [x] Add `bodyLikeFraming` (didactic docblock: why one helper for two arms —
      the row-shape asymmetry is essential, the framing body was accidental).
      Delete `NOMINAL_STAR_RADIUS_KM`; point `focusFraming`'s `body` + `star` arms
      at `bodyLikeFraming`.
- [x] Add the test `focusFraming frames a star and a body identically for equal position + radius`
      — a `star` row and a `body` row with the same `positionMpc` + `radiusKm`
      yield equal `FocusFraming` (pins the shared helper).
- [x] Add the test `extractSelectionRow star snapshots the nominal solar radius`
      — the extracted `star` row's `radiusKm === SOLAR_RADIUS_KM`.
- [x] `npx vitest run tests/services/engine/camera/focusFraming.test.ts tests/services/engine/helpers/extractSelectionRow.test.ts`
      → fail, implement, pass. `npm run typecheck` (both tsconfigs) → green.
      _Executed note: 4 star-row test fixtures gained `radiusKm: 696340` literals
      (framing-agnostic; reviewer-adjudicated acceptable)._
- [x] Commit.

## Task 8c — `starTintFromBpRp` CPU twin of the canonical ramp (spec amendment, constraint 2)

**Files:** `src/utils/color/starTintFromBpRp.ts` (new, one fn),
`tests/utils/color/starTintFromBpRp.test.ts` (new),
`src/services/gpu/shaders/starCatalog/tint.wesl` (correct the header's "no CPU
twin" claim → name the twin + the sync obligation; the code is UNCHANGED).

**Signature + contract:**

```ts
export function starTintFromBpRp(bpRp: number): Vec3;
// The CPU EVALUATION of starCatalog/tint.wesl's `starTint` — the ONE canonical
// Gaia BP−RP → linear-RGB ramp. Copy the five spectral-class anchors
// (ob/af/gc/kc/mc) and the four breakpoints (-0.30, 0.30, 0.85, 1.25, 2.20)
// VERBATIM from tint.wesl:46-59; same chained-saturating-mix (or the equivalent
// piecewise-linear) evaluation. Returns linear RGB (0..1), the shape
// starRenderer.draw expects. NOT a second ramp — the CPU twin of the one ramp.
```

- [ ] Add the test `starTintFromBpRp returns the O/B anchor below the first breakpoint`
      — a very blue `bpRp = −0.5` returns the O/B anchor `[0.6, 0.7, 1.0]`
      (hand-computed: clamped flat end).
- [ ] Add the test `starTintFromBpRp interpolates to a segment midpoint` — a
      `bpRp` at a segment midpoint (e.g. `0.0`, halfway between −0.30 and 0.30)
      returns the componentwise midpoint of the O/B and A/F anchors
      (hand-computed, an independent value).
- [ ] `npx vitest run tests/utils/color/starTintFromBpRp.test.ts` → fail,
      implement, pass.
- [ ] Correct `tint.wesl`'s header (the "no CPU twin to drift against" paragraph)
      to name `starTintFromBpRp` as the CPU mirror and state the keep-in-sync
      obligation. Shader code byte-unchanged. Single quotes only, no backticks.
- [ ] Commit.

## Task 8d — `focusedFieldStarSphereLayer` (spec amendment, layer + gate + draw)

**Files:**
`src/services/engine/frame/passes/focusedFieldStarSphereLayer.ts` (new),
`src/services/engine/frame/passes/index.ts` (register in `CONTENT_LAYERS` right
after `starSpheresLayer` `:245`, and re-export),
`tests/services/engine/frame/passes/focusedFieldStarSphereLayer.test.ts` (new —
the pure `enabled` gate; the sphere draw is visually verified).

**Interfaces consumed (do NOT redeclare):** `state.gpu.starRenderer`
(`StarRenderer.draw(pass, mvp, color)`), `composeBodyMvp`, `RENDER_ORIGIN_MPC`,
`SCALE_UNITS.KM_TO_MPC`, `apparentSizePx`, `resolvesToSphere`, `STAR_RESOLVE_PX`,
`starTintFromBpRp` (8c), the `star` `SelectionRow` with `radiusKm` (8b).

**Contract:** a `ContentLayer` `{ name: 'focused-field-star-sphere', slab: NEAR0,
target: 'foreground:0', blend: 'opaque' }` reusing `state.gpu.starRenderer`
UNCHANGED (the `starSpheresLayer` idiom, `starSpheresLayer.ts:95-121`).

- **`enabled(state, ctx)`** — `state.gpu.starRenderer !== null` AND
  `state.selectionRows.select` is a `star` row AND the star's sphere clears
  `STAR_RESOLVE_PX` at the **camera-to-star** distance
  (`resolvesToSphere({ apparentSizePx: apparentSizePx({ diameterKpc, distanceMpc,
  viewportHeightPx, fovYRad }), thresholdPx: STAR_RESOLVE_PX })`, with
  `diameterKpc` from `row.radiusKm` and `distanceMpc = |row.positionMpc −
  ctx.drawCamPos|`). Gate on camera-to-STAR distance, NOT `ctx.cam.distance` from
  the render origin (a field star sits parsecs from the Sun — see the spec
  amendment's gate note).
- **`draw(pass, view, ctx, state)`** — read the `star` row; `mvp =
  composeBodyMvp(view.slab.vp, row.positionMpc, RENDER_ORIGIN_MPC, row.radiusKm ·
  SCALE_UNITS.KM_TO_MPC)` (no oblateness); `starRenderer.draw(pass, mvp,
  starTintFromBpRp(row.bpRp))`.

Didactic docblock: why option B not A (spec amendment); why the camera-to-star
gate; why the f64 `composeBodyMvp` seam kills the wobble; renderer reused unchanged.

- [ ] Add `focusedFieldStarSphereLayer`; register + re-export in `passes/index.ts`
      (update the header's foreground-group draw-order list to name the new row).
- [ ] Add the test `enabled only for a star row within sphere-resolve range` — a
      `star` row with the camera close (sphere ≥ `STAR_RESOLVE_PX`) → true; the
      same row with the camera far (sphere sub-pixel) → false; a non-`star` row
      (or null) → false; a null `starRenderer` → false. Behavioural gate, mirroring
      `starSpheresLayer` / `near0SelectionRingLayer`.
- [ ] `npx vitest run tests/services/engine/frame/passes/focusedFieldStarSphereLayer.test.ts`
      → fail, implement, pass. `npm run typecheck` (both tsconfigs) → green.
- [ ] **Visual verification (dev server):** double-click a Gaia field star and let
      the focus descend; expect a resolved emissive sphere of the BP−RP-derived
      colour filling the frame — where before there was only a dot. (The sprite
      handoff is verified in 8e.)
- [ ] Commit.

## Task 8e — Retire the wobbling near sprite in-shader (spec amendment, constraint 3)

**Files:** `src/services/gpu/shaders/starCatalog/vertex.wesl` (add a
visual-pass-only near-distance billboard dissolve).

**Contract (spec amendment "sprite→sphere handoff"):** on the VISUAL pass only
(`u.pickPass == 0u`), a star whose reconstructed camera-relative distance
`length(worldRelCam)` (already computed at `vertex.wesl:262,269` — reuse it, do
NOT recompute) falls inside a near-fade band collapses its billboard radius to
zero via a `smoothstep` over the band. Pure vertex math + one WESL const
(`STAR_SPRITE_NEAR_FADE` — near/far edges in Mpc). **No uniform field added — do
NOT touch `StarUniforms` / the `starCatalogLayout` packing surface.** The pick
pass (`u.pickPass == 1u`) is UNFADED so the star stays clickable at close range.
Set the band's outer edge so the sphere (8d, `STAR_RESOLVE_PX`) is already
resolved before the sprite finishes dissolving — a seamless crossover, no gap,
no double-image. WESL comments single-quoted, no backticks; be meticulous
(shared shader — the visual math must stay byte-identical outside the band).

- [ ] Add the near-fade band const + the `pickPass == 0u` `smoothstep` collapse
      of the billboard radius (fold it into `rPxDraw` / the visual radius so the
      pick floor path at `:326-327` is untouched). Didactic comment: why fade any
      near star (targets exactly the wobble set), the non-focused fly-through
      trade-off, and why in-shader not per-record (packing-surface avoidance).
- [ ] No unit test (WebGPU is unavailable in vitest; shader correctness is a
      visual concern). `npm run typecheck` (both tsconfigs) → green.
- [ ] **Visual verification (dev server):** descend into a focused field star and
      confirm the wobbling sprite is GONE at close range (no swimming dot beside
      the sphere) and the point→sphere crossover reads seamlessly with no frame
      where the star vanishes or double-draws; confirm a non-focused nearby star
      handled the same way; confirm the star still picks (hover) at close range.
- [ ] Commit.

## Task 8f — Entanglement-radar over the Stage 1.5 diff

**Files:** none (review + any fixes it surfaces, each with its own test if behavioural).

- [ ] Run the `entanglement-radar` skill over the Stage 1.5 diff (Tasks 8a–8e).
      Confirm the framing fold landed as ONE shared helper (not a third framing
      copy), the BP−RP ramp is a single canonical home with a documented CPU
      mirror (not a divergent second ramp), and the sphere layer added no scene-set
      coupling (option B stayed B — `visibleStars`/`partitionStarsByResolution`
      untouched). Un-braid via `/simplify` where clear; else capture in
      `docs/BACKLOG.md` per backlog hygiene.
- [ ] `npm run typecheck` (both tsconfigs) + `npm test` → green.
- [ ] Commit any fixes.

---

# Stage 2 — Bodies (spec §8, §12)

Earth / planets / scene stars become NEAR0 pickables carrying their stable seed index; the
`body` selection plumbing (half-built by zoom-to-earth) gains its missing pieces. Independently
shippable.

## Task 9 — Body pick shaders + `bodyPickRenderer` (spec §8.3)

**Files:**
`src/services/gpu/shaders/bodies/spherePick.wesl` (new — flat sphere pick),
`src/services/gpu/shaders/bodies/starPointPick.wesl` (new — instanced pick billboard),
`src/services/gpu/renderers/bodies/bodyPickRenderer.ts` (new),
`src/@types/rendering/BodyPickRenderer.d.ts` (new type),
`src/@types/engine/handles/EngineGpuHandles.d.ts` (add `bodyPickRenderer` handle),
`src/services/engine/phases/{initGpu,wireInput}.ts` (construct it).

**Contract (own-uniform, no shared COSMO pick camera — bodies bake MVP CPU-side, §8.3):**

```ts
export type BodyPickRenderer = Renderer & {
  // ≤10 sphere draws (Earth + planets + resolved scene-star spheres) — NO instancing.
  // Per-draw uniform { mvp: mat4, packedId: u32 }; writes packedId into r32uint.
  drawSphere(pass: GPURenderPassEncoder, args: { mvp: Float32Array; packedId: number }): void;
  // ≤25 instanced pick billboards for the star-POINTS partition, ~3 px minimum footprint,
  // one packedId per instance. Same true-position pick as the sphere path.
  drawPoints(pass: GPURenderPassEncoder, args: {
    vp: Float32Array; viewportPx: Vec2;
    points: readonly { posRelCamMpc: Vec3; packedId: number }[];
  }): void;
  destroy(): void;
};
```

**Pipeline profile:** r32uint colour, NEAR0 `depth32float` depth, `less` + write-enabled (so a
Moon in front of Earth resolves correctly, §8.3). Both entry points compile their OWN module +
explicit pipeline layout. WESL comments single-quoted, no backticks.

- [ ] Add `spherePick.wesl` + `starPointPick.wesl` + `bodyPickRenderer` + type + handle +
      construction. Didactic docblocks (why own-uniform not shared camera; why depth-tested).
- [ ] No unit test (GPU). `npm run typecheck` (both tsconfigs) → green.
- [ ] Visual verification is folded into Task 10 (once the layers wire the pick draws).
- [ ] Commit.

## Task 10 — Body layers `drawPick` with stable seed index (spec §8.1, §8.3)

**Files:**
`src/services/engine/frame/passes/earthLayer.ts` (add `drawPick`),
`src/services/engine/frame/passes/planetsLayer.ts` (add `drawPick`),
`src/services/engine/frame/passes/starSpheresLayer.ts` (add `drawPick`),
`src/services/engine/frame/passes/starPointsLayer.ts` (add `drawPick`),
`src/services/engine/frame/passes/seedIndexOfBody.ts` (new — pure seed-index lookup),
`tests/services/engine/frame/passes/seedIndexOfBody.test.ts` (new).

**The stable seed index (spec §8.1 — NOT `instance_index`):** each body's pick id carries its
index into its seed array (`SCENE_STARS` for `FamousStar`, `SCENE_PLANETS` for `Planet`, `0`
for `Earth`), composed CPU-side. `planetsLayer` packs only resolved planets and
`starSpheresLayer`/`starPointsLayer` draw a camera-dependent subset, so an instance slot shifts
as bodies enter/leave the resolved set — the seed index does not.

```ts
export function seedIndexOfBody(id: string, seeds: readonly { id: string }[]): number;   // indexOf by id
// each drawPick: packedId = packSelection(code, seedIndexOfBody(body.id, SEEDS) + PICK_SENTINEL_OFFSET)
//   earth → Source.Earth, seed index 0;  planets → Source.Planet, SCENE_PLANETS index;
//   star spheres/points → Source.FamousStar, SCENE_STARS index.
```

Each `drawPick` composes its body's MVP the same way its `draw` does (`composeBodyMvp` from
`view.slab.vp`, `earthLayer.ts:101`) — bodies pick as their true depth-tested surface. The
star-points `drawPick` rebases like its `draw` (`starPointsLayer.ts:132-147`) and hands
`bodyPickRenderer.drawPoints` the ≤25 camera-relative points + seed-indexed packedIds.

- [ ] Add `seedIndexOfBody` + the four `drawPick`s (each null-guards `state.gpu.bodyPickRenderer`).
- [ ] Add the test `seedIndexOfBody returns the seed array position` — a body id maps to its
      `SCENE_PLANETS` / `SCENE_STARS` index; an unknown id → −1.
- [ ] `npx vitest run tests/services/engine/frame/passes/seedIndexOfBody.test.ts` → fail, implement, pass.
- [ ] Commit (visual verification lands in Task 11 once RESOLVE_PICK closes the loop).

## Task 11 — `RESOLVE_PICK` body arms + seed-index stability (spec §8.2, §11)

**Files:** `src/services/engine/helpers/resolvePickTable.ts` (add `famousStar`/`planet`/`earth`
arms), `tests/services/engine/helpers/resolvePickTable.test.ts` (extend),
`tests/services/engine/frame/passes/planetsLayer.test.ts` (extend — the stability regression).

**Arm contract (reuses the existing `{ type: 'body', id }` ref end-to-end):**

```ts
// keyed on SourceEntry['type']; each maps (code, seedIndex) → { type: 'body', id } via the seed array.
famousStar: (_entry, pick) => { const b = SCENE_STARS[pick.localIdx];   return b ? { type: 'body', id: b.id } : null; },
planet:     (_entry, pick) => { const b = SCENE_PLANETS[pick.localIdx]; return b ? { type: 'body', id: b.id } : null; },
earth:      (_entry, pick) => (pick.localIdx === 0 ? { type: 'body', id: SCENE_EARTH.id } : null),
```

- [ ] Add the three arms (import `SCENE_STARS` / `SCENE_PLANETS` / `SCENE_EARTH` — static, like
      `extractSelectionRow` imports `SCENE_BODIES`).
- [ ] Add the test `RESOLVE_PICK body arms recover the seed id` — `famousStar`/`planet`/`earth`
      picks at known seed indices resolve to `{ type: 'body', id }` with the right id; an
      out-of-range index → null.
- [ ] Add the test `a culled planet does not move another planet's pick id` (§8.1 regression) —
      run `planetsLayer`'s pack loop (or the seed-index composition) with one planet sub-pixel so
      it is skipped, and assert the packed pick id of a still-drawn planet is unchanged from the
      all-visible case (the pick id is the seed index, not the pack-loop slot). Names the bug it
      guards.
- [ ] `npx vitest run tests/services/engine/helpers/resolvePickTable.test.ts tests/services/engine/frame/passes/planetsLayer.test.ts` → fail, implement, pass.
- [ ] Commit.

## Task 12 — `SelectionRow` body arm extended + halo filled (spec §8.4)

**Files:**
`src/@types/engine/SelectionRow.d.ts` (extend the body arm with `absMag` / `bpRp`),
`src/services/engine/helpers/extractSelectionRow.ts` (populate the new fields for scene stars, `:34`),
`src/services/engine/helpers/selectionHaloTable.ts` (fill the body arm — no longer `null`, `:62`),
plus mirror tests.

**Contract (spec §8.4):** the body `SelectionRow` gains optional `absMag` / `bpRp` so a picked
scene star (e.g. Sirius) shows the same stellar fields a picked Gaia star does, alongside the
existing `positionMpc` / `radiusKm`. `EXTRACT_ROW.body` fills them for `SCENE_STARS` bodies (a
`StarBody` carries `absMag`; BP−RP derives from its spectral-class colour, or is omitted when
the seed carries no colour index — keep them optional so planets/Earth omit them). The
`selectionHaloTable.body` arm returns the body's picked position + a px-based ring radius (the
NEAR0 ring layer draws px rings, which ARE meaningful around a body — the old "meaningless
chrome" assumption held only under COSMO's Mpc scale).

```ts
// SelectionRow body arm (extended):
| { readonly type: 'body'; readonly id: string; readonly positionMpc: Vec3; readonly radiusKm: number;
//   optional stellar fields for scene-star bodies:
    readonly absMag?: number; readonly bpRp?: number }
// selectionHaloTable.body(row) → { radiusMpc: 0, worldPos: row.positionMpc }   // px-floored by the layer
```

- [ ] Extend the body `SelectionRow` arm; populate `absMag`/`bpRp` in `EXTRACT_ROW.body` for
      `SCENE_STARS` bodies; fill `selectionHaloTable.body`.
- [ ] Add the test `EXTRACT_ROW body carries stellar fields for a scene star` — a `body-sirius`
      ref → a row with `absMag`/`bpRp` set; a `body-earth` / `body-jupiter` ref → a row with them
      omitted.
- [ ] Add the test `selectionHalo returns a descriptor for a body row` (was null) — asserts the
      body arm now yields `{ radiusMpc, worldPos }` at the body position.
- [ ] `npx vitest run tests/services/engine/helpers/extractSelectionRow.test.ts tests/services/engine/helpers/selectionHaloTable.test.ts` → fail, implement, pass.
- [ ] Commit.

## Task 13 — `BodyInfo` focusable + cards + fill focusable tables + doc cleanup (spec §8.4, §12)

**Files:**
`src/@types/engine/BodyInfo.d.ts` (new type),
`src/@types/engine/FocusableTarget.d.ts` (add `BodyInfo`),
`src/services/engine/helpers/buildFocusable.ts` (flip `body` arm null → real `BodyInfo`, `:26`),
`src/services/engine/helpers/refOf.ts` (add `body` arm),
`src/hooks/urlHashFor.ts` (add `body` arm),
`src/services/engine/helpers/targetIdentityKey.ts` (add `body` arm),
`src/components/InfoCard/detailCardTable.ts` (add `body` row),
`src/components/InfoCard/BodyDetailCard/BodyDetailCard.{tsx,module.css}` (new — `create-component`),
`src/components/InfoCard/CompactBodyCard/CompactBodyCard.{tsx,module.css}` (new — `create-component`),
`src/@types/data/body/{EarthSourceEntry,PlanetSourceEntry,FamousStarSourceEntry}.d.ts`
(rewrite the "Bodies are not pickable" comment — §12),
`src/data/source.ts` (rewrite the body "not pickable" doc lines, `:142/:150/:157` — §12),
`src/data/sources.ts` (rewrite the body "not pickable" line, `:26` — §12),
plus mirror tests.

**`BodyInfo` shape (a FocusableTarget arm — filling the deliberate `buildFocusable.body` null,
`buildFocusable.ts:26`):**

```ts
export type BodyInfo = {
  readonly type: 'body';
  readonly id: string;
  readonly displayName: string;          // the seed label (SCENE_BODIES.find(id).label)
  readonly x: number; readonly y: number; readonly z: number;   // for framing
  readonly radiusKm: number;
  // stellar fields present only for scene-star bodies (from the extended SelectionRow):
  readonly absMag?: number; readonly spectralClass?: number | string;
};
```

`buildFocusable.body` builds it from the row (label via `SCENE_BODIES`); `BodyDetailCard`
renders the body's name + radius (+ stellar rows when present). URL/identity arms mirror the
star arms with the `body-` prefix (`urlHashFor.body → body-<id>`, `targetIdentityKey.body →
body:<id>`, `refOf.body → { type: 'body', id }`). Adding `BodyInfo` to `FocusableTarget`
compile-forces all four focusable tables (P2).

- [ ] `create-component` for `BodyDetailCard` + `CompactBodyCard`.
- [ ] Add `BodyInfo.d.ts`; widen `FocusableTarget`; fill `buildFocusable.body` (real),
      `refOf.body`, `urlHashFor.body`, `targetIdentityKey.body`, `detailCardTable.body`. Rewrite
      the §12 body "not pickable" doc sites.
- [ ] Add the test `buildFocusable body builds a BodyInfo` — a `body-earth` row → a `BodyInfo`
      with the label/radius; a scene-star `body-sirius` row → a `BodyInfo` carrying its `absMag`.
- [ ] `npx vitest run tests/services/engine/helpers/buildFocusable.test.ts` → fail, implement, pass.
      `npm run typecheck` (both tsconfigs) → green.
- [ ] **Visual verification (dev server):** in the near-field descent, hover Earth / a planet /
      the Sun / Sirius → expect a body InfoCard + a NEAR0 ring at the body; click → expect the
      `#focus=body-<id>` hash + a focus tween; confirm a Moon in front of Earth picks the Moon
      (depth-tested), and a sub-pixel scene-star dot is still pickable at its true position.
- [ ] Commit.

## Task 14 — Entanglement-radar over the Stage 2 diff

- [ ] Run `entanglement-radar` over the Stage 2 diff (Tasks 9–13). Watch for the star/body arms
      drifting into a shared-but-forked shape (e.g. two nearly-identical `drawPick` seed-index
      packers that should fold into one) and the `SelectionRow` stellar fields being read for
      truth in two places. Un-braid via `/simplify` where clear; else backlog it.
- [ ] `npm run typecheck` (both tsconfigs) + `npm test` → green.
- [ ] Commit any fixes.

---

# Stage 3 — Ring / card polish (spec §9, §2.3)

Cross-cutting tuning once both families select. Independently shippable.

## Task 15 — NEAR0 ring radius / appearance tuning (spec §9)

**Files:** `src/services/engine/frame/passes/near0SelectionRingLayer.ts` (tune the px sizing),
`src/services/engine/helpers/selectionHaloTable.ts` (tune the star/body `radiusMpc` inputs if
needed), possibly `src/services/gpu/shaders/selectionRing/fragment.wesl` (appearance only if the
existing ring reads wrong at NEAR0 scale — otherwise untouched).

- [ ] Tune the NEAR0 ring's px radius / floor so the halo reads as a clean "this one" affordance
      around a star and around a body (Earth-through-Sirius scale range), matching the COSMO ring's
      visual weight. Keep the renderer shared/unchanged if the sizing lives entirely in the layer.
- [ ] **Visual verification (dev server):** pick a Gaia star, a planet, Earth, and a scene star in
      turn; confirm the ring is legible and correctly centred at each scale, and does not balloon
      or vanish across the descent.
- [ ] Commit (no unit test — this is pure visual tuning; a px-math change with a clear right answer
      may get a hand-computed helper test if extracted).

## Task 16 — Card copy + hover behaviour (spec §2.3, §6)

**Files:** the star/body `InfoCard` card components (Task 4 / Task 13) + any hover-gate site the
visual pass surfaces (e.g. the hover debounce or the compact-vs-detail switch, if star/body hover
needs the same treatment galaxies get).

- [ ] Finalise the "Field star" / body card copy (field labels, units — pc for star distance,
      km/radius for bodies) and confirm hover shows the compact card, click pins the detail card,
      with the outer-wrapper-stable contract preserved (no `<details>` remount on hover, CLAUDE.md).
- [ ] **Visual verification (dev server):** hover→pin→close a star card and a body card; confirm no
      flicker/remount and that the copy reads correctly.
- [ ] Commit (React copy/behaviour tweaks; add a targeted card render assertion only if a specific
      branch — e.g. "a planet omits the spectral-class row" — is worth pinning).

## Task 17 — Entanglement-radar over the Stage 3 diff + final DoD sweep

- [ ] Run `entanglement-radar` over the Stage 3 diff. Confirm the two ring layers still share the
      one renderer and the card tables carry no fork the star/body arms could have shared.
- [ ] `npm run typecheck` (both tsconfigs) + `npm test` → green.
- [ ] Commit any fixes.

---

## Definition of Done

- [ ] `npm test` (single pass) green — the full suite, including every test named above.
- [ ] `npm run typecheck` green for **both** tsconfigs (src + tools).
- [ ] Visual passes confirmed **by the user** on the dev server: (a) a Gaia leaf star hovers/clicks
      to a "Field star" card + NEAR0 ring + `star-<index>` deep link, aggregates do NOT pick;
      (b) Earth / planets / scene stars hover/click to a body card + ring + `body-<id>` deep link,
      depth-tested overlaps resolve correctly, sub-pixel dots still pick at true position;
      (c) the ring reads cleanly across the whole descent scale range.
- [ ] §12 doc cleanup done — no "not pickable" assertion remains on `starCatalogLayer`,
      `StarCatalogSourceEntry`, `sources.ts` (star + body lines), `source.ts` body lines, or the
      three body `SourceEntry` types.
- [ ] `entanglement-radar` run at the end of each stage; surfaced knots either un-braided or
      captured in `docs/BACKLOG.md` per backlog hygiene.
- [ ] No `TBD` / placeholder / dangling arm — every mapped-type dispatch table
      (`RESOLVE_PICK`, `EXTRACT_ROW`, `BUILD_FOCUSABLE`, `focusIdOf.ENCODE`, `DETAIL_CARD`,
      `URL_HASH_FOR`, `TARGET_IDENTITY_KEY`, `refOf`) carries its star + body arms.
