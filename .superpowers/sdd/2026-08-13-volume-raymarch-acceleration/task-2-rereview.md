## Re-review: fs_max trailing odd-dimension tap fix (commit 17c3b28b9)

**Verdict: ADDRESSED.** `tapRange(d, parentDim)` in `mipBlit3d.wesl` now
widens the last dst index's range to `[2d, parentDim-1]` whenever
`parentDim` is odd, applied per-axis (x, y via `in.clip`, z via new
`u.dstZ`), replacing the old fixed 2-wide/8-tap footprint whose x/y clamp
(`min(2*d+1, dim-1)`) was unreachable at floor-sized dst dims and whose z
came from a TS-precomputed `srcZLow`/`srcZHigh` pair with the same flaw.

Hand-traced both reviewer examples against the shipped formula:
- depth 91 → dstDim 45, last index d=44: `low=88`, `dstDim-1==44` and
  `91%2==1` → `high=90`. Taps z=88,89,90 — parent 90 now read.
- width 89 → dstDim 44, last index d=43: `low=86`, `dstDim-1==43` and
  `89%2==1` → `high=88`. Taps x=86,87,88 — parent 88 now read.
- Even axis / non-last d: condition is always false, `high=low+1`, exactly
  2-wide, `high` stays `≤ parentDim-1` (checked the general bound:
  `2*(dstDim-1)+1 = parentDim-1` when `parentDim` even) — no double-count,
  no OOB. Matches the report's "bit-for-bit identical to before the fix"
  claim for these cells.
- `parentDim=1` edge (top of chain): `dstDim=max(1,0)=1`, d=0,
  `1%2==1` → `high=0`, tap range `[0,0]` — correct single tap, no crash.

## New breakage from the fix diff

None found.

- `fs_box` body is byte-identical to before (only the file's header comment
  changed); the finding was already scoped to `fs_max` only.
- `MipBlit3dUniforms` shrank 20→16 bytes: `boxZ:f32(0), dstZ:u32(4),
  center:f32(8), halfRange:f32(12)`. TS scratch buffer writes match that
  exact field order and offsets (`Float32Array(scratch,0,1)[0]=boxZ`,
  `Uint32Array(scratch,4,1)[0]=dz`, `Float32Array(scratch,8,2)=[center,
  halfRange]`), and `uniformBuffer`/`scratch` are both resized to 16 to
  match. No padding needed (all-scalar struct, 4-byte member alignment,
  4×4=16).
- `dstZ` has exactly one consumer (`tapRange` z-axis call) — no stale
  reads of the removed `srcZLow`/`srcZHigh` anywhere in either file.
- `textureDimensions(srcTex)` (no level arg) is called against `srcView`,
  which is created with `baseMipLevel: src.level, mipLevelCount: 1` — a
  single-level view, so "level 0" as seen by the shader is the actual
  parent level, not the base of the full chain. This is the same pattern
  `fs_box` already relied on pre-fix (unchanged there); `fs_max` now uses
  the identical `dims.z` source for z that `fs_box` uses for its own depth
  lookup, so the two entry points are consistent.
- No backticks in the `.wesl` file.
- `vec3<i32>(textureDimensions(srcTex))` — valid WGSL (vec3<u32>→vec3<i32>
  constructor conversion), same pattern as the pre-fix `.xy` slice.

## Notes

- Worst-case tap count at a triple-odd corner cell rises from a fixed 8 to
  27 (3×3×3) — a correctness-driven cost, not a bug; only affects boundary
  cells, and `fs_max` runs once per (level, z-slice) pass, not per-frame.
- No new unit test was added; the report's rationale (x/y ranges derive
  from `@builtin(position)`, which has no TS-side equivalent to test
  against, and a shader-restating TS test wouldn't catch an independent
  class of bug) is consistent with the project's testing convention.
