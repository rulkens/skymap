# Frame-tagged clip keyframes have no per-endpoint authoring validation

**Raised:** 2026-09-10/11, task 20 (T20) on PR #647
(`.superpowers/sdd/2026-09-01-camera-pivot/task-20-report.md` concern 2). User
ruled: backlog, not this PR.

`CameraAction`'s `set`/`setVec` arms carry an optional `readonly frame?:
PoseFrame` tag per endpoint (absent ⇒ `'absolute'`). `evaluateClip.ts` derives
**frame legs** from these tags — a leg is a maximal run of clip time under one
`PoseFrame` — but the tag is per-endpoint while a channel's straddling tween is
authored at the pose level, with nothing that rejects a leg boundary landing
mid-tween on a channel the leg doesn't own.

## The failure mode

If an absolute `distance` tween spans `[0, 10)` while a body-framed `target`
opens a new leg at `t = 5`, the distance segment is silently skipped from `t =
5` onward and the channel holds its already-converted value — the honest
consequence of one channel authored across a frame boundary another channel
just crossed. `task-20-report.md` names this "an authoring pathology, but
nothing rejects it loudly."

## Where

`src/services/engine/camera/evaluateClip.ts`'s frame-leg derivation (the
`legStartCache`/`legsCache` machinery documented in `task-20-report.md`'s "Where
the once-per-leg conversion state lives" section) walks compiled base tracks
and opens a new leg at any `set`/`setVec` endpoint whose `frame` tag differs
from the frame in force — with no check that every channel active across that
boundary agrees on the new frame.

## Fix shape

A `validateSingleWriter`-style compile-time check (in `compileClip` or a pass
over its output) that walks channels crossing a frame-leg boundary and throws
if any channel has an in-flight tween that does not also close or re-open at
that boundary. This is authoring-time validation, not a runtime behavior
change — it should catch the pathology at clip-compile time rather than let it
silently freeze a channel.
