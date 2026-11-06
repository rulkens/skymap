# Night lights from EOX structure below z7

**Status:** `needs-design`

## Idea

Black Marble 2016 is 500 m native, so the night product stops at z7 (about 600 m per texel).
Deeper than that the runtime shows the z7 tile magnified. A spike could shape z8+ night detail
from the day tiles (EOX z8–z13, GeoDanmark z14+): lights follow roads, built-up areas and coasts,
which the day imagery shows at full resolution.

## Risk

Inventing lights. Anything synthesised is a guess dressed as a measurement, and Skymap's
promise is measured data. Any such layer needs its own provenance and an honest label.

## How to judge it

Copenhagen at night from 50 km: the result should read as a plausible refinement of the z7
tile, never brighter or more colourful on average, and never lit where the day tile shows fields or water.
