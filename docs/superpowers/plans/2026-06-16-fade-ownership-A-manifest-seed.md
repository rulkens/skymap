# Plan A — Fade-ownership manifest seed (`FADE_LAYERS` + `seedFades`)

**REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development` (execute this plan
via a fresh subagent per task + spec + quality reviews — see CLAUDE.md "TDD via plans").

> **Spec:** `docs/superpowers/specs/2026-06-15-fade-ownership-visibility-seam-merged-design.md`.
> This plan delivers **Plan A only** — the "manifest seed" row of the spec's
> "Plan decomposition" table (spec §236–246), driven by spec §1 ("The manifest —
> `FADE_LAYERS`"), the "What grounding the code changed" section (the four
> out-of-band registration sites, spec §44–57), and the seed-asymmetry table
> (spec §79–85).
>
> **Dependencies:** Plan A has **no deps** — braid #1 already shipped (#309).
> Plan B (intent bridge + #38 seam) depends on A. Plan C (renderer mirrors) is
> independent. Build A first.
>
> **⚠️ Cross-plan open seam (resolve at execution, with the user if needed) —
> `surveyLabel` / `galaxyNames`.** This row is genuinely different from the other
> intent rows and Plan A and Plan B describe it slightly differently:
> - There is **one** `galaxyNames` fade handle (singleton), seeded at `1`
>   (`registerOverlayFades.ts:99`), because the famous-galaxy labels *consume its
>   opacity directly* — a `0` would hide them.
> - Per `EngineSettingsState.d.ts`, `galaxyCatalogs.items[id].labelEnabled` exists
>   for every catalog **but only the famous catalog actually renders a label** (the
>   others carry it inertly). So the `surveyLabel` intent is effectively a **single
>   toggle** keyed off the famous catalog's `labelEnabled`, mapping to the single
>   `galaxyNames` handle — **not** a per-`GalaxyCatalogId` row.
> - The famous-label show/hide is **producer-driven** today (the label director
>   decides whether to emit), so routing `surveyLabel` through the bridge risks
>   *double-controlling* visibility (producer emit vs handle opacity). **Before
>   wiring `surveyLabel`'s intent (Plan B Task 1), read the current famous-label
>   toggle path (`setFamousLabelsVisible` / the label director) and confirm whether
>   the bridge should own this fade at all, or whether `galaxyNames` stays
>   registration-only (seed `1`, no `intent`).** If the latter, drop `surveyLabel`
>   from the intent set in both plans. STOP and report rather than guess.
>
> Plan B also flagged smaller execution-time checks (galaxy-catalog unconditional
> fade-in → intent-gated; push-setter write-before-fade reordering; `applyEffect`
> cluster→keys derivation; bridge `Pick` width). Those are written into Plan B as
> verify-or-stop steps.

## Goal

Give fade-handle **registration** exactly one home. Today registration is
spread across `registerOverlayFades` (~80% a manifest already) plus four
out-of-band `register` sites (galaxy-catalog slot, filament slot, flow slot, and
the `volumeFieldRenderer.onFieldAdded/onFieldRemoved` renderer callback). This
plan absorbs all five into a single declarative `FADE_LAYERS` table of closure
rows and a generic `seedFades(state)` that expands every row and registers each
handle at its per-row `seed()`. **Behaviour-preserving:** frame-1 opacities are
identical to today.

## Architecture

A new one-type-per-file `FadeLayer<Item>` (`src/@types/animation/FadeLayer.d.ts`)
pins the row shape from spec §1. `FADE_LAYERS`
(`src/services/engine/wiring/fadeLayers.ts`) is a heterogeneous array of those
rows — each declaring how it `expand`s over `EngineState` (singleton / per
`GalaxyCatalogId` / per `StructureId` / per `VolumeFieldId`), how an item maps to
its real `FadeId` (`handle`), and its `seed()` opacity (settings-derived for
resident layers, `0` for the four demand-loaded layers). `seedFades(state)`
replaces `registerOverlayFades`, iterates the table generically, and registers
every handle at t=0 before any renderer exists. The seed asymmetry is carried as
**data** (one `seed()` per row), not flattened into a single rule — a naive
`settings ? 1 : 0` would lose the demand-loaded fade-in (spec §58–91).

## Tech Stack

TypeScript (`tsc --noEmit` both tsconfigs via `npm run typecheck`), Vitest
(`npm test`). No WGSL, no binary-format, no GPU-pipeline changes. The
fadeRegistry core is **untouched** (spec §219). The intent fields on the row
type are defined now but unused by Plan A — Plan B fills them in.

## Conventions (CLAUDE.md — the implementer MUST follow these)

- `type` aliases, **never** `interface`.
- **One type per file** in `src/@types/` — `FadeLayer.d.ts` exports exactly one
  type; filename = type name.
- Single-function-per-file in `utils/`; `seedFades` and `FADE_LAYERS` live in
  `wiring/` (orchestration), not `utils/`.
- Didactic comments — explain _why_ + the alternative, match the multi-paragraph
  header style of the file being replaced (`registerOverlayFades.ts:1–50`).
- `Vec2` / `Vec3` aliases, never raw tuples (not expected to arise here).
- Prefer immutability — `readonly` on the row type's fields and on `FADE_LAYERS`.
- **No `sed`/`awk`/`grep` via Bash** — use the Read/Grep tools.
- Typed `vi.fn<() => void>()`, never bare `vi.fn()`.

## Dispatch note (subagent-driven execution)

Background implementers **edit files only** — they cannot run `npm`/`npx`. The
main thread runs `npm test` / `npm run typecheck` and commits each green slice.
**Escalate before hacking:** if a clean implementation is blocked (e.g. a row
needs state the manifest can't reach purely), STOP and report rather than
introduce a workaround. Pause before reaching for the bigger change — reuse the
existing `FadeId` literals and the existing settings reads; this is a relocation,
not a redesign.

---

## Task 0 — Pre-flight baseline

**Files:** none (verification only).

- [ ] Run `npm test` — record the passing count (CLAUDE.md says 590+ across 76
  files; capture the exact numbers as the green baseline).
- [ ] Run `npm run typecheck` — confirm clean (both `src` and `tools` tsconfigs).
- [ ] Note the baseline in the task log so later tasks can prove "same count + N
  new tests".

---

## Task 1 — Define the `FadeLayer<Item>` row type

**Files:** `src/@types/animation/FadeLayer.d.ts` (create),
`tests/@types/animation/fadeLayer.types.test.ts` (create, type-level smoke).

**Contract** (from spec §116–129 — define the FULL shape now so Plan B doesn't
re-edit; intent/post/guard are **optional** so Plan A rows omit them):

```ts
// src/@types/animation/FadeLayer.d.ts  (one type per file)
export type FadeLayer<Item> = {
  readonly key: VisibilityLayerKey;                       // 'survey' | 'structureRing' | …
  expand(state: EngineState): readonly Item[];            // singleton | per GalaxyCatalogId | StructureId | VolumeFieldId
  handle(item: Item): FadeId;                             // the sole VisibilityLayerKey → FadeId-kind translation point
  seed(settings: EngineSettingsState, item: Item): number; // settings-derived OR 0 (demand-loaded)
  // intent rows only (Plan B / the #38 subset — optional, unused by Plan A):
  intent?(settings: EngineSettingsState, item: Item): boolean;
  writeIntent?(settings: EngineSettingsState, item: Item, value: boolean): void;
  post?(state: EngineState, item: Item): void;
  guard?(state: EngineState, item: Item): boolean;
};
```

- [ ] Add `VisibilityLayerKey` (spec §87–91 + §96–103): a new
  `src/@types/animation/VisibilityLayerKey.d.ts` one-type-per-file union. **The
  vocabulary is pinned (do not re-choose)**: row keys are the friendly,
  *intent-addressing* names — finer-grained than `FadeId` kinds, because the
  intent rows split a kind (a `milkyWay` kind → two keys; a `structure` kind →
  ring + label keys). The 13 keys, one per Task 2 row:

  ```ts
  export type VisibilityLayerKey =
    | 'milkyWayDisk' | 'proceduralDisks' | 'texturedDisks' | 'volumesMaster'
    | 'milkyWayLabel' | 'surveyLabel' | 'scaleBar'
    | 'structureRing' | 'structureLabel'
    | 'survey' | 'filaments' | 'flow' | 'volumeField';
  ```

  `handle()` is the **sole** translation point to the real `FadeId` kinds. Plan B's
  `only:[key]` API and the #39 tour address layers by these keys. Docblock: row
  keys = intent-addressing vocabulary; `FadeId` kinds = registry vocabulary;
  `handle()` bridges them. (The `surveyLabel` key is the `galaxyNames`-handle row —
  see the cross-plan seam note at the top of this plan.)
- [ ] Write `FadeLayer.d.ts` with the shape above + a multi-paragraph docblock:
  why a closure-row table (heterogeneity — static / per-id / settings-seed vs
  zero-seed — lives in per-row closures so the seed loop stays generic, spec
  §223–228); why intent fields are optional (the intent set is a *subset* of the
  registration set, spec §94–106).
- [ ] Add a type-level test asserting a `FadeLayer<X>` literal with only
  `key`/`expand`/`handle`/`seed` typechecks (intent fields omittable), and that
  `handle` returns `FadeId`. Use `expectTypeOf` or an assignment-compile smoke
  consistent with existing `tests/@types/**.types.test.ts` files.
- [ ] `npm run typecheck` → clean.

---

## Task 2 — `FADE_LAYERS` manifest + `seedFades`, replacing `registerOverlayFades`

**Files:** `src/services/engine/wiring/fadeLayers.ts` (create),
`src/services/engine/wiring/registerOverlayFades.ts` (delete),
`src/services/engine/phases/wireSlots.ts` (modify — repoint the call),
`tests/services/engine/wiring/registerOverlayFades.test.ts` →
`tests/services/engine/wiring/fadeLayers.test.ts` (rename + extend).

**Signatures:**

```ts
export const FADE_LAYERS: readonly FadeLayer<unknown>[];   // each row internally typed FadeLayer<Item>
export function seedFades(state: EngineState): void;        // iterate rows → expand → register at seed()
```

`seedFades` body: for each row, `for (const item of row.expand(state))
state.subsystems.fades.register(row.handle(item), row.seed(state.settings, item))`.
Registration is a pure opacity write (no GPU dep, spec §131–137), so this runs
at t=0 before any renderer — exactly where `registerOverlayFades` runs today
(`wireSlots.ts:98`).

**The rows** — honour the seed-asymmetry table (spec §79–85) EXACTLY. Reuse the
existing `FadeId` literals and settings reads; cite the source each row absorbs:

| Row key | expand | handle(item) | seed |
|---|---|---|---|
| milkyWay disk | singleton | `{ kind: 'milkyWay' }` | `settings.milkyWay.enabled ? 1 : 0` (`registerOverlayFades.ts:64–67`) |
| proceduralDisks | singleton | `{ kind: 'overlay', id: 'proceduralDisks' }` | `1` (`:70`) |
| texturedDisks | singleton | `{ kind: 'overlay', id: 'texturedDisks' }` | `1` (`:71`) |
| volumesMaster | singleton | `{ kind: 'volumesMaster' }` | `settings.volumes.enabled ? 1 : 0` (`:80–83`) |
| milkyWay label | singleton | `{ kind: 'labelLayer', layer: 'milkyWay' }` | `settings.milkyWay.labelEnabled ? 1 : 0` (`:95–98`) |
| galaxyNames | singleton | `{ kind: 'labelLayer', layer: 'galaxyNames' }` | `1` (`:99`) |
| scaleBar | singleton | `{ kind: 'labelLayer', layer: 'scaleBar' }` | `1` (`:100`) |
| structure ring | per `StructureId` (`STRUCTURE_IDS`) | `{ kind: 'structure', id }` | `settings.structures.items[id].enabled ? 1 : 0` (`:109–113`) |
| structure label | per `StructureId` | `{ kind: 'labelLayer', layer: 'structure', category: id }` | `settings.structures.items[id].labelEnabled ? 1 : 0` (`:114–117`) |
| galaxyCatalog | per `GalaxyCatalogId` (`GALAXY_CATALOG_IDS`) | `{ kind: 'galaxyCatalog', id }` | **`0`** — demand-loaded (`galaxyCatalogSourceRegistry.ts:154`) |
| filament | singleton | `{ kind: 'filament' }` | **`0`** — demand-loaded (`filamentSlot.ts:30`) |
| flow | singleton | `{ kind: 'flow' }` | **`0`** — demand-loaded (`flowFieldSlot.ts:36`) |
| volumeField | per resident `VolumeFieldId` | `{ kind: 'volumeField', id }` | **`0`** — demand-loaded (`initGpu.ts:344`) |

- The `youAreHere` layer **does not exist** (spec §12–14 — #313 folded it into
  `labelLayer:milkyWay`). Do not add it.
- Milky Way is **two rows** (disk + label), per the table above (spec §15–18).
- The **`volumeField` set is enumerated from the volume registry**, not from a
  renderer callback. Use the existing registry-iteration pattern that
  `seedVolumeFields` uses (`src/data/volume/volumeFieldDefaults.ts:94–104`):
  iterate `SOURCE_REGISTRY`, `type === 'volume' && binBaseName !== null` → the
  field's `id`. This is the **same exclusion** the seed already applies (DEV-only
  `binBaseName: null` debug fixtures are not registered at construction — they
  register on-demand under DEV; matching today's behaviour where production never
  seeds them). Confirm against `initGpu.ts:334–349` that the only production
  fields registered were the ones a real cube commits — the registry enumeration
  reproduces that set at t=0.
- `expand` for a singleton returns a one-element array (e.g. `[null]` or
  `[undefined]` with `Item = void`-ish) so `seedFades` stays one generic loop —
  pick a consistent singleton representation and document it once.

**`seedFades` docblock** must carry forward the frame-1-coherence rationale from
`registerOverlayFades.ts:1–50` (registering at the wrong initial value flashes a
disabled layer for one frame; settings-derived seeds keep frame 1 coherent) and
add the new para: registration now has exactly **one home** — slot factories and
`initGpu` no longer call `register`.

- [ ] Create `fadeLayers.ts` with `FADE_LAYERS` (every row above, each with a
  one-line comment citing the site it absorbs) + `seedFades`.
- [ ] Delete `registerOverlayFades.ts`; in `wireSlots.ts` replace the import +
  the `registerOverlayFades(state)` call (`wireSlots.ts:58,98`) with `seedFades`.
  Update the call-site comment (`wireSlots.ts:96–98`) to say "seed **every** fade
  handle from the manifest" (it now covers the demand-loaded + volumeField sets
  too, not just overlay/volume-master/label).
- [ ] Rename the test file to `fadeLayers.test.ts`. Keep the existing
  `registerOverlayFades` seed assertions, repointed to `seedFades`:
  - test `seedFades seeds the milky-way disk fade from settings.milkyWay.enabled
    (on → 1)` — fixture `milkyWay.enabled = true`, assert
    `fades.opacityOf({ kind: 'milkyWay' })` is `1`.
  - test `seedFades seeds the milky-way disk fade off (off → 0)`.
  - test `seedFades seeds proceduralDisks / texturedDisks at 1`.
  - test `seedFades seeds volumesMaster from settings.volumes.enabled`.
  - test `seedFades seeds the milky-way label from settings.milkyWay.labelEnabled`.
  - test `seedFades seeds galaxyNames + scaleBar at 1`.
  - test `seedFades seeds each structure ring + label from
    settings.structures.items[id]` — assert at least one off-by-settings case so
    a default-off structure sits at 0.
- [ ] **New coverage for the absorbed out-of-band rows** (the four
  demand-loaded sets — previously registered in slots/`initGpu`, never in the
  seed test):
  - test `seedFades registers every galaxy catalog at 0` — iterate
    `GALAXY_CATALOG_IDS`, assert each `opacityOf({ kind: 'galaxyCatalog', id })`
    is `0` (so the first-load fade-in is not lost — spec §70–76).
  - test `seedFades registers filament + flow at 0`.
  - test `seedFades registers every resident volume field at 0` — assert the
    production `VolumeFieldId`s (the `binBaseName !== null` set) are registered at
    `0`, and that a DEV-only `binBaseName: null` debug id is **not** registered at
    seed time (parity with today's `initGpu` behaviour). Use the registry as the
    source of truth, not a hardcoded id list.
  - Use a typed `vi.fn<() => void>()` for any `requestRender` stub in the
    fixture's fade-registry construction.
- [ ] `npm test -- fadeLayers` → green.
- [ ] `npm run typecheck` → clean.
- [ ] Commit (manifest + seed + wireSlots repoint, tests green).

---

## Task 3 — Drop the four out-of-band `register` sites (registration leaves them)

The fade-in `fadeTo(1)` calls **STAY** (Plan B dissolves them). This task removes
only the `register` calls now that `seedFades` owns registration. After it,
registration has exactly one home.

**Files:**

- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` — delete the
  `register({ kind: 'galaxyCatalog', id: … }, 0)` at `:154` and its comment
  (`:150–153`). The commit body's tier-swap `fadeTo`s (`:181`) stay untouched.
- `src/services/loading/slots/filamentSlot.ts` — delete the
  `register({ kind: 'filament' }, 0)` at `:30` and its comment (`:26–29`). The
  commit's `if (settings.filaments.enabled) fadeTo(1)` (`:50–52`) **stays**.
- `src/services/loading/slots/flowFieldSlot.ts` — delete the
  `register({ kind: 'flow' }, 0)` at `:36` and its comment (`:32–35`). The
  commit's `if (settings.flow.enabled) fadeTo(1)` (`:53–55`) **stays**.
- `src/services/engine/phases/initGpu.ts` — drop the
  `onFieldAdded`/`onFieldRemoved` callback object passed to
  `createVolumeFieldRenderer` (`:329–350`). The `volumeField` set is now seeded
  from the registry at construction.

**`createVolumeFieldRenderer` signature change** — removing the callbacks means
the factory's 4th arg goes away (or becomes optional). Read the factory before
editing:

- [ ] Read `createVolumeFieldRenderer`'s definition + its type
  (find it via Grep — likely `src/services/gpu/renderers/volumeFieldRenderer.ts`
  and a `@types/.../VolumeFieldRenderer*` deps type). Remove the
  `onFieldAdded`/`onFieldRemoved` deps from the factory signature, its deps type,
  and any internal call sites that invoked them. **Escalate if** the renderer
  uses those callbacks for anything beyond fade registration (it should not — the
  callback only `register`/`unregister`s, per `initGpu.ts:334–348` — but verify
  before deleting).
- [ ] Delete the four `register` sites + the renderer callbacks listed above.
- [ ] Update `initGpu.ts:324–328`'s comment block (which explains *why* the
  renderer went through callbacks) — replace with: the renderer is now fully
  FadeRegistry-agnostic; the manifest seeds the `volumeField` set at construction.
- [ ] Confirm no remaining `fades.register(` calls exist outside
  `fadeLayers.ts` (Grep `fades.register(` / `.register({ kind:` across `src/` —
  expect hits only in `fadeLayers.ts` and the registry's own tests).
- [ ] `npm run typecheck` → clean (a missed callback consumer is a compile error).
- [ ] `npm test` → full suite green. Update any slot/`initGpu`/volumeFieldRenderer
  test that asserted the old `register` call or the callbacks — those assertions
  move conceptually to Task 2's `seedFades` tests; delete the now-stale
  registration assertions rather than reproducing them per-slot.
- [ ] Commit.

---

## Task 4 — `entanglement-radar` on the diff

**Files:** none (review only).

Run the `entanglement-radar` skill over the Plan A diff. Confirm the invariants
the spec names for this plan (spec §269):

- [ ] **Registration has exactly one home** — every fade handle is registered
  only by `seedFades`; Grep proves no `fades.register(` outside `fadeLayers.ts`.
- [ ] **No renderer mutates the fade registry** — `volumeFieldRenderer` no longer
  receives `onFieldAdded`/`onFieldRemoved`; no GPU renderer references
  `subsystems.fades.register`/`unregister`.
- [ ] **The seed asymmetry is data, not prose** — settings-derived vs zero-seed
  lives in per-row `seed()` closures, not in a comment or a branch in
  `seedFades`. `seedFades` itself has no per-kind switch.
- [ ] **No new mirror** — `FADE_LAYERS` is the only enumeration of fade layers;
  the `volumeField` set derives from the existing volume registry (not a second
  hardcoded list), the structure set from `STRUCTURE_IDS`, the galaxy set from
  `GALAXY_CATALOG_IDS`.
- [ ] Record findings in the task log; if the radar flags a knot, STOP and report
  rather than self-resolving with a workaround.

---

## Definition of Done

- [ ] `npm test` green — baseline count from Task 0 plus the new `seedFades`
  registration tests (Task 2); no net coverage loss from the deleted slot/`initGpu`
  registration assertions (Task 3).
- [ ] `npm run typecheck` clean (both `src` and `tools` tsconfigs).
- [ ] `registerOverlayFades.ts` is **deleted**; `wireSlots` calls `seedFades`.
- [ ] `FADE_LAYERS` carries all 13 rows of the Task 2 table; `youAreHere` absent;
  Milky Way is two rows (disk + label).
- [ ] Grep finds **zero** `fades.register(` / `.register({ kind:` outside
  `fadeLayers.ts` (and the registry's own unit tests).
- [ ] `volumeFieldRenderer` no longer takes `onFieldAdded`/`onFieldRemoved`; the
  `volumeField` set seeds from the volume registry at construction.
- [ ] The slot-commit `fadeTo(1)` fade-in paths are **unchanged** (Plan B's job) —
  only *registration* moved.
- [ ] Frame-1 opacities identical to today (seed-coherence tests prove the
  settings-derived rows; the four demand-loaded rows seed at `0` so first-load
  fade-in is preserved).
- [ ] `entanglement-radar` invariants (Task 4) all hold; registration has exactly
  one home.
- [ ] No new TODO/FIXME comments introduced.
- [ ] No observable behaviour change in the running app (pure registration
  relocation).
