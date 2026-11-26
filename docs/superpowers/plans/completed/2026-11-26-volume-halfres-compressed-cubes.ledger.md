# Half-res compressed volume cubes — SDD ledger

Plan: `docs/superpowers/plans/completed/2026-11-26-volume-halfres-compressed-cubes.md` on branch `feat/volume-halfres-compressed-cubes` (spec 5630254be, plan 976ab0260, base main e41e5d89a).
Spec: `docs/superpowers/specs/completed/2026-11-26-volume-halfres-compressed-cubes-design.md` (approved, ask MCUm).
Controller works from the spike worktree `volume-progressive-octree`; implementers run in isolated worktrees on a local branch at `origin/feat/volume-halfres-compressed-cubes` and push `HEAD:feat/volume-halfres-compressed-cubes`. Spike reference server: http://localhost:5175.

## Owner rulings
- Ground check (ask cu5s): one file per level per format, gzip on wire; small = L2, medium + large = L1; six tiered .scfd replaced outright; shape approved; prep on the SAME PR, first commits.
- Adjacent findings: "fix in this branch" (typed SCFD version error, stale MCPM docs/comments, slots + PRIORITY onto rows).
- Spec (ask MCUm): approved; failed file = volume absent + one warning; initialState list stays; NO desktop build with the deploy (accepted cost); 2MRS inputs to R2 backlogged; old files off R2 a month after deploy.

