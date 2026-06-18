# Camera-animation spike findings (2026-06-19)

Three throwaway `CameraDriver` spikes were built in the `fly-to-edge-spike`
worktree to record promo clips of the renderer — and, more usefully, to scout
the parked **guided-tour** feature
([`docs/superpowers/specs/2026-05-07-tour-animation-design.md`](../superpowers/specs/2026-05-07-tour-animation-design.md)).
The branch is a capture tool that gets torn down; this doc is the part worth
keeping. **Fold these into the tour when it's built.**

## The spikes

Each is a `{id, priority, isActive, apply}` driver slotted into the reserved
priority-80 "tour" slot, gated by a URL flag, toggled in-app with `g`. They live
in `src/services/engine/camera/*Driver.ts`:

| Gate | Driver | What it does |
| --- | --- | --- |
| `?flyout` | `flyoutDriver` | Log-dolly pull-back from the Milky Way to the observable-universe horizon shell (~29 500 Mpc) with a little yaw drift. |
| `?floworbit` | `flowOrbitDriver` | Seamless orbit with a gentle pitch-sine bob (the "nice effect"). |
| `?flowshow` | `flowShowcaseDriver` | The keeper — a fully choreographed multi-beat "cosmic flows" hero clip that owns BOTH the camera and the scene/layer state. |

## Architecture findings (load-bearing for the tour)

1. **The priority-80 `CameraDriver` is enough to own an entire cinematic
   sequence** — camera *and* scene state — with **zero** edits to `engine.ts` or
   `runFrame`. `runCameraDrivers` already makes the highest-priority active driver
   authoritative, and `stillAnimating` already ORs `drivers.some(d => d.isActive())`
   to keep the loop awake. This confirms the shape the tour plan already assumes.

2. **The driver owns its scene choreography, not `engine.ts`.** Visibility *is*
   part of the timeline — in the showcase the flow field appears two seconds in,
   not at page load — so the same object that runs the clock fires the
   enable/disable. It calls the **same setters the UI uses**
   (`setFlow` / `setVolumesEnabled` / `setFilamentsEnabled` /
   `setGalaxyCatalogLabelEnabled`), never poking settings raw. (This was a direct
   user correction: *"we need all these action calls somewhere in the driver."*)
   Static scene setup runs once at construction; timed beats run on `g`.

3. **Fade through the `FadeRegistry`, never the settings store.** Driving
   `opacityOf({kind:...})` per frame — the flow pass multiplies by
   `opacityOf({kind:'flow'})`, the galaxy draw mask reads
   `opacityOf({kind:'galaxyCatalog', id})` — gives clean cross-dissolves with
   arbitrary durations **and** sidesteps the settings-store in-place-mutation
   staleness bug that was explicitly deferred to "the tour author" (restore /
   applyEffect mutate the store bypassing `setState`, so React stays stale). This
   matches the already-agreed decision that fades stay an explicit bridge, not
   zustand middleware. The layer stays *enabled* the whole time (cube resident,
   ribbons advecting); only its opacity moves.

4. **Log-space distance is mandatory.** Interpolate `ln(distance)` — Eames
   "Powers of Ten" — for uniform decades per second:
   `distance = exp(lerp(ln(D0), ln(D1), ease(t)))`. Lerping raw distance looks
   broken (all the visual change crammed into the last instant).

5. **Don't override values that already have sensible defaults.** The showcase
   originally forced flow `intensity`; we dropped it back to a bare
   `setFlow(state, store, { enabled: true })`. Choreograph *enable + opacity*;
   leave rest values alone.

## Storyboard grammar (≈10 iterations of user feedback)

What actually reads well on screen, in order:

- **A static pre-roll** (the showcase holds the opening pose for 2 s after `g`)
  so the operator can start the screen recorder before anything moves.
- **Ease rotation in from a standstill** — never snap to full angular velocity.
  Integrate the *velocity* per frame so the easing applies to ω.
- **Cross-dissolve** layers (flow in / galaxies out) rather than a hard cut.
- **A dwell mid-pull-back at a meaningful scale** (the Laniakea / Shapley
  neighbourhood, ~300 Mpc): slow down to let the viewer read something, *then*
  speed up again. The dwell *is* the "slow down in the middle."
- **Residual drift + a gentle pitch bob during holds** — a barely-there rotation
  (~1 rev / 4 min) and a slow pitch sine, so a "pause" still has parallax and
  life instead of freezing like a paused video.
- **Everything fades out together to black**, enumerated **per layer** (flow,
  Milky Way, *every* structure marker, *every* label layer) — not a single global
  exposure ramp. The user was explicit: *"no global fade, just everything
  together."*

## Product gap surfaced

**Label declutter flickers under continuous camera motion.**
`labelDirectorSubsystem.declutter()` does a greedy screen-space overlap cull each
frame; under a moving camera, labels pop in and out as the greedy order churns.
For the spikes we added a `?nodeclutter` kill-switch, but the real fix is a
proper **`settings.labels.declutter` toggle** (Settings → Labels → Advanced) plus
hysteresis damping on the cull so a label doesn't flip every frame. Captured in
`docs/BACKLOG.md`. **The tour will hit the same flicker** — worth doing before or
alongside it.

## Operational notes

- **URL gates are read at engine construction**, so changing a gate needs a
  **full reload**, not just HMR.
- A fresh worktree has no `node_modules` (symlink from main) and no
  `public/data/` (run `/link-data`) — otherwise the renderer falls back to the
  synthetic procedural cloud.
- Recording recipe that worked: OBS Studio, 16:9 1920×1080 @ 60 fps, Apple VT
  H.264 hardware encoder, captured on the LG 16:9 secondary display (not the 3:2
  built-in).
