#!/usr/bin/env python3
"""extractFlowField.py — one-off CF4++ velocity-cube extractor for skymap's
flow-field layer.

Run once per CF4++ npz release. Reads the upstream
`CF4pp_mean_std_grids.npz` (Courtois 2025), packs the mean velocity field
+ mean overdensity into a flat RGBA16F blob the WebGPU renderer uploads as
a 128³ texture_3d, and emits a JSON sidecar describing the cube's frame.
Output is gitignored (a build artefact, like `public/data/*.bin`); the TS
wrapper (Task 4) re-reads both files and registers the texture.

  Channel packing (per voxel, float16):
    R = v_SGX   (velocity component along supergalactic X)
    G = v_SGY
    B = v_SGZ
    A = δ        (overdensity, d_mean_CF4pp)

Speed is just length(rgb), recomputed in-shader, so the alpha channel is
free to carry the real density field — which drives density-weighted
particle seeding far better than a velocity-divergence proxy.

================================ Frame correctness ============================

This extractor REPLICATES the spatial frame handling that
`tools/volumes/buildCf4Density.ts` established for the *shared* CF4++
density cube. The velocity cube and the density cube come from the same
167 MB npz on the same 128³ grid, so they MUST co-register voxel-for-voxel
in the renderer — same origin, same voxel size, same memory layout, same
SG→world rotation. Getting any of these wrong would slide the velocity
field off the density field it is supposed to flow through.

This replaces the throwaway spike at
`tools/cosmic-flow/data/convertCf4ppVfield.py`, whose docstring explicitly
declared frame alignment "intentionally ignored" ("We label the three
array axes z,y,x arbitrarily"). The spike's job was only to prove the flow
*looks* coherent in 3D, and flow coherence is frame-invariant. Integrating
into the real renderer is the opposite: every axis is load-bearing. The
three corrections vs. the spike:

1. Memory transpose (axis-0 = SGX → WebGPU x-fastest).
   numpy `.npz` arrays are C-order with shape (N,N,N): axis 0 = SGX
   (slowest in memory), axis 1 = SGY, axis 2 = SGZ (fastest). numpy stores
   array[i,j,k] at linear offset i*N*N + j*N + k — the LAST index varies
   fastest. WebGPU's writeTexture (with bytesPerRow = N*bytesPerVoxel,
   rowsPerImage = N) reads the flat buffer x-FASTEST: texture coordinate
   (xt,yt,zt) reads offset zt*N*N + yt*N + xt — the FIRST coordinate varies
   fastest. A straight copy would land SGZ in WebGPU's x-axis and SGX in
   its z-axis, swapping the cube's X and Z vs. the model matrix's
   local-x = SGX assumption.

   buildCf4Density.ts fixes this with an explicit pack loop writing each
   input cell (i,j,k) to outputIdx = k*N*N + j*N + i. The same relocation,
   established and validated by that build's `auditCf4Anchors` step (which
   confirmed rendered overdensity blobs land on known cluster positions),
   applies unchanged here. We express it with a single numpy transpose —
   see the proof at the pack site below that it produces the identical
   outputIdx mapping.

2. Velocity components stay in native SG order — NO permutation, NO sign
   flip. *** LOAD-BEARING ASSUMPTION ***
   `v_mean_CF4pp` components are SG-Cartesian, aligned with the grid's
   position axes: component 0 = v along SGX, component 1 = v along SGY,
   component 2 = v along SGZ — the SAME axis-0 = SGX convention the density
   build assumes for *positions*. The memory transpose RELOCATES each
   vector to its x-fastest slot but does NOT rotate the basis (the
   component axis is the last array axis and is left untouched by the
   spatial transpose). So R stays v_SGX, G stays v_SGY, B stays v_SGZ.
   If a future CF4++ release ever stores velocity in a different basis
   (e.g. radial/tangential, or a permuted/handedness-flipped Cartesian),
   the infall direction would point the wrong way and THIS is the line to
   fix. The one empirical check that proves the assumption can only be done
   against the real npz — see the maintainer note at the bottom.

3. Physical Mpc, NOT Mpc/h.
   CF4++ ships a 1000 Mpc box in *physical* Mpc (the upstream loader
   treats coordinates as plain Mpc, matching buildCf4Density's
   CF4PP_VOXEL_SIZE_MPC = 1000/128). The spike's `boxMpcPerH` sidecar key
   was a misnomer; this extractor emits `boxMpc` + `voxelSizeMpc` instead.

==============================================================================

You cannot rebuild this from the committed repo alone — the 167 MB npz is
maintainer-only (gitignored, never on R2). After a fresh extraction the
maintainer must eyeball that infall points toward known attractors (Great
Attractor / Shapley); see the note at the bottom of this file.
"""

