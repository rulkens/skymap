# Layer composition, prep PR (b) — boot de-coupling, and the Earth home leaves `wireInput`

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(b), with §4.4 (`EngineComposition.home`) as the shape this PR builds toward and §10's
dependency note ("(b) blocks the reference engine") as the reason it exists. Read §9(b)
before starting — its four bullets are this plan's four pieces.

Plan 02 of the layer-composition sequence; follows plan 01 (completed,
[`plans/completed/2026-09-10-layer-composition-01-content-pass-rename.md`](completed/2026-09-10-layer-composition-01-content-pass-rename.md)).

Branch: `worktree-layer-boot-decoupling` (off `79f1f8063`). One PR, 6 tasks, every commit green.

## Goal

An engine composed WITHOUT the galaxy / star / Milky-Way / body renderers must be able to
boot. Today three boot phases refuse: two throw on named renderers and one silently
abandons camera + picking + all input. A fourth coupling is subtler — `wireInput`
hard-codes the app's Earth home (pose recipe, target, and the cinema-mode branch), so any
other composition boots pointing at Earth or not at all.

This PR removes those four hard-codings and nothing else. **Behaviour-neutral for the
shipping app**: same first frame, same seeded selection + focus, same cinema-mode
behaviour, same deep-link deference. The reference engine that consumes the freedom is
PR (d); the `EngineComposition` type that will carry `home` is PR (c).

## Inventory, verified in this worktree at `79f1f8063`

Re-derive these; don't trust them.

| Thing                                                                                       | Where                                                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `galaxyPointRenderer` early return (piece 2)                                                | `wireInput.ts:66-69` — `renderer` is read **nowhere else** in the file (383 lines)             |
| Earth home pose recipe (piece 4)                                                            | `wireInput.ts:138-157` (comment 138-149, code 150-157)                                         |
| Earth home seed + cinema branch (piece 4)                                                   | `wireInput.ts:198-244` (comment 198-233, code 234-244)                                         |
| disk-renderer precondition (piece 1)                                                        | `wireSlots.ts:93-101`, twinned at `wireImpostorSubsystems.ts:38-53`                            |
| four-renderer readiness throw (piece 3)                                                     | `startLoop.ts:77-97`; the same phase already `!`-asserts `deps.phaseLocals` at `:76`           |
| `wireImpostorSubsystems` is the ONLY reader of the two disk renderers in `wireSlots`' reach | `assetWiring.ts` names neither renderer; grep confirms                                         |
| typed `BootstrapDeps` fixtures needing the new `home` field                                 | 6 files / 7 literals — see Task 2                                                              |
| `createEngine(` call sites                                                                  | 2 — `src/hooks/useEngine.ts:76`, `tests/services/engine/registerReconcile.test.ts:59`          |
| living-doc hits for `wireInput` / `wireSlots` / `startLoop` / `EARTH_REF` / `isCinemaMode`  | **0** in `docs/RENDERER.md`, `docs/DATA.md`, `docs/DEPLOY.md`, `docs/superpowers/conventions/` |

## The three "explore and decide" rulings

Made at plan time from the tree; do not re-open during execution.

### 1. Where the disk-renderer precondition goes (piece 1)

**Into `wireImpostorSubsystems`' signature, as two non-null parameters; `wireSlots` skips
the call when either renderer is absent.**

`wireImpostorSubsystems` is the only thing under `wireSlots` that touches those renderers
(`assetWiring.ts` names neither; `seedFades` reads only `state.subsystems.fades`; the
`installLoadProgress` / `reevaluateDemand` tail is renderer-free). So the precondition has
exactly one reading site, and skipping that site is the whole of "absent is legal".

Both throws then delete rather than move: with the renderers arriving as typed arguments,
"they are non-null here" is a compile-time fact, and a runtime restatement of a
compile-time fact is the anti-pattern `testing.md` names. The ordering-bug class the throws
guarded (initGpu skipped or reordered) still fails loudly two statements later at
`wireSlots.ts:136`'s `deps.phaseLocals!.device`.

Spec §9(b)'s final home for this precondition — the `galaxyCatalog` Layer's `create` — is
PR (d)'s business and is not built here.

