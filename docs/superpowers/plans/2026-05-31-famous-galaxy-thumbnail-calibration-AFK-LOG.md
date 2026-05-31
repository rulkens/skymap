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
| 2 | 2 deproject hi-res crop | ⏳ impl |
| 2 | 3 derive + return calibration | ⏳ |
| 2 | 4 thread calibration into buildFamous | ⏳ |
| 2 | 5 round-trip fixture | ⏳ |
| 3 | curator UI | ⏳ |
| 4 | runtime placement | ⏳ |
| 5 | debug ring | ⏳ |
| 6 | ADR | ⏳ |

**Plan 1 COMPLETE.** **Plan 2 Task 1 done.** Full repo suite green
(**1854 tests / 292 files**), typecheck clean at HEAD `050ea871`.

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

## Resume pointer (survives a compaction)

- Branch `impl-famous-thumbnail-calibration`, HEAD `050ea871`, worktree clean.
- Plan files: `docs/superpowers/plans/2026-05-31-famous-galaxy-thumbnail-calibration-{INDEX,1..6}.md`.
  Spec: `docs/superpowers/specs/2026-05-31-…-design.md`.
- Workflow: subagent-driven — implementer (background, bash sequential, no sed/awk/grep)
  → spec review → code-quality review → apply nits → tick plan checkboxes inline.
- Standing constraints: one-type-per-file in `src/@types/`; comment-tidy every touched
  file; component-split per the component skill for Plan 3 UI; branch+PR, never
  direct-push; do NOT merge to main without the user (visual-verification gate).
- **NEXT:** Plan 2 Task 2 (deproject wiring) in flight → Tasks 3,4,5 → Plan 3 (UI),
  4 (runtime), 5 (debug ring), 6 (ADR).

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
