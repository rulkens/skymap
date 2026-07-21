# Solar-system time control — Plan 01: Ground preparation

> **Spec.** `docs/superpowers/specs/2026-07-21-solar-system-time-control.md` §10
> (Ground preparation). This plan covers **Prep A + Prep B only** — the two
> refactors that must land, with **zero visual/behaviour change**, before the
> feature plans (`…-02-core.md`, `…-03-surface.md`).
> **Grill decisions.** Q6 (BodyState snapshot), Q8 (URL param seam).
> **Worktree.** `solar-system-time-control`.

## Delivery — one PR, ordered commits

Both preps ride **ONE PR (#472)** as ordered commits (Prep A tasks, then Prep B
tasks, then one entanglement-radar pass), **not** two PRs. The spec's "two prep
PRs" framing predates the decision to co-land; A and B touch disjoint code so a
single review is cheaper. Draft the PR when the first task lands.

Executed via **subagent-driven-development** (fresh implementer per task). Every
task is TDD: failing test first where a behaviour is asserted, then green.

**Zero-change gate.** The existing suite (600+ files) is the regression net for
every repoint — it must stay green after each task. New tests in this plan pin
*new* structure only; they never restate the J2000 element constants.

**File moves.** No task in this plan **relocates** an existing module — new
modules are created with `Write`, fields are edited in place. If an implementer
finds a relocation is genuinely needed, it MUST go through
`npm run move-files -- <from> <to>` (never `git mv` + hand-edited imports); see
`.claude/skills/move-files/SKILL.md`.

---

## Prep A — BodyDef / BodyState split

### The decomplection

Today a scene-body record is **both** identity (`id`, `label`, `radiusKm`,
`albedo`) **and** state (`positionMpc`, `orientation`), baked once at module load
by the makers (`heliocentricPlanet.ts:27,30`, `satelliteBody.ts:33,36`,
`sceneEarth.ts:30,32`). With a clock those diverge. Prep A splits them:

- **BodyDef** = the record, identity only (drop `positionMpc` + `orientation`
  from `PlanetBody` and `EarthBody`).
- **BodyState** = `{ positionMpc, orientation, meanAnomalyRad }`, supplied by a
  derived snapshot `deriveBodyStates(simDays)`.

At prep the snapshot is evaluated at a fixed epoch `CONST_J2000` and returns
byte-identical positions/orientations to today's baked values (no rate
propagation — that is the feature). Consumers **repoint off the baked record
field onto the snapshot**. The feature then changes exactly one line: the epoch
argument becomes the frame's derived `simDays`.

### Stars stay static — out of the snapshot

`SCENE_STARS` (the Sun + local stars) carry no orbital elements and do not move
(proper motion is a non-goal). `StarBody` is **unchanged** — it keeps
`positionMpc`. `deriveBodyStates` covers **only** the 22 `ORBITAL_ELEMENTS`
bodies (Earth + 7 planets + 14 moons), never stars. Star-drawing layers
(`starSpheresLayer`, `starPointsLayer`) and the famous/field-star paths are **not
touched** by this plan.

### Two access patterns for one snapshot

- **Per-frame consumers** (render/pick passes, the atmosphere list, the selection
  resolver) read a per-frame memo `sceneBodyStates(state, ctx)` (Task A2) — a peer
  of `sceneBodyPartition` (`src/services/engine/frame/sceneBodyPartition.ts`),
  the pattern to mirror.
