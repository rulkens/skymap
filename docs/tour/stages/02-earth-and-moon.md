---
stage: 2
id: earth-and-moon
title: Earth and Moon
narration: >
  Thirty Earths would fit in the gap between us and the Moon. Light crosses
  it in just over a second.
focus: none # cleared: the shot is aimed between the bodies
distance_mpc: 1.2e-14 # ~380,000 km from a point in the gap, both in frame
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

The enter snaps the clock to `TOUR_NIGHT_SIM_DAYS` (`overSec: 0`). Log-dolly
out from the whole-Earth framing until both bodies sit in frame with the gap
between them readable; a slow orbit on the dwell for depth. On the tour date
the Moon is new: it sits roughly sunward of Earth, so a framing from the night
side sees its unlit face. Pick the orbit so its lit limb shows.

As built: the pull-back swings round to a view square to the gap, turned 40°
sunward (Earth about 90% lit, the Moon about 60%) and 30° off the galactic
plane, which keeps Pluto, named by the same caption switch as the Moon, out of
frame. The gap runs diagonally, about 56° up, under the tour's galactic pole.

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
