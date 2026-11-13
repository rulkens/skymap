# Cloud bake: date-line join against the swaths

**Readiness:** `needs-design`.

`tools/cloud-bake-rs` moves the 24 h join of the GIBS local-day mosaics off the 180° meridian by
seam-cutting the previous day's mosaic in over 35° west of it (`sources::join_dateline`, README "Date
line"). That join is made between the two mosaics only, before the composite, and it shows three limits:

- **It does not see the swaths.** On 2026-11-06 the cut gave the previous day ~-174..-163°, 35–50°N,
  next to that day's 22:30Z NOAA-20 swath, which carries a bright frontal deck. The composite then joins
  that swath against the previous-day piece, 22 h apart, and the deck's large-scale brightness spreads
  over the other day's cumulus as a glowing, saturated patch. The 24 h join has to be cut against the
  swaths too, which means the previous-day mosaic becomes a source in the main composite rather than a
  pre-join.
- **The blend assumes one scene.** `blend::residual` gives its coarsest band to the side the seam rejected
  (a deliberate Python behaviour for same-scene swaths). Across a join between days that is a ghost; a
  per-join mode (a hard cut or a narrow feather) is needed. A hard cut in the pre-join alone did not remove
  the 11-06 glow, because the glowing join is the composite's.
- **Mid-latitude paths stay straight.** Where both days are cloudy (2026-11-09, 25–58°N), the cut takes
  the shortest path, 2–8° west of 180°, with straight north–south runs of ~10°. The tropics come out
  seamless.

Measured on 2026-11-06 and 2026-11-09: coverage and calibration were unchanged by the join, and it adds
~3 s to a warm bake.
