# Famous-galaxy calibration — AFK execution log

Running log of the autonomous (subagent-driven) implementation pass. Captures
status per task and any architectural decision made without the user present, so
they can be reviewed on return. Decisions here are made to be consistent with the
approved spec (`docs/superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md`)
and project conventions; anything genuinely contestable is flagged **REVIEW**.

> SHAs below are best-effort — terminal echo occasionally garbles a single-line
> rev-parse. The authoritative record is `git log --grep="(famous)"` /
> `--grep="(curator)"` on branch `impl-famous-thumbnail-calibration`.

## Status

| Plan | Task | Status |
|------|------|--------|
| 1 | 1 RecipeDisk type + disk? on Recipe | ✅ done (spec ✅ quality ✅) |
| 1 | 2 FamousCalibration type | ✅ done (split to own file — see decisions) |
| 1 | 3 DEPROJECT_MIN_AXIS_RATIO | ✅ done |
| 1 | 4 deprojectDisk | ✅ done (spec+geometry ✅ quality ✅) |
| 1 | 5 deriveFamousCalibration | ✅ done (spec+geometry ✅ quality ✅) |
| 2 | 1 export persists disk | ✅ done (`9ff2eaec` + cleanup `050ea871`) |
| 2 | 2 deproject hi-res crop | ✅ done (impl `66496db6`, quality nits `e1b8da61`) |
| 2 | 3 derive + return calibration | ✅ done (`75e58651`) |
| 2 | 4 thread calibration into buildFamous | ✅ done (`db962555`, prettier-amended) |
| 2 | 5 round-trip fixture | ✅ done (`25e34dd8`) |
| 3 | 1 disk reducer slice | ✅ done (`58cb381b`; +DirtyFlags.disk; ParamSliders test fixed `569b63a4`) |
| 3 | 2 pure diskOverlay geometry | ✅ done (`b295aa96`; PA convention matches deprojectDisk) |
| 3 | 3 DiskOverlay component | ✅ done (`047c9675`; catalog-b/a pre-fill; VISUAL pending) |
| 3 | 4 deproject toggle + preview | ⏳ impl |
| 3 | 5 export + re-hydrate disk | ⏳ |
| 4 | runtime placement | ⏳ |
| 5 | debug ring | ⏳ |
| 6 | ADR | ⏳ |

**Plan 1 COMPLETE. Plan 2 COMPLETE.** Plan 3 Tasks 1–2 done; Task 3 in flight.
Branch green at each commit (use the `npm run typecheck > log; echo ${PIPESTATUS[0]}`
form — a piped `$?` reports tail's exit, not tsc's; this masked a real typecheck
regression once already).

## Decisions made AFK

- **Task 3 test location:** plan said `tests/data/`, but `src/data/` co-locates tests
  (`selectionEncoding.test.ts` beside its source). Followed the neighbour convention →
  `src/data/famousCalibration.test.ts`.
- **Pure type/constant tasks reviewed by controller:** Plan 1 Tasks 2 & 3 (zero-logic
  type decl + single constant) were verified inline (typecheck + TDD red-green) rather
  than via separate review agents — disproportionate for no-logic changes. All logic
  tasks (1, 4, 5, and all of Plan 2+) get the full two-stage spec+quality review.
- **FamousCalibration split to its own file:** Task 2 first added it inside
  `FamousMetaEntry.d.ts` (the plan said so). User flagged: `src/@types` is strictly
  one-type-per-file. Moved to `src/@types/loading/FamousCalibration.d.ts`; FamousMetaEntry
  imports it. Codified in memory `feedback_one_type_per_file` + baked into every
  @types-touching dispatch.
