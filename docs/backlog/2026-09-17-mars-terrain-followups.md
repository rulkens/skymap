# Mars terrain (F4) follow-ups

`needs-design` — left open when #743 landed (user: land it, fix in follow-ups).

- **Cut planner step 3 samples only the lowest height.** The projected-bbox cull in
  `src/utils/surfaceTiles/cutSurfaceTiles.ts` projects the patch at its subtree
  minimum, so a non-straddling patch whose peaks poke into view at a screen edge
  can still be dropped. Step 2 (frustum sphere) was made conservative in #743.
- **Mars atmosphere shell moved ~2 km down.** Mars now has a `reliefM`, and
  `seededRadiusKm('mars')` (`src/data/bodies/atmosphereParams.ts:116-117`) reads
  `innerBoundRadiusM`, so the shell's ground and top dropped ~2.0 km: rover sites
  sit 4–8 km up the shell, ~17 % less dense (scale height 10.8 km), and the row
  comment "Altitude 0 is the drawn surface" is stale. Eye-check the sky at a site,
  then accept (fix the comment) or keep Mars's shell on the datum.
- **NaN DTM posts in the feather ring.** `tools/textures/clippedHeightSource.ts:48-53`
  leaves a HiRISE void/collar post NaN inside the 500 m ring; `bakeHeightLevel`
  fills it with raw MOLA at full weight (10–150 m step). Use the fill inside the
  ring, or assert no NaN posts inside the site extent at `checkDatum`.
- **Tharsis under-refines until deep height ranges load.** Step 3's `lift` samples
  at the body minimum (−2,011 m) without a resident ancestor, so over Olympus
  Mons patches look 10–25 km farther than they are. Recovers as tiles load;
  eye-check a Tharsis flyover.
- **`delightedImagerySource` hardcodes `MARS_IAU_SPHERE_RADIUS_M`.** Pass the radius
  in when the albedo bench's shared implementation replaces it.
