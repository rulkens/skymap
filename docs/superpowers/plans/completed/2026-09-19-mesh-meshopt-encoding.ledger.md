# SDD ledger — plan: docs/superpowers/plans/2026-09-19-mesh-meshopt-encoding.md
Ruling: parallelism = this plan alone, serial dispatches in wt mesh-meshopt-format; perf gate NOT run — change is load-time only (decode measured 4 ms), no per-frame path touched — cost if wrong: a load hitch unmeasured; eye-check at T4 would show it
Grouping: D1 = T1 (Sonnet, Blender); D2 = T2+T3 (Opus, T3 review: yes); T4 controller
D1 T1: dispatched sonnet, BASE 4fe21386f
D1 T1: DONE sonnet 4fe21386f→0918ec67d (stop-check clear: 'material' objects exclusive; temporary triangles=150_000 on petunias row, T2 deletes it)
D2 T2+T3: dispatched opus, BASE 0918ec67d
D2 T2+T3: DONE opus 0918ec67d→dc784efb9→9bad50419 (extra: roundUpToMultiple util, 2 test helpers; jittered size-guard fixture)
R3 review: dispatched opus over dc784efb9..9bad50419
T4 prep: raw meshes copied; prebaked petunias 222249 tris (no decimation), perseverance 199482 tris; build-meshes THREW: petunias uv max 1.00316 (4 values), others within [0.001,0.999]
Ruling: writeMeshBinary clamps UVs within 0.01 of [0,1] and still throws beyond — Blender smart_project/pack spills a few verts ≤0.3% past the atlas edge; the guard's purpose is tiling UVs — cost if wrong: 4 petunia verts shift ≤13 texels at 4K
R3 review: DONE opus — spec ✅, 0 critical, 1 important (size guard weak), 6 minor
Ruling: DROP the ⅓ size-guard test — it misses 2 of 5 streams and trips by 0.7% on the third; an unquantised stream needs reader+writer changed together and shows in the network-panel smoke — cost if wrong: a size regression lands unnoticed until someone looks at sizes
Ruling: fix minors 1-4 and 6 (off-axis round-trip fixture, order-free buildMeshes position asserts, relative position slack, delete false header line, named element sizes); alignUp duplicate → ask user (adjacent) — cost: small diff growth
F1 fix round: dispatched sonnet, BASE 9bad50419
F1 fix round: DONE sonnet 9bad50419→5f689cbc1 (7 fixes, 23/23); build-meshes stopped at curiosity: main's curiosity prebake predates the #756 ground stamp → controller re-prebakes curiosity + mer
T4: re-prebaked curiosity+mer (main's were stale vs #756 ground stamp — main's post-merge list must add them); build-meshes OK 7 keys, 6.85 MB raw / 5.29 MB gz; committed generated rows 49659937d; dev :5176 with public/data = own meshes + symlinks to main's other entries + merged manifest
Merged main (#760 contact decal) 789045c93: conflicts meshFetcher/buildMeshes/BACKLOG resolved, restored near() for main's decal test; rebuilt meshes; regenerated b/c user saw no ground decal (branch predated #760)
Eye-check: decal ✅ (user). Main's curiosity/mer prebakes now current (#760) — no extra post-merge step
FINAL review: dispatched opus over b63b6e6bd3b488c2a67de6193604d43922e588dd..d0ac87218
FINAL review: DONE opus — 0 critical, 4 important (stale docs), 5 minor; controller fixed 1-8 inline b8cdf2dc6; user ruled fold alignUp → 24a8be212
DoD: eye-checks pass (petunias, perseverance, Hubble foil, decal); CI green 24a8be212; deletion audit dispatched opus
Deletion audit: opus, net -23 LOC safe-now applied 13f03822a; needs-ruling: decimate()/--triangles inactive today (keep recommended — JWST/add-mission need it); UV clamp KEPT (petunias hit 1.00316)
Landing: /feature-done READY; plan+spec → completed
