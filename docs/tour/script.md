# Tour — script

**"The Long Way Out" — "From home to the edge, and back."**

Full narrated powers-of-ten tour, ~2½ min. Overview + index into the
per-stage files (`stages/NN-<slug>.md`). See `goal.md`, `cinematography.md`,
`writing-style.md`, `graphic-design.md`.

## Arc

**title → home → neighbourhood → structure → flows → emptiness → deep field
→ edge → home again.** Familiar to vast, then a fast return to where we
started. Through-line out is an almost-monotonic logarithmic pull-back, broken
by lateral motion (the groups flythrough, the cosmic-web section). Its
centrepiece is the **cosmic-web triad — web → flows → voids**: fullness, the
currents that feed it, and the emptiness they drain — one idea in three beats.
The tour **ends where it began** (the Milky Way) so the viewer is oriented to
explore. Each hero object gets a small local orbit for dimensionality. Every
stage shows on-screen text.

## Stages

| # | Stage | File | Focus / dist | Motion | Travel+dwell |
|---|---|---|---|---|---|
| 00 | Opening title | [`00-opening-title.md`](stages/00-opening-title.md) | Milky Way, ~0.05 Mpc | held / drift | 0+8 s |
| 01 | You are here | [`01-you-are-here.md`](stages/01-you-are-here.md) | Milky Way, ~0.05 Mpc | local orbit | 3+7 s |
| 02 | Nearest neighbour | [`02-nearest-neighbour.md`](stages/02-nearest-neighbour.md) | M31, ~0.8 Mpc | log dolly + lean | 7+7 s |
| 03 | Our neighbourhood | [`03-our-neighbourhood.md`](stages/03-our-neighbourhood.md) | local groups, ~4 Mpc | lateral flythrough | 9+5 s |
| 04 | The nearest cluster | [`04-nearest-cluster.md`](stages/04-nearest-cluster.md) | Virgo, ~16 Mpc | log dolly + orbit | 7+7 s |
| 05 | The cosmic web | [`05-cosmic-web.md`](stages/05-cosmic-web.md) | Coma SC, ~90 Mpc | log dolly + orbit reveal | 9+9 s |
| 06 | Cosmic flows | [`06-cosmic-flows.md`](stages/06-cosmic-flows.md) | flow basin, ~80 Mpc | lateral reframe + reveal | 5+9 s |
| 07 | The emptiness | [`07-emptiness.md`](stages/07-emptiness.md) | Boötes void, hold scale | lateral drift | 6+5 s |
| 08 | The deep field | [`08-deep-field.md`](stages/08-deep-field.md) | quasar shell, ~2,000 Mpc | big log dolly | 8+4 s |
| 09 | The edge | [`09-the-edge.md`](stages/09-the-edge.md) | horizon, ~6,000+ Mpc | log dolly to max | 9+8 s |
| 10 | Home again | [`10-home-again.md`](stages/10-home-again.md) | Milky Way, ~0.05 Mpc | inward log dolly to start | 8+5 s |

**Total ≈ 2½ min.** Tune timings per file; this table is regenerated from them.

## Stage front-matter schema

```yaml
stage:        2                  # ordinal → sequence order
id:           nearest-neighbour  # stable kebab slug
title:        Nearest neighbour  # ON-SCREEN stage title
narration:    >                  # ON-SCREEN narration (1–2 lines)
  Andromeda — the nearest big galaxy to ours, and falling toward us.
focus:        famous:m31         # symbolic target (union below)
distance_mpc: 0.8                # framing distance (world units ≈ Mpc)
motion:       log-dolly+lean     # camera character for travel + arrival
travel_s:     7                  # seconds to reach this stage (0 = held open)
dwell_s:      7                  # seconds held; floored by reading time
effects:      []                 # engine toggles on entry (may animate)
requires:     [log-dolly, lateral-focus, caption]   # primitive tags → engine spec
status:       draft
```

Body below front matter = director's notes (intent, exact move, on-screen,
effect timing, tweaks). Front matter is the machine-ingest surface.

`focus` union: `milkyWay` · `home` · `famous:<id>` · `structure:<id>` ·
`point:<x>,<y>,<z>`.

`requires` tags collated across stages = the primitive checklist
(`cinematography.md`). Keep honest.

## Pass-through vs stop

`dwell_s: 0` = **pass-through** (camera bends through at constant speed, no
text). `dwell_s > 0` = **stop** (eases in/out, holds text). Drives the
Catmull-Rom control-point handling.

## Text layers

- **Stage text** — `title` + `narration`, screen-anchored, fades in on
  settle, out before next move. The narration layer.
- **Diegetic labels** — world-anchored names the engine already renders
  (famous galaxies, structures, "You are here") when their category is on.