### 2. What `startLoop`'s readiness invariant is about (piece 3)

**`deps.phaseLocals` — "did `initGpu` run" — replacing today's four-renderer proxy, and
replacing the phase's existing `!` assertion at `:76`.**

There is no boot-completion marker to reach for and this PR must not invent one. The four
renderers are a proxy for one fact: the phases ran in order. `phaseLocals` is the same
proxy with a subject that survives a composition dropping every one of those renderers —
it is written by `initGpu` and by nothing else, and the only reachable way `startLoop` sees
it undefined is the reorder/skip bug the throw exists for (a partial `initGpu` rejects, and
`runBootstrapPhases` short-circuits on the first rejection).

The invariant's real subject under the Layer contract — "every present Layer's `create`
returned" — arrives with (c)/(d). No comment is left behind pointing at that; the spec is
the durable home for it.

### 3. Where `home` is carried, and how the focus landmine is typed (piece 4)

**Carrier:** `createEngine(canvas, cb, home)` → `BootstrapDeps.home`, required on both.
`BootstrapDeps` is the only channel a phase has, so the value must ride it regardless; the
third `createEngine` parameter is what (c) folds, one call site, into `composition.home`.

**Landmine:** `wireInput.ts:206-207`'s "no tween is planted, `watchFocusTweenSaga` no-ops
for follow-driver bodies" is true only because Earth is in `ORBITAL_ELEMENTS`
(`watchFocusTweenSaga.ts:121` → `bodyMovesThisFrame` → membership in that table). A galaxy,
a structure, or a static-anchor body (`sun`, `sgr-a-star`) as home focus would plant a boot
camera tween instead — silently.

`ORBITAL_ELEMENTS` is declared `readonly OrbitalElements[]` and half its rows come from
`.map()` makers, so its `id`s are `string`: **a compile-time literal union is not available
without re-typing that table**, which is out of this PR's scope. The chosen encoding is the
next-strongest thing that is still a type and not a comment: `focus` is typed
`HomeFocusTarget | null`, a shape whose only sanctioned producer (`followedBodyHome`)
checks table membership and throws. A composition cannot write a bare ref into `focus`.

## Global constraints

- **Behaviour-neutral for the app.** The shipped bundle must boot to the same pose, seed
  the same two selection slots, defer to the same deep links, and behave identically under
  `?cinema`. The app's home value is assembled from the same ingredients the phase reads
  today (`DEFAULT_FOV_Y_RAD`, `computeInitialCamera`, `EARTH_REF`, `isCinemaMode`), so the
  diff is where they are named, not what they compute.
- **Both non-static ingredients stay evaluated at wire time.** The boot pose depends on
  live `Date.now()` and on the orientation frame a `#orientation=` deep link committed into
  the store; cinema mode is a URL read. Neither may be snapshotted at module load — a
  `src/compositions/` module that reads `window.location` when it is imported is a fresh
  landmine and would read `false` under Node. Hence `pose` is a function of boot inputs and
  `seedSelection` is a thunk.
- **The deep-link deference guard is mechanism and stays in the phase.**
  `selectHasSelectionIntent` (`wireInput.ts:235`) and its rationale comment are not
  configuration; they do not move.
- **`src/data/` never imports `services/`** (spec §12). This is why the app's home value
  does not live in `src/data/`: its pose recipe calls `computeInitialCamera`. See Task 2.
- **No new knobs.** `EngineHomeConfig` is the only type this PR adds to the composition
  surface. `tier` and `dataUrl` (spec §4.4) are (c)'s, `EngineComposition` itself is (c)'s,
  `layers` is (c)'s.
- **Every file move/rename goes through `npm run refactor -- move <from> <to>`** (or
  `npm run move-files`), never `git mv` plus hand-edited imports. Task 1 has the one move.
- Comment budget per [`comments.md`](../conventions/comments.md): module header ≤ 10 lines,
  comment lines ≤ half the code lines. This PR is net-negative on comments — `wireInput`'s
  two big blocks lose the material that is now expressed by types and by the composition
  value. Do not re-paste that material into the new files; keep only what a reader of
  _that_ file would otherwise rediscover.
