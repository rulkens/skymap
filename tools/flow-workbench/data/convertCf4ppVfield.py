#!/usr/bin/env python3
"""Cosmic Flow — one-off extractor. Convert the CF4++ velocity grid to a flat
f16 RGBA blob the WebGPU tool can upload as a 128^3 texture_3d.

This is the Cosmic Flow tool's field-asset generator. It runs once per CF4++
npz release and writes `tools/cosmic-flow/public/cf4pp_vfield.{bin,json}`,
which are gitignored build artefacts (like `public/data/*.bin`). Re-run it via
`python3 tools/cosmic-flow/data/convertCf4ppVfield.py` after fetching a new npz.

The release npz holds six 128^3 arrays over a 1000 Mpc/h supergalactic box.
We pack RGBA16F: R=vx, G=vy, B=vz, A=overdensity delta (d_mean_CF4pp), laid out
C-order [z][y][x] so a WebGPU writeTexture (x fastest, then y, then depth z)
lands each voxel in place. Speed is just length(rgb), recomputed in-shader, so
the alpha channel is free to carry the real density field — which drives the
density-weighted particle seeding far better than a velocity-divergence proxy.

Coordinate alignment with skymap's frame is intentionally ignored here: the
flow viz only needs to prove the flow *looks* coherent in 3D, and flow
coherence is frame-invariant. We label the three array axes as z,y,x
arbitrarily.
"""
import json
import sys
import numpy as np

SRC = "data/raw/cf4pp/CF4pp_mean_std_grids.npz"
OUT_BIN = "tools/cosmic-flow/public/cf4pp_vfield.bin"
OUT_META = "tools/cosmic-flow/public/cf4pp_vfield.json"

z = np.load(SRC)
print("npz keys:", list(z.keys()))
for k in z.keys():
    a = z[k]
    print(f"  {k}: shape={a.shape} dtype={a.dtype}")

v = z["v_mean_CF4pp"].astype(np.float32)
print("v_mean raw shape:", v.shape)

# Normalise to (N,N,N,3) regardless of whether components are leading/trailing.
if v.ndim == 4 and v.shape[0] == 3:        # (3,N,N,N)
    v = np.moveaxis(v, 0, -1)
elif v.ndim == 4 and v.shape[-1] == 3:     # (N,N,N,3)
    pass
else:
    sys.exit(f"unexpected v_mean shape {v.shape}")

N = v.shape[0]
assert v.shape == (N, N, N, 3), v.shape

speed = np.linalg.norm(v, axis=-1)
print(f"N={N}  speed km/s: min={speed.min():.1f} max={speed.max():.1f} "
      f"mean={speed.mean():.1f} p99={np.percentile(speed,99):.1f}")

# Overdensity contrast field (delta), same (i,j,k) spatial layout as the velocity.
delta = z["d_mean_CF4pp"].astype(np.float32)
assert delta.shape == (N, N, N), delta.shape
print(f"delta: min={delta.min():.2f} max={delta.max():.2f} "
      f"mean={delta.mean():.2f} p99={np.percentile(delta,99):.2f}")

# Pack RGBA = (vx, vy, vz, delta) as float16, C-order [z][y][x][c].
rgba = np.empty((N, N, N, 4), dtype=np.float16)
rgba[..., :3] = v.astype(np.float16)
rgba[..., 3] = delta.astype(np.float16)
rgba.tofile(OUT_BIN)

meta = {
    "n": int(N),
    "boxMpcPerH": 1000.0,
    "format": "rgba16float",
    "layout": "z-outer, y, x-inner, components xyz=velocity, w=overdensity delta",
    "speedKmsMax": float(speed.max()),
    "speedKmsP99": float(np.percentile(speed, 99)),
    "deltaMax": float(delta.max()),
    "deltaP99": float(np.percentile(delta, 99)),
}
with open(OUT_META, "w") as f:
    json.dump(meta, f, indent=2)
print("wrote", OUT_BIN, "and", OUT_META)
