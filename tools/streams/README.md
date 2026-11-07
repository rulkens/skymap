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
  edition) for streams named after their globular cluster, S5 (Li et al. 2022) for the streams it
  measured, the table's median (−1.83) for the rest. Sagittarius runs from −0.57 when bound to −1.13
  for debris stripped 2.7 Gyr ago (after Hayes et al. 2020). The bin stores the colour as Gaia BP−RP
  (`bvToBpRp`) over `STREAM_BP_RP_RANGE`, and the shader tints it with the star catalogue's
  `starTint`, so stream stars and catalogue stars share one colour scale. The meta row carries
  `feh`/`fehRef` only for measured values; a defaulted median is never shown.
- **Frame**: heliocentric J2000 equatorial, Mpc, as everywhere in skymap.

Tunables (particle budget, sizes, luminosities, seeds) live in
[`data/streamsBuild.constants.ts`](data/streamsBuild.constants.ts).
