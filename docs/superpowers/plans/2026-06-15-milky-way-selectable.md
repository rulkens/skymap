# Milky Way as a First-Class Selectable Source (Part 2)

> **Depends on** `docs/superpowers/plans/2026-06-15-selection-target-unification.md`
> (Part 0) **and** `docs/superpowers/plans/2026-06-15-fade-source-naming-consistency.md`
> (Part 1). **Execute this plan only after both have landed.** This plan assumes the
> post-Part-0 world (the `Selection` union is gone; the selection slots hold
> `FocusableTarget | null`; `resolvePick(pick, deps): FocusableTarget | null` is the
> pure pick resolver) and the post-Part-1 world (the MW disk fade is
> `{ kind: 'milkyWay' }`, not `{ kind: 'overlay', id: 'milkyWay' }`; `StructureId`
> has replaced `StructureCategory`). Cite the current files — do not trust this plan's
> snapshots over what Part 0 / Part 1 left in the tree.

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
(`MilkyWayInfo` variant of `FocusableTarget`), is the one thing held in the selection
slots, rendered by the InfoCard, ringed by `selectionRingPass`, and focused by
`commitFocus`. There is **no MW-specific public method** — `camera.focusOn(MILKY_WAY_INFO)`
is the only entry point. The procedural-disk renderer stays bespoke by design; only the
identity axis is unified.

## Architecture

- `MilkyWayInfo` is a third arm of the `FocusableTarget` discriminated union, carried
  as a single static const `MILKY_WAY_INFO`. Its discriminant (`kind: 'milkyWay'`) keeps
  the union discriminable and keeps `isStructure` returning `false` for it (the structure
  predicate keys on `'category' in target`, which `MilkyWayInfo` deliberately lacks).
- A new pick provider — a tiny screen-size-clamped billboard at `MILKY_WAY_CENTER_WORLD`
  — stamps `packSelection(Source.MilkyWay, 0) + PICK_SENTINEL_OFFSET` into the r32uint
  pick texture, mirroring `structureMarkerRenderer.pickRing`. It is gated on MW disk
  visibility (the `{ kind: 'milkyWay' }` fade opacity > 0) so the MW is never pickable
  once the disk has faded out. The decode (`unpackPick`) is unchanged — code 16 round-trips.
- `resolvePick` grows a `type === 'milkyWay'` branch returning `MILKY_WAY_INFO`.
- `selectionRingPass` and `commitFocus` grow a `milkyWay` branch each, reading
  `MILKY_WAY_CENTER_WORLD` off the target and tweening to `MILKY_WAY_VIEW_DISTANCE_MPC`.
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

**Type shape** (`MilkyWayInfo.d.ts`) — the discriminant is `kind`, and it carries
`x/y/z` so ring/focus readers treat it uniformly. It must NOT have a top-level
`category` field (that would make `isStructure` misclassify it). Cite `MILKY_WAY_CENTER_WORLD`
in `src/data/milkyWay/galacticCenter.ts:56` for the world coords; cite the
`isStructure` discriminant at `src/services/engine/isStructure.ts:18-20`.

```ts
export type MilkyWayInfo = {
  /** Discriminant — keeps FocusableTarget discriminable and isStructure() false. */
  readonly kind: 'milkyWay';
  /** Headline shown in the InfoCard / palette row. */
  readonly displayName: string;          // "Milky Way"
  /** One-line blurb for the card. */
  readonly description: string;          // "Our home galaxy — you are here"
  /** Morphological type for the card's type row. */
  readonly type: string;                 // barred-spiral, e.g. "Barred spiral (SBbc)"
  /** Distance note for the card (we are inside it; ≈ 8 kpc to the centre). */
  readonly distanceNote: string;
  /** World-space position of the galactic centre (Sgr A*), from MILKY_WAY_CENTER_WORLD. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
};
```

**Const** (`milkyWayInfo.ts`): `export const MILKY_WAY_INFO: MilkyWayInfo = { ... }`
with `x/y/z` spread from `MILKY_WAY_CENTER_WORLD`. Didactic header explaining it is a
static const (not a catalog row) and why the discriminant is `kind`, not `category`.

