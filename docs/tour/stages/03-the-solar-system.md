---
stage: 3
id: the-solar-system
title: The Solar System
narration: >
  Sunlight reaches Earth in eight minutes. It takes four hours to reach
  Neptune, the farthest planet.
focus: body:sun
distance_mpc: 4e-10 # ~80 au, Neptune's orbit in frame
motion: log-dolly + lean
travel_s: 8
dwell_s: 8
effects: [orbit trails on]
requires: [log-dolly, lateral-focus, clock-to, dwell-drift, caption]
status: draft
---

## Intent

The third rung. Earth and Moon shrink to a point and the focus leans to the
Sun until the planets' orbits fill the frame. Light time keeps the scale: a
second to the Moon was the last rung, minutes and hours are this one.

## Camera

The enter snaps the clock to `TOUR_NIGHT_SIM_DAYS` (`overSec: 0`), so the
planets sit where they were on 2026-10-10. Log-dolly out from the Earth–Moon
framing while the focus leans from Earth to the Sun; arrive with Neptune's
orbit inside the frame, tilted enough that the orbits read as rings, not lines.
A slow orbit on the dwell.

## On screen

`The Solar System` + narration on dwell start. Orbit trails make the planets
findable at this scale; the Sun's and Neptune's names are the two the caption
needs.

## Caption

```ts
caption: {
  title: 'The Solar System',
  lines: [
    'Sunlight reaches Earth in eight minutes.',
    'It takes four hours to reach Neptune, the farthest planet.',
  ],
},
```

## Sources

- Sunlight to Earth about 8 min 20 s: NASA Space Place, "All About the Sun",
  https://spaceplace.nasa.gov/all-about-the-sun/en/
- Sunlight to Neptune 4 hours, Neptune 30 au from the Sun: NASA Science,
  "Neptune Facts", https://science.nasa.gov/neptune/neptune-facts/
