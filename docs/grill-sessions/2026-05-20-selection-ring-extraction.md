# Grill Session: Selection Ring Extraction — 2026-05-20

Source: live conversation with user during the post-perf-PR pause. Feature request: "we now have all the logic for rendering the selection circle in this shader. It is only ever used for one selected point. That doesn't make a lot of sense, right? Wouldn't it be a lot better idea to extract this to a separate renderer?"

Goal: extract the per-galaxy selection ring rendering out of `colorFragment.wesl` into its own dedicated renderer, eliminating the `selected` varying and the `if (in.selected == 1u)` branch from the main points pipeline. Keep all behaviour and visual look intact at the user-visible level. Design the new renderer so that POI selection can be folded into the same path in a follow-up PR.

---

## Q1: Scope — what does the new renderer own?

**The question:** Does the selection renderer own the entire visual treatment of a selected galaxy (inner disk + annulus), or just the annulus ring?

**Considerations:**
- **Option A — Just the annulus:** Main points pass renders the selected galaxy's inner disk the same way it renders every other galaxy (no special branch). A new `selectionRingPass` draws only the annulus ring on top. Two draws composite into one visible "point + halo" pair via blending.
  - **Pros:** Smallest change to main shader — delete the `selected` varying and the `if (in.selected == 1u)` branch and the `sizeScale` math, that's it. Ring renderer has one responsibility (draw an annulus). No duplication of normal-point rendering math. Easy to verify (turn off ring pass → galaxies render exactly as today, just no ring).
  - **Cons:** The selected galaxy's inner disk renders at its NORMAL apparent size, not the 8×-scaled-then-inverse-scaled version we have today — but that's arguably better behaviour (the visible disk reflects what the galaxy actually is).
- **Option B — Full takeover:** Main points pass skips the selected galaxy entirely; new pass draws both the inner disk AND the annulus.
  - **Pros:** Selection rendering fully owned by one place; could give selected galaxies custom treatment (different colour, animation) without main-pass changes.
  - **Cons:** Ring shader has to duplicate normal-point rendering (Gaussian falloff, colour, intensity, depth fade, procedural-disk crossfade). Two seams now (main pass needs to know "skip galaxy X"; ring pass needs to know "draw galaxy X normally + ring"). More code, more places for visual drift.

**Decision:** **Option A.** The motivation for extraction is "main shader shouldn't carry selection logic". A achieves that with minimum new code; B reintroduces complexity (in a different file) just to move inner-disk rendering — no clear benefit. The slight visual change (inner disk no longer scaled-then-renormalized) is arguably an improvement.

---

## Q2: Pass type — HDR additive or UI overlay?

**The question:** Does the new pass go into `HDR_PASSES` (additive blend with the rest of the scene, gets tone-mapped) or into `UI_PASSES` (premultiplied OVER, post-tone-map, drawn on swap-chain)?

**Considerations:**
- **Option A — HDR pass:** Same blend / target as today. Tone-map flows over it. Visual character preserved (the `intensity × 2.5 + 0.7` HDR boost pushing through the tone-map curve produces the current near-white-with-galaxy-hint look). One extra `beginRenderPass` boundary in the HDR sub-passes.
- **Option B — UI pass:** Drawn after tone-map onto the swap-chain in `UI_PASSES`, alongside marker-lines and labels. Premultiplied OVER blend, LDR-only colours. No HDR interactions, no tone-map dependency. Cleaner architectural separation — selection is UI, lives with the UI overlays. But cannot replicate the HDR-additive look byte-for-byte; the ring becomes a flat LDR sprite.

**Decision:** **Option B (UI pass).** Architectural cleanliness wins. The user accepted that this means the look will be "approximately the same, not byte-for-byte" — a sensible trade given that the underlying user-visible effect (post-tone-map) is "basically white" anyway (see Q5).

---

## Q3: Data flow — how does the renderer know what's selected?

**The question:** When the user selects a galaxy, how does the ring renderer learn the world position (and any sizing inputs) it needs to render?

**Considerations:**
- **Option A — CPU pushes a uniform each frame:** Engine reads `state.selected`, resolves to galaxy data via `state.sources.catalogs[source]`, packs into a `SelectionRingUniforms` buffer, writes once per frame. Renderer binds and draws one instance.
- **Option B — GPU reads from main vertex buffer via storage binding:** Vertex buffer for the selected galaxy's source is exposed as a storage buffer; vertex shader reads `positions[selectedLocalIdx]` directly. Requires per-source bind-group rebinding when selection changes survey.
- **Option C — Use `firstInstance` offset on main vertex buffer:** `pass.draw(6, 1, 0, selectedLocalIdx)` against the points vertex buffer; input assembler fetches the right instance attributes. Reuses points pipeline buffer layout.

