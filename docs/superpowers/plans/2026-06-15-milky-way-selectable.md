# Milky Way as a First-Class Selectable Source (Part 2)

> **Depends on** `docs/superpowers/plans/2026-06-15-selection-target-unification.md`
> (Part 0) **and** `docs/superpowers/plans/2026-06-15-fade-source-naming-consistency.md`
> (Part 1). **Execute this plan only after both have landed.** This plan assumes the
> **tagged-union + table-dispatch world** Part 0 leaves behind:
>
> - The `Selection` union is gone; the selection slots hold `FocusableTarget | null`.
> - `FocusableTarget` is a **tagged** discriminated union keyed on a `type` field
>   (`type: FocusableTargetType`), with `FocusableTargetType = 'galaxyCatalog' |
>   'structure' | 'milkyWay'` mirroring the `SOURCE_REGISTRY` row `type`.
> - `StructureRecord` has been **renamed `StructureInfo`** (Part 0). `FocusableTarget =
>   GalaxyInfo | StructureInfo (| MilkyWayInfo, this plan)`.
> - Dispatch is **table lookup keyed on `target.type`**, not an `isStructure` ternary:
>   `DETAIL_CARD[target.type]`, `URL_HASH_FOR[target.type]`, `COMMIT_FOCUS[target.type]`.
>   The structural `isStructure` sniff is retired; simple guards narrow on
>   `target.type === 'structure'`.
> - `resolvePick(pick, deps): FocusableTarget | null` is the pure pick resolver,
>   dispatching on `SOURCE_REGISTRY[code].type`.
> - The MW disk fade is `{ kind: 'milkyWay' }` (Part 1), not `{ kind: 'overlay', id:
>   'milkyWay' }`; `StructureId` has replaced `StructureCategory`.
>
> **Cite the current files — do not trust this plan's snapshots over what Part 0 / Part 1
> left in the tree.** Because Part 0 delivered a properly tagged union, the MW is a **new
> arm + one table row per dispatch** — there is **no `Selection` variant to add, no
> `isMilkyWay` predicate, no `as`-cast site audit, and no `selectionRingPass` stopgap**.
> The tagged union narrows safely; the tables make the MW a one-row add.

**Feature:** Promote the Milky Way to a fully selectable first-class source — clickable
in-scene (a pick-only invisible billboard), an InfoCard, and the standard
select → focus path — retiring the bespoke `__milky-way__` palette sentinel, the
`App.tsx` onSelect interception, and the standalone `focusOnMilkyWay` camera method.

**REQUIRED SUB-SKILL:** Execute this plan with `superpowers:subagent-driven-development`
— a fresh implementer subagent per task (run in background), with spec + quality reviews
between tasks. The main thread runs `npm test` / `npm run typecheck` and commits.

## Goal

After this plan, the Milky Way's identity / selection / focus flow through the exact
same plumbing as every other source. A single resolved-target value, `MILKY_WAY_INFO`
(`MilkyWayInfo` arm of the tagged `FocusableTarget` union, `type: 'milkyWay'`), is the
one thing held in the selection slots, rendered by the InfoCard (via the
`DETAIL_CARD['milkyWay']` table row), ringed by `selectionRingPass`, and focused by
`commitFocus` (via `COMMIT_FOCUS['milkyWay']`). There is **no MW-specific public
method** — `camera.focusOn(MILKY_WAY_INFO)` is the only entry point. The
procedural-disk renderer stays bespoke by design; only the identity axis is unified.

## Architecture

- `MilkyWayInfo` is a third arm of the tagged `FocusableTarget` union, carried as a
  single static const `MILKY_WAY_INFO`. Its tag is `type: 'milkyWay'` — the **union
  discriminant**, mirroring its `SOURCE_REGISTRY` row's `type`, NOT a bespoke
  discriminant and NOT "the arm with no `category` field". The tag is what every table
  and every `target.type === ...` guard keys on, so the union narrows safely with no
  `as` casts.
- The MW slots into the Part 0 tables by **adding one row each** — no edits to the
  existing dispatch logic:
  - `DETAIL_CARD['milkyWay'] = MilkyWayDetailCard`
  - `URL_HASH_FOR['milkyWay'] = () => null` (clears the focus hash — deep-linking deferred)
  - `COMMIT_FOCUS['milkyWay'] = commitMilkyWayFocus`
- A new pick provider — a tiny screen-size-clamped billboard at `MILKY_WAY_CENTER_WORLD`
  — stamps `packSelection(Source.MilkyWay, 0) + PICK_SENTINEL_OFFSET` into the r32uint
  pick texture, mirroring `structureMarkerRenderer.pickRing`. It is gated on MW disk
  visibility (the `{ kind: 'milkyWay' }` fade opacity > 0) so the MW is never pickable
  once the disk has faded out. The decode (`unpackPick`) is unchanged — code 16
  round-trips.