import json
import sys

import numpy as np

# Box / voxel geometry — mirror buildCf4Density.ts exactly so the velocity
# cube co-registers with the density cube. 1000 Mpc on a 128³ grid in
# *physical* Mpc (not Mpc/h). N is read from the array below and asserted to
# match, so a future resolution change is caught rather than silently mis-scaled.
BOX_MPC = 1000.0
FRAME_KIND = "supergalactic-cartesian"

# CLI paths with production defaults so the TS wrapper (Task 4) can forward
# rawDataPath('cf4.vfield-npz') etc. The npz lives at data/raw/cf4/ — the same
# directory the density slice is sliced from (one file, two consumers).
#
# Accept either NO positional args (all production defaults) or ALL THREE
# explicitly. A partial list would silently pair a caller-supplied input with
# a default output path — e.g. pass <npz> + <out.bin> but forget <out.json>
# and the sidecar lands at the default location next to someone else's blob.
# Task 4's wrapper always forwards all three, so the common paths are 0 or 3.
if len(sys.argv) not in (1, 4):
    sys.exit("usage: extractFlowField.py [<npz> <out.bin> <out.json>]  (all three or none)")
SRC = sys.argv[1] if len(sys.argv) > 1 else "data/raw/cf4/CF4pp_mean_std_grids.npz"
OUT_BIN = sys.argv[2] if len(sys.argv) > 2 else "public/data/flowfield.bin"
OUT_META = sys.argv[3] if len(sys.argv) > 3 else "public/data/flowfield.json"


