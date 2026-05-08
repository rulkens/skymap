# Onboarding — first-time visitor flow and the "Take the tour" affordance

This spec covers the moment a new visitor lands on `skymap.rulkens.com` and the first ~30 seconds of their experience, up to and including the entry-point button for the cosmic zoom tour. It also covers the symmetric tail: what happens after the tour completes and the visitor is handed back the controls.

This document is the entry point for the broader onboarding story. Scale-by-scale interaction details live in [`00-interaction-model.md`](00-interaction-model.md); per-shell overlay copy and timings live in [`01-information-overlays.md`](01-information-overlays.md). The tour script being entered into is [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md).

## 1. Goal

A first-time visitor must discover that the tour exists *without* a tutorial, *without* a welcome modal, and *without* reading any documentation. The discovery surface is a single button — the Take-the-tour affordance — and our job in this spec is to make that button findable, clickable, and dismissable in the right ways at the right times.

The success criterion the rest of this document is in service of: a curious-but-impatient first-time visitor (the audience defined in [`../vision/00-product-vision.md`](../vision/00-product-vision.md) §"Who is this for") should click the tour button within their first 30 seconds on the page, *without* anything other than the canvas and the button itself prompting them to do so. We want the universe to be the invitation; the button is just a doorway.

## 2. Pre-tour state

Visitor lands. The page paints the dark canvas immediately (skymap is a single-bundle SPA — there is no white flash). For the first 1–3 seconds, three things resolve in parallel:

1. The WebGPU device adapter request resolves (typically <500 ms on a warm browser, up to 2 s on first WebGPU use in a session).
2. The first tier of points — `2mrs.bin` plus the small tier of GLADE — finishes its R2 fetch and decodes (see `cloudLoader` in `src/services/engine/`).
3. The first frame is rendered. The visitor sees a faint scatter of points already arranged in the rough Local-Volume distribution.

During this 1–3 second window, the visitor sees:

- The dark canvas with a slowly-resolving sprinkle of points as tiers arrive.
- A `LoadingBar` along the very top edge of the viewport (existing component at `src/components/LoadingBar/`), reporting fetch progress.
- *Nothing else.* The `SettingsPanel`, `StatsPanel`, `NavigationPanel`, `ScaleBar`, and `StatusBar` are all collapsed or hidden by default for first-time visitors. (See §8 for which of those is a behavioral change.)

This is intentional: the canvas alone, with no chrome, gives the universe a chance to be the first impression. A new visitor sees the same thing the screensaver-version of skymap shows — quiet, dark, three-dimensional.

## 3. Trigger for showing the "Take the tour" button

The button appears **2.5 seconds after both** of these conditions are met:

- WebGPU device is initialized and the engine's first frame has been submitted.
- The first-tier point cloud (`2mrs.bin` + `glade-small.bin`) is decoded and uploaded to GPU buffers.

The 2.5-second delay is deliberate. It gives the visitor a beat to register *what they are looking at* (a 3D scene, points in space, parallax on the slightest pointer movement) before any UI element competes for attention. Showing the button at frame 1 would make the canvas feel like a backdrop for a button. Showing it at 2.5 s makes the button feel like *an offer*: "you've been looking at this — would you like to know what it is?"

If either of the two readiness conditions never fires (WebGPU not supported, fetch fails), the button does not appear. The fallback path is the existing error handling in `cloudLoader` — out of scope here.

## 4. Button visual design

The button lives in the **lower-right corner of the viewport**, with 24px margin from both edges (matching the existing `StatusBar` margin). It is a single rectangular pill with two text segments:

```
┌──────────────────────────────┐
│  Take the tour ▶   90 s      │
└──────────────────────────────┘
```

- Background: `rgba(0, 0, 0, 0.55)` with 1px border `rgba(255, 255, 255, 0.18)`, 8px corner radius. Mirrors the existing `InfoCard` chrome treatment for visual cohesion.
- Typography: system sans-serif, 14px, weight 500. The "90 s" duration is set in JetBrains Mono at 12px to read as a data readout (per the visual identity rules in `../vision/00-product-vision.md`).
- Icon: a unicode play triangle `▶` between the label and the duration. No SVG, no icon font — keeps the bundle lean.
- Width: hugs content (~180px). Never full-width. The button must feel like a *suggestion*, not a call-to-action banner.

### The first-five-seconds glow

For the first **5 seconds after appearing**, the button has a subtle outer glow that pulses once per second:

- `box-shadow: 0 0 0 0 rgba(255, 240, 200, 0.0)` → `0 0 12px 2px rgba(255, 240, 200, 0.35)` → back, on a 1 s ease-in-out cycle.
- The shadow color is a warm off-white — slightly amber — to read as "starlight" against the dark canvas. Avoid blue-white; that competes with the colors of bright stars in the scene.