## Dispatches (sequential, one branch)
- D1 (opus): Tasks 1–4 — prep commit (GpuVolume), three adjacent fixes; opens the draft PR. — RUNNING
- D2 (sonnet): Tasks 5–7 — ledger rows + levelByteLength; formats table, format pick, device features; sidecar, levels, placement, gain.
- D3 (opus): Tasks 8–9 — slab streaming, loadVolumePyramid.
- D4 (opus): Task 10 — builder, old builder + --clamp deleted, deploy row.
- D5 (opus): Task 11 — renderer + shader at 304 B (image unchanged on .scfd).
- Task 12 (controller, owner's machine): data build; writes ~495 MB raw into main's data/raw/polyphorm. May run beside D5.
- D6 (sonnet): Tasks 13–14 — runtime switch, docs.
- Task 15 (controller): acceptance 1–13. Needs spike server on 5175; OnePlus for check 8.
- Then: whole-branch review, /feature-done, merge ask. After merge (owner): build-mcpm, build-2mrs, sync-r2-secure, app deploy at once.

## Done
- Task 1: complete (2fd3ae791) — prep, GpuVolume
- Task 2: complete (e48bab931) — typed SCFD version error
- Task 3: complete (6011b1c99) — stale docs/comments
- Task 4: complete (8d7f486e9) — slots + priority from rows
Draft PR #1178. Suite 2133 files / 37421 tests green locally. D1 deviations: wireSlots.test.ts also changed; two backlog wording edits.

## Findings to carry
- OWED (controller): pixel-identity shot for Task 1 vs main (MCPM inside pose); fold into acceptance.
- Flake: tests/tools/utils/refactor/planInline.test.ts times out at 5 s under load. OWNER: "yes fix planInline" → own commit at the start of D4 (measure first; likely each in-memory ts-morph Project loads the TS lib files: try `skipLoadingLibFiles`; fix the cause, not the timeout; check sibling ts-morph tests). Owner put a draft of the test on the desk (.claude/desk/planInline.test.ts, unchanged copy so far) — the owner applies drafts, agents edit the repo file on the feature branch.

- Task 5: complete (70d455b45) — ledger rows + levelByteLength
- Task 6: complete (7df28bfe2) — formats table, pick, device features
- Task 7: complete (77d8da4a8) — sidecar, levels, placement, gain
Suite 2136 files / 37468 tests green locally at 77d8da4a8.

- Task 8: complete (9ca8c39b9) — streamLevelSlabs
- Task 9: complete (705328fe0) — loadVolumePyramid (not wired; Task 13)
Suite 2138 files / 37489 tests green locally at 705328fe0.

- planInline flake: fixed (74e9bd521) — skipLoadingLibFiles in planInline + classifyLocalDeps tests; 630 → 41 ms worst case under load. CI green on it.
- Task 10: complete (8b0569029) — buildVolumePyramid, old builder + --clamp gone, deploy row, build-2mrs script. Suite 2139 files / 37501 tests green locally.
D4 deviations: docsCommands.ts row for build-2mrs (wording = owner's call); pngjs shim accepts write options; stale comment mentions reworded.

## Findings to carry (more)
- Second flake, different cause: tests/services/engine/camera/noStoredRegimeFlag.test.ts (real-FS ts-morph Project, 4–7 s under load). Ask owner: fix here or backlog.
- Task 14 leftovers: docs/DATA.md:198 (--clamp route), docs/science.md:43, data/raw/mcpm/README.md:5.
- `build-data-manifest` skips a linked public/data: built files keep plain names in dev.

- Task 12: complete (no commit; data only). 18 level files + 2 sidecars in main's public/data/volume-pyramid/v1/, all byte sizes exact. Raw 2MRS d2/d4/d8 .npy in main's data/raw/polyphorm/ (413/52/6.5 MB). Crop loss MCPM 0.000%, 2MRS 0.035%. gzip-6 wire, L1–3: MCPM astc 10.61 MB, bc4 12.20, r8 20.08; 2MRS 1.00 / 0.97 / 1.37 MB. L2–3 (small tier): MCPM astc 1.47 MB, 2MRS 0.14 MB. ASTC encode 67 s (MCPM L1).
- Acceptance 2 (r8 vs spike on overlap): MCPM ≤ 28 voxels of 59.2M off by 1 code (levelMax last-digit float difference). 2MRS 3,680 of 11.6M at L1 (430 L2, 64 L3), always spike=48 → new=0: the clamp boundary. Spike zeroed r8 codes ≤ 47; the spec zeroes raw < 4.71397, and raw just under it rounds to code 48. The new rule is today's rule at d2 (today: f16 value < 0.2). Controller verdict: explained, new is the faithful one; report to owner as pass-with-note.

- Task 11: complete (eb6a10c1d) — shader/uniforms 304 B. On .scfd: after-vs-before RMS 0.072 (MCPM) / 0.058 (2MRS) = noise floor, max diff 1, 0 console messages. One volume sample per step; 8 taps (16 between levels on a pyramid). Suite 2138 files / 37503 tests green locally. Shots in scratchpad/shots/.
- Check at acceptance: `pxPerRad` reaching the shader must be the 1/3-scale target's (D5 unsure); if far pyramid shots look wrong, look there first.

- Task 13: complete (146342cbd) — MCPM + 2MRS load from the pyramid; tiered path gone. ASTC picked on the Mac; 0 console messages; textures 336×576×324 ×3 mips and 240×240×232 ×3 mips.
- Task 14: complete (f8943b3d9) — docs. Suite 2138 files / 37509 tests green locally.
- OWED (controller): website `packages/website/src/content/docs/data/pipeline.mdx:93,131` copy via the `copy` skill (options for the owner); docsCommands.ts wording ruling.
- 2MRS is off by default: acceptance must switch it on.

## Acceptance, images/correctness (branch f8943b3d9, server :5181 left running; reference = spike's today path at large)
- PASS: 1 GPU bytes (ledger exact: medium ASTC 31,788,288 + 6,774,400; small 3,919,104 + 835,200; BC4 MCPM 35,761,824; r8 71,523,648 + 15,242,400), 10 CPU (9.42 MB held per loader; 19.1 MB with both loading at once), 11 fallback (BC4, r8, 404 → one warning, other field draws), 12 headless (SwiftShader on the Mac exposes all four features, picks ASTC), 13 tier switch (no flash, no leak, medium→large no requests, no "Maximum update depth" at large).
- FAIL 3: 2MRS INSIDE RMS 34.3 shift −23 (much darker; haze gone). 2MRS dense 5.28/−2.57. MCPM inside 4.32/−1.63 (shift bar −1.2). MCPM knot passes 2.29/−0.75. r8 shows the same shifts → data/recipe, not codec. Branch == spike half res (5.05/+0.05), so inherited from the spike; an EARLIER spike measurement (pre-crop, full-screen-pass era) had 4.20/−1.14 at this pose.
- 5 crop bars fail (0.64 at 600, 1.82 at 2000) but dominated by mip averaging, not crop.
- 6 far brightness (owner eye): MCPM 0.833 @600, 0.427 @2000; 2MRS 0.956 @600, 0.405 @2000; both @MCPM 600 0.739. pxPerRad verified correct (1/3 target).
- Pairs: .claude/desk/volume-halfres/pairs/ (9 pairs + links.md).
- HALT: landing stops until 2MRS inside is explained. Diagnosis agent (opus, 40 min) RUNNING: suspects crop (haze outside box seen from inside), native-box units, clamp, trim.

## Diagnosis result (agent a5f1ab9fd57e804ef): the REFERENCE was wrong, not the branch
- Spike's `?tier=large` is dead: `src/main.tsx:99-101` preloads the tier from the viewport and overrides the spike's tierSlice switch. Request log: the "today/large" link fetches `polyphorm-2mrs-medium.*.scfd`. So the 2MRS-inside (and MCPM-inside) "before" shots were MEDIUM.
- Real large = main :5174 with `?perf` then `__skymapPerf.setTier('large')` (script: scratchpad/diag2mrs/tiershot.mjs). Against it: 2MRS inside 4.26 / −1.38; MCPM inside 0.74 / −0.04; 2MRS dense 5.28 / −2.57 (its before WAS real large; small real gap, unsplit).
- Crop ruled out by data: outside the box is 0.3% of summed value; inside, r8 L1 × gain == today's large (RMS 0.0015).
- No branch code change. Every acceptance "before" must be re-shot on real large with a per-shot assertion of the fetched `-large` file. Far-brightness ratios (check 6) and crop bars (check 5) are suspect until re-shot.
- Spike hack `?tier=large` silently shows medium: tell owner (spike is throwaway; nothing deleted).

## Re-shoot on REAL large (all 18 shots, tier asserted per shot; noise floor RMS 0.07) — pairs + links.md overwritten
RMS / shift / lum ratio: MCPM inside 0.74/−0.04/0.999 PASS; knot 2.29/−0.75/0.968 PASS; MCPM 600 2.18/−0.76/0.834; MCPM 2000 1.80/−0.18/0.427 (near-black frame: 0.24 → 0.10); 2MRS inside 4.26/−1.38/0.961 FAIL (shift bar −1.2); 2MRS dense 5.28/−2.57/0.945 FAIL (RMS bar 4.6 + shift); 2MRS 600 0.64/−0.09/0.956; 2MRS 2000 1.81/−0.11/0.406; both@MCPM 600 2.30/−0.85/0.885.
Check 5 (crop, same-format cropped vs uncropped) NOT testable from these pairs; data check says crop loses 0.3% of summed value.
Old wrong-tier befores were: 2mrs-inside, mcpm-inside, both-mcpm-600. Script: scratchpad/diag2mrs/accshot.mjs.
2MRS fails are small and inherited from half res (r8 same; spike pre-crop 4.20/−1.14): OWNER RULING needed (accept by eye, or investigate).

## Timing run 1 (INCONCLUSIVE; my brief forbade the scratch patch the bar's method needs)
GPU timestamps only (Apple TBDR, ordinal), volume pass ms/frame, both fields, median of 3: medium inside branch 3.28 vs main 2.88 (1.14×); medium 600 3.06 vs 3.06 (1.00×); large inside 3.29 vs 2.90 (1.13×); large 600 3.01 vs 3.10 (0.97×). Small on Mac (not the check): inside 1.17×, 600 1.04×, noise as big as the gap. Check 8 OWED (no phone attached). Check 9: loadtime tool has no volume milestone and runs at phone viewport; firstFrame 6.8 vs 6.5 s slow-4g = noise. Raw: scratchpad/acc1178/.
Signal: inside pose ~+13% vs main (suspect: trilinear between mip levels = 16 taps). Needs the real K-draw wall-clock bench.

## Owner visual checks (ask k93W): ALL NINE PASS (incl. both 2MRS poses that failed my bar, and the far-brightness pairs)
Owner: noStoredRegimeFlag flake → BACKLOG (index line rides the closeout commit).

## RESUME HERE (supersedes below)
Whole-branch review (read-only, no test runs while the bench is on) RUNNING.
OWNER: timing bench PAUSED (another session is baking; would contaminate). Bench agent a6f8ffb3a30bc818f told to stop, keep its setup, report partials. RESUME ONLY ON THE OWNER'S WORD that the bake is done.

## Whole-branch review (done at f8943b3d9): no must-fix
Fix agent RUNNING (8 commits): unhandled write-check rejection + stop fetching after a failed write; ASTC write-layout test; texture leak when commit's jitterMaskReady rejects; delete `maxLod` uniform (textureNumLevels, struct stays 304 B); nits; inline param types + tools constants; comment budget on new files; backlog line for the noStoredRegimeFlag flake.
ASK OWNER (not dispatched): fetcher `Record` table vs ternary (spec asked for the table); pre-existing: cosmicWebDensity destroy.ts does not cancel its slots (in-flight load commits into a destroyed renderer) — fix in this branch?; pipeline.mdx:131 sentence (copy options); docsCommands wording; BACKLOG.md:171 placeholder date (fill at deploy).
After the fix agent: re-shot one pair for the maxLod change (image must be unchanged), CI.

## K-draw bench, PARTIAL (paused 19:00; kit in scratchpad/k1178/: patch.mjs, kbench.mts, fit.py, arrival.mts, k.jsonl; worktree agent-a6f8ffb3a30bc818f at main, clean, patch NOT applied, server :5191 stopped)
Clean rounds: branch r1 (18:42–46), r2 (–18:49:50), main r1 (–18:52:18). Main r2/r3 SUSPECT (bake from ~18:53). ms per extra draw pair, both fields at MCPM poses:
medium inside branch 1.110, 0.960 vs main 0.897 (≈1.15–1.19×); medium 600 0.885, 0.891 vs 1.049 (0.85×); large inside 0.971, 0.966 vs 0.981 (0.99×); large 600 0.904, 0.885 vs 2.55 (main superlinear in K, slope not meaningful). K=1: 8.33 ms = 120 fps on both sides everywhere.
Vs spike rows (pair sums; not the check as written): inside 0.97–1.04 vs bar 0.85 → over; 600 0.89 vs bar 1.03 → within.
Remaining: branch r3, rounds to 5/side, per-field at each field's own pose, small tier, LOD-rounding experiment (fragment.wesl:238 round() the lod; trigger crossed at medium inside), arrival on fast 4G. Resume order in the agent's report. Timing run 2 (K-draw bench with scratch `__benchK` patch on the agent's own servers, branch/main/branch; volume-arrival probe at medium) RUNNING. Then report, owner ruling if > 1.10×, review, /feature-done, merge ask. Then: timing agent (checks 7, 8, 9; assert tiers per run); owner dash checks (one set); review; /feature-done; merge ask.

## (old)
Task 15 acceptance: images/correctness agent (opus, 45 min box, checks 1,3,4,5,6,10–13 + owner pairs into .claude/desk/volume-halfres/pairs/) RUNNING. Then a timing agent (checks 7, 8, 9; ms + fps; phone if attached). Then owner dash checks (one set), whole-branch review, /feature-done, merge ask. On both: check CI, dispatch D6 (sonnet, Tasks 13–14), then acceptance (Task 15).

## (old) D3 note
D3 (Tasks 8–9, opus) ran; CI watch on #1178 in background. On D3's report: dispatch D4 (opus, Task 10), then D5 (opus, Task 11); Task 12 data build can run beside D5.

## SESSION MOVED (owner asked) — THIS copy is now the authoritative ledger
Session works in `.claude/worktrees/agent-a9fa6b7aec5ab629f` on `feat/volume-halfres-compressed-cubes` (ff to f8943b3d9; `git merge --ff-only origin/...` after each agent push). The spike worktree `volume-progressive-octree` is read-only from here (its ledger copy is stale from this point); spike server :5175 still running, nothing deleted. Desk pairs copied to this worktree`s .claude/desk/volume-halfres/.

## OWNER RULING (2026-11-26, evening): DELETE the slab streamer
"yes" to: each level downloaded whole via fetchWithProgress + one awaited writeTexture per level. Deletes streamLevelSlabs + test + VOLUME_UPLOAD_SLAB_BYTES + writeChecks. Price accepted: peak CPU ~2x the largest level for a moment (MCPM ASTC ~55 MB; r8 fallback ~125 MB) instead of 9 MB. Sent to the review-fix agent (aa9eb060e366863fc) as an extra commit; spec §6 + §12 check 10 and docs updated in it. Acceptance check 10 (9.42 MB) is VOID: re-measure CPU peak after the change.

## OWNER RULING: blue-noise mask loader → FIX IN THIS BRANCH ("yes")
`createBlueNoiseMask.ts` (from #1175) hand-rolls retry, a destroyed flag and a ready promise. Make the mask an asset slot owned by the density Layer (fetcher reads static /lut/blueNoise.bin; NO Layer contract growth — if the slot machinery cannot take a non-manifest file or the contract would grow, stop and report). Retires the review-fix for the commit/jitterMaskReady leak. DISPATCH AFTER the review-fix agent reports (same files). Then: re-shoot one pair (maxLod + mask), re-measure CPU peak, resume bench on owner word, closeout.

## Review fixes DONE (f8943b3d9..68c32d27d, 9 commits; suite 2136 files / 37517 tests green locally)
d1fdd9a82 failed write stops load; 336ccbc7f ASTC layout test; cd9e7cb3c mask-failure destroys texture; 268c18450 maxLod uniform deleted (_pad0, 304 B kept); c41c4d255 nits; 0e2cb20ec conventions (VolumePyramidRequest type, tools/volumes/data constants; renames PYRAMID_LEVELS, MAX_CROP_LOSS, GREY_PNG); d4742f2a2 comments; 42908cc61 OWNER RULING whole-level uploads (streamLevelSlabs + slab constant deleted; spec §6/§7/§11/§12 updated); 68c32d27d backlog (existing flake line extended).
Plan still describes streamLevelSlabs as Task 8: note at /feature-done.
Mask-slot agent (a0cbd2f35b3f7b79e) RUNNING: mask → asset slot, no contract growth; riders: stale partial-write comment, backlog line for boot loaders (envBrdf/fonts: size check + retry; owner asked whether to fix, I recommended backlog — not explicitly ruled).
Then: re-shoot one pair + CPU peak; bench resume on owner word; closeout; CI.

## Mask slot DONE (68c32d27d..00571c0b7; suite 2137 files / 37517 tests green locally)
e3a7cfaa2 mask = asset slot `jitter-mask` (createJitterMaskSlot; row in cosmicWebDensityAssetRows, demand like the cubes, priority 69; liveness null until mask slot ready|error; destroy releases the slot); 713f2b23e createBlueNoiseMask + BlueNoiseMask type deleted, cd9e7cb3c fix removed as unneeded; 00571c0b7 riders (partial-write comment, backlog line for envBrdf size check).
No contract growth. Known behaviour changes to tell owner: mask released/refetched with the cubes; if the mask arrives AFTER a cube commit (rare) the volume appears part-way through its fade.
Pre-existing, still open (ASK OWNER): density cube slots not released in destroy.
This worktree ff to 00571c0b7; dev server :5182 (shell bvwrgjh8w).
Verify agent RUNNING on :5182: image unchanged vs passed after-shots (mcpm-inside, 2mrs-inside), mask request + no flash, CPU peak, console, tier switch, mask-404 path.

## Browser verification at 00571c0b7 (:5182): PASS
Image vs approved after-shots: mcpm-inside RMS 0.07, 2mrs-inside 0.10, mcpm-600 0.00 (shift 0.00). Console clean (load, tier cycle, 2MRS toggle). Mask 200 / 65536 B once per load; no unjittered frame in 14 samples; gate-holds-ready-volume case NOT exercised (mask always first). JS heap peak 52.6 MB cold load both volumes, 46.4 settled (ArrayBuffer bytes not measurable). Mask 404: one warning, no retry, volume draws unjittered (mean 18.8 vs 16.4: brighter without jitter, pre-existing fallback look). Mask HTML-200: 3 attempts then one warning. Missing mcpm L1: one warning per load attempt, 2MRS draws. Outputs: scratchpad/verify1178/.
Closeout agent RUNNING (comment-audit, deletion-audit, feature-done, plan+spec → completed/, ledger archive, PR body; timing table marked pending). Owner ask open: website sentences, cube-slot release, fetcher table, bench resume.

## Owner answers (ask Z38q)
Bench: STILL BAKING, keep waiting. Teardown gap: FIX IN THIS BRANCH (release cube slots in destroy). Storage table: KEEP. Website pipeline.mdx:131 → "Both are stored as cubes of numbers, with a note of what each cube spans."; :93 → "All but the cosmic-web density field open the same way…" + "a density field is a set of cubes at three sizes". All three sent to the closeout agent (a5ca9c0a7fb2acc30) as extra commits.
RESUME: closeout report → ff this worktree → CI green → merge ask is BLOCKED on the bench (owner word that the bake is done) + ruling on medium-inside cost; phone check 8 owed.

## Closeout DONE (00571c0b7..55a522d18; CI green; PR still draft)
ce2dfd1ad comment audit; 4d26be5f0 deletion audit (safe bin); 8bdc4a72e feature-done (plan+spec → completed/, ledger copied to docs/superpowers/plans/completed/2026-11-26-volume-halfres-compressed-cubes.ledger.md, Task 15 results: 7/8/9 unticked); 55a522d18 backlog wording. Suite 2137 files / 37516 tests.
NOTE: the repo ledger copy is a snapshot; before the merge ask, re-copy this file over it (one commit).
Deletion-audit judgement calls (unruled, ask owner in the final set or drop): extractPolyphormExport.py JSON sidecars nothing reads (~35 lines); `seconds` timing column in buildVolumePyramid.ts; move baseVoxelMpc to 264 to drop _pad0; duplicate ASTC/BC4 byte-size test; bytesPerRow from level length.
Closeout agent RESUMED with the three rulings (teardown fix, two website sentences) — RUNNING.

## OWNER RULING (2026-11-26 late): "we will leave the timing for the next pr"
Checks 7, 8, 9 (K-draw bench, phone small tier, volume arrival) are DEFERRED to the detail-region PR; not a merge blocker for #1178. Carry: medium-inside prelim 0.96–1.11 vs 0.90 ms per extra draw pair (~+15%, 2 rounds vs 1), 120 fps unchanged on the Mac; bench kit in scratchpad/k1178/ (patch.mjs, kbench.mts, fit.py, arrival.mts) — scratch, may vanish.
RESUME: ruling-commits agent report → final small commit (plan Task 15: 7/8/9 "deferred to the detail-region PR on the owner`s word"; PR body timing section likewise; re-copy this ledger into docs/superpowers/plans/completed/) → CI green → ASK for the merge word (mark ready, squash, no --auto). After merge (owner): build-mcpm, build-2mrs in main; sync-r2-secure; app deploy at once.

## Ruling commits DONE (55a522d18..b7b303e65; CI green)
4317ed95a teardown releases every cube slot (test first); 62d42813f + b7b303e65 website pipeline sentences. Suite 2139 files / 37517 tests. PR body updated.
Final-commit agent RUNNING: plan Task 15 checks 7/8/9 = deferred to the detail-region PR on the owner`s word; PR body timing section likewise; this ledger re-copied into docs/superpowers/plans/completed/. Then CI → merge ask.
Not applied (owner did not answer): deletion candidates extractPolyphormExport.py JSON sidecars, builder `seconds` column.
NEXT PR (detail region): ground exploration agent a876c168ebee95af2 RUNNING; then refactor-ground checkpoint page + asks; spec; opens with the deferred timing checks. Branch from main AFTER #1178 merges.
