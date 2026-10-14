# Stellar streams — PROTOTYPE particle builder

Builds `public/data/stellar_streams.bin`, read by `src/layers/stellarStreams/`
(a spike, not a shipped Layer: no settings, no fade row, no AssetSlot).

```bash
pip download --no-deps galstreams -d /tmp/gs && tar xzf /tmp/gs/galstreams-*.tar.gz -C /tmp/gs
python3 -I tools/streams/buildStellarStreams.py /tmp/gs/galstreams-1.2.1/galstreams public/data/stellar_streams.bin
```

- **Tracks**: galstreams (Mateu 2023), one track per stream, skipping
  sky-only tracks whose distance column is a placeholder 1.0. Each track is
  resampled into particles with Gaussian cross-track scatter (master-log
  `width_phi2`) and along-track clumping.
- **Sagittarius**: galstreams only covers its Gaia-local arc, so it is a
  Fardal+2015 particle spray instead: progenitor orbit integrated back 3.5 Gyr
  in a Bovy-2015 potential (no LMC, no dynamical friction), two Lagrange-point
  releases per Myr, integrated forward to today. Leading and trailing arms
  wrap the disc on a polar orbit; apocentres are not tuned against observed ones.
- **Frame**: heliocentric ICRS in Mpc, R₀ = 8.178 kpc to match
  `GALACTIC_CENTRE_ANCHOR`.

Record: 10 × f32 — position xyz (Mpc), unit tangent xyz, size (Mpc), luminosity,
colour t (0 = BHB blue, 1 = giant amber), stream id (0 = Sagittarius).
