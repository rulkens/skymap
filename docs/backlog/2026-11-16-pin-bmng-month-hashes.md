# Pin the twelve Blue Marble months in textures.sha256

**Readiness:** `ready`.

`data/raw/textures/textures.sha256` pins one of the twelve BMNG 2004 months the cloud bake reads
(`world.topo.bathy.200408.3x21600x10800.jpg`, the vintage month). `fetch-cloud-inputs` (`tools/fetch/fetchTextures.ts`,
`--cloud-inputs`) hashes every other month on first download and appends it (`upsertSha256Sidecar`), so a fresh
machine, and the nightly clouds leg on CI with a cold cache, trusts whatever bytes it got the first time. A truncated
or swapped month then becomes the ice mask for that month's bakes.

Fix: download the eleven missing months once on a trusted machine, check them against NASA's sizes, and commit their
lines. The CI cache key (`hashFiles('data/raw/textures/textures.sha256')`, the clouds row in
`src/data/live/liveDatasets.ts`) changes with the commit, so the next run refetches into a fresh cache and verifies.