**Decision:** **Option A (CPU uniform).** For one galaxy per frame, ~16-32 bytes of uniform write is trivial. **B** triggers the per-source `writeBuffer` race that CLAUDE.md explicitly warns about. **C** is "clever" but couples the ring renderer to the points vertex buffer layout — when we change point vertex stride (just happened twice this session), the ring renderer breaks. A is loosely coupled, easy to test, easy to evolve, easy to delete. Also the "nothing selected" case becomes free: pass `enabled()` returns false → no draw call → zero GPU cost.

---

## Q4: Visual fidelity — preserve exactly or approximate?

**The question:** Given Q2's decision to move to a UI pass, how faithfully should the new ring reproduce the current HDR-additive look?

**Considerations:**
- **Option A — Preserve adaptive sizing + stroke, swap colour to flat LDR:** Ring still scales 8× with apparent galaxy size, stroke still capped at ~4 px, smoothstep edges unchanged. Colour becomes a single LDR value (no HDR boost).
- **Option B — Fixed pixel size + fixed colour:** Always 40 px radius regardless of zoom or galaxy. Becomes a "selection cursor" — UI affordance only, no spatial connection to galaxy size. Simpler renderer; doesn't need diameter.

**Decision:** **Option A.** The user said "should look exactly the same as it does now" — that already rules out B's fixed-pixel approach. We can't get byte-for-byte fidelity in a UI pass (Q2 trade-off), but adaptive sizing + matching stroke + smoothstep edges + LDR-approximated colour preserves the perceived behaviour. Familiar zoom interaction stays.

---

## Q5: Colour — what flat LDR value?

**The question:** With the HDR boost gone, what literal LDR colour should the ring be?

**Considerations:**
- **Option A — Pure white** (`vec4(1.0, 1.0, 1.0, alpha)`): Simplest. Uniform shrinks (no tint needed). Consistent UI affordance regardless of which galaxy is selected.
- **Option B — Galaxy-tinted, LDR-clamped:** Pass `tint: vec3` in the uniform, output `tint * 0.9`. Preserves per-galaxy colour hint. Dimmer than today's HDR-boosted look but the *hue* relationship matches.
- **Option C — "Bright tint":** `tint * 0.95 + vec3(0.6)` clamped. Tries to perceptually match the post-tone-map HDR look more closely. More tuning parameters; more fragility to brightness slider / tone-map curve.

**Decision:** **Option A (pure white).** The user observation closed this: "it is basically white now". Empirically, the post-tone-map output of `tint × (intensity × 2.5 + 0.7)` for any meaningful selected galaxy lands in the near-white region. Pure white is the simplest faithful approximation. Uniform stays minimal (no tint needed).

---

## Q6: Z-order within `UI_PASSES`

**The question:** Where does the new pass sit in the `UI_PASSES` array (currently `[markerLinesPass, labelsPass]`)?

**Considerations:**
- **Option A — First:** `[selectionRingPass, markerLinesPass, labelsPass]`. Lines and labels draw on top of the ring. A galaxy label inside the ring band remains readable.
- **Option B — Middle:** `[markerLinesPass, selectionRingPass, labelsPass]`. Ring on top of marker lines; labels still on top of ring.
- **Option C — Last:** `[markerLinesPass, labelsPass, selectionRingPass]`. Ring on top of everything including labels.

**Decision:** **Option A (first).** Standard UI layering convention: text on top of decorations. Selection rings are decorations; labels carry information that needs to stay legible. When they overlap, the label should win.

---

## Q7: POI compatibility — keep the uniform type-agnostic

**The question:** POI selection currently lives in `clusterMarkersPass` (per `ClusterMarkerDescriptor` docblock: "ringAlpha bumped for the focused POI"). The user wants the new renderer designed so POI selection can be folded into the same path later. Does the Q3-revised uniform shape work for both?

**Considerations:**
- **Galaxy-specific uniform (`worldPos + diameterKpc`, GPU computes pixel radius):** Bakes in galaxy sizing math (`max(pointSizePx, apparentPxRadius) * 8`) at the shader. POIs would need their own shader or extra uniform fields — fold-in becomes a refactor, not a mechanical addition.
- **Type-agnostic uniform (`worldPos + ringRadiusPx`, CPU computes pixel radius):** Renderer doesn't know whether the source is a galaxy or a POI. Source-specific sizing rules stay on the CPU where they naturally live. POI fold-in is just adding `else if (selectedPoi) { ringRadiusPx = poi.markerRadiusPx; ... }` to the pass's `draw()` method.

