# Ledger: 2026-11-10-clip-studio-package

Plan: docs/superpowers/plans/2026-11-10-clip-studio-package.md · branch feat/clip-studio
Parallelism: owner allows up to 7 agents at once; waves run their groups concurrently in this one tree (disjoint file sets).
Perf gate: not run: slice 1 adds no per-frame work (compileClip spans run once per compile).

- Task 0 · controller inline · 2722c69a→8cb5438b · done
- G0 Tasks 0.1–0.3 · opus · 8cb5438b→a44c05e3 (interleaved with G1) · done; 0.4 stopped: contract wrong (see HANDOFF.md)
- G1 Tasks 1.1–1.8 · opus · 8cb5438b→45a7834d · done; 2 files outside set (selectDomeStatus, combineLinkViews), accepted
- Landing: pushed 45a7834d + controller docs commit; typecheck:fast clean, targeted tests 50 files green; CI not yet run
- Task 0.4 · controller ruling: contract amended (draft paths survive resolution; buildTimeline trims error paths), plan d12212c42; test rides G2
- G3 Tasks 3.1–3.4 · sonnet · d12212c42→7e9f40253 · done; review note: StudioTip draws its own key chips instead of reusing Kbd (reuse finding for the final review); no --ch-* tokens yet
- G2 Tasks 0.4, 2.1–2.6 · sonnet · c909c8231→3eba4714d · done; pushed; 4 contract gaps ruled (glyph by family in the model, Settle via waypoint `last`, selection resolves from the full tree, per-kind FieldSpec params) → follow-up dispatched to the same agent
- G3 follow-up (Q39 icons) · sonnet · fe71d2ef2 · done; 34 new icons ported from mock paths, NOT visually checked yet
- G2 follow-ups (4 rulings) · sonnet · →bcf9ca467 · done
- Landing: pushed 2f751f6a4 (wave B complete); typecheck:fast clean
- Wave C dispatched from 2f751f6a4: G4 Tasks 4.1–4.5 (sonnet), G5 Tasks 5.1–5.3 + Q38 Slider compact variant (sonnet); round-3 mock designer running in parallel
- G5 Q38 + Tasks 5.1–5.3 · sonnet · 946b908bc, ca0953603, 2073c587b, f3f9dc1b9 · done; studio tests 25 files/68 green, typecheck:fast clean. Deviations: head eyebrow follows mock (`Top level · 12/18`); only percent fields are sliders (only ones with min+max); channel pick options local Record (engine exports no list); error chips have no action yet. Open: head glyph not family-tinted (InspectorHead has no family prop, no --ch-* tokens outside mock) → controller in Task 6.1 / tokens. Task 6.1 mounts inspector/components/Inspector/Inspector.tsx
- G4 Tasks 4.1–4.5 · sonnet · e8f9aa6d3, 61ef6a12f, 90071520d, 0960b274b, cb2f9c15d · done; timeline/shell tests green. Not visually checked (dock unmounted until 6.1). Deviations: keys only in StudioTip + new KeyHelp `?` overlay from one table shell/data/studioKeys.ts; dock height self-persisted via guarded localStorage (dummy `select` on its PersistedValue); slice-1 trims: no Save/transport/swap, rate/osc as shapes, composite = flat lane, overlaps plain; --ch-* hues live in StudioDock.module.css (promote to tokens.css in 6.1?). For 6.1: `<StudioDock clipId>` absolute at parent bottom, own % height; inspector column is an empty <aside>
- Controller fix: componentFilePurity on G5's FieldRow/RowInspector → FieldRow.constants.ts + inspector/utils/resolvedText.ts; conventions + studio tests 43 files green, typecheck:fast clean
- Task 6.1 · controller · StudioHost + entry export + Inspector column + HUD yields to studio + opaque --dock-bg (relative colour needs `/ 1`) + backlog line/detail · pushed; typecheck clean, 181 files green. Shots data/shots/studio-real/*.jpg shown to the owner.
  Smoke defects seen (fix pass after the owner plays): Fly lane draws no knots (DoD wants 12 on famousFlythrough); ruler `0 s` playhead tag clipped at left edge; `after end` overlaps the last ruler label; inspector clip head shows the id (`cosmicFlows`), not the label. Interactive smoke (edit/undo/keys/drag/reload) not yet run.
- Round-3 designer · done (mocks only, 35 shots round-3-*.jpg, snapshot refreshed); 12 shots shown to the owner. Round-3 reviewer dispatched → docs/design/clip-studio/review-round-3.md; relay score + summary + asks to the owner; loop until 8/10
- Smoke fix pass · sonnet · a11f4e98f · done: Fly row carries knotSecs, CompositeMark draws them; 0 s tag clamped; ruler skips labels under `after end`; clip head shows the label. 43 files green, typecheck clean.
  FINDING for the owner (adjacent, unruled): famousFlythrough from an Earth-close live start spends ~103 of 107 s on the first leg (buildPathTrack's arc metric: log distance from ~1e-7 Mpc dominates), so all 12 knots pile up at 107.27 s. Real playback pacing, not a studio bug. Ask together with the round-3 reviewer's asks.
- Round-3 review · 8/10 (target met; round 2 was 7) → review-round-3.md. Major: Read-only state leaves edit controls live (ASK 1). Minors: inspector overflow, unit placement, Use-current-view placement/fill, playhead head covers labels, breadcrumb counts, Runs vs Background control, edge-drag inspector lag, ~15 studio-drawn glyphs (Q39 half). Asks to owner: ASK 1 + famousFlythrough pacing + polish round?
