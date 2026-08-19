# MCPM workbench — production-readiness review (2026-08-19)

Four parallel entanglement-radar passes (lens: `docs/superpowers/conventions/simplicity.md`)
over the workbench, run against the spec's intent
(`docs/superpowers/specs/2026-08-18-mcpm-workbench-design.md`). Full per-area
reports with file:line evidence sit beside this file:
[state+UI](radar-state-ui.md) · [sim+field](radar-sim-field.md) ·
[render+Viewport](radar-render-viewport.md) · [main-app alignment](radar-alignment.md).

**Headline:** the architecture is sounder than "dev tool" implies — presets
versioned/validated, sim core store-free and extractable, NaN hygiene clean,
UI reuses main-app components. The production blocker is trust, not
structure: Phase 3 validation misses its acceptance band by 79×–7300× with
the 9.28× mass-ratio discrepancy open, so exports aren't yet worth promoting.

## Tier 1 — trust and intent

| # | Item | Effort | Status |
|---|------|--------|--------|
| 1 | Close the validation gap (root-cause the 9.28× mass ratio vs the reference fork) | L | Open — this IS the standing Phase 4 go/no-go |
| 2 | Durable promotion path: today only `--quick-look`, which self-clobbers on the next `build-mcpm`; needs a tracked "production source" pointer so a workbench preset can be adopted by the production volume build | M | Open |

## Tier 2 — robustness

| # | Item | Effort | Status |
|---|------|--------|--------|
| 3 | Surface `planGridBudget`'s refusal (buffer/bytes/max-long-axis) via the existing `statusMessage` plumbing instead of a bare error badge | S | Open — partially mitigated by the V2 allocation floor (refusals near-unreachable from the grid side; agent-count overruns remain) |
| 4 | Runtime device-loss handling (only the probe subscribes today; a mid-run loss silently stalls a multi-hour run) | S/M | Open |

## Tier 3 — braids (simplicity violations with named costs) — IN EXECUTION

Being implemented as the R-series on PR #570 (ledger:
`.superpowers/sdd/2026-08-18-grid-box-gizmo/progress.md`).

| # | Item | Effort |
|---|------|--------|
| 5 | TS↔WESL parity tests for the six byte-layout/bind-slot pairs (McpmUniforms, BoxUniform, GlyphSegment, camera, histogram flags, dispatch slots) — `selectionEncoding.ts` is the in-repo exemplar | S/M |
| 6 | One canonical grid-shape field list feeding `buildKey`/`gridShapeKeyFor` (the F2.5 rotation omission already demonstrated the failure mode) | S |
| 7 | Consolidate the "in-grid density sample → mean log trace" logic held in sync by convention across `histogram.wesl`, `dataPointHistogram.ts`, `histogramSlice.ts` | M |
| 8 | Viewport.tsx god object: extract pointer/gizmo input (the biggest job with the cleanest boundary); plus its satellite knots — 4 copy-pasted token-diff blocks in the store subscriber, `axesFor()` duplicated verbatim, T18 preview pass bypassing RenderGraph's ownership contract | M/L |
| 9 | Orbit-camera drag input hand-rolled ×3 across galaxy-renderer / flow-workbench / mcpm-workbench → one shared module | S/M |
| 10 | `Record<keyof McpmParams,…>` exhaustiveness for the twice-spelled param key lists; inject the GPU device into `createMcpmHarness` instead of it calling `initGpu` itself (spec §2's future in-engine layer needs injection) | S + M |

## Explicit non-findings

OVERLAY_BLEND exception (essential, documented) · `importedBox` alongside
manual fields (essential — round-trip fidelity) · per-frame `JSON.stringify`
(unmeasured; measure before touching) · preset save/load (clean) · sim-core
extractability (clean) · UI component reuse (clean).
