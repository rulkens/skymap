# One intent action per field, with single-writer ratchets for selection and time

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`updateSelectionFocus` from 9 files, `InfoCardContainer.tsx:23` writing it directly and skipping `requestFocus` and the URL pending id; `clearSelection` from 8; `pause` from 7. Clock capture/restore in `restoreSceneSaga.ts:73-77`, `clipBodySaga.ts:34-73` and `missionHoldSaga.ts:57-66`. `setOrientation` snaps (`hashParamSources.ts:249`, `applyLinkClockAndFrameSaga.ts:16`, `applySceneEffect.ts:64`) while `requestOrientationChange` tweens. `captureScene.ts:43` keeps `selection.focus` but not `select`. `cameraRuntimeSingleWriter.test.ts` is the only ratchet.

## Direction

`requestFocus`, `requestClock`, `requestOrientation` as the only writers; a ratchet test per field with today's offenders allow-listed and only ever shrinking. Lands after the takeover-exit and clip-snapshot items remove two of the clock copies.
