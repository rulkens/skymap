# Milky Way structures — design spec

Four new structure categories for objects inside the Milky Way: open clusters, globular clusters, nebulae and Galactic Centre places. They reuse the existing ring marker, label, settings toggle, pick, search row and info card. The existing four categories (cluster, supercluster, void, group) stay behaviourally unchanged.

Rulings came from the brainstorm of 2026-10-04 → 2026-10-05 (dash asks B28N and 6kbE) and the `refactor-ground` checkpoint. They are listed in §2 and are not re-litigated here. This spec takes over the backlog item "Galactic Center place labels"; its index line and detail file are deleted in the same change.

## 1. What this is

- Four `type: 'structure'` registry rows: `open-cluster`, `globular-cluster`, `nebula`, `galactic-centre`.
- 71 hand-authored seed rows (§5: 25 open clusters, 21 globular clusters, 22 nebulae, 3 Galactic Centre places), each a ring plus label at its true 3D position, focusable, pickable and searchable.
- The rings and labels are visible while the camera is inside or near the Milky Way and fade out in intergalactic space. The existing four categories keep fading out on the way in, as today.
- Focusing a row frames it by its radius: the Pleiades from tens of parsecs, not from 100 kpc.
- A nebula's card shows its kind (emission, reflection, planetary, supernova remnant, dark). A Galactic Centre place's card says when its line-of-sight distance is assumed, not measured.

Packaging: **two PRs**. PR 1 is the ground preparation (§3): nine behaviour-neutral commits. PR 2 is the feature (§4–§8). Each PR gets its own plan. There is no deletion audit on PR 1, and one at PR 2's `/feature-done`.

## 2. Rulings

| # | Ruling |
|---|---|
| R1 | Categories: open clusters, globular clusters, nebulae, Galactic Centre places. Molecular clouds, OB associations and spiral-arm labels are out. |
| R2 | Rows come from a hand-written seed now. Published catalogs (Hunt & Reffert clusters, Harris globulars) are a later feature. |
| R3 | One `nebula` category. The kind is a per-row field shown on the card, not a toggle. |
| R4 | Galactic Centre places is its own category with three rows: central cluster, Arches, Quintuplet. The Central Molecular Zone is out. |
| R5 | The Galactic Centre place labels backlog item is folded into this feature. |
| R6 | A category states where and when it draws through **independent fields**: `slab` on the registry row, `visibleBand` on the style row, focus distance from the row's radius. There is no `scale: 'cosmic' \| 'galactic'` grouping. |
| R7 | Seed lengths are **unit-tagged** (`{ value, unit }`) in the one existing seed file. The 42 existing rows migrate. |
| R8 | PR packaging: one prep PR (P1–P9), then the feature PR. |
| R9 | New category ids are kebab-case, so every structure deep link stays lowercase kebab. Deep links stay in the URL hash; path-based object links and a `kind/slug` scheme are backlogged. |

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// src/data/source.ts — append-only
OpenCluster: 33, GlobularCluster: 34, Nebula: 35, GalacticCentrePlace: 36

// StructureSourceEntry gains two fields; every structure row states both
type StructureSourceEntry = SourceEntryBase & {
  readonly type: 'structure'; readonly code: number;
  readonly scale: 'cosmic' | 'milkyWay';  // picks the depth slab its rings and labels draw on; only cosmic cards show a galaxy count (focus dims for every category)
};

// structureMarkerStyles.ts — the style row gains the band it fades on
type StructureMarkerStyle = { …; visibleBand: ScaleFadeBand };

// Seed lengths (src/@types/data/Length.d.ts, src/utils/math/lengthToMpc.ts)
type Length = { readonly value: number; readonly unit: 'pc' | 'kpc' | 'Mpc' };
type StructureSeedEntry = {
  id; names; commonName?; category: StructureId; raHours; decDeg; description;
  distance: Length; physicalRadius: Length; apparentRadius: Length;
  abell?: string;                    // cluster
  nebulaKind?: NebulaKind;           // nebula, required there
};

