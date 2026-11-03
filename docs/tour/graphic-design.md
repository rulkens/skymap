# Tour — graphic design

How the tour's on-screen text looks. The narration reads like **film
subtitles**: one line at a time, centred at the bottom, over the live scene.
It keeps the splash's type (Cormorant Garamond + mono label) so the splash and
the tour read as one film. Code: `src/components/TourOverlay/`; tokens in
`src/styles/global.css`.

## Tokens (from `src/styles/global.css`)

| Token | Value | Use |
|---|---|---|
| `--font-family-display` | `Cormorant Garamond`, serif | subtitle lines |
| `--font-family-mono` | `ui-monospace`, SF Mono | beat label, hints |
| `--color-fg-label` | muted | beat label |
| `--color-bg` | `#000` | scrim base |

White (`#fff`) for the subtitle line itself.

## Layout

One position for every beat: a block centred above the transport controls
(`width: min(72ch, 92vw)`; in cinema mode, with no controls, it drops to the
frame's own margin). Centre and top stay clear for the subject.

```
┌────────────────────────────────────────┐
│                                        │
│              (hero visual)             │
│                                        │
│          NEAREST NEIGHBOUR · 03 / 14   │
│   This is Andromeda, the nearest large │
│            galaxy to ours.             │
│              ◂  ▶  ■  ▸                │
└────────────────────────────────────────┘
```

## The two text layers

1. **Subtitles** (every beat) — two parts:
   - **Label** — the beat `title`, mono 10px, `0.18em` tracking, uppercase,
     `--color-fg-label`. With chrome it carries the readout
     (`NEAREST NEIGHBOUR · 03 / 14`); in cinema mode the title alone. It holds
     for the whole dwell.
   - **Line** — one entry of the beat's `lines`, serif 500,
     `clamp(19px, 1.1vw + 8px, 27px)`, line-height 1.3, `text-wrap: balance`,
     at most ~54ch. Lines share one grid cell, so the block never jumps in
     height when they swap.
2. **Diegetic labels** — the engine's world-anchored MSDF names (M31, Virgo,
   void names) keep their own style. They are the scene's layer; subtitles are
   the editorial layer.

## Authoring and timing

- Authors write `caption: { title, lines }`; each line is a phrase-sized
  subtitle, broken where it reads well. Plain text only.
- Lines share the beat's **dwell** (`lineSchedule`): contiguous slices
  weighted by length, with a floor so a short line still holds. Text appears
  as the stage settles; to put words over motion, author the motion as the
  beat's dwell (`neighbourhoodFlythrough`).
- `tests/data/animation/tours/subtitleFit.test.ts` fails when any line gets
  less than `SUBTITLE_MIN_READ_SEC` — lengthen the dwell or re-break the
  lines; never lower the floor.

## Legibility scrim

One **bottom band** (a `linear-gradient` to transparent), always on, so lines
stay legible over bright scenes (Milky Way, cosmic web) and dark ones (voids)
alike. Constant, not scene-adaptive.

## Motion

- Each line fades in (~300 ms, linear ramp) at its slice start and out
  (~300 ms, linear ramp) at its slice end; no slide. Opacity is computed from a
  dwell clock (`useDwellElapsed`) that a timer ticks and the tour's pause
  freezes — not CSS animation delays or rAF, which stall under the recorder's
  virtual time.
- `prefers-reduced-motion`: lines swap with no fade.

## Mobile

At phone width the block spans `92vw`, the line steps down to 19px and wraps
inside it; the label wraps rather than running off-screen.
