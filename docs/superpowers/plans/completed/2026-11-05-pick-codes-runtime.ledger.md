# SDD ledger — pick-codes-runtime (prep PR)

Plan: docs/superpowers/plans/2026-11-05-pick-codes-runtime.md · Spec: docs/superpowers/specs/2026-11-05-selection-kind-facts-design.md
Worktree: .claude/worktrees/layer-m1-plan · Branch: pick-codes-runtime · BASE: cb0907bfa (spec 4fbec57f9 + plans, off main 7d5b9a2fe)
Ruling: parallelism = 1 (feature plan waits on this PR's merge) — ask 2cCR — cost if wrong: none
Ruling: perf gate skipped — ask 2cCR — one uniform field, no per-frame work
Dispatch plan: D1 T1–2 (sonnet) · D2 T3–4 (opus; T4 review:yes) · D3 T5–6 (sonnet) · D4 T7–8 (opus; T7 review:yes) · mid-review after D2 (T4) and D4 (T7) · final whole-branch review (opus)

## Dispatches
- D1 T1–2 · sonnet · BASE cb0907bfa · dispatched · dev server :5174 (bdmbqwylq)
- D1 T1–2 · sonnet · cb0907bfa→9ffa28dad · done · 49 tool uses · deviations: EngineState.pickCodes field; body/structure rows find entry by code via SOURCE_ENTRIES
- controller fix: allocator started at 0, spec says dense from 1 → 73372aa87
- D2 T3–4 · opus · BASE 73372aa87 · dispatched
- D2 T3–4 · opus · 73372aa87→6e5a4e5a9 · done · 147 tool uses · deviations: pickCode/pickSources typed number; structureMembership packedIds deleted; highlight = encodePick-offset; shared catalogPickCodes util; ids = entry ids ('gaiaStars'); StarUniforms.pickCode @136; star camera BGL +FRAGMENT; tests/support fakePickCode+legacyPickCode
- controller fix: noInlineTypes (Owner) → c3156e0b0
- mid-review T4 · opus · dispatched; D3 T5–6 · sonnet · BASE c3156e0b0 · dispatched
- mid-review T4 · opus · clean (layout, BGL visibility, source/code split). Low: plan Task 7 says id 'gaia' → real id 'gaiaStars' (fix plan after D3; brief D4). Nit: io.wesl:21-22 'it'→'them' (final fix round)
- D3 T5–6 · sonnet · c3156e0b0→e12a27e51 · done · 117 tool uses · hover smoke NOT done (no browser) → do at Task 8 smoke · deviations: earthSceneMeshesPass unchanged (stamps nothing); single runtime.pickCode for MW/BH/sats/ZoA; StructurePickCodes; several producers became factories; tests/support/layerPickCodes.ts
- plan fix 'gaia'→'gaiaStars' → e35117c84; D4 T7–8 · opus · dispatched
- D4 T7–8 · opus · e35117c84→d42fe03c8 · done · 127 tool uses · Playwright smoke: Earth, Mars, M31, Sirius, Gaia field star, Virgo, Voyager 1, ISS resolve; overlay ok. Not checked: caption clicks, ZoA shell, per-category rings, a moon · deviations: overlay gets Gaia code at draw (allocates if absent); seed param removed; testPickCode.ts; source.ts header + RENDERER.md fixed
- pushed; draft PR #1057; CI watch bg; final review · opus · dispatched
- final review · opus · 3 must-fix (dead Source imports, ownerOf unused + wrong comment, source.ts comments half fixed) + optional (non-allocating Gaia lookup, comment wording, catalogPickCodes generic, missions single code, fold persisted tests, helper sprawl, revert visual README). Ruling: take all in one fix round — all are deletions/consistency — cost if wrong: one extra review cycle
- fix round · sonnet · dispatched
- fix round · sonnet · d42fe03c8→f6d5525bd · done · 51 tool uses · all 10 findings; overlay keeps 'gaiaStars' literal (engine must not import a Layer entry); pushed; CI on first head PASSED (7m51s); CI on f6d5525bd watching
- CI on f6d5525bd PASSED (7m21s); mergeable; merge ask sent
- MERGED #1057 as 7976bca95; remote branch deleted; ledger archived
