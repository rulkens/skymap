# SDD ledger — plan: docs/superpowers/plans/2026-10-30-small-bodies-phase2.md

Lean protocol (sdd-execution.md). Branch small-bodies, draft PR #986. Plan approved 2026-10-30.
Dispatch grouping: Task 1 inline (controller, <50 lines); Tasks 2+3 one Opus dispatch (shared caption/row model; Task 3 review: yes); Task 4 main session on the Mac (Blender bake, user said yes to download + bake).
Ruling: perf gate not run unless the user asks — spec says runtime adds nothing new (caps derive from SCENE_PLANETS.length) — cost if wrong: 3 more glint/slab rows unmeasured.

Task 1: complete — inline edits + sonnet fixture sweep (8 test files), 20cdee2e3→8009c08ba. Deviation: slabs.test makePlanet overrides Partial<Omit<PlanetBody,'captionKind'>>.
Dash ask a3MN (perf gate / parallelism) open; Tasks 2+3 dispatched meanwhile (neither answer changes them).
Tasks 2+3: dispatched opus (one agent), BASE 8009c08ba.
Controller: full `npm run fetch-horizons` (existing rows; no planet/moon CSVs were local anywhere) → scratchpad/fetch-horizons.log; agent fetches the 3 new ids itself.
Task 4 prep: downloads (3 .bds + 3 maps) running → data/raw/meshes/{vesta,ceres,bennu}. Disk had only 13 GB free at start.
User (a3MN): perf gate SKIPPED; one plan, serial. (Replaces the provisional perf ruling above.)
Task 4 (controller, while 2+3 run): downloads OK (sizes = recon). DSK→OBJ via scratchpad/scripts/dsk2obj.py (spiceypy, found_check_off): plates/radii match recon. Maps: scratchpad/scripts/downsample_map.py → <map>.8192.png for Vesta, Bennu (NoData→median, BOX downsample).
Ruling: Vesta's unlit north (pixels <20 above 50°N, polar night during HAMO) treated as NoData → median grey cap — a near-black cap would read as fake shadow — cost if wrong: eye-check flags a flat/blotchy cap; alternative is leave it dark.
Ruling: Ceres also decimated to 150k (default budget 600k) — Phobos README shows 150k + relief atlas carries the relief; 4x smaller asset — cost if wrong: coarser Ceres silhouette at close range.
importMesh/meshPrebake SOURCES rows added (uncommitted, controller); import-mesh done for all three; prebake-all running (scratchpad/prebake-<id>.log).
Task 4: prebake OK (ceres 44s, vesta 166s, bennu 114s; 150k tris each). Vesta albedo atlas: north cap reads flat grey with dark lacing (expected from the fill). Remaining Task 4 code waits for the 2+3 agent (shared git index).
Task 2: complete — opus, 8009c08ba→e4d02c947 (commit "feat: the Small bodies caption kind and label source").
Task 3: agent died on API ECONNREFUSED mid-task (work uncommitted, intact); resumed via SendMessage. Fits: vesta 864 km, ceres 898 km (1900–2100, step 10); bennu 884 km on span 2007-01-01..2054-01-01 step 4 (1900–2100 missed by 90,392 km — Earth encounters kink a). Existing correction rows unchanged (0 deletions).
User: "merge in main" — do it right after the Task 3 commit (tree dirty + agent live now).
Task 3: complete — opus (same agent), e4d02c947→7657ac53a; targeted vitest 1,580 files green. Deviations: Bennu span 2007–2054 step 4 (spec outcome note); facts omit meanTemp/moons/atmosphere; PLANET_LABEL_IDS filters captionKind.
Merge main 5c7e409fe (17 commits): conflicts docsSettings (took main's count-free copy), bodySourceRows comment (combined), captionFadeRules.ts deleted on main by #980 (accepted — body Layer caption band covers every label-bearing body source incl. small-body), bodyGlintsPass.test (captionKind + CAPTION_GONE_MPC). typecheck:fast clean; 412 test files green. Pushed.
Adjacent debt (main's): src/compositions/README.md:34 still names CAPTION_FADE_RULES / captionFadeRules.ts after #980.
Task 3 review (review: yes): opus reviewer dispatched. CI watch running.
Task 4 code: opus implementer dispatched (BASE 5c7e409fe) — mesh rows, registry, READMEs, sha256, build-meshes, tests, attributions, orientation checks. Controller keeps eye-checks, albedo tuning, R2 sync.
Task 3 review: spec ✅; 1 Important — Ceres facts "lone mountain Ahuna Mons" false → "isolated mountain", rerun build-planet-facts. Minors: fittedBodies header Bennu-step reason stale; registry + buildEphemerisCorrections header "1900–2100" for all rows; spec bullet unwrapped; CTY_TO_EPOCH repeated (keep, plan-mandated inline). Span-end scratch run 1800–3000: finite, within peri/aphelion.
Fix: controller inline (<50 lines) AFTER the Task 4 agent commits (it edits rawDataRegistry too).
Task 4 code: complete — opus, 5c7e409fe→95b50a18e, 129 test files green. Sizes: Vesta 1.47 MB mesh + 11.4 MB medium atlases; Ceres 1.46 + 8.6; Bennu 2.20 + 20.0 (normal webp 14.9 MB!). Orientation: Vesta mound 75.0°S 92.7°E (= Dawn-Claudia 301°E +150°, Claudia″ OK); Ceres Occator 20.5°N 242.5°E r=0.95; Bennu widest band −2..0° lat. Deviations: reliefM tops raised (Vesta 30998, Ceres 17341: decimation lifts bound past DSK max); build-meshes via scratch driver for 3 keys (other raw GLBs absent); public/data is main's symlink → new files unhashed in main's public/data, manifest skipped (rebuild from main path before R2); attribution hosts naif only (usgs not in src).
Eye-check risks: Ceres facula clipped by 99.7th-pct cap (188 vs median 149); Bennu looks "less nice" per user — dark seed 0.24, UV atlas ~half wasted on tiny islands (pipeline-wide), flat caps.
Task 3 review fixes: controller inline 45092c87f. Pushed.
Task 4 review: spec ✅; I1 tolerance 0.004→7e-4 (fixed 949da6490); I2 medium payloads unpriced (Vesta 12.9, Ceres 10.1, Bennu 22.2 MB vs Phobos 3.9) → user ask. Minors fixed: importMesh comment, Ceres By line (R. Park). Pending: README "quarter of the 600k budget" wording (after size ruling); dataSourceNotes Occator clause (after Ceres eye-check). Note before R2: build-data-manifest from main path; sync uploads ~960 MB .bds/.tif via meshes.sha256 (tell user).
Dash ask 27WB open: Vesta/Ceres checks, Bennu fix, which preview, mesh sizes.

## State 2026-11-02 (resume here)
HEAD 9ddccb514 pushed (PR #986 draft). CI failed on 949da6490: prettier reformatted ATTRIBUTIONS.md (NOT prettier-managed — never `prettier --write` it) → credits.test "dss" backtick; fixed by restoring file + re-applying only the Ceres By-line. Background CI watch running for 9ddccb514 → on red read `gh run view --log-failed`.
Dev server: worktree, http://localhost:5174 (Node 24 npm run dev, background).
User compared Bennu against the brainstorm artifact https://claude.ai/artifact/789req9L8sFa4UWH6eHPSz (three.js prototype: ACES tone mapping, sun intensity 2.8 + hemi fill, grazing default sun angle 140°, body fills frame, OBJECT-SPACE normal map from full SVS model, raw albedo map). Told user: difference is mostly lighting/framing + our tangent-space relief atlas wasting ~half its UV space; seed is a smaller lever than first said.
OPEN dash ask 27WB: vesta-eye check, ceres-eye check, bennu-fix (brighten seed+rebake / +better UV packing / leave), bennu-preview (answered in chat: the artifact), mesh-sizes (cap Bennu relief atlas 2048 [rec] / accept / lossy all). User may answer bennu-fix with "something else": grazing-sun deep-link date or UV packing.
NEXT after answers:
 1. Apply Bennu fix (+ albedo seeds in rows AND importMesh lonlat_albedo mean, re-import/prebake, build-meshes via the 3-key scratch driver the Task 4 agent used — see its commit 95b50a18e message/README).
 2. Apply size ruling; then fix README "quarter of the 600k budget's download" wording (vesta:78, ceres:75, bennu:80) to count atlases.
 3. Ceres eye-check → keep or drop "bright spots of Occator" in packages/website/src/data/dataSourceNotes.ts:592.
 4. Final whole-branch review (opus, spec fidelity + slop), one fix round.
 5. Before R2: run build-data-manifest from MAIN checkout path (public/data is main's symlink; new mesh files unhashed). Tell user sync-r2-secure also uploads ~960 MB .bds/.tif via meshes.sha256. Sync only on user's go.
 6. /feature-done (deletion audit, plan+spec → completed/, archive this ledger), then merge ask (never merge without explicit "merge this PR").
Adjacent debt offered (unanswered): src/compositions/README.md:34 still names deleted CAPTION_FADE_RULES (main's #980).
CI on 9ddccb514: see above (watch finished 2026-11-02).
CI GREEN on 9ddccb514 (typecheck/test/format + Workers build).

## State 2026-11-02 b (resume here)
Ask 27WB answered: Vesta PASS, Ceres PASS (keep "bright spots of Occator"), Bennu = brighten seed + rebake, preview = brainstorm artifact, sizes = cap Bennu relief at 2048; user asked why relief atlases are lossless.
Ruling: cap implemented as Bennu small-tier only (Deimos precedent, no per-slot knob) — caps albedo at 2048 too — cost if wrong: re-add medium + a per-slot cap.
DONE ade428004 (pushed): Bennu seed 0.24→0.30 (row + importMesh), tiers small only, meshAssets row spliced (tierCeiling small, meanAlbedo 0.163), bennu-medium_* deleted from public/data/meshes, README wording fixed (geometry not download). Bennu download 22.2→10.5 MB. CI GREEN on ade428004.
Codec measurement (scratchpad/scripts/normalCodec.mjs, Bennu 4096 normal): lossless 14.9 MB; nearLossless60 9.0 MB p99 1.3° max 2.7°; lossy q90 3.5 MB p99 13.5° max 80° (chroma subsampling across UV seams). 53% of normal atlas texels flat (UV waste).
OPEN dash ask SCu4: bennu-rebake check (before/after crops in scratchpad), near-lossless (own PR all meshes [rec] / this PR new three / keep lossless).
QUEUED findings (ask after SCu4, one set at a time):
 - meshBody/fragment.wesl has no geometric N·L gate: baked normal map lights night-side patches past the terminator (white patch on Bennu, also before). Fix = fade direct by saturate(dot(ng,L)·k). Renderer-wide (Phobos, rovers) → ask fix-in-branch.
 - tools/meshes/meanAlbedo.ts averages empty (black) atlas texels: Bennu 24% empty → glint mean 0.163 vs 0.214 covered. Affects every mesh's glint since phase 1 → ask fix-in-branch.
 - src/compositions/README.md:34 names deleted CAPTION_FADE_RULES (offered earlier, unanswered).
NEXT: SCu4 answers → queued-findings ask → final whole-branch review (opus) → R2 prep (build-data-manifest from main path; ~960 MB raw upload note; user's go) → /feature-done → merge ask.
SCu4 answered (xv3A was a duplicate re-send): bennu-rebake PASS; near-lossless = OWN PR, all meshes (after this one; not started). Next: queued-findings ask (sent 2026-11-02).

## State 2026-11-02 c (resume here)
w4NP answered: night-side leak = fix here; glint mean = fix here; compositions README = fix here.
- Night-side leak: terminator fade tried in meshBody/fragment.wesl; tint probe showed the patch's GEOMETRY faces the Sun (ng·L > 0.1, front-facing) — not a normal-map leak. Fade changed nothing visible → REVERTED (not committed). Patch = tall relief lit past the terminator or a missing self-shadow; no shadow map exists. Reported to user; fix would be self-shadowing (renderer item) — user's call.
- 6311e9834: meanAlbedo surface-weighted (triangle UV centroid × 3D area); rows recomputed via scratchpad/scripts/remeanAlbedo.mts from shipped ceiling .mesh+albedo (factor recovered as stored/old-mean). Shape models now match seeds (Phobos .296, Ceres .300, Bennu .297, Vesta .466); mission glints brighter (Voyager .10→.28, petunias ×2), whale darker (.099→.068).
- 859aadef1: compositions README row.
CI watch running (scratchpad/ci-859aadef1.log).
NEXT: CI green → final whole-branch review (opus) → R2 prep (build-data-manifest from main path; ~960 MB raw upload note; user's go) → /feature-done → merge ask. Near-lossless = own PR after.
Final review dispatched (opus, bg) on review-a7cd55ed2..859aadef1.diff → report final-review-report.md; on return: ONE fix dispatch, one scoped re-review, adjudicate residuals. CI re-watch running (first watch fired before checks registered).
CI: NO run triggered for 859aadef1 (0 runs/check-runs by head_sha ~10 min after push; GitHub event missed?). Re-check after the review; the fix-round push re-triggers anyway.
Final review DONE (report final-review-report.md): With fixes; 0 Critical, 1 Important, 7 Minor.
Ruling: Important (Bennu 0.30 == Ceres 0.30 breaks spec order Vesta ≫ Ceres > Bennu) — kept 0.30, spec now records it — user passed Bennu's look at 0.30 (check SCu4) — cost if wrong: Bennu re-seed ~0.27 + rebake (~3 min).
Fix round 46a1494e0 (pushed): all 7 Minors applied (Vesta README, reliefM top note, SceneBodyId + 2 headers, meanAlbedo clamp + 1x2 v test, Ceres fact "youngest of its kind", 2 rewraps, bennu.ts span comment trimmed). Reviewer's "CI green on 859aadef1" was wrong — no run existed. CI watch on 46a1494e0 running.
NEXT: CI green → R2 prep: run build-data-manifest from MAIN checkout path; tell user sync-r2-secure also uploads ~960 MB raw .bds/.tif; sync only on user's go → /feature-done → merge ask.
R2 prep DONE: manifestMain.mts (scratchpad/scripts) hashed 20 new mesh files into MAIN's public/data/manifest.json (dry run first: only ours pending); Bennu shot loads fine from hashed names. Before /feature-done worktree removal: COPY wt data/raw/meshes/{vesta,ceres,bennu} gitignored files into main (landmine: wt remove deletes them).
CI gap cause: PR was CONFLICTING with main (pull_request runs skip). Merged origin/main → c16ced7e8 (README conflict: took main's table + re-applied CAPTION_PRIORITY row). Full suite 20046 pass, typecheck 0 errors locally; PR MERGEABLE; CI watch running (scratchpad/ci-c16ced7e8.log). Ask ozUD open (r2-sync, bennu-seed-order).
CI GREEN on c16ced7e8 (typecheck/test/format + Workers). User asked why raw files upload: answered (meshes.sha256 backup convention #717; recommended keep). Waiting on ozUD.
User 2026-11-02: R2 upload GO → sync-r2-secure running from wt (bg; log scratchpad/sync-r2.log). Bennu seed q left unanswered → status quo 0.30 stands.
NEW REQUEST: small bodies' orbit trails only when selected/focused (like satellites). Options asked (87BN): A contract — LayerGuides.orbitTrails → group list + OrbitTrailGroup.selectedOnly, core orbitTrailsPass filters rows by selection [rec]; B body-Layer pass with own OrbitTrailRenderer (satellites precedent). Also: obey 'Orbit trails' checkbox [rec] or always on when selected. NO CODE until answered.
Sync #1 FAILED at Mesh sources: wrangler caps files at 300 MiB (Vesta .tif 340 MiB). mesh-body + mesh-texture groups uploaded before it; data manifest NOT uploaded (last) → prod unaffected. Fix (uncommitted at time of writing): syncR2.ts Mesh sources → bulk (rclone multipart), DEPLOY.md line; dry-run OK, deploy tests pass. Sync #2 running (scratchpad/sync-r2-2.log).
Sync #2 DONE: all groups + data manifest uploaded, 8 CDN entries purged; mesh sources 5/5 via rclone (Vesta .bds from #1). Committed syncR2 bulk fix. Waiting on 87BN (trail route + toggle); user asked for code examples → given (A contract / B own pass).
User ruled 87BN: route A (Layer-contract change OK) AND satellites must use the same contract (guides.orbitTrails). Toggle q unanswered (default: obey 'Orbit trails' checkbox).
Proposed contract (in chat): OrbitTrailGroup<K> = { show: K; trails(state, ctx, ...fade) => OrbitTrail[] } (OrbitTrail = OrbitConic & {color, fade}); LayerGuides.orbitTrails → list; keplerTrails(rows, {selectedOnly}) util replaces core's Kepler loop; satellites guides → selectedSatelliteTrails, delete satelliteOrbitsPass + own renderer. Open: hidden-group rule for record-valued (per-class) fades.
Ask AULs open: own PR after #986 [rec] / ride #986 / prep PR first. NO CODE until answered.
CI GREEN on c9ed94691. User wants trail contract DATA ONLY: proposed OrbitTrailGroup {show, orbits: {kind:'kepler', rows, when:'always'|'selected'} | {kind:'conics', conics: live OrbitTrail[] refilled by a satellites planner}}; risk: planner must run before orbitTrailsPass (unchecked). AULs still open.
User chose MINIMAL contract change in #986 ("yes"): OrbitTrailGroup.selectedOnly?: SceneBodyId[] (data only); core orbitTrailsPass skips those rows unless selection.select/focus is that body. 67de955c0 pushed (+ SMALL_BODY_TRAIL_IDS via isPlanetBody/captionKind, guard test; pass tests 4 cases). Shots: overview pose a,0,0,0,3.7281,1.2,2.5e-11,0 → no small-body trails; +focus=body-ceres → Ceres trail only. Satellites onto shared data-only contract = later PR (not started; AULs superseded). CI watch running.
NEXT: trail eye-check → /feature-done (deletion audit; copy wt raw meshes into main before wt removal) → merge ask.
ozUD answered late: sync once CI green (already done after CI green on c16ced7e8), keep 0.30 (status quo). deME PASS (trails). /feature-done started: full test+typecheck bg, deletion audit (opus bg) → deletion-audit-branch.md; inventory: unexpected files all session additions (trails, meanAlbedo, syncR2, captionKind fixture updates, backlog phase line); smoke items 2,4(partial),5(search/hover),6 (1900/2100) unattested.
DoD baseline: tests 20056 pass, typecheck clean.
CI GREEN on 67de955c0.
Deletion audit DONE (deletion-audit-branch.md): safe-now S1–S5 applied 3166e3f61 (−25 net). Needs ruling R1 triangleArea util (both meanAlbedo+buildMeshes), R2 DSK snippet once not ×3 READMEs, R3 drop 'ignores atlas texels' test. Smoke unattested: checkbox, search/hover, 1900/2100. Ask sent with rulings + smoke links.
CI on 3166e3f61: see scratchpad/ci-3166e3f61.log
CI GREEN on 3166e3f61.