// StructureInfo arms
NebulaRecord              = StructureBase & { category: 'nebula'; nebulaKind: NebulaKind };
GalacticCentrePlaceRecord = StructureBase & { category: 'galactic-centre' };
OpenClusterRecord, GlobularClusterRecord = StructureBase & { category: 'open-cluster' | 'globular-cluster' };

// scaleFadeBands.ts
milkyWayStructures: { fullAt: <inside the Galaxy>, goneAt: FOREGROUND_MAX_DISTANCE_MPC }
```

With the joints below in place, the feature is four source codes, four registry rows, four style rows, four record arms, one fade band, the seed rows and two card rows.

### 3.2 Verdicts

| Touchpoint | Today | Verdict | Joint |
|---|---|---|---|
| Marker depth slab | `structure-markers-cosmo` is one pass on the COSMO roster (`frameSections.ts:125`); COSMO's near plane is 10 kpc (`slabs.ts:113`); a pass sits on one slab only (`checkFrameOrder.ts:159`) | bolt-on | P1 |
| Label depth slab | every structure label goes to the COSMO director (`engine.ts:326`) | bolt-on | P2 |
| Visibility band | `surveyDeepZoom` hard-coded for all structures (`structureMarkersCosmoPass.ts:28`, `produceStructureLabels.ts:76`) | bolt-on | P3 |
| Near-object guards | fade to zero within 1 kpc of the anchor (`produceStructureMarkers.ts:92`, `produceStructureLabels.ts:145`) | bolt-on | P4 |
| Focus distance | clamped to ≥ 0.1 Mpc (`structureFocusDistance.ts:59`) | bolt-on | P5 |
| Galaxy membership | focus dimming is a four-way `\|\|` (`structureFocusSubsystem.ts:80`); the count renders for any structure (`galaxyCatalog/frame.ts:68`) | bolt-on, second special case | P6 |
| Marker precision | ring instances are absolute f32 world Mpc (`ring.wesl:71`); a 0.5 pc ring at 8.2 kpc jitters about a pixel on approach | bolt-on | P7 |
| Category lists | `emitCounts` (`wireStructureProjection.ts:58`), `VALID_CATEGORIES` (`parseStructureSeed.ts:22`), `SeedEntry.category` (`buildStaticAnchorStructures.ts:64`) | bolt-on | P8 |
| Seed units | `distMpc` / `physicalRadiusMpc` / `apparentRadiusMpc` | bolt-on (R7) | P9 |
| Registry row, style row, record arm | compiler-checked tables | growth | — |
| Settings toggles, pick decode, marker buckets, search chip, default visibility, deep-link claim | derived from `STRUCTURE_IDS` | growth | — |

Greenfield cross-check: a fresh agent given only the data requirements derived independent slab, band and focus values and rejected a `scale` grouping, because globular clusters straddle the 10 kpc plane and Galactic Centre places want a different band from open clusters. It also proposed deriving the slab per frame from view depth. The sketch keeps `slab` per category instead: the frame program binds a pass to one slab, and NEAR0 already draws Galaxy-sized content (the Milky Way, constellations) with a far-plane clamp. Price of that choice: a globular seen from intergalactic space draws on NEAR0 until its band fades it, which §6 covers.

### 3.3 Prep list (PR 1, one commit each, all behaviour-neutral)

- **P1 — slab on the registry row; two marker passes.** `StructureSourceEntry.slab`; the four existing rows say `'cosmo'`. A second pass `structure-markers-near` joins the NEAR0 hdr roster with its own `structureMarkerRenderer` instance. Each pass draws the categories whose `slab` matches; the near one draws nothing yet. Its far-plane clamp (as in `near0SelectionRingPass`) lands in PR 2, where there are rows to judge it on.
- **P2 — labels follow the slab.** `produceStructureLabels` runs once per slab and feeds the matching director (`foregroundLabelDirector` for `'near0'`, camera-relative anchors as constellation captions do).
- **P3 — band on the style row.** `visibleBand` on every row, all four `surveyDeepZoom`. The pass keeps a cheap skip when every category it draws is at zero.
- **P4 — near guards protect only the division.** Both 1 kpc guards become "distance is zero". Inside its own radius a ring is already faded by the max-apparent-radius band, which scales with the object, so no fixed distance is needed.
- **P5 — focus from radius.** Drop `MIN_FRAMING_DISTANCE_MPC`; keep the maximum. No seeded row has a radius under 0.05 Mpc, so today's framing is unchanged.
- **P6 — `scale` on the registry row.** The four existing rows say `'cosmic'`; the member count is cosmic-only. The member-count publisher reads it; the focus subsystem does not.
- **P7 — camera-relative marker instances.** `setMarkers` uploads `worldPos − camPos` computed in f64; `ring.wesl` and `ringPick.wesl` drop their `camPosMpc` add.
- **P8 — derived category lists.** `emitCounts`, `VALID_CATEGORIES` and `SeedEntry.category` read `STRUCTURE_IDS` / `StructureId`.
- **P9 — unit-tagged seed.** `Length` + `lengthToMpc`; the 42 rows migrate (`"distance": { "value": 16.5, "unit": "Mpc" }`); parser, `buildStaticAnchorStructures`, `buildStructures`, `demoTour.ts`, `docs/DATA.md` and the seed tests follow. Runtime records stay in Mpc.

### 3.4 Adjacent findings (backlogged, not in either PR)

- `selectionEncoding.wesl:41-50` hand-lists `SOURCE_CODE_*` constants no shader imports.
- `toStructureSearchEntry.ts:17` and the card's Abell row are per-category branches; a third per-category card fact is the trigger to give arms their own card rows.
- Forming the `structure` Layer (layer-composition spec §9) is not needed here.
- Path-based object links with share previews: [`docs/backlog/2026-10-05-path-based-object-links.md`](../../backlog/2026-10-05-path-based-object-links.md).

The `add-data-source` skill's Path B table was stale (files that no longer exist, a 5-bit sentinel); PR 2 rewrote it against the files it touched.

## 4. Registry, style and records

- Ids are kebab-case (R9): `open-cluster`, `globular-cluster`, `nebula`, `galactic-centre`. Structure ids stay `${category}-${seed.id}`, so deep links read `#focus=open-cluster-pleiades` and `#focus=galactic-centre-arches`. The deep-link claim matches by category prefix, so the plan pins a test that `open-cluster-…` and `globular-cluster-…` never resolve as `cluster`, and that `galactic-centre-…` does not collide with the `galactic-centre` place id.
- All four rows: `scale: 'milkyWay'`, `bearsLabel` and `bearsMarker` true, `labelLayer: 'structure'`. They share the structure fade and recession channel, so existing tour cues on structure rings and labels apply to them too.
- Display copy (card label; short label and plural where they differ): "Open Cluster" / "Open clusters", "Globular Cluster" (short "Globular") / "Globular clusters", "Nebula" / "Nebulae", "Galactic Centre Place" (short and plural "Galactic Centre").
- Style rows: all four use `milkyWayStructures`. Colours form a ramp distinct from the existing warm cluster ramp; the exact values and the min/max apparent-radius thresholds are tuned on screen with real rows (§8).
- None joins `BULK_CATALOG_CATEGORIES`; there is no `.ccat` for them.

