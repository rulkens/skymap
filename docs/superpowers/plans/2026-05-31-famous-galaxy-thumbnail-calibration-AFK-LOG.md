# Famous-galaxy calibration — AFK execution log

Running log of the autonomous (subagent-driven) implementation pass. Captures
status per task and any architectural decision made without the user present, so
they can be reviewed on return. Decisions here are made to be consistent with the
approved spec (`docs/superpowers/specs/2026-05-31-famous-galaxy-thumbnail-calibration-design.md`)
and project conventions; anything genuinely contestable is flagged **REVIEW**.

## Status

| Plan | Task | Status | Commit |
|------|------|--------|--------|
| 1 | 1 RecipeDisk type + disk? on Recipe | ✅ done | `e5afcb4a` |
| 1 | 2 FamousCalibration + calibration? | ✅ done | `4250a12e` |
| 1 | 3 DEPROJECT_MIN_AXIS_RATIO | ✅ done | `1f8f2d34` |
| 1 | 4 deprojectDisk | ✅ done (review ✅, polish `7afdf84a`) | `d0b13e27` |
| 1 | 5 deriveFamousCalibration | ⏳ review | `db8a8272` |
| 2 | build pipeline | ⏳ | |
| 3 | curator UI | ⏳ | |
| 4 | runtime placement | ⏳ | |
| 5 | debug ring | ⏳ | |
| 6 | ADR | ⏳ | |

## Decisions made AFK

- **Task 3 test location:** plan said `tests/data/famousCalibration.test.ts`, but
  `src/data/` co-locates tests (`selectionEncoding.test.ts` sits beside its source).
  Followed the established neighbour convention → `src/data/famousCalibration.test.ts`.
  Low risk; matches local pattern.
- **Tasks 2 & 3 review:** pure type-declaration (Task 2) and a single-constant module
  (Task 3) were verified by the controller (typecheck + direct read / TDD red-green)
  rather than dispatching separate spec + quality review agents — disproportionate for
  zero-logic changes, and keeps context lean. Tasks 1, 4, 5 (logic) get the full
  two-stage review.
- **FamousCalibration split to its own file (`71ca4c1d`):** Task 2 originally added
  `FamousCalibration` inside `FamousMetaEntry.d.ts` (the plan said so). User flagged it:
  `src/@types` is strictly one-type-per-file. Moved it to
  `src/@types/loading/FamousCalibration.d.ts`; `FamousMetaEntry` imports it. Codified in
  memory `feedback_one_type_per_file` + baked into every @types-touching dispatch.
- **Task 4 test path:** plan literally said `tools/famous/deprojectDisk.test.ts`, but
  vitest's `include` only covers `tests/**`; placed at `tests/tools/famous/`. Same for
  Task 5. (A test beside the source would never run.)

## Needs your eyes (visual verification deferred)

- Plan 3 (curator UI), Plan 4 (runtime quad placement), Plan 5 (debug-ring shader):
  implemented + unit-tested, but WebGPU/WESL/UI pixels not visually verified.
  Confirm on return before merge.