- Tests per [`testing.md`](../conventions/testing.md): every new test must be able to fail
  on a real bug no compiler check catches. Adapt the existing phase tests rather than
  duplicating them.
- `npm run perf` is **not** a gate here and must not be claimed: no pass, shader, or
  per-frame statement changes. The visual smoke pass IS required (Task 6).
- Commit after every task.

## New files

```
src/@types/engine/EngineHomeConfig.d.ts     the composition's boot camera + home target
src/@types/engine/HomeFocusTarget.d.ts      a checked home focus target
src/utils/scene/followedBodyHome.ts         the only producer of a HomeFocusTarget
src/utils/scene/bodyFollowsSimClock.ts      ORBITAL_ELEMENTS membership, one home
src/compositions/earthHome.ts               EARTH_HOME — the app's home, as data
tests/utils/scene/followedBodyHome.test.ts
```

---

## Task 1 — the home-config contract

**Files:** the four new `src/` files above (+ the one test file);
`src/utils/scene/bodyMovesThisFrame.ts` (modify); `src/data/selection/earthRef.ts` (modify).

**Contract:**

```ts
// src/@types/engine/EngineHomeConfig.d.ts
export type EngineHomeConfig = {
  /**
   * The boot camera framing. A function, not a snapshot: it is evaluated in
   * `wireInput` against the live boot instant and the committed orientation basis.
   */
  readonly pose: (boot: { readonly simDays: number; readonly frameBasis: Mat3 }) => InitialCam;
  /** The home target, seeded into the focus slot. `null` = this composition has no home. */
  readonly focus: HomeFocusTarget | null;
  /** Whether the home target is also seeded into the SELECT slot (the ring + InfoCard). */
  readonly seedSelection: () => boolean;
};

// src/@types/engine/HomeFocusTarget.d.ts
export type HomeFocusTarget = {
  readonly ref: Extract<SelectionRef, { readonly type: 'body' }>;
  /**
   * The follow driver tracks this body, so seeding it as focus plants no camera
   * tween (`watchFocusTweenSaga` returns on `bodyMovesThisFrame`). Only
   * `followedBodyHome` mints the flag; it is not dispatched into the store.
   */
  readonly followsSimClock: true;
};

// src/utils/scene/followedBodyHome.ts   — throws when the body is not in ORBITAL_ELEMENTS
export function followedBodyHome(ref: Extract<SelectionRef, { type: 'body' }>): HomeFocusTarget;

// src/utils/scene/bodyFollowsSimClock.ts
export function bodyFollowsSimClock(id: string): boolean;
```

- [ ] Extract the `ORBITAL_ELEMENTS` membership test out of
      `bodyMovesThisFrame.ts:17` into `bodyFollowsSimClock`, and call it from both
      `bodyMovesThisFrame` and `followedBodyHome`. One home for the fact, per
      [`comments.md`](../conventions/comments.md)'s echo rule; `bodyMovesThisFrame` keeps
      its row-shaped signature and its module header (trim it to what still applies).
      Use `npm run refactor -- extract` for the move if it fits; otherwise hand-write the
      new file and re-point the one caller.
- [ ] Narrow `EARTH_REF` to the body arm — `export const EARTH_REF = { type: 'body', id: 'earth' } as const satisfies SelectionRef;`
      — so it is assignable to `followedBodyHome`'s parameter. Check
      `src/state/url/hashParamSources.ts:147-152` still compiles unchanged (its
      `EARTH_REF.type === 'body'` discriminant clause stays; do not "simplify" it here).
- [ ] Add `tests/utils/scene/followedBodyHome.test.ts`: - `followedBodyHome returns the target for a body the sim clock propagates` —
      `followedBodyHome(EARTH_REF).ref` is `EARTH_REF`. - `followedBodyHome throws for a static anchor body` — `{ type: 'body', id: 'sun' }`
      (a `famousStars` anchor, deliberately absent from `ORBITAL_ELEMENTS`) throws. This
      is the test that fails the day someone points a composition's home at a body the
      focus-tween saga would tween to.
      No test that `followsSimClock === true`; the compiler owns that.
- [ ] `npm run typecheck` + `npm test -- followedBodyHome bodyMovesThisFrame` green. Commit.

