#!/usr/bin/env python3
"""
extractPolyphormExport.py — convert one Polyphorm MCPM export folder's
raw trace.bin (headerless f16, C-order z*W*H + y*W + x) into a block-mean
-downsampled `.npy` + `polyphy-trace` v1 sidecar `.json`, ready for
tools/volumes/buildRhizomeVolume.ts.

Usage:
    python3 tools/volumes/extractPolyphormExport.py <export-dir> <out-basename>
    # writes <out-basename>.npy + <out-basename>.json

Dims/size/center are parsed from <export-dir>/export_metadata.txt, never
hardcoded — a re-export with a different grid needs no script edit.
"""
import json
import os
import re
import sys

import numpy as np

DOWNSAMPLE_FACTOR = 2


def parse_metadata(meta_path: str) -> dict:
    text = open(meta_path, encoding="ascii").read()
    res = re.search(r"simulation grid resolution:\s*([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)", text)
    size = re.search(r"simulation grid size:\s*([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)", text)
    center = re.search(
        r"simulation grid center:\s*\(([\d.+-]+),\s*([\d.+-]+),\s*([\d.+-]+)\)", text
    )
    npoints = re.search(r"number of data points:\s*(\d+)", text)
    agents = re.search(r"number of agents:\s*(\S+)", text)
    dataset = re.search(r"dataset:\s*(\S+)", text)
    if not (res and size and center):
        sys.exit(f"could not parse grid resolution/size/center from {meta_path}")
    return {
        # (W, H, D) — x-fastest, z-slowest, matching trace.bin's index formula.
        "res_whd": tuple(int(g) for g in res.groups()),
        "size_whd_mpc": tuple(float(g) for g in size.groups()),
        "center_whd_mpc": tuple(float(g) for g in center.groups()),
        "num_points": int(npoints.group(1)) if npoints else None,
        "num_agents": agents.group(1) if agents else None,
        "dataset": dataset.group(1) if dataset else None,
    }


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(f"usage: {sys.argv[0]} <export-dir> <out-basename>")
    export_dir, out_base = sys.argv[1], sys.argv[2]

    meta = parse_metadata(os.path.join(export_dir, "export_metadata.txt"))
    W, H, D = meta["res_whd"]
    size_w, size_h, size_d = meta["size_whd_mpc"]
    center_w, center_h, center_d = meta["center_whd_mpc"]

    trace_path = os.path.join(export_dir, "trace.bin")
    expected_bytes = W * H * D * 2  # f16
    actual_bytes = os.path.getsize(trace_path)
    if actual_bytes != expected_bytes:
        sys.exit(
            f"{trace_path}: size {actual_bytes} != {expected_bytes} expected for "
            f"{W}x{H}x{D} f16 (metadata/binary mismatch)"
        )

    print(f"reading {trace_path} ({actual_bytes / 1e9:.2f} GB, f16, shape (D,H,W)=({D},{H},{W}))")
    # index = z*W*H + y*W + x → C-order shape (D, H, W), x fastest.
    raw = np.fromfile(trace_path, dtype="<f2", count=D * H * W).reshape(D, H, W)
    # f16 loses precision under block-mean accumulation (same reasoning as
    # extractMcpmCube.py's upcast) — go to f32 before averaging.
    arr = raw.astype(np.float32)
    del raw

    if D % DOWNSAMPLE_FACTOR or H % DOWNSAMPLE_FACTOR or W % DOWNSAMPLE_FACTOR:
        sys.exit(f"dims ({D},{H},{W}) not evenly divisible by {DOWNSAMPLE_FACTOR}")
    Dd, Hd, Wd = D // DOWNSAMPLE_FACTOR, H // DOWNSAMPLE_FACTOR, W // DOWNSAMPLE_FACTOR
    print(f"block-mean downsampling {DOWNSAMPLE_FACTOR}x → (D,H,W)=({Dd},{Hd},{Wd})")
    small = arr.reshape(Dd, DOWNSAMPLE_FACTOR, Hd, DOWNSAMPLE_FACTOR, Wd, DOWNSAMPLE_FACTOR).mean(
        axis=(1, 3, 5), dtype=np.float32
    )
    del arr

    print(f"trace stats (downsampled): min={small.min():.4g}, max={small.max():.4g}, "
          f"mean={small.mean():.4g}, p99={np.percentile(small, 99):.4g}")

    # buildRhizomeVolume/packLogTraceVoxels expect C-order (X, Y, Z) with X
    # slowest, Z fastest (sidecar.dims order) — our array is (Z, Y, X)
    # (D,H,W order); swap axes 0<->2 and force contiguity (a transpose()
    # view keeps Fortran strides, which np.save would encode as
    # fortran_order=True — npyReader.ts only reads C-order).
    xyz = np.ascontiguousarray(small.transpose(2, 1, 0))
    del small
    print(f"transposed to (X,Y,Z)={xyz.shape}")

    npy_path = out_base + ".npy"
    os.makedirs(os.path.dirname(npy_path) or ".", exist_ok=True)
    np.save(npy_path, xyz)
    size_mb = os.path.getsize(npy_path) / 1024 / 1024
    print(f"wrote {npy_path} ({size_mb:.1f} MB)")

    # Per-axis voxel edge at the downsampled resolution; origin is the
    # LOWER CORNER of voxel (0,0,0) — the grid's total physical extent is
    # unchanged by downsampling, so origin = center - size/2 regardless of
    # the downsample factor.
    voxel_w = (size_w / W) * DOWNSAMPLE_FACTOR
    voxel_h = (size_h / H) * DOWNSAMPLE_FACTOR
    voxel_d = (size_d / D) * DOWNSAMPLE_FACTOR
    origin_w = center_w - size_w / 2
    origin_h = center_h - size_h / 2
    origin_d = center_d - size_d / 2

    sidecar = {
        "format": "polyphy-trace",
        "version": 1,
        "dims": [Wd, Hd, Dd],
        "origin_mpc": [origin_w, origin_h, origin_d],
        "voxel_size_mpc": [voxel_w, voxel_h, voxel_d],
        "frame": "equatorial-cartesian",
        "value_units": "raw MCPM trace density (unnormalised agent-deposit count)",
        "provenance": {
            "source": "Polyphorm MCPM simulation export",
            "export_dir": os.path.basename(os.path.normpath(export_dir)),
            "dataset": meta["dataset"],
            "num_data_points": meta["num_points"],
            "num_agents": meta["num_agents"],
            "downsample_factor": DOWNSAMPLE_FACTOR,
        },
    }
    json_path = out_base + ".json"
    with open(json_path, "w", encoding="ascii") as f:
        json.dump(sidecar, f, indent=2)
    print(f"wrote {json_path}")
    print(json.dumps(sidecar, indent=2))


if __name__ == "__main__":
    main()