- [ ] Add test `MILKY_WAY_INFO carries kind 'milkyWay'` asserting `MILKY_WAY_INFO.kind === 'milkyWay'`.
- [ ] Add test `MILKY_WAY_INFO has no top-level category field` asserting
  `!('category' in MILKY_WAY_INFO)` (guards the `isStructure` contract).
- [ ] Add test `MILKY_WAY_INFO x/y/z match MILKY_WAY_CENTER_WORLD` asserting the triple
  equals `MILKY_WAY_CENTER_WORLD`.
- [ ] Add test `MILKY_WAY_INFO displayName is "Milky Way"`.
- [ ] `npm test -- milkyWayInfo` → all pass; `npm run typecheck` clean.
- [ ] Commit.

### Task 2: Widen `FocusableTarget`; add `isMilkyWay`; harden the three-way discrimination

**Files:**
- `src/@types/engine/FocusableTarget.d.ts:17` (modify the union)
- `src/services/engine/isStructure.ts` (verify / extend docblock; no logic change)
- `src/services/engine/isMilkyWay.ts` (new — one fn per file)
- `src/services/engine/frame/passes/pointSpritesPass.ts` (modify — exclude MW from the point highlight)
- `src/services/engine/frame/passes/diskRadiusRingPass.ts` (modify — exclude MW from the debug ring)
- `tests/services/engine/isStructure.test.ts` (modify)
- `tests/services/engine/isMilkyWay.test.ts` (new)
- `tests/services/engine/frame/passes/pointSpritesPass.test.ts` (modify)
- `tests/services/engine/frame/passes/diskRadiusRingPass.test.ts` (modify)

**Before/after** (`FocusableTarget.d.ts:17`):

```ts
// before
export type FocusableTarget = GalaxyInfo | StructureRecord;
// after
export type FocusableTarget = GalaxyInfo | StructureRecord | MilkyWayInfo;
```

Add the `MilkyWayInfo` import; update the union's docblock to name the three arms.
`isStructure` keys on `'category' in target` (`isStructure.ts:18-20`); `MilkyWayInfo`
has no `category`, so it already returns `false` — confirm with a test, and refresh the
docblock to mention the milkyWay arm so a future reader knows it was considered.

**The structural-cast hazard (why this task does more than widen the union).** Several
slot consumers branch `isStructure(t) ? structure : (t as GalaxyInfo)` — the `as GalaxyInfo`
cast SUPPRESSES the type error, so typecheck will NOT flag them when `MilkyWayInfo` joins
the union. A `MilkyWayInfo` would silently flow into the galaxy branch. Introduce an
explicit predicate and make every "not a structure ⇒ galaxy" site a three-way:

**`isMilkyWay`** (`isMilkyWay.ts`): `export function isMilkyWay(target: FocusableTarget):
target is MilkyWayInfo` returning `'kind' in target && target.kind === 'milkyWay'`
(`GalaxyInfo` / `StructureRecord` carry no top-level `kind`). Didactic header mirroring
`isStructure.ts`.

Sites to fix in THIS task (the render-side galaxy-assumers — verify each reads the slot
post-Part-0):
- `pointSpritesPass` — the selected-point highlight reads `selected.source` / `selected.index`
  (Part 0 pointed it at `GalaxyInfo`). A `MilkyWayInfo` has neither. Gate the highlight on
  "galaxy only": skip when `isStructure(selected) || isMilkyWay(selected)` (the MW is not a
  catalog point, so it highlights nothing here — its halo is `selectionRingPass`, Task 7).
- `diskRadiusRingPass` — same shape; it re-indexes the catalog by `selected.source`/`.index`.
  Gate it to galaxy-only (`!isStructure && !isMilkyWay`).
- `selectionRingPass` — **typecheck-breaks here, not latently:** Part 0 set its `enabled()`
  to `!isStructure(sel)` and its `draw()` reads `sel.diameterKpc` off `GalaxyInfo`.
  `MilkyWayInfo` has no `diameterKpc`, so the union widen makes `draw()` fail to compile.
  Add a STOPGAP `if (isMilkyWay(sel)) return;` at the top of `draw()` (and keep the
  `enabled()` as-is — a no-draw frame is harmless). **Task 7 replaces this early-return with
  the real MW ring branch.** Without the stopgap this task isn't green.

