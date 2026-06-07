# Mobile info-card bottom sheet — design

**Date:** 2026-06-07
**Status:** Awaiting review
**Scope:** The selected-target info card on mobile (< 768 px). Desktop is untouched.

## Problem

On a phone, selecting a galaxy or structure makes the info card cover most of
the screen — including the galaxy/structure it describes, which renders in the
centre. The card is `position: fixed` top-right with `max-width: 320px` and **no
mobile media query** (`DetailCard.module.css:22`, `InfoCard.module.css:17`), so
at a 360–390 px viewport it spans ~85 % of the width and runs the full height of
the content. The user reads the data but loses sight of the thing.

A second, related complaint — the three bottom-left panels (Settings / Stats /
Navigation) overrunning the bottom-right scale bar — is **out of scope here** and
captured as a gated fast-follow (see the last section).

## Goals

- On mobile, a selected galaxy/structure stays **visible** — the card no longer
  covers the centre.
- The full detail set is still **one gesture away**.
- The scale bar no longer sits under the card.
- **Desktop (≥ 768 px) is byte-for-byte unchanged** — same top-right card, same
  panels, same behaviour.
- Reuse the existing `GalaxyDetailCard` / `PoiDetailCard` bodies; don't fork a
  parallel mobile card with its own drifting content.

## Non-goals

- The Settings/Stats/Navigation panel launcher (fast-follow, gated on an
  entanglement-radar pass over `SettingsPanel`).
- Any change to what data the card shows, or to `galaxyInfoBuilder`.
- Live re-layout on orientation change beyond what CSS media queries give for
  free (the existing one-shot `initialMobile` sample stays as-is).

## Chosen direction — bottom sheet (Option A)

Selected via the visual-companion brainstorm. On mobile the card becomes a
**bottom sheet** with two states:

| State | What shows | When |
| --- | --- | --- |
| **Collapsed (peek)** | Grab handle, name + survey badge, one line `<distance> · <lookback> ago` (galaxy) / `<category> · <distance>` (structure). ~2 lines tall. | Default the moment something is selected. The object stays in view above. |
| **Expanded** | The full existing detail-card body, scrolling internally, capped so the sky still peeks at the top (~75 vh). | After the user drags/taps the sheet up. |

### Peek content (decided: minimal)

- **Galaxy:** `displayName` + `sourceLabel` badge, then `formatDistance(distanceMpc) · lookbackGyr Gyr ago`.
- **Structure:** `name` + category-label badge, then `category · formatDistance`.

Everything else (thumbnail, cosmology lines, catalogues, redshift, diameter, the
existing "More details" fold) lives in the expanded state. The peek is the
**top slice of the same card** revealed by the sheet's collapsed snap — not a
separate component — so there is no second copy of the headline to keep in sync.

### Gesture (decided: drag, via CSS scroll-snap)

The drag is a **scroll-snap bottom sheet** — pure CSS for the gesture:

- The sheet lives in a `position: fixed; inset: 0` vertical scroll container with
  `scroll-snap-type: y mandatory` and two snap children: **peek** and
  **expanded**.
- Dragging the sheet is native touch scrolling; the browser owns the momentum
  and the snap. No JS for the gesture.
- A transparent spacer fills the area above the sheet with `pointer-events:
  none`, so taps/drags on the sky still reach the canvas; only the sheet itself
  has `pointer-events: auto`.

**The one piece that is not pure CSS:** when the user selects a *different*
object (and on the ✕ close), the container must scroll back to the peek snap.
That is a ~3-line `useEffect` keyed on the selected target's identity calling
`ref.scrollTo({ top: peekOffset })`. Selection is already React state, so this
adds no new state — only a reset. (If we ever want *zero* JS, the fallback is a
`<details>` tap-toggle with no drag; we are not taking that.)

### Hover on mobile

