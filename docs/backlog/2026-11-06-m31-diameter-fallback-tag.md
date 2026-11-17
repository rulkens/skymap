# M31's card tags a measured diameter as fallback

Seen on 2026-11-05 during the selection-kind-facts work (it predates that branch): `#focus=galaxy-m31`
shows the diameter as 40.4 kpc with the provenance tag "fallback (30 kpc)", and the selection ring is much
larger than the disc.

The tag reads `GalaxyRow.diameterIsFallback` (from `cloud.diameterIsFallback`, set at build time); the ring
radius is twice `diameterKpc` (the galaxy kind's `focus.ring`). Either the famous build writes the flag
for a galaxy whose diameter is measured, or the diameter is a fallback that a later step rescales. Start
by reading M31's record in `famous.bin` and how `tools/` sets the flag for famous seeds.

Fix: reproduce as a failing test on the flag for M31's record, then fix the build or the card.
