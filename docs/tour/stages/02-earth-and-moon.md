---
stage: 2
id: earth-and-moon
title: Earth and Moon
narration: >
  Thirty Earths would fit in the gap between us and the Moon. Light crosses
  it in just over a second.
focus: none # cleared: the shot is aimed between the bodies
distance_mpc: 1.1e-14 # 340,000 km from a point in the gap, both in frame
motion: log-dolly + orbit
travel_s: 8
dwell_s: 7
effects: []
requires: [log-dolly, clock-to, dwell-drift, caption]
status: draft
---

## Intent

The second rung. Pull back from Earth until the Moon enters the frame, and
make the gap between them felt. Light time starts here and carries the ladder:
a second to the Moon, minutes to the Sun, hours to Neptune, years to the
nearest star.

## Camera

The enter snaps the clock to `TOUR_NIGHT_SIM_DAYS` (`overSec: 0`) and states
the ecliptic pole (the Moon is 4° off the ecliptic). Log-dolly out from the
whole-Earth framing until both bodies sit in frame with the gap between them
readable; a slow orbit on the dwell for depth.

As built (fix round 2, owner ruling 2026-11-06: true sizes): the view is
side-on to the gap and both bodies show near half lit, so the Moon's disc is
its true 3.7 times smaller than Earth's. `EARTH_AND_MOON_VIEW` derives it from
the tour date's ephemeris, so a date change re-derives it:

- The eye stands as far from Earth as from the Moon: the aim slides off the
  gap's middle by the view's lean along the gap.
- Square to both the gap and the Sun would be the ecliptic pole, where the
  pole-up view has no heading. The view looks 80° steeply across the ecliptic
  instead; the Sun lies in the ecliptic, so such a view sees both bodies near
  half lit whatever the Moon's phase. Of the two mirror views (toward ecliptic
  north or south) the beat takes the one nearer square to the Sun.
- The heading turns 34° off square to the gap, which tilts the gap about 34°
  on screen: Earth lower left, the Moon on its ring upper right.
- 340,000 km back, which keeps the passed framing's positions. On 2026-09-05
  at 1600×900: Earth about 26 px and 53% lit at (475, 670), the Moon about
  7 px and 37% lit at (1165, 203). The lit fractions differ because the gap
  spans about 50° as seen from the eye.
- Looking near the ecliptic pole keeps every other planet out of frame.

## On screen

`Earth and Moon` + narration on dwell start. Body labels for Earth and the
Moon: Earth's caption was never hidden, and the beat shows `label:body:planet`
again, the switch beat 00 hid the Moon's name under (body captions ignore the
focused-only mode).

## Caption

```ts
caption: {
  title: 'Earth and Moon',
  lines: [
    'Thirty Earths would fit in the gap between us and the Moon.',
    'Light crosses it in just over a second.',
  ],
},
```

## Sources

- Moon's mean distance (semimajor axis) 384,400 km: NASA NSSDCA Moon Fact
  Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
- Earth's mean diameter 12,742 km: NASA NSSDCA Earth Fact Sheet (as stage 01).
- Derived: 384,400 / 12,742 ≈ 30 Earths; 384,400 km / 299,792 km/s ≈ 1.3 s.
