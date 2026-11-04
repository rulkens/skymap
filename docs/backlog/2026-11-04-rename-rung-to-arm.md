# Rename "rung" to "arm" across the camera

`ready` — owner ruling 2026-11-04: the camera's regimes go by ONE name, **arm**. Today the
table row is a "rung" (`CAMERA_RUNGS`, `RungKind`, `RungRow`, `ClimbRow`, `rowFor`, `stepRung`,
`nudgeRung`, the `rungs/` folder, `bodyRung`/`siteRung`/`skyRung`/`absoluteRung`) while the pose
in it is an "arm" (`isWorldArm`, `isBodyArm`, `isSiteArm`, `isSkyArm`, "the world arm"). Readers
take the two for different things.

Footprint (`git grep -i rung -- src tests tools`, 2026-11-04): 479 lines in 139 files, including
specs and comments that say "ladder".

Shape: a mechanical rename PR of its own, through `npm run refactor rename` for symbols and
`npm run move-files` for files (`rungs/` → `arms/`, `skyRung.ts` → `skyArm.ts`, …), never
hand-edited imports. Decide the names that collide first: `RungKind` → `ArmKind`, but the table
row type `RungRow` vs the existing pose-side words (`FramedPose`) needs one pass of naming
before the sweep. Grep comments and docs for "rung" and "ladder" afterwards; shipped specs under
`*/completed/` stay as written.