The `InfoCard` galaxy-cast sites (`InfoCard.tsx:78,80`, `as GalaxyInfo`) and the
`useUrlSync` focus-hash site stay GREEN at this task (the `as` cast / structural branch hide
the type error) but are latently wrong; they're fixed in Task 11 and Task 8 respectively.
Because the MW can't enter the slots until the pick is wired (Task 6), no runtime path hits
those latent sites before their owning task — but do not rely on that; fix them as scheduled.

- [ ] Add test `isStructure returns false for MILKY_WAY_INFO`.
- [ ] Add test `isMilkyWay returns true for MILKY_WAY_INFO and false for a galaxy / structure`.
- [ ] Add test `pointSpritesPass does not highlight a point when the Milky Way is selected`
  (inject `MILKY_WAY_INFO` into the selection slot; assert no `packSelection`/highlight for a
  real point — mirror the existing selected-point assertion).
- [ ] Add test `diskRadiusRingPass is disabled when the Milky Way is selected`.
- [ ] `npm run typecheck` clean (any remaining non-exhaustive `switch` on `FocusableTarget`
  belongs to a later task — add its `kind === 'milkyWay'` arm or defer to that task; NEVER a
  silent `default` that swallows the milkyWay case).
- [ ] `npm test -- isStructure isMilkyWay pointSpritesPass diskRadiusRingPass` → passes.
- [ ] Commit.

### Task 3: `resolvePick` milkyWay branch (code 16 → `MILKY_WAY_INFO`)

`resolvePick` (Part 0, `src/services/engine/helpers/resolvePick.ts`) dispatches on
`SOURCE_REGISTRY[code].type`. Add the `'milkyWay'` arm. The MW carries no
`(source, localIdx)` and no store lookup — it resolves to the static const directly.

**Files:**
- `src/services/engine/helpers/resolvePick.ts` (modify)
- `tests/services/engine/helpers/resolvePick.test.ts` (modify)

Cite the registry-dispatch shape that Part 0 lifted from `pickToSelection.ts:26-41`
(galaxyCatalog / structure / fall-through-null). Add: `if (entry?.type === 'milkyWay')
return MILKY_WAY_INFO;`. `Source.MilkyWay` is code 16 (`src/data/source.ts:102`), and
`SOURCE_REGISTRY[16].type === 'milkyWay'` (`src/data/sources/milky-way.ts`).

- [ ] Add test `resolvePick resolves a milkyWay code to MILKY_WAY_INFO` asserting
  `resolvePick({ sourceCode: Source.MilkyWay, localIdx: 0 }, deps) === MILKY_WAY_INFO`
  (any `localIdx`; the MW ignores it).
- [ ] `npm test -- resolvePick` → passes (the existing galaxy / structure / null cases
  stay green).
- [ ] `npm run typecheck` clean.
- [ ] Commit.

### Task 4: `targetEq` milkyWay self-equality

Part 0's `targetEq` (the dedup comparator for the selection slots) compares identity
fields per arm. Add a milkyWay arm: two milkyWay targets are always equal (it's a
singleton), and a milkyWay never equals a galaxy or structure.

**Files:**
- `src/services/engine/helpers/targetEq.ts` (modify — Part 0 created this; cite its current
  per-arm comparison)
- `tests/services/engine/helpers/targetEq.test.ts` (modify)