**Reject if:** the membership expression exists in two files; `HomeFocusTarget` carries a
field that gets dispatched into the store; or a test restates a type fact.

## Task 2 — `EARTH_HOME`, and `home` threaded to the phases

**Files:** `src/compositions/earthHome.ts` (new); `src/@types/engine/BootstrapDeps.d.ts`,
`src/services/engine/engine.ts`, `src/hooks/useEngine.ts` (modify);
`tests/services/engine/registerReconcile.test.ts` and the 6 fixture files below (modify).

`EARTH_HOME: EngineHomeConfig` is assembled from exactly today's ingredients:
`pose` = `wireInput.ts:150-157`'s recipe (`DEFAULT_FOV_Y_RAD` + `computeInitialCamera`),
`focus` = `followedBodyHome(EARTH_REF)`, `seedSelection` = `() => !isCinemaMode()`.

**Home for the value:** `src/compositions/` — NOT `src/data/`, which may not import
`services/` (spec §12) and the pose recipe must call `computeInitialCamera`. This is the
folder spec §7 already names for compositions, so (c) folds `EARTH_HOME` into
`src/compositions/app.ts`'s `EngineComposition.home` without a cross-tree move.

**Signatures:**

```ts
export function createEngine(
  canvas: HTMLCanvasElement,
  cb: EngineCallbacks,
  home: EngineHomeConfig,
): EngineHandle;

// BootstrapDeps gains, required:
readonly home: EngineHomeConfig;
```

- [ ] Write `EARTH_HOME`. Module header ≤ 10 lines: what earns its place is _why the two
      halves are functions_ (boot-time inputs) and _why cinema seeds focus only_ — the
      latter migrating from `wireInput.ts:236-241`, not duplicated there.
- [ ] Thread it: `createEngine`'s third parameter onto `bootstrapDeps.home`
      (`engine.ts:651-659`); `useEngine.ts:76` passes `EARTH_HOME`.
- [ ] Update the 6 typed `BootstrapDeps` fixtures. `tests/services/engine/phases/wireInput.test.ts:200`
      uses the real `EARTH_HOME` (Task 3 asserts against it); the other five —
      `phases/wireSlots.test.ts:525`, `phases/startLoop.test.ts:~90`,
      `phases/initGpu.hdrCapabilityWiring.test.ts:448`,
      `wiring/installLoadProgress.test.ts:83`, `wiring/engineSliceDispatches.test.ts:393` and
      `:415` — never read `home`, so give them a minimal inline literal rather than an
      import that couples them to the app composition. `phases/bootstrap.test.ts:98`'s
      `makeDeps(): any` needs no edit.
- [ ] No phase reads `deps.home` yet — that is Task 3. This commit is threading only.
- [ ] `npm run typecheck` + `npm test` green. Commit.

**Reject if:** `EARTH_HOME` evaluates `isCinemaMode()`, `Date.now()` or a store read at
module scope; `home` is optional anywhere; or `src/data/` gained a `services/` import.

## Task 3 — `wireInput` seeds from the config

**Files:** `src/services/engine/phases/wireInput.ts`,
`tests/services/engine/phases/wireInput.test.ts`.

The phase keeps computing the boot INPUTS (they are engine facts) and hands them to the
recipe; the ORDER of the seed's two guards is unchanged, so `isCinemaMode` is still
consulted only when the intent guard passes.

```ts
// before (wireInput.ts:242-243)
if (!isCinemaMode()) store.dispatch(updateSelectionSelect(EARTH_REF));
store.dispatch(updateSelectionFocus(EARTH_REF));

// after
if (home.seedSelection()) store.dispatch(updateSelectionSelect(home.focus.ref));
store.dispatch(updateSelectionFocus(home.focus.ref));
```

- [ ] Replace `wireInput.ts:150-157` with the `home.pose({ simDays, frameBasis })` call.
      `unixMsToJulianDays(Date.now())` and `ORIENTATION_FRAMES[selectOrientation(...)]` stay
      here, with their two rationale comments (`:144-149`, `:152-155`) — both explain a
      choice about the INPUT, which is still this file's decision.
- [ ] Gate the seed block on `home.focus !== null`, inside or ahead of the existing
      `selectHasSelectionIntent` guard.
