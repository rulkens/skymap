# Interaction Model — entering, navigating, pausing, exiting the cosmic zoom

**Status:** Design.
**Required for:** Every code path that drives or interrupts the tour, and every existing skymap control that must coexist with it.
**Related:** [`../vision/00-product-vision.md`](../vision/00-product-vision.md), [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md), [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md), [`../rendering/02-camera-choreography.md`](../rendering/02-camera-choreography.md), [`./01-information-overlays.md`](./01-information-overlays.md), [`./05-mobile.md`](./05-mobile.md).

This document defines the **behavioral contract** of the cosmic zoom — how it starts, how it ends, what the user can do at every moment, and how it interleaves with the rest of skymap.

The hardest design constraint is not that any single interaction is novel — most controls already exist in skymap. The constraint is that the tour is *temporal* (clock, script, waypoints) while everything else in skymap is *spatial* and stateless. Reconciling those without making the tour feel like a separate app is the whole problem this spec solves.

## 1. Three entry modes

The tour can begin in three distinct ways. Each carries different assumptions about consent and recoverability.

**1.a — User-clicked tour.** The default. After WebGPU is ready and the first tier has loaded, **"Take the tour ▶ (90 s)"** appears in the lower-right canvas corner. Clicking transitions `IDLE → PLAYING`. The only entry requiring explicit consent — satisfies "no surprise autoplay". After the tour ends, the button reappears as **"Replay tour ▶"**.

**1.b — `?tour=auto` (kiosk loop).** Targets the museum-kiosk audience. Boots normally, auto-transitions `IDLE → PLAYING`, waits **5 s** at the default view after script end, then re-enters `PLAYING`. Infinite loop. Ambient UI chrome renders at 0% opacity; entry button is not rendered. **Any user input** cancels autoplay and returns to `IDLE` — a deliberate emergency-out for the operator.

**1.c — `?tour=default` (autoplay once).** Same as `tour=auto` but the loop runs exactly once. After completion the engine returns to `IDLE` and "Replay tour ▶" appears. The embed-friendly mode for blog posts and social shares — a contained experience that does not become a perpetual-motion advertisement on the host page.

## 2. State machine

The tour exposes five mutually-exclusive states. The state lives on the engine handle as `engine.tourState: TourState`.

```ts
export type TourState =
  | 'IDLE'                   // No tour active; full free-fly UI available.
  | 'PLAYING'                // Tour running, camera advancing along script.
  | 'PAUSED'                 // Tour held; camera frozen but user can pan/orbit.
  | 'FREE_FLY_WITHIN_SHELL'  // User abandoned tour mid-shell; data stays loaded.
  | 'EXITING';               // Camera tween-easing back to default wide view.
```

Allowed transitions (every other transition is forbidden and asserted in dev):

```
IDLE ──click "Take the tour"──▶ PLAYING
IDLE ──URL ?tour=auto / ?tour=default──▶ PLAYING

PLAYING ──space──▶ PAUSED
PLAYING ──esc──▶ EXITING
PLAYING ──reaches end of script──▶ EXITING
PLAYING ──any input in tour=auto mode──▶ IDLE  (kiosk emergency-out)

PAUSED ──space──▶ PLAYING
PAUSED ──esc──▶ EXITING
PAUSED ──click "Free fly" or F key──▶ FREE_FLY_WITHIN_SHELL

FREE_FLY_WITHIN_SHELL ──esc──▶ EXITING
FREE_FLY_WITHIN_SHELL ──click "Replay tour"──▶ PLAYING (from script start)

EXITING ──camera tween completes──▶ IDLE
```

