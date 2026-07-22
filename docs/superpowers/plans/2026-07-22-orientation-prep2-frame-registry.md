# Orientation Prep 2 — orientation frame registry

REQUIRED SUB-SKILL: superpowers:subagent-driven-development

> One of the two prep PRs for the switchable-orientation-frame feature
> (`docs/superpowers/specs/2026-07-22-orientation-frame-switch.md`). Lands **after**
> Prep 1 (camera-math consolidation) and **before** the feature PR. Prep 2 is a
> pure structural change: it creates the single home for the four orientation
> bases and relocates the galactic literals into it. No behaviour changes — the
> Milky Way still renders identically; nothing yet reads the new registry.

## Goal

Stand up `ORIENTATION_FRAMES` — the `Record<OrientationFrameId, Mat3>` the feature
PR will slerp between — assembled entirely from sources that already exist in the
repo (`ECLIPTIC_FRAME`, the galactic `GAL_*_EQ` literals, `SG_TO_EQ_MATRIX`), plus
the `OrientationFrameId` union and the per-frame quaternions the slerp consumes.
Move the galactic basis literals out of `milkyWayModelMatrix.ts` into that home so
there is one TS source, and repoint the existing WESL↔TS parity test onto the
registry.

See spec §3.1 (the registry contract) and §9 "Prep 2" for the ratified shape.

## Architecture

Each `ORIENTATION_FRAMES` entry is a flat column-major `Mat3` mapping
**frame-local → world (equatorial J2000)**, arranged so the **middle column
(local +Y) is that frame's north pole** and the other two columns are the plane's
in-plane axes. That convention is deliberate: the orbit camera's spherical formula
puts its pole on local +Y, so a basis that swizzles local +Y onto the physical
pole is exactly what reorients the camera (the same swizzle `milkyWayModelMatrix`
already uses to drop the disk, local +y = disk normal = NGP).

The four bases, from existing sources only (no new astronomical constants):

| Frame | Pole (middle column) | Source | Notes |
| ----- | -------------------- | ------ | ----- |
| `equatorial` | world +z (celestial north) | swizzle `[+x, +z, −y]` | **not** identity — identity is the deleted accidental Y-up pole. `+x × +z = −y` keeps it right-handed. |
| `ecliptic` | `ECLIPTIC_FRAME.normal` | `orbitPlaneFrames.ts:81-85`, ε = `OBLIQUITY_DEG` 23.44° (`:72`) | side columns from `ECLIPTIC_FRAME.xAxis` / `.yAxis`. |
| `galactic` | `GAL_Z_EQ` (NGP) | the moved literals (this plan) | side columns `GAL_X_EQ` / `GAL_Y_EQ`, arranged right-handed. |
| `supergalactic` | `SG_TO_EQ_MATRIX` column 2 (SGZ) | `superGalacticTransform.ts:86` | side columns SGX (col 0) / SGY (col 1), re-swizzled to put the pole in the middle. |

`SG_TO_EQ_MATRIX`'s columns are the equatorial images of SGX/SGY/SGZ, so its
**column 2 is the supergalactic north pole** — the registry re-swizzles those
three columns so that pole lands in the middle while the basis stays right-handed
(det +1). The in-plane axis choice only fixes each frame's yaw origin (a free
choice), so any right-handed in-plane pair is correct; the pole column is what
carries the visible reorientation. That freedom is exactly why the registry
entries are **hand-assembled swizzles that can be transcribed wrong** — hence the
orthonormality / det=+1 / independent-pole-derivation tests below are load-bearing
drift tests, not constant restatements.

Per-frame quaternions derive once from the matrices via the existing
`matrixToQuaternion` (`src/utils/math/matrixToQuaternion.ts`, already used by
`superGalacticTransform.ts:89`). The feature PR consumes them as the slerp
endpoints; Prep 2 only pins their export shape.

**Files touched**

- `src/@types/camera/OrientationFrameId.d.ts` — new (one type per file).
- `src/data/orientation/orientationFrames.ts` — new. Home of the moved galactic
  literals, `ORIENTATION_FRAMES`, and `ORIENTATION_FRAME_QUATERNIONS`.
