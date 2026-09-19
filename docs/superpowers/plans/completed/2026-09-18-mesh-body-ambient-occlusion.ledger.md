# SDD ledger — mesh-body ambient occlusion

Plan: docs/superpowers/plans/2026-09-18-mesh-body-ambient-occlusion.md
Branch: mesh-body-ao-bake (worktree ambient-occlusion-3d-models), base 85085237c

Ruling: parallelism 1, no perf gate — user AFK ("go ahead"); the shader adds one channel of an already-sampled texture and one pow on mesh bodies only — cost if wrong: an unmeasured sub-0.1 ms regression.
Ruling: R2 sync of the re-bake stays with the main session after merge.

## RESUME HERE (2026-09-19)
Uncommitted tree = 3 separate units, each recorded below:
  1. fragment.wesl Filament micro-shadow (softer) — awaiting user eye-check; commit as "fix(meshBody): softer micro-shadow (Filament form)" if OK. If still too strong: next lever = AO_DISTANCE_FRACTION 0.25→~0.12 + rebake (bake-side, not shader).
  2. meshAssets.generated.ts meanAlbedo drift from the repack — commit with a "chore(meshes): re-bake …" commit.
  3. meshBody.ts DEBUG-ZOOM (standoff 0.5) — REVERT to 2 before any commit/PR.
