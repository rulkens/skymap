# SDD ledger — plan: docs/superpowers/plans/2026-09-15-mesh-sources-as-blend.md

Spec: docs/superpowers/specs/2026-09-15-mesh-sources-as-blend-design.md
Branch: worktree-mesh-sources-as-blend · draft PR #717 (base main) · plan commit 69ad3bd05
Worktree: .claude/worktrees/mesh-sources-as-blend — `public/data` symlink → main;
`data/raw/meshes/` real dir, gitignored inputs symlinked from main per body (done before T3,
stray `meshes` link removed; `shasum -c meshes.sha256` OK). Task 3 outputs (`<key>.blend`,
`.prebaked.*`) land HERE as real files → copy to main post-merge (DoD), before any worktree removal.

## Pre-flight conflict scan

| Pair / task | Produces vs consumes | Found |
| --- | --- | --- |
| T1 ↔ T2 (meshPrebake.py bodies) | T1 moves pass bodies into importMesh.py; T2 deletes them from meshPrebake.py | consistent — same dispatch (A) |
| T1 ↔ T2 (UV layer) | importer leaves one UV layer via unify_source_uvs; prebake `source_uv` reads its name from the file | consistent |
| T4 ↔ T5 (`meshes.dir`) | T5 keys `${RAW_DATA['meshes.dir'].path}/${rel}`; T4 only reword its description | consistent |
| T4 ↔ T5 (restore URL vs key) | README curl `…/data/raw/meshes/<rel>`; group key `data/raw/meshes/<rel>` | consistent |
| T4 ↔ T5 (cache text) | DEPLOY.md says no-cache/never purged; group row NO_CACHE, purge false | consistent |
| T3 ↔ T2 | T3 gate = empty diff on meshAssets.generated.ts; T2 changes nothing bake-side | consistent |
| T1 self | pass order 1–10 vs SOURCES fields (frame, drop_materials) | consistent |
| T5 self | test asserts two keys with spaces/parens; impl splits on first two spaces | consistent |

Scan clean.

## Rulings

- Ruling: `uploadViaWrangler` quoting fix RIDES this PR (T5) — one call-shape swap, no branch;
  CLAUDE.md wants the separate-PR question asked; user absent → flagged in the PR body and the
  next user-facing message; cost if wrong: a cherry-pick.
- Ruling: dispatches A then B sequential in this worktree (shared index; parallel commits race).
- Ruling: A (T1, T2; `review: yes`, Blender Python, CI-blind) → opus; B (T4, T5) → sonnet.
- Ruling: plan-writer's NO_CACHE (not IMMUTABLE) accepted — re-saved `.blend` under the same key.

## Log

- Dispatch A (T1+T2) BASE 69ad3bd05 → 993a53eea (importMesh.py) + 7ff654e07 (prebake slim),
  DONE_WITH_CONCERNS; report dispatch-A-report.md. Rulings on its deviations: constraints cleared
  in freeze_pose KEEP (behaviour-preserving vs the old evaluated-matrix join); zero-user image
  removal before pack_all KEEP pending T3 (delete at final review if pack_all only warns);
  view_layer.update() KEEP. drop_markers without a faces check and prebake no longer
  un-excluding collections: ACCEPTED (plan-mandated deletions).
- Review A (opus, `review: yes`) dispatched on review-69ad3bd05..7ff654e07.diff → dispatch-A-review.md
- Dispatch B (T4+T5, sonnet) BASE 7ff654e07 — dispatched, parallel to review A (disjoint files)
- Review A: Spec FAIL / NEEDS_FIXES — 2 critical (reviewer RAN Blender 5.2 headless on scratch
  copies): C1 pack_all raises on Curiosity (image with 1 user, missing file); C2 unparenting
  every object drifts matrices 1e-7 → Perseverance decimates to 99 999, MER groundOffset moves
  → empty-diff gate would fail. 4 minor.
  Ruling: SPEC AMENDED (controller) — unparent only the markers' direct children after
  clearing animation on all objects; reviewer's alt.py proved this bit-identical on all four.
  Cost if wrong: one sentence + a few lines to revert; the user sees it at T3. Plan step 6
  amended to match. Fix round 1 → resumed implementer A (opus) with Blender probe verification
  required; stages the two .py + the two docs.
- Fix round 1 A → 69a1d28bc DONE (probe: all four bodies match old path exactly; Curiosity packs).
  Scoped re-review (sonnet): ALL_ADDRESSED.
- Task 1: complete · Task 2: complete (993a53eea, 7ff654e07, 69a1d28bc)
- Dispatch B DONE: T5 02452e57d (R2 group + test + execFileSync), T4 15f857816 (registry rows,
  READMEs, DEPLOY.md). Task 4: complete · Task 5: complete. Pushed to #717.
  Adjacent finding (B): `npm run format -- <files>` is `prettier --write .` — whole repo; B
  reverted the ~622-file sweep and used `npx prettier --write <files>`. ASK the user (pick up
  here or backlog).