- `src/services/gpu/galaxy/milkyWayModelMatrix.ts` — drops its local `GAL_*_EQ`
  definitions (`:62-64`), imports them from the new home. Symbol move within
  files (hand-edit, not `npm run refactor -- move`); keep the didactic header
  coherent.
- `tests/data/orientation/orientationFrames.test.ts` — new.
- `tests/services/gpu/galaxy/milkyWayModelMatrix.test.ts` — repoint the WESL
  parity assertions (`:54-73`) onto the registry.

**Explicitly unchanged**

- `src/services/gpu/shaders/lib/util.wesl:173-175` — the WESL `GAL_*_EQ` literals
  **stay** (the GPU procedural-galaxy shader samples them). They remain the parity
  anchor; the test just points its TS comparand at the registry now.
- `OrbitPlaneFrame`'s `{ xAxis, yAxis, normal }` dual representation — not
  un-braided; the registry converts on ingest (spec §9 "Adjacent findings").

## Tech Stack

TypeScript, Vitest. Pure data + math; no React, no WGSL edits, no GPU. Math
helpers already in the repo: `mat3FromColumns`, `eqRaDecToUnitCart`,
`matrixToQuaternion`, `planeFrameFromPole`.

## Global Constraints

- **Suite green:** `npm test` passes at every commit; `npm run typecheck` clean.
- **House rules:** `type` aliases never `interface`; **one symbol per file** in
  `src/@types/` and `src/utils/`; didactic module headers that explain *why* and
  the alternative (comments timeless — no "moved from" / history notes).
