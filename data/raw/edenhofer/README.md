# Edenhofer et al. 2024 — parsec-scale Galactic 3D dust map

Upstream: https://zenodo.org/records/10658339 (v1.0.2; DOI
`10.5281/zenodo.8187943` resolves to the version chain). Licence **CC-BY 4.0**.
Cite Edenhofer et al. 2024, A&A 685, A82 (`10.1051/0004-6361/202347628`) and
the dataset DOI.

Fetched 2026-08-19 (curl, resumable; `.md5` sidecars carry Zenodo's own
checksums, verified locally after download). FITS payloads are byte-identical
across v1.0 → v1.0.2 (checked via the Zenodo API); v1.0.1/v1.0.2 only added
the two interpolation scripts and touched the readme.

| file | size | what |
| --- | --- | --- |
| `mean_and_std_healpix.fits` | 3.25 GB | posterior mean + std, HEALPix Nside 256 × 516 log-spaced shells 69→1250 pc — the bake input |
| `samples_healpix.fits` | 19.5 GB | 12 posterior samples (6 antithetic pairs), same grid — kept as insurance for a single-sample bake |
| `validation_with_less_data_but_2kpc_mean_and_std_healpix.fits` | 4.12 GB | lower-fidelity 2 kpc edition (authors caution on small-scale structure) |
| `interp2box.py` / `interp2lbd.py` | 14/11 KB | official HEALPix→cartesian / →lbd resamplers (interpolate log-density, exponentiate after); need numpy+astropy+healpy |
| `zenodo_readme.md` | 4.6 KB | upstream readme (renamed: case-insensitive FS would collide with this file) |

Quantity: differential extinction density in the unitless ZGR23 system per
parsec (×2.8 ≈ A_V). The innermost 69 pc are not in the HEALPix products
(reconstruction starts at the first shell). Deliberately NOT fetched:
`mean_and_std_{xyz,lbd}.fits` (re-derivable via the scripts at any target
resolution), the stellar extinction catalogs, and the 2 kpc samples cube.

Design record: `docs/grill-sessions/edenhofer-dust-volume-2026-08-19.md`.