Touch has no hover, so on mobile the sheet renders **only `selected`**. The
compact hover preview (`CompactCard` / `CompactPoiCard`) and the stacked-pair
layout are desktop-only and are suppressed below the breakpoint. `InfoCard`
already returns null when nothing is selected; the mobile branch simply ignores
`hovered`.

### Scale bar

When a sheet is present on mobile, the scale bar lifts to sit **above** the
collapsed peek (it is irrelevant while reading details and is allowed to be
covered when the sheet is expanded). Implementation: the UI-stack root already
knows selection state in React; it carries a class (e.g. `hasSelection`) that a
mobile-only media rule reads to raise the scale bar's `bottom` offset by the peek
height. No new state, no JS measurement.

## Component / contract changes

- **`InfoCard.tsx`** — add a mobile branch. Above the breakpoint: today's
  stack, unchanged. Below it: a `MobileSheet` wrapper around the single
  `GalaxyDetailCard` / `PoiDetailCard` for `selected`, with `hovered` ignored.
  Layout switches via CSS media queries wherever possible; JS reads the
  breakpoint (via `matchMedia`) only for what CSS can't do — choosing the
  mobile render branch and the scroll-reset. The plan decides whether that read
  is a new `useIsMobile()` hook or a reuse of the existing `initialMobile`
  sample.
- **New `MobileSheet` component + CSS module** — the scroll-snap container, the
  spacer, the grab handle, the peek/expanded snap children, and the
  scroll-reset effect. Contains a detail card as its child; knows nothing about
  *which* card.
- **`DetailCard.module.css`** — a mobile media block that, inside the sheet,
  reorders/restyles so the card's top is exactly the peek (headline + a single
  compact distance line) and the remainder flows below the expanded snap line.
  No desktop rules change.
- **`App.module.css` + the UI-stack root** — the `hasSelection` class hook and
  the mobile scale-bar offset rule.

No changes to `GalaxyInfo`, `galaxyInfoBuilder`, the engine, or any data path.

## Testing strategy

- **Unit (jsdom + Testing Library):** `InfoCard` renders only the selected
  sheet on mobile and ignores `hovered`; renders today's stack on desktop.
  Drive the breakpoint by mocking `matchMedia`. Assert peek content (name,
  badge, the single distance line) is present and that "More details" reference
  rows are in the DOM (the scroll-snap reveal is CSS — we assert content
  presence, not pixel position, matching the existing
  `InfoCard.poiHover.test.ts` philosophy of testing rendered text, not class
  fragments).
- **Reset effect:** changing the `selected` target calls `scrollTo` on the
  container ref (spy).
- **Desktop parity:** existing `InfoCard` tests stay green unchanged — the
  desktop branch must be untouched.
- **Visual:** manual check on the dev server at a phone width (the gesture and
  snap are browser-native and not unit-testable).

## Risks / open questions

- **`pointer-events` passthrough vs. the canvas' `touch-action: none`.** Need to
  confirm on a real device that dragging the sheet scrolls it while dragging the
  sky still orbits the camera. Mitigation: the spacer is `pointer-events: none`;
  only the sheet captures touch.
- **Peek height as a CSS constant.** The scale-bar lift and the peek snap both
  depend on the peek height; it should be one token, not two literals, to avoid
  drift.
- **`useIsMobile` vs. pure CSS.** Prefer CSS media queries for layout; use JS
  only for the scroll-reset and the `hasSelection` hook. The plan should resist
  introducing a JS `isMobile` branch where a media query suffices.

## Fast-follow (gated, not part of this spec)

Collapse Settings / Stats / Navigation behind a single `⚙` launcher on mobile,
sharing a "utility row" with the scale bar so they stop overrunning it. **This is
gated on an entanglement-radar review of `SettingsPanel`** — it is likely tangled
(value × place mirror state, a god-panel of independent toggles), and we want to
un-braid it before bolting on a mobile presentation. Separate spec + plan after
that review.
