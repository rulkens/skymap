---
stage: 4
id: stellar-neighbourhood
title: Our stellar neighbourhood
narration: >
  Proxima Centauri, the nearest star after the Sun. Its light travels for
  more than four years to reach us.
focus: none # the stars are named by the star map's captions, not by focus
distance_mpc: 5e-7 # 0.5 pc off a point near Alpha Centauri, looking back at the Sun
motion: turn + log-dolly + lean
travel_s: 12
dwell_s: 7
effects: [named stars on]
requires: [log-dolly, lateral-focus, clock-to, dwell-drift, caption]
status: draft
---

## Intent

The fourth rung, the jump from hours to years. The Solar System collapses into
the Sun's single point and the nearest stars come into view around it. Proxima
Centauri is the one name the caption needs.

## Camera

The enter snaps the clock to `TOUR_NIGHT_SIM_DAYS` (`overSec: 0`) like every
Earth beat, so a skip into this beat lands on the tour date. Log-dolly out from
the Solar System framing (~80 au → ~30 light-years, about four decades) on the
Sun; a slow orbit on the dwell so the near stars parallax against the far ones.

As built: the beat states the ecliptic pole, the date and level roll on entry,
and restates beat 03's target and range so a skip or Prev pulls out from the
orbits. From ~30 light-years Proxima's name lands on Alpha Centauri's, so the
eye ends much closer: half a parsec off a point 80% of the way to Alpha
Centauri, looking back at the Sun, 30° up across the ecliptic toward longitude
110°. The pair sits lower left, the Sun upper right. The view swings under the
ecliptic in the first six seconds, while the range is still small; the target
leans toward Alpha Centauri only once the range passes ~0.05 pc, so the Sun
drifts off the centre instead of leaping. The eye backs past Alpha Centauri,
so the pair sweeps in from the lower left in the last two seconds of travel.

## On screen

`Our stellar neighbourhood` + narration on dwell start. Star captions are not
focus-gated and switch per catalog, so the beat shows
`label:starCatalog:famousStar`: Proxima and Alpha Centauri are named, and so is
every other star-map star in frame (about a dozen: Wolf 359, Lalande 21185,
Ross 128 among the near ones, Capella, Pollux, Procyon and the Plough behind).
The Sun's caption stays on from beat 03.

## Caption

```ts
caption: {
  title: 'Our stellar neighbourhood',
  lines: [
    'Proxima Centauri, the nearest star after the Sun.',
    'Its light travels for more than four years to reach us.',
  ],
},
```

## Sources

- Proxima Centauri is the nearest star to the Sun, about 4.2 light-years away:
  NASA Imagine the Universe, "The Nearest Neighbor Star",
  https://imagine.gsfc.nasa.gov/features/cosmic/nearest_star_info.html