Background: dev server shell buxxa2g00 (:5173); Blender GUI shell bfeq1bki0 showing scratchpad/perseverance_compare.blend (source | baked | AO-only | baked×AO).
Scratch tools (scratchpad): manifestMain.ts (rebuild MAIN public/data manifest after build-meshes — the worktree's is a symlink and skips), compareBlend.py, uvCoverage.ts, mrStats.ts, bakeState.py.
Remaining AO-PR steps: Task 7 backlog edits (delete effort A from docs/backlog/2026-09-18-mesh-body-ambient-occlusion.md, rewrite effort B to start from baked contact.png + extras.contactDecal, BACKLOG.md line; backlog adjacent finding petunias/whale AO + repack-atlas note); spec/plan amendments for repack + micro-shadow + axis fix; one final whole-branch review (Opus); push + draft PR; R2 sync from main after merge.
Stacked DECAL PR brainstorm (not started in code): ruled = projected box decal (Unity/Unreal-style, depth-reconstructed). Findings: foreground:0 depth is RENDER_ATTACHMENT only (renderTargets.ts:105-118) → needs TEXTURE_BINDING; executeFrame already has an unused `depth: 'sample'` step mode; insert decals between 'surface-tiles' and 'atmosphere-shell' (frameOrder.ts:216-229) so aerial perspective lands over them; reconstruct in rover-local frame; boxes drawn with the rover's model matrix; buildMeshes to ship <key>_contact.png + contactDecal in body frame. OPEN question to user: general decal stage vs contact-shadow-specific (recommended specific).

UPDATE 2026-09-19 (later): user disliked micro-shadows → reverted (b072d0bce reverts 0570f57ea; Filament variant discarded). meanAlbedo committed d5de5af4a. Only DEBUG-ZOOM remains uncommitted (revert before PR). User priority: land the DECAL work next. Mesh texture tiers (4K) discussed, not ruled — likely own PR after AO.

LANDING 2026-09-19: DEBUG-ZOOM reverted, backlog (effort B → docs/backlog/2026-09-18-mesh-body-contact-decal.md) + spec/plan docs committed, pushed, DRAFT PR #758. Final Opus review running in bg → apply real findings, then CI green → /feature-done → squash-merge ON USER'S WORD → R2 sync from main. Decal PR: ruled contact-shadow specific (no general decal stage); next = refactor-ground → spec → plan, stacked on #758 (or off main once merged).

Final review done → fixes 58fbbb8f8 + docs; CI watch bg shell bxv4gx590. DECAL refactor-ground checkpoint POSTED 2026-09-19 (awaiting): data = MeshAssetRow.contactDecal? {centre,halfU,halfV} body frame (bodyFromSource + centroid shift at build), _contact.png optional fetch → MeshAsset.contactShadow? (NOT a texture slot), r8unorm, half-height constant, f64 inverse matrix, unit-cube back faces, homogeneous depth reconstruction, multiply blend. OPEN asks: (A) existing depth:'sample' step after the foreground line (no prep; darkens wheel bottoms) vs (B, recommended) prep: split a foreground chain row around a depth-sampling pass (clear→sample→load); and prep separate PR vs one PR. Adjacent: stale renderTargets.ts:111-113 comment (depth already TEXTURE_BINDING at :416) + backlog claim — fix in decal PR.

## Dispatches
- docs commit (spec + plan) on top of 85085237c; mesh sources symlinked from main into wt data/raw/meshes (outputs real files)
- D1 Tasks 1–4 (Python + driver), Sonnet, 91 tool uses — DONE, 3a5c…→225cf69d8 (e5b1120ef, 2d94b9efd, 7ed892e8d, 225cf69d8). mer+hubble prebaked in wt: ORM packing confirmed (occlusion === MR texture), mer stamp [0,1,0], hubble none; ~35 s/key. mer AO atlas eyeballed: panel tops white, undersides dark.
- D2 Task 5 (buildMeshes), Sonnet, 34 tool uses — DONE → 9cf762b90 (18/18 buildMeshes tests)
Ruling (user 2026-09-19): bake the contact decal TEXTURE in this PR (Task 4b added to plan + spec, docs committed); drawing it stays effort B.
- D1b Task 4b (contact decal bake), Sonnet, 25 tool uses — DONE → b3efbc885. mer contact.png: 2 near-black blobs (only one wheel pair touches the plane?), a BRIGHT HORIZONTAL LINE across the body shadow — suspect artifact, check before/at the decal PR.
- D3 Task 6 (shader), Opus, 23 tool uses — DONE → 02c128f38 (naga-validated via scratch link; no suite test compiles meshBody WGSL)
- User caught: ground plane VERTICAL (glTF +Y used as Blender vector). Controller fix committed (glTF↔Blender conversion); all 6 mer wheels now within 0–1.7 cm of the plane. Re-baking mer/curiosity/perseverance (bg). The bright-line/two-wheel decal was this bug.
- Re-bake of all 5 done (seated with fixed plane); build-meshes run (meshAssets.generated unchanged); main's public/data manifest rebuilt via scratch call (only *_mr hashes changed). Awaiting user eye-check on :5173. Remaining Task 7: backlog edits.
- User: Perseverance/Spirit AO barely visible → cause: smart_project packing covered 6.6% of perseverance atlas. Ruling (user "yes"): add concave rotating pack_islands to unwrap (committed); re-baking all 5 (bg), then build-meshes + main manifest rebuild (scratchpad/manifestMain.ts) + per-mesh coverage report.
- Repack re-bake DONE, build-meshes + main manifest rebuilt. UV coverage: voyager 26.2, hubble 51.7, perseverance 35.7 (was 6.6), curiosity 49.7, mer 59.4 %. Awaiting user eye-check.
- User: AO invisible in app. AO-only debug view confirmed AO reaches GPU (reverted). Cause: sun dominates, no shadow map. Ruling (user "yes"): micro-shadowing (Chan 2018) on the direct term — committed, naga-validated. meshAssets.generated.ts meanAlbedo changed by repack (uncommitted, commit with rebake). Awaiting eye-check.
- User: micro-shadow too strong → switched to Filament's softer form (UNCOMMITTED in fragment.wesl, naga OK). TEMP DEBUG-ZOOM: meshBody.ts MESH_BODY_STANDOFF_RADII 2→0.5 (UNCOMMITTED, MUST REVERT).
- Task 7: prebake curiosity/perseverance/voyager RUNNING (bg shell); mer + hubble already baked at b3efbc885 code. Then build-meshes (writes main's public/data via symlink), backlog edits.
- Stacked decal PR brainstorm: user RULED projected box decal (depth-reconstructed; needs sampleable foreground depth + pass break after terrain, draw terrain → decals → mesh bodies, reconstruct in rover-local frame). Next brainstorm questions pending; user asked to see the contact.png bright line (opened in Preview).
- D3 Task 6 (shader, review: yes), Opus — pending
- Task 7 controller inline
