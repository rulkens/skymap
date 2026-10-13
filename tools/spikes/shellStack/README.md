# Shell stack spike

**Status: spike, not a feature.** Nothing here is wired into the app. It exists to answer one
question on the CPU, before any shader is written: can the MCPM cosmic-web volume be served
as a stack of concentric spherical shells (a multi-sphere image, after MatryODShka /
multiplane images) at acceptable quality, and what does it cost in bytes and texture fetches?

## Idea

Resample the density cube once into K concentric shells. Each shell texel stores the band of
medium between it and the next shell, integrated radially: band opacity and the alpha-weighted
mean palette coordinate, two bytes. Drawing a pixel is then: intersect the ray with the K
spheres analytically, composite the crossed bands front to back. No empty-space march.

Two centres are compared:

- `--centre cube` — shells around the cube's centre, full angular resolution on every shell.
- `--centre observer` — shells around the Milky Way at the origin, spanning the cube's radial
  extent, with per-shell angular resolution matched to one voxel at that radius. From home
  every ray is radial, so the composite is exact up to the radial band size, and the inner
  shells' lower resolution is a true level of detail rather than a loss.

## Run

```bash
curl -L -o data/raw/mcpm/mcpm_sdss_d4.npy https://skymap-data.rulkens.com/data/raw/mcpm/mcpm_sdss_d4.npy
npx tsx tools/spikes/shellStack/shellStackSpike.ts data/raw/mcpm/mcpm_sdss_d4.npy \
  --out /tmp/shells --centre observer --shells 96 --res 384
```

Per camera pose it writes a strip `<pose>-<tag>.png`: truth (1024-step march), the shader's
own 128-step march, the shell composite; and prints mean absolute error, PSNR and average
texture fetches per pixel for the last two against truth. The transfer function mirrors
`src/services/gpu/shaders/scalarVolume/fragment.wesl` with `MCPM_ENTRY`'s knobs, minus the
per-fragment jitter and the exposure boost.

## Findings

See the session notes / backlog entry that lands with this spike; the numbers are printed by
the run and the strips are the evidence.
