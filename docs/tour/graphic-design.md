# Tour — graphic design

How the tour's on-screen text looks. It inherits the splash's **film-title
language** so the splash and the tour read as one film: the splash is the
opening credit; each stage is a title card / lower-third in the same system.
Grounded in `src/components/Splash/Splash.module.css` + the tokens in
`src/styles/global.css`. We can refine the splash where the tour's needs
suggest it (see § Refinements).

## Tokens (from `src/styles/global.css`)

| Token | Value | Use |
|---|---|---|
| `--font-family-display` | `Cormorant Garamond`, serif | titles (stage + opening) |
| `--font-family-mono` | `ui-monospace`, SF Mono | eyebrow, narration, hints |
| `--color-fg` | `#e8eeff` | narration body |
| `--color-fg-muted` | `rgba(200,220,255,.85)` | eyebrow, hints |
| `--color-accent` | `#a8d0ff` | hairlines, underline beat |
| `--color-bg` | `#000` | scrim base |

White (`#fff`) for the title itself, matching the splash.

## Layout

Text lives in the **bottom-left** corner — same anchor as the splash
(`left/bottom: 80px`, `max-width ~520px`, desktop). Centre + right stay clear
for the hero visual. Keeping the tour in the splash's corner means launching
the tour reads as the splash *continuing*, not a new surface.

```
┌────────────────────────────────────────┐
│                                        │
│              (hero visual)             │
│                                        │
│   EYEBROW · scale                      │
│   Stage Title                          │
│   ── (accent draw)                     │
│   Narration line one,                  │
│   narration line two.                  │
└────────────────────────────────────────┘
```

## The three text surfaces

1. **Opening / closing card** (stages 00, 10) — the hero title. Serif,
   largest (~64px desktop), optionally centred-left and a touch higher than a
   stage card. Carries the tour title / closing line. The most "credit"-like.
2. **Stage lower-third** (stages 01–09) — the working card. Three stacked
   parts:
   - **Eyebrow** — mono 10px, `0.18em` tracking, uppercase, muted, with a
     32px accent hairline prefix (splash's `.label`). Shows the **scale**:
     `2.5 MILLION LIGHT-YEARS`. Reinforces powers-of-ten without crowding the
     narration.
   - **Title** — `--font-family-display` serif, ~38px, white. The stage
     `title`.
   - **Narration** — mono ~15px, line-height ~1.6, `--color-fg`. The stage
     `narration`. (Slightly larger than the splash's 13px body — it reads
     against a moving scene.)
3. **Diegetic labels** — the engine's world-anchored MSDF names (M31, Virgo,
   void names) keep their **existing** style. They're the diegetic layer; the
   lower-third is the editorial layer. Don't restyle them; the declutter pass
   already keeps them apart, and they sit in a different region than the
   bottom-left card.

## Legibility scrim

Each card carries a localized **radial vignette** at bottom-left (splash's
`.vignette`, `ellipse at 20% 90%`) so text stays legible over both bright
scenes (Milky Way, cosmic web) and dark ones (voids). Keep it **constant**
(always-on, subtle) rather than scene-adaptive — simpler and robust across the
5-decade brightness swing. Centre/right stay undimmed so the hero reads.

## Motion signatures (reuse the splash's)

- **Reveal** — staggered fade-up: each part `translateY(8px)→0`, `opacity
  0→1`, `0.4s ease-out`, eyebrow → title → narration stagger (~80ms).
  Triggered when the stage **settles** (not during travel).
- **Underline beat** — the title's accent draw-line slides out from the
  baseline (splash's `.title::after`, `0→80px`). The splash's "camera
  focusing" signature, per stage — the strongest thread tying every card to
  the opening credit.
- **Exit** — reverse fade (down + out) **before** the next camera move begins.
- All three are the cinematography doc's "text timing" made concrete.

## Progress + exit affordance

- **Progress** — an optional very-low-opacity accent **hairline along the
  bottom edge**, filling over the tour's ~2½ min. Lets the viewer gauge length
  without breaking immersion. Subtle enough to ignore; cut it if it reads as
  chrome.
- **Exit hint** — a faint mono line (`press any key to exit`), bottom-right,
  fading out after ~4s. The tour cancels on any input (per `goal.md`); this
  tells the viewer once, then gets out of the way.

## Reduced motion + mobile

- `prefers-reduced-motion`: no fade-up, no underline draw — text appears
  instantly (mirrors the splash's reduced-motion block).
- Mobile (<768px): full-width bottom column, `left/right: 24px`, title
  ~32px, narration ~14px. Same as the splash's mobile reflow. The exit hint
  becomes `tap to exit`.

## Refinements (where the tour suggests evolving the splash)

- **Shared title primitive.** The opening card (stage 00) and the splash use
  the same bottom-left serif-title-+-eyebrow-+-draw-line treatment. Consider
  factoring that into a shared component so the splash can **dissolve into**
  the tour: the splash title fades, the tour title rises in the *same spot* —
  one continuous credit. Today they're separate components with duplicated CSS.
- **One eyebrow grammar.** Splash eyebrow is `SKYMAP · INTRO`; the tour's is a
  scale (`2.5 MILLION LIGHT-YEARS`). Keep the *form* identical (hairline +
  mono + tracking) so they're visibly the same system.
- **Title-card register.** If the opening/closing cards want to sit centred
  rather than bottom-left, that's a deliberate divergence from the splash —
  decide it consciously; the safe default is to stay in the splash's corner.
