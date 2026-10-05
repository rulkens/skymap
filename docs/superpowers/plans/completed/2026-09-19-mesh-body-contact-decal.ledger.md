# SDD ledger — mesh-body contact decal

Plan: docs/superpowers/plans/completed/2026-09-19-mesh-body-contact-decal.md
Spec: docs/superpowers/specs/completed/2026-09-19-mesh-body-contact-decal-design.md
Branch: mesh-body-contact-decal (worktree ambient-occlusion-3d-models, dev :5173), base 41e3952e8 (#758 AO merged)

Rulings: projected box decal, contact-shadow specific; option B (foreground row split clear→sample→load); prep = Task 1 as the PR's first commit (assumed — user said "ok" without answering separate-PR; flag if they object).
Perf gate: npm run perf A/B at a rover site (Task 6).

## RESUME HERE
User said GO 2026-09-19. Draft PR #760 open. Dispatches: D1 Task 1 (Opus, review), D2 Tasks 2+3 (Sonnet), D3 Tasks 4+5 (Opus, review), Task 6 controller. On D1 done: check diff, then dispatch D2 (D2 and D3 touch meshBodyRenderer.ts both → sequential).
Other open: R2 sync of #758 re-bake from main; 3 AO deletion needs-ruling items (recommended keep); mesh 4K tiers unruled.

## Dispatches
- D1 Task 1 (Opus) — DONE e6e2345cb (697 frame tests green; +bodyRowSteps.ts, resolvePassNames.ts frame files for purity ratchet, rosterPassNames util; executeFrame unchanged). Controller-reviewed OK.
- D2 Tasks 2+3 (Sonnet) — DONE 4aa9d23d1, 34faebee5 (170 tests, typecheck clean). Hand-edited only the TYPE block of meshAssets.generated.ts (contactDecal? + import) to keep round-trip test green; rows regenerate in Task 6.
- D3 Tasks 4+5 (Opus) — DONE 2b7873dc5, fd2df0ddd (full suite 8937 green, naga OK). uv needed v-flip (`vec2(p.x,-p.y)`) — first suspect if footprint mirrored. Winding doubt: if handedness flips, shadow vanishes with camera inside box.
- Task 6 controller: build-meshes + main manifest → 5cee94ad2 (rows; emit made prettier-shaped). FOUND: allowDataFile omitted `_contact.png` → not in manifest/R2; fixed test-first 4cd71c780.
- Perf A/B (earth-surface + solar-system, 60 frames, e6e2345cb vs HEAD): TOTAL 37.0→37.5 and 37.5→38.0 ms; body row 0.5 → 0.4+0.5 (AFTER_DEPTH_0) ms — the split's extra pass costs ~0.4 ms per body row EVERYWHERE, rover or not. HALTED for user ruling (mitigate: skip the split when no decal draws, vs accept). Results in scratchpad perfBefore/After.txt.
- User asked: why PNG not WebP for mesh textures — no recorded rationale; answered, offered follow-up.
- User eye-check: dark square patch → root cause contact texture lacked RENDER_ATTACHMENT (copyExternalImageToTexture rejected) → fixed test-first f2164d62b. User: "contact shadows draw, great!"
- RULING (user): perf is fine as is (accept ~0.4 ms split, no mitigation). WebP / contact 512² question unanswered.
- Final whole-branch Opus review DONE. Real bug #1 (confirmed): split row's 'clear' segment gated off (no terrain: Jupiter/Io, Mars pre-tiles) → 'load' segment inherits previous row's depth. #2: contact 404 rejects whole mesh. Fix wave (Opus, bg) RUNNING: executor clears on first opened step of a row + skips sample when uncleared; catch contact fetch; cleanups (#5–8,#9 fixed slots + one marker,#10,#12–14).
- NEEDS USER RULING: #3 shader hardcodes reversed-Z (d==0 sky) vs renderer's reversedZ flag; #4 contactShadowsPass reads depthViewOf('foreground:0') literal vs spec.target; #11 pose-read block duplicated from meshBodiesPass (helper?).
- RULED (user "ok fix" = my recs): #3 keep hardcoded, #4 keep literal, #11 EXTRACT shared pose helper (dispatch after fix wave lands).
- Fix wave DONE: 160f8f366 (executor depthClearedRows), 2de3907e9 (contact 404 → no shadow), b6e8c6e77 (cleanups; one marker, fixed SAMPLE_DEPTH/AFTER_DEPTH slots). 8941 tests green.
- Pose-helper extraction DONE 69e3ec898 (LOCAL ONLY, not pushed): hostBodyFrame util + HostBodyFrame type, +51/-19 — replaces only a 5-line block; User then reversed: REMOVE → reverted 56b1beae6 (tree == b6e8c6e77), pushed. NEXT: user recheck (rover + moon-over-planet), CI green, /feature-done, merge on user's word, R2 sync.
- User eye-check after hard reload: contact shadows draw; moon-over-planet OK. Merged main (#759; BACKLOG conflict resolved) 5c513c992.
- /feature-done: 1343 files / 9049 tests green, tsc clean. Deletion audit safe-now applied f1f6d6792 (~31 LOC). Needs-ruling (recommend keep all): uniform-layout pack (~30), ContactDecalStamp type (re-prebake to drop), one-marker throw, stamp both-or-neither check, existsSync precheck, minBindingSize.
- Then: push, CI, /feature-done, merge on user's word, R2 sync.
