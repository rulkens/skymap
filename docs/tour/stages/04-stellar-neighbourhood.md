---
stage: 4
id: stellar-neighbourhood
title: Our stellar neighbourhood
narration: >
  Proxima Centauri, the nearest star after the Sun. Its light travels for
  more than four years to reach us.
focus: body:sun
distance_mpc: 1e-5 # ~30 light-years, the nearest stars in frame
motion: log-dolly + orbit
travel_s: 8
dwell_s: 7
effects: [named stars on]
requires: [log-dolly, clock-to, dwell-drift, caption]
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

## On screen

`Our stellar neighbourhood` + narration on dwell start. Proxima Centauri is in
the famous-star seed, so its label can be the focused subject; the Sun's point
stays visible as the anchor.

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
