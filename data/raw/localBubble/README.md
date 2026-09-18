# `data/raw/localBubble/` — Local Bubble shell surface

## Provenance

|         |                                                                                                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paper   | O'Neill, Zucker, Goodman & Edenhofer (2024), _The Local Bubble is a Local Chimney: A New Model from 3D Dust Mapping_ ([arXiv:2403.04961](https://arxiv.org/abs/2403.04961)) |
| Data    | Harvard Dataverse [doi:10.7910/DVN/INB1RB](https://doi.org/10.7910/DVN/INB1RB)                                                                                              |
| Licence | CC0 1.0 (public domain dedication)                                                                                                                                          |
| File    | `ONeill2024_LocalBubble_ShellProperties_A0.5.fits`, 138,421,440 bytes                                                                                                       |
| Fetcher | `npm run fetch-local-bubble`                                                                                                                                                |

The dataset ships sixteen sibling tables — twelve posterior draws, two edge
thresholds (`A0.5` / `A0.9`), and a mean-with-uncertainties. This directory holds
the **fiducial `A0.5` threshold** table; the fetcher pins it by Dataverse file id
because the filenames differ only by suffix.

Upstream derives the surface from the Edenhofer et al. (2024) 3D dust map, which
skymap already carries as a separate raw source (`edenhofer.*` in the registry).

## Byte layout

FITS with 2 HDUs: an empty primary, then a `BINTABLE` extension.

```
NAXIS1  =     216   bytes per row
NAXIS2  =  786432   rows  = 12 × 256²  ⇒  HEALPix Nside=256 (~13.7′ pixels)
TFIELDS =      27   all TFORM 'D' (float64, big-endian)
```

One row per sky direction. The surface is **star-shaped** — a single radius per
direction with the Sun at the origin — so it is a radius field r(l, b), not a
mesh.

| Column                       | Unit | Meaning                                                          |
| ---------------------------- | ---- | ---------------------------------------------------------------- |
| `x`, `y`, `z`                | pc   | heliocentric galactic Cartesian (x→GC, y→ℓ=90°, z→NGP)           |
| `l`, `b`                     | deg  | galactic longitude / latitude of this sight line                 |
| `d`, `sig_d`                 | pc   | peak-extinction distance = the shell radius, and its uncertainty |
| `d_inner`, `d_outer`         | pc   | inner and outer wall distances                                   |
| `thick`, `sig_thick`         | pc   | shell thickness                                                  |
| `npeak`, `sig_npeak`         | cm⁻³ | peak density                                                     |
| `Ag`, `sig_Ag`               | mag  | integrated extinction                                            |
| `mass`, `sig_mass`           | M☉   | swept-up mass along the sight line                               |
| `gamma`, `sig_gamma`         | deg  | inclination of the surface to the plane of sky                   |
| `nx`, `ny`, `nz` (+ `sig_*`) | —    | surface normal                                                   |

**Frame:** galactic, as above — _not_ skymap's supergalactic draw frame. The bake
(`tools/localBubble/buildLocalBubbleShell.ts`) deliberately preserves the source
frame; the rotation belongs to the renderer, where a frame error shows up as a
visible rotation rather than as wrong bytes on disk.

**Ordering:** the row order is HEALPix, but the header does not state RING vs
NESTED. Nothing here needs to know — every row carries its own `l`/`b`, and the
bake reads the angles rather than deriving them from the index.
