#!/usr/bin/env python3
"""
extractPolyphormExport.py — convert one Polyphorm MCPM export folder's raw
trace.bin (headerless f16, C-order z*W*H + y*W + x) into block-mean
-downsampled `.npy` + `polyphy-trace` v1 sidecar `.json` tiers for
tools/volumes/buildRhizomeVolume.ts. Cascades d4 = block-mean(d2, 2), d8 =
block-mean(d4, 2) instead of downsampling from source at each factor —
exact, since block-mean over equal-sized partitions is associative.

Usage:
    python3 tools/volumes/extractPolyphormExport.py <export-dir> <out-prefix>
    # writes <out-prefix>_d8.npy/.json, _d4.npy/.json, _d2.npy/.json
"""
import json
import os
import re
import sys

import numpy as np

# Cascade order: each step halves resolution once more; cumulative factor
# (2, then 4, then 8) is what gets recorded in the sidecar/filename.
CASCADE_STEPS = (2, 2, 2)


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


def block_mean(arr: np.ndarray, factor: int) -> np.ndarray:
    D, H, W = arr.shape
    if D % factor or H % factor or W % factor:
        sys.exit(f"dims ({D},{H},{W}) not evenly divisible by {factor}")
    Dd, Hd, Wd = D // factor, H // factor, W // factor
    return arr.reshape(Dd, factor, Hd, factor, Wd, factor).mean(axis=(1, 3, 5), dtype=np.float32)


def write_tier(
    small: np.ndarray,
    factor: int,
    meta: dict,
    export_dir: str,
    out_prefix: str,
) -> None:
    W, H, D = meta["res_whd"]
    size_w, size_h, size_d = meta["size_whd_mpc"]
    center_w, center_h, center_d = meta["center_whd_mpc"]
    Dd, Hd, Wd = small.shape

    print(
        f"trace stats (d{factor}, shape=(D,H,W)=({Dd},{Hd},{Wd})): "
        f"min={small.min():.4g}, max={small.max():.4g}, mean={small.mean():.4g}, "
        f"p99={np.percentile(small, 99):.4g}"
    )

    # buildRhizomeVolume/packLogTraceVoxels expect C-order (X, Y, Z) with X
    # slowest, Z fastest (sidecar.dims order) — our array is (Z, Y, X)
    # (D,H,W order); swap axes 0<->2 and force contiguity (a transpose()
    # view keeps Fortran strides, which np.save would encode as
    # fortran_order=True — npyReader.ts only reads C-order).
    xyz = np.ascontiguousarray(small.transpose(2, 1, 0))

    npy_path = f"{out_prefix}_d{factor}.npy"
    os.makedirs(os.path.dirname(npy_path) or ".", exist_ok=True)
    np.save(npy_path, xyz)
    size_mb = os.path.getsize(npy_path) / 1024 / 1024
    print(f"wrote {npy_path} (dims=(X,Y,Z)={xyz.shape}, {size_mb:.1f} MB)")

    # Per-axis voxel edge at the downsampled resolution; origin is the
    # LOWER CORNER of voxel (0,0,0) — the grid's total physical extent is
    # unchanged by downsampling, so origin = center - size/2 regardless of
    # the downsample factor.
    voxel_w = (size_w / W) * factor
    voxel_h = (size_h / H) * factor
    voxel_d = (size_d / D) * factor
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
            "downsample_factor": factor,
        },
    }
    json_path = f"{out_prefix}_d{factor}.json"
    with open(json_path, "w", encoding="ascii") as f:
        json.dump(sidecar, f, indent=2)
    print(f"wrote {json_path}")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(f"usage: {sys.argv[0]} <export-dir> <out-prefix>")
    export_dir, out_prefix = sys.argv[1], sys.argv[2]

    meta = parse_metadata(os.path.join(export_dir, "export_metadata.txt"))
    W, H, D = meta["res_whd"]

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
    current = raw.astype(np.float32)
    del raw

    cumulative = 1
    for step in CASCADE_STEPS:
        current = block_mean(current, step)
        cumulative *= step
        write_tier(current, cumulative, meta, export_dir, out_prefix)


if __name__ == "__main__":
    main()
