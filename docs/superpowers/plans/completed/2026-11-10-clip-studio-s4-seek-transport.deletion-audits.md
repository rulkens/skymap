# Deletion audit: clip studio S4 (seek, scrub, transport), legacy framing, 2026-11-11

Range `origin/feat/clip-studio-s3...a3a2d7403` (114 files, +2343 −219); auditor opus-class, read-only, fenced by
the clip-studio package audits and the plan's rulings. Verdict: little to remove (well under 1% of added lines).

## Applied (84b2ea111, safe-now): 7 files, +13 −34

clipPlayer's `finish` folded into `stop` (closes the S3 audit's leftover; `publishWrap` was already gone, a wrap
seeds); `rowReplaced`'s `label` (one dispatcher, always `VIEW_USED_LABEL`); the restated "anchored at the first
frame" transport test; resolveFrameBasis's stale slerp header (the warning moved onto `frameRollQuatAt`);
clipOwnsCamera's over-budget doc.

## Needs ruling

- `fromView` optional on `RowKindSpec` (`fromView?`, like `resolved?` and `glyph?`): drops 20 `fromView: null`
  lines from the scene and structure kinds; the trade is that a new kind no longer has to decide on Use current view.

## Optional, not applied

`scrubClip` reusing `collectCpu`'s sampling loop via a `before(i)` hook (−6, perf harness, re-check `--scrub`); one
`selectFreeLook` selector for the four whole-store readers of `paused && camera === 'free'` (−2 net); the seed
mechanism told twice, in `clip-primitives.md` "Transport" and ADR 0017 "Seeking" (−5 docs).

## Traps (do not remove)

previewSaga's `opened` alias and `freeLookSaga`'s own guard (one dispatch per pointer move otherwise); the reducer
guards in `freeLookStarted`/`followResumed` and the no-clip guards in `clipTransportSet`/`clipDataReplaced`;
`clipDataReplaced` assigning `data` alone; `compile` clearing the view memo; `seed`'s untouched-identity branch;
the `t > durationSec` checks (paused past End, Q-B); `selectCameraActive`'s paused gate; Playhead/Ruler/ZoomControls
reading the head themselves; `once` keys and `controlOwnsKey` leaving Space to a focused button; `structuredClone`
in viewUsedSaga; `CLIP_START_FRAMES` and its throw; `playFrom.test`'s `>=` boundary cases.

## Checked clean

Every new action, selector, util, type and CSS class has a reader; `getFades` uses all three methods and
`visibilityTargets` is read; no debug code, TODOs or skipped tests; the `clipAt: null` fixture lines follow from Q-F.