## 5. Seed rows

Rows are added to `data/seeds/structure_anchors.seed.json` with lengths in the unit the source publishes. Every value is taken from a cited source at authoring time, not from memory; the description names what the object is and why it is notable.

- **Open clusters (25):** Pleiades, Hyades, Praesepe, Coma Star Cluster, α Persei, Double Cluster (two rows), Jewel Box, Wild Duck, Butterfly, Ptolemy, M35–M38, M41, M46, M47, M50, M67, NGC 752, IC 2602, IC 2391, Trumpler 14, Westerlund 1.
- **Globular clusters (21):** ω Centauri, 47 Tucanae, M2, M3, M4, M5, M10, M12, M13, M15, M22, M30, M53, M54, M55, M71, M79, M80, M92, NGC 6397, NGC 2419.
- **Nebulae (22):** Orion, Carina, Lagoon, Trifid, Eagle, Omega, Rosette, North America, California (emission); Horsehead, Coalsack (dark); Ring, Dumbbell, Helix, Cat's Eye, Owl (planetary); Crab, Veil, Vela, Cassiopeia A, Tycho, Kepler (supernova remnant). The Tarantula is left out: it is in the Large Magellanic Cloud.
- **Galactic Centre places (3):** central cluster, Arches, Quintuplet. Arches and Quintuplet sit at Sgr A\*'s distance (`GALACTIC_CENTRE_ANCHOR`), with their published RA/Dec.