`EXITING` is an animation-only intermediate (~1.5 s) so exit-by-`esc` does not feel like a hard cut. A second `esc` is a no-op; the user *can* cancel by dragging, which silently transitions to `FREE_FLY_WITHIN_SHELL`. We considered a sixth `LOADING` state, but per [`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) §7 the orchestrator handles asset stalls by holding the camera and showing a "loading…" indicator without state-machine ceremony.

## 3. Pause behavior — `space` to suspend

Per Principle 4 of the product vision, the tour must invite exploration. When `PLAYING` receives `space`:

- Camera scripted motion halts at the current position. The waypoint scheduler stores `T_pause`.
- Overlay text **does not disappear** — whatever is faded in stays at full opacity; in-flight fades complete normally. The user reads at their own pace.
- A small **"Resume ▶ · Free fly · Exit"** affordance fades in at the lower-third after **1.5 s**. The delay exists because some users hit `space` repeatedly to step-pause through dense beats; flashing the affordance every time would be noise.
- Pan, orbit, and zoom become enabled at full sensitivity. The script's intended camera position is stored separately from the user's exploration camera — the user is exploring around a held frame, not moving the script.

## 4. Resume behavior — `space` to continue

When `PAUSED` receives `space`:

- The engine reads the user's current camera (which may differ from the script's `T_pause` position).
- A **350 ms cubic ease-out tween** interpolates the camera back to the script's `T_pause` position. State transitions to `PLAYING` at tween completion.
- The script clock resumes from `T_pause`. If the next shell's overlay was scheduled within the next 2 s, that fade-in shifts forward to start immediately after the re-easing tween — preventing the "camera arrives but overlay hasn't said anything" gap.
- The resume affordance fades out over 200 ms.

The 350 ms re-ease is short enough not to feel like a scene change but long enough to absorb large pan-distances. We do not scale tween duration with overshoot — predictability matters more than smoothness here.

## 5. Free-fly within shell — `F` key or "Free fly" button

While `PAUSED`, the user promotes exploration into a permanent state by clicking **"Free fly"** or pressing **`F`**. The semantics shift:

- The script clock is **discarded**. Resume is no longer possible without restarting the tour.
- The current shell's data stays loaded; adjacent preloaded shells continue rendering under standard `fadeAlphaAt` rules ([`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md)). If the user free-flies into another shell's range, that shell takes over.
- All standard skymap controls re-enable: orbit, pan, zoom, click-to-select, command palette, search.
- The settings panel **slides back in** from the right.
- Tour overlay text fades out over 600 ms.
- The "Replay tour ▶" button reappears in the lower-right.

Some shells (Local Group, Virgo, Cosmic Web) reward inspection — a user who paused at Virgo might spend 5 minutes on individual cluster members; the tour should not block that. Making free-fly an explicit, button-mediated promotion preserves narrative integrity while honoring curiosity. The state name says "within shell" because the user *enters* it within the active shell — once in free-fly, they can fly anywhere.

## 6. Exit — `Esc` key, returns to wide view

`Esc` is the unconditional escape hatch. Available in `PLAYING`, `PAUSED`, and `FREE_FLY_WITHIN_SHELL`. Always transitions to `EXITING`.

The exit tween (~1.5 s, cubic ease-in-out) tweens the camera to the **default wide-angle view** (the same view skymap shows on first load), fades out tour overlays and chrome-dimming, fades the settings panel and other ambient UI back to full opacity, and at completion transitions to `IDLE`. The "Replay tour ▶" button appears.

`Esc` from `EXITING` is ignored — that produces a spammable double-tap that does nothing visible. The user can still cancel by dragging, but `Esc` is monotonic.

## 7. Skip-to-shell — recommended NO in v1

A "skip to next shell" affordance is **deliberately omitted** in v1:

