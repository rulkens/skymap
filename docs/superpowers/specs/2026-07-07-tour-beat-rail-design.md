# Tour beat rail — vertical dot progress indicator for guided tours

**Date:** 2026-07-07
**Status:** spec — awaiting plan

## Goal

A passive, glanceable answer to "where am I in this tour?" — a vertical dot
rail on the right edge of the viewport, one dot per beat, visible for the
whole run. Today the only whole-tour readout is the `01 / 14` kicker inside
the caption, which is hidden during every establishing fly and absent on
silent beats; the dwell ring on the pause button covers within-beat time
only. Neither shows the shape of the tour — how many beats, where you are,
what's left.

## Decisions (from brainstorming, 2026-07-07)

1. **Orientation only** — no click-to-jump, no time-remaining readout. The
   rail is a position indicator, not a scrubber.
2. **Dot row, not a segmented/proportional strip** — the minimal carousel
   idiom, one dot per beat. Duration information stays out of the rail.
3. **Vertical, right edge** — scrollytelling idiom: top = start,
   bottom = end. Centered vertically.
4. **Current dot is a static marker** — enlarged + accent, no fill sweep,
   no pulse. The pause-button dwell ring already animates within-beat time.
5. **Hover reveals the beat title** (desktop only) — the one interactive
   affordance. Deliberately hover-not-click: cursor stays `default`, no
   handler. If the affordance mismatch ever bothers (hoverable things look
   clickable), click-to-jump is a later two-line addition dispatching the
   same signals the keyboard uses.
6. **Own container, sibling of the overlay** — not folded into
   `TourOverlay`. The rail needs data the overlay never looks at (the beat
   title list) and shares none of the overlay's dwell-timing behaviour, so
   threading props through it would be pure drilling.

## Components

- **`src/components/TourBeatRail/TourBeatRail.tsx`** (+
  `TourBeatRail.module.css`) — purely presentational.

  ```ts
  export type TourBeatRailProps = {
    readonly titles: readonly (string | null)[];
    readonly index: number;
  };
  ```

  Dot count is `titles.length` — no separate `total` prop to keep in sync.
  A `null` title is a silent beat: it still gets a dot, but hover reveals
  nothing.

- **`src/components/containers/TourBeatRailContainer.tsx`** — store
  boundary. Reads `selectTourBeatTitles` + `selectTourBeatIndex`, renders
  the rail. No dispatches (the rail is passive).

- **`App`** mounts the container next to `TourOverlayContainer`, under the
  same `selectTourActive` gate — when mounted, a tour is running, so the
  container does not gate on `active` itself (same contract as the overlay
  container).

## Data

One new selector in `src/state/tour/selectors.ts`:

```ts
export const selectTourBeatTitles: (state: RootState) => readonly (string | null)[];
```

Maps the active tour's beats to `beat.caption?.title ?? null`; empty array
when no tour is active. Because it derives a NEW array, it is the first
selector in the file that must be memoized — a fresh array per call would
make `useAppSelector` re-render the rail on every store dispatch. Use RTK's
`createSelector` over `selectActiveTour`; the tour object comes from the
registry, so its reference is stable for the whole run and the memoization
is exact.

## Visuals

- Fixed column at `right: ~18px`, vertically centered
  (`top: 50%; transform: translateY(-50%)`), `z-index` at the overlay's 90.
- Dots ~5px, gap ~14px. Three states, all in the overlay's existing
  palette so the rail and the dwell ring read as one family:
  - **done** — `--color-fg-label`
  - **current** — enlarged (~8px) + `--color-accent`
  - **upcoming** — `rgba(168, 208, 255, 0.18)` (the ring-track colour)
- Fades in on mount in the `tourReveal` register (0.42s ease-out);
  `prefers-reduced-motion` snaps it in, matching the caption's handling.
- Text shadow as elsewhere in the HUD so the hover label survives bright
  fields.

## Hover behaviour

The column opts back into pointer events (the root overlay layer is
click-through; this adds a ~24px-wide strip where the canvas is not
draggable — same trade the nav buttons make). Hovering a dot reveals that
beat's title to its **left**, in the caption kicker register: 10px mono,
uppercase, 0.18em letter-spacing, `--color-fg-label`. Silent beats reveal
nothing. `cursor: default` throughout; no click handler.

## Visibility

Always on while the tour runs — including establishing flies. The rail is
orientation (like the nav, which never hides), not commentary (like the
caption, which waits for the dwell). No coupling to `dwellNonce`.

## Collisions & mobile

- Right-anchored captions end 44px from the edge; the dots sit inside that
  margin and never overlap caption text. A hover label can transiently
  overlay a right-anchored caption — accepted: it is user-initiated,
  momentary, and self-correcting (move the pointer away).
- On viewports ≤ 768px the rail is hidden entirely (`display: none`):
  captions go full-width there and would run under it, touch has no hover,
  and the caption's `01 / 14` readout still covers orientation on phones.

## Accessibility

The container carries `aria-label="Tour progress: beat N of M"`; the dots
themselves are `aria-hidden` (they visually duplicate the caption readout,
which remains the screen-reader surface).

## Testing

- **Component** (`tests/components/TourBeatRail/`): renders
  `titles.length` dots; the `index` dot gets the current-state class; dots
  before `index` get done, after get upcoming; hover on a titled dot
  reveals the title, hover on a `null`-titled dot reveals nothing; no
  `onClick` on any dot.
- **Selector** (`tests/state/tour/`): `selectTourBeatTitles` returns
  titles with `null` for silent beats; empty array when inactive;
  referentially stable across unrelated state changes (memoization
  holds).
