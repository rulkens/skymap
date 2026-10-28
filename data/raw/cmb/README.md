# Planck 2015 SMICA CMB temperature map

Upstream: the Planck Legacy Archive release 2 component map
`COM_CMB_IQU-smica_1024_R2.02_full.fits`, fetched 2026-10-28 from NASA/IPAC's
IRSA mirror:

    curl -C - -o data/raw/cmb/COM_CMB_IQU-smica_1024_R2.02_full.fits \
      https://irsa.ipac.caltech.edu/data/Planck/release_2/all-sky-maps/maps/component-maps/cmb/COM_CMB_IQU-smica_1024_R2.02_full.fits

| file | size | what |
| --- | --- | --- |
| `COM_CMB_IQU-smica_1024_R2.02_full.fits` | 176 MB | SMICA component separation, HEALPix Nside 1024, galactic, RING; field 0 is the temperature (I_STOKES, K_CMB) |

Cite Planck Collaboration 2016, A&A 594, A9 ("Planck 2015 results. IX.
Diffuse component separation: CMB maps"); terms in `ATTRIBUTIONS.md`.

`tools/cmb/projectCmbMap.py` smooths it to a 0.5 deg beam, projects it to a
2048 x 1024 equirectangular image in galactic (l, b) and colours it, writing
`public/images/cmb/planck-smica-galactic.webp`, which the horizon shell
samples (`src/services/gpu/resources/loadCmbTexture.ts`).