Every Milky Way row also carries a `source` (see "Decided during review"). Parser additions: `nebulaKind` is required on a nebula and rejected elsewhere; `Length.unit` must be one of the three units and `value > 0`.

## 6. Visibility and focus

- `milkyWayStructures` is keyed on camera distance from the render origin, like `surveyDeepZoom`, and is its mirror: full inside the Galaxy, gone at `FOREGROUND_MAX_DISTANCE_MPC`, where NEAR0 content switches off anyway. `fullAt` is tuned on screen.
- The per-marker apparent-radius fades do the rest: from the Sun, a Galactic Centre place 8 kpc away is far below the minimum on-screen radius and stays hidden until the camera approaches.
- Focus frames at `FOCUS_FILL × apparentRadius` (P5). Focusing any structure, a Milky Way one included, dims everything outside its sphere (see "Decided during review"); `scale: 'milkyWay'` only means the card shows no galaxy count.

## 7. Card and search

- `StructureDetailCard`: a "Type" row for a nebula (`Planetary nebula`). The "Galaxies" row and its tooltip render only when the category's `scale` is `'cosmic'`.
- `CompactStructureCard` and the palette rows need no change beyond the derived badge.

## 8. Testing

Each test below fails on a real bug nothing else catches.

- `lengthToMpc`: pc, kpc and Mpc convert to the same Mpc value for the same physical length.
- Seed parser: rejects a nebula without `nebulaKind`, `nebulaKind` on a non-nebula, an unknown unit.
- Slab partition: every structure category is drawn by exactly one of the two marker passes, and its labels go to the matching director.
- Band: a Milky Way category is at full alpha at the Sun and zero at `FOREGROUND_MAX_DISTANCE_MPC`; a cosmic category is the reverse.
- Focus distance: a 4 pc radius frames within tens of parsecs; an existing cluster's framing distance is unchanged from before P5.
- Membership: a `scale: 'milkyWay'` category still yields an `ActiveFocus` (it dims what lies outside it) but no member count.
- Seed sanity: every Milky Way row lies within 0.1 Mpc of the origin; every Galactic Centre place lies within 50 pc of `GALACTIC_CENTRE_ANCHOR`.

Visual checks, one deep link each: Pleiades from the Sun and focused; ω Centauri; Orion Nebula; Arches from near Sgr A\*; the whole Galaxy from 50 kpc with all four categories on; an existing cluster (Virgo) to confirm nothing moved.

## 9. Risks

- **NEAR0 far plane moves with the camera.** Does not apply: NEAR0 is a reversed-Z slab with an infinite far plane, so no ring is ever beyond it.
- **Label crowding near the Sun.** 71 new labels in a volume that already holds constellation captions and star names. Declutter priority and the default-on state per category are judged on screen.
- **P7 touches the pick shader.** Pick and draw must use the same camera-relative instances, or rings are clicked where they are not drawn.
- **Seed migration (P9) touches every existing row.** The existing seed-sanity tests pin positions before and after.

## 10. Definition of done

- The six deep links in §8 look right to the user.
- The four categories toggle in Settings with counts, appear in search, and open the info card on click.
- Existing structure behaviour is unchanged: same framing, same fades, same picks.
- `npm run typecheck`, `npm test` and `npm run build` are green.
- `docs/DATA.md` describes the unit-tagged seed; the `add-data-source` skill's Path B table matches the code.
- The backlog index line and `docs/backlog/2026-07-30-galactic-center-place-labels.md` are gone.

## 11. Decided during review (2026-10-06 to 10-08)

Rulings from the on-screen checks. Where they differ from §6–§8 as first drafted, those sections now say what was built.

