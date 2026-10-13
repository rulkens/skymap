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

## Findings (2026-10-13, d4 tier, 178×300×182 voxels of 3.1 Mpc)

Verdict: **the shell stack loses to the existing 128-step march on every axis** for a free
camera. PSNR is against the 1024-step truth; fetches are texture reads per pixel.

| Stack                                                      | Bytes  | Pose      | March PSNR | Shell PSNR | March fetches | Shell fetches |
| ---------------------------------------------------------- | ------ | --------- | ---------- | ---------- | ------------- | ------------- |
| cube-centred, K=96, 384²                                   | 28 MB  | home      | 39.8       | 32.5       | 128           | 197           |
|                                                            |        | near home | 39.4       | 33.6       | 128           | 198           |
|                                                            |        | orbit     | 44.6       | 40.7       | 84            | 183           |
|                                                            |        | inside    | 41.2       | 32.3       | 128           | 182           |
| observer-centred, K=256, 1024² (≈1 voxel bands and texels) | 181 MB | home      | 39.8       | 32.7       | 128           | 255           |
|                                                            |        | near home | 39.4       | 34.2       | 128           | 508           |
|                                                            |        | orbit     | 44.6       | 40.0       | 84            | 534           |
|                                                            |        | inside    | 41.2       | 33.1       | 128           | 365           |

The cube itself is 19.4 MB at f16.

Why it loses, in order of weight:

1. **Grazing rays.** A band texel holds the medium along the radial direction. A ray that
   crosses the band obliquely sees a different segment of medium, and a nearly tangential
   segment sweeps across many texels, so it has to be sub-sampled (up to 16 reads). That is
   where the fetch counts above come from, and where the arc streaks in the inside and home
   strips come from. Only the orbit view, where most rays are near radial, stays clean.
2. **No storage win at matched resolution.** Spherical resampling at one voxel per texel
   needs as many samples as the cube has voxels. Octahedral maps cover the whole sky while
   the data covers part of it, so the observer-centred stack is 9× the cube; cropping the
   maps to the data's solid angle would at best break even.
3. **Radial averaging blurs.** Collapsing a band to one opacity and one mean palette
   coordinate softens filaments that cross the band, visible as the softer third panel
   even at one-voxel bands.

Where it would win: a camera pinned near the shells' centre with small excursions, which is
the VR use case the multi-sphere-image papers target. Skymap's camera is free, so the
representation does not fit. The one honest gain left is a _radially coarser_ cube for the
home view, which is just a lower tier along one axis, not a new representation.

Not run here: GPU frame time. The fetch counts make the outcome predictable, and the CPU
numbers already settle the quality and bytes questions.