**Behaviour:** `targetEq(a, b)` returns `true` when both are `kind: 'milkyWay'`; `false`
when exactly one is. Since `MILKY_WAY_INFO` is a singleton, reference equality also holds,
but compare on the discriminant so a future second MW value (there won't be one) wouldn't
silently break dedup.

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
`ringRadiusPx`. The renderer is target-agnostic (`{ worldPos, ringRadiusPx }`). Add a
milkyWay branch: `enabled()` true for galaxy OR milkyWay targets; `worldPos =
MILKY_WAY_CENTER_WORLD`; `ringRadiusPx` from the disk's apparent on-screen size
(disk radius ≈ 25 kpc / camDist × pxPerRad), clamped to a min.

**Files:**
- `src/services/engine/frame/passes/selectionRingPass.ts` (modify)
- `tests/services/engine/frame/passes/selectionRingPass.test.ts` (modify)

Post-Part-0, the pass reads `state.subsystems.selection.selected(): FocusableTarget | null`
and the galaxy branch reads `worldPos`/`diameterKpc` off the target (no catalog re-index).
**Replace the Task-2 stopgap `if (isMilkyWay(sel)) return;` in `draw()` with the real MW
branch below** (the early-return must not survive — the MW now draws a ring).
Add an `isStructure`-false discriminant split: a milkyWay target (`sel.kind === 'milkyWay'`)
takes `worldPos = [sel.x, sel.y, sel.z]` and sizes the ring from a 25 kpc disk radius
using the SAME `apparentPxRadius` formula already in the pass (cite
`selectionRingPass.ts:80-87`), with the `RING_SIZE_SCALE` factor reused. Use the
project's MW disc radius — there's no existing exported constant for 25 kpc, so introduce
one (`MILKY_WAY_DISC_RADIUS_KPC = 25`) next to the other MW constants in
`src/data/milkyWay/galacticCenter.ts` rather than open-coding `25` in the pass.

**Enable contract:**

```ts
// enabled(): true when a galaxy OR milkyWay target is selected.
const sel = state.subsystems.selection.selected();
return sel !== null && (!isStructure(sel) /* galaxy or milkyWay */);
// NOTE: structures still render their halo via the marker pass, not here —
// so the gate is "selected and not a structure", which covers galaxy + milkyWay.
```

- [ ] Add test `selectionRingPass enabled() is true when the Milky Way is selected`
  asserting `enabled(stateWithMwSelected) === true`.
- [ ] Add test `selectionRingPass draws the ring at MILKY_WAY_CENTER_WORLD for a milkyWay
  selection` — spy on `selectionRingRenderer.setSelection` (`vi.fn<...>()`) and assert the
  `worldPos` passed equals `MILKY_WAY_CENTER_WORLD` and `ringRadiusPx` is finite/positive.
- [ ] Add test `selectionRingPass enabled() stays false for a structure selection`
  (regression — the structure path is unchanged).
- [ ] `npm test -- selectionRingPass` → passes; `npm run typecheck` clean.
- [ ] Commit.

### Task 8: `commitFocus` milkyWay branch; retire `focusOnMilkyWay`

`commitFocus` (`src/services/engine/helpers/commitFocus.ts`) dispatches on the target
kind. Add a milkyWay branch that tweens to `MILKY_WAY_VIEW_DISTANCE_MPC` at
`MILKY_WAY_CENTER_WORLD`, setting BOTH the select and focus slots. Move the framing logic
out of `engine.ts`'s `focusOnMilkyWay` (`engine.ts:749-773`) into this branch, then delete
`focusOnMilkyWay` and remove it from the camera handle.

**Files:**
- `src/services/engine/helpers/commitFocus.ts` (modify — three-way dispatch)
- `src/services/engine/helpers/commitMilkyWayFocus.ts` (new — one fn per file)
- `src/services/engine/engine.ts` (modify — delete `focusOnMilkyWay`; remove from the
  returned handle at `engine.ts:1188-1189`)
- `src/@types/engine/handles/EngineCameraHandle.d.ts` (modify — remove the
  `focusOnMilkyWay` member + its docline; refresh the type's header comment which currently
  lists "focus-on-milkyway")
- `src/hooks/useUrlSync.ts` (modify — handle a `MilkyWayInfo` focus, see below)
- `tests/services/engine/helpers/commitFocus.test.ts` (modify)
- `tests/services/engine/engine.test.ts` (modify — drop any `focusOnMilkyWay` coverage)
- `tests/hooks/useUrlSync.test.ts` (modify)

**The third cast hazard — `useUrlSync.ts:107`.** Setting the focus slot to `MILKY_WAY_INFO`
fires `onFocusChange(MILKY_WAY_INFO)`, which `useUrlSync` consumes at line 107 with
`if (isStructure(input.focused)) { …structure hash… } else { …galaxy hash… }`. A
`MilkyWayInfo` has no `source`/objID/PGC, so the galaxy branch would emit a broken
`#focus=` hash. Add a `isMilkyWay(input.focused)` branch FIRST that **clears the focus hash**
(no deep-link) — this matches the pre-existing behavior (the old `focusOnMilkyWay` set the
focus slot to `null`, so there was never a MW hash) and avoids touching the URL `FocusTarget`
parser. MW deep-linking (`#focus=milkyway` round-trip) is explicitly deferred (see the spec's
out-of-scope).

**Dispatch contract** (`commitFocus.ts`) — currently a two-way `isStructure(target) ?
commitStructureFocus : commitGalaxyFocus` (cite `commitFocus.ts:15-21`). Make it:

```ts
if (isStructure(target)) commitStructureFocus(state, target);
else if (target.kind === 'milkyWay') commitMilkyWayFocus(state, target);
else commitGalaxyFocus(state, target);
```

`commitMilkyWayFocus` carries the framing logic lifted from `focusOnMilkyWay`
(`engine.ts:756-772`): guard on `state.cam`, set BOTH slots
(`setSelected(MILKY_WAY_INFO)` so the InfoCard pins + `setFocused(MILKY_WAY_INFO)` so
focus state matches — note the OLD method dropped focus to null because there was no MW
target; with `MilkyWayInfo` we now set it), then `tweenToCameraSnapshot` to
`MILKY_WAY_VIEW_DISTANCE_MPC` at `MILKY_WAY_CENTER_WORLD` preserving yaw/pitch/fov.
Put it in its own file `src/services/engine/helpers/commitMilkyWayFocus.ts` (one fn per
file), mirroring `commitGalaxyFocus.ts` / `commitStructureFocus.ts`.

**Focus-fade collapse:** `runFrame`'s member-isolation fade keys on `isStructure(focused())`
(post-Part-0). A milkyWay focus is non-structure, so the fade collapses exactly as a galaxy
focus does — confirm by reading the current `runFrame` focus-fade gate; no change should be
needed, but assert it in a test.

`focusOnHome` (`engine.ts:734-747`) is **unchanged** — a different gesture (the wide bbox
reset).

- [ ] Add test `commitFocus routes a milkyWay target to the milkyWay focus path` —
  assert `commitMilkyWayFocus` is reached (or, more robustly, assert the observable: both
  slots end up `MILKY_WAY_INFO` and a tween to `MILKY_WAY_VIEW_DISTANCE_MPC` /
  `MILKY_WAY_CENTER_WORLD` is enqueued).
- [ ] Add test `commitMilkyWayFocus sets both the select and focus slots to MILKY_WAY_INFO`.
- [ ] Add test `commitMilkyWayFocus is a no-op when state.cam is null` (mirrors the old
  guard at `engine.ts:756-757`).
- [ ] Add test `a milkyWay focus collapses the structure member-isolation fade`
  (`isStructure(focused())` is false) — or assert via the `runFrame` gate if that's where
  the existing galaxy-focus equivalent is tested.
- [ ] Add test `useUrlSync clears the focus hash for a Milky Way focus` (drive
  `onFocusChange(MILKY_WAY_INFO)`; assert no `#focus=` is written / it is cleared, and the
  galaxy branch is NOT taken).
- [ ] `npm test -- commitFocus commitMilkyWayFocus engine useUrlSync` → passes;
  `npm run typecheck` clean (the `EngineCameraHandle` removal must surface no stray callers
  — fix any).
- [ ] Commit.

### Task 9: Typed palette MW command; delete the sentinel + onSelect special-case

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
  see the `pseudo`/glyph investigation in Task 10)
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

