# Tour animation — design (brainstorm-in-progress)

> **Status: incomplete brainstorm.** Started 2026-05-07 during the outreach
> work (the trigger was needing a 20-30 s screen capture for r/Astronomy
> and r/WebGPU; the existing sub-second `cameraTween` produces hard cuts
> that don't read as cinematic). Brainstorming was paused after two
> decisions; this doc captures the state so it can be picked up cleanly
> in a future session.

## What it is

A "guided tour" mode for skymap: the camera flies through a scripted
sequence of targets (Milky Way → M31 → wide cosmic-web view), narrating
the scale story (familiar → bigger neighbour → cosmic structure) over
20-30 seconds. Triggered by URL flag for now (e.g. `?tour=default`),
not exposed as visible UI.

Primary use case: record a single screen capture, then post the same
clip to r/Astronomy and r/WebGPU (the per-sub drafts in
`docs/superpowers/plans/2026-05-05-outreach-and-promotion/posts-and-emails/`
both say video has +14 to +17pp lift over still-image / link posts).

Secondary use case: ship as a scaffolding for a future "named tour
presets" UI feature, but that UI is explicitly out of scope here.

## Decisions made so far

### Scope: minimal feature exposed via URL flag, UI polish later

Build a single named tour as a hard-coded script with a clean
tour-engine API. Expose via `?tour=default`. UI / settings / preset
library punted to a later plan. Captures the recording need now without
painting the design into a corner — the engine's API can grow into a
preset library later without throwing it away.

Estimated lift: ~1 day of focused work on top of the existing camera
tween + (probably) the MSDF labels plan + (probably) the Milky Way
impostor.

### Narrative: local-to-cosmic — Milky Way → M31 → wide cosmic-web view

Open zoomed in on the Milky Way (showcases the custom impostor shader
the user wants to feature; "you are here" label fits naturally if the
labels plan is in by then). Slow pull-out, then fly to Andromeda for a
familiar second beat. End wide on the SDSS wedge / Sloan Great Wall
structure.

Familiar → stranger arc — works for both r/Astronomy (recognisable +
structural) and r/WebGPU (LOD + scale + 2M+ instanced points on
screen at the wide-view climax).

## Decisions still pending (resume from here)

The brainstorm was interrupted after the narrative question. The
remaining gates are:

1. **Camera rotation during a fly leg.** Three options surfaced:
   - Smoothly rotate to face destination as it flies (slerp from
     starting orientation to "looking at next target" over the leg
     duration). Recommended — feels cinematic / human, like a slow
     head-turn while walking.
   - Snap-rotate to face destination, then dolly in. Simpler to
     implement; can feel jarring.
   - Author-tuned cinematic curve per leg (hand-picked start/end
     orientation per leg). Most polish; fights the minimal-feature
     scope.

   This question matters because the user explicitly flagged that the
   browser-nav `#target=` flow does NOT rotate toward the target (and
   shouldn't), but the tour mode SHOULD. So the design needs a
   "rotate-on-tour, no-rotate-on-nav" switch on whatever the entry
   point is.

2. **"You are here" label inclusion.**  Depends on the MSDF labels
   plan (`docs/superpowers/plans/2026-05-07-msdf-labels.md`, 13 tasks,
   status pending) being implemented. Three sub-options:
   - Hard dependency: implement labels plan first, then tour. Gives the
     opening Milky-Way beat a textual anchor.
   - Soft dependency: design the tour engine to call into a label API
     if it exists, no-op if it doesn't. Lets either plan ship first.
   - No label: just camera + scene, no text. Smallest scope.

3. **Milky Way impostor inclusion.**  Same shape as the label
   question — the opening beat WANTS the custom shader, but the
   impostor plan (`2026-05-04-milky-way-impostor.md`) status is
   pending too. Either ship the impostor first, or open the tour at
   M31 instead and skip the MW beat.

4. **Per-leg duration / easing curve.**  Total budget is 20-30 s.
   Open question whether each leg is equal-duration or whether the
   pull-out (leg 1) gets more time than the M31 fly (leg 2) etc.
   Easing is presumably ease-in-out cubic (matches existing
   `cameraTween`), but worth confirming for the dwell/transition
   feel.

5. **Tour-engine API shape.**  `start(name)` / `stop()` / `tick(now)`
   on a singleton? Or a state object the engine holds and ticks
   like the existing tween? Whatever the shape, it has to integrate
   with the existing render-on-demand scheduler — the loop must keep
   ticking while a tour is running, same way it does for an
   in-flight `cameraTween` and autoRotate.

6. **What does Tab-hidden UI actually mean for this mode?** If the
   tour autoplays on `?tour=default`, should the UI auto-hide on
   start? Or rely on the user pressing Tab manually as today?
   Auto-hide is friendlier for the recording flow, but coupling
   tour-mode to UI-hide adds a side effect.

## Existing infrastructure this would build on

- **`src/services/camera/cameraTween.ts`** — pure tween state machine
  for orbit target / distance / yaw with shortest-arc and ease-in-out.
  Single in-flight tween policy (starting a new one snapshots current
  state). The tour-engine probably builds a queue of these, one per
  leg, advancing to the next when the current returns "done".
- **`src/services/camera/orbitCamera.ts` + `orbitControls.ts`** — the
  camera the tween drives.
- **Existing `#target=` deep-link flow** — already works for
  user-driven nav. Tour mode is a separate entry point and must NOT
  hijack that flow.
- **MSDF labels plan (`2026-05-07-msdf-labels.md`)** — pending; would
  supply the "you are here" overlay if we choose to depend on it.
- **Milky Way impostor plan (`2026-05-04-milky-way-impostor.md`)** —
  pending; would supply the opening beat's hero visual.
- **Famous-galaxy command palette (Cmd+K)** — already maps names like
  M31, M51, etc. to coords. The tour script can reuse the same name
  → target lookup rather than hard-coding coords.
- **Render-on-demand scheduler** — `engine.ts` re-schedules frames
  while `autoRotate || currentTween || hasAnyAxis ||
  queue.inFlightCount > 0 || recent-fade` is true. Tour mode adds
  another truthy condition to that gate.

## How to resume

Pick up the brainstorm at decision (1) above (camera rotation during
fly). Walk through (2)-(6) in order. Then proceed to "propose
approaches" → "present design" → write a real spec doc that replaces
this one (or rename this from `-design.md` to `-spec.md` once it's
locked).

Touch points to check before resuming:

```bash
# Has the MSDF labels plan progressed?
git log --oneline --all -- docs/superpowers/plans/2026-05-07-msdf-labels.md

# Has the Milky Way impostor landed?
ls src/services/gpu/milkyWayRenderer.ts 2>/dev/null
grep -r MilkyWayRenderer src/services/engine/engine.ts 2>/dev/null

# What does cameraTween actually tween today (the user's "rotate
# toward target" claim hinges on this)?
head -80 src/services/camera/cameraTween.ts
```
