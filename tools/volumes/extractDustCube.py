#!/usr/bin/env python3
"""
extractDustCube.py — one-shot maintainer script.

Resamples the Edenhofer et al. 2024 HEALPix dust map
(data/raw/edenhofer/mean_and_std_healpix.fits) to Sun-centered +-1.25 kpc
cartesian cubes at each renderer tier resolution, by subprocess-invoking
the release's own interp2box.py (it interpolates log(density) then
exponentiates -- the correct resample for this log-normal field; verified
at interp2box.py's line ~318). Writes mean/std .npy pairs into
data/raw/edenhofer/cache/ (registry key 'edenhofer.cache-dir'); consumed
by tools/volumes/buildDustVolume.ts.

interp2box.py is a top-level script, not a library -- subprocess reuses
its interpolation without re-deriving its filename/argparse internals;
each run gets an isolated tmpdir, and we glob for the one .fits dropped
there rather than reconstructing its output-name formatting.

Run once per Edenhofer release / tier-set change. Mirrors
tools/volumes/extractMcpmCube.py's shape and one-shot-maintainer role.

Dependencies (maintainer-only; project-local venv, same precedent as
data/raw/mcpm/README.md):
    python3 -m venv .venv
    .venv/bin/pip install numpy astropy healpy

Usage:
    .venv/bin/python tools/volumes/extractDustCube.py
    # writes edenhofer_{mean,std}_{128,256,384}.npy into
    # data/raw/edenhofer/cache/

Verification:
    Prints shape + mean(mean)/mean(std) per tier. A near-zero mean(std)
    across every tier suggests interp2box.py's "Std." HDU lookup missed
    (see write_tier's HDU-name check) rather than a real result. NaNs
    outside the map's radial support are zero-filled before these means
    are taken, so both are averaged over the whole cube (roughly half of
    which sits outside the map's support).
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
from astropy.io import fits

RAW_DIR = "data/raw/edenhofer"
FITS_PATH = os.path.join(RAW_DIR, "mean_and_std_healpix.fits")
INTERP_SCRIPT = os.path.join(RAW_DIR, "interp2box.py")
CACHE_DIR = os.path.join(RAW_DIR, "cache")
HALF_EXTENT_PC = 1250.0
RESOLUTIONS = (128, 256, 384)


def ensure_inputs() -> None:
    for path in (FITS_PATH, INTERP_SCRIPT):
        if not os.path.exists(path):
            sys.exit(
                f"missing {path}.\n"
                "  See data/raw/edenhofer/README.md -- fetch_edenhofer.sh pulls "
                "the FITS + official resample scripts from Zenodo."
            )


def run_interp2box(res: int) -> str:
    """Subprocess-invokes interp2box.py for one resolution; returns the
    path to the single .fits it wrote into a fresh tmpdir."""
    box_extent = ((-HALF_EXTENT_PC, HALF_EXTENT_PC),) * 3
    box_shape = (res, res, res)
    box_arg = f"{box_shape!r}::{box_extent!r}"
    out_dir = tempfile.mkdtemp(prefix=f"edenhofer-interp-{res}-")
    print(f"[extractDustCube] res={res}: interp2box.py --box {box_arg}")
    subprocess.run(
        [sys.executable, INTERP_SCRIPT, FITS_PATH, "-o", out_dir, "-b", box_arg],
        check=True,
    )
    outputs = glob.glob(os.path.join(out_dir, "*.fits"))
    if len(outputs) != 1:
        shutil.rmtree(out_dir, ignore_errors=True)
        sys.exit(f"expected exactly one .fits in {out_dir}, found {outputs}")
    return outputs[0]


def write_tier(res: int) -> None:
    fits_path = run_interp2box(res)
    out_dir = os.path.dirname(fits_path)
    try:
        mean_zyx = None
        std_zyx = None
        with fits.open(fits_path, "readonly") as hdul:
            for hdu in hdul:
                # interp2box.py names HDUs "Mean" / "Std." (mixed case);
                # it lowercases before comparing itself (get_sphere), so we
                # mirror that rather than assuming FITS uppercases EXTNAME.
                name = hdu.name.lower()
                if name == "mean":
                    mean_zyx = np.asarray(hdu.data, dtype=np.float32)
                elif name == "std.":
                    std_zyx = np.asarray(hdu.data, dtype=np.float32)
        if mean_zyx is None or std_zyx is None:
            sys.exit(f"{fits_path}: missing MEAN or STD. HDU (interp2box.py output changed?)")

        # interp2box.py writes ZYX order ("akin to the Green2019 et al.
        # map" -- its own comment). tools/volumes/buildDustVolume.ts +
        # packLogTraceVoxels expect C-order X-slowest (the
        # export_metadata.txt / MCPM convention); (2,1,0) undoes the
        # reversal.
        mean_xyz = np.ascontiguousarray(np.transpose(mean_zyx, (2, 1, 0)))
        std_xyz = np.ascontiguousarray(np.transpose(std_zyx, (2, 1, 0)))

        # interp2box.py leaves NaN outside the map's 69-1250 pc radial
        # support -- the inner hole and the corners of this +-1250 pc cube
        # (reaching ~2165 pc), ~half the voxels. Zero is the correct fill
        # for an extinction field: no data means no dust.
        mean_xyz = np.nan_to_num(mean_xyz, nan=0.0)
        std_xyz = np.nan_to_num(std_xyz, nan=0.0)

        os.makedirs(CACHE_DIR, exist_ok=True)
        mean_out = os.path.join(CACHE_DIR, f"edenhofer_mean_{res}.npy")
        std_out = os.path.join(CACHE_DIR, f"edenhofer_std_{res}.npy")
        np.save(mean_out, mean_xyz)
        np.save(std_out, std_xyz)
        print(
            f"  wrote {mean_out} / {std_out}  shape={mean_xyz.shape}  "
            f"mean(mean)={mean_xyz.mean():.4g}  mean(std)={std_xyz.mean():.4g}"
        )
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


def main() -> None:
    ensure_inputs()
    for res in RESOLUTIONS:
        write_tier(res)
    print("done.")


if __name__ == "__main__":
    main()
