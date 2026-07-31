# Orientation frame switch — Prep 1: camera-math consolidation

**REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development` — execute this
plan one task at a time, fresh subagent per task, spec + quality review between.

> **Spec.** `docs/superpowers/specs/2026-07-22-orientation-frame-switch.md` — this
> plan is **§9 Ground preparation / Prep 1** in full, and nothing else. Prep 2
> (the `ORIENTATION_FRAMES` registry) and the feature are separate PRs.
> **Plan style.** `docs/superpowers/conventions/plan-style.md` (contract code
> only; cite `file:line`, don't paste). **Testing.** `docs/superpowers/conventions/testing.md`.

## Goal

Extract the two shared camera-math seams the orientation feature will make
frame-aware, as **pure refactors at the current Y-up behavior**. The feature PR
(not this one) gives each seam a frame-basis input (spec §3.4); this prep only
un-braids the duplication so that change lands in one place instead of ~nine.

Two seams:

1. **`yawPitchToDir(yaw, pitch)`** — the local-frame Y-up spherical decode,
   currently copied at four sites.
2. **`imagePlaneBasis(forward, roll, upRef)`** — the roll-aware up + right/up
   screen basis, currently split between two verbatim Rodrigues blocks and four
   open-coded `WORLD_UP`-cross basis derivations.

## Architecture

### Seam 1 — `yawPitchToDir`

The unit direction from target toward eye: `dir = [cos(p)·sin(y), sin(p), cos(p)·cos(y)]`.
Copied verbatim at `updatePosition.ts:50`, `buildPathTrack.ts:237-242` (the
`liveEye` decode) and `:599-601` (the per-sample `dir`), and
`sampleClipPath.ts:31-38` (`eyeOf`). The inverse already exists as a shared
function — `orbitAnglesLookingAlong.ts` — which is what makes the round-trip test
below load-bearing rather than a mirror.

### Seam 2 — `imagePlaneBasis`

The single home for the camera's roll-adjusted up and its screen right/up basis.
Today three distinct copies exist:

- **Rodrigues rolled-up block** (`upRef` rotated about `forward` by `roll`):
  verbatim in `computeViewProj.ts:85-109` and `cameraBillboardBasis.ts:70-89`.
  `cameraBillboardBasis`'s header (`:15-27`) documents the duplication as
  *intentional* — Task 4 reverses that call.
- **`WORLD_UP`-cross basis** (`right = normalize(forward × upRef)`,
  `up = right × forward`): open-coded in `orbitControls.ts:398-406` (pan),
  `slabs.ts:95`+`:136` (fed as `up` to `computeForegroundViewProj`),
  `buildPathTrack.ts:149`+`:173-197` (`passByDirVec`), and
  `horizonShellRenderer.ts:75`+`:154-158`.
- **Baked XZ-horizontal simplification** `[-fz, 0, fx]` in
  `resolveClipFoci.ts:152-168` (`strafeId`) — algebraically exactly
  `normalize(forward × [0,1,0])`, i.e. `imagePlaneBasis(...).right` at roll 0.

**Contract — three outputs, one call.** The lookAt consumers
(`computeViewProj`, `slabs`) need the **raw rolled up** (lookAt re-orthonormalizes
internally, so this stays byte-identical to today); the billboard/pan/horizon
consumers need the **orthonormal right/up**. A single helper returns all three so
the consolidation is complete and no consumer takes a byte change:

```ts
// src/@types/camera/ImagePlaneBasis.d.ts  (one type per file)
export type ImagePlaneBasis = {
  readonly rolledUp: Vec3; // upRef rotated about forward by roll (raw; roll=0 ⇒ upRef exactly)
  readonly right: Vec3;    // normalize(forward × rolledUp)   — ||1-guarded
  readonly up: Vec3;       // normalize(right × forward)      — orthonormal image-plane up
};