**Decision:** **Type-agnostic uniform.** Revises the Q3 default. The new uniform is:

```wgsl
struct SelectionRingUniforms {
  worldPos: vec3<f32>,   // 12 — for VP projection in vertex shader
  ringRadiusPx: f32,     //  4 — pre-computed by CPU
}
// 16 bytes
```

CPU computes `ringRadiusPx` per source type. For v1 galaxy: the existing formula `max(pointSizePx, apparentPxRadius) * 8`. For follow-up POI fold-in: `poi.markerRadiusPx` or equivalent POI-defined visual radius. No renderer changes needed for fold-in; just an extra branch in `selectionRingPass.draw()`.

---

## Recorded defaults (not grilled — included for completeness)

- **Sizing math** — preserve today's adaptive logic exactly: `HALO_RADIUS_PX = max(pointSizePx, apparentPxRadius) * 8`, `TARGET_STROKE_PX = 4`, `bandFraction = min(0.15, TARGET_STROKE_PX / max(HALO_RADIUS_PX, 1.0))`, same smoothstep edge fading. All computed CPU-side except the band-fraction math, which stays in the fragment.
- **Timing slot** — share the existing `ui-overlay` slot (UI_PASSES already share one slot per the `passes/index.ts` docblock). No new timing slot needed.
- **Picking** — ring is purely decorative. Clicking inside the ring area still hits the underlying r32uint pick texture, which doesn't know about the ring. No new picking logic.
- **Pass `enabled()`** — returns `false` when `state.selected === null`. Skips the draw call entirely.
- **Animation** — none in v1. Static ring matching today's behaviour.

---

## Final design summary

**Architecture:**
- New `selectionRingPass` added at the head of `UI_PASSES` (`[selectionRingPass, markerLinesPass, labelsPass]`).
- New `selectionRingRenderer` service following the lightweight-renderer pattern (one pipeline, one uniform buffer, one bind group; per-frame `writeBuffer` + `pass.draw(6, 1)`).
- New shaders: `selectionRing/{io.wesl, vertex.wesl, fragment.wesl}`.

**Uniform (16 bytes):**
```wgsl
struct SelectionRingUniforms {
  worldPos: vec3<f32>,
  ringRadiusPx: f32,
}
```

**Vertex shader:**
- Projects `worldPos` to clip via shared `CameraUniforms`.
- Expands 4 corners by `ringRadiusPx` in clip space (same px → clip conversion as billboard shaders).

**Fragment shader:**
- Computes `r²` from rotated quad UV.
- Annulus test: outer disc at `r²=1`, inner radius `1 - bandFraction` where `bandFraction = min(0.15, 4.0 / max(ringRadiusPx, 1.0))`.
- Soft edges via smoothstep with `edgeFade = bandFraction * 0.1`.
- Output `vec4(1.0, 1.0, 1.0, 1.0) * alpha` premultiplied. Pure white.

**Main points pipeline simplifications (in scope of this PR):**
- `io.wesl`: drop `@location(4) @interpolate(flat) selected: u32` from `VSOut`.
- `vertex.wesl`: drop `isSelected` calculation, `sizeScale` select, `out.selected` write (both early-out and main path).
- `colorFragment.wesl`: drop the entire `if (in.selected == 1u) { ... }` selection-ring branch.
- The `realOnlyMode` discard and procedural-disk crossfade logic that previously sat inside / around the selection branch stays — they're independent.

**POI fold-in (deferred follow-up PR):**
- Add `else if (state.selectedPoi)` branch to `selectionRingPass.draw()`.
- CPU computes `ringRadiusPx` from POI's visual semantics (probably `poi.markerRadiusPx` or per-type rule).
- Remove the "ringAlpha bump for focused POI" logic from `clusterMarkersPass` (and the related field on `ClusterMarkerDescriptor`).
- Zero shader changes, zero renderer changes — purely engine-side wiring.

**Trade-offs accepted:**
- Visual look will be "approximately the same" in LDR, not byte-for-byte identical to today's HDR-additive output. Closest case: pure white.
- The selected galaxy's inner disk renders at its NORMAL apparent size (not the 8×-scaled-then-inverse-scaled version from today). Arguably an improvement.

**Estimated effort:** ~1.5 days TDD-driven. Risk: medium. The selection seam has historically been the worst regression class in skymap; isolating it cleanly is hygienic independent of perf.
