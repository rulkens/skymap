# SDD ledger — plan: docs/superpowers/plans/2026-09-17-albedo-bench.md

Branch worktree-albedo-bench, draft PR #752, base 138f648c1. Lean protocol (sdd-execution.md).
Questions at start: parallelism = one plan/PR, serial dispatches; perf gate = none (tools only) — user "ok go" 2026-09-17.

## Pre-flight scan

| Pair / task | Produces → consumes | Finding |
|---|---|---|
| T1 → T5/T6/T7 | `AlbedoApply`, `parseAlbedoRecipe` | ok |
| T2 → T4/T6 | `SlopeLattice`, `readSlopeLattice`, `sampleSlope` | T4 samples slopes at canvas pixel centres from a level-8 lattice — consistent with spec §5 |
| T3 → T4 | `fitShadingGradient` | ok |
| T4 → T6/T7 | `SunField`, fakes | fakes needed by T4, T6, T7 tests → shared fixture (R-P1) |
| T4 self | regional == global test | only holds if window centres + output cells sit on a GLOBAL lattice (R-P2) |
| T5 → T6 | `sample` callback | ok |
| T6/T7 | decorator throws outside `field.bounds`; route fits field over exactly `box` | boundary must be inclusive (R-P3) |
| T8 self | UI, no tests | ok |

Ruling R-P1: analytic imagery/height fakes live in `tests/fixtures/textures/albedoFakes.ts` — shared by T4/T6/T7 tests — cost if wrong: one file move.
Ruling R-P2: window centres at latitudes that are integer multiples of strideKm from the equator, longitude steps from −180 per row; output cells on a global strideKm/2 lattice; `region` only selects which cells/windows — cost if wrong: bench ≠ bake (the T4 equality test catches it).
Ruling R-P3: "inside field.bounds" is inclusive with a 1e-9° tolerance — cost if wrong: spurious throw on exact-edge boxes.

## Dispatches
- D1 (T1–T4) dispatched, Sonnet, base 138f648c1 — running