- [ ] Drop the now-dead imports (`computeInitialCamera`, `DEFAULT_FOV_Y_RAD`, `EARTH_REF`,
      `isCinemaMode`) and the comment material the config now carries: `:200-207`
      (home-is-boot-state + the tween landmine, now `HomeFocusTarget`'s doc) and `:236-241`
      (the cinema rationale, now `EARTH_HOME`'s). **Keep** `:209-233` — the deep-link
      deference argument is mechanism this file owns.
- [ ] Tests — adapt, don't duplicate: - keep `frames the boot camera at the canonical 60° FOV and the live sim instant`
      (the `computeInitialCamera` module mock still fires, through `EARTH_HOME`'s recipe;
      it now proves the boot inputs reach the recipe, which is the wire that can break). - keep `seeds the home selection: select + focus pinned to Earth at boot`. - keep both deep-link tests unchanged. - add `seeds focus but not select when the home config withholds the selection` —
      a config with `seedSelection: () => false`: focus is `EARTH_REF`, select is null.
      This is the cinema behaviour, untested today; a regression puts a selection ring
      in every recorded frame that opens at home. - add `dispatches no selection at all for a composition with no home target` —
      `focus: null`: both slots null after the phase.
- [ ] `npm run typecheck` + `npm test -- wireInput` green. Commit.

**Reject if:** the seed's two guards changed order or nesting semantics; the deep-link
comment block was trimmed; or `wireInput.ts` still names Earth.

## Task 4 — the three boot guards

Batched into one task, three commits: each is one boot phase dropping a hard requirement on
renderers a Layer will own, each is a handful of lines, and all three share one review
question ("does the phase still fail loudly on a real ordering bug?"). They are sequenced
after Task 3 because two of them touch files Task 3 edits.

**Files:** `src/services/engine/phases/wireInput.ts`,
`src/services/engine/phases/wireSlots.ts`,
`src/services/engine/wiring/wireImpostorSubsystems.ts`,
`src/services/engine/phases/startLoop.ts`, and the mirrors
`tests/services/engine/phases/{wireInput,wireSlots,startLoop}.test.ts`,
`tests/services/engine/wiring/wireImpostorSubsystems.test.ts`.

**4a — `wireInput`'s early return (spec §9(b) bullet 2).**

- [ ] Delete `wireInput.ts:66-69` (the `renderer` read and its guard) and the comment above
      it. Verified: `renderer` is referenced nowhere else in the file — re-check before
      deleting, and if a reference has appeared, guard that read alone, not the phase.
- [ ] Add `wires the camera and the input bindings when galaxyPointRenderer is null` to
      `wireInput.test.ts`: with `state.gpu.galaxyPointRenderer = null`, `state.cam` is
      non-null, `state.subsystems.inputBindings` is non-null, and `attachOrbitControls` was
      called. This is the test for the worst of the three failures — an engine with no
      input and no error.
- [ ] Commit.

**4b — `wireSlots`' disk-renderer precondition (bullet 1).** Per ruling 1 above.

```ts
export function wireImpostorSubsystems(
  state: EngineState,
  deps: BootstrapDeps,
  disks: {
    readonly texturedDiskRenderer: TexturedDiskRenderer;
    readonly proceduralDiskRenderer: ProceduralDiskRenderer;
  },
): void;
```

- [ ] Delete `wireSlots.ts:93-101` and call `wireImpostorSubsystems` only when both
      renderers narrow non-null at `wireSlots.ts:128`.
- [ ] Delete `wireImpostorSubsystems.ts:48-53`'s throw and the "Why the renderer
      null-checks live here" header section; the parameters carry it now.
- [ ] Delete `tests/.../wireImpostorSubsystems.test.ts`'s
      `throws when texturedDisk/proceduralDisk renderers are null` — it now asserts a
      compile-time fact. Update that file's `makeState`/call sites for the new argument.
- [ ] Add to `wireSlots.test.ts`: `boots without the disk renderers, skipping the impostor
wiring` — with both `state.gpu.*DiskRenderer` null the phase resolves, and
      `state.subsystems.texturedDisks` is still null. Fails the day someone reinstates a
      boot-wide requirement.
- [ ] Commit.

**4c — `startLoop`'s readiness subject (bullet 3).** Per ruling 2 above.

- [ ] Replace `startLoop.ts:88-97`'s four-renderer throw with a `deps.phaseLocals` presence
      check that throws a phase-ordering error, and consume the checked binding at `:76` so
      the `!` assertion goes with it. Rewrite the `:77-87` comment down to the invariant
      that survives (≤ 3 lines); it must not narrate the change.
- [ ] Rewrite the existing `throws a clear error when a required GPU renderer is null` test
      as the same claim against the new subject (`deps.phaseLocals` undefined ⇒ throws),
      and drop the renderer fields from `startLoop.test.ts`'s `makeState` if nothing else
      reads them.
- [ ] `npm run typecheck` + `npm test -- phases wiring` green. Commit.

**Reject if:** any of the three phases now fails silently on a reorder/skip of `initGpu`;
a deleted throw was replaced by an equivalent one further down; or `state.gpu` reads gained
`?.` chains to paper over absence.

## Task 5 — docs

**Files:** `CLAUDE.md` (the "Where to look" tree).

- [ ] Add one line for `src/compositions/` to the tree, beside `components/` — the folder
      is real from Task 2 and an undocumented top-level `src/` directory is worse than a
      line spec §15 will rewrite anyway when `src/layers/` joins it.
- [ ] Verified at plan time and expected to still hold — re-run and report:
      `rg -n "wireInput|wireSlots|startLoop|EARTH_REF|isCinemaMode" docs/RENDERER.md docs/DATA.md docs/DEPLOY.md docs/BACKLOG.md docs/superpowers/conventions .claude/skills`
      → **empty**. If it is not, fix only identifier text.
- [ ] Deliberately NOT touched: `docs/backlog/2026-07-30-boot-ordering-argument-nine-copies.md:29`
      and `docs/backlog/2026-08-16-windows-touchscreen-pinch-zoom.md:13` cite `wireInput.ts`
      line numbers that this PR moves. Both files say line numbers drift; chasing them turns
      a code PR into a docs edit (plan 01, Task 5). Neither backlog item is consumed here.
- [ ] `npx prettier --write` on the touched markdown. Commit.

**Reject if:** a `docs/research/**`, `docs/grill-sessions/**`, `plans/completed/**` or
`specs/completed/**` file was edited, or a backlog item was struck through rather than left
alone.

## Task 6 — gate

- [ ] `npm run typecheck` (both projects) — green.
- [ ] `npm test` — green. Expected delta: **+4 tests** (1 in Task 1, 2 in Task 3, 2 in
      Task 4, minus 1 deleted in 4b, and `startLoop`'s guard test is rewritten in place).
      Report the actual delta with the reason for any difference.
- [ ] `npm run build` — green.
- [ ] Visual smoke, on this worktree's dev server: - the main app boots at Earth, globe framed as before, with the Earth InfoCard
      pinned and the selection ring around it; - the same URL with `?cinema` boots at Earth, the globe stays framed as the sim clock
      advances (focus is seeded), and there is **no** selection ring and no InfoCard; - a `#focus=body-jupiter` deep link still wins over the home seed.
- [ ] `git diff main --stat` — the diff should be net-negative in `src/services/engine/phases/`
      and add nothing outside the six new files, the four phase/wiring files, `engine.ts`,
      `useEngine.ts`, `earthRef.ts`, `bodyMovesThisFrame.ts` and the test mirrors.
- [ ] Skipped on purpose, state it in the PR body: `npm run perf` — no pass, shader or
      per-frame statement changes.

---

## Task 7 — home as data (amendment, 2026-09-10)

**Ruling (user, at /feature-done):** `EngineHomeConfig` exposes no functions. Tasks 1–3
lifted the Earth pose _recipe_ into the config; the recipe is keyed on nothing but the
focus body, and both inputs it deferred (boot instant + orientation basis; the cinema URL
read) are engine facts the phase computes anyway. The config names WHAT; the phase owns HOW.

**Files:** `src/@types/engine/EngineHomeConfig.d.ts`, `src/compositions/earthHome.ts` →
`src/data/selection/earthHome.ts` (move; `src/compositions/` is deleted — it arrives with
(c)'s `app.ts`, the first file that needs it), `CLAUDE.md` (drop the Task 5 line),
`src/services/engine/camera/earthHomePose.ts` → `bodyHomePose.ts` (rename via
`npm run refactor -- rename`), `src/services/engine/camera/cameraFraming.ts`,
`src/services/engine/phases/wireInput.ts`, `src/state/selection/watchGoHomeSaga.ts`;
mirrors `tests/services/engine/camera/{earthHomePose→bodyHomePose,cameraFraming}.test.ts`,
`tests/services/engine/phases/wireInput.test.ts`, `tests/state/selection/watchGoHomeSaga.test.ts`.

**Contract:**

```ts
// src/@types/engine/EngineHomeConfig.d.ts — pure data
export type EngineHomeConfig = {
  /** The home target: framed by the boot pose AND seeded into the focus slot. `null` = no home. */
  readonly focus: HomeFocusTarget | null;
  /** Whether the home target is also seeded into the SELECT slot (ring + InfoCard). */
  readonly seedSelection: boolean;
};

// src/data/selection/earthHome.ts — pure data, no services/ import, so src/data/ is its home
export const EARTH_HOME: EngineHomeConfig = {
  focus: followedBodyHome(EARTH_REF),
  seedSelection: true,
};

// src/services/engine/camera/bodyHomePose.ts — earthHomePose generalised; Earth was
// hard-coded twice (`deriveBodyStates(simDays).get('earth')`, `SCENE_EARTH.radiusM`).
// Radius comes from the SCENE_BODIES row; throws if `bodyId` is in neither table.
export function bodyHomePose(
  bodyId: string,
  simDays: number,
  fovYRad: number,
  frameBasis?: Mat3,
): CameraPose;

// src/services/engine/camera/cameraFraming.ts
export function computeInitialCamera(args: {
  bodyId: string | null; // null ⇒ the engine's neutral pose
  fovYRad: number;
  simDays: number;
  frameBasis?: Mat3;
}): InitialCam;
```

- The neutral pose (`bodyId: null`): target `[0, 0, 0]`, distance `INITIAL_DISTANCE_MPC`,
  yaw/pitch = `orbitAnglesLookingAlong(GALACTIC_DISC_FORWARD, frameBasis)`. It is the
  engine's, not a composition's; (c) may promote it to data when the reference engine
  wants to choose. It lives in `cameraFraming.ts` beside the constants it reads.
- `wireInput` computes the pose from `home.focus` (`bodyId: home.focus === null ? null :
home.focus.ref.id`) with `DEFAULT_FOV_Y_RAD`, and gates the select seed on
  `home.seedSelection && !isCinemaMode()`. The cinema rationale (≤ 3 lines) returns to the
  phase: cinema is an app mode gating what the composition asked for, same class as the
  deep-link deference guard. The seed's guard order/nesting is otherwise unchanged.
- `watchGoHomeSaga` calls `bodyHomePose('earth', …)` — the Home-pill half keeps its own
  Earth hard-coding (out of scope, unchanged).

- [ ] Rename `earthHomePose` → `bodyHomePose` (file + mirror + references) as its own
      mechanical commit; then the content edit: `bodyId` parameter, radius from
      `SCENE_BODIES`, position from `deriveBodyStates(simDays).get(bodyId)`. Header: change
      "Earth" to "the body" only where the sentence is about the mechanism; do not rewrite
      the header otherwise.
- [ ] `computeInitialCamera` gains `bodyId: string | null`; neutral branch as above.
- [ ] `EngineHomeConfig` loses `pose`; `seedSelection` becomes `boolean`; drop the
      `Mat3`/`InitialCam` imports. `earthHome.ts` becomes the data literal; header ≤ 3 lines;
      move it to `src/data/selection/` via `npm run refactor -- move` and remove the empty
      `src/compositions/` + the CLAUDE.md tree line.
- [ ] `wireInput.ts` as above; re-import `computeInitialCamera`, `DEFAULT_FOV_Y_RAD`,
      `isCinemaMode`.
- [ ] Tests — adapt: `frames the boot camera …` asserts `bodyId: 'earth'` in the spy call;
      `seeds focus but not select …` uses `seedSelection: false`; `dispatches no selection …`
      also asserts the spy was called with `bodyId: null`. `cameraFraming.test.ts` passes
      `bodyId: 'earth'` and adds `boots to the neutral Local-Group pose when there is no home
  body` (`bodyId: null` ⇒ target origin, distance `INITIAL_DISTANCE_MPC`, yaw/pitch equal
      `orbitAnglesLookingAlong(GALACTIC_DISC_FORWARD, basis)`). `bodyHomePose.test.ts` adds
      `frames the requested body, not Earth` (`'mars'` at the same instant ⇒ target ≠ the
      Earth pose's target and equals `bodyLikeFraming(marsPos, marsRadius, fov).target`).
      Every fixture stub `home` literal drops `pose` and uses `seedSelection: false`.
- [ ] `npm run typecheck` + `npm test` green. Commit (rename commit + content commit).

**Reject if:** `EngineHomeConfig` has a function-typed field; `earthHome.ts` imports
`services/`; `src/compositions/` still exists; the seed's guard order changed; the neutral pose lives anywhere but
`cameraFraming.ts`; `watchGoHomeSaga` gained or lost behaviour.

## Definition of Done

**Deliverable inventory**

- [ ] `src/@types/engine/EngineHomeConfig.d.ts` and `HomeFocusTarget.d.ts` exist, one type
      each, **data only — no function-typed field** (Task 7); `createEngine` and
      `BootstrapDeps` both require a `home: EngineHomeConfig`.
- [ ] `src/compositions/earthHome.ts` exports `EARTH_HOME`, and it is the ONLY place the
      app's home pose recipe, home target and cinema branch are named.
- [ ] `rg -n "EARTH_REF|isCinemaMode|computeInitialCamera" src/services/engine/phases` → empty.
- [ ] `followedBodyHome` is the only producer of a `HomeFocusTarget`, and
      `bodyFollowsSimClock` is the only expression of `ORBITAL_ELEMENTS` membership.
- [ ] No boot phase throws on, or returns early for, a named renderer:
      `rg -n "Renderer === null" src/services/engine/phases` → empty.

**Named observable behaviours** (the Task 6 smoke pass)

- [ ] Main app: boots at Earth, InfoCard pinned, selection ring present, no camera jump on
      the first follow frame.
- [ ] `?cinema`: boots at Earth, focus follows the live globe, no ring, no InfoCard.
- [ ] `#focus=body-jupiter`: the deep link wins; the home seed does not clobber it.

**The deferral boundary** — nothing else. No `EngineComposition`, no `layers`, no `tier` or
`dataUrl` field, no Layer formed, no renderer moved, no reference engine.

## Out of scope (deferred)

- **(c), the contract PR** — mints `EngineComposition<Layers>` and folds `EARTH_HOME` into
  its `home` field (a one-call-site change at `useEngine.ts`), adds `tier` + `dataUrl`,
  authors `FRAME_ORDER`, and narrows the pass signatures to `CoreFrameState`. It also
  re-homes `startLoop`'s readiness invariant onto "every present Layer's `create` returned".
- **(d), the `galaxyCatalog` Layer** — takes the disk-renderer precondition into the
  Layer's `create`, where the renderers are allocated by the same expression that needs
  them (spec §9(b) bullet 1's final home).
- **`isEngineReady` (`src/services/engine/helpers/engineReady.ts:118-140`)** — the OTHER
  boot-finished proxy, and the one a renderer-free composition still trips: it requires
  `galaxyPointRenderer`, `galaxyPickRenderer` and `texturedDisks` before any frame is
  produced (`frameContext.ts:165`). Untouched here — it is a per-frame gate, and its
  narrowing is part of (c)'s `CoreFrameState` work.
- **The Home-pill half of the Earth home** — `watchGoHomeSaga.ts:78-83` (`EARTH_REF` +
  `earthHomePose`) and `hashParamSources.ts:147-152` (Earth as the omitted `focus` param)
  keep their own hard-codings. Spec §9(b) scopes this PR to the boot phase; the store/saga
  half has not been specified.
