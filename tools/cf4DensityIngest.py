#!/usr/bin/env python3
"""
cf4DensityIngest.py — Maintainer-only ingest of the Valade 2024 CF-4
HAMLET 256³ DM density cube.

Reads the upstream IDL `.sav` file via `scipy.io.readsav`, extracts the
density-field array, validates shape (256, 256, 256) and dtype float32,
writes a flat NumPy `.npy` plus a sibling `.meta.json` with cosmology
constants.

Run once per upstream release (essentially never — CF-4 is a published
catalog, not a streaming feed). Contributors who don't have Python pull
the produced `.npy` + `.meta.json` from R2 instead.

Usage:
    python tools/cf4DensityIngest.py

The `.sav` variable name is undocumented in Valade 2024. Before running
this script for the first time, discover it:

    python -c "import scipy.io; print(list(scipy.io.readsav('data/raw/cf4/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav').keys()))"

Then update SAV_VARIABLE_NAME below and record the discovered name in
`data/raw/cf4/README.md`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy.io

# ── Configuration ──────────────────────────────────────────────────
SAV_PATH = Path("data/raw/cf4/CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav")
NPY_PATH = Path("data/raw/cf4/cf4_density_256.npy")
META_PATH = Path("data/raw/cf4/cf4_density_256.meta.json")

# REPLACE with the actual key after running the discovery one-liner above.
# Plausible candidates: 'delta', 'density', 'rho_over_rho_bar'.
SAV_VARIABLE_NAME = "delta"

# Cosmology constants from Valade et al. 2024.
HUBBLE_H = 0.746
BOX_SIZE_H_MPC = 1000.0
VOXEL_SIZE_H_MPC = BOX_SIZE_H_MPC / 256  # 3.90625


def main() -> int:
    if not SAV_PATH.exists():
        print(f"ERROR: {SAV_PATH} not found.", file=sys.stderr)
        print(
            "Download the .sav from https://projets.ip2i.in2p3.fr/cosmicflows/ and place it at the path above.",
            file=sys.stderr,
        )
        return 1

    print(f"Reading {SAV_PATH} ...")
    sav = scipy.io.readsav(str(SAV_PATH))
    keys = list(sav.keys())
    if SAV_VARIABLE_NAME not in keys:
        print(
            f"ERROR: variable '{SAV_VARIABLE_NAME}' not found in .sav. Available keys: {keys}",
            file=sys.stderr,
        )
        print(
            "Update SAV_VARIABLE_NAME in this script (and data/raw/cf4/README.md) to one of the above.",
            file=sys.stderr,
        )
        return 2

    arr = sav[SAV_VARIABLE_NAME]
    arr = np.asarray(arr, dtype=np.float32)
    if arr.shape != (256, 256, 256):
        print(
            f"ERROR: expected shape (256, 256, 256), got {arr.shape}",
            file=sys.stderr,
        )
        return 3

    print(
        f"Loaded delta cube: shape={arr.shape}, dtype={arr.dtype}, "
        f"min={arr.min():.3f}, max={arr.max():.3f}, mean={arr.mean():.3f}"
    )

    # NumPy default is C-order, which matches our SCFD x-fastest expectation
    # only after a transpose: numpy stores the last axis fastest, but our
    # cube semantics put X-axis fastest. The IDL .sav is typically
    # delivered in (z, y, x) order; verify by inspecting one slice and
    # transpose if needed. For now we save as-is and let buildCf4Density.ts
    # do the transpose into x-fastest.
    np.save(NPY_PATH, arr, allow_pickle=False)
    print(f"Wrote {NPY_PATH} ({NPY_PATH.stat().st_size} bytes)")

    meta = {
        "h": HUBBLE_H,
        "box_size_h_mpc": BOX_SIZE_H_MPC,
        "voxel_size_h_mpc": VOXEL_SIZE_H_MPC,
        "field_type": "delta",
        "coord_frame": "supergalactic_cartesian",
        "source": (
            "Valade et al. 2024 (HAMLET) "
            "CF4gp_corrected_v2_HAMLET_1000_256_g5_final.sav"
        ),
        "sav_variable_name": SAV_VARIABLE_NAME,
        "stats": {
            "min": float(arr.min()),
            "max": float(arr.max()),
            "mean": float(arr.mean()),
        },
    }
    META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"Wrote {META_PATH}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
