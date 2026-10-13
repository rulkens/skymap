# A tier switch rebuilds the star pool and refetches every chunk

**Readiness:** `deferred`. **Surfaced:** 2026-10-12, final review of #885.

A tier switch changes the request, so the slot reloads: one index fetch, new pool-sized buffers, a new `SlotPool`,
and every chunk fetched again. In production the objects are hashed and immutable, so these are HTTP-cache hits;
only the decode and upload repeat. The Debug-panel chunk slots picker no longer has this cost: it resizes the
pool without a refetch (`resizeStarPools`).

Keeping the old pool alive across a switch was judged not worth its code. Revisit if tier switches become common.
