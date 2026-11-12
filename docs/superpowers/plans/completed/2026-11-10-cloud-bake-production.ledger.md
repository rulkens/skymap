# SDD ledger — plan: docs/superpowers/plans/2026-11-10-cloud-bake-production.md
Spec: docs/superpowers/specs/2026-11-10-cloud-bake-production-design.md
Start: one plan, no parallel PRs; perf gate n/a (no renderer change). Baseline commit ae33835d9 (crate as spike + spec + plan; root .gitignore target line done here, Task 7's line is already in).

Pre-flight scan:
| tasks | shared | finding |
| 1/2 | fetch.rs, sources.rs, geofill.rs, main.rs | 1 threads Date, 2 builds wms_time on it — same dispatch (A) |
| 1/6 | main.rs timing | 1 deletes stage table, 6 needs total seconds — 1 keeps one total; consistent |
| 3/4 | orbit.json | 3 drops static orbit.json; main still reads <cache>/granules/orbit.json until 4 — new days unbakeable between 3 and 4, acceptable intermediate |
| 5/6 | fetch.rs Fetched, probe | 6 probe uses 5's Fetched; same dispatch (B) |
| 7 | .gitignore | already done in baseline commit |
Per task: self-consistent; tests named match contracts.
Ruling: verification for Rust tasks = cargo build --release + cargo test --release (+ typecheck:fast only for TS tasks) — sdd protocol names npm checks that don't cover Rust — cost if wrong: none.
Dispatch A (Tasks 1-3), sonnet, 27 tool uses, ae33835d9..fe199eacf: done.
Task 3: complete (9536e4982) — committed BEFORE Tasks 1+2; HEAD~1 doesn't compile alone.
Task 1: complete (fe199eacf, combined with Task 2: main.rs/fetch.rs interleaved)
Task 2: complete (fe199eacf)
Ruling: accept combined Task 1+2 commit and Task 3 ordered first — squash-merge flattens it anyway — cost if wrong: a bisect step that doesn't build.
Deviations accepted: new src/date.rs (no date crate); mosaics cached as mosaics/viirs_tc.jpg (date in dir, not name); shared fetch::write_atomic. Offline misses panic until Task 5.
Controller inline: assets/README colormap upstream found (colormaps/v1.3/Clean_Longwave_Infrared_Window_Band.xml, byte-identical) — commit after fe199eacf.
Simplicity review (design-time) run 2026-11-10: 3 findings (BMNG months one home; default date in binary; required field on source row) — dash ask JaM9 open; Tasks 4-6 not affected by #1; #2 amends Task 1 code, #3 amends Task 5.
Owner 2026-11-10: "optimize the file size already now" -> output becomes grey lossy WebP (grey = opacity, no alpha; RGB was 3 copies of alpha). Measured on 9 Nov: q70 4.7 MB, q80 6.0, q85 7.3, q90 9.0, q95 11.3 vs lossless 19.6; cwebp encode 7-12 s. Quality ask NLCF (also re-asks review findings, closed JaM9). Will add as a plan task in dispatch B after answers.
Owner also asked animation cadence: answered (A daily..E flow-warp; recommended D = geo-IR snapshots + VIIRS detail); free-text question open on what the animation shows. Plan scope unchanged so far.
NLCF answers: q80 grey lossy; BMNG one home; default date in binary; required field on row. Plan+spec amended in 5d91f2df8 (Task 5 required field, Task 7 rewritten: BMNG_MONTHS in tools/utils/io, 12 textures.nasaBmngMonthMM rows replace textures.nasaBmng, fetch via fetchTextures --bmng-months; new Task 10 default date, Task 11 grey lossy q80). Dispatches now: B1 = Task 4 (running), B2 = Tasks 5, 6, 10, 11, C = 7-9.
Dispatch B1 (Task 4), opus: done.
Task 4: complete (3f2ba3ba7) pending its review:yes review. Fits match Python exactly both days; synthetic tolerance loosened to 1.5 min / 0.15 h (flat objective w/ 6-min slots); pass_time rewritten as exact nearest walk (8 s -> 3 s wall), brute-force parity test; MIN_FIT_SAMPLES = 600.
Ruling: accept loosened synthetic tolerance — real-day fits are exact and the objective is flat at 6-min slot resolution — cost if wrong: a fit regression of <1.5 min slips past the test.
Task 4 review (opus): APPROVE. pass_time rewrite proven equivalent (bound, wrap, ties, poles, windows); fit matches fit_orbit.py; deterministic.
Task 4: minor (deferred): fine pass is dead weight (both days + synthetic end on coarse grid) — Ruling: drop it in the final fix wave and amend the spec's Orbit paragraph — it never changed a result and code is liability — cost if wrong: a sub-0.5-min refinement lost on some day.
Task 4: minor (deferred): no gate on median_dt_min — Ruling: final fix wave adds exit 3 when median_dt_min > 5 min (both real days 2.0) — cost if wrong: a bad-but-plausible day fails instead of baking.
Task 4: minor (deferred): pass_time comment narrates history (comments.md) — fix in final wave.
Task 4: minor (deferred): stdout println of orbit — routed to Task 6 implementer (stdout = JSON only).
Task 4: minor (deferred): footprints.json still written, nothing reads it — drop in final wave.
Task 4: complete (3f2ba3ba7, review approve, 5 minors deferred)
Dispatch B2 (Tasks 5,6,10,11), sonnet: done, 28/28 tests.
Task 5: complete (aa4460428)
Task 6: complete (4424edb8f) — coverage 0.7679 (11-06) / 0.7673 (11-09) -> MIN_COVERAGE 0.690; drift MTG-GOESE/MTG-IODC 5.15/4.15 K (11-06), 4.77/4.40 K (11-09) -> MAX_CAL_DRIFT_K 10.3. Measured with Dec 2004 BMNG.
Task 10: complete (2e5c15fd5)
Task 11: complete (d5f0d4938) — 9 Nov q80 grey = 6.05 MB, warm bake ~25 s.
Deviations accepted: Fetched::Ok no PathBuf; Source.styles field (MTG STYLES); mosaics -> Result; build_fill returns (fill, cov); coverage = share of wgt+(1-wgt)*cov >= 0.5; Decoder::temperature; new summary.rs; lo footprints require PNG.
Ruling: accept the 4-5 K inter-satellite drift floor with a 10.3 K limit (detects stretch/LUT breaks, not subtle drift) — tightening needs a view-angle cap the spec doesn't have — cost if wrong: a ~5 K calibration drift bakes silently. Told owner.
Dispatch C (Tasks 7-9), sonnet: done. HEAD cc7fb81f7.
Task 7: complete (f896d0b68) + conventions fix cc7fb81f7
Task 8: complete (c25d2819d)
Task 9: complete (242d5221f)
Deviations accepted: ATTRIBUTIONS.md entry cloud-bake (coverage test requires; licence text from plan notes, not re-opened); bmngVintageKey.ts; bmngMonthKey(number) runtime-checked; fetch-cloud-inputs needs -- --confirm (size gate; README says so; gate msg mentions --dev); crate README per-stage table replaced by totals (25.7 s all cores / 31.7 s 4 thr / 73.9 s 1 thr, byte-identical across thread counts, peak RSS 5.3 GB macOS); clouds.cache fetcher 'tools/cloud-bake-rs'; no nasm in CI.
Controller: spike candidate viirs-q80-1109 added (uncommitted spike) for owner's q80 globe check (ask 8Ghv).
Final review: package from ae33835d9 (spike baseline commit) so the reviewer sees the production delta, not the spike port.
Final review (opus): approve after one fix wave. 1 Important (dead Verdict::Drift arm, exits 3) + minors; all 4 deferred Task-4 minors to fix. Fix list: final-fixes.md.
Final fix wave (sonnet): all 10 items, f6a2588ca. Real-day fits unchanged (45.00/13.15, 89.00/13.10, median 2.00); coverage 0.768/0.767; 26 cargo tests. No re-review (lean protocol).
/feature-done audit 1: typecheck PASS; checkboxes 52/52; full suite 8 failed / 31154 passed. Branch-caused: credits (prettier mangled ATTRIBUTIONS.md: table re-pad, Gaia blank line, dss code span), dataPages + siteMode (cloud-bake data page description > 155), docsProject scripts rows (bake-clouds, fetch-cloud-inputs). Spike-caused (uncommitted, not on branch): frame.test.ts x2, docsProject Debug page row. Fix agent dispatched; deletion-audit (opus) dispatched in parallel (read-only).
Fix agent a022a8cc7: ATTRIBUTIONS restored from merge-base + cloud-bake entry; dataSourceNotes cloud-bake; docsCommands rows. website+conventions 16930 pass, 1 expected spike fail.
Deletion audit (opus): ~130 LOC safe-now (deletion-safe-now.md, dispatched), ~175 needs-ruling (asked owner).
oQiM: q80 on globe PASS (owner). Deletion rulings TAKEN: hi_meta.json -> typed pieces in memory; satellite id branching -> sub_lon + decode kind as source-table columns; bmngVintageKey.ts deleted via a month field on BMNG_MONTHS. KEPT (owner): diagnostic stderr stats, binary --date default, seam research notes. Ruled-deletions dispatch queued after the safe-now agent (same files).
Flow spike (option E) dispatched, opus, scratchpad/flow-spike/, North Atlantic storm — separate from this PR.
Deletion safe-now (sonnet): dca5dc22d, -107 net LOC, 13/13 items, offline 9 Nov bake byte-identical.
Ruled deletions (sonnet): 1f1aa2b42 hi_meta gone (-23), bb2f862af source-table columns + Swath struct (+73, no id/name parsing left), ed81a6669 BMNG month field, bmngVintageKey.ts deleted (-1). Bakes byte-identical.
/feature-done audit 2: READY — suite 31157 pass, 3 fail = uncommitted spike only (frame.test x2, Debug-page row); typecheck PASS; 52/52 boxes; deletion audit -107 safe-now + owner-ruled three.