- Ruling: final whole-branch review NOW (before T3) so the user's Blender run is against
  reviewed code; T3's commit is 4 sha256 lines and needs no re-review.
- Final review (opus) dispatched on review-69ad3bd05..15f857816.diff → final-review.md
- Final review: NEEDS_FIXES, docs-only — 0 critical, 2 important (READMEs describe the
  superseded unparent-everything freeze, and Voyager/Perseverance "no-op" pass claims are
  measured false), 7 minor, −35 LOC deletable. Code = spec. Restore loop verified in bash+zsh.
  Rulings: deletions 5/6/7 all APPLY (join's animation_data_clear no-op; constraints.clear
  insurance only, measured identical; prebake frame_set redundant — no animation/drivers
  survive import; plan T2 text amended by controller). `parent_clear` in join_meshes is
  LOAD-BEARING (files keep parents) — never delete.
- Fix dispatch (sonnet, ONE) dispatched: all findings + deletions 1–7, one commit.
- Fix commit 42d8ea8fe (+55/−89, all findings + deletions 1–7). Scoped re-review (sonnet)
  ALL_ADDRESSED. Pushed (HEAD 42d8ea8fe on #717). Final review CLOSED.
- WAITING ON USER — Task 3 (Blender 5.2, run in THIS worktree so REPO resolves here):
  `npm run import-mesh -- voyager|perseverance|curiosity|mer` ×4, then
  `npm run prebake-mesh -- <key>` ×4, then `npm run build-meshes`.
  Gate: `git diff src/data/bodies/meshAssets.generated.ts` EMPTY. Then controller: cd
  data/raw/meshes, `shasum -a 256 */*.blend`-style lines for the four `<key>.blend` appended
  to meshes.sha256, `shasum -a 256 -c meshes.sha256`, commit `data/raw/meshes/meshes.sha256`,
  tick plan checkboxes, /feature-done. Post-merge (user, from main): copy the 4 `.blend` +
  `.prebaked.*` into main's data/raw/meshes, `npm run sync-r2-secure`.
  Open user rulings: (a) `uploadViaWrangler` fix rides the PR — default; (b) `npm run format`
  sweeps the whole repo — fix here or backlog.
- T3 RUN 2026-09-15 08:19–08:24: user ran import ×4 (counts = review probe table exactly);
  controller ran prebake ×4 + build-meshes (user: "you can run the pre-bakes"). Logs in
  scratchpad/prebake-*.log, build-meshes.log.
  GATE FAILED — HALT per plan: voyager/perseverance/mer identical; CURIOSITY drifted:
  boundingRadiusM 2.478983700137988→2.4789837008600912, groundOffsetM
  0.8980751155787591→0.8980751162248013, meanAlbedo [0.07811,0.076507,0.075141]→
  [0.077987,0.076399,0.075039]; tris 48384 unchanged. `meshAssets.generated.ts` left
  MODIFIED, UNCOMMITTED. Suspected cause: the 13 marker children's matrix_world rewrite
  (decomposition drift) → unwrap islands reshuffle → albedo mean. Diagnostic probe (opus,
  scratchpad-only) dispatched: per-vertex old-vs-new compare + candidate fixes (strip marker
  geometry instead of delete+unparent; or parent_clear op). User must rule: accept new
  reference vs fix importer.
  SIDE EFFECT: build-meshes wrote main's public/data/meshes/* (unhashed names; manifest
  skipped because public/data is a symlink) — main's dev server now serves the drifted
  curiosity; a rebake from main post-merge, or `npm run build-meshes` in main, restores it.
- Probe (opus): worst vertex 2.4e-7 m on 659 verts / 6 objects (5 unparented children + a
  wheel under one); materials/images/UV source identical; albedo drift = unwrap repack on the
  drifted verts; strip-marker-geometry fix bit-identical, parent_clear op NOT. Prior reviews
  compared bounds corners only.
- USER RULING 2026-09-15: "accept curiosity difference" → generated table committed as the
  new reference. Task 3: complete (f4832450a: sha256 +4 .blend lines, generated table, plan
  ticked). GUI open of a `.blend` (pose/sRGB eye check) NOT attested by the user.
- /feature-done: tests 1224 files / 7976 pass; typecheck clean; all checkboxes ticked; no new
  TODOs; files vs plan: only meshAssets.generated.ts unplanned (T3 ruling). Leanness audit =
  the final review's deletion table (−34 LOC applied in 42d8ea8fe); no separate run. + scoped re-review; then T3 = USER-RUN
  (import ×4, prebake ×4, build-meshes; gate = empty diff on meshAssets.generated.ts); then
  controller appends 4 `.blend` lines to meshes.sha256 + commits; then /feature-done.
- LESSON: Blender 5.2 is installed and agents can run it headless on scratch copies — the T3
  round trip minus the bake can be agent-verified before the user's run.
