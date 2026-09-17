# F3a height lookup — ledger

Plan: `docs/superpowers/plans/2026-09-16-terrain-f3a-height-lookup.md`
Spec: `docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md` §5.3, §8, §11, §12
Worktree: `.claude/worktrees/terrain-height-lookup`, branch `worktree-terrain-height-lookup`
PR: #741 (draft) — docs + PR 1 prep ride together.

## Pre-flight

- Parallelism: 1 — PR 1 only, this worktree, dispatches serial (shared git index).
- Perf gate: **not** on PR 1 (P1/P2 are no-behaviour-change). Runs on PR 2 before/after F3,
  with this worktree's own `--url`.

## Rulings

- `Ruling: one function terrainHeightM, not the spec's four-method SurfaceHeightField —
the conservative bound was the source of all the complexity and its monotonicity proof
was wrong on both legs (§8.2) — cost if wrong: the camera floor can rise transiently on
a refinement step, priced at tens of metres.`
- `Ruling: the CPU reads a 17x17 decimated post grid from the SHGT header chunk (v3), not
pixels and not a GPU readback — #736 forbids canvas readback, and a readback would put
the camera floor downstream of the render with no answer on frame 1 — cost if wrong: a
height re-bake and R2 sync to change the stride.`
- `Ruling: one prep PR then one feature PR — user, at the refactor-ground checkpoint.`
- `Ruling (user, 2026-09-17): the terrain-aware ZOOM ANCHOR gets its own PR, straight
after F3a — not folded into F3a, and not left to wait for F3b. F3b is a spec row
marked "not scoped" whose atmosphere half is gated on §2's depth-aware composite,
so "fix it in F3b" was an indefinite promise. Backlog detail file written:
docs/backlog/2026-09-17-terrain-aware-zoom-anchor.md.`
- `Ruling (user, 2026-09-17): F0b's re-bake is APPROVED — run it. Then run F1, F2, F3 to
completion without stopping for approval. SKIP the perf gate (no npm run perf before or
after F3). The eye-check and the squash-merge still belong to the user.`

## Dispatches

| #   | tasks              | model                | BASE → HEAD           | status     | turns |
| --- | ------------------ | -------------------- | --------------------- | ---------- | ----- |
| 1   | P1                 | Opus (review: yes)   | 385237e68 → 79d33d0e0 | done       | 35    |
| 2   | P1 review (r/o)    | Opus                 | —                     | clean      | 11    |
| 3   | P2                 | Opus (review: yes)   | 79d33d0e0 → 7fd3ecd62 | done       | 70    |
| 4   | P2 review (r/o)    | Opus                 | —                     | clean      | 18    |
| 5   | cap test           | controller inline    | 7fd3ecd62 → 81d7fdfe7 | done       | —     |
| 6   | F0 (SHGT v3)       | Opus (review: yes)   | 0f8771746 → f1903fa86 | done       | 46    |
| 7   | F0 review (r/o)    | Opus                 | —                     | clean + 6  | 25    |
| 8   | F0 follow-up       | controller inline    | f1903fa86 → c7c9971f9 | done       | —     |
| 9   | F0b re-bake        | controller inline    | no commit (data only) | done       | —     |
| 10  | F1 terrainHeightM  | Sonnet               | c7c9971f9 → b7d813e0f | done       | 83    |
| 11  | F1 review (r/o)    | Opus                 | —                     | clean + 5  | 24    |
| 12  | F2 terrainHeightAt | Sonnet               | b7d813e0f → cb79841f6 | done       | 58    |
| 13  | F1/F2 follow-up    | controller inline    | cb79841f6 → 4244ec066 | done       | —     |
| 14  | F3 routing         | Sonnet (review: yes) | 4244ec066 → 15664038d | done       | 134   |
| 15  | F3b research       | Opus (read-only)     | wrote 1 backlog file  | done       | 64    |
| 16  | docs + spec fix    | controller inline    | 15664038d → d189c291c | done       | —     |
| 17  | F3 review (r/o)    | Opus                 | —                     | dispatched |       |

**In flight: F0.** Opus, task `### F0` of the plan — `HEIGHT_TILE_VERSION` 2→3, the 17×17
grid into the `SHGT` chunk, encoder + decoder + three tests. Told explicitly NOT to run
F0b's bake. On its report: (a) tag it `review: yes` and dispatch a read-only review against
spec §8.4 + §11's post-addressing bullet — the grid-post-equals-image-pixel property is the
one place CPU and shader can silently diverge; (b) open the PR 2 draft PR off `main` (the
branch has no commits before F0, so there is nothing to open one against until it lands);
(c) then run **F0b** (the re-bake + R2 sync — now user-approved), then dispatch F1 → F2 → F3
back to back, no perf run. If F0 reports it could not reuse `decimateHeightGrid.ts`, check
why before accepting a second decimator.

