# Milky Way label consolidation — implementation plan

**Goal.** Fold the bespoke `youAreHere` label subsystem into the standard
category-label machinery so the Milky Way's "You are here" label works exactly
like structure / famous-galaxy labels — driven by a SOURCE_REGISTRY row, a
user toggle (`settings.milkyWay.labelEnabled`), the label director, and the
fade registry — while keeping its signature distance fade. This DELETES
`youAreHereSubsystem` and replaces it with a stateless bare producer function
`produceMilkyWayLabel(state, ctx)`, and renames the `LabelLayerId`
`'youAreHere'` → `'milkyWay'` everywhere.

**Architecture.** The Milky Way label becomes a first-class label category:

- Registry row `sources/milky-way.ts` flips `bearsLabel: false` → `true`,
  declares `labelLayer: 'milkyWay'`, and carries display copy
  (`detailLabel` / `shortLabel` / `plural` all `'Milky Way'`). That widens
  `LABEL_CATEGORIES` / `LabelCategory` to include `'milkyWay'` and lets
  `CATEGORY_DISPLAY_INFO['milkyWay']` resolve automatically.
- `LabelLayerId` gains `'milkyWay'` (replacing `'youAreHere'`); `CategoryLabelLayer`
  adds `'milkyWay'`.
- `settings.milkyWay` gains an independent `labelEnabled: boolean` axis
  (default `true`), separate from the disk `enabled` axis. A
  `setMilkyWayLabelEnabled` reducer / action / selector / handle setter mirror
  the existing `setMilkyWayEnabled` (disk) + `setStructureLabelEnabled` (label)
  trios.
- `registerOverlayFades` registers `{kind:'labelLayer', layer:'milkyWay'}` at
  `settings.milkyWay.labelEnabled` (mirroring the per-category structure label
  registration), so frame 1 honours the persisted toggle.
- `produceMilkyWayLabel(state, ctx)` is a bare function in `presentation/`,
  mirroring `produceStructureLabels`: a module-level load-in latch fires
  `fadeTo(handle, 1)` once on first intended-visible emit; the gate is
  `settings.milkyWay.labelEnabled`; the effective alpha is
  `youAreHereAlpha(camDist) × layerOpacity('milkyWay')`. It keeps the fixed 3D
  text `"You are here"`, the origin anchor, and the marker-line stem. It is
  registered via an inline `{ produceLabels }` wrapper in `engine.ts` next to
  the structure / famous registrations.
- `youAreHereVisibility.ts` (`youAreHereAlpha`) is renamed to a `milkyWay`
  name per the one-function-per-file convention (filename = export). The
  distance-fade numbers and behaviour are unchanged.

**Tech stack.** TS + Vite + React shell; raw WebGPU / WGSL renderer (untouched
here). Vitest for the suite. No `.bin` regeneration, no shader edits.

**Locked decisions (do not re-open — see the spec):**

- Rendered 3D text stays exactly `"You are here"`. Registry `label`/`id` is
  `'Milky Way'`/`'milkyWay'` and drives only settings / UI / `CATEGORY_DISPLAY_INFO`.
- Independent `settings.milkyWay.labelEnabled` axis (default `true`), separate
  from disk `enabled`.
- Distance fade stays a producer concern; alpha = `youAreHereAlpha × layerOpacity('milkyWay')`.
- `milkyWay` row: `bearsLabel:true`, `labelLayer:'milkyWay'`,
  `detailLabel`/`shortLabel`/`plural` = `'Milky Way'`.
- Rename `LabelLayerId` `'youAreHere'` → `'milkyWay'` (NO leftover `'youAreHere'`).
- DELETE `youAreHereSubsystem`; `produceMilkyWayLabel` is a bare function.

**Conventions (these override defaults).** One type per file in `src/@types/`
(filename = type name); one function per file in `utils/` / `presentation/`
(filename = export). No barrels. `type` aliases, never `interface`. `Vec2`/`Vec3`
aliases, never raw tuples. Didactic comments (explain why + the alternative).
Tests use typed `vi.fn<() => void>()`. Stage specific paths (never `git add -A` /
`git add .`); format only touched files. Branch is `milky-way-label-consolidation`.
Commits use the user's git identity with only the trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Gate.** `npm run typecheck` (both src + tools tsconfigs) and `npm test` must
both pass. The executing main thread runs these — implementer subagents do not
run npm/npx/git.

**Ordering note (rename atomicity).** The `LabelLayerId` rename
(`'youAreHere'` → `'milkyWay'`, Task 2) and the registry-row flip (Task 1) each
widen union types that several other modules consume. Land each rename + all its
in-lockstep consumers in ONE commit so the tree typechecks between commits.
Where a single task spans multiple files for this reason it is called out.