- **Data-layer / static consumers** (`sceneOrbitConics`, `earthFlyout`,
  `foregroundMaxDistance`, `orbitTrailsLayer`'s extent bound) must **not** import
  the services-layer snapshot (layering). They re-derive their positions directly
  from `ORBITAL_ELEMENTS` via the existing `keplerianPositionMpc` /
  `keplerianEllipse` (data → data), or from a time-invariant bound. This keeps the
  data layer self-contained; the shared formula (`keplerianPositionMpc`) is the
  single source, so this is not a mirror.

### Contracts

```ts
// src/@types/scene/BodyState.d.ts  (one type per file; `type`, not interface)
import type { Vec3 } from '../math/Vec3';
import type { Mat3 } from '../math/Mat3';
export type BodyState = {
  readonly positionMpc: Vec3;      // absolute heliocentric, f64-valued
  readonly orientation: Mat3;      // local → equatorial-world
  readonly meanAnomalyRad: number; // orbit-trail falloff anchor
};
```

```ts
// src/services/engine/frame/deriveBodyStates.ts
export function deriveBodyStates(simDays: number): ReadonlyMap<string, BodyState>;
// Planets first, then moons (one parent hop). NO rate propagation in prep —
// evaluates keplerianPositionMpc(elements) + orientationForBody(id) exactly as
// the makers do today, so deriveBodyStates(CONST_J2000) reproduces the current
// baked values. `simDays` is the seam the feature fills with §3 propagation.
```

```ts
// src/services/engine/frame/sceneBodyStates.ts  (peer of sceneBodyPartition)
export function sceneBodyStates(state: EngineState, ctx: ReadyFrameContext):
  ReadonlyMap<string, BodyState>;
// Returns deriveBodyStates(CONST_J2000). This memo is THE single site that
// chooses the epoch — the feature swaps CONST_J2000 → ctx.simDays here alone.
```

`CONST_J2000` is the J2000 epoch as JD-like sim-days; at prep the rate-less
derive does not read it (all bodies evaluate at the tabulated mean elements), so
its exact value is not load-bearing yet. Place it beside `deriveBodyStates`.

---

### Task A1 — BodyState type, CONST_J2000, deriveBodyStates

**Files:** `src/@types/scene/BodyState.d.ts` (new), `src/services/engine/frame/deriveBodyStates.ts` (new, exports `CONST_J2000` too or a sibling `src/data/time/constJ2000.ts` — implementer's call), `tests/services/engine/frame/deriveBodyStates.test.ts` (new).

Derive from `ORBITAL_ELEMENTS` (`src/data/bodies/orbitalElements.ts`) reusing
`keplerianPositionMpc`, `orientationForBody`, `RENDER_ORIGIN_MPC`, and the
parent-hop logic the makers use (`satelliteBody.ts:26-38`). Moons resolve their
parent's world position from the parent's already-derived state.

- [ ] `deriveBodyStates returns a state for every ORBITAL_ELEMENTS id and no star id` — structural; catches a dropped moon or an accidental star inclusion.
- [ ] `a moon rides its parent` — assert `|state('moon').positionMpc − state('earth').positionMpc|` is within the Moon's [periapsis, apoapsis] band (an independent orbital property, not a re-run of `keplerianPositionMpc`).
- [ ] `orientation is identity iff the body is untextured` — e.g. `state('titan').orientation === IDENTITY_MAT3`, `state('earth').orientation !== IDENTITY_MAT3` (matches `orientationForBody`'s texture-gate contract).
- [ ] Do **not** add a test restating a J2000 element or asserting a hand-copied position literal.
- [ ] Commit.

### Task A2 — `sceneBodyStates(state, ctx)` per-frame seam

**Files:** `src/services/engine/frame/sceneBodyStates.ts` (new). No test of its own — it is a one-line `deriveBodyStates(CONST_J2000)` bind (the "epoch chosen once" seam); A1 covers the derive and the repoint tasks exercise the binding.

- [ ] Mirror `sceneBodyPartition.ts`'s shape (takes `state`, `ctx`; returns the map). Document that this is the sole epoch-choice site.
- [ ] Commit.

### Task A3 — Repoint the mesh-body layers + the partition

**Files:** `src/services/engine/frame/passes/planetsLayer.ts`, `.../texturedBodiesLayer.ts`, `.../earthLayer.ts`, `.../ringsLayer.ts`, `src/services/engine/frame/partitionBodiesByPresentation.ts`, `src/services/engine/frame/sceneBodyPartition.ts`.

These read `body.positionMpc` / `body.orientation` off the records the partition
yields (see `planetsLayer.ts:129-139,190-197`). Repoint each read to
`sceneBodyStates(state, ctx).get(body.id)`. `partitionBodiesByPresentation` needs
positions for its apparent-size test (`partitionBodiesByPresentation.ts:82-88`),
so give it a `bodyStates` (or `positionOf(id)`) input, bound in
`sceneBodyPartition`. `drawFlooredSpherePick` already takes `positionMpc` /
`orientation` as parameters (`drawFlooredSpherePick.ts:40-60`) — **pass-through,
no change**; only its callers change (they already are these layers).

- [ ] Repoint every `body.positionMpc` / `body.orientation` read in the four layers + the partition to the snapshot.
- [ ] Existing pass tests (`tests/services/engine/frame/passes/*.test.ts`) stay green; move any fixture that hand-set a body's `positionMpc` onto a `sceneBodyStates`/`deriveBodyStates` stub returning the same J2000 values.
- [ ] Commit.

### Task A4 — Repoint the glint + atmosphere + cloud layers

**Files:** `src/services/engine/frame/passes/bodyGlintsLayer.ts`, `.../atmosphereShellLayer.ts`, `.../cloudShellLayer.ts`, `src/services/engine/frame/atmosphereDrawList.ts`, `src/services/engine/frame/encodeAtmosphereSkyView.ts`, `src/@types/engine/frame/AtmosphereDrawEntry.d.ts`.

`atmosphereDrawList` reads `body.positionMpc` (`atmosphereDrawList.ts:72-74`) and
its `AtmosphereDrawEntry` carries the whole `body` so the bake + shell draw read
`body.positionMpc`/`orientation`. Resolve position + orientation from
`sceneBodyStates` once in `atmosphereDrawList` and add
`positionMpc: Vec3; orientation: Mat3` to `AtmosphereDrawEntry` (the entry becomes
the resolved pairing) — so the two atmosphere consumers keep reading ONE resolved
list and cannot diverge. `bodyGlintsLayer`/`cloudShellLayer` repoint their own
reads to the snapshot.

- [ ] Repoint reads; extend `AtmosphereDrawEntry` with resolved `positionMpc` + `orientation`.
- [ ] Existing atmosphere/glint/cloud tests stay green (fixtures onto the snapshot as in A3).
- [ ] Commit.

### Task A5 — Repoint captions + texture-demand wiring

**Files:** `src/services/engine/presentation/sceneBodyLabels.ts`, `src/services/engine/wiring/assetWiring.ts`, and their callers/tests.

`sceneBodyLabels` reads `body.positionMpc` for Earth + planets
(`sceneBodyLabels.ts:132-135,168-176`) — stars keep their own record field.
`assetWiring.bodyPosOf` (`assetWiring.ts:157-160`) reads a host body's
`positionMpc` for texture load-radius gating; its hosts are all snapshot bodies
(textured planets/Earth/Moon/Saturn). Repoint both to the snapshot at
`CONST_J2000` (labels stay a construction-time static call in prep — the feature
re-plumbs labels-follow-bodies per-frame; that is feature scope, not this plan).

- [ ] Repoint the Earth+planet reads in `sceneBodyLabels` and `bodyPosOf` to the snapshot; leave the `SCENE_STARS` label reads on the record.
- [ ] Existing `tests/services/engine/presentation/sceneBodyLabels.test.ts` + wiring tests stay green.
- [ ] Commit.

### Task A6 — Repoint the selection resolver

**Files:** `src/services/engine/helpers/extractSelectionRow.ts`, and verify (no change expected) `focusFraming.ts`, `buildFocusable.ts`, `selectionHaloTable.ts`.

`extractSelectionRow`'s `body` arm is the ONE site that copies a scene body's
`positionMpc` into the stored `SelectionRow` (`extractSelectionRow.ts:36-46`) —
repoint the planet/Earth branch to the snapshot (star branch already reads the
live catalog). The downstream consumers `focusFraming`
(`focusFraming.ts:106-109`), `buildFocusable` (`buildFocusable.ts:35-41`), and
`selectionHaloTable` (`selectionHaloTable.ts:90-102`) read `row.positionMpc`, not
the scene record — **confirm they need no change** and note it in the commit.

- [ ] Repoint the `body` arm of `extractSelectionRow` to the snapshot.
- [ ] `tests/services/engine/helpers/extractSelectionRow.test.ts` stays green.
- [ ] Commit.

### Task A7 — foregroundMaxDistance: repoint + comment fix

**Files:** `src/services/engine/frame/foregroundMaxDistance.ts`.

`FARTHEST_BODY_MPC` / `FARTHEST_PLANET_MPC` are `max |positionMpc|` over
`SCENE_BODIES` / `SCENE_PLANETS` (`foregroundMaxDistance.ts:69-95`) — a gate
bound. After the split, planet/Earth records carry no `positionMpc`. Source the
planet/Earth magnitudes from `deriveBodyStates(CONST_J2000)` and the star
magnitudes from `SCENE_STARS` records (the gate is dominated by the deep static
stars, so it stays effectively time-invariant with its ×100 margin). Fold in the
stale comment fix: `foregroundMaxDistance.ts:68` "authored origin-relative" no
longer describes a baked record field — reword to reflect the snapshot source.

- [ ] Repoint the two `max`-reductions; reword the comment.
- [ ] `tests/services/engine/frame/foregroundMaxDistance.test.ts` (the "< 1 Mpc, ≥ two decades over the roster" invariants) stays green.
- [ ] Commit.

### Task A8 — sceneOrbitConics → per-frame-capable derivation

**Files:** `src/data/bodies/sceneOrbitConics.ts`, `tests/data/bodies/sceneOrbitConics.test.ts`.

`parentWorldMpc` resolves a moon's parent center from the parent's **load-time
baked** `SCENE_BODIES.positionMpc` (`sceneOrbitConics.ts:43-46`) — time-hostile: a
moon's trail center must ride the parent's *current* position. Restructure into a
pure `deriveOrbitConics(simDays): readonly OrbitConic[]` that resolves each
parent center by re-deriving it from the parent's `ORBITAL_ELEMENTS` via
`keplerianPositionMpc` (data → data, no snapshot import). Keep the static export
`SCENE_ORBIT_CONICS = deriveOrbitConics(CONST_J2000)` so the current static
consumers (`orbitTrailsLayer`, three tests) are untouched.

- [ ] Extract `deriveOrbitConics(simDays)`; parent centers re-derive from elements.
- [ ] `SCENE_ORBIT_CONICS` retains its exact current values (existing `sceneOrbitConics.test.ts`, `orbitTrailsLayer.test.ts`, `composeOrbitConic.test.ts` stay green — this is the zero-change proof; do not add a mirror test re-deriving the conic).
- [ ] Commit.

### Task A9 — orbitTrailsLayer: time-invariant extent bound

**Files:** `src/services/engine/frame/passes/orbitTrailsLayer.ts`.

`MAX_ORBIT_EXTENT_MPC` is a module const derived from the conic **centers**
(`orbitTrailsLayer.ts:71-77`) — those move once trails animate, so the whole-layer
sub-pixel cull bound would go stale. Re-derive the bound from each orbit's **max
apoapsis** (`a·(1+e)` from the parent-relative extent), which is **time-invariant**
— an outer envelope every orbit stays inside for all `t`. The cull stays
conservative (never drops a visible orbit).

- [ ] Replace the center-derived bound with the apoapsis envelope.
- [ ] `tests/services/engine/frame/passes/orbitTrailsLayer.test.ts` stays green; if a test pins the old bound value, retarget it to the envelope property (bound ≥ every orbit's farthest reach), not a copied literal.
- [ ] Commit.

### Task A10 — earthFlyout + earthSurfaceFraming: off SCENE_EARTH.positionMpc

**Files:** `src/data/animation/clips/earthFlyout.ts`, `src/utils/camera/earthSurfaceFraming.ts`, and their tests.

`earthFlyout` bakes its clip start `target` from `SCENE_EARTH.positionMpc`
(`earthFlyout.ts:58`) — a bookmark that stays a fixed J2000 pose. Re-derive
Earth's J2000 position directly from `ORBITAL_ELEMENTS` via `keplerianPositionMpc`
+ `RENDER_ORIGIN_MPC` (data → data). `earthSurfaceFraming` takes an
`earth: EarthBody` and reads `earth.positionMpc` (`earthSurfaceFraming.ts:45-48`)
— change its signature to take the framing position (a `Vec3` or `BodyState`); its
saga caller passes the resolved Earth state (J2000 in prep; the feature passes the
live state for free).

- [ ] Repoint both; keep the pure, state-free shape of `earthSurfaceFraming`.
- [ ] `tests/utils/camera/earthSurfaceFraming.test.ts` + any `earthFlyout` test stay green (adjust the fixture to pass the position, same J2000 value).
- [ ] Commit.

### Task A11 — Strip state from the records (compile proves the repoint)

**Files:** `src/@types/scene/PlanetBody.d.ts`, `src/@types/scene/EarthBody.d.ts`, `src/@types/scene/SceneBody.d.ts` (doc), `src/data/bodies/makers/heliocentricPlanet.ts`, `.../makers/satelliteBody.ts`, `src/data/bodies/sceneEarth.ts`, `src/data/bodies/scenePlanets.ts` (unchanged data, verify), and any straggler fixtures the compiler flags.

Remove `positionMpc` + `orientation` from `PlanetBody` and `EarthBody` (identity
only). The makers stop baking them (`heliocentricPlanet.ts:27,30`,
`satelliteBody.ts:28-36`, `sceneEarth.ts:30,32`). `StarBody` is untouched. Update
the `SceneBody` union docstring (it currently claims all arms share
`positionMpc`). `tsc` now fails at any un-repointed read — fix each (they should
all be A3–A10; this task catches stragglers).

- [ ] Strip the fields; run `npx tsc --noEmit` (both tsconfigs) — zero errors means every reader was repointed.
- [ ] Move any remaining test fixture that built a record with `positionMpc`/`orientation` onto `deriveBodyStates`/a state stub.
- [ ] Full suite green.
- [ ] Commit.

---

## Prep B — useUrlSync param seam

### The generalization

`useUrlSync.ts` owns `window.location.hash` as a **single** `focus=<id>` param:
the read effect matches the whole body with `/^focus=(.+)$/`
(`useUrlSync.ts:121`) and the write composes the whole body as `focus=${id}`
(`useUrlSync.ts:96`). Prep B generalizes this into an **`&`-separated multi-param**
parse/compose with per-param **sources**; `focus` becomes the first (and, in prep,
only) source. **No new params** — the feature adds `t=` as a second source. Existing
URLs (`#focus=body-jupiter`, `#focus=cluster-virgo-m87`, bare) must parse and
compose **identically** (round-trip).

### Contracts

```ts
// src/utils/url/parseHashParams.ts   (one fn per file)
export function parseHashParams(body: string): ReadonlyMap<string, string>;
//   'focus=body-jupiter'          → { focus: 'body-jupiter' }
//   'focus=body-jupiter&t=2026…'  → { focus: 'body-jupiter', t: '2026…' }
//   ''                            → {}  (a leading '#' is already stripped upstream)

// src/utils/url/composeHashParams.ts
export function composeHashParams(params: ReadonlyMap<string, string>): string;
//   inverse of parseHashParams; stable key order; '' for an empty map.
```

```ts
// src/@types/hooks/HashParamSource.d.ts   (one type per file)
// A per-param source: its key, how to WRITE its desired value from store state,
// and how to READ a present/absent value into dispatches. `focus` is the first
// entry of a HASH_PARAM_SOURCES table; the feature appends `t`.
export type HashParamSource = { readonly key: string; /* read/write hooks — shape settled in B2 */ };
```

Exact source-hook shape is settled in B2 against the current focus behaviour
(present ⇒ `requestFocus(id)`; absent-on-hashchange ⇒ `clearSelection()`;
absent-on-mount ⇒ nothing — `useUrlSync.ts:116-129`). Keep it minimal — one param
source, faithful behaviour.

### Task B1 — parse / compose helpers

**Files:** `src/utils/url/parseHashParams.ts` (new), `src/utils/url/composeHashParams.ts` (new), tests alongside.

- [ ] `parseHashParams splits &-separated key=value pairs` — `'focus=a&t=b'` → map of two.
- [ ] `round-trips` — `composeHashParams(parseHashParams(x)) === x` for `'focus=body-jupiter'`, `'focus=a&t=b'`, and `''`; and `parseHashParams(composeHashParams(m))` deep-equals `m`.
- [ ] `single focus param parses as today` — `'focus=cluster-virgo-m87'` → `{ focus: 'cluster-virgo-m87' }`.
- [ ] Commit.

### Task B2 — HashParamSource registry; focus as the first source

**Files:** `src/@types/hooks/HashParamSource.d.ts` (new), a `HASH_PARAM_SOURCES` table (new, near `useUrlSync`), `src/hooks/useUrlSync.ts`, `tests/hooks/useUrlSync.test.ts`.

Refactor `computeDesiredHash` to compose the write body over the source table via
`composeHashParams`, and Effect A's read to `parseHashParams` + dispatch through
each source. `focus`'s write reuses `URL_HASH_FOR` (`useUrlSync.ts:95-96`); its
read reuses the present/absent/isInitial logic (`useUrlSync.ts:118-124`).

- [ ] Every existing `useUrlSync` test and `tests/hooks/urlHashFor.test.ts` stays green **unchanged** (the behaviour is identical) — this IS the round-trip acceptance for `focus`.
- [ ] Add `computeDesiredHash composes focus through the param seam` asserting `focus=<id>` is still produced for a galaxy/structure focus (one targeted assertion, not a full-object snapshot).
- [ ] `hasDeepLink` (`src/utils/url/hasDeepLink.ts`) still detects `#focus…` — verify its test stays green (no change expected; it substring-matches).
- [ ] Commit.

---

## Final task — entanglement-radar over the PR diff

### Task Z1 — Simplicity review

Run the `entanglement-radar` skill over the whole #472 diff (Prep A + Prep B).
Specifically check:

- [ ] No body position/orientation is read from **two** sources (a baked record field surviving next to the snapshot) — the split must be clean, one source (A11's `tsc` pass is the mechanical proof; confirm no runtime fallback re-introduced it).
- [ ] `sceneBodyStates` is the **only** epoch-choice site (grep for stray `deriveBodyStates(` calls that hard-code `CONST_J2000` in a per-frame path — those belong behind the memo).
- [ ] The data-layer re-derivations (A8, A10, A7's planet source) share `keplerianPositionMpc` and do not copy its formula (no mirror).
- [ ] The `HashParamSource` seam did not over-abstract for one param — it earns its shape by making the feature's `t=` a pure table append.
- [ ] Fold or file any knot named; commit the review notes in the PR description.

---

## Definition of done

- [ ] `npm run typecheck` clean (both tsconfigs).
- [ ] `npm test` green — the whole suite, unchanged except fixtures moved onto the snapshot / param seam.
- [ ] Zero visual/behaviour change: at any camera pose the bodies, trails, captions, atmosphere, selection halo, and URL are byte-identical to `main` (the existing suite is the proof; a dev-server spot-check of the solar-system descent is the human confirm).
- [ ] `PlanetBody` + `EarthBody` carry no `positionMpc`/`orientation`; `StarBody` unchanged.
- [ ] `deriveBodyStates` + `sceneBodyStates` + `deriveOrbitConics(simDays)` exist and are evaluated at `CONST_J2000` everywhere in prep.
- [ ] `useUrlSync` parses/composes through the `&`-separated param seam with `focus` as the sole source; existing URL tests unchanged and green.
- [ ] One PR (#472), ordered commits, entanglement-radar notes in the PR body.