- **Format only touched files** (`npx prettier --write <paths>`); never repo-wide.
- **Stage specific paths** — never `git add -A` / `git add .`.
- **Commit trailer** (repo's exact form, `git log -3 --format='%b'`):

  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

  Use the user's git identity; never `--author`.
- One commit per task (or per coherent pair); branch + PR, never direct-push
  `main`. Draft the PR when the first task lands.

---

## Task 1: `OrientationFrameId` type

**Files:** `src/@types/camera/OrientationFrameId.d.ts` (new).

House rule: **one type per file** in `src/@types/`. `src/@types/camera/` already
exists (`OrbitCamera.d.ts`, `CameraPose.d.ts`, …).

**Contract:**

```ts
export type OrientationFrameId = 'equatorial' | 'ecliptic' | 'galactic' | 'supergalactic';
```

- [x] Create the file with the union and a short didactic header: what an
      orientation frame *is* (a "that frame's north pole is up" choice), and that
      the four ids key `ORIENTATION_FRAMES` (§3.1). Timeless, terse.
- [x] `npm run typecheck` clean.
- [x] Commit.

No test: a runtime test of a string-union declaration is a compile-time fact
restated at runtime (`testing.md` — "No runtime tests of type declarations").

---

## Task 2: Move the galactic basis literals into the registry home

**Files:** `src/data/orientation/orientationFrames.ts` (new),
`src/services/gpu/galaxy/milkyWayModelMatrix.ts` (modify).

Pure refactor — a symbol move within files. `milkyWayModelMatrix.ts:62-64` defines
`GAL_X_EQ` / `GAL_Y_EQ` / `GAL_Z_EQ` as module-local `Vec3` consts; they become the
first exports of the new registry home, and `milkyWayModelMatrix` imports them.
This is *not* a file move, so no `npm run refactor -- move` — hand-edit both files.

**Contract (new file, this task's slice):**

```ts
// src/data/orientation/orientationFrames.ts
export const GAL_X_EQ: Vec3; // toward Galactic Centre
export const GAL_Y_EQ: Vec3; // direction of galactic rotation
export const GAL_Z_EQ: Vec3; // toward North Galactic Pole (NGP)
```

Values are the exact literals currently at `milkyWayModelMatrix.ts:62-64` (the
mirror of `util.wesl:173-175`). `src/data/orientation/` does not exist yet — create
it (sibling of `src/data/bodies/`, `src/data/milkyWay/`).

- [x] Create `orientationFrames.ts` with a didactic module header framing it as
      the single TS home of the four orientation bases (§3.1) and the galactic
      literals' one source (kept equal to `util.wesl` by the parity test). Export
      the three `GAL_*_EQ` consts.
- [x] In `milkyWayModelMatrix.ts`: delete the local `GAL_*_EQ` definitions
      (`:62-64`), import them from `../../../data/orientation/orientationFrames`.
      Update its module header where it describes those literals so the prose still
      matches (they now live in the registry home; keep it timeless — no "moved
      from" note). The existing per-comment column mapping in `milkyWayModelMatrix`
      (`:76-83`) stays.
- [x] The existing `tests/services/gpu/galaxy/milkyWayModelMatrix.test.ts` still
      passes unchanged — it scrapes `util.wesl` and compares against
      `milkyWayModelMatrix()` output, both still correct. This is the regression
      guard for the move.
- [x] `npm test -- milkyWayModelMatrix` green; `npm run typecheck` clean.
- [x] Commit.

---

## Task 3: `ORIENTATION_FRAMES` + per-frame quaternions

**Files:** `src/data/orientation/orientationFrames.ts` (modify),
`tests/data/orientation/orientationFrames.test.ts` (new).

Assemble the four bases (§3.1 / the Architecture table) and derive their
quaternions. TDD: write the drift tests first, then build the registry to satisfy
them.

**Contract (added exports):**

```ts
export const ORIENTATION_FRAMES: Record<OrientationFrameId, Mat3>;
export const ORIENTATION_FRAME_QUATERNIONS: Record<OrientationFrameId, Vec4>;
```

Each `ORIENTATION_FRAMES` entry: flat column-major `Mat3` (frame-local → world),
**middle column (indices 3,4,5) = the frame's pole**, orthonormal, det +1.
Build columns with `mat3FromColumns(col0, poleCol, col2)`.
`ORIENTATION_FRAME_QUATERNIONS[id] = matrixToQuaternion(ORIENTATION_FRAMES[id])`,
derived once at module init (mirrors `SG_TO_EQ_QUATERNION` at
`superGalacticTransform.ts:89`).

**Assembly notes for the implementer** (pin the source, not the arithmetic):

- `equatorial`: columns `[+x, +z, −y]` — pole `+z` in the middle, `−y` in col 2
  keeps it right-handed.
- `ecliptic`: `ECLIPTIC_FRAME` (`orbitPlaneFrames.ts:81-85`) — middle =
  `.normal`, side columns `.xAxis` / `.yAxis`.
- `galactic`: middle = `GAL_Z_EQ`, side columns from `GAL_X_EQ` / `GAL_Y_EQ`,
  ordered/signed for det +1. (The det + orthonormality tests catch a wrong
  arrangement.)
- `supergalactic`: `SG_TO_EQ_MATRIX` (`superGalacticTransform.ts:86`) — middle =
  its column 2 (indices 6,7,8 = SGZ, the SG north pole); side columns from its
  column 0 (SGX) / column 1 (SGY), re-swizzled for det +1.

**Tests** (`tests/data/orientation/orientationFrames.test.ts`) — behaviour /
independent-derivation, per `testing.md`. Not the four `Mat3` values as literals.

- [x] `it('every registry basis is orthonormal')` — for each of the four frames:
      each column is unit length (‖·‖ ≈ 1) and the three columns are mutually
      orthogonal (pairwise dot ≈ 0), to ~1e-6. (Loosen to ~1e-4 only if the
      6-decimal `GAL_*_EQ` literals force it.)
- [x] `it('every registry basis is right-handed (det = +1)')` — determinant of
      each `Mat3` ≈ +1. This folds in the equatorial `[+x, +z, −y]`
      right-handedness check (a `[+x, +z, +y]` transcription would land det −1).
- [x] `it('ecliptic pole matches the obliquity pole from planeFrameFromPole')` —
      `ORIENTATION_FRAMES.ecliptic` middle column (indices 3,4,5) ≈
      `planeFrameFromPole(270, 66.56).normal`. Independent derivation: RA/Dec
      spherical (66.56° = 90°−23.44°) vs the `[0, −sinε, cosε]` obliquity rotation
      `ECLIPTIC_FRAME` is built from — a real drift check (catches a transcribed
      obliquity or a wrong pole column), not a mirror. Tolerance ~1e-4.
- [x] `it('galactic pole matches the NGP from eqRaDecToUnitCart')` —
      `ORIENTATION_FRAMES.galactic` middle column ≈
      `eqRaDecToUnitCart(192.8595, 27.1283)` (the NGP in equatorial). Independent
      of the hardcoded `GAL_Z_EQ` literal; tolerance ~1e-4 (the literal is rounded
      to 6 decimals).
- [x] `it('supergalactic pole is the SGZ column of SG_TO_EQ_MATRIX')` —
      `ORIENTATION_FRAMES.supergalactic` middle column ≈ `SG_TO_EQ_MATRIX` column 2
      (`[6],[7],[8]`). Verifies the swizzle placed the pole column in the middle
      (a wrong column pick or sign is exactly the transcription bug this catches),
      per the prompt's drift-vs-restatement framing.
- [x] Implement `ORIENTATION_FRAMES` and `ORIENTATION_FRAME_QUATERNIONS` to pass.
- [x] `npm test -- orientationFrames` green; `npm run typecheck` clean.
- [x] Commit.

`ORIENTATION_FRAME_QUATERNIONS` gets **no dedicated test** here: it is a pure
derivation via the already-tested `matrixToQuaternion` over the already-tested
registry matrices. A `quatToMat3(q) ≈ M` round-trip belongs with the feature PR's
slerp (`quatToMat3` is feature scope), where the endpoints are exercised.

---

## Task 4: Repoint the WESL↔registry parity test

**Files:** `tests/services/gpu/galaxy/milkyWayModelMatrix.test.ts` (modify).

Spec §9: the existing scrape test (`scrapeGalacticBasis` helper at `:34-49`; the
`it('rotation columns are the WESL galactic basis, …')` assertions at `:54-73`)
currently checks the scraped `util.wesl` literals against `milkyWayModelMatrix()`
output. Repoint the parity assertion so the shader literals are checked against
**the registry's galactic basis** — the registry, not a soon-stale TS copy, is now
what the shader is pinned to.

- [x] Add a test that asserts the scraped `util.wesl` `GAL_*_EQ` literals equal the
      registry's galactic basis: `ORIENTATION_FRAMES.galactic` middle column ≈
      scraped `GAL_Z_EQ`, and its side columns ≈ scraped `GAL_X_EQ` / `GAL_Y_EQ`
      (matching the swizzle chosen in Task 3, including any sign). Reuse the
      `scrapeGalacticBasis` helper (`:34-49`).
- [x] Keep the `translation lanes are MILKY_WAY_CENTER_WORLD` and `bottom row is
      0,0,0,1` tests (`:75-106`) — they still guard `milkyWayModelMatrix`. Retire
      or fold the old `milkyWayModelMatrix()`-vs-scrape rotation assertions
      (`:54-73`) only insofar as the registry parity now covers the same WESL↔TS
      contract; do not leave two tests asserting the same swizzle twice.
- [x] `npm test -- milkyWayModelMatrix orientationFrames` green.
- [x] Commit.

---

## Task 5: entanglement-radar review

**Files:** none (review pass).

House convention (`simplicity.md` / `entanglement-radar` skill): review the Prep 2
diff for complecting before the PR goes up.

- [x] Run the `entanglement-radar` skill over the diff. Focus points: did the
      galactic-literal move leave a *single* source (no lingering duplicate in
      `milkyWayModelMatrix.ts`)? Is `util.wesl` still the one place the GPU copy
      lives, with exactly one parity test pinning TS↔WESL (not two)? Is the
      middle-column-is-pole convention stated once and read consistently?
- [x] Address anything flagged (default is to un-braid, not defend); re-run
      `npm test` + `npm run typecheck`.
- [x] Commit any fixes; ensure the PR description notes Prep 2 = zero behaviour
      change (Milky Way renders identically), and that it precedes the feature PR.
