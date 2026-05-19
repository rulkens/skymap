# Grill Session: Label Text Effects (Outline + Glow) — 2026-05-19

Source: live conversation with user. Feature request: "I would like both the option of having a border around the text, and a smooth glow behind the text (colour should be set separately). for all labels."

Goal: add a per-label outline (hard border) and glow (soft halo) effect to the MSDF label renderer, with colours and widths individually controllable. Tune values via DebugPanel; bake into producer-side defaults once visually satisfied.

---

## Q1: Scope — per-label vs global vs hybrid

**The question:** Are outline + glow styling values carried per-label (each producer sets its own colours/widths) or applied uniformly via a single global setting?

**Considerations:**
- **Option A — Global:** one outline style + one glow style applied to every label uniformly. Simplest; cheap (per-frame uniform, no buffer growth). But forecloses the "you are here marker has a white halo, POI labels have a red halo" use case.
- **Option B — Per-label:** each `Label` carries `outlineColor`, `outlineWidth`, `glowColor`, `glowRadius`. ~32 extra bytes in the per-label storage record. Maximally flexible; matches the engine-rewrite convention of producers carrying their own styling instead of relying on global modes.
- **Option C — Global toggle, per-label colour:** hybrid — widths/radii global in uniforms, colours per-label. Cheaper than B but less flexible.

**Decision:** **Option B (per-label).** Skymap already has multiple label producers with distinct visual identities (youAreHere, POI ring categories, eventual famous-galaxy tags). 32 extra bytes × 64-label budget = 2 KB, negligible. Keeps the door open for a label to fade its glow independently of its fill if needed later.

---

## Q2: Glow softness / extent

**The question:** How wide and how soft is the glow supposed to be? This dictates the rendering technique because MSDF atlases only encode a few px of signed distance before clamping.

**Considerations:**
- **Option A — Tight halo (≤4 px):** stays inside the SDF's native range. A wider `smoothstep` band in the existing fragment shader is enough. Zero new texture work.
- **Option B — Medium halo (5–12 px):** still single-pass, but the atlas must be rebaked with a larger `distanceRange`. One-time `npm run build-font-atlas` regen + bump a constant in `fonts.ts`. No offscreen targets.
- **Option C — Bloom-style soft glow (15–40+ px):** requires an offscreen render target + separable Gaussian blur. Two-pass; meaningful new infrastructure.
- **Option D — Cheap fake glow (multi-tap MSDF sample):** 4–8 offset samples to fake a small blur. Banding above ~8 px.

**Decision:** **Option B (medium halo, ≤ ~12 px, rebake atlas).** Hits "smooth glow behind the text" visually (softness, not a fat outline) without offscreen-blur infrastructure. Skymap labels on a black-ish sky read strongly even with modest glow extent. If bloom-level softness becomes a request later, Option C is its own dedicated post-process pass — Option B work isn't wasted.

---

## Q3: Units for outline width and glow radius

**The question:** Outline width and glow radius — screen pixels, em-fraction (relative to label size), or hybrid? Matters because label sizing already clamps em height to `[minPx, maxPx]`.

**Considerations:**
- **Option A — Screen pixels (absolute):** `outlineWidthPx: 2`, `glowRadiusPx: 8`. Predictable at one zoom; awful across the clamp range (a 2-px outline on an 8-px-tall label is 25% of glyph height).
- **Option B — Fraction of em (relative):** `outlineEmFrac: 0.08`, `glowEmFrac: 0.25`. Self-balancing across the clamp range. SDF-community standard for distance-field outlines.
- **Option C — Hybrid (em-fraction with px floor/ceiling):** scales with em but never below 1 px. More parameters per label.

**Decision:** **Option B (em-fraction).** Matches the rest of the label sizing (`worldEmMpc` projected → clamped → glyphs scaled). Outline + glow naturally inherit the perspective sizing. Hybrid's px floor solves a non-problem — labels at minPx are far away and not being read.

---

## Q4: Outline placement relative to glyph contour

**The question:** Inside stroke (eats into glyph), outside stroke (adds mass around glyph), or centered (straddles d=0)?