- `resolvePick` grows a `type === 'milkyWay'` branch returning `MILKY_WAY_INFO`.
- `targetEq` grows a `milkyWay` arm (singleton self-equality).
- `selectionRingPass` grows a `milkyWay` branch reading `MILKY_WAY_CENTER_WORLD` off the
  target; its `enabled()` covers `type === 'galaxyCatalog' || type === 'milkyWay'`.
- `commitMilkyWayFocus` tweens to `MILKY_WAY_VIEW_DISTANCE_MPC` at
  `MILKY_WAY_CENTER_WORLD`, wired via the `COMMIT_FOCUS` table row; the bespoke
  `focusOnMilkyWay` camera method is retired.
- The palette gets a typed first-class MW command whose select action calls
  `camera.focusOn(MILKY_WAY_INFO)`; the sentinel pseudo-entry + onSelect special-case
  are deleted.

## Tech Stack

TypeScript + React (UI shell), raw WebGPU + WESL (pick billboard). Tests: Vitest,
mirroring `src/`. Conventions per `CLAUDE.md`: one type per file in `src/@types/`
(filename = type name), one fn per file in helpers, `type` not `interface`, `Vec2/Vec3`
aliases, deep relative imports (no barrels), didactic comments, typed `vi.fn<() => void>()`.

---

### Task 1: `MilkyWayInfo` type + `MILKY_WAY_INFO` const

Introduce the resolved-target type and its single static value. No wiring yet — this
task only adds the type + const + their tests, and must stay green standalone.

**Files:**
- `src/@types/engine/MilkyWayInfo.d.ts` (new — one type per file)
- `src/data/milkyWay/milkyWayInfo.ts` (new — one const)
- `tests/data/milkyWay/milkyWayInfo.test.ts` (new)

**Type shape** (`MilkyWayInfo.d.ts`) — the discriminant is `type: 'milkyWay'` (the
union tag, mirroring the `SOURCE_REGISTRY` row at `src/data/sources/milky-way.ts`). It
carries `x/y/z` so ring/focus readers treat it uniformly. Cite `MILKY_WAY_CENTER_WORLD`
in `src/data/milkyWay/galacticCenter.ts:56` for the world coords; cite the
`FocusableTargetType` definition Part 0 added (`src/@types/engine/FocusableTargetType.d.ts`)
for the `'milkyWay'` member this arm pins.

```ts
export type MilkyWayInfo = {
  /** Union tag — mirrors the SOURCE_REGISTRY 'milkyWay' row type; what every
   *  FocusableTarget table / guard keys on. */
  readonly type: 'milkyWay';
  /** Headline shown in the InfoCard / palette row. */
  readonly displayName: string;          // "Milky Way"
  /** One-line blurb for the card. */
  readonly description: string;          // "Our home galaxy — you are here"
  /** Morphological type for the card's type row. */
  readonly typeString: string;           // barred-spiral, e.g. "Barred spiral (SBbc)"
  /** Distance note for the card (we are inside it; ≈ 8 kpc to the centre). */
  readonly distanceNote: string;
  /** World-space position of the galactic centre (Sgr A*), from MILKY_WAY_CENTER_WORLD. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
};
```

> The morphological-type field is named `typeString` (not `type`) to avoid colliding
> with the `type` union tag — `type` is reserved for the discriminant across every
> `FocusableTarget` arm. The InfoCard's "type" row reads `typeString`.

**Const** (`milkyWayInfo.ts`): `export const MILKY_WAY_INFO: MilkyWayInfo = { ... }`
with `x/y/z` spread from `MILKY_WAY_CENTER_WORLD`. Didactic header explaining it is a
static const (not a catalog row) and why the discriminant is `type` (the union tag
shared with the registry row), keeping it on the same table-dispatch path as galaxies
and structures.

- [ ] Add test `MILKY_WAY_INFO carries the 'milkyWay' tag` asserting `MILKY_WAY_INFO.type === 'milkyWay'`.
- [ ] Add test `MILKY_WAY_INFO x/y/z match MILKY_WAY_CENTER_WORLD` asserting the triple
  equals `MILKY_WAY_CENTER_WORLD`.
- [ ] Add test `MILKY_WAY_INFO displayName is "Milky Way"`.
- [ ] `npm test -- milkyWayInfo` → all pass; `npm run typecheck` clean.
- [ ] Commit.

### Task 2: Widen `FocusableTarget` + `FocusableTargetType` with the milkyWay arm

A pure type widen — add the third arm and its tag member. Because Part 0's union is
tagged and dispatch is table-driven, **no predicate, no cast-site audit, and no pass
stopgaps are needed**: typecheck will flag any genuinely non-exhaustive table or
`switch`, and the existing `target.type === 'structure'` guards already exclude the MW
from the galaxy and structure branches by construction.

**Files:**
- `src/@types/engine/FocusableTarget.d.ts` (modify — add the third arm)
- `src/@types/engine/FocusableTargetType.d.ts` (verify it already lists `'milkyWay'`;
  Part 0 added it per the spec — if absent, add it here)
- `tests/@types/...` only if Part 0 established a union-shape test to extend (otherwise
  this task is exercised transitively by Tasks 3+; keep it green via typecheck)

