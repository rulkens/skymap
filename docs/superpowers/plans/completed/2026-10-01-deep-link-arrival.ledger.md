# SDD ledger — plan: docs/superpowers/plans/2026-10-01-deep-link-arrival.md
Spec: docs/superpowers/specs/2026-10-01-deep-link-arrival-design.md · PR #831 · branch worktree-deep-links-open-on-subject
Parallelism: single active plan · Perf gate: none (no per-frame work) — accepted 2026-10-01
Pre-flight scan: no conflicts (T2 creates applyLinkIntent → T3 edits → T4 deletes; T5 arrivalSaga → T6 extends; sequenced).
Dispatches: D1 T1-3 · D2 T4-5 · D3 T6-7 · D4 T8-9. review: yes → T1-6 (Opus implementers).
D1 (T1-3) opus BASE 72cec575c — dispatched
D1 done 72cec575c→902e6549c (T1 35ff3625b, T2 39142b168, T3 902e6549c) — opus
Ruling: updateSelectionFocus carries transition as RTK meta defaulting to 'fly' (requestFocus keeps it required) — leaves 14 direct dispatchers untouched; default is the existing behaviour — cost if wrong: a future cut path forgets to pass it and tweens (caught by the cut test)
Ruling: hashchange runs readAbsent defaults after the link's actions, not interleaved — they write independent slices — cost if wrong: an ordering bug on back/forward, surfaces in Task 4's hashchange test
Ruling: LinkView pose is FramedCameraPose, t is Unix ms, linkIntentFrom(string), precedence in utils/url/combineLinkViews.ts — matches existing codec types — cost if wrong: Task 4+ briefs must use these names (carried)
D1 review (opus): T1-3 Spec ✅ quality approved; 1 Important (3 hand-built body SelectionRows → utils/scene/bodyRowAt) + 6 minors → fix round 1 sent to D1 implementer
Carry into D2: a 'cut' focus on a moving body still gets follow's eased approach (cameraDrivers.ts:166) — arrival commit must land at framingPose so follow debt reads settled; Task 5 test asserts no glide on body-mars
D1 fix round 1 → 2ff1f9180 (7 addressed, 0 open; lean: no re-review). D1 complete 72cec575c..2ff1f9180
D2 (T4-5) opus BASE 2ff1f9180 — dispatched
D2 done 2ff1f9180→03a97d678 (T4 895245ffe, T5 03a97d678) — opus; Mars premise CONFIRMED headless (no re-ease)
Ruling: accept D2 deviations (SagaContext.home, pure homePose shared, bare-hash change leaves camera, navigate waits for runtime, replace-writes while pending, selectHasSelectionIntent deleted) — consistent with spec; reviewer checks — cost if wrong: one fix round
Task 1: complete (commits 72cec575c..35ff3625b, reviewed; fix round in 2ff1f9180)
Task 2: complete (commits 35ff3625b..39142b168, reviewed; fix round in 2ff1f9180)
Task 3: complete (commits 39142b168..902e6549c, reviewed; fix round in 2ff1f9180)
Task 4: implemented (commits 2ff1f9180..895245ffe), review in flight
Task 5: implemented (commits 895245ffe..03a97d678), review in flight
D2 review (opus): T4 Spec ✅; T5 Spec ❌ C1 (home framed at J2000 before goLive), I1 (late resolve after failure steals focus), I2 (idle check race), M1-M4 → fix round 1 to FRESH opus (D2 implementer at 319k ctx)
D2 fix round 1 → 1b07b0ef2 (fresh opus; C1 I1 I2 M1-M4 addressed, 0 open; lean: no re-review)
Ruling: goLive lives in arrivalSaga when intent.t absent (not navigateSaga) — navigate's HOME fallback would wipe a linked t; startLoop goLive deleted — cost if wrong: a non-boot path that relied on startLoop going live boots frozen (CI + smoke catch)
Ruling: failure path also clearSelection()s before home; new ArrivalState reason 'engine-error' skips landing — closes cinema/seedSelection:false late-pin — cost if wrong: one extra reason value to maintain
Task 4: complete (commits 2ff1f9180..895245ffe, reviewed; fix round in 1b07b0ef2)
Task 5: complete (commits 895245ffe..03a97d678, reviewed; fix round in 1b07b0ef2)
D3 (T6-7) opus BASE 1b07b0ef2 — dispatched
D3 done 1b07b0ef2→543b01e58 (T6 3597567a3, T7 543b01e58) — opus
Ruling: accept D3 deviations — navigateSaga returns after first clipStarted (arrivalSaga unchanged); cut tour/clip land home first (splash parity); unknown-id checked after t/orientation; isKeyOf util; veil not mounted under ?cinema (tools wait on ready) — cost if wrong: a ?cinema deep link shows home briefly before arrival (cinema is a recording mode)
Task 6: implemented (commits 1b07b0ef2..3597567a3), review in flight
Task 7: complete (commits 3597567a3..543b01e58, no review tag)
D3 review (opus): T6 Spec ✅ 1 Important (takeover keeps running after arrival timeout) + minors; T7 Spec ✅ approved → fix round 1 to D3 implementer
Ruling: cut #clip= clears the Earth selection after landing home (clip arm only) — the subject is the clip; Earth InfoCard over a linked clip + ease-back-to-Earth at clip end is noise — cost if wrong: one put to remove; splash-started clips keep Earth (unchanged)
D3 fix round 1 → c15aa7a60 (items 1,2,4,5,6 addressed; item 3 test cannot fail → delete in D4)
Task 6: complete (commits 1b07b0ef2..3597567a3, reviewed; fix round in c15aa7a60)
D4 (T8-9) sonnet BASE c15aa7a60 — dispatched
D4 first sonnet STALLED (API error, no commits); resumed by fresh sonnet → affdb8b41 (T8), f9e01a457 (T9); capture-featured body-earth + solarSystem both OK
Ruling: record.ts left untouched — no clip frame-0 guess exists there (recorder hook latch owns it, independent of arrival) — cost if wrong: a stale README line in tools/record
Task 8: complete (commits c15aa7a60..affdb8b41, no review tag)
Task 9: complete (commits affdb8b41..f9e01a457, no review tag)
FINAL review (opus) a600d661f..f9e01a457 — dispatched
CI green at f9e01a457 (typecheck · test · format + Workers build)
FINAL review (opus): ready after fixes — C1 (#orientation= applied after runtime seed → double re-encode), I1 exhibit capture auto-rotate drift, I2 captureScene no post-step frame wait, I3 takeover hashchange pushes history; M1-M5 → ONE fix wave to fresh opus BASE f9e01a457
Ruling: t/orientation move into arrivalSaga before the runtime race (extends the goLive ruling, per final reviewer) — cost if wrong: hashchange path must still apply them in navigateSaga (brief says so)
Task 0 parked: M6 (wireInput boot base computes full homePose that homeSaga recomputes) — Ruling: parked for user — leanness-only, no behaviour change — cost if wrong: one redundant pose computation per boot
Final fix wave → 46d86bf6e (18f49f53d C1, c1949d74c I3+M2, 44f3375ab I1+I2+M1, 46d86bf6e M3-M5); scoped re-review (sonnet): 9/9 ADDRESSED, no new breakage. I1/I2 untested (Playwright-only) → user smoke
Ruling (user, post-smoke 2026-10-03): takeover keys MIRROR running state, any source; Back without the key exits — spec ruling 3 amended; dispatched to fresh opus BASE 46d86bf6e
Takeover-keys change → a2c270b7a (camera.clipId + clipIdChanged added; same-key hash entry skips navigate; Back without key exits); 9 tests fail when mutated out
RESUME (2026-10-03): HEAD a2c270b7a pushed; CI watch running on it (bg `gh pr checks 831 --watch` → report green/red). Dev server on :5174 (this wt, bg shell). NEXT: user rechecks #tour=grandTour / #clip=cosmicFlows keep their key + Back exits → /feature-done (archive this ledger to docs/superpowers/plans/completed/2026-10-01-deep-link-arrival.ledger.md, move plan+spec to completed/) → merge ONLY on explicit "merge this PR" word → R2 n/a.
OPEN (user): (a) field exhibits keep famousGalaxy on? — one-line GALAXIES_OFF change, this PR or backlog; not a regression (main same). (b) M6 parked.
Ruling (user 2026-10-03): consolidate takeover state, riding #831 — registry clip becomes TakeoverSource kind 'clip' (reverses spec §51; spec amended); camera.clipId + clipIdChanged deleted; tour.tourId deleted (selectActiveTour reads takeover id); stopClip deleted (exitTakeover is the one exit verb); one watcher (watchTakeoverSaga) for startTour/openExhibit/startClip; per-kind bracket (scene snapshot+FOV pin for tour/exhibit, clock freeze for clip) — cost if wrong: clip now cancels a running tour/exhibit and vice versa (intended)
Takeover consolidation → c939aec35 (opus impl; 68 files +415/−511; suite 14980 green, typecheck clean); review (opus) dispatched; OPEN (user): HUD hides for tour/exhibit only, not clip — implementer kept today's behaviour
Review (opus) c939aec35: ready after fixes, 0 C / 0 I / 4 M; M1+M2 fixed → a0c167848 pushed; Ruling: M3 kept (hash-row table row is 1 line, the saga test covers supersede+exit — distinct), M4 skipped (shared settle wait already covered) — cost if wrong: one overlapping test line. CI watch running. OPEN (user): clip hides HUD?
CI green at a0c167848 (run 37156401402 + Workers build). NEXT: user smoke (clip Esc/hash/clock; clip during tour ends it; Back exits) → /feature-done → merge on word. OPEN (user): clip hides HUD?
Ruling (user 2026-10-04): a running clip does NOT hide the HUD — current behaviour kept
/feature-done: audit running — npm test+typecheck (bg), deletion audit (opus, legacy) dispatched → deletion-audit-branch.md; findings so far: plan 0/23 boxes (ledger is the record; tick at move), spec+plan 'Out of scope' still list 'writing takeover keys back' (now done — fix), 'npm run shot' follow-up not in BACKLOG (add line)
Deletion audit (opus, legacy): safe-now ~22 src/45 tests (7 items + wrong ArrivalVeilContainer comment) → sonnet applying; needs-ruling R1 recorder latch, R2 computeInitialCamera/InitialCam, R3 tourEnded≡tourStarted, + small → user. User also asked: replace afterTwoFrames with scheduler.nextFrame() (proposed, awaiting yes)
Safe-now applied → a99ad93db (−52 net: src ~13, tests 45; suite 14977 green). Ruling (user): afterTwoFrames→nextFrame BACKLOGGED; R2 full fold APPROVED → sonnet dispatched; R1/R3/R4 DECLINED; R5/R6 not offered (R6 keeps the only clip natural-exit e2e)
R2 → 4309e0eae (+ 95f3f448e dead import); suite 14973 green. /feature-done READY 2026-10-04: plan+spec → completed/, ledger archived, BACKLOG +afterTwoFrames→nextFrame +npm run shot. NEXT: merge ONLY on explicit 'merge this PR'.
