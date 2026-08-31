# Earth tiles: descent "island in stars" below ~150 km

**Status:** shipped as a known issue with PR #617 (user ruling 2026-08-21);
re-examine after Plan 2 (surface navigation) lands — the camera/frame work may
move the ground under it.

**Symptom.** Descending over Søndermarken (the only region with z14–19 data),
somewhere below the base-globe fade (150–300 km) the screen shows only an
island of the deepest resident tiles (stepped union of the z19 block,
~530×170 m) surrounded by stars; coarser cut members (GD z14–18 rings, EOX
z8–13, base z4–7) produce no pixels. Zooming out makes the missing GD tiles
reappear. The debug panel shows a standing request count that does not appear
to drain (e.g. `53 req · 0 miss` while parked). The base-globe descent fade
(same PR) unmasked this — pre-fade, the globe covered it.

**Exonerated (hard evidence, 2026-08-21 diagnostics).**

- _Planner_ (`cutSurfaceTiles`): replayed offline with verbatim live inputs at
  ~149 m (cut=30) and ~15 m (cut=5): exact reproduction, and a ray-cast
  coverage grid found **zero uncovered on-screen ground cells** at both poses.
  At 15 m the visible ground (~37×29 m) is smaller than one z19 tile, so a
  5-tile cut is correct.
- _f32 matrix narrowing_: was a real, separate defect (planner fed an
  f32-narrowed MVP whose w-row cancels ~1e5× at low altitude → spurious
  bbox-culls). Fixed in `b388ba2c9` (composeBodyMvp stays f64; GPU callers
  narrow at upload). Improved the cut (21→30 at ~150 m) but did not remove
  the island symptom.
- _Projection divergence_: planner MVP, the draw chain (rebaseViewProj +
  narrowed NodeParams origins + mesh deltas, replicated f32-faithfully against
  `vertex.wesl`), and a pure-f64 pinhole ground truth all agree to ~0.001 px
  at the captured 89.5 m state. No NaN/denormal anywhere. An apparent scale
  gap in captures was an 8.7 m position skew between async debug outputs.
- _Horizon cull_: one-corner patchAngle underestimate was real and is fixed
  (`e0bdf59bd`), but the user-visible holes predate/survive it.

**Remaining suspects (untested).**

1. Fetch/residency stall: standing requests never resolving (missing files in
   the local GD tree for ring tiles at z15–18? queue starvation? isFailed
   handling), leaving ring regions without residency — and their cut entries
   dropped or falling back to nothing. Note this worktree serves z14–19 from
   `data/raw/geodanmark/soendermarken` via the vdemo symlink tree; production
   data paths differ. File counts there: z14=3, z16=32, z18=390 (plausible
   pyramid, but edge coverage unverified).
2. Per-tile draw loss between `getLastCut()` and pixels (instance packing,
   atlas rect degeneracy for ancestor-fallback rects).

**Next evidence (two items, one minute in the browser).** At a broken pose:
a `[tileprobe]`-style dump of the tile list the renderer receives (per-z
histogram — coarse tiles present or not?), and whether the panel's `req`
count drains to 0 while parked. The first discriminates suspect 1 vs 2
outright. The temp probes that produced earlier captures were reverted before
merge; re-add from the archived ledger's description if needed
(`docs/superpowers/plans/completed/2026-08-20-earth-rtc-surface-foundation.ledger.md`).
