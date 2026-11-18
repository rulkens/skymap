# SDD ledger — plan: docs/superpowers/plans/2026-11-13-live-datasets.md

Parallelism: phases A (wt live-clouds-grey) and B (wt live-datasets-pipeline, off origin/main 7cc995d32) in parallel; C after both merge. Perf gate: yes (Task 5). Owner ruled 2026-11-13 (ask jQ4S).
Dispatch A1 = Tasks 1-4 (opus, wt live-clouds-grey). Dispatch B1 = Tasks 6-8 (sonnet, wt live-datasets-pipeline). Then A2 = Task 5 (controller), B2 = Tasks 9-10.
Task 6: complete (48bbf360f)
Task 7: complete (8bb49ad12)
Task 8: complete (ec8bbf8ba) — deviation: onProgress (loaded,total) matches fetchWithProgress; accepted.
Task 9: complete (88db1e4ca) — deviation: live-satellites script (fetch+build), writePublishListCli + PublishEntry type; accepted.
Task 10: complete (85ec5cbae)
Phase B whole-branch review dispatched (opus). Controller note: join(paths, "\n") in live-dataset.yml likely a literal backslash-n (GH expressions have no escapes) -> fix round.
Task 1: complete (98ff8abda)
Task 2: complete (98f2c71e3)
Task 3: complete (4aed0b179)
Task 4: complete (247cb3fd6) — deviations: lib/srgb.wesl added, withoutEnlargement, locals renamed *Coverage*; note: shell colour filtered pre-decode (check at Task 5).
Task 5: tiers written (grey 0.46/1.63/5.50 MB vs 1.64/6.28/23.45); shots in scratchpad greyshots/; perf earth-surface merged 14.9->13.5 ms (noise), GPU 545.8->481.8 MB (cloud textures 2x42.7 -> r8). Owner visual check sent. Phase A whole-branch review dispatched.
Phase B fix round: 855aa265c (folder stamp YYYY-MM-DDTHHMMZ, caches+bodyTexture dropped -> phase C re-adds). Pushed, draft PR #1134, CI watching.
Phase A review: no WebGPU risk; medium = mip/filter pre-decode darkening (measured mean diff 0.1/255 whole-globe -> owner check covers); lows/nits sent as one fix round.
Phase A fix round 8e90e8919. Pushed, draft PR #1135, CI watching. Owner: visual checks (ask ZScU) + sync-r2-secure before merge.
CI green: #1135 (A) and #1134 (B, after docsCommands fix 20cea27e7). Both await "merge this PR"; A also owner visual check + sync-r2-secure first; B: dispatch workflow right after merge.
Phase A MERGED #1135 2026-11-16 (94e07e4b2), after owner sync-r2-secure (grey tiers verified 200 on R2). Old earth-clouds-<px>.webp still on R2 (cleanup later).
Phase B MERGED #1134 2026-11-16 (46b237a11). gh workflow run 403 (token lacks actions:write) -> owner dispatches Live datasets by hand.
First Live datasets run 43885484653 green 2026-11-16: pointer live, file 2026-11-16T1427Z gzip+immutable, pointer no-cache, CORS ok. Phase C next.
Owner applied lifecycle rule live-files-expire-30d (2026-11-16). Left: delete old satellite key after 2026-11-30; old colour cloud maps (owner call); phase C.
Ruling FKUG 2026-11-16: Himawari gate = owner emails JMA; web ships with credit meanwhile; kiosk waits (kiosk never mirrors live keys, so it already shows the built-in map - no code). Phase C started, wt live-clouds-daily off 46b237a11.
Task 11: complete (779e9aab0) — dev: writeLivePointer explicit date; --cloud-inputs fetches baseline too; setupRust; caches pre-joined.
Task 13: complete (e22e9cc09) — dev: bodyTexture {bodyId,kind}, resolveLiveFileUrl.
Task 14: complete (c5fc9866b) — copy options in scratchpad phaseC-copy-options.md (owner picks).
Phase C review dispatched; Task 15 local e2e running.
Review fixes 52011b9ad, backlog 8235eda7d + 947342c06. Task 15 local e2e: 15 Nov bake (219 s cold, cov 0.767) -> tiers+pointer; dev shows daily map; missing pointer and non-image daily file both fall back to built-in (identical to built-in shot). Branch pushed; Task 12 needs owner dispatch (token 403). Copy picks ask VEw2 open.
Copy picks (ask BoH1) applied 69ada5d67. Pushed; draft PR #1141; CI watching. Task 12 dispatch: owner gh token 403 too -> owner runs from Actions UI on branch live-clouds-daily.
Task 12 run 43906606703: satellites ok, clouds/build failed: eoimages.gsfc.nasa.gov (baseline TIFF) times out. Ruling DFrY: mirror the 13 fixed inputs on R2 data/raw/textures/, CI downloads from the mirror. Downloading 8 missing BMNG months into main checkout; agent adding sync group + mirror mode + sha256 pins.
NOTE: all 12 BMNG months downloaded into wt live-clouds-daily data/raw/textures (cwd-relative) — copy to main checkout before removing this wt. Owner asked about shrinking inputs; proposal: baseline = earth-clouds-grey-8192.webp, BMNG -> 12 monthly ice masks; awaiting yes.
Mirror commit 1cebad2fd (13 inputs from R2, pins for 12 months, sync group "Cloud bake inputs"); not pushed. Owner question open: shrink inputs (grey map baseline + monthly ice masks) vs mirror the 13 (~390 MB).
Owner: keep the mirror. 13 inputs now in this wt (TIFF copied from main); 12 months copied to main checkout too. Pushed 1cebad2fd. Next: owner sync-r2-secure FROM THIS WT (group code only on branch), verify 13 on R2, re-dispatch live-datasets on branch.
Task 12 DONE run 43913936584: clouds build 412 s cold (inputs from R2 mirror), uploaded 2026-11-16T1704Z tiers (0.42/1.51/5.86 MB) + pointer date 2026-11-15. Satellites leg failed: CelesTrak HTTP 503 (4th fetch today) -> nothing uploaded, pointer kept 16:24 run = designed failure mode. #1141 CI green; awaits merge word.
Task 15: complete. feature-done moves before merge (owner said merge 2026-11-16).