**Before/after** (`FocusableTarget.d.ts`):

```ts
// before (post-Part-0)
export type FocusableTarget = GalaxyInfo | StructureInfo;
// after
export type FocusableTarget = GalaxyInfo | StructureInfo | MilkyWayInfo;
```

Add the `MilkyWayInfo` import; update the union's docblock to name the three arms and
note that dispatch goes through the `type`-keyed tables. Confirm `FocusableTargetType`
is `'galaxyCatalog' | 'structure' | 'milkyWay'`.

- [ ] `npm run typecheck` clean. Any table or `switch` that becomes non-exhaustive on
  `FocusableTarget` / `FocusableTargetType` here belongs to a later task (its
  `'milkyWay'` row is added there) — if typecheck surfaces one early, add the row in its
  owning task, NEVER a silent `default` that swallows the milkyWay case.
- [ ] `npm test` → green (no behaviour change).
- [ ] Commit.

### Task 3: `resolvePick` milkyWay row (code 16 → `MILKY_WAY_INFO`)

`resolvePick` (Part 0, `src/services/engine/helpers/resolvePick.ts`) dispatches on
`SOURCE_REGISTRY[code].type`. Add the `'milkyWay'` arm. The MW carries no
`(source, localIdx)` and no store lookup — it resolves to the static const directly.

**Files:**
- `src/services/engine/helpers/resolvePick.ts` (modify)
- `tests/services/engine/helpers/resolvePick.test.ts` (modify)

Cite the registry-dispatch shape Part 0 established (galaxyCatalog / structure /
fall-through-null). Add: `if (entry?.type === 'milkyWay') return MILKY_WAY_INFO;`.
`Source.MilkyWay` is code 16 (`src/data/source.ts:102`), and
`SOURCE_REGISTRY[16].type === 'milkyWay'` (`src/data/sources/milky-way.ts`).

- [ ] Add test `resolvePick resolves a milkyWay code to MILKY_WAY_INFO` asserting
  `resolvePick({ sourceCode: Source.MilkyWay, localIdx: 0 }, deps) === MILKY_WAY_INFO`
  (any `localIdx`; the MW ignores it).
- [ ] `npm test -- resolvePick` → passes (the existing galaxy / structure / null cases
  stay green).
- [ ] `npm run typecheck` clean.
- [ ] Commit.

### Task 4: `targetEq` milkyWay row (singleton self-equality)

Part 0's `targetEq` (the dedup comparator for the selection slots) compares identity
fields per arm, keyed on `type`. Add a milkyWay arm: two milkyWay targets are always
equal (it's a singleton), and a milkyWay never equals a galaxy or structure (the
`type`-key mismatch already yields `false`, so the new arm is just `type === 'milkyWay'
on both → true`).