### Task 10: Retire `FamousMetaEntry.pseudo` + the glyph-fallback path iff MW was its only user

The `pseudo` flag (`src/@types/loading/FamousMetaEntry.d.ts:33`) and the palette's
glyph-fallback branch (`CommandPalette.tsx:362-387`, the `isPseudo` block) exist solely
for the MW pseudo-entry. After Task 9 the MW no longer flows through `FamousMetaEntry`, so
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

### Task 11: InfoCard milkyWay branch

The InfoCard dispatches via `isStructure` into galaxy / structure detail cards
(`InfoCard.tsx:77-128`). Add a small branch keyed on the `MilkyWayInfo` discriminant:
no thumbnail, a glyph in the image slot, headline + description + type + distance note.

**Files:**
- `src/components/InfoCard/InfoCard.tsx` (modify — add the milkyWay dispatch)
- `src/components/InfoCard/MilkyWayDetailCard.tsx` (new — mirror `StructureDetailCard.tsx`'s
  shape; a glyph in the image slot, the four `MilkyWayInfo` string fields, and a "Fly here"
  button wired to `onFocus(MILKY_WAY_INFO)`)
- `src/components/InfoCard/MilkyWayDetailCard.module.css` (new, if styling is needed beyond
  reuse)
- `tests/components/InfoCard/*` (modify / new as the existing InfoCard tests are structured)

