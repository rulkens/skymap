#!/usr/bin/env python3
"""
extractMcpmCube.py — one-shot maintainer script.

Reads data/raw/mcpm/trace.bin.bz2 (the SDSS DR17 Cosmic Slime VAC
`SDSS_z_44-476mpc` cube, ~345 MB compressed), decompresses + parses via
pyslime into a 712 x 1200 x 728 float32 array, block-averages by factors
{8, 4, 2}, and writes the three downsampled cubes as .npy files alongside
the input.

Run once per VAC release. The .npy outputs get uploaded to R2 (see
tools/syncR2.ts EXTRA_FILES); contributors curl them instead of running
this script.

Dependencies (maintainer-only):
    pip install pyslime numpy scikit-image

Usage:
    python tools/extractMcpmCube.py
    # writes mcpm_sdss_d{8,4,2}.npy into data/raw/mcpm/

Verification:
    The script prints (min, max, mean, p99) of the trace values and the
    sample at world (0, 0, 0). The latter should be near a local-density
    peak — a near-zero sample would suggest pyslime returned axes in a
    different order than export_metadata.txt implies (see CF-4 commit
    c6024d3 for the precedent surprise — "transpose numpy axes 0↔2 to
    match WebGPU x-fastest layout"). If that happens, the build script
    in tools/buildMcpmVolume.ts already does the WebGPU-axis transpose;
    this script just needs to ensure the .npy is in (X, Y, Z) order
    matching export_metadata.txt's (712, 1200, 728).
"""
import os
import sys
import numpy as np
from pyslime import slime  # provided by pip install pyslime
from skimage.transform import downscale_local_mean

RAW_DIR = "data/raw/mcpm"
INPUT = os.path.join(RAW_DIR, "trace.bin.bz2")
EXPECTED_SHAPE = (712, 1200, 728)
GRID_CENTER_MPC = np.array([-239.469, -16.5618, 201.275])
BASE_VOXEL_EDGE_MPC = 0.78131  # 556.288 / 712 (matches export_metadata.txt)
FACTORS = (8, 4, 2)


def load_cube() -> np.ndarray:
    if not os.path.exists(INPUT):
        sys.exit(
            f"missing {INPUT}\n"
            "  Maintainer: download from\n"
            "    https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/trace.bin.bz2"
        )
    print(f"loading {INPUT} via pyslime ...")
    sl = slime.Slime.from_file(INPUT)
    arr = np.asarray(sl.data, dtype=np.float32)
    if arr.shape != EXPECTED_SHAPE:
        sys.exit(
            f"unexpected shape {arr.shape}; expected {EXPECTED_SHAPE} per export_metadata.txt"
        )
    return arr


def sanity_check(arr: np.ndarray) -> None:
    print(
        f"trace stats: min={arr.min():.3g}, max={arr.max():.3g}, "
        f"mean={arr.mean():.3g}, p99={np.percentile(arr, 99):.3g}"
    )
    # World (0,0,0) sample. The voxel index for world position p is
    # (p - origin) / voxelSize, where origin = grid_center - grid_size/2.
    origin = GRID_CENTER_MPC - 0.5 * np.array(EXPECTED_SHAPE) * BASE_VOXEL_EDGE_MPC
    idx = ((np.zeros(3) - origin) / BASE_VOXEL_EDGE_MPC).astype(int)
    if (0 <= idx).all() and (idx < EXPECTED_SHAPE).all():
        print(f"world (0,0,0) sample: arr[{tuple(idx)}] = {arr[tuple(idx)]:.3g}")
        print("  (expect a non-trivial value; near-zero suggests an axis-order issue)")
    else:
        print(f"world (0,0,0) maps to voxel idx {tuple(idx)} — outside cube; investigate")


def write_tier(arr: np.ndarray, factor: int) -> None:
    out = os.path.join(RAW_DIR, f"mcpm_sdss_d{factor}.npy")
    print(f"downsampling by {factor}x ...")
    if factor == 1:
        small = arr
    else:
        small = downscale_local_mean(arr, (factor, factor, factor)).astype(np.float32)
    np.save(out, small)
    sizeMB = os.path.getsize(out) / 1024 / 1024
    print(f"  wrote {out}  shape={small.shape}  ({sizeMB:.1f} MB)")


def main() -> None:
    arr = load_cube()
    sanity_check(arr)
    for f in FACTORS:
        write_tier(arr, f)
    print("done.")


if __name__ == "__main__":
    main()