def main() -> None:
    # ── 1. Load + operator log ────────────────────────────────────────────
    # Print every key + shape so a maintainer running this against a new
    # release can spot a renamed/restructured array before trusting the output.
    npz = np.load(SRC)
    print("npz keys:", list(npz.keys()))
    for key in npz.keys():
        arr = npz[key]
        print(f"  {key}: shape={arr.shape} dtype={arr.dtype}")

    # ── 2. Velocity → (N,N,N,3), native SG component order ────────────────
    # Accept either leading (3,N,N,N) or trailing (N,N,N,3) component layout,
    # exactly as the spike did. np.moveaxis only relocates the COMPONENT axis
    # to the end — it does NOT touch the three spatial axes, so the SG
    # (i,j,k) = (SGX,SGY,SGZ) position convention is preserved.
    # Upcast to f32 for the norm/percentile reductions in §4 — f16 would lose
    # precision across a 2M-voxel speed distribution. The packed payload is
    # re-cast back to f16 at the RGBA assignment in §5; f32 lives only here.
    v = npz["v_mean_CF4pp"].astype(np.float32)
    print("v_mean raw shape:", v.shape)
    if v.ndim == 4 and v.shape[0] == 3:  # (3,N,N,N)
        v = np.moveaxis(v, 0, -1)
    elif v.ndim == 4 and v.shape[-1] == 3:  # (N,N,N,3)
        pass
    else:
        sys.exit(f"unexpected v_mean shape {v.shape}")

    n = v.shape[0]
    assert v.shape == (n, n, n, 3), v.shape

    # ── 3. Overdensity δ → (N,N,N), same spatial layout as velocity ───────
    delta = npz["d_mean_CF4pp"].astype(np.float32)
    assert delta.shape == (n, n, n), delta.shape

    # ── 4. Stats for the sidecar + operator log ───────────────────────────
    # Speed (km/s) and δ percentiles drive the runtime's normalisation /
    # colour mapping; p99 gives a robust upper bound that ignores the rare
    # extreme voxel that would otherwise crush the dynamic range.
    speed = np.linalg.norm(v, axis=-1)
    speed_max = float(speed.max())
    speed_p99 = float(np.percentile(speed, 99))
    delta_max = float(delta.max())
    delta_p99 = float(np.percentile(delta, 99))
    print(
        f"N={n}  speed km/s: min={speed.min():.1f} max={speed_max:.1f} "
        f"mean={speed.mean():.1f} p99={speed_p99:.1f}"
    )
    print(
        f"delta: min={delta.min():.2f} max={delta_max:.2f} "
        f"mean={delta.mean():.2f} p99={delta_p99:.2f}"
    )

    # ── 5. Pack RGBA in natural SG (i,j,k) order, then transpose to x-fastest
    # Build the natural array first: rgba[i, j, k, :] holds SG cell (i,j,k),
    # with rgb = native-SG velocity (no permutation, no sign flip — see the
    # docstring's load-bearing assumption) and a = δ.
    rgba = np.empty((n, n, n, 4), dtype=np.float16)
    rgba[..., :3] = v.astype(np.float16)
    rgba[..., 3] = delta.astype(np.float16)

    # Memory transpose: swap the two outer SPATIAL axes (0 ↔ 2), leaving the
    # COMPONENT axis (last) untouched. After the transpose a C-order .tofile
    # writes the buffer x-fastest, co-registering with the density cube.
    #
    # Proof this equals buildCf4Density.ts's outputIdx = k*N*N + j*N + i:
    #   Let t = np.transpose(rgba, (2, 1, 0, 3)), so t[a,b,c,d] = rgba[c,b,a,d].
    #   SG cell (i,j,k) lives in rgba[i,j,k,:], hence in t at [k,j,i,:]
    #   (because t[k,j,i,d] = rgba[i,j,k,d]).
    #   A C-order .tofile writes t[a,b,c,d] at linear element offset
    #     a*N*N*4 + b*N*4 + c*4 + d.
    #   So SG cell (i,j,k)'s voxel base (d=0) lands at
    #     k*N*N*4 + j*N*4 + i*4  ==  4 * (k*N*N + j*N + i).
    #   Divide by the 4 components per voxel → outputIdx = k*N*N + j*N + i. ∎
    #   The component axis is NOT transposed, so within each voxel the RGBA
    #   order is preserved and R=v_SGX still holds after relocation.
    #
    # np.ascontiguousarray materialises a C-contiguous copy (np.transpose
    # only returns a view) so .tofile walks memory in the proven order.
    out = np.ascontiguousarray(np.transpose(rgba, (2, 1, 0, 3)))
    out.tofile(OUT_BIN)

    # ── 6. Origin: voxel (0,0,0) lower corner in SG-Cartesian Mpc ─────────
    # The CF4++ cube is observer-centred, so voxel (N/2,N/2,N/2) sits at the
    # origin and voxel (0,0,0)'s lower corner is -voxelSize·(N/2) per axis —
    # identical to buildCf4Density.ts step §4.
    voxel_size_mpc = BOX_MPC / n
    origin = [
        -voxel_size_mpc * (n / 2),
        -voxel_size_mpc * (n / 2),
        -voxel_size_mpc * (n / 2),
    ]

    # ── 7. Sidecar JSON ───────────────────────────────────────────────────
    # Keys the Phase-B loader + Task-4 frame helper consume. We drop the
    # spike's misnomer boxMpcPerH/layout keys in favour of the corrected
    # frame description (boxMpc/voxelSizeMpc/origin/frameKind), and keep
    # `format` as a self-describing tag for the binary blob.
    meta = {
        "n": int(n),
        "boxMpc": BOX_MPC,
        "voxelSizeMpc": voxel_size_mpc,
        "origin": origin,
        "frameKind": FRAME_KIND,
        "format": "rgba16float",
        "speedKmsMax": speed_max,
        "speedKmsP99": speed_p99,
        "deltaMax": delta_max,
        "deltaP99": delta_p99,
    }
    with open(OUT_META, "w") as f:
        json.dump(meta, f, indent=2)

    # ── 8. Confirm what we did to the operator log ────────────────────────
    print(
        f"transpose: axes (2,1,0,3) [x-fastest, components untouched]; "
        f"components: native SG order (R=v_SGX, G=v_SGY, B=v_SGZ, A=delta)"
    )
    print(
        f"frame: {FRAME_KIND}, voxelSizeMpc={voxel_size_mpc:.4f} (physical Mpc), "
        f"origin={origin}"
    )
    print("wrote", OUT_BIN, "and", OUT_META)

    # ── Maintainer note (one-time empirical check, real data only) ────────
    # There is no automated test for the velocity BASIS here — Task 4 adds a
    # TS frame test and validates the output byte length, but it cannot tell
    # whether R really is v_SGX. The only proof of the load-bearing
    # native-SG-component assumption (docstring point 2) is to render the
    # field once and confirm infall converges on KNOWN attractors: bulk flow
    # toward the Great Attractor (~SG +x region) and the Shapley
    # Concentration beyond it. If the flow instead diverges, or converges on
    # the wrong sky position, the component basis or a sign is off — start
    # debugging at the rgba[..., :3] assignment above.


if __name__ == "__main__":
    main()