- **Focus dims everything not part of the structure.** Focusing any structure dims stars outside its sphere, galaxies, the Milky Way glow, constellation lines and captions, and star and body names. Dimmed stars and their name labels are not pickable, so a click cannot land on something faded out. Reason: a parsec-scale focus is unreadable against a full-brightness sky, and the cluster rule already worked. The card's galaxy count still follows the category's `scale`.
- **The Milky Way glow recedes on every focus**, galaxy-cluster focus included. Reason: it is scenery behind any focused subject.
- **Milky Way labels sit above their ring.** `labelPlacement: 'above'` on the style row places the label over the ring's top edge with a fixed pixel gap (`STRUCTURE_LABEL_ABOVE_GAP_PX`). These rings stay on screen at large sizes, and a centred label would sit on the ring line. A focused structure's label may fall off-screen; that is accepted.
- **The selected ring brightens by a colour gain of 1.6×** (`SELECTED_RING_BRIGHTEN`) for every category, replacing the capped opacity boost. Reason: most rings rest at full opacity, where an alpha boost has nowhere to go.
- **Structure cards link to Wikipedia** from a per-row `wikipedia` title, verified against the article rather than derived from the name. Five existing rows have none (`galaxy-cluster-ophiuchus`, `galaxy-cluster-shapley-a3558`, `galaxy-cluster-a3571`, `galaxy-group-cvn-i-cloud`, `galaxy-group-ngc-6946-group`), and their cards show no link.
- **Each Milky Way seed row carries a `source`** naming the paper or survey its distance and radii came from, required by the parser for every Milky Way category. Reason: these rows have no catalogue in the pipeline to audit against.
- **Known limitation, not fixed here:** globular clusters' Gaia member stars smear into a radial line toward the Sun, because each star keeps its own noisy distance. Backlogged at `docs/backlog/2026-10-06-cluster-member-star-distances.md`.
- **During a focus, only what lies inside the focused sphere is clickable or hoverable** (`isPickableUnderFocus`), for every focus, galaxy-cluster focus included. Other rings, sibling Milky Way rings too, and galaxies outside the sphere do not answer the pointer. Reason: what is dimmed should not be selectable, and it ends accidental hops from ring to ring.
- **A Milky Way ring's click target ranks above the stars** (`PICK_BAND_STRUCTURE_RING_EPS` in `pickDepthBands.wesl`), as labels already did, so a structure can always be selected first. Known gap: a curated star much nearer than the ring keeps its true depth and can still win.
- **Hover highlights the ring and its label together**: the ring by a colour gain of 1.3× (`HOVERED_RING_BRIGHTEN`), the label by a blend toward white (`HOVERED_LABEL_WHITEN`). The selected label whitens further (`SELECTED_LABEL_WHITEN`).
- **The far-plane clamp planned for the NEAR0 marker pass was removed.** NEAR0 has an infinite far plane, so the clamp never acted.
- **Open-cluster colours are muted** so the many rings near the Sun do not dominate the star field.
- **One scale word, `scale: 'cosmic' | 'milkyWay'`, replaces `slab` and `galaxyMembers` on the registry row.** This revises R6 and §3: the two flags agreed on every row, and "galactic" read both ways. The scale picks the depth slab and whether the card counts galaxies; the visible band and focus distance stay independent, which is what R6 was protecting. §3 is kept as the record of the prep PR as it was built.
- **`cluster` and `group` became `galaxy-cluster` and `galaxy-group`** (ids, `Source` names, labels), so they no longer read as siblings of the star-cluster categories. Structure ids are `category-seedId`, so `#focus=cluster-…` and `#focus=group-…` links from before this change no longer resolve; the user accepted that without a redirect. Numeric source codes are unchanged, so no data was re-baked.
- **Settings list the categories under two headings, Cosmic and Milky Way.** The Labels & Guides list stays flat.
- **Globular rings stay at the tidal radius**, though it is far larger than the visible cluster: the ring marks the cluster's extent, not its bright core.
- **The Carina Nebula sits at Trumpler 14's distance** (2389.8 pc), so the nebula and the cluster inside it draw as one complex. The published sightline distances are kept in the row's `source`.
- **Westerlund 1 and the Coalsack keep their approximate radii**, each marked `WEAK RADIUS` in its `source`.
- **The Wikipedia link comes before the description**, as on star, body and black-hole cards.
- **Stars inside a visible Milky Way ring are not clickable**; no exemption for the focused ring was built.