**Considerations:**
- **Option A — Outside stroke** (`d ∈ [−w, 0]`): outline grows outward, body stays its natural size. UI/CSS-text-stroke convention.
- **Option B — Inside stroke** (`d ∈ [0, +w]`): outline eats into glyph; letterforms get spindly with thick outlines. Niche poster-art use.
- **Option C — Centered stroke** (`d ∈ [−w/2, +w/2]`): mathematically clean but practical worst-of-both — thin glyphs lose interior, and total expansion is only half of width.

**Decision:** **Option A (outside stroke).** Universal UI convention. Stacks cleanly with the glow regardless of how Q8 resolves (the bands are still in the outer half-plane).

---

## Q5: Defaults — opt-in optional, always-on baseline, or required

**The question:** When a producer doesn't specify outline/glow values, what happens?

**Considerations:**
- **Option A — Opt-in optional fields (default: off):** new fields are optional on `Label`. If omitted, the band collapses; shader cost effectively zero. Existing labels keep current visuals.
- **Option B — Always-on with global default:** every label gets a baseline outline. Visual consistency without each producer re-stating. Risk: existing visuals change overnight; visual review needed across every label site.
- **Option C — Required fields (mirror `Label.font` convention):** every producer must specify all four. Maximally rigorous; hostile to call sites that genuinely want no effect.

**Decision:** **Option A (opt-in optional, default off).** Three reasons: (1) four-knob surface is much wider than `font`'s one knob — required would be hostile; (2) current label visuals are fine, so a global-default change is a regression vector; (3) optional `?? 0` defaults compile to a single shader branch — zero cost when unused.

---

## Q6: Glow composition mode

**The question:** Glow band — OVER blend (solid soft plate replacing background) or ADDITIVE blend (light-source brightening background)?

**Considerations:**
- **Option A — OVER glow:** glow pixels fully replace background within their alpha. Soft "tag" feel. Reads as a readability plate; Google-Maps POI convention.
- **Option B — Additive glow:** glow adds to background. Magical/emissive on dark sky; vanishes against bright content (Milky Way, dense clusters).
- **Option C — Hybrid (OVER outline, additive glow):** mixes the modes. Predictable outline + emissive halo, but glow colour gets murky because it depends on background.

**Decision:** **Option A (OVER glow).** Skymap labels sit on busy, locally-bright backgrounds; additive would vanish exactly where labels need to stand out. WYSIWYG colour picking: the colour you set is the colour you see (alpha-modulated). Option C is clever but defer until someone asks.

---

## Q7: Colour API — straight RGBA or premultiplied

**The question:** New outline/glow colour fields take straight RGBA (renderer premultiplies) or premultiplied (matching existing `Label.color` convention)?

**Considerations:**
- **Option A — Straight RGBA, renderer premultiplies:** ergonomic for fractional alpha (a 60%-opacity glow is `[r, g, b, 0.6]`). Asymmetry with the existing `Label.color` field.
- **Option B — Premultiplied (matching existing field):** consistent. But the existing convention is a low-grade footgun — `[1, 0, 0, 0.5]` must be written as `[0.5, 0, 0, 0.5]`.
- **Option C — Straight RGBA + migrate existing `Label.color` in the same change:** rip the band-aid. Single consistent API going forward.