**Recommended task order: 2 → 3 → 4 → 1 → 5 → 6 → 7 → 8.** Task 4 (the
`setMilkyWayLabelEnabled` store trio, incl. `selectMilkyWayLabelEnabled`) is
pulled BEFORE Task 1 so Task 1's App call-site change can read the label flag via
the real selector instead of a throwaway inline closure (Task 4 has no dependency
on Task 1 — it only needs Task 3's `labelEnabled` field). Two hard dependencies
force the rest of the order:

1. Task 1's `labelLayer: 'milkyWay'` only typechecks once Task 2 has widened
   `CategoryLabelLayer` (already noted on Task 1).
2. **The instant Task 1 flips `milkyWay` to `bearsLabel:true`, `milkyWay` joins
   `LABEL_CATEGORIES`** — and `projectLabelCategoryVisibility` (currently Task 6)
   maps over `LABEL_CATEGORIES`, routing every non-structure category to
   `galaxyCatalogItems[c].labelEnabled`. There is no `galaxyCatalogItems['milkyWay']`,
   so the projector throws at runtime (the `c as GalaxyCatalogId` cast hides this
   from tsc — the projector test catches it). Therefore the projector's
   `milkyWay` READ branch must land **in Task 1's commit**, and the projector
   reads `settings.milkyWay.labelEnabled`, which Task 3 introduces — so **Task 3
   must precede Task 1**. The projector's read branch is specified in Task 1
   below; Task 6 keeps only the WRITE route (App `onSet…` → the handle setter,
   which needs Task 5's handle), the override-target collapse, and the DebugPanel
   dropdown.

> **REQUIRED SUB-SKILL: superpowers:subagent-driven-development**
> Execute each task via a fresh implementer subagent (run in background),
> then the main thread runs typecheck + tests and commits. Tick the task's
> `- [ ]` → `- [x]` inline with each completion. Plan style is
> **contract code only** (`docs/superpowers/conventions/plan-style.md`): test
> code in full; implementation steps give the signature + a prose description,
> never the body.

---

## Task 1: `milkyWay` registry row — `bearsLabel:true` + label copy

Flip the Milky Way SOURCE_REGISTRY row to a label-bearing category and add the
display copy so `LABEL_CATEGORIES`, `LabelCategory`, and `CATEGORY_DISPLAY_INFO`
pick it up. The row currently carries `bearsLabel:false` as a placeholder.

**Files:**

- `src/data/sources/milky-way.ts` (modify) — `bearsLabel: true`,
  `labelLayer: 'milkyWay'`, `detailLabel: 'Milky Way'`, `shortLabel: 'Milky Way'`,
  `plural: 'Milky Way'`.
- `src/@types/data/milkyWay/MilkyWaySourceEntry.d.ts` (modify) — drop the stale
  "A future change may set `bearsLabel: true`…" note from the docstring; the
  type already inherits the optional `labelLayer` / `detailLabel` / `shortLabel`
  / `plural` fields from `SourceEntryBase`, so no field additions are needed —
  verify and update the comment to current state.
- `tests/data/sources.test.ts` (modify) — add assertions.
- `src/services/engine/settingsStore/projectLabelCategoryVisibility.ts` (modify)
  — add the `milkyWay` READ branch (see "Projector" below). **This MUST land in
  this commit**, because flipping `bearsLabel:true` puts `milkyWay` in
  `LABEL_CATEGORIES`, and the projector maps over `LABEL_CATEGORIES`; without the
  branch it evaluates `galaxyCatalogItems['milkyWay'].labelEnabled` and throws.
- `tests/services/engine/settingsStore/` — extend the existing
  `projectLabelCategoryVisibility` test (search for it) with a milkyWay case.

> **Sequencing.** `labelLayer: 'milkyWay'` only typechecks once
> `CategoryLabelLayer` includes `'milkyWay'` (Task 2). The projector branch reads
> `settings.milkyWay.labelEnabled`, which Task 3 introduces. So **Tasks 2 and 3
> must precede this task** (recommended order 2 → 3 → 1). The contract below is
> unchanged regardless.

**Projector (read branch).** Extend `projectLabelCategoryVisibility` to take the
milkyWay label-enabled boolean and return it for the `'milkyWay'` category:

- **New signature:** `projectLabelCategoryVisibility(structureItems, galaxyCatalogItems, milkyWayLabelEnabled: boolean): Record<LabelCategory, boolean>`.
- **Behaviour:** for each `LABEL_CATEGORIES` entry, return `milkyWayLabelEnabled`
  when the category is `'milkyWay'`, else the existing structure-vs-galaxy-catalog
  partition. Update the docblock to name the third home (`settings.milkyWay`) and
  why it's a separate scalar argument, not an `items` record (the milkyWay label
  is a singleton-overlay axis with no per-record catalog — preserve this
  un-braided choice; do NOT synthesise an `items` row).
- The App call site (`App.tsx:275`) gains the third argument (read via
  `selectMilkyWayLabelEnabled` through `useSettingsStore`) + the `useMemo` dep.
  The App WRITE route stays in Task 6 (it needs Task 5's handle setter).

- [x] Add to `tests/data/sources.test.ts` the test
  `'milkyWay row bears a label on the milkyWay layer with display copy'`
  asserting:

```ts
import { SOURCE_REGISTRY, Source } from '../../src/data/sources';
import { LABEL_CATEGORIES } from '../../src/data/structure/labelCategories';
import { CATEGORY_DISPLAY_INFO } from '../../src/data/structure/categoryDisplayInfo';

test('milkyWay row bears a label on the milkyWay layer with display copy', () => {
  const row = SOURCE_REGISTRY[Source.MilkyWay];
  expect(row.bearsLabel).toBe(true);
  expect(row.labelLayer).toBe('milkyWay');
  expect(row.detailLabel).toBe('Milky Way');
  expect(row.shortLabel).toBe('Milky Way');
  expect(row.plural).toBe('Milky Way');
});

test('LABEL_CATEGORIES includes milkyWay', () => {
  expect(LABEL_CATEGORIES).toContain('milkyWay');
});

test('CATEGORY_DISPLAY_INFO resolves milkyWay copy', () => {
  expect(CATEGORY_DISPLAY_INFO.milkyWay).toEqual({
    label: 'Milky Way',
    shortLabel: 'Milky Way',
    plural: 'Milky Way',
  });
});
```

> Note: `CATEGORY_DISPLAY_INFO` (`categoryDisplayInfo.ts:21-34`) THROWS at
> module construction if a `bearsLabel:true` row is missing any of the three
> copy fields — so an incomplete row fails the whole suite loudly, not just
> these assertions.

- [x] Add the milkyWay case to the existing `projectLabelCategoryVisibility`
  test: `projectLabelCategoryVisibility(structureItems, galaxyCatalogItems,
  false).milkyWay === false` and `…(…, true).milkyWay === true`, with the
  structure + galaxy-catalog entries still projected correctly. Mirror the
  existing cases' shape.
- [x] Run fails (row still `bearsLabel:false`; projector arity / throw).
- [x] Implement the row edit + the docstring tidy on `MilkyWaySourceEntry.d.ts`
  + the projector read branch + the App call-site third argument.
- [x] Run passes (`npm test -- sources projectLabelCategoryVisibility`).
- [x] `npm run typecheck` — confirm `labelLayer: 'milkyWay'` typechecks (depends
  on Task 2 having landed or riding the same commit) and the projector signature
  change has no dangling call sites.
- [x] Commit. (Scope grew: widening `LabelCategory` forced the WRITE handle
  (`setMilkyWayLabelEnabled` + `EngineMilkyWayHandle.setLabelEnabled` + engine
  wiring) and the App write-route branch into this commit — pulled from Tasks 5/6.
  Also updated `engineSettingsState.itemVisibility.test.ts` +
  `labelCategories.test.ts` exhaustiveness fixtures.)

---

## Task 2: rename `LabelLayerId` `'youAreHere'` → `'milkyWay'` + widen `CategoryLabelLayer`

Rename the label-layer identity across the type union and every consumer in ONE
commit (the union narrows the legal `layer` strings, so all `{layer:'youAreHere'}`
sites must change together). Add `'milkyWay'` to `CategoryLabelLayer`.

**Files (all in one commit):**

- `src/@types/animation/LabelLayerId.d.ts` (modify) — union becomes
  `'milkyWay' | 'structure' | 'galaxyNames' | 'scaleBar'`; update the docblock's
  "Current layers" list (rename the `youAreHere` bullet to `milkyWay`).
- `src/@types/animation/CategoryLabelLayer.d.ts` (modify) — `Extract<LabelLayerId,
  'galaxyNames' | 'structure' | 'milkyWay'>`; update the docblock (milkyWay is now
  a category-routable layer; `scaleBar` remains the only excluded singleton).
- `src/@types/animation/FadeId.d.ts` (modify) — docblock only: rename the
  `labelLayer` kind's `(you-are-here, …)` / `(youAreHere/galaxyNames/scaleBar)`
  mentions to `milkyWay`.
- `src/services/engine/wiring/registerOverlayFades.ts` (modify) — this is also
  rewired in Task 5 (registering at the settings gate). For THIS task, the
  minimal change is the layer string: the existing
  `register({ kind: 'labelLayer', layer: 'youAreHere' }, 0)` line at
  `registerOverlayFades.ts:87` becomes `layer: 'milkyWay'`. (Task 5 changes the
  initial-opacity argument from `0` to the settings-derived value; keep the `0`
  here so the tree stays green between commits.) Update the surrounding docblock
  comments that name `youAreHere`.
- `src/services/animation/fadeRegistry.ts` (modify) — comment at line 65
  (`labelLayer:youAreHere`) → `labelLayer:milkyWay`.
- `src/services/engine/presentation/focusRecession.ts` (modify) — comment at
  line 81 (`pin ('youAreHere')`) → `'milkyWay'`.
- `tests/services/animation/fadeRegistry.test.ts` (modify) — any
  `layer: 'youAreHere'` literal → `'milkyWay'`.
- `tests/services/engine/presentation/focusRecession.test.ts` (modify) — same.
- `tests/services/engine/wiring/registerOverlayFades.test.ts` (modify) — any
  assertion on the `youAreHere` label-layer handle → `milkyWay`.

> **Out of scope here** (handled in later tasks so this commit is a pure
> rename): `youAreHereSubsystem.ts` (deleted in Task 5),
> `labelStyleOverride.ts` + `LabelEffectsSection.tsx` (Task 6),
> `youAreHereVisibility.ts` (Task 5 renames the file). The `{layer:'youAreHere'}`
> reference INSIDE `youAreHereSubsystem.ts:70` is left as-is in this task only if
> Task 5 lands immediately after; otherwise update it here too (the subsystem
> still typechecks against the renamed union only if its literal is renamed).
> **Simplest path: run Task 2 and Task 5 back-to-back**; if a gap is needed,
> rename the literal in `youAreHereSubsystem.ts:70` as part of THIS commit.

- [x] Update `tests/services/engine/wiring/registerOverlayFades.test.ts` to
  assert the `milkyWay` label-layer handle is registered (replacing the
  `youAreHere` assertion). Keep the asserted initial opacity at `0` (Task 5
  changes it).
- [x] Run the affected tests — they fail against the not-yet-renamed union.
- [x] Apply the rename across all files above (signature: `LabelLayerId` no
  longer contains `'youAreHere'`; `CategoryLabelLayer` now contains `'milkyWay'`).
- [x] `npm run typecheck` — must be green (this is the rename's correctness
  guard: any missed `'youAreHere'` literal surfaces here).
- [x] `npm test` — full suite green. (2717 passed; also updated
  `tests/services/engine/phases/wireSlots.test.ts`, outside the original list.)
- [x] Commit. (`ff8a2bb4`)

---

## Task 3: `settings.milkyWay.labelEnabled` axis + seed + fixtures

Add the independent label-visibility axis to the milkyWay settings cluster,
seed it (default `true`), and update every fixture / smoke test that constructs
a `milkyWay` settings object.

**Files:**

- `src/@types/settings/EngineSettingsState.d.ts` (modify) — the `milkyWay`
  cluster becomes `{ enabled: boolean; labelEnabled: boolean }`; update the
  docblock to name both axes (disk vs label, mirroring how `structures`
  documents `enabled` vs `labelEnabled`).
- `src/services/engine/engine.ts` (modify) — the settings seed at
  `engine.ts:318` gains `labelEnabled`. Seed it from a new default constant
  (next item) so engine + App agree.
- `src/data/defaults.ts` (modify) — add `DEFAULT_MILKY_WAY_LABEL_ENABLED`.
  **Signature:** `export const DEFAULT_MILKY_WAY_LABEL_ENABLED: boolean`.
  **Value:** `true` (the label was always-on-by-distance before — the toggle
  defaults on). A registry-derived value is NOT natural here: the registry row's
  `visible` gate governs the DISK (`DEFAULT_MILKY_WAY_ENABLED`), and there is no
  separate label-visible field on the row, so a plain `true` literal with a
  didactic comment is correct. Document why it's a literal, not registry-derived.
- `tests/services/engine/settingsStore/makeSettingsFixture.ts` (modify) — the
  `milkyWay` fixture at line 68 becomes
  `milkyWay: { enabled: DEFAULT_MILKY_WAY_ENABLED, labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED }`.
- `tests/@types/engineState.test.ts` (modify) — the two `milkyWay: { enabled: true }`
  literals (lines 103, 331) gain `labelEnabled: true`; the two
  `milkyWay: { enabled: DEFAULT_MILKY_WAY_ENABLED }` constructions (line 269 and
  any sibling) gain `labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED`.
- `tests/@types/engineSettingsState.itemVisibility.test.ts` (modify) — if it
  constructs or asserts on the `milkyWay` cluster, extend it for the new field.
  Read the file first; if it never touches `milkyWay`, no edit is needed (note
  that in the commit message).

- [x] Add to `tests/@types/engineState.test.ts` (or extend the existing
  settings-shape smoke test) an assertion that the constructed default state
  carries `state.settings.milkyWay.labelEnabled === true`. Use the existing
  state-construction helper in that file — do not hand-roll a new state.
- [x] Run fails (field absent / type error).
- [x] Add `DEFAULT_MILKY_WAY_LABEL_ENABLED` to `defaults.ts`, widen the
  `EngineSettingsState.milkyWay` type, extend the engine seed + all fixtures.
- [x] `npm run typecheck` — green (the type-widening forces every `milkyWay`
  literal to add the field; this surfaces them all).
- [x] `npm test` — green (2717 passed).
- [x] Commit.

---

## Task 4: `setMilkyWayLabelEnabled` reducer / action / selector / store test

Add the settings-store trio for the new label axis, mirroring the existing disk
trio (`setMilkyWayEnabled.ts` / `setMilkyWayEnabledAction.ts` /
`selectMilkyWayEnabled.ts`) and the structure-label trio
(`setStructureLabelEnabled.ts` reducer + action). No handle wiring yet (Task 5).

**Files (new):**

- `src/services/engine/settingsStore/reducers/setMilkyWayLabelEnabled.ts`
  **Signature:** `setMilkyWayLabelEnabled(state: EngineSettingsState, labelEnabled: boolean): EngineSettingsState`.
  **Behaviour:** copy-on-write at the `milkyWay` cluster only —
  `{ ...state, milkyWay: { ...state.milkyWay, labelEnabled } }`. Leaves
  `enabled` untouched. Mirror the docblock of `setMilkyWayEnabled.ts`
  (ref-stability rationale; the cosmetic fade stays in the handle, not here).
- `src/services/engine/settingsStore/actions/setMilkyWayLabelEnabledAction.ts`
  **Signature:** `setMilkyWayLabelEnabledAction(store: SettingsStore, labelEnabled: boolean): void`.
  **Behaviour:** `store.setState((s) => setMilkyWayLabelEnabled(s, labelEnabled))`.
  Mirror `setMilkyWayEnabledAction.ts`.
- `src/services/engine/settingsStore/selectors/selectMilkyWayLabelEnabled.ts`
  **Signature:** `selectMilkyWayLabelEnabled(state: EngineSettingsState): boolean`.
  **Behaviour:** returns `state.milkyWay.labelEnabled`. Mirror
  `selectMilkyWayEnabled.ts` (primitive return for `Object.is` snapshot compare).

**Files (modify):**

- `tests/services/engine/settingsStore/` — new test
  `setMilkyWayLabelEnabled.test.ts` (or extend an existing milkyWay store test
  if one exists — search first).

- [x] Add `tests/services/engine/settingsStore/setMilkyWayLabelEnabled.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { setMilkyWayLabelEnabled } from '../../../../src/services/engine/settingsStore/reducers/setMilkyWayLabelEnabled';
import { setMilkyWayEnabled } from '../../../../src/services/engine/settingsStore/reducers/setMilkyWayEnabled';
import { selectMilkyWayLabelEnabled } from '../../../../src/services/engine/settingsStore/selectors/selectMilkyWayLabelEnabled';
import { selectMilkyWayEnabled } from '../../../../src/services/engine/settingsStore/selectors/selectMilkyWayEnabled';
import { makeSettingsFixture } from './makeSettingsFixture';

describe('setMilkyWayLabelEnabled', () => {
  it('toggles only the label axis, leaving the disk axis untouched', () => {
    const base = setMilkyWayEnabled(makeSettingsFixture(), true);
    const next = setMilkyWayLabelEnabled(base, false);
    expect(selectMilkyWayLabelEnabled(next)).toBe(false);
    expect(selectMilkyWayEnabled(next)).toBe(true);
  });

  it('toggling the disk axis leaves the label axis untouched', () => {
    const base = setMilkyWayLabelEnabled(makeSettingsFixture(), false);
    const next = setMilkyWayEnabled(base, true);
    expect(selectMilkyWayEnabled(next)).toBe(true);
    expect(selectMilkyWayLabelEnabled(next)).toBe(false);
  });

  it('is copy-on-write: returns a new state and milkyWay object', () => {
    const base = makeSettingsFixture();
    const next = setMilkyWayLabelEnabled(base, !base.milkyWay.labelEnabled);
    expect(next).not.toBe(base);
    expect(next.milkyWay).not.toBe(base.milkyWay);
    expect(next.tonemap).toBe(base.tonemap); // sibling cluster untouched
  });
});
```

- [x] Run fails (modules absent).
- [x] Create the reducer, action, and selector.
- [x] Run passes (`npm test -- setMilkyWayLabelEnabled`). (2720 passed; kept
  `tonemap` sibling in the copy-on-write assertion.)
- [x] `npm run typecheck`.
- [x] Commit.

---

## Task 5: `produceMilkyWayLabel` bare function + DELETE `youAreHereSubsystem` + engine wiring + fade registration

The core consolidation. Lift the label + line construction out of
`youAreHereSubsystem` into a stateless bare producer mirroring
`produceStructureLabels`, delete the subsystem and all its wiring, rename the
visibility helper file, register the producer inline in `engine.ts`, and
register the `milkyWay` label-layer fade at the settings gate.

> **Land as one commit.** Deleting the subsystem, removing its
> `EngineSubsystemHandles` slot, and adding the inline producer registration are
> mutually dependent (the slot's type + the construction + the registration +
> the destroy call all reference each other). A partial landing won't typecheck.

**Files (new):**

- `src/services/engine/presentation/milkyWayLabelStyle.ts`
  **Exports:** `export type MilkyWayLabelStyle = { ... }` + `export const
  MILKY_WAY_LABEL_STYLE: MilkyWayLabelStyle`. **Mirror `famousLabelStyle.ts`**
  (the closest analog — a single label-only style object, no halo/ring). Lift the
  static style constants currently inline in `youAreHereSubsystem.ts:42-50` into
  the const: `labelColor: [1, 1, 1, 1]` (display white), `lineColor: [1, 1, 1, 1]`,
  `worldEmMpc: 0.0125`, `minPixelSize: 45`, `maxPixelSize: 150`, `pixelWidth: 3`,
  `outlineColor: [0, 0, 0, 0.1]`, `outlineEmFrac: 0.16`. Type fields: `labelColor`,
  `lineColor`, `minPixelSize`, `maxPixelSize`, `worldEmMpc`, `pixelWidth`,
  `outlineColor`, `outlineEmFrac` (all `readonly`; `Vec4` for the colors). Didactic
  docblock mirroring `famousLabelStyle.ts`'s header (label-only, renders in the
  `uiOverlay` pass after tone-map so colours are straight LDR — lift the
  LDR-colour rationale from `youAreHereSubsystem.ts:38-41`). This consolidates the
  Milky Way label's styling into the per-producer style-module pattern the
  structure / famous producers already use, instead of loose producer-scope consts.
- `src/services/engine/presentation/produceMilkyWayLabel.ts`
  **Signature:** `produceMilkyWayLabel(state: EngineState, ctx: ReadyFrameContext): LabelProducerOutput`
  plus a test-only latch reset `export function __resetMilkyWayLabelLoadIn(): void`.
  **Behaviour (mirror `produceStructureLabels.ts` + lift from
  `youAreHereSubsystem.ts:38-126`):**
  - A module-level `loadInFired: boolean` latch (single label, so a boolean —
    not the `Set<Category>` the structure producer needs). Fire
    `fades.fadeTo({kind:'labelLayer', layer:'milkyWay'}, 1, FADE_IN_DURATION_MS)`
    once on the first INTENDED-VISIBLE emit (i.e. `labelEnabled` true), gated on
    the boolean exactly as `produceStructureLabels.ts:196-203`. `__resetMilkyWayLabelLoadIn`
    clears it for tests.
  - Read `layerOpacity = fades.opacityOf({kind:'labelLayer', layer:'milkyWay'}, now)`.
  - Gate: `const labelEnabled = state.settings.milkyWay.labelEnabled;
    if (!labelEnabled && layerOpacity === 0) return { labels: [], lines: [], awake: false };`
    — the same all-or-nothing skip the structure producer uses.
  - Distance fade: `const distAlpha = milkyWayLabelAlpha(camDist)` from the
    renamed helper (next item). If `distAlpha <= 0` return empty (no label/line
    this frame — but the load-in latch must NOT fire when distAlpha is 0; gate
    the latch fire on an actual intended-visible emit, same as the structure
    producer fires only when it pushes a candidate).
  - `const fadeAlpha = distAlpha * layerOpacity;` applied to BOTH the label and
    the line.
  - Emit exactly one `Label` (id `'milkyWay'` — same as the source id; text
    `'You are here'`, origin anchor `[0, LABEL_ANCHOR_MPC, 0]`) and one
    `MarkerLine` stem (`ownerLabelId: 'milkyWay'`). Read ALL static style fields
    (`labelColor` → `color`, `worldEmMpc`, `minPixelSize`, `maxPixelSize`,
    `outlineColor`, `outlineEmFrac`, line `pixelWidth` + `lineColor`) from
    `MILKY_WAY_LABEL_STYLE` (the new module above) — do NOT re-declare them as
    producer-scope consts. The label keeps `font: 'cormorant'`, `alignX: 'center'`,
    `pixelSize: 0` (legacy field, ignored by the worldEm sizing model). The line
    geometry (`fromWorld: [0,0,0]`, `toWorld: [0, LINE_TOP_MPC, 0]`) stays in the
    producer (it is anchor geometry, not style). NOTE: the OLD subsystem used the
    Label id `'you-are-here'`; the new producer uses `'milkyWay'` (matching the
    registry source id) — only the rendered TEXT stays `'You are here'`. Update any
    test that asserted the old id.
  - Live-tuning override: read `getLabelStyleOverride()`; apply the override
    outline fields when `override.targetCategory === 'milkyWay'` (was
    `'youAreHere'`), mirroring `youAreHereSubsystem.ts:80-87` /
    `produceStructureLabels.ts:206-210`.
  - `awake: false` (alpha is a pure function of camera distance; camera motion
    wakes the loop — preserve the `youAreHereSubsystem.ts:120-125` rationale in
    the comment).
  - **Didactic module header**: explain it is a bare function (not a subsystem),
    why the load-in latch lives at module scope, and why the distance fade stays
    a producer concern (lift the rationale from the spec's "Why the distance
    fade stays a producer concern" section).

- `src/services/gpu/labels/milkyWayLabelVisibility.ts` (renamed from
  `youAreHereVisibility.ts`)
  **Exports:** `milkyWayLabelAlpha(cameraDistMpc: number): number`,
  `MILKY_WAY_LABEL_NEAR_MPC`, `MILKY_WAY_LABEL_FAR_MPC` (renamed from
  `youAreHereAlpha` / `YOU_ARE_HERE_NEAR_MPC` / `YOU_ARE_HERE_FAR_MPC`). Logic +
  numbers (0.6 / 2.0 Mpc smoothstep) unchanged. Update the module docblock to
  the milkyWay name.

**Files (deleted):**

- `src/services/engine/subsystems/youAreHereSubsystem.ts`
- `src/@types/engine/subsystems/YouAreHereSubsystem.d.ts`
- `src/services/gpu/labels/youAreHereVisibility.ts` (becomes the renamed file
  above)
- `tests/services/engine/subsystems/youAreHereSubsystem.test.ts` (replaced by
  the producer test below)
- `tests/services/engine/subsystems/youAreHereSubsystem.labelEffects.test.ts`
  (port any still-relevant override assertion into the producer test; otherwise
  delete — note the decision in the commit message)
- `tests/services/gpu/labels/youAreHereVisibility.test.ts` (becomes the renamed
  test below)

**Files (renamed test):**

- `tests/services/gpu/labels/milkyWayLabelVisibility.test.ts` — the body of the
  old `youAreHereVisibility.test.ts` with imports + symbol names updated to
  `milkyWayLabelAlpha` / `MILKY_WAY_LABEL_NEAR_MPC` / `MILKY_WAY_LABEL_FAR_MPC`.
  Assertions (1.0 below NEAR, 0.0 above FAR, smooth + monotonic between)
  unchanged.

**Files (modify):**

- `src/services/engine/engine.ts`:
  - Remove `import { createYouAreHereSubsystem } …` (line 117); add
    `import { produceMilkyWayLabel } from './presentation/produceMilkyWayLabel'`.
  - Remove the `youAreHere: createYouAreHereSubsystem(),` slot (line 514) from
    the `subsystems` bag.
  - Replace `registerProducer(state.subsystems.youAreHere)` (line 603) with an
    inline wrapper next to the structure/famous registrations:
    `state.subsystems.labelDirector.registerProducer({ id: 'milkyWayLabel', produceLabels: produceMilkyWayLabel });`.
    Update the "Registration order = merged label order: youAreHere, …" comment
    (lines 597-602) to name `milkyWayLabel`.
  - Remove `state.subsystems.youAreHere.destroy();` (line 1091).
  - NOTE: the `milkyWay.setLabelEnabled` handle setter + the
    `EngineMilkyWayHandle.setLabelEnabled` type + the `setMilkyWayLabelEnabled`
    handle file ALREADY LANDED IN TASK 1 (widening `LabelCategory` forced the App
    write route — which needs the handle — into Task 1's commit). Task 5 does NOT
    touch the handle. It only deletes the subsystem and adds the producer +
    registerOverlayFades change below.
- `src/@types/engine/handles/EngineSubsystemHandles.d.ts` — remove the
  `import { YouAreHereSubsystem } …` (line 29) and the `youAreHere: YouAreHereSubsystem;`
  slot (line 98); update the surrounding docblock that names the you-are-here pin.
- `src/services/engine/wiring/registerOverlayFades.ts` — change the milkyWay
  label-layer registration (renamed in Task 2 to
  `register({ kind: 'labelLayer', layer: 'milkyWay' }, 0)`) so the initial
  opacity is settings-derived:
  `state.settings.milkyWay.labelEnabled ? 1 : 0`. Move it down next to (or keep
  it grouped with) the other settings-derived label registrations, and rewrite
  the "youAreHere starts at 0: its subsystem producer fires fadeTo(1)…"
  docblock paragraphs to the new model (milkyWay registered at its persisted
  `labelEnabled`; `produceMilkyWayLabel` fires the load-in on first
  intended-visible emit — mirroring the per-category structure paragraph).
- `src/services/engine/phases/initGpu.ts` — update the comments at lines
  209-210 that name `youAreHere` to `milkyWayLabel` / the producer.
- `src/services/engine/frame/runFrame.ts` — comment at line 247 (`(youAreHere,
  structures, …)`) → `milkyWayLabel`.
- `src/services/engine/subsystems/labelDirectorSubsystem.ts` — update the
  comments at lines 24/31/40/62/94/113/118/173 that reference `youAreHere` /
  `youAreHereSubsystem` to `produceMilkyWayLabel` / the milkyWay label (the
  director's behaviour is unchanged — it just calls each registered producer).
- `src/services/engine/presentation/produceFamousLabels.ts` — comment at line 27
  (`youAreHereSubsystem labels the user's…`) → `produceMilkyWayLabel`.
- **Stale-identifier comment sweep** (these name the deleted `youAreHereSubsystem`
  or the renamed `youAreHereVisibility` helper and become dangling references; the
  rendered phrase `"You are here"` and the `'you-are-here'` Label id are NOT
  touched — only the camelCase symbol names): `src/@types/rendering/Label.d.ts:88`
  + `src/@types/rendering/MarkerLine.d.ts:21` (`youAreHereVisibility` →
  `milkyWayLabelVisibility`); `src/@types/rendering/LabelRenderer.d.ts:21` +
  `src/@types/rendering/MarkerLineRenderer.d.ts:20` (`youAreHereSubsystem.runFrame`
  → `produceMilkyWayLabel`); `src/services/engine/frame/encodeUiOverlay.ts:14`,
  `src/services/engine/frame/passes/labelsPass.ts:29`,
  `src/services/engine/frame/passes/markerLinesPass.ts:28`,
  `src/services/engine/frame/passes/index.ts:60` (`youAreHereSubsystem` →
  `produceMilkyWayLabel`). These are comment-only edits; tsc won't flag them, so
  they ride this commit by inspection (Task 8's grep is the backstop).
- `tests/services/engine/phases/initGpu.destroyReachability.test.ts` — drop any
  assertion that `state.subsystems.youAreHere.destroy()` is reachable; the
  subsystem is gone. The producer has no teardown (bare function). Adjust the
  destroy-reachability expectation accordingly.
- `tests/services/engine/phases/wireSlots.test.ts` — update any `youAreHere`
  reference (e.g. asserting the label-layer fade is registered) to `milkyWay`.
- `tests/services/engine/subsystems/labelDirectorSubsystem.test.ts` and
  `…labelDirectorSubsystem.override.test.ts` — if they construct or reference a
  `youAreHere` producer/id, update to `milkyWayLabel` / `produceMilkyWayLabel`.

- [x] Add `tests/services/engine/presentation/produceMilkyWayLabel.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  produceMilkyWayLabel,
  __resetMilkyWayLabelLoadIn,
} from '../../../../src/services/engine/presentation/produceMilkyWayLabel';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';

// Minimal state: the producer reads settings.milkyWay.labelEnabled, the fade
// registry (opacityOf + fadeTo), the selection focused() is not consulted (single
// label, no recession), and the label-style override (global module, no stub).
function makeState(labelEnabled: boolean, layerOpacity: number): EngineState {
  return {
    settings: { milkyWay: { enabled: true, labelEnabled } },
    subsystems: {
      fades: {
        opacityOf: () => layerOpacity,
        fadeTo: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
    },
  } as unknown as EngineState;
}

function makeCtx(camDistMpc: number): ReadyFrameContext {
  return { drawCamPos: [camDistMpc, 0, 0] } as unknown as ReadyFrameContext;
}

describe('produceMilkyWayLabel', () => {
  afterEach(() => __resetMilkyWayLabelLoadIn());

  it('emits one label and one line at full alpha when close (<= 0.6 Mpc) and enabled', () => {
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(0.5));
    expect(out.labels).toHaveLength(1);
    expect(out.lines).toHaveLength(1);
    expect(out.labels[0]!.id).toBe('milkyWay'); // id = source id; text stays below
    expect(out.labels[0]!.text).toBe('You are here');
    expect(out.lines[0]!.ownerLabelId).toBe('milkyWay');
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(1);
    expect(out.lines[0]!.fadeAlpha).toBeCloseTo(1);
  });

  it('emits nothing far away (>= 2 Mpc) even when enabled', () => {
    const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(2.0));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('emits nothing when the label axis is disabled and faded out', () => {
    const out = produceMilkyWayLabel(makeState(false, 0), makeCtx(0.5));
    expect(out.labels).toEqual([]);
    expect(out.lines).toEqual([]);
  });

  it('multiplies the layer opacity into the distance fade', () => {
    const out = produceMilkyWayLabel(makeState(true, 0.5), makeCtx(0.5));
    // distAlpha = 1 at 0.5 Mpc, layerOpacity = 0.5 → 0.5
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.5);
  });

  it('keeps emitting the fade-out tail when disabled but still fading (opacity > 0)', () => {
    const out = produceMilkyWayLabel(makeState(false, 0.3), makeCtx(0.5));
    expect(out.labels).toHaveLength(1);
    expect(out.labels[0]!.fadeAlpha).toBeCloseTo(0.3);
  });

  it('fires the load-in fadeTo(1) once on first intended-visible emit', () => {
    const state = makeState(true, 1);
    produceMilkyWayLabel(state, makeCtx(0.5));
    produceMilkyWayLabel(state, makeCtx(0.5));
    expect(state.subsystems.fades.fadeTo).toHaveBeenCalledTimes(1);
    expect(state.subsystems.fades.fadeTo).toHaveBeenCalledWith(
      { kind: 'labelLayer', layer: 'milkyWay' },
      1,
      expect.any(Number),
    );
  });

  it('does not fire the load-in while disabled and fading out', () => {
    const state = makeState(false, 0.3);
    produceMilkyWayLabel(state, makeCtx(0.5));
    expect(state.subsystems.fades.fadeTo).not.toHaveBeenCalled();
  });

  it('reports awake: false across the fade band', () => {
    for (const r of [0.1, 0.5, 0.8, 1.1, 1.5]) {
      const out = produceMilkyWayLabel(makeState(true, 1), makeCtx(r));
      expect(out.awake).toBe(false);
      __resetMilkyWayLabelLoadIn();
    }
  });
});
```

- [x] Add the renamed `tests/services/gpu/labels/milkyWayLabelVisibility.test.ts`
  (old `youAreHereVisibility.test.ts` body with symbols renamed).
- [x] Run fails (producer + renamed helper absent).
- [x] Create `milkyWayLabelVisibility.ts`, create `produceMilkyWayLabel.ts` +
  `milkyWayLabelStyle.ts`, delete `youAreHereVisibility.ts` +
  `youAreHereSubsystem.ts` + `YouAreHereSubsystem.d.ts`, rewire `engine.ts` /
  `EngineSubsystemHandles` / `registerOverlayFades` / the comment-only files,
  delete the obsolete subsystem tests. (`EngineMilkyWayHandle` handle setter
  already landed in Task 1.)
- [x] `npm run typecheck` — green (the removed `youAreHere` subsystem slot +
  renamed helper must have no dangling references).
- [x] `npm test` — full suite green (2727 passed). Also fixed
  `tests/@types/engineState.test.ts` (removed the deleted-subsystem construction).
- [x] Commit.

---

## Task 6: collapse the `'youAreHere'` override target (DebugPanel / labelStyleOverride)

The user-facing label-style-override target string still carries a separate
`'youAreHere'` literal. Now that `milkyWay` is a `LabelCategory` (Task 1),
collapse the override target to `LabelCategory` and update the DebugPanel dropdown.

> The projector READ branch AND the App write route (`onSetLabelCategoryVisibility`
> → `milkyWay.setLabelEnabled`) already landed in Task 1 — widening `LabelCategory`
> forced the exhaustive write route into that commit. This task is now ONLY the
> override-target type collapse + the DebugPanel dropdown + the override test
> literal rename.

**Files:**

- `src/services/engine/labelStyleOverride.ts` — `LabelStyleOverrideTarget`
  becomes just `LabelCategory` (was `'youAreHere' | LabelCategory`): `milkyWay`
  is now a member of `LabelCategory`, so the separate literal is redundant.
  Update the docblock (line 36-40).
- `src/components/DebugPanel/LabelEffectsSection.tsx` — `CATEGORIES` becomes
  `LABEL_CATEGORIES` (drop the leading `'youAreHere'` spread at line 24); the
  dropdown is now exactly the registry's label-bearing categories (which include
  `milkyWay`). Update the comments at lines 5/21-24 that name `youAreHere` /
  `youAreHereSubsystem` → `produceMilkyWayLabel` / `milkyWay`.
- `tests/services/engine/subsystems/labelDirectorSubsystem.override.test.ts` —
  the two `targetCategory: 'youAreHere'` literals (lines 97, 116) become
  `'milkyWay'`. These would otherwise be typecheck errors the instant
  `LabelStyleOverrideTarget` drops `'youAreHere'`. (The `id: 'you-are-here'`
  sample-label literals in `labelDirectorSubsystem.test.ts` are arbitrary
  director-dedup fixtures — leave them; they are not the override target and the
  produced label keeps the `'you-are-here'` id.)
- `src/components/App/App.tsx` — NO change here; the `onSetLabelCategoryVisibility`
  milkyWay branch already landed in Task 1.

> **Entanglement note (preserve the spec's un-braided choices).** The label
> axis now lives in THREE homes (structure items, galaxy-catalog items,
> `settings.milkyWay.labelEnabled`). This is the spec's deliberate, essential
> choice: the milkyWay label is an independent axis on a singleton overlay, not
> an `items[id]` row (milkyWay has no per-record catalog). Do NOT invent a
> synthetic `items` row to force uniformity — that would braid the singleton
> overlay into the per-record item model. The projector merging three homes
> into one derived `Record<LabelCategory, boolean>` is a pure view, not a fourth
> copy. Keep it a projection.

- [ ] Run the affected tests / typecheck — `override.test.ts` fails to typecheck
  once `LabelStyleOverrideTarget` collapses (drives the literal rename).
- [ ] Apply the override-target collapse, the DebugPanel dropdown change, and the
  `override.test.ts` literal renames. (App write route already done in Task 1.)
- [ ] `npm run typecheck` — green.
- [ ] `npm test` — green.
- [ ] Commit.

---

## Task 7: SettingsPanel — verify the Milky Way label toggle row appears

The SettingsPanel's Labels section already iterates `LABEL_CATEGORIES`
(`SettingsPanel.tsx:844-854`), rendering one checkbox per category from
`labelCategoryVisibility[cat]` + `onSetLabelCategoryVisibility`. With `milkyWay`
now in `LABEL_CATEGORIES` (Task 1) and routed (Task 6), the "Milky Way" label
toggle row appears automatically. This task confirms that — and updates the
section's stale comment that says the you-are-here label is "expressed via the
famousGalaxy category for the Milky Way pseudo-entry".

**Files:**

- `src/components/SettingsPanel/SettingsPanel.tsx` — update the Labels-section
  comment (lines 826-832) to current state: the Milky Way label is now its own
  `milkyWay` category row (no longer routed through famousGalaxy). Also update
  the line 35 comment if it still claims the Milky Way toggle is "gone from" the
  panel in a way that's now misleading (the DISK toggle may still be elsewhere;
  the LABEL toggle now lives in the Labels section — clarify).
- `tests/components/SettingsPanel/` — if a test enumerates the Labels-section
  rows, extend it to expect a `milkyWay` row. Search for an existing
  SettingsPanel Labels test; if none asserts on the category list, no test edit
  is required (note that in the commit message). Do NOT add a brittle snapshot.

> **No new prop wiring.** If the implementer finds the row already renders
> correctly via the existing `LABEL_CATEGORIES.map(...)` loop, the only code
> change is the comment tidy. Verify by reading `SettingsPanel.tsx:825-855` and
> confirming `labelCategoryVisibility.milkyWay` / the `onSet…` route are both
> populated by Task 6.

- [ ] Confirm (by reading the Labels-section loop + Task 6's projector/route)
  that the milkyWay row renders and toggles. If a behavioural test is feasible
  without a full GPU engine, add one asserting the Labels section includes a
  row whose label is `CATEGORY_DISPLAY_INFO.milkyWay.plural` ('Milky Way').
- [ ] Update the stale comments.
- [ ] `npm run typecheck` + `npm test` — green.
- [ ] Commit.

---

## Task 8: entanglement-radar review + full gate

Run the simplicity lens over the diff, then the full gate.

**Files:** none (review + verification).

- [ ] Run the `entanglement-radar` skill over the full branch diff. Focus
  points:
  - The label axis's three homes (structure items / galaxy-catalog items /
    `settings.milkyWay.labelEnabled`) — confirm the projector is a pure view,
    not a fourth copy, and that no synthetic `items` row was introduced to force
    false uniformity (this is the spec's essential asymmetry: singleton overlay
    vs per-record items — keep it un-braided).
  - The distance fade staying a producer concern (`milkyWayLabelAlpha` inside
    `produceMilkyWayLabel`) — confirm it composes with `layerOpacity('milkyWay')`
    rather than the layer machinery learning a Milky-Way special case.
  - The module-level load-in latch — confirm it mirrors the structure
    producer's pattern (boolean here vs `Set<Category>` there is the essential
    single-vs-many difference, not accidental).
  - Confirm no `youAreHere` **camelCase identifier** survives in `src/` or
    `tests/` (grep `youAreHere` case-sensitive — this catches the deleted
    `youAreHereSubsystem`, the renamed `youAreHereVisibility`/`youAreHereAlpha`,
    and the `'youAreHere'` layer / override-target literals). **Deliberately
    KEEP**: the rendered 3D text `"You are here"` and prose mentions of the "you
    are here" marker concept — these are the iconic label text, not symbol names.
    The rename is complete when no `youAreHere` identifier remains, not when the
    phrase is gone. NOTE: the Milky Way label's own id is now `'milkyWay'` (was
    `'you-are-here'`); any remaining `'you-are-here'` literals are arbitrary
    label-director test fixtures (sample labels for dedup/prominence tests, not
    the real producer) and may stay.
- [ ] Apply any small un-braiding the radar surfaces (or record "no significant
  complecting found").
- [ ] `npm run typecheck` (both src + tools tsconfigs) — green.
- [ ] `npm test` — full suite green (≥ the current 590+ tests, with the
  youAreHere tests replaced by milkyWay equivalents).
- [ ] `npm run format` on touched files only.
- [ ] Commit any review fixups.

---

## Definition of done

- `settings.milkyWay` carries `{ enabled, labelEnabled }`; the label axis
  defaults `true` and is independent of the disk axis.
- The Milky Way "You are here" label is produced by the bare
  `produceMilkyWayLabel`, registered inline in `engine.ts`; `youAreHereSubsystem`
  + its `@types` + its `EngineSubsystemHandles` slot are gone.
- `LabelLayerId` has `'milkyWay'` and no `'youAreHere'`; the fade registry
  registers the milkyWay label layer at the persisted toggle (frame 1 honours a
  last-session-off label).
- The 3D text is still exactly `"You are here"`; the registry copy / settings /
  DebugPanel / SettingsPanel all say "Milky Way".
- The distance fade is preserved (full ≤ 0.6 Mpc, gone ≥ 2 Mpc) and multiplies
  with the layer opacity.
- No `youAreHere` camelCase identifier remains in `src/` or `tests/` (the
  rendered text `"You are here"` and the `'you-are-here'` Label id are preserved).
- `npm run typecheck` + `npm test` green.