## Next (queued sequence)
1. D1 reply arrives → if deviations, rule + ledger; log `- D1 done HEAD <sha>, model, turns`.
2. Dispatch D2 = T5–T6 (Sonnet, same brief shape as D1: plan header + task headings, rulings R-P1 (reuse albedoFakes) + R-P3 (inclusive bounds), D1's actual exported names).
3. Dispatch D3 = T7–T9 (Sonnet; bench server, UI, docs; pattern tools/famous-curator).
4. Push, check CI on #752 (fetch/merge main first if main moved).
5. One whole-branch final review (Opus): spec fidelity + slop; one fix round by implementer; no re-review.
6. User smoke per plan DoD (npm run albedo-bench :5700) — user looks, don't claim visual results.
7. /feature-done, then squash-merge ONLY on user's word; notify F4 (#743) to wire recipe + point preview defaults at MARS_SURFACE_SHADING.
User directives this session: "ok go" to execute plan; no Co-Authored-By trailer; never commit on main.

## Log (after Next list was written)
- D1 done: T1–T4 commits 45bcb9ba2..0d0882f46, Sonnet, 156 tool uses, 18 targeted tests + typecheck:fast green.
Ruling D1-a: SLOPE_VARIANCE_REF / PRIOR_WEIGHT / CONFIDENCE_EPS chosen by implementer — accepted; bench tuning reveals if wrong — cost: retune constants.
Ruling D1-b: Mars radius was hardwired in two generic files (readSlopeLattice, fitSunField) — un-braid in D2's first commit: `fitSunField` opts gain `radiusM`, `SunField` gains `radiusM`, `readSlopeLattice(height, box, radiusM)`; decorator passes field.radiusM; callers (bench) look up SCENE_PLANETS mars datumRadiusM once — cost if wrong: one extra field on SunField.
Ruling D1-c: albedoFakes derives imagery slopes via real readSlopeLattice — accepted; T2's analytic plane test independently pins sign/scale — cost: a sign bug shared by fake+fit would only be caught by T2's test.
Ruling D1-d: canvas bands snapped to the global FIT_CANVAS_LEVEL pixel lattice — accepted, consistent with R-P2.
- D2 (T5–T6 + D1-b) dispatched, Sonnet, base 0d0882f46.
- D2 done: 44d8ae9d5..744dba595 (refactor radius, pipeline, decorator), Sonnet, 82 tool uses, 150 targeted tests + typecheck:fast green, no deviations. sRGB helpers new at tools/utils/color/{srgbToLinear,linearToSrgb}.ts.
- D3 (T7–T9) dispatched, Sonnet, base 744dba595.
- D3 done: ccf0ac447 server, f8719eb78 UI, 14186f04e docs; Sonnet, 119 tool uses; full suite 1314 files/8736 tests green, tsc clean. Flagged 4 judgment calls (render body carries sunFit; offsetM=0; seam preset placeholder (0,0) "retarget me"; restartOnPluginChange copied) → handed to final review to rule.
- Merged origin/main → 639dd3ef3, pushed. CI running on #752.
- Final review (Opus, bg) dispatched on review-597d0fe58..639dd3ef3.diff → writes final-review.md. NEXT: one fix round (Sonnet) on its findings, no re-review; then CI green check, user smoke on :5700.
- Final review done: 1 critical, 3 important, 11 minor (final-review.md). CI on 639dd3ef3 FAILED lint only: App.tsx react-hooks/exhaustive-deps ×2 (useMemo 'view' L42, useEffect 'recipe' L124).
Ruling FR: accept findings 1–7, 9–15 and reviewer rulings (a) recipe body, (b) offsetM=0 accept, (c) delete seam preset, (d) extract tools/utils/vite/restartOnPluginChange.ts — spec-faithful, measured evidence — cost: one fix dispatch. #8 antimeridian → README known-limit line, not code (smallest diff). #9 adjacent src/ sRGB copies → ask user at landing. Lint errors ride the fix round.
- Fix round dispatched, Sonnet, base 639dd3ef3.
- Fix round done: d2c9c1ef1..20d9936aa, all findings applied, full suite green, lint clean; #8 README limit line present. Deviations (fix-report.md): equality <1e-9 not 0; clamp kept in fake; extra ledger IDs removed — accepted.
- PR went CONFLICTING: F4 #743 MERGED to main (b14487242) with the PROTOTYPE maths landed verbatim: tools/textures/delightedImagerySource.ts (317 lines, fixed photo sun az64/el28, flatten step), AlbedoDelight.d.ts, surfaceBodies/marsAlbedoRecipe.ts (MARS_VIKING_DELIGHT + MARS_VIKING_GRADE, user-tuned), src ColourGrade.d.ts + tools/utils/image/gradeRgbaInPlace.ts (grade with peak-preserving normalise), wired in marsSurfaceBake.ts:386,398. Its headers say "a later PR replaces this with a shared implementation". Merged main → bf4b93c4d (DATA.md conflict resolved), typecheck:fast clean, pushed.
- HALT: premise changed — two de-light implementations + two grade shapes now coexist. User ruling needed on scope (see chat).
- USER RULING 2026-09-17: "Land bench, replace later" — merge #752 with grade unified onto F4's ColourGrade + gradeRgbaInPlace (delete gradeSrgb); swapping marsSurfaceBake from delightedImagerySource to albedoRecipeImagerySource is a follow-up PR after tuning.
- Grade-unify done f77eb1d56 (gradeSrgb deleted, grade applied once via gradeRgbaInPlace, 8763 tests green). CI on #752 GREEN, MERGEABLE. WAITING on user smoke.
- Grade-unify dispatch, Sonnet, base bf4b93c4d.
- Bench started (bg, :5700). USER: prefers the prototype artifact's UI (https://claude.ai/code/artifact/74971767-2277-4384-b6f0-d11344dd8196, published from F4 session, not readable here). Prototype files recovered from F4 scratchpad → ledger dir prototype/ (template.html, look.png, lightjs.txt). UI restyle dispatched, Sonnet, base f77eb1d56.
- Restyle done 1fd4a7f55; USER asked zoom full→detail → pan/zoom 67e543d8c (wheel about cursor 0.2–360°, drag pan, CSS preview transform, Whole planet preset). No Redux in bench (useState; user asked, offered useReducer/RTK — no answer yet).
- PERF FINDING: /api/field 2° Gale ≈18.6 s; 90°+ box >30 s; /api/render whole planet >30 s. Hypotheses (unprofiled): geoTiffImagerySource not reading COG overviews for small px; per-view refit. Proposed: profile, then overview reads + background global fit cached per sunFit (in-memory, R4-compatible). USER RULING: scale the fit to the view.
- bcac00e13 image-drag fix; bddeb0bbd preview-fit scaling (strideKm only — scaling fillSigmaKm/windowKm blows up growRegion at the poles, measured crash + slower); bcfb7d2c9 View section + arrow toggle (off skips /api/field). Timings: 2° 1.7 s unchanged, 30° 24→9.6 s, 90° hang→51.5 s.
- OPEN BUG (measured, shared code): geoTiffImagerySource.readBox always decodes at native resolution (never COG overviews) AND its final raw sharp() call omits limitInputPixels:false → any box wider than ~64° THROWS "Input image exceeds pixel limit" in both variants. Bake unaffected (small tiles) but it is the wide-view blocker. Fix dispatched.
- 768ce2500 overview reads + limitInputPixels (root cause: raw-buffer sharp() lacked the opt-out). USER RULING: rebuild the COGs with overviews → done 2026-09-18 via gdaladdo -oo IGNORE_COG_LAYOUT_BREAK=YES in place (Viking 7 levels 1.32→1.57 GB, MOLA 6 levels 0.78→1.23 GB, base pixels untouched); READMEs updated e1223a1be. Stale bench process (PID from 17 Sep) served old code — user authorised hard restart; after it: render 2° 0.07 s, 30° 0.06 s, 90° 0.05 s, globe 0.05 s (was 24 s), adjusted Gale 1.57 s cold / 0.2 s cached.
- 7585ebfcd pending veil (dim + spinner over the stale image) per user.
- USER: "this is good enough for now" — perf work stops here.
- Also reported, not done: decode/lattice cache (~44% of a slider tick, needs fitSunField restructure); scaling FIT_CANVAS_LEVEL/SLOPE_LEVEL with the preview factor (real win, needs fitSunField parameterised). NEXT: CI green → user smoke :5700 → /feature-done → merge on user word → backlog/brief the swap follow-up; ask about the 4 src/ sRGB copies.
- PAUSED 2026-09-18 at user's word ("we'll pick this up later"). CI GREEN on 728ca1841 (typecheck · test · format + Workers Builds), tree clean, pushed, #752 still a DRAFT. Bench was running on :5700 from a bg task — that process dies with the session; restart with `npm run albedo-bench`.
- RESUME HERE: (1) user smoke on :5700, the 7 DoD steps in the plan; (2) optional Viking seam preset if the smoke finds one (lon/lat from user); (3) /feature-done (flips draft, files plan+spec under completed/); (4) squash-merge ONLY on user's word. Then the swap follow-up PR (marsSurfaceBake → albedoRecipeImagerySource; F4's tuned values do NOT transfer — fixed photo sun + flatten step vs fitted field), and two open asks: fold src/'s 4 private sRGB copies into the shared helper? move the bench UI off useState?
- RESUMED 2026-11-06: merged main (273 behind) → 62addc499; repointed moved types, inline types into @types/ (noInlineTypes ratchet) ed64de009; website workbench section + picture, bench README/DATA.md corrected (bake does not read the recipe yet), swap backlogged ff23d7b0c. CI green. USER smoke: all 7 passed.
- /feature-done deletion audit (opus): real bug — applyAlbedoRecipe wrapped channels past white in a Uint8Array; failing test first, fixed via linearToSrgbByte 811db9ec9. Safe-now cuts f49f4397f (−187).
- USER RULINGS (ask RAkG): A slider table bc1d1e37b; B SunPanel on SliderRow, 3 decimals 1f9d511d4; C + F ride the swap PR (backlog); D keep coarse-fit badge; E original render carries no recipe 20a0f3831; J FIFO field cache bc3461842; loose types → @types/ 647c87708; fold the sRGB copies (src + tools) 2680b438c; RTK store for the bench UI a6c49acb0 (+217, effects not thunks).
