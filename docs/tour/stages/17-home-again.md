---
stage:        17
id:           home-again
title:        Home again
narration:    Back to where we began. Everything you just saw is out there to explore.
focus:        body:earth
distance_mpc: 2.7e-16 # 2,000 km over Copenhagen, looking straight down
motion:       inward log-dolly + body-leg descent
travel_s:     0
dwell_s:      27
effects:      []
requires:     [log-dolly, lateral-focus, clock-to, frame-handover, caption]
status:       draft
---

## Intent

The return. One swift inward dolly from the horizon straight back to Earth,
then down over Copenhagen, where the rise in stage 01 left the ground behind.
The outbound journey was the story; the return is "you're home, go explore."
Lands the viewer where the tour began, oriented.

## Camera

No enter clip: the rush is the dwell, and the caption rides it. The beat snaps
the clock to `TOUR_NIGHT_SIM_DAYS` and states the galactic pole, so a skip into
it lands on the tour date.

- **World leg (20 s).** One log dolly from the edge (~29,000 Mpc) to the whole
  Earth (20,000 km up, stage 01's landing), about 19.5 decades, eased in and
  out so the rush peaks near 1.5 decades a second. Over its first 12 s the
  target slides onto Earth and the view turns to look straight down on
  Copenhagen, rolled north up; both finish while the range is still thousands
  of au, so the eye never swings past the Sun. Looking down on Copenhagen at
  night means coming in along its zenith, so the last decades fall through the
  Milky Way's disc, the band seen overhead from the park.
- **Body leg (7 s), `{ body: 'earth' }`.** The eye sinks straight down from
  20,000 km to 2,000 km over Copenhagen: Denmark small, city lights, the
  curve of the planet at the edge. A body leg has no roll and levels north up,
  which is why the world leg arrives rolled north up.

## On screen

`Home again` + narration over the whole rush. The narration is the only
invitation to explore, the one place a call-to-action is allowed (see
writing-style). Earth is the focus.

## End of tour

- On the settle the tour ends: UI chrome returns, pre-tour settings restore
  (filaments / volume toggled during the tour revert), and the clock returns to
  the viewer's.
- The landing is on Earth's arm, below its release height (0.9 Earth radii), so
  when the clock jumps back the camera rides Earth instead of hanging where
  Earth stood on the tour date (`homeAgain.test.ts`).
- The restore also re-applies the viewer's pre-tour focus, and a focus change
  flies the camera to frame it; with Earth focused (the home view) the camera
  pulls back from Copenhagen to its framing of Earth.

## Tweaks

- The rush stops on the whole Earth before the descent: two moves, arrive and
  then sink. A seamless speed join would need the world dolly to end moving.