**Files:**
- `src/services/engine/helpers/targetEq.ts` (modify — cite Part 0's per-arm comparison)
- `tests/services/engine/helpers/targetEq.test.ts` (modify)

**Behaviour:** `targetEq(a, b)` returns `true` when both have `type: 'milkyWay'`;
`false` when their `type` tags differ. Compare on the `type` tag (not reference
equality) so the dedup is robust by contract, not by the singleton happening to be the
same object.

- [ ] Add test `targetEq is true for two milkyWay targets` asserting
  `targetEq(MILKY_WAY_INFO, MILKY_WAY_INFO) === true`.
- [ ] Add test `targetEq is false for milkyWay vs a galaxy` (use an existing GalaxyInfo
  fixture) and `targetEq is false for milkyWay vs a structure`.
- [ ] `npm test -- targetEq` → passes.
- [ ] Commit.

### Task 5: MW pick provider (the GPU work)

A small dedicated renderer that draws ONE clamped pick billboard at
`MILKY_WAY_CENTER_WORLD`, stamping `packSelection(Source.MilkyWay, 0) +
PICK_SENTINEL_OFFSET` into the r32uint pick texture. Mirror the structure-ring pick
path: a renderer that owns its own pick pipeline + a `pickMilkyWay(pass)` method called
inside `pickRenderer`'s `recordPickPass`. It is **invisible** (pick-only) — no visible
draw method.

**Files:**
- `src/@types/rendering/MilkyWayPickRenderer.d.ts` (new — the public handle type)
- `src/services/gpu/renderers/milkyWayPickRenderer.ts` (new)
- `src/services/gpu/shaders/milkyWayPick/` (new WESL — a billboard VS + pick FS; see the
  WESL sub-skill before editing `.wesl`)
- `tests/services/gpu/renderers/milkyWayPickRenderer.test.ts` (new — CPU/null-device mode,
  mirroring how `structureMarkerRenderer.test.ts` exercises the null-device path)

**Handle type** (`MilkyWayPickRenderer.d.ts`):

```ts
export type MilkyWayPickRenderer = {
  readonly label: string;          // 'milkyWayPickRenderer'
  /**
   * Record ONE clamped pick billboard at MILKY_WAY_CENTER_WORLD into the
   * caller-supplied pick pass. The caller has already bound @group(0)
   * (CameraUniforms); this binds @group(1) (dummy fade) + @group(2)
   * (SourceUniforms carrying Source.MilkyWay) and emits draw(6, 1).
   * No-op when constructed with a null device.
   */
  pickMilkyWay(pass: GPURenderPassEncoder): void;
  /** Release GPU resources. No-op under null device. */
  destroy(): void;
};
```

**Pipeline + binding contract** — copy, beat-for-beat, the rationale already documented
in `structureMarkerRenderer.ts`:
- Separate `GPUShaderModule` per pipeline; explicit pipeline layout `[cameraBgl, fadeBgl,
  sourceBgl]` (cite `structureMarkerRenderer.ts:224-227` and the `auto`-layout trap note
  `feedback_webgpu_auto_layout_trap.md`).
- Fragment target `r32uint`, no blend; `depthStencil` `depth24plus` / `less` /
  `depthWriteEnabled: true` so a foreground galaxy claims the pixel (cite
  `structureMarkerRenderer.ts:326-341`).
- Dummy zeroed FadeUniforms at `@group(1)` (cite `structureMarkerRenderer.ts:349-358`).
- A SourceUniforms buffer at `@group(2)` carrying `Source.MilkyWay` in the 5-bit
  `sourceCode` slot, written once at construction (cite `structureMarkerRenderer.ts:393-409`).
- The fragment composes `(sourceCode << 27) | 0 + PICK_SENTINEL_OFFSET` — reuse the
  `selectionEncoding.wesl` constants the structure ringPick fragment already uses (cite
  `src/services/gpu/shaders/structureMarker/ringPick.wesl`). The MW localIdx is always 0.
- **Screen-size clamp:** the billboard must hold a minimum pixel size at any zoom so it
  stays hittable, like a galaxy point's `pointSizePx` floor (cite the clamp in
  `points/vertex.wesl` referenced by `selectionRingPass.ts:16-22`). A small fixed min
  (e.g. the project's point-size floor) is sufficient — this is a hit target, not a visual.

`packSelection` / `PICK_SENTINEL_OFFSET` live in `src/data/selectionEncoding.ts:59,68`.

- [ ] Add test `milkyWayPickRenderer constructs under a null device` asserting the
  renderer is returned and `pickMilkyWay` / `destroy` are callable no-ops (mirror the
  null-device assertions in `structureMarkerRenderer.test.ts`).
- [ ] Add test `milkyWayPickRenderer satisfies the Renderer label contract` asserting
  `renderer.label === 'milkyWayPickRenderer'`.
- [ ] (If a GPU-backed unit test is feasible in the existing harness — check whether
  `pickRenderer.test.ts` exercises a real device or only null — add a test asserting a
  pick at the MW screen position decodes to `Source.MilkyWay`. If the harness is
  null-device-only, SKIP and leave a one-line note; the manual smoke test in the DoD
  covers the round-trip.)
- [ ] `npm test -- milkyWayPickRenderer` → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 6: Wire the MW pick provider into the pick pass + visibility gate

Thread the new provider into `pickRenderer` the way `structureMarkerRenderer` /
`proceduralDiskRenderer` already are — an optional constructor arg, called inside
`recordPickPass`. Gate the draw on MW disk visibility (the `{ kind: 'milkyWay' }` fade
opacity > 0) so the MW contributes a hit only when the disk is on screen. Construct + own
the renderer in `engine.ts` alongside the other pick providers, and make
`collectPickTargets` / `pickRenderer.hasAnyPickTarget` count the MW so a MW-only scene
still runs a pick pass.

**Files:**
- `src/services/gpu/renderers/pickRenderer.ts` (modify — add the optional provider arg +
  call site)
- `src/@types/rendering/PickRenderer.d.ts` (if the constructor signature is typed there)
- `src/services/engine/engine.ts` (modify — construct `milkyWayPickRenderer`, pass it to
  `createPickRenderer`, destroy it in teardown alongside the others near
  `engine.ts:1128-1137`)
- `src/services/engine/helpers/collectPickTargets.ts` (modify — fold the MW into `hasAny`)
- `tests/services/gpu/renderers/pickRenderer.test.ts` (modify)
- `tests/services/engine/helpers/collectPickTargets.test.ts` (modify)

**Wiring contract** — mirror the structure-ring path exactly:
- New optional constructor param `milkyWayPickRenderer?: MilkyWayPickRenderer` (cite the
  optional `structureMarkerRenderer` / `proceduralDiskRenderer` params at
  `pickRenderer.ts:84,90`).
- In `recordPickPass`, after the disk pick call (`pickRenderer.ts:350-352`), add
  `if (milkyWayPickRenderer && mwVisible()) milkyWayPickRenderer.pickMilkyWay(pass);`.
- **`mwVisible()` gate:** the MW disk fade is `{ kind: 'milkyWay' }` after Part 1. The
  cleanest gate is to thread the same opacity check the `milkyWayPass.enabled` uses
  (cite `milkyWayPass.ts:54-66` post-Part-1: `opacityOf({ kind: 'milkyWay' }) > 0` AND
  `milkyWayFadeAlpha(camDist) > 0`). Pass the gate result in per-pick rather than
  importing fade/camera state into the renderer — keep the renderer dumb (it just draws).
  Decide the threading at implementation time (a boolean arg to `pick()` / a small
  callback); whichever, the renderer must NOT reach into `EngineState`.
- `collectPickTargets`: extend `hasAny` so a frame with only the MW on screen still picks
  (cite the structure-marker fold-in at `collectPickTargets.ts` `hasStructureMarkers`).

- [ ] Add test `collectPickTargets.hasAny is true when only the Milky Way is visible`
  (no galaxy catalogs, no structure markers, MW disk visible) asserting `hasAny === true`.
- [ ] Add a `pickRenderer` test asserting `pickMilkyWay` is invoked inside the pick pass
  when the provider is present and the MW is gated visible, and NOT invoked when gated
  hidden (use a spy `vi.fn<() => void>()` on the provider; mirror how the structure-ring
  call is asserted in the existing pick-renderer test).
- [ ] `npm test -- pickRenderer collectPickTargets` → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 7: `selectionRingPass` milkyWay branch

`selectionRingPass` reads the selected target (post-Part-0) and computes `worldPos` +
`ringRadiusPx`. The renderer is target-agnostic (`{ worldPos, ringRadiusPx }`). Extend
its `enabled()` to cover `type === 'galaxyCatalog' || type === 'milkyWay'`, and add a
milkyWay branch in `draw()`: `worldPos = MILKY_WAY_CENTER_WORLD`; `ringRadiusPx` from the
disk's apparent on-screen size (disk radius ≈ 25 kpc / camDist × pxPerRad), clamped to a
min.

**Files:**
- `src/services/engine/frame/passes/selectionRingPass.ts` (modify)
- `src/data/milkyWay/galacticCenter.ts` (modify — add `MILKY_WAY_DISC_RADIUS_KPC = 25`)
- `tests/services/engine/frame/passes/selectionRingPass.test.ts` (modify)

Post-Part-0, the pass reads `state.subsystems.selection.selected(): FocusableTarget | null`
and the galaxy branch reads `worldPos`/`diameterKpc` off the target (no catalog re-index).
Add a `type`-keyed split: a milkyWay target (`sel.type === 'milkyWay'`) takes `worldPos =
[sel.x, sel.y, sel.z]` and sizes the ring from a 25 kpc disk radius using the SAME
`apparentPxRadius` formula already in the pass (cite `selectionRingPass.ts:80-87`), with
the `RING_SIZE_SCALE` factor reused. Introduce `MILKY_WAY_DISC_RADIUS_KPC = 25` next to
the other MW constants in `src/data/milkyWay/galacticCenter.ts` rather than open-coding
`25` in the pass.

**Enable contract** — explicit two-tag check (not "not a structure", so the third arm is
named rather than implied):

```ts
// enabled(): true when a galaxyCatalog OR milkyWay target is selected.
const sel = state.subsystems.selection.selected();
return sel !== null && (sel.type === 'galaxyCatalog' || sel.type === 'milkyWay');
// Structures render their halo via the marker pass, not here.
```

- [ ] Add test `selectionRingPass enabled() is true when the Milky Way is selected`
  asserting `enabled(stateWithMwSelected) === true`.
- [ ] Add test `selectionRingPass draws the ring at MILKY_WAY_CENTER_WORLD for a milkyWay
  selection` — spy on `selectionRingRenderer.setSelection` (`vi.fn<...>()`) and assert the
  `worldPos` passed equals `MILKY_WAY_CENTER_WORLD` and `ringRadiusPx` is finite/positive.
- [ ] Add test `selectionRingPass enabled() stays false for a structure selection`
  (regression — the structure path is unchanged).
- [ ] Add test `selectionRingPass enabled() stays true for a galaxy selection` (regression).
- [ ] `npm test -- selectionRingPass` → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 8: `commitMilkyWayFocus` + `COMMIT_FOCUS['milkyWay']` row; retire `focusOnMilkyWay`

`commitFocus` (`src/services/engine/helpers/commitFocus.ts`) is the Part 0
`COMMIT_FOCUS[target.type]` table lookup. Add a milkyWay row pointing at a new
`commitMilkyWayFocus` that tweens to `MILKY_WAY_VIEW_DISTANCE_MPC` at
`MILKY_WAY_CENTER_WORLD`, setting BOTH the select and focus slots. Move the framing logic
out of `engine.ts`'s `focusOnMilkyWay` (`engine.ts:749-773`) into the new helper, then
delete `focusOnMilkyWay` and remove it from the camera handle.

**Files:**
- `src/services/engine/helpers/commitFocusTable.ts` (modify — add the `COMMIT_FOCUS['milkyWay']`
  row; this is the Part 0 table home — verify the exact path in the tree)
- `src/services/engine/helpers/commitMilkyWayFocus.ts` (new — one fn per file)
- `src/services/engine/engine.ts` (modify — delete `focusOnMilkyWay`; remove from the
  returned handle at `engine.ts:1188-1189`)
- `src/@types/engine/handles/EngineCameraHandle.d.ts` (modify — remove the
  `focusOnMilkyWay` member + its docline; refresh the type's header comment which currently
  lists "focus-on-milkyway")
- `tests/services/engine/helpers/commitFocus.test.ts` (modify)
- `tests/services/engine/helpers/commitMilkyWayFocus.test.ts` (new)
- `tests/services/engine/engine.test.ts` (modify — drop any `focusOnMilkyWay` coverage)

**Table row** (`commitFocusTable.ts`) — the dispatch table is keyed on `target.type` (Part 0);
add one entry, no edit to the lookup logic:

```ts
COMMIT_FOCUS['milkyWay'] = commitMilkyWayFocus;
```

`commitMilkyWayFocus(state, target)` carries the framing logic lifted from
`focusOnMilkyWay` (`engine.ts:756-772`): guard on `state.cam`, set BOTH slots
(`setSelected(MILKY_WAY_INFO)` so the InfoCard pins + `setFocused(MILKY_WAY_INFO)` so
focus state matches — note the OLD method dropped focus to null because there was no MW
target; with `MilkyWayInfo` we now set it), then `tweenToCameraSnapshot` to
`MILKY_WAY_VIEW_DISTANCE_MPC` at `MILKY_WAY_CENTER_WORLD` preserving yaw/pitch/fov. Mirror
`commitGalaxyFocus.ts` / `commitStructureFocus.ts` (the other `COMMIT_FOCUS` row impls).

**Focus-fade collapse:** `runFrame`'s member-isolation fade keys on
`focused()?.type === 'structure'` (post-Part-0). A milkyWay focus is non-structure, so
the fade collapses exactly as a galaxy focus does — confirm by reading the current
`runFrame` focus-fade gate; no change should be needed, but assert it in a test.

`focusOnHome` (`engine.ts:734-747`) is **unchanged** — a different gesture (the wide bbox
reset).

- [ ] Add test `COMMIT_FOCUS['milkyWay'] resolves to commitMilkyWayFocus` (table-row
  assertion, mirroring the Part 0 `COMMIT_FOCUS` table tests).
- [ ] Add test `commitFocus routes a milkyWay target to the milkyWay focus path` —
  assert the observable: both slots end up `MILKY_WAY_INFO` and a tween to
  `MILKY_WAY_VIEW_DISTANCE_MPC` / `MILKY_WAY_CENTER_WORLD` is enqueued.
- [ ] Add test `commitMilkyWayFocus sets both the select and focus slots to MILKY_WAY_INFO`.
- [ ] Add test `commitMilkyWayFocus is a no-op when state.cam is null` (mirrors the old
  guard at `engine.ts:756-757`).
- [ ] Add test `a milkyWay focus collapses the structure member-isolation fade`
  (`focused()?.type === 'structure'` is false) — or assert via the `runFrame` gate if
  that's where the existing galaxy-focus equivalent is tested.
- [ ] `npm test -- commitFocus commitMilkyWayFocus engine` → passes;
  `npm run typecheck` clean (the `EngineCameraHandle` removal must surface no stray
  callers — fix any).
- [ ] Commit.

### Task 9: `URL_HASH_FOR['milkyWay']` row (clears the focus hash)

The URL hash resolver is the Part 0 `URL_HASH_FOR[target.type]` table. A MW focus has no
deep-link (deferred per the spec's out-of-scope), so its row returns `null` — which the
consumer already treats as "clear the focus hash". One row, no edit to the resolver logic
or the `FocusTarget` parser.

**Files:**
- `src/hooks/urlHashFor.ts` (modify — add the row; this is the Part 0 table home — verify
  the exact path in the tree)
- `tests/...` the Part 0 `URL_HASH_FOR` table test (modify)

```ts
URL_HASH_FOR['milkyWay'] = () => null; // no MW deep-link; clears #focus= (deferred)
```

This matches pre-existing behavior: the old `focusOnMilkyWay` set the focus slot to
`null`, so there was never a MW hash. MW deep-linking (`#focus=milkyway` round-trip) is
explicitly deferred (see the spec's out-of-scope) and would need the `FocusTarget` parser
to grow a milkyWay kind — not touched here.

- [ ] Add test `URL_HASH_FOR['milkyWay'] returns null` (table-row assertion).
- [ ] Add test `a Milky Way focus clears the focus hash` driving the consumer
  (`onFocusChange(MILKY_WAY_INFO)` → resolver → no `#focus=` written / it is cleared),
  mirroring the existing per-`type` hash test.
- [ ] `npm test` (URL hash + useUrlSync suites) → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 10: Typed palette MW command; delete the sentinel + onSelect special-case

Replace the `__milky-way__` pseudo-entry plumbing with a first-class typed palette command
that calls `camera.focusOn(MILKY_WAY_INFO)`.

**Files:**
- `src/data/milkyWay/milkyWayEntry.ts` (DELETE — sentinel `MILKY_WAY_ID` + `MILKY_WAY_ENTRY`
  pseudo-entry)
- `src/components/App/App.tsx` (modify — remove the `MILKY_WAY_ENTRY` / `MILKY_WAY_ID`
  import at `App.tsx:37`, the `paletteEntries` prepend at `App.tsx:349-354`, and the
  `onSelect` `id === MILKY_WAY_ID` interception at `App.tsx:571-581`; add the typed MW
  command)
- `src/components/CommandPalette/CommandPalette.tsx` (modify — accept the typed MW command;
  see the `pseudo`/glyph investigation in Task 11)
- `tests/...` palette / App tests as they exist (modify)

**Design of the typed command:** the palette today scores `FamousMetaEntry[]` rows and
emits `onSelect(id)` for famous rows (cite `CommandPalette.tsx:248-255`,
`scoreFamousMatch.ts`). The MW is NOT a famous-bin row, so do NOT shoehorn it back into
`entries`. Two viable shapes — pick the simpler at implementation time:

1. A dedicated optional prop `onSelectMilkyWay?: () => void` plus a single always-present
   MW row the palette renders above the famous list, searchable by the same matcher over a
   small fixed `names` list (`["Milky Way", "Galaxy", "Home"]`). The row's click/Enter
   calls `onSelectMilkyWay`, which in App is `() => handleRef.current?.camera.focusOn(MILKY_WAY_INFO)`.
2. A typed `ScoredRow` variant `{ kind: 'milkyWay'; score }` folded into the existing
   `matches` pipeline, dispatched in `dispatchSelection` to `onSelectMilkyWay`.

Either way: the select action is `camera.focusOn(MILKY_WAY_INFO)` — the SAME select → focus
path every other target uses. No sentinel id, no `selectFamous` fallthrough, no onSelect
`if (id === ...)`.

- [ ] Add test `the palette routes the Milky Way command to focusOn(MILKY_WAY_INFO)` —
  render/drive the palette, select the MW row, assert the wired callback fires with
  `MILKY_WAY_INFO` (no string id).
- [ ] Add test `searching "milky way" surfaces the Milky Way command` (the matcher scores
  the MW names).
- [ ] Grep the tree for `MILKY_WAY_ID` / `__milky-way__` / `MILKY_WAY_ENTRY` (the palette
  pseudo one) → zero matches after deletion. NOTE: `src/data/sources/milky-way.ts` ALSO
  exports a const named `MILKY_WAY_ENTRY` (the source-registry row) — that one STAYS; only
  the `src/data/milkyWay/milkyWayEntry.ts` palette pseudo-entry is deleted. Verify the grep
  distinguishes them.
- [ ] `npm test` (palette + App suites) → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 11: Retire `FamousMetaEntry.pseudo` + the glyph-fallback path iff MW was its only user

The `pseudo` flag (`src/@types/loading/FamousMetaEntry.d.ts:33`) and the palette's
glyph-fallback branch (`CommandPalette.tsx:362-387`, the `isPseudo` block) exist solely
for the MW pseudo-entry. After Task 10 the MW no longer flows through `FamousMetaEntry`, so
verify nothing else sets `pseudo: true` and remove the dead path.

**Files:**
- `src/@types/loading/FamousMetaEntry.d.ts` (modify — drop `pseudo` iff unused)
- `src/components/CommandPalette/CommandPalette.tsx` (modify — drop the `isPseudo` glyph
  branch iff `pseudo` is removed; famous rows then always render the `<img>` thumbnail)
- relevant tests (modify)

- [ ] Grep `pseudo` across `src/` + `tests/` + `tools/`. The only functional setter is the
  deleted `milkyWayEntry.ts`; `famous_meta.json` never sets it (cite the docblock at
  `FamousMetaEntry.d.ts:14-33`). Confirm no other reader depends on it.
- [ ] IF confirmed sole-user: remove the `pseudo?: true` field and the `isPseudo` branch;
  the palette's famous-row render simplifies to the `<img>` thumbnail only. IF some other
  user surfaces, STOP and leave `pseudo` in place with a note — do not break that user.
- [ ] `npm test` → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 12: `MilkyWayDetailCard` + `CompactMilkyWayCard` + `DETAIL_CARD['milkyWay']` row

The InfoCard renders the card returned by the Part 0 `DETAIL_CARD[target.type]` table
lookup. The Part 0 `DetailCardEntry` shape is `{ Detail, Compact }` (the `Compact`
variant is the hover preview), so the MW row needs **both** — the MW is hoverable
(the pick provider stamps the pick texture, the hover path resolves it to
`MILKY_WAY_INFO` → the compact card). Add one `DETAIL_CARD['milkyWay']` row pointing at
the new pair — no `isStructure`/`kind` branch is edited in `InfoCard.tsx`; the table
already dispatches by `type`.

**Files:**
- `src/components/InfoCard/MilkyWayDetailCard.tsx` (new — mirror `StructureDetailCard.tsx`'s
  shape; a glyph in the image slot, the `MilkyWayInfo` string fields — `displayName`,
  `description`, `typeString`, `distanceNote` — and a "Fly here" button wired to
  `onFocus(MILKY_WAY_INFO)`)
- `src/components/InfoCard/CompactMilkyWayCard.tsx` (new — the hover variant; mirror
  `CompactStructureCard.tsx`; glyph + `displayName` + a short line, no thumbnail)
- `src/components/InfoCard/MilkyWayDetailCard.module.css` (new, if styling is needed beyond
  reuse)
- `src/components/InfoCard/detailCardTable.ts` (modify — add `DETAIL_CARD['milkyWay'] =
  { Detail: MilkyWayDetailCard, Compact: CompactMilkyWayCard }`; this is the Part 0 table
  home — verify the exact path + `DetailCardEntry` shape in the tree)
- `tests/components/InfoCard/*` (modify / new as the existing InfoCard tests are structured)

**Card contract** (`MilkyWayDetailCard.tsx` / `CompactMilkyWayCard.tsx`): props mirror the
other cards (`{ target: MilkyWayInfo; onFocus?: (t: FocusableTarget) => void }` for the
detail, `{ target: MilkyWayInfo }` for the compact — match the `DetailCardEntry` prop
types Part 0 established). Detail: glyph in the image slot (no `<img>` thumbnail),
`displayName` headline, `description`, `typeString` in the type row, `distanceNote`, and a
"Fly here" button calling `onFocus?.(MILKY_WAY_INFO)`. Compact: glyph + `displayName` + a
short line. The outer wrapper stays owned by `InfoCard` (the `<details>`-remount hazard at
`InfoCard.tsx:5-9`), satisfied by the table dispatch rendering inside the existing stable
wrapper.

- [ ] Add test `DETAIL_CARD['milkyWay'] resolves to the Milky Way detail + compact cards`
  (table-row assertion, mirroring the Part 0 `DETAIL_CARD` table tests — both `Detail` and
  `Compact`).
- [ ] Add test `InfoCard renders the Milky Way card for a milkyWay selection` asserting
  the headline "Milky Way" + the description text appear and no `<img>` thumbnail is
  rendered (glyph instead).
- [ ] Add test `the Milky Way card's Fly here button calls onFocus with MILKY_WAY_INFO`.
- [ ] Add test `InfoCard renders the compact Milky Way card on hover` (a milkyWay hover →
  the compact variant, glyph + name, no thumbnail).
- [ ] Add test `a galaxy selection still renders the galaxy card` (regression — the table
  dispatch didn't mis-route galaxies).
- [ ] `npm test` (InfoCard suite) → passes; `npm run typecheck` clean.
- [ ] Commit.

---

## Definition of Done

- [ ] `npm test` is fully green (no skips beyond the optional GPU-backed pick test in
  Task 5, if the harness is null-device-only).
- [ ] `npm run typecheck` is clean for both `src` and `tools` tsconfigs.
- [ ] `npm run build` succeeds.
- [ ] The Milky Way is **clickable in-scene** → selecting it shows the **InfoCard** (via
  `DETAIL_CARD['milkyWay']`), draws the **selection ring**, and **double-click / palette /
  "Fly here"** all **focus** (tween) it (via `COMMIT_FOCUS['milkyWay']`) — every step on
  the standard tagged `FocusableTarget` path through the dispatch tables, no MW-specific
  method or predicate.
- [ ] `camera.focusOn(MILKY_WAY_INFO)` is the only focus entry point; `focusOnMilkyWay` is
  gone from `engine.ts` AND `EngineCameraHandle` (grep returns zero matches).
- [ ] The `__milky-way__` sentinel + `src/data/milkyWay/milkyWayEntry.ts` + the `App.tsx`
  `onSelect` MW special-case are deleted (grep for `MILKY_WAY_ID` / `__milky-way__` /
  `milkyWayEntry` returns zero matches; the surviving `MILKY_WAY_ENTRY` in
  `src/data/sources/milky-way.ts` is the source-registry row, intentionally kept).
- [ ] `FamousMetaEntry.pseudo` + the palette glyph-fallback path are removed (Task 11) OR
  a documented note records why a non-MW user kept them.
- [ ] The MW is present as exactly **one row per dispatch table** (`DETAIL_CARD`,
  `URL_HASH_FOR`, `COMMIT_FOCUS`) plus the `resolvePick` / `targetEq` / `selectionRingPass`
  arms — no dispatch *logic* was edited to special-case it.
- [ ] No new `TODO` / `FIXME` comments introduced by this plan.
- [ ] **Manual smoke test** (dev server, real data — ask the user to look, per the
  no-kill-dev-server convention): fly near the Milky Way until the disk is visible; click
  the galactic centre; confirm (a) the InfoCard shows the Milky Way card with the glyph,
  (b) a selection ring is drawn around it, (c) double-click (or the palette "Milky Way"
  command, or the card's "Fly here") tweens the camera in to the impostor framing; then fly
  far away and confirm the MW is no longer pickable (the disk has faded out).