## F0b deviations (controller, 2026-09-17)

- **No prefix bump — `v9` stays.** The plan's "v9 → v10" bullet contradicts its own
  "sync the height product" bullet: `prefix` is ONE manifest field covering both
  products, so bumping it during a `--product height` run points the manifest at `v10`
  albedo tiles that do not exist. Re-baking 429 MB of unchanged albedo to move it to a
  new path is waste. In place at `v9` + an explicit purge (#742) instead.
  `earthSurfaceBake.ts:32-39`'s "BUMP THIS on any re-bake that changes pixels" docstring
  is about mismatched CDN imagery; a height-only bake changes no albedo pixel.
- **R2 sync deferred to after the merge.** The deployed JS decodes v2 only, so pushing
  v3 tiles now flattens terrain on the live site until F1–F3 ship. Recorded in PR #744's
  body so it cannot be lost.
- **Raw sources are not in the worktree.** `data/raw/<source>` here holds only the
  tracked READMEs and checksums; the real files live in main. Mirrored with
  `scratchpad/mirrorRaw.mjs` — REAL directories, symlinked files. A directory symlink is
  NOT enough: `eoxTileSource.ts:135` filters on `Dirent.isDirectory()`, which is false
  for a symlink, so every region dir silently vanished. 558 dirs, 15347 file links;
  `git status` stays clean (all gitignored).
- Rollback point: the v2 tiles are at `public/data/images/earth-tiles/v9/height.v2-backup`
  (180 MB). Delete it once the eye-check passes.
- **DONE 2026-09-17.** 20,684 tiles, z3–z19, all four sources. Verify by APPARENT bytes,
  not `du` — at ~7 KB/file the 4 KB block rounding hides the whole delta (`du` moved
  180→188 MB, the real change is 126.8→143.9 MB). Mean per tile went 6,426 → 7,294 B:
  **exactly +868**, i.e. 867 grid bytes plus the one RIFF pad byte 883 needs for being
  odd. That the pad shows up in the mean is itself the evidence it is not being dropped.
  Water diagnostics unchanged in character (Dead Sea −426.0 m, global −5292.9..8748.0).

## Controller follow-ups — DONE in `4244ec066`

- **Non-finite guard.** F1's zero guard was `magM === 0`, so NaN/Infinity survived
  `atan2`/`asin` into the camera position — the black screen the guard exists to
  prevent. Now `isFinite`; mutation-verified (reverting it turns the new test red).
- **`ResidentHeightLookup` narrowed** to `Pick<HeightTileHeader, 'gridCodes'>`. It
  demanded a whole header while the climb reads `gridCodes` alone, so F2 had to
  invent a `geometricResidualM: 0` its own comment called untruthful. The type was
  the bug; the invention is gone.
- **`codeHeightM` moved `tools/` → `src/utils/surfaceTiles/`.** It was the tree's
  only `src/` → `tools/` import. `src/utils/random/gaussian.ts:7-8` documents that
  boundary and pays a DUPLICATE to respect it; duplicating is unavailable here
  because §5.3 allows exactly one code→metre mapping — so invert the edge instead.
  11 files, `npm run move-files`, 1511 tests green.

## Review findings

P1 review: no behaviour change at any of the three climb sites, verified term-by-term
against `385237e68`. Two soft notes:

- **Acted on:** the shifted cap `MAX_LEVEL_DELTA - startDelta` is new arithmetic with no
  test — `resolveHeightLattice.test.ts` exercises the cap only at `minLevelDelta: 0`, so a
  regression would pass the suite. Adding one case (`minLevelDelta: 3`, only resident at
  absolute delta 7) after P2 frees the git index.
- **Declined:** `deepestResidentAncestor.test.ts`'s nothing-resident case is subsumed by
  the minLevel case. The plan named both explicitly; keeping it costs nothing.
- `flattenAtlasRect` stays module-local — extraction would drag a module-local type into
  `src/@types/` for a 12-line single-caller helper. Reassess if `terrainHeightM` needs it.

P2 review: clean no-op, value-traced. Two latent findings, both written into the plan
rather than fixed here:

- A **zero `dirBodyFixed`** reaches the lookup from three unguarded sites
  (`flooredBodyPose.ts:29` queries before its own `magM === 0` guard; `toWorldArm` and
  `hostedFocusOverHorizon` have none). `terrainHeightM` must return `0`, not normalize a
  zero into `NaN`. Now an F1 contract line and a test.
- **`anchoredZoomStep`'s nadir-fallback anchor stays on the datum**, so a terrain-aware
  floor makes "one notch out undoes one notch in" measure against a different surface than
  the floor pushes off. Now a DoD eye-check line; fixing it would be its own change.

## F3b: the spec was wrong, and it mattered

Research (dispatch 15) found the spec's §2 line "That work is in flight separately",
about the depth-aware composite F3b's atmosphere row waits on, is false. The froxel
attempt's prep merged (#702) but PR #709 closed 2026-09-15; its commits sit on a
worktree branch, never ancestors of `main`. No successor, no backlog row — and the
froxel plan and spec still sit in the ACTIVE `plans/`/`specs/` directories with no
status marker, which is why the claim went unchallenged. **Open for the user:
archive those two files.**

Also found, all now corrected in the spec (`d189c291c`):

- The horizon-cap occludee row is **already done** (`cutSurfaceTiles.ts:168,181`,
  `reliefHeadroom`, landed with F1/F2), as is the atmosphere ground radius
  (`atmosphereParams.ts:34`, since #704).
- Site counts are stale in the strict sense: #704 deleted `radiusM` entirely.
- Pick error is `h·tan θ` — ~15 km at 60°, ~177 km at `MIN_INCIDENCE_COS` — not the
  flat 8.8 km the spec claims, which is only the nadir case.
- Cloud-deck clearance over Everest is **68 m**, not kilometres. Separately,
  `bodyDrawRadiusM.ts:29` builds the slab shell top from the OUTER bound × 1.002
  while `cloudShellPass.ts:181` draws it at DATUM × 1.002 — 8,867 m apart, safe
  direction, dissolves if the deck becomes an altitude. Not filed separately; it
  lives in the F3b backlog file.

## F3 review — NOT CLEAN, 6 findings

Fixing (dispatch 18): **D1** the optional `RungBasisCtx.terrainHeightAt`'s stated
invariant is FALSE — it claims no other ctx calls `groundRadiusAtM`, but 4 of 6 do
(`watchFlyToLonLatSaga:53`→`toWorldArm:83`, `evaluateClip:550`, `liveWorldPose:15`,
`frameContext:152`, all via `foldToWorld`/`refoldTo`→`bodyRung.toParent:106`). Made
required. I had told the user this was safe after checking two sites and
generalising from them — the generalisation was the error, not the check.
**G3** the cross-file contract test passes terrain 0 to both sides, so it never
pinned what its name claims. **G4** the `?? 0` binding is duplicated in
`runFrame.ts:119` and `engine.ts:579`.

Documented, not fixed:

- **D2 — two consumers outside the three rows got re-based.** `groundRadiusAtM` has
  six consumers; `hostedFocusOverHorizon:23` (an engage/release predicate, which
  §8.3 assigns to F3b's occlusion row) and `poseFrameConversion:105` now see terrain.
  Judgement: a mountain genuinely occludes, so this is arguably more correct than the
  datum — but it is a behaviour change nobody asked for and has no test. It can flip
  a regime decision when the eye is between the datum and datum+terrain. **User's
  ruling at the eye-check**, not mine to pre-empt.
- **G1 — under a PAUSED clock, rover height freezes.** `deriveBodyStates`'s one-deep
  memo keys on `simDays` alone and ignores the lookup on a hit; a paused clock
  returns the anchor instant verbatim, so terrain refinement never reaches the map.
  Worse, if one of the ~12 terrain-less `deriveBodyStates(simDays)` callers wins that
  instant, rovers sit on the datum for the whole pause. Inert in F3a (all sites are
  Mars). Not fixed because a correct fix needs a residency epoch the subsystem does
  not expose, and nothing could test it before F4's tiles exist. The file's own
  defence — "a paused clock holds a rover's height stale exactly as it holds every
  other body's position stale" — is a false equivalence and must be corrected in the
  code: position IS a function of sim time, terrain residency is not.
- **G2 — F3b item 1 must land before F4's Mars bake.** See the Mars notes below.
- No integration test drives the ladder with non-flat terrain
  (`tests/helpers/camera/simulateCameraFrame.ts:40` stubs `() => 0`), so the floor's
  end-to-end behaviour rests entirely on the user's eye-check.

## Deletion audit (/feature-done, 2026-09-17)

Safe-now bin applied in `14dfb3f7d` — 42 removed / 5 added, net −37, 11 files.
Subsumed tests, an 11-line docblock for a 2-line change, tautological `isFinite`
assertions after `Object.is(x, 0)`, name-restating comments, and a length-check
message that claimed 883 bytes where it needed 2.

Ruled load-carrying and explicitly NOT deleted, so a later audit does not re-raise
them: the three lookup types (`GroundRadiusLookup (dir)→num`,
`TerrainHeightAtLookup (bodyId,dir)→num`, `ResidentHeightLookup (tile)→{gridCodes}|null`
differ in arity, domain and nullability); `deepestResidentAncestor`'s `maxLevelDelta`
(`resolveHeightLattice` needs the shifted cap); `datumOnlyTerrainHeight` and
`terrainHeightAtOf` (6 and 4 callers, each one shared miss rule); required
`RungBasisCtx.terrainHeightAt` (making it optional again would undo `15930bae7`).

**User rulings on the needs-ruling bin, 2026-09-17:**

- `Ruling: deriveBodyStates CALLS sitePointBodyFixed instead of re-implementing it.
Deletes the maths copy, the "kept as two independent copies on purpose" note, and
the cross-file contract test that note existed to justify — and gives
sitePointBodyFixed's terrainHeightAt param its first production caller. The
duplication rationale predicted exactly the failure that then happened: this
feature had to edit both copies.`
- `Ruling: DELETE fetchHeightTile's unreadable-SHGT warn. The outer try/catch already
returns null, so 15 lines and a module-level mutable flag bought one console.warn,
with no expiry trigger. Consequence accepted: after the R2 purge, a cached v2 tile
is indistinguishable from a 404 — flat terrain, silent.`

## In flight + queued

**In flight:** one agent applying both rulings above (HEAD was `14dfb3f7d`). On its
report: (a) trim the two type files the audit flagged as still over the comment
budget — `GroundRadiusLookup.d.ts` has a 6-line header against the ≤5 cap and
`TerrainHeightAtLookup.d.ts` runs ~5:3 comment:code; both came from this effort, so
they are in scope; (b) finish `/feature-done`'s housekeeping.

**`/feature-done` audit so far:** `npm test` 8623 green, `npm run typecheck` clean,
zero new TODO markers, plan 36 ticked / 2 open (both deliberate: the R2 sync is
post-merge, the perf run is user-waived), spec has its Ground preparation section,
no F3a backlog item to sweep.

**Housekeeping when it completes — one deviation from the skill's default:** move
`docs/superpowers/plans/2026-09-16-terrain-f3a-height-lookup.md` to `plans/completed/`
and copy this ledger to `plans/completed/2026-09-16-terrain-f3a-height-lookup.ledger.md`.
**Do NOT move the spec.** `specs/2026-09-13-per-planet-terrain-design.md` covers
F1–F4; F4 is in flight (#743) and F3b is unstarted. The two new `docs/backlog/`
files are follow-on work filed today and STAY. Then commit, push to #744, and stop —
the eye-check and the squash-merge are the user's.

## Landings

**PR 1 (prep) — LANDED.** #741 squash-merged to main as `0f8771746`, 2026-09-17, on the
user's word. CI green. Commits: `385237e68` docs, `79d33d0e0` P1, `7fd3ecd62` P2,
`81d7fdfe7` cap test, `188687d91` + `626b40cc1` plan follow-ups. Both reviews clean.
No `/feature-done` on prep — that runs once, at the feature PR (user, 2026-09-14).

**PR 2 (feature)** — branch `worktree-terrain-f3a-feature`, same worktree, off `0f8771746`.
F0b's re-bake writes through this worktree's `public/data` symlink into main's tiles —
**the user gave the go on 2026-09-17**, so it runs as part of this PR. Every dev server on
this machine sees the new tiles the moment it lands; that is expected and accepted.

Mars F4's feature PR #743 (`wt mars-terrain-feature`) runs in parallel and merges after
F3a. Docs-only as of 2026-09-17, so no file overlap yet — it will grow into
`surfaceTileSubsystem.ts`, and whichever of the two lands second resolves the conflict.

**Mars must take `f1903fa86` (SHGT v3) BEFORE it bakes** — user flagged 2026-09-17 that the
F4 session plans a bake of its own. A Mars bake on today's `main` writes v2 height chunks
under `mars-tiles` with no CPU grid; the v3 decoder rejects them outright, so every Mars
height tile would 404-equivalent and the terrain would come back flat — after hours of
baking. `git cherry-pick f1903fa86` onto `worktree-mars-terrain-feature` costs nothing and
is a clean pick (its 8 files are all format/encoder/decoder, none of them Mars's).
