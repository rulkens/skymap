# Cloud bake: fixed transfer curve

**Readiness:** `needs-design`.

`tools/cloud-bake-rs` quantile-matches each day's composite opacity to the static map
(`cloud_combined_8192.tif`; `quantile::qmatch` in `src/main.rs`). That forces the same opacity
distribution, so the same total cloud amount, every day: the 6 and 9 Nov bakes have mean opacity 0.267 and
0.261 whatever the weather did. A clear week and an overcast week look equally cloudy.

A fixed transfer curve (a function from the VIIRS and geostationary retrievals to opacity, the same every
day) would let the total move with the weather. Open questions for the design: where the curve is fitted
(once, against which day or days, and how it is re-fitted), how it treats the two input kinds (reflectance
mosaics, infrared temperature) so the seams between them stay invisible, and what the app does with a
day that is much cloudier or clearer than the static map it is blended with. Owner ruling 2026-11-10: not
in the production-bake PR.
