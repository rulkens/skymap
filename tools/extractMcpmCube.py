#!/usr/bin/env python3
"""
extractMcpmCube.py — one-shot maintainer script.

Reads the SDSS DR17 Cosmic Slime VAC `SDSS_z_44-476mpc` cube via pyslime
into a 712 x 1200 x 728 array (loaded as f16 from disk, immediately
upcast to f32 so the block-averaging downstream doesn't lose precision
on the heavy-tailed slime trace), block-averages by factors {8, 4, 2},
and writes the three downsampled cubes as .npy files in data/raw/mcpm/.

Run once per VAC release.  The .npy outputs get uploaded to R2 (see
tools/syncR2.ts EXTRA_FILES); contributors curl them instead of running
this script.

Inputs (both required, alongside this script's RAW_DIR):
    data/raw/mcpm/trace.bin           — the uncompressed cube (~2.3 GB)
    data/raw/mcpm/export_metadata.txt — pyslime needs this for grid_res

If only `trace.bin.bz2` is present (the SAS upstream's compressed
distribution) this script auto-decompresses it on first run.  The .bz2
is left in place so subsequent runs skip the decompression cost; the
expanded .bin (~2.3 GB) is gitignored alongside it.

Dependencies (maintainer-only): see data/raw/mcpm/README.md for the
project-local venv setup.

Usage:
    .venv/bin/python tools/extractMcpmCube.py
    # writes mcpm_sdss_d{8,4,2}.npy into data/raw/mcpm/

Verification:
    Prints (min, max, mean, p99) of the trace values and the sample at
    world (0, 0, 0).  The latter should be a non-trivial value — near-
    zero would suggest pyslime returned axes in a different order than
    export_metadata.txt implies (see CF-4 commit c6024d3 for the
    precedent surprise — "transpose numpy axes 0↔2 to match WebGPU
    x-fastest layout").  If that happens, the build script in
    tools/buildMcpmVolume.ts already does the WebGPU-axis transpose;
    this script just needs to ensure the .npy ends up in (X, Y, Z)
    order matching export_metadata.txt's (712, 1200, 728).
"""
import bz2
import os
import shutil
import sys
import numpy as np
from pyslime import slime  # provided by pip install pyslime
from skimage.transform import downscale_local_mean

RAW_DIR = "data/raw/mcpm"
TRACE_BIN = os.path.join(RAW_DIR, "trace.bin")
TRACE_BZ2 = os.path.join(RAW_DIR, "trace.bin.bz2")
META_FILE = os.path.join(RAW_DIR, "export_metadata.txt")
EXPECTED_SHAPE = (712, 1200, 728)
GRID_CENTER_MPC = np.array([-239.469, -16.5618, 201.275])
BASE_VOXEL_EDGE_MPC = 0.78131  # 556.288 / 712 (matches export_metadata.txt)
FACTORS = (8, 4, 2)


def ensure_uncompressed_trace() -> None:
    """Ensure RAW_DIR has an uncompressed trace.bin (decompresses .bz2 if needed)."""
    if os.path.exists(TRACE_BIN):
        return
    if not os.path.exists(TRACE_BZ2):
        sys.exit(
            f"missing {TRACE_BIN} (and {TRACE_BZ2} not present either).\n"
            "  Maintainer: download the upstream blob via\n"
            f"    curl -L -o {TRACE_BZ2} \\\n"
            "      https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/trace.bin.bz2"
        )
    print(f"decompressing {TRACE_BZ2} → {TRACE_BIN} ... (~30s, 345 MB → 2.3 GB)")
    with bz2.open(TRACE_BZ2, "rb") as src, open(TRACE_BIN, "wb") as dst:
        shutil.copyfileobj(src, dst, length=1 << 22)


def ensure_metadata() -> None:
    """Pyslime requires export_metadata.txt to read grid dims."""
    if not os.path.exists(META_FILE):
        sys.exit(
            f"missing {META_FILE}.\n"
            "  Maintainer: download via\n"
            f"    curl -L -o {META_FILE} \\\n"
            "      https://data.sdss.org/sas/dr17/env/EBOSS_LSS/mcpm/v1_0_1/datacube/SDSS_z_44-476mpc/export_metadata.txt"
        )


def load_cube() -> np.ndarray:
    ensure_uncompressed_trace()
    ensure_metadata()
    print(f"loading {TRACE_BIN} via pyslime.Slime.from_dir({RAW_DIR}) ...")
    # pyslime's default dtype is np.float16, but the SDSS_z_44-476mpc
    # release ships trace.bin as float32 (2.3 GB on disk = 712*1200*728*4
    # bytes).  Reading as f16 produces a 2x-sized array that fails the
    # subsequent reshape with `cannot reshape array of size 1244006400 into
    # shape (728,1200,712)` — the ratio is exactly 2.0, the giveaway.
    # We pass dtype=np.float32 explicitly to match the bytes on disk.
    #
    # Side benefit: f32 is the precision we need anyway for the
    # downstream block-averaging — heavy-tailed trace values would
    # accumulate rounding error if averaged in f16 across 8³ = 512 cells.
    sl = slime.Slime.from_dir(RAW_DIR, dtype=np.float32)
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
    # Force C-order: skimage's downscale_local_mean returns a Fortran-order
    # view in some scikit-image versions, which `np.save` then writes with
    # `fortran_order=True` in the .npy header.  Our TS reader
    # (tools/parsers/npyReader.ts) only supports C-order arrays — easier
    # to guarantee C-order on the writer side than to teach the reader
    # about Fortran layout for one Python-only producer.
    small = np.ascontiguousarray(small)
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