**Dispatch contract** (`InfoCard.tsx`): the current split is `isStructure(selected)` →
structure vs galaxy. Add a milkyWay check FIRST among the non-structure branch (a
milkyWay is non-structure, so it must be distinguished from galaxy before the
`as GalaxyInfo` cast at `InfoCard.tsx:78,80`):

```ts
const selectedMilkyWay = selected?.kind === 'milkyWay' ? selected : null;
const selectedStructure = selected && isStructure(selected) ? selected : null;
const selectedGalaxy =
  selected && !isStructure(selected) && selected.kind !== 'milkyWay'
    ? (selected as GalaxyInfo)
    : null;
// (same three-way narrowing for `hovered`)
```

Render `MilkyWayDetailCard` when `selectedMilkyWay` is set, inside the same stable outer
wrapper (cite the `<details>`-remount hazard in `InfoCard.tsx:5-9` — keep the wrapper
element identical across renders). The "Fly here" button calls `onFocus?.(MILKY_WAY_INFO)`.

- [ ] Add test `InfoCard renders the Milky Way card for a milkyWay selection` asserting
  the headline "Milky Way" + the description text appear and no `<img>` thumbnail is
  rendered (glyph instead).
- [ ] Add test `the Milky Way card's Fly here button calls onFocus with MILKY_WAY_INFO`.
- [ ] Add test `a galaxy selection still renders the galaxy card` (regression — the
  three-way narrowing didn't mis-route galaxies).
- [ ] `npm test` (InfoCard suite) → passes; `npm run typecheck` clean.
- [ ] Commit.

---

## Definition of Done

- [ ] `npm test` is fully green (no skips beyond the optional GPU-backed pick test in
  Task 5, if the harness is null-device-only).
- [ ] `npm run typecheck` is clean for both `src` and `tools` tsconfigs.
- [ ] `npm run build` succeeds.
- [ ] The Milky Way is **clickable in-scene** → selecting it shows the **InfoCard**, draws
  the **selection ring**, and **double-click / palette / "Fly here"** all **focus** (tween)
  it — every step on the standard `FocusableTarget` path, no MW-specific method.
- [ ] `camera.focusOn(MILKY_WAY_INFO)` is the only focus entry point; `focusOnMilkyWay` is
  gone from `engine.ts` AND `EngineCameraHandle` (grep returns zero matches).
- [ ] The `__milky-way__` sentinel + `src/data/milkyWay/milkyWayEntry.ts` + the `App.tsx`
  `onSelect` MW special-case are deleted (grep for `MILKY_WAY_ID` / `__milky-way__` /
  `milkyWayEntry` returns zero matches; the surviving `MILKY_WAY_ENTRY` in
  `src/data/sources/milky-way.ts` is the source-registry row, intentionally kept).
- [ ] `FamousMetaEntry.pseudo` + the palette glyph-fallback path are removed (Task 10) OR
  a documented note records why a non-MW user kept them.
- [ ] Every `!isStructure(...) ⇒ galaxy` site is now a guarded three-way (`isMilkyWay`
  checked): `pointSpritesPass`, `diskRadiusRingPass`, `InfoCard`, `useUrlSync` — a
  `MilkyWayInfo` selection/focus never mis-routes into a galaxy branch (grep `as GalaxyInfo`
  and confirm each is preceded by an `isMilkyWay` exclusion).
- [ ] No new `TODO` / `FIXME` comments introduced by this plan.
- [ ] **Manual smoke test** (dev server, real data — ask the user to look, per the
  no-kill-dev-server convention): fly near the Milky Way until the disk is visible; click
  the galactic centre; confirm (a) the InfoCard shows the Milky Way card with the glyph,
  (b) a selection ring is drawn around it, (c) double-click (or the palette "Milky Way"
  command, or the card's "Fly here") tweens the camera in to the impostor framing; then fly
  far away and confirm the MW is no longer pickable (the disk has faded out).