After 5 seconds (5 pulses), the glow fades to zero over 800 ms and the button rests in its neutral state. The button stays in neutral state indefinitely until clicked, dismissed, or the visitor leaves.

The pulse is the *only* attention-grabbing element on the screen. We deliberately do not animate the canvas (no auto-rotate during the pre-tour state), do not show a tooltip, do not pop a toast. One quiet pulse, in one corner.

### Hover and focus

On pointer hover or keyboard focus: border lightens to `rgba(255, 255, 255, 0.35)`, background to `rgba(0, 0, 0, 0.7)`. No additional glow on hover — the pulse is for discovery, not for confirmation that the user found it.

## 5. Repeat-visitor detection

We persist a single localStorage key:

```ts
type TourCompletionRecord = {
  completedAt: number;       // unix ms; set when tour reaches the final shell
  completionCount: number;   // increments on each completion
  lastSeenVersion: string;   // tour script version, for re-pulsing on script changes
};
```

Stored under `skymap:tour-completion`. The key being a single record (rather than a boolean) lets us evolve the rules later without a migration — e.g., if the tour script changes substantially, we can re-trigger the pulse for visitors whose `lastSeenVersion` is older.

Behavior matrix:

| Visitor state | Button visible? | Pulse? | Label |
|---|---|---|---|
| First visit, no record | yes | yes (5 pulses) | "Take the tour ▶ 90 s" |
| Returning, completed once | yes | no | "Replay tour ▶ 90 s" |
| Returning, dismissed without completing | yes | no | "Take the tour ▶ 90 s" |
| Returning, completed an older script version | yes | yes (5 pulses) | "New tour ▶ 90 s" |

The "Replay tour" entry is *also* surfaced in the `SettingsPanel` under a new "Guided tour" section, regardless of dismissal state, so a visitor who dismissed the corner button can still find it. The settings entry is the canonical surface; the corner button is the discovery surface.

We use `localStorage` rather than a cookie because the tour state is purely client-side and we have no server. We accept that incognito/private-browsing visitors get the first-time experience every time, which is correct: they *are* a first-time visitor in that browser session.

## 6. Post-tour hint

When the tour completes (camera comes to rest at the wide-angle default view), the corner button transitions in place from "Take the tour ▶ 90 s" to "Replay tour ▶ 90 s" with a 400 ms cross-fade. No celebratory animation; no completion modal.

300 ms after the tour ends, a small overlay fades in at the **bottom-center** of the viewport:

```
Now drag to orbit  ·  scroll to zoom  ·  press / to search
```

- Same chrome treatment as the corner button (dark pill, white border).
- 13px sans-serif. The middle dots are non-breaking, hairline spaces.
- Visible for **5 seconds**, then fades out over 600 ms.
- Dismissable: clicking it, or any pointer down on the canvas, fades it immediately.

The hint is hand-tuned for desktop. On touch devices the copy reads "Now drag to orbit · pinch to zoom · tap a galaxy for details" — the input affordances differ, but the principle (one-line, three-clauses, 5 seconds, dismissable) holds.

This hint is the *only* moment we explicitly tell the user how to interact. We rely on the tour itself to demonstrate camera motion; the hint just hands the controls back.

## 7. Skip-tour escape hatch

A visitor who wants to interact immediately must not be blocked. Three escape hatches, in priority order:

1. **Just touch the canvas.** Any pointer down or wheel event on the canvas during the pre-tour state is treated as "I want to drive." The corner button stays visible (in neutral state — pulse cancelled) but the canvas is fully interactive. The user has implicitly opted out of the tour; the button is now opt-in.
2. **Dismiss the button explicitly.** A small `×` appears on hover at the right edge of the button. Clicking it sets a session-level flag (in-memory only — *not* persisted to localStorage) that hides the button for the rest of the session. The "Replay tour" entry in `SettingsPanel` is unaffected.
3. **Keyboard escape.** If the button has focus, pressing `Esc` dismisses it identically to clicking the `×`.

Notably, *clicking the canvas does not dismiss the button.* Just because a visitor wiggled the camera doesn't mean they don't want the tour — many will explore for 10 seconds, get curious, and then reach for the button. We only fully dismiss on explicit action.

## 8. Coordination with the existing landing experience

This onboarding flow changes a few things about today's skymap shell:

