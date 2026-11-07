# Stellar streams — particle builder

Writes `public/data/stellar-streams/v1/stellar-streams.bin` (STRM, layout in
[`stellarStreamsFormat.constants.ts`](../../src/layers/stellarStreams/catalog/data/stellarStreamsFormat.constants.ts))
and `stellar_streams_meta.json` (one entry per stream, array position = stream index), read by
`src/layers/stellarStreams/`.

```bash
npm run fetch-vasiliev2021   # data/raw/vasiliev2021/stars.txt (43.6 MB zip, two files kept)
npm run fetch-galstreams     # data/raw/galstreams/ tracks + master log, pinned commit
npm run build-stellar-streams
```

The build reads only the raw files, seeds every random draw (`splitmix64Rng`), and is byte-identical
across reruns over the same inputs. On 2026-11-07 it wrote 128,419 particles in 83 streams, 5.14 MB.

- **Sagittarius** (stream 0): the present-day snapshot of the Vasiliev, Belokurov & Erkal 2021 N-body
  model (with LMC). 60,000 of its 200,000 star particles, picked at random per class: still-bound
  remnant (`tStripGyr` 0) capped at 10% of them (a uniform pick made it 56%, and the core burned
  white), stripped debris for the rest, either class topping up when the other runs short; positions from
  the catalogue's own RA, Dec and distance, tangents from the galactocentric velocity rotated into the
  equatorial frame (`galToEq`). Colour follows stripping time through metallicity (below); brightness
  does not. Its meta anchor is the mean position of every bound snapshot star (not the capped pick), and its
  `lengthKpc` is an extent, not an arc length: twice the 99th-percentile distance of all 200,000
  snapshot stars from it (275 kpc).
- **The rest** (sorted by slug): galstreams (Mateu 2023), one `st` track per stream, the master log's
  `On` track when it has distances, else the first that does. Sky-only tracks (every distance 1.0) and
  galstreams' own Sagittarius are skipped. A track listed against its stars' motion (proper motion,
  radial velocity where given, plus the solar reflex) is flipped first. It is resampled into
  `clip(L·60·max(1, w/0.3), 300, 30000)` particles evenly along its length, scattered across it by a
  Gaussian of the master-log width `width_phi2` (0.3° when unset) at the median distance, and dimmed
  only over the end eighths. The meta anchor is the track's midpoint by length.
- **Colour**: each particle draws one star type (giant, turnoff, blue horizontal branch) by that type's
  share of an old population's V light, and takes the type's B−V. Shares and colours depend on the
  stream's [Fe/H] (metal-poor: more BHB light, bluer giants), linear between two anchors read off MIST
  v1.2 isochrones at log age 10.10. A galstreams stream's [Fe/H] comes from
  [`data/streamMetallicity.constants.ts`](data/streamMetallicity.constants.ts): Harris (1996, 2010
  edition) for streams galstreams ties to a globular cluster, S5 (Li et al. 2022) for the streams it
  measured, the table's median (−1.83) for the rest; the build fails if a row names no built stream. Sagittarius runs from −0.57 when bound to −1.13
  for debris stripped 2.7 Gyr ago (after Hayes et al. 2020). The bin stores the colour as Gaia BP−RP
  (`bvToBpRp`) over `STREAM_BP_RP_RANGE`, and the shader tints it with the star catalogue's
  `starTint`, so stream stars and catalogue stars share one colour scale. The meta row carries
  `metallicity` (value and citation) only for measured values; a defaulted median is never shown.
- **Stellar mass**: the meta row's `stellarMass` (M☉, citation, `partial`) comes from
  [`data/streamStellarMass.constants.ts`](data/streamStellarMass.constants.ts), one published value per
  stream (13 of 83 on 2026-11-07), and the card shows it where present. `partial` marks a mass
  measured over only part of the stream (the card prefixes "≥"). Values resting on an assumed
  mass-to-light range stay out, and Sagittarius has none. The build fails if a row names no built
  stream.
- **Wikipedia**: the meta row's `wikipediaTitle`, and its `description` when the summary has an
  extract (null otherwise; the build writes no description of its own), come from [`data/streamWikipedia.constants.ts`](data/streamWikipedia.constants.ts): only
  articles about the stream itself (6 rows on 2026-11-07, 5 articles; progenitor-cluster articles stay
  out, and so do the titles that merely redirect to one). The raw REST summaries are cached in the
  committed `data/raw/streams/wikipedia_streams_cache.json`, so a rebuild makes no request; a new row
  is fetched once, 1 s apart, and must be a `standard` page. The card shows the link and blurb.
- **Pick centrelines**: the meta row's `centrelineMpc` and `ribbonWidthKpc` feed the app's pick
  ribbons. A galstreams track is simplified (Douglas–Peucker, worst span first) toward half its
  width, at most 16 points; where the cap leaves the track farther from the line, the ribbon widens
  to the measured gap, so the drawn stream always takes the click. Sagittarius has no track, so
  `sagittariusCentrelines` derives one per arm from the full snapshot (orbital plane from its total
  angular momentum, arms split by orbital energy against the remnant's, binned by angle from the
  remnant); each arm is simplified the same way and the meta joins them through the remnant. On
  2026-11-07: 556 segments over the 83 streams, median 7 points, at most 16.
- **Frame**: heliocentric J2000 equatorial, Mpc, as everywhere in skymap.

Tunables (particle budget, sizes, luminosities, seeds) live in
[`data/streamsBuild.constants.ts`](data/streamsBuild.constants.ts).

## Deploy order

Sync before merging. Merging to `main` deploys the app shell, the app demands
`stellar_streams_meta.json` on every boot, and it rejects a meta without `centrelineMpc` (an older
build's). Merged first, every boot 404s the meta (a 4xx is never retried), so the palette lists no
streams and switching them on draws nothing until the sync lands. Run from this branch's checkout,
whose `DATA_FAMILIES` row puts the two files in the manifest:

1. `npm run build-data-manifest`
2. `npm run sync-r2-secure` (the owner; see [`docs/DEPLOY.md`](../../docs/DEPLOY.md))
3. merge
