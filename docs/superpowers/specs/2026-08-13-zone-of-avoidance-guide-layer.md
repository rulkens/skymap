# Zone-of-avoidance guide layer — design spec

Decisions: [`docs/grill-sessions/zone-of-avoidance-guide-layer-2026-08-12.md`](../../grill-sessions/zone-of-avoidance-guide-layer-2026-08-12.md) (Q1–Q10). This spec does not re-litigate those calls — it specifies how they land in code. Cited below as "grill Qn".

## Motivation

Every galaxy catalog in skymap (SDSS, 2MRS, GLADE) has a wedge-shaped hole along the galactic plane, where the Milky Way's own dust hides everything behind it from every ground- and space-based survey. Without an explanation, a first-time viewer reads that hole as missing data or a rendering bug rather than the real astrophysics it is. The zone-of-avoidance (ZoA) guide layer is a didactic overlay that plugs that gap with an honest annotation: a translucent band along the galactic plane, lettered "ZONE OF AVOIDANCE," that explains itself on click.

## The decided design

- **Shape**: a radially-extruded wedge from the Sun outward, not a sky-backdrop or a bare contour — the only version that reads correctly from outside the Local Group (grill Q1).
- **No data pipeline**: an analytic band, not a Planck/SFD extinction bake — this is a guide annotation, not a fidelity product (grill Q2). The Planck GNILC link stays parked in the grill doc if fidelity ambitions return.
- **Look**: a soft translucent warm veil (haze, not cartography) with a subtle edge so the extent reads from outside and the lettering has something to anchor to (grill Q3).
- **Radial extent**: static, full catalog depth — inner edge a few Mpc out (clear of the Milky Way's own rendering), outer edge near the GLADE/SDSS shell (~350–400 Mpc), opacity easing at both rims (grill Q4).
- **Longitude-varying width**: `b_limit(ℓ)`, widest (~±15°) at the galactic bulge, narrowest (~±5°) at the anticenter — an analytic cosine-ish bump, zero data dependencies (grill Q8).
- **Text**: "ZONE OF AVOIDANCE" on-surface, curved along the band's great circle, repeated 2–3× so it's discoverable from any longitude; the band is pickable and opens an InfoCard carrying the actual explanation (dust extinction, why surveys are blind there) (grill Q5).
- **Visibility**: invisible near Earth / inside the Milky Way, fades in past the Local Group (~5–10 Mpc), full at survey scale — one smoothstep on camera radius; fully faded ⇒ not rendered, not pickable (grill Q6, the opacity-0 house rule).
- **Blending**: additive only, never alpha-over — the layer must never dim a real galaxy behind it, and additive needs no sort against the point cloud (grill Q9).
- **Settings**: `settings.zoneOfAvoidance.{enabled, labelEnabled}`, band and lettering toggle independently, default ON, grouped with the other Labels & Guides overlay rows (grill Q7).

## Ground preparation

**Verdict: none needed.** Every seam this feature needs already exists — settings clusters, the SOURCE_REGISTRY type-arm dispatch, the pick→SelectionRef→InfoCard chain, the CONTENT_LAYERS frame registry, the fade/wake wiring, and the MSDF label pipeline all take a tenth entry the same way they took `milkyWay`'s ninth. `milkyWay` is the template at every touchpoint below: same `{enabled, labelEnabled}` settings shape, same singleton-tag `SelectionRef`, same static-info-const `FocusableTarget` arm, same additive analytic-primitive `ContentLayer`. The one genuinely new mechanism is curved on-surface text — and even that reuses `layoutLabel`'s pure pen-space glyph layout, forking only the vertex stage that currently fuses billboarding onto it.

Data-delta sketch (contract shapes only — no implementation):

```ts
// src/@types/settings/ZoneOfAvoidanceSettings.d.ts — mirrors MilkyWaySettings.d.ts
export type ZoneOfAvoidanceSettings = {
  enabled: boolean; // the band
  labelEnabled: boolean; // the lettering
} & ZoneOfAvoidanceTuning;

// src/@types/settings/ZoneOfAvoidanceTuning.d.ts — mirrors MilkyWayTuning; grill Q10.
// Live-tunable via a DebugPanel section; values are feel calls converged during the visual pass.
export type ZoneOfAvoidanceTuning = {
  intensity: number; // additive brightness at full presence
  radialFalloff: number; // rim easing along the extrusion
  edgeSharpness: number; // latitude feather width
  color: readonly [number, number, number]; // veil tint (linear RGB)
};

// src/@types/data/zoneOfAvoidance/ZoneOfAvoidanceSourceEntry.d.ts — 10th SourceEntry arm
export type ZoneOfAvoidanceSourceEntry = SourceEntryBase & {
  readonly type: 'zoneOfAvoidance';
  readonly code: number;
};

// src/@types/engine/ZoneOfAvoidanceInfo.d.ts — 6th FocusableTarget arm, static const like MILKY_WAY_INFO
export type ZoneOfAvoidanceInfo = {
  readonly type: 'zoneOfAvoidance';
  readonly displayName: string;
  readonly description: string; // didactic copy: dust extinction, why surveys are blind here
  readonly distanceNote: string;
  // x/y/z: MilkyWayInfo's shape needs a point for the Focus button; the ZoA band has no
  // natural "there." OPEN — see feel-calls below.
};
```

Every table this touches (`RESOLVE_PICK`, `SelectionRef`, `EXTRACT_ROW`, `BUILD_FOCUSABLE`, `REF_OF`, `TARGET_IDENTITY_KEY`, `URL_HASH_FOR`, `DETAIL_CARD`) is either a `Partial<Record<...>>` the new arm can opt into, or a total mapped type that compile-fails until the row exists — so there is no way to land the type without also landing its dispatch rows. That compile pressure is the reason no separate "wire it up" task is needed in the plan; the type addition and the table rows are one commit by construction.

## Architecture — how it lands

### Settings

`milkyWay` is the exact template — flat `{enabled, labelEnabled}` plus a tuning bag, no `items` record (a singleton overlay per `docs/superpowers/conventions/singleton-overlay-layers.md`):

- Type: new `ZoneOfAvoidanceSettings` (mirrors `src/@types/settings/MilkyWaySettings.d.ts`), added as a new cluster on `EngineSettingsState` (`src/@types/settings/EngineSettingsState.d.ts` — the `milkyWay` cluster is documented at lines 171–177, immediately after `thumbnails`).
- Defaults: two `DEFAULT_ZONE_OF_AVOIDANCE_*` constants in `src/data/defaults.ts`, next to `DEFAULT_MILKY_WAY_ENABLED` / `DEFAULT_MILKY_WAY_LABEL_ENABLED` (lines 201–231) — `enabled` literal `true` (grill Q7; there is no SOURCE_REGISTRY-derived precedent to seed from the way `DEFAULT_MILKY_WAY_ENABLED` does, since this row has no on/off precedent in the registry either — same reasoning `DEFAULT_ORBIT_TRAILS_ENABLED` uses for a plain literal).
- Initial state: `zoneOfAvoidance: { enabled: DEFAULT_ZONE_OF_AVOIDANCE_ENABLED, labelEnabled: DEFAULT_ZONE_OF_AVOIDANCE_LABEL_ENABLED, ...ZONE_OF_AVOIDANCE_TUNING_DEFAULTS }` in `src/state/settings/initialState.ts`, beside the `milkyWay` block (lines 153–157).
- Reducers: `setZoneOfAvoidanceEnabled` / `setZoneOfAvoidanceLabelEnabled` / `setZoneOfAvoidanceTuning`, mirroring `setMilkyWayEnabled` / `setMilkyWayLabelEnabled` / `setMilkyWayTuning` in `src/state/settings/settingsSlice.ts` (lines 168–181) — the split writer per axis is deliberate: a tuning patch can never flip visibility by accident (the same reason `MilkyWayTuning` is a separate type from `MilkyWaySettings`).
- Selectors: `selectZoneOfAvoidanceEnabled` / `selectZoneOfAvoidanceLabelEnabled` / `selectZoneOfAvoidance`, mirroring `src/state/settings/selectors.ts` lines 155–169.
- SettingsPanel: the band's `enabled` toggle is a hand-authored `SectionRow` in `src/components/containers/LabelsAndGuidesSectionContainer.tsx`, in the same shape as the `toggle-constellations` / `toggle-orbit-trails` rows (lines 144–155) — a flat singleton toggle with no registry-derived label category. `labelEnabled` instead folds into the registry-driven `LABEL_CATEGORIES` machinery: `src/data/labels/labelHomeBySourceType.ts` gets a `zoneOfAvoidance` row shaped exactly like the `milkyWay` row (lines 58–62, `read`/`write` reaching a flat scalar, no `items` index), which requires the new `SOURCE_REGISTRY` entry to carry `bearsLabel: true` (template: `src/data/sources/milky-way.ts`).
- DebugPanel tuning (grill Q10): the `ZoneOfAvoidanceTuning` knobs surface as a DebugPanel section, mirroring the milkyWay trio — a declarative slider-field table (template `src/data/milkyWay/milkyWaySliderFields.ts`), a presentational section (`src/components/DebugPanel/MilkyWayTuningSection.tsx`), and its store-boundary container (`src/components/containers/MilkyWayTuningSectionContainer.tsx`), mounted from `DebugPanel.tsx`. Scalar knobs are slider fields; `color` surfaces as whatever per-channel/hue control the visual pass finds workable — a feel-call detail, not a contract. Power-user tunables live in the DebugPanel, not SettingsPanel (the convention `FlowRow.tsx` documents).
- Engine reads settings live off the store (`src/services/engine/engine.ts`, the `get settings()` delegation around line 236) — no bridge, no extra wiring.
- URL-hash persistence: none. `URL_HASH_FOR` (`src/services/url/urlHashFor.ts`) is a *total* `Record<FocusableTargetType, …>`, so the new `zoneOfAvoidance` arm must still exist as a row — but it returns `null`, the same "not link-encodable" answer the Synthetic-galaxy row gives, rather than a `MILKY_WAY_FOCUS_ID`-style literal. This is a deliberate deviation from the `milkyWay` template (which *is* hash-encodable): the grill doc records no deep-link ask for this layer.
- Tour snapshot: opt-out, alongside constellations.
- Wake: automatic. `settings` is a whole `WAKE_ROUTES` member (`src/store/effects/watchWakeSaga.ts`) — any write under the `settings/` action prefix pokes the render-on-demand scheduler; no per-layer wiring needed.

### Source, pick, and InfoCard

Nine `SourceEntry` type arms exist today (`src/@types/data/SourceEntry.d.ts`); `zoneOfAvoidance` is the tenth. Every table below dispatches on that tag, and — because they're written as exhaustive mapped types or hand-typed total objects, not `switch` chains — a missing arm is a compile error, not a silent miss:

- `SourceEntry` — new `ZoneOfAvoidanceSourceEntry` (mirrors `src/@types/data/milkyWay/MilkyWaySourceEntry.d.ts`), added to the union.
- `RESOLVE_PICK` (`src/services/engine/helpers/resolvePickTable.ts`, `Partial<Record<SourceEntry['type'], …>>`) — new arm `zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' })`, the same singleton-tag shape as the `milkyWay` row (line 78).
- `SelectionRef` (`src/@types/engine/SelectionRef.d.ts`) — new `{ readonly type: 'zoneOfAvoidance' }` arm, beside `{ type: 'milkyWay' }` (line 23).
- `EXTRACT_ROW` (`src/services/engine/helpers/extractSelectionRow.ts`, a `[K in SelectionRef['type']]` mapped type) — new arm `zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' as const })`, the static-tag shape of the `milkyWay` row (line 35).
- `BUILD_FOCUSABLE` (`src/services/engine/helpers/buildFocusable.ts`, a `[K in SelectionRow['type']]` mapped type) — new arm returning the static `ZONE_OF_AVOIDANCE_INFO` const, mirroring `milkyWay: () => MILKY_WAY_INFO` (line 36).
- `REF_OF` (`src/services/engine/helpers/refOf.ts`, hand-typed total object) — new arm `zoneOfAvoidance: () => ({ type: 'zoneOfAvoidance' })` (beside line 43).
- `TARGET_IDENTITY_KEY` (`src/services/engine/helpers/targetIdentityKey.ts`, total `Record<FocusableTargetType, …>`) — new arm `zoneOfAvoidance: () => 'zoneOfAvoidance'` (beside line 16).
- `URL_HASH_FOR` — see Settings section above; a required row that returns `null`.
- `DETAIL_CARD` (`src/components/InfoCard/detailCardTable.ts`) — new `zoneOfAvoidance` row with `Detail`/`Compact` arms narrowing on `target.type`, mirroring the `milkyWay` rows (lines 100–113): new `ZoneOfAvoidanceDetailCard.tsx` + `CompactZoneOfAvoidanceCard.tsx` (own folders per `create-component` convention), which is where the didactic copy — dust extinction, why surveys are blind here — actually lives, parallel to `MilkyWayDetailCard.tsx`.

**Analytic fragment-level pick**, following `src/services/gpu/shaders/bodies/spherePick.wesl`'s pattern (a proxy mesh, per-fragment analytic ray/band intersection, `@builtin(frag_depth)` write, `discard` on miss) rather than a rasterized hit-test: `drawFlooredSpherePick.ts` and `bodyPickRenderer.ts` are the CPU-side precedent for wiring an analytic-primitive pick draw. Visibility must gate pickability at two levels, both already established:

- **Layer level**: `ContentLayer.enabled` returning `false` once the distance fade hits 0 (grill Q6 / the opacity-0 house rule) means the pick pass never runs for a faded-out band.
- **Fragment level**: even within a drawn instance, discard sub-threshold alpha fragments — template `src/services/gpu/shaders/structureMarker/ringPick.wesl` lines 86–94 (`if (in.alpha <= 0.0) { discard; }`), there guarding faded structure rings.

### Renderer

The band is additive into the existing HDR/COSMO pass — grill Q9 rules out a second offscreen or sort machinery — so this is one new `ContentLayer` row, not a `frameProgram.ts` edit:

- `CONTENT_LAYERS` (`src/services/engine/frame/passes/index.ts`) gets a new `zoneOfAvoidanceLayer` row among the COSMO-slab, `hdr`-target, additive-blend group (alongside `filamentsLayer`, `flowFieldLayer`, `horizonShellLayer`, `structureMarkersLayer`). Exemplars for the row's shape: `horizonShellLayer.ts` (a static analytic primitive gated purely by a camera-distance fade, `enabled()` returning `fadeAlpha(...) > 0` so a faded shell skips its render pass entirely) and `filamentsLayer.ts` (the settings-toggle + fade-registry-opacity `enabled()`/`draw()` split).
- Renderer factory under `src/services/gpu/renderers/zoneOfAvoidance/` (new folder), constructed in `src/services/engine/phases/initGpu.ts` alongside the other singleton-overlay renderers (`createFilamentRenderer`, `createMilkyWayCloudRenderer`), held on `EngineGpuHandles` (`src/@types/engine/handles/EngineGpuHandles.d.ts`), destroyed in `engine.ts`'s teardown the same way `filamentRenderer` is (`state.gpu.zoneOfAvoidanceRenderer?.destroy(); state.gpu.zoneOfAvoidanceRenderer = null;`, template at engine.ts lines 852–853).
- Uniforms: the 80-byte `CameraUniforms` prefix (`src/services/gpu/shaders/lib/camera.wesl` + `writeCameraPrefix` in `src/services/gpu/lib/cameraUniforms.ts`) is the standard camera block every renderer opens with. `ADDITIVE_BLEND` (`src/services/gpu/lib/blendStates.ts` line 58) is the pipeline's blend state — never alpha-over (grill Q9). Fade composes through `applyFade` (`src/services/gpu/shaders/lib/fadeUniforms.wesl` line 49) — opacity is applied to alpha, never folded into RGB (house rule). The soft edge (grill Q3) reuses `edgeBandMask` (`src/services/gpu/shaders/lib/masks.wesl` line 85), the existing soft-band-edge primitive.
- Galactic basis for `b_limit(ℓ)`: `worldToGalactic()` (`src/services/gpu/shaders/lib/util.wesl` lines 211–219, built from the `GAL_X_EQ`/`GAL_Y_EQ`/`GAL_Z_EQ` constants at lines 207–209) rotates a world-space vector into the galactic frame in one dot-product triple. This is parity-tested against `src/data/orientation/orientationFrames.ts`'s `GAL_X_EQ`/`GAL_Y_EQ`/`GAL_Z_EQ` (lines 26–28) by the `constants.parity.test` family (e.g. `tests/services/engine/galaxyGenerator/v1/milkyWayModelMatrix.test.ts` scrapes the WGSL literals and diffs them against the TS constants) — reuse `worldToGalactic`, never re-derive the rotation.
- Fades/wake: one `SCALE_FADE_BANDS` row (`src/services/engine/presentation/scaleFadeBands.ts`; the `constellations` row at line 192 is the pattern — `{ fullAt, goneAt }` in Mpc) with `fullAt` at the Local-Group scale from grill Q6 (~5–10 Mpc) and no far edge (full at survey scale). Two `fadeLayers.ts` rows (`src/services/engine/wiring/fadeLayers.ts`; the `milkyWayDisk`/`milkyWayLabel` rows at lines 98–134 are the two-axis template — `handle`/`seed`/`intent` per axis, singleton `kind`, no discriminator) for the band and the lettering. New `VisibilityLayerKey` literals (`zoneOfAvoidance`, `zoneOfAvoidanceLabel` — `src/@types/animation/VisibilityLayerKey.d.ts`) and a `FadeId` arm (`{ readonly kind: 'zoneOfAvoidance' }` — `src/@types/animation/FadeId.d.ts`, beside the `milkyWay`/`filament`/`constellations` singleton kinds). Per-frame opacity composes like `constellationLayerOpacity.ts` (distance-band × fade-registry-toggle-opacity, one function both the geometry draw and the label producer call so they dissolve in lock-step) and focus recession via `resolveLayerOpacity` as `filamentsLayer.draw` does.

### Curved text — the one new mechanism

`layoutLabel` (`src/services/gpu/labelLayout/labelLayout.ts`, lines 49–132) is already a pure pen-space glyph layout: it walks a string, advances a pen by glyph advance + kerning, and returns `GlyphQuad[]` — no notion of billboarding at all. Billboarding is fused downstream, only in the vertex stage: `src/services/gpu/shaders/labels/vertex.wesl`'s corner-expansion block (~lines 65–77) converts each glyph's pen-space corner into a *screen-pixel* offset via `pxToClipOffset`, which is what makes every label face the camera.

The curved-band lettering reuses `layoutLabel` unchanged and forks only that vertex stage: instead of mapping pen-X to a screen-pixel offset, a new vertex path maps pen-X to an arc position along the band's great circle and builds a per-glyph *world* tangent/normal basis, so each glyph is a world-oriented quad, not a billboard. The precedent for building a camera-independent world basis per-instance already exists: `src/services/gpu/shaders/galaxyCatalog/texturedDisks/vertex.wesl` calls `diskAxes(center, paRad, cosI, sinI)` (line 94, from `lib/orientation.wesl`, fn at line 123) and places the world-space quad corner directly from that basis — `world = center + (major * localCorner.x + minor_3d * localCorner.y) * halfSize` (lines 108–111) — with no camera read at all. The curved-text vertex stage is the same shape: a `bandAxes`-style helper returning a per-arc-position tangent/normal, in place of `diskAxes`.

Atlas coverage is a non-issue: the charset is ASCII-printable, and "ZONE OF AVOIDANCE" is plain uppercase + space. The label content is static (grill Q5's 2–3 repeats), so the glyph-quad buffer is built once at construction and drawn as one instanced draw, not rebuilt per frame. Lettering fades with `labelEnabled` AND the same distance band as the geometry (the lock-step composition `constellationLayerOpacity` already establishes for stick figures + captions).

## Open feel-calls (deferred to the visual pass)

- `intensity` / `radialFalloff` / `edgeSharpness` / `color` defaults — the `ZoneOfAvoidanceTuning` knobs, dialled live in the DebugPanel section (grill Q10) and then frozen as defaults.
- Exact inner/outer radii, `b_limit(ℓ)` curve shape and peak/trough values, lettering size and exact repeat count/spacing — shader/module constants converged by eye during the visual pass; promote one to a tuning field only if it needs live iteration.
- `ZoneOfAvoidanceInfo`'s `x`/`y`/`z`: `MilkyWayInfo`'s shape carries a point because the Milky Way IS a point (Sgr A*); the ZoA band has no natural "there" for a Focus button to fly to. Resolve when the InfoCard is built — either a representative anchor (e.g. a point along the galactic plane at a mid-band radius toward the clicked longitude) or omitting the Focus affordance for this arm.
- InfoCard copy (dust extinction, survey blindness) — drafted with the detail-card components, not here.

## Non-goals

- No Planck/SFD extinction data pipeline, fetcher, or bake — analytic only (grill Q2). The Planck GNILC link stays recorded in the grill doc.
- No tour integration — not discussed in the grill session; a separate ask if wanted.
- No URL-hash deep link for the band — `URL_HASH_FOR`'s row returns `null` (see Settings section).

## Testing

- `b_limit(ℓ)` / band-shape math: pure function, unit-testable against the stated bulge/anticenter widths.
- Distance-fade: `zoneOfAvoidance` row in `SCALE_FADE_BANDS`, exercised the same way `constellations`' band is (fade 0 near Earth, 1 past the Local-Group edge).
- Table-dispatch completeness is enforced by the type system, not a test: every table above is either a `Partial<Record<...>>` the new arm opts into or a total mapped type that fails to compile without it — no "did every table get the new arm" test is load-bearing (see `docs/superpowers/conventions/testing.md`).
- `worldToGalactic`/`GAL_*` parity: already covered by the existing `constants.parity.test` family; no new test needed unless the shader introduces a second, independent rotation.
- Pick: faded-out band is not pickable (fragment-level `discard` on sub-threshold alpha, layer-level `enabled() === false` skips the pass) — mirrors the existing `ringPick.wesl` alpha-gate test shape.
