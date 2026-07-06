# Renderer Unification — plan index

> **For agentic workers:** this is the index, not a plan — execute the numbered
> plan files below, in order, via superpowers:subagent-driven-development.

**Spec:** [`../specs/2026-06-29-renderer-unification-design.md`](../specs/2026-06-29-renderer-unification-design.md)
(open questions resolved; phase-1 scope corrected by plan-time shader
verification — see the spec's "Resolved during iteration" section).

Three phases, one plan file each. Every phase is an independently mergeable,
behaviour-neutral PR; each consumes the previous phase's contracts and never
rebuilds them.

| Plan                                                                                    | Phase                                                                                     | Depends on |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| [`01-compositor`](2026-07-06-renderer-unification-01-compositor.md)                     | `Compositor` primitive + the `postProcess` tonemap repoint                                | —          |
| [`02-registry-and-program`](2026-07-06-renderer-unification-02-registry-and-program.md) | Slab table, `ContentLayer` registry, `FrameStep` program, strategy executor, target table | 01         |
| [`03-pick`](2026-07-06-renderer-unification-03-pick.md)                                 | Pick camera as a value, `drawPick` aspect, per-slab pick program, `frontmostPick`         | 01 + 02    |

**Cross-plan seams** (locked contracts — later plans import, never re-declare):

- Plan 01 produces `state.gpu.compositor` with
  `draw(pass, src, blend, tone)` and the `@types/rendering/{Compositor,ToneMap,CompositeBlend}` types.
- Plan 02 produces the `@types/engine/frame/*` types (`Slab`, `SlabView`,
  `ContentLayer`, `FrameStep`, …), `slabs.ts` (`NEAR0`/`COSMO`, `deriveSlabs`,
  `slabViewOf`), `CONTENT_LAYERS`, `frameProgram(tone)`, `executeFrame`, and
  `renderTargets`.
- Plan 03 consumes all of the above; it adds `drawPick` rows, `pickProgram.ts`,
  and `utils/picking/frontmostPick.ts`.

**Merge-order with PR #386 (zoom-to-earth):** either order works. If plan 01
lands first (preferred — less total code), #386 rebases and its
`foregroundComposite` dissolves into one `compositor.draw(..., 'over', TONE)`
call. The #386-dependent content rows (foreground bodies, captions) and FRAME
steps are explicitly excluded from plan 02 and land as data edits when #386
merges.
