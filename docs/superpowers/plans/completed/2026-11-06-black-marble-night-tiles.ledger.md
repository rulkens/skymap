# SDD ledger — 2026-11-06-black-marble-night-tiles

Plan: docs/superpowers/plans/2026-11-06-black-marble-night-tiles.md
Branch: worktree-black-marble-night-tiles · base 47754f7fc (spec+plan)
Pre-flight: parallelism = one plan/one PR; perf gate = yes (owner's brief). Fetch ~250 MB approved (Vs3U).

Ruling (controller): added perf scenario `earth-copenhagen-500km` (d8a0cb94f) — `earth-surface` sits at ~21,000 km and engages no tiles, so it cannot price night — cost if wrong: one extra scenario row.
Perf before (runtime = main, port 5177, 60 frames): earth-surface MERGED 13.8 ms; earth-copenhagen-500km MERGED 25.5 ms, surface-tiles ≈0.2 ms real. Files: scratchpad/perf-before*.txt. Before shots: scratchpad/before-{cph50,cph500,eu3000}.jpg (t=2026-01-15T22:00Z, pose via scratchpad/pose.mjs).
Fetch: 8 Black Marble JPEGs in main data/raw/textures (215.6 MB).

D1 (Sonnet, 26 tool uses): 918e64f0d→51f07199a complete. Task 1: complete (2762eef1c) · Task 2: complete (485fe7b06; product is 2nd param) · Task 3: complete (51f07199a).

D2 (Opus): 51f07199a→0f71d9a3e complete. Task 4: complete (98d9587c3; tilePx dropped from SurfaceTileVerdict too; SurfaceTileLane type) · Task 5: complete (fc9e372d6; tests/support/requestBandsOf.ts) · Task 6: complete (0f71d9a3e; ranges left as tuples; ResidentLookupResult inline type pre-existing → adjacent finding).

Review T6 (Opus): pass, no issues; stale header path surfaceTileLayout.ts:4 → folded into T9.

Black Marble sha256 (for T10 README / textures.sha256): A1 f9e9a0fc…36f2 30,825,698 · A2 ed5c047b…3428 7,830,664 · B1 d0ef6a0b…74d11e 29,472,401 · B2 f56f36e2…aa9b 21,337,236 · C1 446fcc72…b3b5 59,097,456 · C2 f52cb69c…e44 13,553,256 · D1 449fdd6b…d442 39,122,860 · D2 295a0b58…9972 14,400,257 (full hashes: shasum in main data/raw/textures).
D3 (Opus): 0f71d9a3e→159aced60 complete; npm run build passes (WESL links). Task 7: complete (3ed21c038) · Task 8: complete (63fae7a20) · Task 9: complete (159aced60; NO_NIGHT_RECT const; fetchImageryPayload shared).

Review T9 (Opus): pass; stale "80-byte" in vertex.wesl:1 fixed inline (73b14a8f6). GPU: shot at 50 km on 5177 with the new code, no console errors besides SDSS 404s → fragmentEarth links/validates; no-data render matches before (global fallback).
D4 (Sonnet): 73b14a8f6→29cf83f0d complete. Task 10: complete (41bff4339; + ATTRIBUTIONS.md + fetchTextures test) · Task 11: complete (17aaac790) · Task 12: complete (29cf83f0d; sizes left for controller).

Task 13: complete (fetch 215.6 MB; perf before). Task 14: complete — bake --product night (cwd main): 10,912 tiles z3–z7, 11 archive files 41,187,928 B (albedo z3–z7 116,023,798 B); 93 albedo/height archives hash-identical; manifest global band builtFrom +night; R2 sync = 11 night files + manifest.json (32,383 B) ≈ 41.2 MB. buildSiteGroundHeights rewrote main's siteGroundHeights.generated.ts (perseverance drift 3e-5 m, pre-existing staleness, not this branch) → restored main's file to HEAD bytes.
Ruling (controller): night sampled clamped to its SLOT, not the leaf sub-rect (4caa65847) — eye check at 50 km showed texel steps at every leaf border — cost if wrong: none, sub-rect clamp was the bug.
Task 15: perf paired A/B (base 918e64f0d on 5179 vs branch 5177, alternating): earth-surface 14.1/14.1, 16.3/16.4 ms; earth-copenhagen-500km 29.4/25.5, 25.2/25.7 ms, surface-tiles real 0.3–0.4 both; perf:cpu plan:surface-tiles 0.54→0.59 ms, draw 0.049→0.058. Neutral. Scratch wt removed. After shots: scratchpad/after-*.jpg.

Final review (Opus): ship after small fixes — 8 findings (2 medium: lane rule vs derivePlannerParams + unguarded builtFrom; night bake loop duplicated). Fix round (Opus): a9dcb2cad→6a00c5a68 complete, all 8 (lanes from requestBands via plan.params; bakeImageryPyramid; ~1.4 GB; engaged; ImageryQuadrant to @types; cutWithSharedBands). GPU re-shot cph500 OK.
Task 16: /feature-done — full suite 1811 files / 23,593 tests pass, typecheck clean; deletion audit ~18 LOC, safe-now applied 059a2bdb4 (report: deletion-audit-whole-branch.md); plan + spec moved to */completed/ via move-files; ledger archived.

Dispatches: D1 = T1–T3 (tools prep, Sonnet) · D2 = T4–T6 (runtime prep, Opus; T6 review:yes) · D3 = T7–T9 (runtime feature, Opus; T9 review:yes) · D4 = T10–T12 (tools feature + docs, Sonnet) · T13–T16 controller.

