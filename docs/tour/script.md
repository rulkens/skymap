# Tour — script

**"The Long Way Out" — "From home to the edge, and back."**

Full narrated powers-of-ten tour, ~5 min. Overview + index into the
per-stage files (`stages/NN-<slug>.md`). See `goal.md`, `cinematography.md`,
`writing-style.md`, `graphic-design.md`.

## Arc

**park → Earth → Moon → Solar System → nearest stars → Milky Way →
neighbourhood → structure → flows → emptiness → deep field → edge → home
again.** Familiar to vast, then a fast return to where we
started. Through-line out is an almost-monotonic logarithmic pull-back, broken
by lateral motion (the groups flythrough, the cosmic-web section). Its
centrepiece is the **cosmic-web triad — web → flows → voids**: fullness, the
currents that feed it, and the emptiness they drain — one idea in three beats.
The tour **ends where it began** (Home again lands on Earth) so the viewer is oriented to
explore. Each hero object gets a small local orbit for dimensionality. Every
stage shows on-screen text.

## Stages

| #   | Stage                  | File                                                                  | Focus / dist             | Motion                    | Travel+dwell |
| --- | ---------------------- | --------------------------------------------------------------------- | ------------------------ | ------------------------- | ------------ |
| 00  | The Long Way Out | [`00-the-long-way-out.md`](stages/00-the-long-way-out.md) | Søndermarken, eye 1.7 m | pan west with the setting Sun, tilt up, clock to night | 0+27.5 s |
| 01  | You are here | [`01-you-are-here.md`](stages/01-you-are-here.md) | Earth, ~30,000 km | rise, sky → body → world | 10+7 s |
| 02  | Earth and Moon | [`02-earth-and-moon.md`](stages/02-earth-and-moon.md) | Earth–Moon, ~800,000 km | log dolly + orbit | 8+7 s |
| 03  | The Solar System | [`03-the-solar-system.md`](stages/03-the-solar-system.md) | Sun, ~50 au | turn + log dolly + lean | 10+8 s |
| 04  | Our stellar neighbourhood | [`04-stellar-neighbourhood.md`](stages/04-stellar-neighbourhood.md) | α Centauri side, ~0.5 pc | turn + log dolly + lean | 12+7 s |
| 05  | The Milky Way | [`05-the-milky-way.md`](stages/05-the-milky-way.md) | Milky Way, ~0.05 Mpc | snap far + log dolly + push-in | 7+7 s |
| 06  | Nearest neighbour      | [`06-nearest-neighbour.md`](stages/06-nearest-neighbour.md)           | M31, ~0.8 Mpc            | log dolly + lean          | 7+7 s        |
| 07  | The Local Group        | [`07-local-group.md`](stages/07-local-group.md)                       | Local Group, ~2.5 Mpc    | pull-back + orbit         | 9+14 s       |
| 08  | Our neighbourhood      | [`08-our-neighbourhood.md`](stages/08-our-neighbourhood.md)           | local groups, ~4.5 Mpc   | pull-back + drift         | 0+12 s       |
| 09  | Meeting the neighbours | [`09-meeting-the-neighbours.md`](stages/09-meeting-the-neighbours.md) | famous sweep, ~4 Mpc     | lateral flythrough        | 0+32 s       |
| 10  | The nearest cluster    | [`10-nearest-cluster.md`](stages/10-nearest-cluster.md)               | Virgo, ~16 Mpc           | log dolly + orbit         | 7+7 s        |
| 11  | Laniakea               | [`11-laniakea.md`](stages/11-laniakea.md)                             | Laniakea SC, ~220 Mpc    | two-stage log dolly       | 17+12 s      |
| 12  | The cosmic web         | [`12-cosmic-web.md`](stages/12-cosmic-web.md)                         | Coma SC, ~90 Mpc         | log dolly + orbit reveal  | 9+9 s        |
| 13  | Cosmic flows           | [`13-cosmic-flows.md`](stages/13-cosmic-flows.md)                     | flow basin, ~80 Mpc      | lateral reframe + reveal  | 5+9 s        |
| 14  | The emptiness          | [`14-emptiness.md`](stages/14-emptiness.md)                           | Boötes void, hold scale  | lateral drift             | 6+5 s        |
| 15  | The deep field         | [`15-deep-field.md`](stages/15-deep-field.md)                         | quasar shell, ~2,000 Mpc | big log dolly             | 8+4 s        |
| 16  | The edge               | [`16-the-edge.md`](stages/16-the-edge.md)                             | horizon, ~6,000+ Mpc     | log dolly to max          | 9+8 s        |
| 17  | Home again             | [`17-home-again.md`](stages/17-home-again.md)                         | Copenhagen, 2,000 km     | inward log dolly + descent | 0+27 s       |

**Total ≈ 7 min.** Tune timings per file; this table is regenerated from them.

## Stage front-matter schema

```yaml
stage: 2 # ordinal → sequence order
id: nearest-neighbour # stable kebab slug
title: Nearest neighbour # ON-SCREEN stage title
narration: > # ON-SCREEN narration (1–2 lines)
  Andromeda — the nearest big galaxy to ours, and falling toward us.
focus: famous:m31 # symbolic target (union below)
distance_mpc: 0.8 # framing distance (world units ≈ Mpc)
motion: log-dolly+lean # camera character for travel + arrival
travel_s: 7 # seconds to reach this stage (0 = held open)
dwell_s: 7 # seconds held; floored by reading time
effects: [] # engine toggles on entry (may animate)
requires: [log-dolly, lateral-focus, caption] # primitive tags → engine spec
status: draft
```

Body below front matter = director's notes (intent, exact move, on-screen,
effect timing, tweaks). Front matter is the machine-ingest surface.

`focus` union: `milkyWay` · `home` · `famous:<id>` · `structure:<id>` ·
`point:<x>,<y>,<z>` · `body:<id>` · `sky:<spot>`.

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