- **Test paths under tests/**:** plan literally wrote `tools/famous/*.test.ts`, but
  vitest `include` only covers `tests/**`. All new tests placed under `tests/tools/…`.
- **validateRecipeDisk extracted (Plan 2 Task 1):** the disk-validation block was lifted
  out of `parseRecipe` into an exported `validateRecipeDisk` in `recipe.ts`, shared by
  both `parseRecipe` and the export route (DRY / single source of truth).
- **Dropped redundant curatedDirOverride (Plan 2 Task 1 cleanup):** an implementer added
  a second output-redirection test hook; `repoRoot` already isolates all output
  (galaxy dir, atlas copy, override index). Removed it; tests use a tmp `repoRoot`.
- **Starless frame verified, not assumed (Plan 2 Task 2):** the deproject step needs the
  PA in the post-crop frame. Confirmed against `process.ts` that `starless.png` is written
  by `handleProcess` via `rotatedExtract → StarNet`, so it is already in the CROP frame —
  same `effectivePaDeg = disk.paDeg − crop.rotationDeg` as the source pipeline. Both
  deproject with identical params; a single shared `starlessFullBuf` keeps source/starless/
  alpha pixel-registered.
- **`willDeproject` single-sources the stretch band (Plan 2 Task 2 quality):** the
  `[DEPROJECT_MIN_AXIS_RATIO, 1)` band was duplicated between `deprojectDisk`'s guard and the
  export predicate. Extracted `willDeproject(axisRatio)` in `deprojectDisk.ts`, used by both.
  Too-edge-on test now asserts the `console.warn` skip fires (and does not fire when the
  toggle is off) so the threshold path is observable, not just inferred from output equality.
- **catalogAxisRatio resolution at the export call site (Plan 2 Task 3):** `deriveFamousCalibration`
  requires a numeric `catalogAxisRatio` but `ExportBody.catalogAxisRatio` is optional. Resolve
  via `body.catalogAxisRatio ?? disk?.axisRatio`; derive only when that is defined. When
  `disk.axisRatio` is set it determines the result regardless, and the curator always threads
  `catalogAxisRatio`. (Front-loaded to the Task 3 implementer.)

## Plan 3 — reconciliation + locked UX decisions

- **Plan 3 file map was stale** — corrected in a `## Reality reconciliation` block at the
  top of the Plan 3 doc. Real curator UI: flat `tools/famous-curator/ui/` + `components/`;
  pure-geometry precedent is `cropMath.ts` (not `cropGeometry.ts`); curator tests live in
  `tests/tools/famous-curator/ui/`; `CropCanvas.tsx`/`PreviewPane.tsx`/`MetadataForm.tsx`/
  `ParamSliders.tsx` exist; no `DiskControls.tsx` (greenfield).
- **DirtyFlags gained `disk`** so a disk/deproject change re-Processes before Export
  (else a disk edit after Process ships a stale webp). Touching DirtyFlags rippled to
  `ParamSliders.test.tsx` (hand-built dirty literals) — fixed.
- **Locked UX decisions (asked the user 2026-05-31):**
  1. **Mode toggle + center-out drag.** CropCanvas gets `mode: 'crop'|'disk'`; in disk mode
     the crop is locked (`pointer-events:none`) and the overlay is interactive; create by
     press-at-nucleus → drag → release-at-edge (the user's original gesture). Crop/disk
     never co-move.
  2. **Axis ratio PRE-FILLS from the catalog b/a** (user's final call — overrides the
     earlier draft). `/api/galaxies` + the UI `GalaxyListEntry` (both copies) gain
     `axisRatio?`; App derives the active galaxy's b/a and passes it as `catalogAxisRatio`.
     On disk creation: `disk.axisRatio = catalogAxisRatio` and `disk.deproject =
     (catalogAxisRatio ?? 1) >= DEPROJECT_MIN_AXIS_RATIO` (only round-ish auto-on). The
     minor handle still lets the user override `disk.axisRatio`. The drag owns
     center/radius/paDeg; the catalog only pre-fills axisRatio + seeds deproject.
- **DiskOverlay is its own component** (`components/DiskOverlay.tsx`), rendered by CropCanvas
  inside `.curator-crop-frame`; the deproject toggle will be its own `components/DiskControls.tsx`
  (Task 4), NOT bolted onto ParamSliders.
- **Task 4 preview gap:** deproject lives only in the export route; a face-on PREVIEW needs
  `routes/process.ts` to deproject too (reuse `willDeproject`/`deprojectDisk`) + `disk` on
  `ProcessParams`. Task 4 owns this.

## Resume pointer (survives a compaction)

- Branch `impl-famous-thumbnail-calibration`, HEAD at the Plan-2-complete docs commit (Plans 1–2 fully landed).
- Plan files: `docs/superpowers/plans/2026-05-31-famous-galaxy-thumbnail-calibration-{INDEX,1..6}.md`.
  Spec: `docs/superpowers/specs/2026-05-31-…-design.md`.
- Workflow: subagent-driven — implementer (background, bash sequential, no sed/awk/grep)
  → spec review → code-quality review → apply nits → tick plan checkboxes inline.
- Standing constraints: one-type-per-file in `src/@types/`; comment-tidy every touched
  file; component-split per the component skill for Plan 3 UI; branch+PR, never
  direct-push; do NOT merge to main without the user (visual-verification gate).
- **NEXT:** Plan 3 Task 3 (DiskOverlay component) in flight → Task 4 (deproject toggle +
  process-route deproject for the preview) → Task 5 (export params + resume hydration). Then
  Plan 4 (runtime), 5 (debug ring), 6 (ADR). Plans 3/4/5 need user VISUAL verification.

## Needs your eyes (visual verification deferred)

- Plan 3 (curator UI), Plan 4 (runtime quad placement), Plan 5 (debug-ring shader):
  implemented + unit-tested, but WebGPU/WESL/UI pixels not visually verified. Confirm on
  return before merge.

## Plan 2 Task 2 — implementer guidance (frame handling)

- Insert `deprojectDisk` between `rotatedExtract(sourcePath, body.crop)` and the
  `.resize(FULL_PX…)` downsize, for BOTH source.png and starless.png (lockstep, identical
  params, so source/starless/alpha stay registered).
- `rotatedExtract` already rotates the crop to its local frame, so the PA passed to
  `deprojectDisk` must be the **post-crop** angle: `disk.paDeg − crop.rotationDeg`
  (the same quantity `deriveFamousCalibration` computes). Document the frame choice.
- Effective axisRatio = `disk.axisRatio ?? body.catalogAxisRatio`. Deproject only when
  `disk.deproject && effectiveAxisRatio >= DEPROJECT_MIN_AXIS_RATIO`. Forced-on but
  too-edge-on → ship as-shot AND log a skip; the derived calibration's `deprojected`
  must then be `false`.
