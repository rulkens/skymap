# Per-tile horizon gate

**Raised:** 2026-11-26, parked after the terrain horizon shadows perf work.

## Idea

A tile only needs horizon data where the sun's elevation is below the tile's maximum horizon angle. Above it, the lookup always reads lit. Store each tile's max angle (one byte) in the horizon archive index, and skip the shader reads (optionally the fetch too) when the sun is higher than max plus the sun's angular radius.

## Measurements

Measured 2026-11-26 over the baked archives (moon v1, mars v2, earth v11), per-tile max angle:

- Moon: p50 29-31 degrees at z5-z7, p99 about 35 degrees, 63 degrees at z7.
- Mars: p50 7-19 degrees.
- Earth global levels: p50 3-16 degrees. Earth's z14-z19 regions: 30-49 degrees.
- A child tile's max exceeds its parent's in 30-98% of cases, by up to 70 degrees. So the value has to be stored per tile at every level, and a coarser level cannot gate fetches of finer ones.
- The per-tile min sits at the -3 degree decode floor and carries nothing.

## Why parked

- It only lowers the typical cost (Mars, Earth's global levels). About half the Moon's day side still pays.
- The worst case is unchanged: low sun on the surface, which is the view the perf budget is judged on.
- It needs an archive index format change.
