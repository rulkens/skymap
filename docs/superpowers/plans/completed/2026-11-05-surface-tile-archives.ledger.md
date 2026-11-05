# SDD ledger — plan: docs/superpowers/plans/2026-11-05-surface-tile-archives.md

Spec: docs/superpowers/specs/2026-11-05-surface-tile-archives-design.md. Branch worktree-pack-surface-tiles-archives, base e7f16163d, plan commit f9ec6cc89.

Ruling: no plan-start ask — one plan, one PR (owner ruled "everything on one PR"); perf gate runs because the owner's brief asked for before/after perf + loadtime — cost if wrong: one wasted perf run.
Ruling: dispatch grouping by locality, commit order T1,T5 | T2,T3 | T4,T7 | T6,T8,T9 — T5 (serve Range) rides with T1 (loadtime harness), T7 (collector) with T4 (bake) since both read the archive layout from disk; T6 last because its visual check needs T4's packed archives — cost if wrong: none, each task still one commit.

Pre-flight scan:
| tasks | shared | finding |
|---|---|---|
| T2→T6 | SurfaceTileSource, createLooseTileSource | T6 deletes T2's loose source; consistent |
| T3→T4,T6,T7 | archive path/key/encode/decode | names consistent across tasks |
| T1→T9 | LoadMilestones fields, link | consistent |
| T5→T9 | serveGzipped Range | after-loadtime needs T5; order holds |
| T4 step 5 | writes into main's public/data via symlink | intended (Global Constraints) |
| each task self-consistent | — | clean |

Dispatches:
D1 Tasks 1+5: sonnet, BASE f9ec6cc89, dispatched
Task 1: complete (f9ec6cc89..f7c72fad5) — sonnet, 57 tool uses
Task 5: complete (f7c72fad5..877e98a0e) — extra: 416 test, Accept-Ranges header
Baseline: fast-4g firstSurfaceTile 1.9 s / 92 req / loaded 38.5 s; 3g 13.1 s / 92 / >90; perf earth-surface 16.7 ms, mars-jezero 16.3 ms. Link = #pose=b,earth,... (task-1-5-report.md)
D2 Tasks 2+3: sonnet, BASE 877e98a0e, dispatched
Task 2: complete (877e98a0e..876752ea9) — sonnet; readTile → Uint8Array<ArrayBuffer>|null (Blob typing); loose source content-type check covers height too; shot data/shots/shot-20261105-171459.jpg (night side, tiles render)
Task 3: complete (876752ea9..44a1f1c19) — Morton bound x,y < 2^23
D3 Tasks 4+7: sonnet, BASE 44a1f1c19, dispatched
Task 4: steps 1-4 done (44a1f1c19..b3b5a719d); step 5 BLOCKED — bands() reads source rasters (Mars HiRISE DTM grids, Earth BMNG/ETOPO metadata) and bakeAll always runs buildSiteGroundHeights (rewrites a tracked .ts)
Task 7: complete (b3b5a719d..d0c702573) — no --immutable args test (uploadViaRclone has no seam); rclone content-type unchecked
Ruling: add a --pack-only flag to build-surface-tiles (reads <tileRoot>/index.txt + manifest prefix, calls packSurfaceTileLevels, skips bands() and buildSiteGroundHeights) — the plan's own fallback; also the path for any future re-pack after a format change — cost if wrong: one flag to delete later
D3b Task 4 fix: resume same sonnet implementer
Task 4: complete (44a1f1c19..b3b5a719d + 31a1d0573 --pack-only/repackSurfaceTiles) — Earth 71 files 586.8 MB largest 67,099,908 B; Mars 56 files 520.5 MB largest 67,095,428 B; collect = 127 total
D4 Tasks 6+8+9(steps 1-3): sonnet, BASE 31a1d0573, dispatched
Task 6: complete (31a1d0573..7a4d9da58) — deviation: idx non-404 non-ok → throw → retried (not memoised empty); cross-origin check via Playwright-faked localhost:5173 origin → [206,'16']
Task 8: complete (7a4d9da58..f84c81a2f) — MISS→HIT claim for .bin/.json taken from brief, not re-measured; probe object answers DYNAMIC
Task 9 steps 1-3: results.md — 3g firstSurfaceTile 13.1→13.6 s (+0.5 s vs 300 ms RTT), fast-4g 1.9→2.0, surfaceRequests 92→110 (expected drop did not happen), perf neutral
Task 9 noise check: after 3g firstSurfaceTile 13.6 / 13.8 / 13.8 s (3 runs) vs before 13.1; firstFrame 11.6 both → +0.5–0.7 s, beyond the 300 ms one-RTT rule → HALT for owner ruling (fast-4g +0.1 s)
Final review: 0 Critical / 3 Important / 10 Minor (final-review.md)
Ruling: I3 (3g first-tile +0.5–0.7 s) goes to the owner, not the fix round — leanness: negative evidence halts landing for the owner — cost if wrong: none, it's an ask
Ruling: fix round covers I1, I2, M1–M10 — M3 follows the spec (bad magic/version → empty level, memoised); M6 moves via npm run move-files — cost if wrong: one small revert
Fix round: resume Task 6/8/9 implementer, BASE f84c81a2f
Fix round 1: f84c81a2f..be8be7222 (7b87d4daa M6 move, be8be7222 fixes) — 519 files/2146 tests in tests/tools + surfaceTiles green
Ruling: M9 fix dropped .webp from firstSurfaceTile — accepted: the loose-tile runtime path is deleted by this branch, and the baseline is already recorded — cost if wrong: a future loose-tile comparison needs the regex back
Ruling: M1 guards shipped without tests — parked as minor for the owner's view — cost if wrong: a wrong-prefix index.txt line packs silently if the guard regresses
Scoped re-review: sonnet, dispatched
Scoped re-review: 12/12 ADDRESSED, no new breakage; deferred README line fixed inline 06de2befa
Task 9: complete except the owner's halt ruling (I3)
Ruling (owner, ask n2H2): accept 3g +0.5–0.7 s first tile; index prefetch backlogged
Landing: draft PR #1051 opened at 4503a9afa; CI watched in background
CI fail 1: concernFolderShape (format/utils 17 > 15) + noInlineTypes (packer LevelTile) → fixed inline a09d51350 (archive/ concern module via move-files) + 63b752555 (KeyedTilePath type, writeFileAtomic); 54 files / 8229 tests incl. tests/conventions green; pushed
Task 10 (after owner sync): all objects 206, application/octet-stream, immutable, no Content-Encoding. 64 MiB part z7.p0: cold 16 KB read total 0.83–1.46 s, warm ~0.1 s. 8 concurrent cold reads into z13.p0: Cloudflare coalesces (1 MISS + 7 HIT) but each waits for the fill — totals 0.34 → 2.44 s by offset. One BYPASS seen on z5.p0 first read. Part count at 32 MiB ~142, 16 MiB ~169 files.
CI green on 63b752555 (typecheck · test · format + Workers Builds)
Ruling (owner, ask cYTV): 16 MiB parts → 0c1ff8b40; re-packed: 169 files (Earth 93, Mars 76), largest 16,776,638 B; 13 levels changed → 33 old R2 keys to delete (scratchpad repack-16mib-keys.txt), owner runs repack-16mib.sh delete → sync → purge
Task 10: complete on 16 MiB parts — cold 0.62 s @0, 0.47 s deep; 8 concurrent cold max 0.85 s (was 2.44); objects 206 octet-stream; z13.idx served == local; purge confirmed (z7.p0 now 16.7 MB MISS)
Landing: #1051 squash-merged bad1b787e on owner's word (CI green)
