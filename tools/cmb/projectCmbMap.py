#!/usr/bin/env python3
"""
projectCmbMap.py -- one-shot maintainer script.

Projects the Planck 2015 SMICA CMB temperature map (HEALPix Nside 1024,
galactic, registry key 'cmb.smica') to a 2048 x 1024 equirectangular image in
GALACTIC longitude/latitude, coloured with a diverging blue-black-orange ramp
(cold spots blue, hot spots orange, mean temperature black, because the
horizon shell blends additively). Column x holds l = 360 * (x + 0.5) / W
(l = 0 at the left edge), row y holds b = 90 - 180 * (y + 0.5) / H; the shell's
fragment shader samples it with exactly that mapping.

Dependencies (maintainer-only; project-local venv, as data/raw/mcpm/README.md):
    python3 -m venv .venv && .venv/bin/pip install numpy astropy healpy pillow

Usage:
    .venv/bin/python tools/cmb/projectCmbMap.py
    # writes public/images/cmb/planck-smica-galactic.webp
"""
import sys

import healpy as hp
import numpy as np
from PIL import Image

SRC = 'data/raw/cmb/COM_CMB_IQU-smica_1024_R2.02_full.fits'
OUT = 'public/images/cmb/planck-smica-galactic.webp'
W, H = 2048, 1024
# Smoothed to a 0.5 deg beam: the full map's pixel-scale noise reads as grain
# on a shell that never fills more than a few degrees per screen pixel.
FWHM_DEG = 0.5
# Anisotropies are ~+-80 uK rms after smoothing; +-250 uK keeps the hottest
# and coldest spots from clipping into flat colour.
RANGE_UK = 250.0


def main() -> None:
    raw_k = hp.read_map(SRC, field=0)  # I_STOKES, K_CMB, RING order
    nside = hp.get_nside(raw_k)
    temperature_k = hp.smoothing(raw_k, fwhm=np.radians(FWHM_DEG))
    lon = 360.0 * (np.arange(W) + 0.5) / W
    lat = 90.0 - 180.0 * (np.arange(H) + 0.5) / H
    lon_grid, lat_grid = np.meshgrid(lon, lat)
    pix = hp.ang2pix(nside, np.radians(90.0 - lat_grid), np.radians(lon_grid))
    t = np.clip(temperature_k[pix] * 1e6 / RANGE_UK, -1.0, 1.0)

    cold = np.array([0.15, 0.45, 1.0])
    hot = np.array([1.0, 0.55, 0.15])
    rgb = np.where(t[..., None] < 0, -t[..., None] * cold, t[..., None] * hot)
    Image.fromarray((rgb * 255).astype(np.uint8), 'RGB').save(OUT, quality=85)
    print(f'{OUT}: {W}x{H}, nside {nside}, '
          f'rms {np.std(temperature_k) * 1e6:.1f} uK, clipped {np.mean(np.abs(t) >= 1) * 100:.2f}%')


if __name__ == '__main__':
    sys.exit(main())
