# Grill Session: Layer-declared scale fade bands — 2026-10-18/19

Source: backlog item `docs/backlog/2026-09-19-layer-owned-scale-fade-bands.md` (refreshed in draft PR #920), after #912 shipped Layer-declared visibility (ADR 0012). User brief: "they need to be folded into the layers. each layer should declare its own bands".

Today every scale crossfade lives in core's `SCALE_FADE_BANDS` (`src/services/engine/presentation/scaleFadeBands.ts`), and each consumer measures its own camera distance, looks a row up, multiplies it into the value core hands it and often culls at 0 by hand: the pattern #912 removed for toggles. The goal is that a Layer declares its own bands as data and core applies them.

---

## Facts gathered before and during the session

- 17 rows, keyed on four quantities: the camera's distance from the render origin (the Sun), its distance from a region anchor (Sgr A\*, or regions anchored on the Sun), a caption's own distance from the camera, and a body's apparent size in px.
- Readers by owner: nine rows have a reader in exactly one Layer; `surveyDeepZoom` is read by four Layers (galaxyCatalog, structure, milkyWay label, cosmicWebDensity) and core; the rest are core's.
- Bands also ride in data: `VolumeFieldSettings.bands` (density, in settings) and `StructureMarkerStyle.visibleBand` (per structure).
- Caption kinds and producers: `sun` and `star` come from starCatalog, `sgrAStar` from blackHoles, `earth`/`planet`/`meshBody` from core's `sceneBodyLabels` (reach cuts, not bands), `constellation` is producer-supplied. `ForegroundCaption.revealBand` already exists (mesh bodies stamp it).
- Label frame (audit): NEAR0 producers emit camera-relative `worldPos` (`near0LabelProjection` rebases on `drawCamPos`, load-bearing for f32 precision at solar-system zoom); COSMO producers (famous galaxies, Milky Way label, cosmic structure labels) emit absolute positions (`cosmoLabelProjection` passes `ctx.vp`), by history only.
- Consumer audit: most banded entries apply their band in every consumer (milkyWayDisk, zoneOfAvoidance, localBubble, constellations, cosmicWebDensity, structureRing and its label, label:milkyWay). Two do not: `survey` (only `galaxyPointSpritesPass`, famous exempt) and `starCatalog` (only `starPointsPass` applies `starBackdrop`; folding it into the entry would drop seeded stars from core's scene-body admission, `frameContext.ts:122-133`).
- A third fade kind exists outside the table: by apparent size in px (famous-galaxy labels `produceFamousGalaxyLabels.ts:191-214`, structure rings' `markerMinApparent*`, core's `bodyGlint`, the Milky Way's `milkyWayFadeAlpha`).

---

## Q1: Who applies a Layer's bands?

**The question:** When a Layer declares its own bands, does core apply them, or does the Layer keep applying them itself with the data merely moved?

**Considerations:**
- **Option A (core applies):** entries declare bands, core folds them into the handed value (fade × clip × band) and skips at 0, so draw and pick follow. Extends ADR 0012: one handed value, one cull; deletes every per-Layer multiply and hand-written cull.
- **Option B (Layer applies its own):** the band data moves into each Layer and a contract member lists it for an overview; consumers unchanged. Smaller change, keeps the duplication.
- **Option C (files move only):** per-Layer band files, no contract change. Simplest, but gives the overview and cross-Layer contracts no home and changes nothing about the duplication.

**Decision:** A (B1). The same un-braiding #912 did for toggles.

## Q2: What can a band be measured on?

**The question:** Core can only apply a band if it can measure the quantity. Which quantities may a declared band key on?

**Considerations:**
- **Camera distance only** (from the origin or a region anchor): one number per entry per frame; covers every Layer row.
- **Plus per-caption distance:** the star, Sun and Sgr A\* names fade with each caption's own distance, a different number per label, applied today by core's `CAPTION_FADE_RULES` inside the caption compose.
- **Origin only:** drops the Milky Way's approach to Sgr A\*.

The user first asked what "caption distance" meant (explained with `composeForegroundCaption`'s `Math.hypot(label.worldPos − camPos)`), then said the caption bands are "a different beast, but still relevant to declare in the layer somehow, without complecting everything", and asked what the contract would read. Shown: one optional `bands?` field on `VisibilityEntryCommon`; caption bands could ride the existing `ForegroundCaption.revealBand` with no contract change. The user then asked whether the visibility prop could carry label bands too: yes, applied per label in core's label-director loop (`label2DDirector.ts:781`, where emphasis is already applied per label), with a `from: 'anchor'` on label entries. That raised the frame question (Q3).

**Decision:** Both kinds are declared in `visibility.ts` and core applies both (B2). Later narrowed by Q4.

## Q3: Why do the two label groups store positions differently?

**The question:** A per-label distance needs one expression for every label, but NEAR0 labels are camera-relative and COSMO labels absolute. Keep two frames (a per-slab `anchorOrigin` in the director config), or unify?

**Considerations:**
- **Keep two frames:** a small config field per director (`anchorOrigin`: zero on NEAR0, `drawCamPos` on COSMO). No producer changes, but the asymmetry stays for every future "how far is this label" question.
- **Unify:** the three COSMO producers and `cosmoLabelProjection` follow NEAR0's rebase, so a label's camera distance is always `|worldPos|`. Touches two producers that lift through `ctx.vp` themselves.

NEAR0 must be camera-relative (a near anchor and the view translation agree to ~4 f32 digits at solar-system zoom); COSMO is absolute only by history.

**Decision:** Unify (L1), as a pixel-identical ground-prep refactor in its own commit; separate PR vs riding is asked at the checkpoint.

## Q4: Scope

**The question:** The shape kept growing to fit captions (per-label distance) and then apparent-size fades. The user called it "a mess". Narrow?

**Considerations:**
- **Kind 1 only:** camera distance from a fixed point, 13 rows, one clean shape; defer kind 2 (per-label distance) and kind 3 (apparent size) to their own design.
- **Keep all kinds:** one effort, but a band field that measures several unrelated quantities.

**Decision:** Kind 1 now (S1), "but take into account that the other kinds can be added without too much work". So the measured quantity is decided in one place, core's band resolver: kind 2 becomes a new `from` value applied in the director loop, kind 3 a new measurement branch. B2's caption half is deferred, not reversed; L1 still ships as prep. A "per-subject fades" backlog item records kinds 2 and 3.

## Q5: The band's shape

**The question:** How does an entry write its bands, given that some entries need more than one (Local Bubble's approach × recede, the Milky Way's two approaches from two points) and some items need different bands (survey's famous exemption, structures by scale, star names)?

**Considerations:**
- **A list of `{ from, band: FadeBand }`:** first sketch. The user asked why a list rather than an object with named keys.
- **`bands` + `itemBands`:** a default for every item plus per-item overrides (the user's "famous and other"). Rejected by the user: two fields with a default-versus-override split.
- **A record keyed by item:** lists every item; a new survey silently gets no band.
- **In/out windows:** the user preferred "an in/out band": each band is a window with `in: [start, end]` (0 → full as distance grows) and `out: [start, end]` (full → 0), replacing `FadeBand`'s "direction from edge order" rule. Every row maps; the Local Bubble and ZoA pairs each become one window.
- **`from`:** the user asked why it exists. Only two real exceptions measure from somewhere other than the Sun (the Milky Way's approach to Sgr A\*, and the deferred per-label captions), so it became optional.
- **Named keys:** the user returned to "why not an object with named props?"; I had misread "in/out band" as rejecting names. Names say what each window is for (`approachCentre`, `milkyWayPlaces`) and key the overview and any contract (`localBubble.shell.out[1]`).

**Decision:** `bands?: Readonly<Record<string, EntryBand>>` with `EntryBand = { in?: [start, end]; out?: [start, end]; from?: RegionId; items?: readonly string[] }` (B3). `from` omitted = the Sun; `items` omitted = every item (or the entry), and must be a subset of the entry's items (checked in `appVisibility.ts` at load). An item's value is the product of the bands that apply to it.

## Q6: What does an entry band mean?

**The question:** A band on an entry applies to every consumer of that entry. The audit found two bands applied by one consumer only. Which belong on the entry?

**Considerations:**
- `starBackdrop` dissolves the seeded-star point backdrop just before its own hard cut; it is a render-path detail, and on the entry it would drop the Sun and famous stars from core's scene-body admission. Core's `bodyGlintBackdrop` is the same kind of thing.
- Survey's deep-zoom band ("cosmic content yields once the local starfield fills the near field") is about whether survey galaxies show at this scale; on the entry it also reaches the planner, LOD disks and hi-res famous path, probably invisibly (no survey galaxy is within 2 kpc of the Sun).

**Decision:** An entry band says where the thing is visible and applies to every consumer, pick and skip included (R1). A dissolve owned by one render path stays that pass's own data, moved into the Layer's folder. Survey's band goes on the entry, gated by a before/after pair.

## Q7: How do an item's bands combine?

**The question:** The Milky Way disk combines its two approach bands with `Math.min` (`milkyWayCloudLiveness.ts:43`); B3 implied a product.

**Considerations:**
- **Product everywhere:** one rule. The disk dims 20-40% more within 2 kpc of the Sun (1 kpc out: 0.42 → ~0.26-0.35), because the Sun sits 8.2 kpc from Sgr A\*, inside that band's 12 kpc.
- **A per-entry `combine` knob:** keeps the look, for one entry.
- **Min everywhere:** changes nothing else today (no other item has two bands), but min is odd for in/out windows.

**Decision:** Product (C1). The disk gets a before/after near the Sun; if it reads worse, retune the Sun band's edges (data).

## Q8: Do labels inherit their show entry's bands?

**The question:** Constellation names, ZoA lettering and structure labels each apply their show entry's band by hand; all three are `of` that entry, which today passes on clip only.

**Considerations:**
- **Inherit via `of`:** a label with `of` multiplies in its show entry's bands item for item and may add its own. Reproduces today exactly (starCatalog's and lightTime's show entries carry no band). A name can never outlive its lines.
- **Each declares its own:** explicit, but three Layers repeat a band and can drift.

**Decision:** Inherit via `of` (O1). The Milky Way label (no `of`) declares its own, which collapses to one window: `youAreHere: { in: [0.002, FOREGROUND_MAX_DISTANCE_MPC], out: [0.6, 2] }` (today `surveyDeepZoom` × a local `MILKY_WAY_LABEL_FADE_BAND`).

## Q9: When does core skip a label producer?

**The question:** Passes skip on the handed value; label producers skip on raw liveness, by design (#912 landmine 3: a clip at 0 must not cut a switched-off label's fade-out tail, pinned by a test). With bands folded into the handed value, a producer at band 0 would still be called, and the Milky Way label's own band check guards a near-plane blowup (`produceMilkyWayLabel.ts:44-53`).

**Considerations:**
- **Skip on raw liveness or every item's band at 0:** bands counted, clip not. A band is camera-only, so at 0 every label of the entry is at alpha 0 whatever the fade does; it cannot cut a tail.
- **Leave producers to check their own bands:** keeps the duplication this effort removes.

**Decision:** Skip when not live (raw, unchanged) or when every item's band is 0 (K1). Producers drop their own band early-returns.

## Q10: The density field's settings bands

**The question:** `VolumeFieldSettings.bands` keeps the density band in Redux settings, documented as tunable at runtime "via `writeVolumeField`".

**Considerations:** `writeVolumeField` no longer exists, nothing writes `bands` after the seed, and the value rides every saved scene through the #890 snapshot. Keeping it would be a second home for bands, for a tunability nothing uses.

**Decision:** Move it onto the density entry and delete the settings field (D1). The spec checks that old saved scenes and settings holding `bands` restore cleanly.

## Q11: Where do shared edges live?

**The question:** `surveyDeepZoom` is used by four Layers and anchored on a core constant; the anchor constants live under `services/` (`MILKY_WAY_RADIUS_MPC` in v1, which is slated for deletion). The ready backlog item "Move `scaleFadeBands` + its four anchor constants to `src/data`" already plans the move.

**Considerations:**
- **Shared constants in `src/data/bands/`:** one home per shared edge; `data/` stops importing `services/`; the backlog item gets its occasion.
- **Each Layer writes the edges itself:** four copies of `0.002`, four places to retune.

**Decision:** Absorb the backlog item as ground prep (E1). A band shared by Layers is one named constant in `src/data/bands/` (e.g. `SURVEY_DEEP_ZOOM`); a single-Layer band stays in the Layer; core's own rows (body glint, `bodyGlintBackdrop`, the two cubemap rows, the three caption rows) stay a smaller table in `src/data/`.

## Q12: The descent overview and cross-Layer matches

**The question:** The central table's other value is reading the whole descent in one place and keeping cross-Layer edge matches side by side. What replaces it?

**Considerations:** After Q11 only one cross-Layer match is not already tied by import: the Local Bubble shell and the constellation figures both leave at 10 kpc. `CameraBandBar` in the debug panel is the camera-regime strip, not a band overview. A snapshot test of the composed table would fail on every retune and catch no bug (`testing.md`).

**Decision:** `NEIGHBOURHOOD_RECEDE_KPC = 10` in `src/data/bands/` (V1); the overview is the composed band list core builds in `appVisibility.ts`; a live band debug panel goes to the backlog.

---

## Resulting shape

```ts
// src/@types/engine/layer/EntryBand.d.ts
export type EntryBand = {
  readonly in?: readonly [number, number];
  readonly out?: readonly [number, number];
  readonly from?: RegionId;
  readonly items?: readonly string[];
};

// src/@types/engine/layer/VisibilityEntryCommon.d.ts
readonly bands?: Readonly<Record<string, EntryBand>>;
```

- Core: handed value = fade × clip × product of the item's bands (including the `of` entry's bands for a label with `of`). Passes skip at 0 as today; label producers skip when not live (raw) or when every item's band is 0.
- Ground prep: L1 (one camera-relative label frame) and E1 (anchor constants and the remaining core table to `src/data`).
- Behaviour changes, each with a before/after: the Milky Way disk near the Sun (C1); survey's band reaching the planner, LOD disks and hi-res famous path (R1).
- Settled in the spec from the code: core measures from `ctx.drawCamPos` (the passes reading `view.camPos` see the same frame while the render origin is `[0, 0, 0]`); `from` resolves through `regionRelativeDistanceMpc`; structure marker passes declare `fade: 'structureRing'`; the value is memoised per frame per entry; `appVisibility.ts` validates edges and band items at load; per-frame cost is priced at plan time.
- Deferred to backlog: per-subject fades (kinds 2 and 3); a live band debug panel.