**Decision:** **Option C (straight RGBA everywhere, migrate `Label.color` in same change).** Two producer sites today (`youAreHereSubsystem`, `poiSubsystem`) — cheapest the migration will ever be. The conversion lives in one place (`setLabels`'s pack loop) instead of being duplicated across producers. Shader still composites premultiplied internally; only the API surface changes.

---

## Q8: Band layout — stack vs overlap

**The question:** When both outline + glow are present, do the bands stack (glow lives entirely past outline) or overlap (glow extends from glyph edge, outline overlays inner portion)?

**Considerations:**
- **Option A — Stacked:** glow band = `d ∈ [−(outline + glow), −outline]`. Total halo = `outline + glow`. Each effect owns its band cleanly, but "glow radius = 8 px" with a 2-px outline produces only 6 visible px of soft halo — toggling outline shrinks the glow visually.
- **Option B — Overlap:** glow extends from `d = 0` outward by `glowRadius` regardless of outline. Outline sits on top in inner portion. Total halo = `max(outline, glow)`. "Glow radius" means visible halo extent; toggling outline doesn't change overall silhouette.

**Decision:** **Option B (overlap).** "Glow radius" matches mental model — visible halo extent, full stop. Toggling outline keeps the overall silhouette stable. Fragment composition: `out = over(glow, over(outline, fill))` — easy fragment math. (Option C from initial framing dropped — it was mathematically identical to A.)

---

## Q9: SettingsPanel exposure

**The question:** Does the user-facing SettingsPanel get any controls for outline/glow (toggle, colour pickers, etc.)?

**Considerations:**
- **Option A — No SettingsPanel exposure:** producers decide; user can't toggle. Cleanest; avoids feature creep on an already-busy panel.
- **Option B — Global on/off toggle only:** one checkbox gates the whole feature in the renderer. When OFF, outline/glow forced to zero regardless of producer values.
- **Option C — Full controls (toggle + colour pickers + width sliders):** entire styling surface as global overrides. Lots of UI; conflicts with per-label colours.
- **Option D — Toggle now, controls later if asked:** ship just on/off in v1; defer the rest.

**Decision: Superseded by Q10** — the user redirected away from SettingsPanel exposure entirely toward DebugPanel-only controls.

---

## Q10: DebugPanel control model

**The question:** The DebugPanel will host live-tuning controls — how do those relate to the per-label values producers carry?

**Considerations:**
- **Option A — Global override (DebugPanel wins when set):** sliders set a process-wide override. While "on", every label ignores producer values and uses DebugPanel ones. Tune, commit values into producer constants, turn off.
- **Option B — Producer-defaults seeded by DebugPanel:** sliders bound directly to producer-default objects (`POI_STYLES.giant.outlineColor` etc.) via React state. Each producer independently tunable. More UI to maintain.
- **Option C — Single global style + DebugPanel binds to it:** all producers share one `LABEL_STYLE`. Simplest, but contradicts Q1 (no more per-label colour decision).

**Decision (user-modified):** **Option A with a category selector.** DebugPanel exposes (1) a dropdown selecting the target producer — `youAreHere`, `cluster`, `supercluster`, `famousGalaxy`, `void` (the four `POI_STYLES` keys plus the standalone `youAreHere` producer); (2) outline + glow controls for the currently selected target. When the override is active, ONLY labels of the selected target category use the overridden values; other categories continue at their producer defaults. Workflow: select category → tune by eye → commit chosen values into producer source constants → move to next category. Preserves Q1's per-label flexibility while keeping the DebugPanel UI small (one set of four controls + a dropdown).

---

## Recorded defaults (not grilled — included for completeness)

- **`fadeAlpha` applies uniformly** to fill + outline + glow. The whole label fades together; cannot fade body independently from glow.
- **Atlas `distanceRange` rebake target: 16 px** (headroom past the 12-px max glow extent so the SDF doesn't clamp at the falloff tail).
- **Glow falloff: linear `smoothstep`** (default cubic Hermite — already "smooth" by definition; no need for exponential or squared variants in v1).

---

## Final design summary

**Label type additions (all optional, default off):**
- `outlineColor?: Vec4` — straight RGBA, default `[0, 0, 0, 0]`
- `outlineEmFrac?: number` — em-fraction width, default `0`
- `glowColor?: Vec4` — straight RGBA, default `[0, 0, 0, 0]`
- `glowEmFrac?: number` — em-fraction radius, default `0`
- `Label.color` migrated from premultiplied to straight RGBA (same change).

**Rendering model:** outside stroke, OVER blend, overlapping bands (glow extends from glyph edge, outline overlays inner portion). All effects fade uniformly with `fadeAlpha`. Single-pass fragment shader composites glow → outline → fill in premultiplied order.

**Atlas:** rebake with `distanceRange = 16` to support the up-to-12-px glow extent.

**DebugPanel:** new section with a category dropdown (`youAreHere | cluster | supercluster | famousGalaxy | void`) and four controls (outline colour, outline em-fraction, glow colour, glow em-fraction) that override the selected category's values process-wide while the override is on. Workflow: tune → commit → next category.

**Buffer layout:** per-label storage record grows from 48 → 96 bytes (two additional vec4s for outline + glow colour, plus widths packed into the freed legacy `pixelSize` slot and a new vec4 slot — exact pack TBD at implementation time). 64-label budget × 96 bytes = 6 KB, well under any limit.

**Migration cost:** two producer sites (`youAreHereSubsystem`, `poiSubsystem`) for the `Label.color` straight-RGBA migration. No producer changes required for outline/glow (opt-in optional).