// src/utils/camera/imagePlaneBasis.ts
export function imagePlaneBasis(
  forward: Readonly<Vec3>,
  roll: number,
  upRef: Readonly<Vec3>,
  out?: ImagePlaneBasis, // caller-owned scratch; hot per-frame callers pass a module singleton
): ImagePlaneBasis;
```

Per-consumer wiring (this is what keeps the budget at zero):

| Consumer | `roll` arg | consumes | byte-effect today |
| -------- | ---------- | -------- | ----------------- |
| `computeViewProj` | `cam.roll ?? 0` | `.rolledUp` → lookAt | identical (roll=0 ⇒ `[0,1,0]`) |
| `slabs` (near vp) | `0` (never consulted roll) | `.rolledUp` → `up` param | identical (`[0,1,0]`) |
| `cameraBillboardBasis` | `cam.roll ?? 0` | `{ right, up }` | identical |
| `orbitControls` pan | `0` | `{ right, up }` | identical |
| `buildPathTrack` `passByDirVec` | `0` | `.up` (above), `.right` (screenSide) | identical |
| `resolveClipFoci` `strafeId` | `0` | `.right` | identical |
| `horizonShellRenderer` | `cam.roll ?? 0` | `{ right, up }` | **roll now applied — the one surfaced fix** |

`horizonShell` and `slabs` both carry a "roll parity deferred" comment
(`horizonShellRenderer.ts:152-153`, `slabs.ts:92-94`). Passing `cam.roll` at the
`horizonShell` site closes its gap (deliberate — Task 6); `slabs` stays roll-deferred
by passing literal `0`, so its byte-exact wiring test needs no edit and the feature
PR is the one that makes it frame-aware.

**Degenerate policy stays at the call site.** When `forward ∥ upRef` the cross is
~zero; `imagePlaneBasis` returns the `||1`-guarded (finite, near-zero) vector,
matching `cameraBillboardBasis`'s current guard. Callers keep their own
pole-bearing fallback: `buildPathTrack`'s `isZero3 → [1,0,0]`, `resolveClipFoci`'s
vertical-bearing throw. The helper does **not** own that policy (it diverges by
caller).

**Allocation.** Both helpers accept a caller-owned `out`. `updatePosition`,
`computeViewProj`, `slabs`, `orbitControls` pan, and `horizonShell` run per frame
and pass a module-scope singleton (zero per-call allocation, matching or beating
today). `cameraBillboardBasis` / the animation builders allocate a fresh result
as they do today.

## Tech stack

TypeScript, `wgpu-matrix` (`vec3`, project `Vec3` alias `src/@types/math/Vec3`),
Vitest. No WGSL, no `.bin`, no GPU-uniform-layout change. No React.

## Global constraints

- **Suite stays green:** `npm test` (single pass) after every task.
- **Typecheck both configs:** `npm run typecheck` (src + tools) after every task.
- **Format only touched files:** `npx prettier --write <the files you changed>` —
  never repo-wide.
- **Stage specific paths:** `git add <path> …`. Never `git add -A` / `git add .`.
- **Commit trailer:** each commit ends with a `Co-Authored-By: Claude <noreply@anthropic.com>`
  trailer (repo history writes it as `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`;
  the harness fills the model name). Author is the user's own git identity —
  never `--author`.
- **House file rules:** one function per `src/utils/**` file, one type per
  `src/@types/**` file; `export type`, never `interface`; deep relative imports,
  no barrels; `Vec3`/`Vec4` aliases, never raw tuples in signatures.
- **No file moves** in this prep — all changes are new files + in-place edits. (If
  that changes, a move goes through `npm run refactor -- move <from> <to>`, never
  `git mv`, then grep for `.wesl` `package::` / string-literal path references.)
- **Draft PR at the first task** (`--base main`; subagent-driven-development
  convention). Ask the user whether the docs (this plan) ride the feature-prep PR
  or land separately before opening it.
- **New tests only where they catch a real bug** no other test or `tsc` check does
  (`testing.md`): the round-trip and orthonormality invariants earn their place; a
  test restating the extracted formula does not.

---

## Task 1 — Extract `yawPitchToDir`

**Files:** `src/utils/camera/yawPitchToDir.ts` (new),
`tests/utils/camera/yawPitchToDir.test.ts` (new).

**Signature:** `yawPitchToDir(yaw: number, pitch: number, out?: Vec3): Vec3`
returning the unit direction `[cos(p)·sin(y), sin(p), cos(p)·cos(y)]` (target → eye).

- [x] Test `yawPitchToDir(0, 0) is +Z` — hand value `[0, 0, 1]`.
- [x] Test `yawPitchToDir(π/2, 0) is +X` — hand value `[1, 0, 0]`.
- [x] Test `yawPitchToDir(0, π/2) is +Y` — hand value `[0, 1, 0]`.
- [x] Test `yawPitchToDir round-trips through orbitAnglesLookingAlong` — for an
      oblique bearing (e.g. yaw 0.6, pitch 0.35), `dir = yawPitchToDir(y, p)`, then
      `orbitAnglesLookingAlong([-dir0, -dir1, -dir2])` returns `{ yaw: y, pitch: p }`
      (independent inverse: `atan2`/`asin` vs `sin`/`cos`, not a mirror).
- [x] Implement, carrying the didactic module-header style from
      `updatePosition.ts:20-39`. Write into `out` when provided.
- [x] `npm test -- yawPitchToDir` green; `npm run typecheck`; format; commit.

## Task 2 — Reroute the four decode sites onto `yawPitchToDir`

**Files (modify):** `src/utils/camera/updatePosition.ts`,
`src/services/engine/animation/buildPathTrack.ts`,
`src/services/engine/animation/sampleClipPath.ts`.

No new tests — this is behavior-preserving; the guards are the existing
`orbitAnglesLookingAlong.test.ts`, `orbitCamera.test.ts`,
`sampleClipPath.test.ts` (`:37`,`:51`), and `flyPathDemo.test.ts`.

- [x] `updatePosition.ts:50` — replace the inline `vec3.fromValues(...)` with
      `yawPitchToDir(cam.yaw, cam.pitch, <module scratch>)`, then the existing
      `vec3.addScaled` into `cam.position`. Keep the per-frame path allocation-free
      (module-scope scratch `Vec3`).
- [x] `buildPathTrack.ts:237-242` (`liveEye`) — build `dir` via `yawPitchToDir`,
      then `eye = target + distance·dir`.
- [x] `buildPathTrack.ts:599-601` — replace the inline `dir` with `yawPitchToDir`.
- [x] `sampleClipPath.ts:31-38` (`eyeOf`) — build `dir` via `yawPitchToDir`, then
      `eye = target + distance·dir`; delete the now-dead local `eyeOf` if fully
      subsumed.
- [x] `npm test` green (whole suite); `npm run typecheck`; format touched files; commit.

## Task 3 — Extract `imagePlaneBasis`

**Files:** `src/@types/camera/ImagePlaneBasis.d.ts` (new),
`src/utils/camera/imagePlaneBasis.ts` (new),
`tests/utils/camera/imagePlaneBasis.test.ts` (new).

**Contract:** the `ImagePlaneBasis` type + `imagePlaneBasis(forward, roll, upRef, out?)`
signature from the Architecture section. `rolledUp` = raw Rodrigues result;
`right = normalize(forward × rolledUp)` (`||1`-guarded); `up = normalize(right × forward)`.

- [x] Test `roll=0 leaves rolledUp equal to upRef` — for an oblique `forward`,
      `rolledUp` is exactly `upRef` (pins the byte-identity contract the reroutes
      rely on).
- [x] Test `identity forward gives world-aligned axes` — `forward=[0,0,-1]`,
      `roll=0`, `upRef=[0,1,0]` → `right≈[1,0,0]`, `up≈[0,1,0]` (hand values).
- [x] Test `axes are orthonormal for an oblique forward + roll` — pick oblique
      `forward` and `roll≈0.9`; assert `right`,`up` unit-length and
      `right·up ≈ right·forward ≈ up·forward ≈ 0` (independent property, not a
      formula restatement).
- [x] Test `roll rotates the basis about forward` — `forward=[0,0,-1]`,
      `upRef=[0,1,0]`, `roll=π/2` → `right≈[0,1,0]`, `up≈[-1,0,0]` (hand values).
- [x] Test `forward parallel to upRef yields a finite (non-NaN) basis` — the
      pole-aligned degenerate; assert every component is `Number.isFinite`.
- [x] Implement with a didactic header explaining it is the single home for the
      roll math (point at the two blocks it replaces). Write into `out` when given.
- [x] `npm test -- imagePlaneBasis` green; `npm run typecheck`; format; commit.

## Task 4 — Reroute the two Rodrigues consumers

**Files (modify):** `src/utils/camera/computeViewProj.ts`,
`src/utils/camera/cameraBillboardBasis.ts`.

Guards: `orbitCamera.test.ts` (`roll=0` and `roll=π/2` cases, tolerant) and
`cameraBillboardBasis.test.ts` (identity / orthonormal / roll cases). No new tests.

- [x] `computeViewProj.ts:85-122` — compute `forward = normalize(target − position)`,
      call `imagePlaneBasis(forward, cam.roll ?? 0, [0,1,0], <module scratch>)`, pass
      `.rolledUp` to `mat4.lookAt` as `up`. Delete the inline Rodrigues block. Keep
      the pitch-clamp caveat comment. Verify byte-identity intent: at `roll=0`,
      `rolledUp` is exactly `[0,1,0]` (the test suite is the check — do not claim it
      visually).
- [x] `cameraBillboardBasis.ts:65-112` — replace the Rodrigues block **and** the two
      cross derivations with one `imagePlaneBasis(forward, cam.roll ?? 0, [0,1,0])`
      call; return `{ right: basis.right, up: basis.up }`.
- [x] Rewrite `cameraBillboardBasis.ts:15-27` (the "why this mirrors computeViewProj
      instead of importing" header) to state the math is now shared via
      `imagePlaneBasis`; drop the "copied verbatim, check both" note.
- [x] `npm test` green (whole suite — `orbitCamera`, `cameraBillboardBasis`,
      `renderFrame*`); `npm run typecheck`; format; commit.

## Task 5 — Reroute the pure-refactor cross consumers

**Files (modify):** `src/services/camera/orbitControls.ts`,
`src/services/engine/frame/slabs.ts`,
`src/services/engine/animation/buildPathTrack.ts`,
`src/services/engine/animation/resolveClipFoci.ts`.

All pass `roll: 0` (none consult roll today) so every output is byte-identical.
Guards: `slabs.test.ts` (byte-exact near-vp), `resolveClipFoci.test.ts` (strafe +
its vertical-bearing throw), `buildClipPathLines`/`flyPathDemo`, and pan is
exercised via the existing controls integration. No new tests.

- [x] `orbitControls.ts:398-406` (pan) — replace the `forward/right/up` cross with
      `imagePlaneBasis(forward, 0, WORLD_UP, <module scratch>)`; feed `.right`/`.up`
      into the existing `panDeltaScratch` math. Keep `forwardScratch` for the
      `subtract`+`normalize`; drop `rightScratch`/`upScratch` if the scratch result
      subsumes them. Remove the now-unused local `WORLD_UP` if nothing else reads it.
- [x] `slabs.ts:95`,`:133-143` — compute `forward` from `cam`, call
      `imagePlaneBasis(forward, 0, WORLD_UP, <module scratch>)`, pass `.rolledUp` as
      the `up` argument to `computeForegroundViewProj`. `.rolledUp` is exactly
      `[0,1,0]` at roll 0, so `slabs.test.ts:76-100`'s byte-exact `toEqual` stays
      green **unedited** — confirm this rather than editing the test. Update the
      `:92-94` "roll parity deferred" comment to note the seam is now the shared
      helper (still roll-deferred here: the `0` is intentional; the feature PR swaps
      `WORLD_UP → frameUp`).
- [x] `buildPathTrack.ts:173-197` (`passByDirVec`) — express `above` as the `.up`
      and `screenSide` as the `.right` of `imagePlaneBasis(tangent, 0, WORLD_UP)`;
      keep the `isZero3 → [1,0,0]` fallbacks and the `outsideBend` accel path
      unchanged. Remove the local `WORLD_UP` at `:149` only if `passByDirVec` was its
      sole reader.
- [x] `resolveClipFoci.ts:152-168` (`strafeId`) — replace the baked `[-fz, 0, fx]`
      with `imagePlaneBasis(forward, 0, [0,1,0]).right` (forward = `target − from.target`,
      full 3D — `.right` has a zero y-component so `displaced.y` stays `from.target[1]`,
      identical to today). Keep the `hypot(fz, fx) < 1e-12` vertical-bearing throw and
      update the comment that describes the `[-fz,0,fx]` simplification.
- [x] `npm test` green (whole suite); `npm run typecheck`; format touched files; commit.

## Task 6 — Reroute `horizonShellRenderer` (the surfaced roll fix) + visual gate

**Files (modify):** `src/services/gpu/renderers/horizonShell/horizonShellRenderer.ts`.

This is the **one deliberate behavior change** in Prep 1: the shell today hardcodes
`WORLD_UP` and ignores `cam.roll` (`:152-153`), silently diverging from
`computeViewProj` under roll. Rerouting with `roll = cam.roll ?? 0` makes it
roll-correct.

- [x] `horizonShellRenderer.ts:75`,`:154-158` (inside `draw`) — replace the
      `WORLD_UP`-cross `fwd/right/up` derivation with
      `imagePlaneBasis(fwd, cam.roll ?? 0, WORLD_UP, <the pre-allocated scratch basis>)`;
      write `.right`/`.up` into the uniform floats as before. Preserve the
      once-allocated per-frame scratch (no new per-frame allocation). Compute `fwd`
      into the existing scratch first.
- [x] Rewrite the `:150-153` "Roll is not applied" comment to state the shell now
      derives its basis through the shared `imagePlaneBasis` and rolls in lockstep
      with `computeViewProj`.
- [x] Remove the local `WORLD_UP` at `:75` if nothing else in the file reads it.
- [x] `npm test` green (`horizonShellRenderer.test.ts`, `horizonShellFadeAlpha`,
      `renderFrame*`); `npm run typecheck`; format; commit.
- [x] **VISUAL GATE — ask the USER (do not self-verify).** The dev server is
      running. Because no shipping code path sets `cam.roll ≠ 0` yet, ask the user to
      confirm two things:
      1. **No regression at rest:** the faint cosmic-horizon rim renders exactly as
         before at the default orientation (roll 0).
      2. **Roll correctness (optional):** if the user wants to confirm the fix
         itself, they (or the implementer, under the user's direction) can
         temporarily set a nonzero `cam.roll` in a scratch build and confirm the
         horizon rim now rolls together with the star field instead of staying
         level. State plainly that this second check requires a throwaway local edit
         since roll is dormant in the shipped UI; it is confirmation-only, reverted
         before commit.
      Wait for the user's confirmation before proceeding.

## Task 7 — Entanglement-radar review over the whole diff

**Files:** none (review only) — house convention (bake the radar into every plan).

- [x] Run the `entanglement-radar` skill over the full Prep 1 diff. Focus points:
      that `imagePlaneBasis`'s three outputs are a genuine single concern (the
      camera image-plane basis) and not two braided ones; that the per-caller `roll`
      argument (`cam.roll` vs `0`) reads as intent, not an accidental asymmetry; that
      the degenerate-fallback policy correctly stayed at the call sites; that no
      consumer took a byte change except `horizonShell`-under-roll.
- [x] Record findings; fold any trivial fixes in (green suite), or capture a
      backlog note if larger. Commit if anything changed.
