# One `navigate(intent, transition)` action owns every link and palette arrival

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

Arrival applies the clock before navigating and never runs `readAbsent` (`arrivalSaga.ts:33-34`); a hashchange navigates first and then applies absent defaults (`goLiveNow`, `setOrientation(DEFAULT)`, `clearSelection`; `watchHashReadSaga.ts:102-111`) while the takeover it just started is still entering. `missionHoldSaga.ts:65-66` puts `setSimDays`/`pause` and its race at `:76-85` does not watch `goLive`. The "no `t` means live" rule is written twice (`hashParamSources.ts:208`, `arrivalSaga.ts:33`). `actionsForPaletteAction.ts:16-24`, `SplashContainer.tsx:31`, `TourDebugPillContainer.tsx:19` and `installRecorderHook.ts:87,128` dispatch directly and skip `navigateSaga.ts:128-134`. The existing palette line (`RUN_ACTION` duplicates link dispatch) is one instance of this.

## Direction

One `navigate` action, one saga, absent defaults applied inside it before the view switch; the four direct sites dispatch the action. Subsumes the palette `RUN_ACTION` backlog line.
