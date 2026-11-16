# Clouds slot: one pointer read for every tier

**Readiness:** `needs-design`.

`bodyTextureUrls` (`src/layers/body/textures/load/bodyTextureUrls.ts`) resolves the clouds pointer per request, and a
request is one tier. A tier upgrade (small → large as the camera closes in) reads the pointer again, so the two tiers
can come from different sources: the daily map for one and the built-in map for the other (a failed or blocked pointer
read in between), or two different days across the nightly publish at 04:23 UTC. The globe then changes its clouds as
the tier swaps.

Options to weigh: resolve the pointer once per session (or per slot family) and pin every tier to that answer,
including the fallback; or carry the resolved source in the slot state so an upgrade asks for the same one. Either way,
decide what a long-open tab should do when a newer day is published (keep the pinned day, or swap all tiers together).