1. **It cheapens the cinematic.** The tour is 90 seconds. Fast-forward encourages mashing through rather than watching — undermining the "you've never seen these things together at scale" premise.
2. **The engine already handles fast camera moves gracefully** via velocity-aware band widening ([`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) §6). Not exposing skip is purely a UX choice.
3. **The replay button is the relief valve.** A user wanting to "see the cosmic web again" can replay and pause when they get there. Two clicks, not zero. Acceptable.
4. **It avoids exposing the teleport edge case** ([`../rendering/01-shell-transitions.md`](../rendering/01-shell-transitions.md) §8) that we'd otherwise need to test and document.

If post-launch analytics strongly request skip, we add a single right-arrow keybind that triggers the engine's existing teleport path. Re-evaluate after 30 days.

## 8. Idle UI behavior — chrome hiding

While `PLAYING`:

- Cursor hides after **2 s** of no mouse movement; restored by any motion.
- Settings panel slides off-screen-right over 400 ms, beginning at `T+0:00`. It does not return until the tour ends or the user enters `FREE_FLY_WITHIN_SHELL`.
- StatusBar, ScaleBar, NavigationPanel, StatsPanel fade to **0% opacity** over 400 ms and are unmounted from the React tree (not just hidden) so they don't intercept input.
- The **"Press `space` to pause · `esc` to exit"** hint stays at 50% opacity in the lower-third for the first 5 s, then fades. It does not return on subsequent pauses (told once).

While `PAUSED`: cursor reappears. Settings panel does not return (still in tour mode). Resume affordance appears after 1.5 s. During `EXITING`: all chrome fades back in over the exit-tween, finishing exactly at `IDLE`.

## 9. Touch (mobile) interactions

Designed in detail in [`./05-mobile.md`](./05-mobile.md). The relevant subset:

- **Single tap** on the canvas (no drag) toggles `PLAYING` ↔ `PAUSED` — touch equivalent of `space`.
- **Double tap** anywhere exits the tour (`EXITING`) — touch equivalent of `Esc`. Established pattern (YouTube, Netflix).
- **Pinch / spread** while `PAUSED` zooms; **disabled** while `PLAYING` so accidental pinches don't break the cinematic.
- **Single-finger drag** while `PAUSED` orbits; disabled while `PLAYING`.
- **Two-finger drag** while `PAUSED` pans; disabled while `PLAYING`.
- The **"Take the tour ▶"** button is sized to a 44 × 44 pt tap target.

The "no input during PLAYING" constraint exists because mobile users tend to rest fingers on the screen mid-watch. Pause-first-then-drag is one extra tap and matches mobile video conventions.

## 10. Keyboard controls — full reference

| Key | State | Action |
|---|---|---|
| `space` | `PLAYING` | Pause → `PAUSED` |
| `space` | `PAUSED` | Resume → `PLAYING` (via 350 ms re-ease) |
| `esc` | `PLAYING`, `PAUSED`, `FREE_FLY_WITHIN_SHELL` | Exit → `EXITING` → `IDLE` |
| `F` | `PAUSED` | Promote to `FREE_FLY_WITHIN_SHELL` |
| `←` `→` `↑` `↓` | `PAUSED`, `FREE_FLY_WITHIN_SHELL` | Pan camera (existing binding) |
| `+` `=` | `PAUSED`, `FREE_FLY_WITHIN_SHELL` | Zoom in (existing binding) |
| `-` `_` | `PAUSED`, `FREE_FLY_WITHIN_SHELL` | Zoom out (existing binding) |
| `r` | `IDLE`, `FREE_FLY_WITHIN_SHELL` | Reset camera (existing binding) |
| (any) | `PLAYING` in `tour=auto` | Cancel autoplay → `IDLE` |
| (any) | `EXITING` | Ignored |

`F` is the free-fly binding because no existing skymap shortcut uses it (avoiding `Tab` for focus-traversal accessibility). The arrow / `+` / `-` keys are deliberately the *same* bindings the user already knows from free-flying skymap; pause does not re-bind them, it merely enables them.

## 11. Coexistence with existing controls

| Control | `IDLE` | `PLAYING` | `PAUSED` | `FREE_FLY_WITHIN_SHELL` | `EXITING` |
|---|---|---|---|---|---|
| Mouse orbit/pan/zoom | enabled | **disabled** | enabled | enabled | enabled (cancels exit) |
| Click-to-select | enabled | **disabled** | **disabled** | enabled | enabled |
| `SettingsPanel` | visible | hidden | hidden | visible | fading in |
| `NavigationPanel` | visible | hidden | hidden | visible | fading in |
| `StatsPanel`, `StatusBar`, `ScaleBar` | visible | hidden | hidden | visible | fading in |
| `CommandPalette` (Cmd-K) | enabled | **disabled** | **disabled** | enabled | enabled |
| `SearchTrigger` (`/`) | enabled | **disabled** | **disabled** | enabled | enabled |
| `InfoCard` | visible if selected | hidden | hidden | visible | fading in |
| `LoadingBar` | visible if loading | visible @30% | visible @30% | visible | visible |
| Auto-rotate | per setting | **forced off** | **forced off** | per setting (restored) | per setting |

Click-to-select is disabled in `PAUSED` because the InfoCard would compete with the tour overlay; the user promotes to `FREE_FLY_WITHIN_SHELL` to unlock it. `LoadingBar` stays visible across all states because asset stalls during the tour are user-relevant. Auto-rotate is force-disabled because ambient yaw on top of script motion would drift off-script; we restore the user's setting on exit.

## 12. Copy for buttons and tooltips

Frozen here so implementation and copy reviews share a single source of truth:

| Element | Copy | Tooltip |
|---|---|---|
| Tour entry (first time) | `Take the tour ▶ (90 s)` | `A 90-second guided zoom from the Sun to the edge of the observable universe.` |
| Tour entry (after exit/replay) | `Replay tour ▶` | `Restart the cosmic zoom from the beginning.` |
| Pause action — resume | `Resume ▶ (space)` | `Continue from where you paused.` |
| Pause action — free-fly | `Free fly (F)` | `Stop the tour and explore from here.` |
| Pause action — exit | `Exit (esc)` | `Return to the default view.` |
| First-tour hint | `Press space to pause · esc to exit` | (no tooltip) |
| Loading hold caption | `Loading next scene…` | (no tooltip) |
| Tour-complete overlay | `Tour complete · Click "Replay" to watch again, or fly anywhere — drag to orbit, scroll to zoom.` | (no tooltip) |

All copy is sentence-case, no terminal periods on buttons, no emoji. The `▶` glyph is permitted as a universally-legible play affordance. Suffix-binding labels (`Resume ▶ (space)`) make keybindings discoverable from the visible affordance.

## 13. Test criteria

Automated (Vitest, in `tests/services/engine/tour/tourStateMachine.test.ts`):

- Every transition listed in §2 fires given its trigger; no other transition fires.
- `space` from `IDLE`, `Esc` from `IDLE`, `Esc` from `EXITING`, and `F` outside `PAUSED` are all no-ops.
- `?tour=auto` triggers `IDLE → PLAYING` automatically after first-tier load.
- Any input event during `PLAYING` in `tour=auto` triggers `PLAYING → IDLE` within 1 frame.
- Re-easing tween from `PAUSED → PLAYING` reaches script `T_pause` within 350 ms ± 1 frame.
- Forced auto-rotate disable is reversible (saved/restored on entry/exit).
- Settings-panel hidden state correlates precisely with `PLAYING` and `PAUSED`.

Manual (recorded as 60 fps capture):

- Cold-start click; camera dollies in within 100 ms.
- `space` mid-tour at 5 random script times; overlay persists, resume re-eases smoothly.
- `F` from paused; settings panel slides in within 600 ms; InfoCard becomes selectable.
- `Esc` from each of `PLAYING`, `PAUSED`, `FREE_FLY_WITHIN_SHELL`; camera lands at the same default wide view in all three cases.
- Open with `?tour=auto`; loop 3 times; press any key; confirm immediate cancel.
- Open with `?tour=default`; confirm one run, then "Replay tour" appears.
- Touchscreen: tap-pause, tap-resume, double-tap-exit; pinch suppressed during `PLAYING`, live during `PAUSED`.
- Pause during Laniakea; orbit ~90° around M87; resume; camera returns to scripted position over 350 ms.

## 14. Open questions

1. **Should `space` in `FREE_FLY_WITHIN_SHELL` re-engage the tour?** Currently a no-op. **RECOMMENDATION:** keep as no-op; "Replay tour" is the only re-entry. Reconsider if testing shows confusion.
2. **Does `Esc` in `IDLE` retain its existing close-InfoCard meaning?** Yes; the tour spec does not change `IDLE` semantics. Listed so the keybind table is not misread as tour-only.
3. **Browser back/forward during the tour?** **RECOMMENDATION:** treat as `Esc → IDLE`; do not persist tour state in URL or history.
4. **`?tour=default` on a slow connection?** A 30-second blank screen before autoplay is worse than no autoplay. **RECOMMENDATION:** if first-tier load exceeds 8 s, suppress autoplay and show the manual button.
5. **Preserve user's SettingsPanel state across `EXITING`?** **RECOMMENDATION:** snapshot on entry, restore exactly on exit; the tour mutates engine state through a separate channel so user prefs are never overwritten.
6. **Re-trigger the first-tour hint on replay?** **RECOMMENDATION:** show it exactly once per page-load; a refreshed page shows it again.

Resolved answers will be promoted into this spec or into [`../decisions/`](../decisions/) ADRs.