- **`SettingsPanel`, `StatsPanel`, `NavigationPanel`** — currently visible by default — collapse to icon-only triggers in the lower-left corner for first-time visitors. Returning visitors see whatever state they last left the panels in (already persisted via the existing settings store). This is the most visible UI change and is required by the "the canvas alone is the first impression" rule.
- **`StatusBar`** — currently anchored bottom-center — becomes hidden for first-time visitors. It re-appears the first time the user interacts with the canvas, or when the post-tour hint fades out, whichever is earlier.
- **`ScaleBar`** — stays visible. It is the one piece of chrome that makes the dark canvas legible as a 3D scene (it gives spatial reference). Its position shifts to the lower-left corner to keep the lower-right clear for the tour button.
- **`SearchTrigger` / `CommandPalette`** — hidden until first canvas interaction or tour completion. Power-user surfaces should not compete with the discovery moment.

All of the above is gated by the same first-visit heuristic as the tour-button pulse: "no `skymap:tour-completion` record AND no `skymap:has-interacted` session flag."

## 9. Analytics events (planned, not implemented in v1)

We define the event vocabulary now so the implementation in v1 emits no-op stubs that can be wired to a real sink later. The vocabulary:

```ts
type TourAnalyticsEvent =
  | { type: 'tour_button_shown'; pulseEnabled: boolean; visitorState: 'first' | 'returning' | 'dismissed' }
  | { type: 'tour_button_clicked'; secondsSincePageLoad: number }
  | { type: 'tour_button_dismissed'; method: 'click-x' | 'esc' }
  | { type: 'tour_started'; trigger: 'button' | 'url-flag' | 'replay' }
  | { type: 'tour_paused'; shellIndex: number; secondsIntoShell: number }
  | { type: 'tour_resumed'; shellIndex: number }
  | { type: 'tour_completed'; totalSeconds: number }
  | { type: 'tour_exited_at_shell_N'; shellIndex: number; method: 'esc' | 'canvas-interaction' | 'tab-blur' }
  | { type: 'post_tour_hint_dismissed'; method: 'click' | 'canvas-interaction' | 'timeout' };
```

In v1 we ship the emit-call sites with an `analytics` no-op sink. Wiring to a real analytics destination (Plausible is the working hypothesis — privacy-respecting, no cookies) is a separate decision tracked in `../decisions/`.

## 10. Test criteria

Two categories of test, both required before the onboarding flow ships.

### Automated

- Unit test: localStorage round-trip of `TourCompletionRecord`, including missing fields and unknown extra fields.
- Unit test: visitor-state classifier returns the right state for each row of the §5 matrix.
- Component test: the corner button's pulse animation runs exactly 5 cycles and then settles to neutral. Driven by fake timers in `vitest`.
- Component test: dismissing the button with `×` hides it and does *not* write to localStorage.
- Integration test: clicking the canvas during the pre-tour state cancels the pulse but leaves the button visible.

### Usability study

The headline criterion: **≥60% of first-time visitors click the tour button within 30 seconds.** Measured by:

- Recruit five participants matching the "curious first-time visitor" profile (see [`../vision/00-product-vision.md`](../vision/00-product-vision.md) §1). None should be from the team or the science-literate enthusiast cohort.
- Show them `https://skymap.rulkens.com` on a desktop browser. Tell them: "Spend a minute looking at this, then tell me what you think it is." Record the screen and their face.
- Stop the clock when they click the button or when they verbally express confusion / give up.
- ≥3 of 5 should click within 30 seconds. If <3 click, the discovery surface has failed and the spec needs a revision pass before launch.

Secondary: **0 of 5 should dismiss the button to dig into the UI before clicking it.** If a participant goes hunting through `SettingsPanel` looking for "the demo button," the corner button is too quiet — increase the pulse duration or amplitude.

## 11. Open questions

These are deliberate parking lots, not blockers for v1:

1. **Should the pre-tour canvas auto-rotate?** Today's skymap auto-rotates by default. We're proposing it should *not* during the first 2.5 s, to let the visitor focus. But: a still scene may read as "loaded an image, not an interactive thing." Worth A/B testing once we have a measurement surface.
2. **Should the button have a duration label at all?** "90 s" is honest but might read as a commitment. Alternatives: "(short)", a progress-ring icon, no duration. Resolved by user testing.
3. **Mobile/touch placement.** Lower-right is awkward on a phone where the right thumb lives. Mobile spec is its own document; we'll cross-link from here when it lands.
4. **Internationalization.** Copy is English only for v1 (per the product vision's non-goals). When i18n arrives, the button label and post-tour hint are the first strings to extract — they're the only chrome strings on the discovery path.
5. **Re-pulsing on script changes.** §5 proposes re-pulsing returning visitors when `lastSeenVersion` differs from the current tour version. This is a design choice that risks annoying loyal users; alternative is a one-time toast "the tour has been updated." Defer to first script revision after launch.
6. **Kiosk auto-start mode.** The product vision mentions `?tour=auto` for educator/kiosk use. That URL flag bypasses the button entirely and starts the tour after the same 2.5 s readiness gate. Specced separately in the kiosk-mode document (not yet written).
