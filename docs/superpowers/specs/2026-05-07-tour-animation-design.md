# Tour animation — design (brainstorm, grounded 2026-06-04)

> **Status: brainstorm, partially resolved.** Started 2026-05-07 during the
> outreach work (the trigger was needing a 20-30 s screen capture for
> r/Astronomy and r/WebGPU; the existing sub-second focus tween produces
> hard cuts that don't read as cinematic). Brainstorming was paused after
> two decisions.
>
> **Re-grounded 2026-06-04 against the current codebase.** Two of the six
> open decisions (labels, Milky Way impostor) have been answered by code
> that has since shipped; several new subsystems now exist that this tour
> should showcase. The "open decisions" and "infrastructure" sections
> below have been rewritten to reflect what is actually available today.
> The companion **stub tour** (`../plans/2026-05-20-splash-screen-02-stub-tour.md`)
> ships a rough-cut version from the splash's Tour button, built as an
> engine-side seed (`engine.tour` + `tourSubsystem` + the `TourBeat` data
> model). This spec is the polished cinematic tour that **extends that
> seed** — richer beats, rotation, captions — rather than replacing it.

## What it is

A "guided tour" mode for skymap: the camera flies through a scripted
sequence of targets, narrating a powers-of-ten scale story (familiar →
neighbour → cosmic structure → the observable horizon) over 30-60
seconds. Triggered by URL flag for now (e.g. `?tour=default`), not
exposed as visible UI.

Primary use case: record a single screen capture, then post the same
clip to r/Astronomy and r/WebGPU (the per-sub drafts in
`docs/superpowers/plans/2026-05-05-outreach-and-promotion/posts-and-emails/`
both say video has +14 to +17pp lift over still-image / link posts).

Secondary use case: ship as scaffolding for a future "named tour
presets" UI feature, but that UI is explicitly out of scope here.

## Decisions made so far

### Scope: minimal feature exposed via URL flag, UI polish later

Build a single named tour as a hard-coded script with a clean
tour-engine API. Expose via `?tour=default` (the `?tour=` key is already
registered as a deep-link in `src/utils/url/hasDeepLink.ts` and already
bypasses the splash — but nothing consumes it yet). UI / settings /
preset library punted to a later plan. Captures the recording need now
without painting the design into a corner — the engine's API can grow
into a preset library later without throwing it away.

Estimated lift, re-scoped 2026-06-04: ~1 day. The two heavy dependencies
the original estimate hedged on ("probably the labels plan, probably the
Milky Way impostor") have both shipped, and the tour-engine itself
(`engine.tour` + `tourSubsystem` + the `TourBeat` data model) is delivered
by the Part-2 stub seed. So the cinematic-only remaining work is: rotation-
toward-target interpolation (decision 1, the one genuinely-new build), the
per-beat caption producer (decision 2b), a richer beat list reaching the
cosmic-web + horizon (decision 3), and per-leg timing/easing polish.

### Narrative: powers-of-ten ladder — Milky Way → Local Group → cosmic web → horizon

Open zoomed in on the Milky Way (the procedural impostor at the world
origin, now shipped and on by default; the "You are here" marker
auto-renders inside ~2 Mpc). Slow pull-out, fly to the Local Group
(Andromeda / M31), step out through the Local Volume galaxy groups
(M81, Cen A — the nearest neighbours at 3-4 Mpc, an intermediate rung
between "our galaxy" and "the nearest big cluster"), then climb the
scale ladder through a nearby cluster (Virgo), out to the cosmic-web
structure (Coma supercluster with filaments + the MCPM density volume),
and finish wide with the milliquas quasar shell fading toward the
observable-universe horizon shell.

Familiar → stranger → vast arc — works for both r/Astronomy
(recognisable → structural → cosmological) and r/WebGPU (LOD + scale +
2M+ instanced points, a raymarched density volume, and an analytic
horizon shell all on screen at the climax). The full target palette is
listed under "Showcase palette" below; the exact beat list and per-beat
timing are decisions 3 and 4.

## Decisions resolved since 2026-05-07

These were open in the original brainstorm and have since been answered
by shipped code. They are recorded here so the resume session doesn't
re-litigate them.

### ✅ "You are here" label + Milky Way impostor — both shipped

The original decisions 2 and 3 hedged on two then-pending plans. Both
landed:

- **MSDF labels shipped.** `src/services/gpu/renderers/labelRenderer.ts`
  draws world-anchored MSDF text; a per-frame `labelDirectorSubsystem`
  (`src/services/engine/subsystems/labelDirectorSubsystem.ts`) merges
  labels from registered producers and runs screen-space declutter.
- **"You are here" auto-renders.** `youAreHereSubsystem`
  (`src/services/engine/subsystems/youAreHereSubsystem.ts`) emits a
  white "You are here" MSDF label + connector line at the world origin,
  fading in over the ~0.6-2.0 Mpc camera-distance band. It is automatic
  and read-only — no enable/disable, no text override.
- **Milky Way impostor shipped.** `milkyWayRenderer.ts` draws a
  procedural spiral galaxy at the origin; on by default
  (`DEFAULT_MILKY_WAY_ENABLED = true`). Toggle via
  `engine.milkyWay.setEnabled(boolean)`.

**Consequence for the tour:** the opening Milky-Way beat is "free" — the
hero visual and the "you are here" anchor both render with no tour-side
work. The tour just has to put the camera in the fade band.

## Decisions still pending (resume from here)

### 1. Camera rotation during a fly leg — STILL OPEN, the one real build

This is the only beat-to-beat motion question that requires new engine
code. The focus tween today
(`src/services/camera/cameraTween.ts` + `src/services/engine/camera/tweenManager.ts`)
interpolates orbit **target (xyz), distance, yaw, and pitch** with
ease-out-cubic over `FOCUS_TWEEN_MS = 600` ms, single-in-flight (starting
a new tween snapshots current state). There is **no separate
rotation-toward-target slerp** — orientation change is whatever the
yaw/pitch channels happen to do between the two endpoints. Options:

- **Reuse the existing yaw/pitch tween, longer duration.** Cheapest:
  the tour just issues `focusOn`-style tweens with a tour-specific
  (longer) duration. Rotation "comes along for free" but isn't authored —
  it's the shortest-arc yaw + scalar pitch interpolation. May read as a
  slightly mechanical orbit-swing rather than a cinematic head-turn.
- **Add an authored look-at slerp per leg.** Smoothly rotate to face the
  destination as the camera flies. Most cinematic ("slow head-turn while
  walking"), but requires a new tween channel or a per-leg orientation
  keyframe.
- **Author-tuned cinematic curve per leg.** Hand-picked start/end
  orientation per leg. Most polish; fights the minimal-feature scope.

This question matters because the user explicitly flagged that the
browser-nav deep-link flow (`#focus=` / `#poi=`, see
`src/hooks/useUrlSync` wiring in `App.tsx`) does NOT rotate toward the
target (and shouldn't), but the tour mode SHOULD. So the design needs a
"rotate-on-tour, no-rotate-on-nav" switch on whatever the entry point is —
the tour engine drives the camera through a path that the standard
`camera.focusOn` does not.

### 2. Per-beat captions — NEW sub-question (labels exist, captions don't)

Labels shipped, but they are produced **declaratively per frame** by
registered producers; the public `engine.labels` handle exposes only
per-category visibility toggles (`setCategoryLabelVisible`,
`setCategoryMarkerVisible`) — there is **no API to push an arbitrary
one-off caption** like "Virgo Cluster — the nearest big cluster". Two
sub-options:

- **(2a) Lean on auto-rendered structure/famous names only.** When the
  tour focuses Virgo / Coma / the Boötes void, their names render
  automatically *if* the structure is `featured` and its category labels
  + markers are visible (gates in
  `src/services/engine/presentation/produceStructureLabels.ts`). Famous
  galaxies render via `produceFamousLabels`. Zero new code; no editorial
  caption copy.
- **(2b) Add a `tourCaptionSubsystem` producer.** A new `LabelProducer`
  registered alongside youAreHere/structure/famous that reads the active
  tour beat's `caption` (the field already exists on `TourBeat` — it's the
  wired seam) and emits a styled caption (screen-anchored or
  world-anchored), fading in/out with beat transitions. This is the
  "narration text" the original brainstorm wanted. It is a contained
  piece of work — one producer reading the `tourSubsystem`'s current beat —
  because the director/declutter/GPU-upload pipeline and the `caption`
  contract already exist. Recommended for the cinematic version; it's what
  turns "camera moves" into "narrated tour". (To read the current beat,
  the `tourSubsystem` needs to expose it — a small `currentBeat()` getter
  added when this lands.)

### 3. Beat list + per-leg duration / easing

Total budget 30-60 s (longer than the original 20-30 s now that the
ladder reaches the cosmic web + horizon). Open whether each leg is
equal-duration or weighted (the opening pull-out and the final
horizon-reveal probably want more dwell than the mid-ladder cluster
hops). Easing is presumably ease-out-cubic to match the existing tween,
but the cinematic version may want ease-in-out per leg for a softer
departure. The candidate beat list draws from the Showcase palette
below; locking it is part of this decision.

### ✅ 4. Tour-engine API shape — RESOLVED by the stub seed

Settled by the Part-2 plan (`../plans/2026-05-20-splash-screen-02-stub-tour.md`),
which the cinematic tour extends rather than replaces:

- **`engine.tour` sub-handle** — `start(beats): Promise<void>` / `stop()` /
  `isActive()`. `start` resolves when the tour ends (the engine has no
  tween-completion promise, but `fades.fadeTo()` returns one — same
  precedent).
- **`tourSubsystem`** — a frame-driven subsystem (mirrors `tweenManager`
  and `clusterFocus`) that owns beat sequencing; `advance(nowMs)` is
  ticked once per frame, and `|| state.subsystems.tour.isActive()` is
  added to the `stillAnimating` reschedule gate
  (`src/services/engine/frame/runFrame.ts:502-509`) so frames keep
  flowing through each dwell.
- **`TourActions` port** — the subsystem affects the world only through an
  injected adapter (`focus` / `applyEffect` / `snapshot` / `requestRender`),
  keeping the sequencing core pure + unit-testable with a fake clock.
- **Beat data structure** — `TourBeat { id, focus, dwellMs, effects?,
  caption? }`, with symbolic `TourFocus` and a generic `TourEffect` delta
  union. The cinematic tour adds richer beats (volume / source / group
  effects) with **no change to the shape**, weights legs via per-beat
  `dwellMs`, and feeds captions via `caption` (decision 2b).

The only piece the cinematic tour still has to *build* on top of this seed
is decision 1 (rotation-toward-target).

### 5. UI auto-hide on autoplay — pattern now exists

The stub tour already establishes the pattern: an `App.tsx` `tourActive`
state forces `uiHidden` while the tour runs and arms window-level
input listeners that cancel on any pointer/key event. The cinematic
tour can reuse that exact coordination. The only open part is whether
`?tour=default` autoplay should auto-hide on load (friendlier for the
recording flow) — recommended yes, since the recording use case is the
whole point.

## Showcase palette (what the cinematic tour can now visit / toggle)

Everything here is shipped and scriptable from the engine handle today,
unless noted. These are the new building blocks the original brainstorm
predates — the climb-the-scale-ladder narrative leans on them.

- **Milky Way impostor** — `engine.milkyWay.setEnabled(bool)`; on by
  default. Origin hero visual for beat 1.
- **"You are here" marker** — automatic, fades in within ~2 Mpc. No
  toggle; just frame the origin.
- **Famous galaxies** — `engine.selection.selectFamous(id)` pins +
  focuses (e.g. `'m31'` for Andromeda). Names auto-label via
  `produceFamousLabels`.
- **Focusable clusters / superclusters / voids** — `StructureRecord`s
  built by `buildStaticAnchorPois()` (`src/data/buildStaticAnchorPois.ts`,
  seed `data/cluster_anchors.seed.json`). Focus via
  `camera.focusOn(structureRecord)` — `FocusableTarget = GalaxyInfo |
  StructureRecord`. Featured anchors include Virgo (`cluster-virgo-m87`),
  Coma supercluster (`supercluster-coma-sc`), and the Boötes void
  (`void-bootes-void`). Names auto-label for `featured` structures with
  category labels + markers on (`engine.labels.setCategoryLabelVisible` /
  `setCategoryMarkerVisible`).
- **Local Volume galaxy groups** — *almost landed* (branch
  `worktree-nearby-galaxy-groups`, ~70% done as of 2026-06-04: the
  `'group'` `StructureRecord` arm, `Source.Group = 15`, soft-green
  markers, focus, and labels are committed; seeding the 16 groups into
  `data/cluster_anchors.seed.json` is the remaining Task 9). Works
  **identically to clusters/SC/voids** — same `StructureRecord` shape
  (no `abell` field, like `VoidRecord`), same `camera.focusOn(record)`,
  same `engine.labels.setCategoryLabelVisible('group', …)`, same
  deep-link (`#poi=group-<id>`). 16 Local Volume groups at 0.4-13.5 Mpc:
  ids like `group-local-group`, `group-m81-group`, `group-cen-a-group`,
  `group-sculptor-group`, `group-leo-triplet`. These fill the awkward
  empty rung between the Local Group beat and Virgo — the nearest
  galaxy neighbourhoods. Use once the branch merges; until then the
  ladder skips straight from M31 to Virgo.
- **Filaments overlay** — `engine.filaments.setEnabled(bool)` +
  `setIntensity(value)`. The DisPerSE cosmic-web skeleton. A natural
  toggle-on for the cosmic-web beat.
- **MCPM cosmic-web density volume** — `engine.volumes` handle:
  `setEnabled('mcpm', bool)`, `setIntensity('mcpm', v)`, plus contrast /
  densityScale / palette / exposure. Default-on, tiered. The raymarched
  density field that makes the cosmic-web beat read as volume, not points.
  (CF-4 dark-matter density `'cf4-density'` is also available,
  default-off.)
- **Milliquas quasar shell** — `Source.Milliquas` (registered source,
  on by default; capped per tier). Toggle via
  `engine.sources.setVisible(Source.Milliquas, bool)`. The far quasar
  population (out to ~4000 Mpc) that populates the deep-field beat.
- **Observable-universe horizon shell** — `horizonShellRenderer.ts`,
  analytic raymarched sphere at `HORIZON_RADIUS_GPC = 14.3`. **No handle
  toggle** — it fades in automatically by camera distance (invisible
  below ~5% of shell radius, full strength past ~40%). The tour reaches
  it simply by pulling the camera far enough out. This is the climax
  visual: the literal edge of the observable universe.
- **Tone-map / exposure / point appearance** — `engine.tonemap`,
  `engine.points` handles, if the tour wants to push exposure or point
  size for dramatic effect during the wide climax. Optional.

## Existing infrastructure this builds on (verified 2026-06-04)

- **Focus tween** — `src/services/camera/cameraTween.ts` (pure tween
  state machine: target/distance/yaw/pitch, ease-out-cubic, shortest-arc
  yaw) + `src/services/engine/camera/tweenManager.ts` (single-in-flight
  policy) + `FOCUS_TWEEN_MS = 600` in
  `src/services/engine/camera/focusTweenDuration.ts`. The tour-engine
  likely drives a queue of these (one per leg) with a tour-specific
  duration, advancing on completion.
- **Camera handle** — `engine.camera`:
  `focusOn(FocusableTarget)`, `focusOnHome()`, `focusOnMilkyWay()`,
  `setAutoRotate(bool)`, `reset()`. (`EngineCameraHandle.d.ts`.)
- **Deep-link flow** — `#focus=` / `#poi=` handled by `useUrlSync`,
  routed to `camera.focusOn`; `?tour=` recognised by `hasDeepLink` but
  not yet consumed. Tour mode is a separate entry point and must NOT
  hijack the no-rotate nav flow.
- **Label director + producers** —
  `labelDirectorSubsystem.registerProducer(...)` is the extension point
  for the optional caption producer (decision 2b). Producers are pure
  `(state, ctx) => { labels, lines }`.
- **Render-on-demand scheduler** — `runFrame.ts` / `renderScheduler.ts`.
  Reschedules while a tween is active (among other conditions). Tour adds
  one more condition.

## How to resume

The brainstorm is unblocked on its two heaviest dependencies. Pick up at
decision 1 (rotation) — it's the only piece that needs new engine motion
code, so settle it first; it drives the tour-engine API shape (decision
4). Then 2b (caption producer — recommended for "narrated"), then 3
(beat list + timing), then 5 (autoplay UI-hide). Then proceed to
"propose approaches" → "present design" → write the real spec /
implementation plan that replaces this doc (or rename this from
`-design.md` to `-spec.md` once locked).

Touch points worth a fresh check before resuming (in case more has
landed):

- Has the **nearby galaxy groups** feature merged to main yet? (As of
  2026-06-04 it's ~70% done on branch `worktree-nearby-galaxy-groups` —
  Tasks 1-7 committed, Task 9 seeds the 16 groups. Once merged, the
  `'group'` rung is available.) Check `StructureCategory` for a `'group'`
  arm and whether `data/cluster_anchors.seed.json` contains group
  entries. Plan: `docs/superpowers/plans/2026-06-04-nearby-galaxy-groups.md`.
- Has anything been wired to consume `?tour=` yet? `grep -rn "tour" src/hooks src/components/App`.
- Does the focus tween still interpolate only target/distance/yaw/pitch?
  Re-read `src/@types/camera/CameraTween.d.ts` — decision 1 hinges on it.
