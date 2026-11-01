# Grill Session: Context-aware panel and scale regimes — 2026-10-28

Source: user brief, 2026-10-28: "rework the settings panel … a new UI element that is context aware (location and zoom level) and shows amongst others relevant layers to turn on and off, relevant exhibits / tours … where somebody is determines what they can change in what they see and what they can explore deeper." Ambition stated: award-grade (data-viz and Webby).

This file holds the facts swept for the session, the rulings so far, the proposed regime data model, the map of every toggle and destination onto the regimes, and the questions still open. It precedes `refactor-ground` and the spec.

---

## Rulings so far

- **R1 — Relevance is visibility.** A Layer, and every toggle, slider and label row by proxy, is relevant exactly when the thing it switches could change pixels in the current view. That is the entry's band value (ADR 0012) at the current camera, not its on/off state. No separate relevance table. (user, 2026-10-28)
- **R2 — Flow and filaments get scale bands.** Both are extragalactic-only and today gate on their toggle alone, so under R1 they would read as relevant everywhere. `docs/backlog/2026-07-24-filaments-flow-scale-bands.md` becomes a prerequisite of this work, not a follow-up. (user, 2026-10-28)

---

## Facts gathered

### The panel today (full table: session scratch `inventory-settings.md`)

- 83 controls in the Settings panel: 19 sliders, 5 selects, 59 toggles (9 are section masters). 77 visible at defaults. The phone Layers sheet renders the same `SettingsSections`.
- Sections, in order: Galaxies 16 · Stars 7 · Cosmic web density 4 · Cosmic web filaments 2 · Flow 2 · Structures 9 · Labels & guides 24 (16 label-category rows, 7 Layer guide rows, master) · Display 10 (+ Earth 3) · Camera controls 5 · Tier chip.
- Nine Layers have no `main` section and surface only as a Labels & guides row: missions, zoneOfAvoidance, localBubble, lightTime, constellations, blackHoles, milkyWay, body; earthScenes has no `ui` at all.
- Seven Layer `debug`-slot sections (56 controls) live in the DebugPanel, which the `d` key opens in production (`state/input/keyboardShortcuts.ts:62`).
- Calibration knobs shipped to end users: Galaxies › Advanced (surface-brightness scale, "Bloom ceiling", distance-falloff exponent, HEALPix re-weight select, M_lim), Display tone-curve names and HDR knee/headroom, Earth atmosphere/ambient/ocean roughness, OpenSpace friction. "Bloom ceiling" and Display › Bloom share a word for two things. Two Labels & guides rows are both titled "Galactic Centre".
- Settings persistence: only `cameraControls` is read from localStorage; everything else is a deep-link or takeover concern.

### Visibility and scale (full ladder of 108 edges: session scratch `inventory-scale.md`)

- Bands (`bandValueOf.ts`) measure the camera's distance from the render origin (the Sun), or from a region anchor via `from`. Smoothstep in/out; an item's value is the product of the bands that apply.
- The NEAR0 foreground gate (`FOREGROUND_MAX_DISTANCE_MPC` = 0.23 Mpc, 100 × the largest region extent) and the 9.2 kpc caption cut measure `cam.distance`, camera to target, in 18 hand-written `enabled` checks across 16 files: eleven body and Earth passes, two star passes, mission trails, the black-hole marker and pick, the Earth-scene glints. A different quantity from the bands, though the structure Layer already encodes the same edge as an origin-keyed `out` band, and the two measures diverge only when the camera is far from home yet close to its target: at a famous galaxy's framing today's gate leaves the planet, ring and Earth passes enabled, drawing nothing.
- Region extents, derived: solar-system ≈ 30 AU (1.47e-10 Mpc), solar-neighbourhood 2.3 kpc (exact, Eta Carinae), galactic-centre ≈ 0.11 pc (1.17e-7 Mpc).
- Seven of fifteen Layers declare bands: galaxyCatalog (survey in 2–230 kpc; famous exempt), cosmicWebDensity (same), zoneOfAvoidance (in 35–175 kpc, out 2–6 Mpc), localBubble (in 0.4–1 kpc, out 4–10 kpc), constellations (out 1–10 kpc), milkyWay (disc in 200 pc–2 kpc and, from the Galactic Centre, 600 pc–12 kpc; "You are here" label in 2–230 kpc, out 0.6–2 Mpc), structure (cosmic rings in 2–230 kpc; Milky Way places out 35–230 kpc).
- No bands, gated elsewhere: starCatalog (foreground gate; Gaia out 8–25 kpc; backdrop dissolve 4.6–23 kpc), body (foreground gate + pixel cull on orbit trails), missions (foreground gate), blackHoles (foreground gate; lens 100–500 AU from the Galactic Centre), lightTime (per-sphere ratio windows 1.2r–2r in, 12r–40r out), earthScenes (no `visibility` member).
- No bands, no gate: flow, cosmicWebFilaments (R2).
- The scale readout: `runFrame.ts:170-174` computes `ScaleInfo` from `altitudeMpc`, the range to the pivot surface when the pivot is a body, else to the pivot. Unit ladder in `formatDistance.ts:44-67`: m → km at 1 km, AU at 1 AU, pc at 1 pc, kpc at 1 kpc, Mpc at 1 Mpc, Gpc at 1000 Mpc.
- Home is Earth at ≈ 27,600 km range (|camPos| ≈ 1 AU, so every origin-keyed band reads 1 AU at home).

### Destinations (full table: session scratch `inventory-destinations.md`)

- Exhibits (6): solarSystem 42 AU · voyager-missions hold-driven, ≈ 220 AU in cruise · cosmicFlows pose 140 kpc · zoneOfAvoidance 1.2 Mpc · cosmicWeb 251 Mpc · observableUniverse ≈ 29 Gpc. All six have a palette card.
- Tours (2 public): grandTour, 14 beats from 100 Mpc → Milky Way 0.15 Mpc → M31 → Local Group → Virgo → Laniakea → Coma → 950 Mpc → Boötes → 8.3 Gpc → 29 Gpc → home; webShowcase, 3 beats at 0.15, 4.7 and 0.28 Mpc. demo is dev-only.
- Featured cards (77 across 7 hand-ordered tabs): Highlights 16 · Solar System 15 · Missions 8 · Milky Way 12 · Galaxies 15 · Deep Space 9 · Tours 2. 65 focus, 10 exhibit, 2 tour. The tab order is already a scale ladder in all but name.
- Focus framing distances are derived, so a card's arrival range is computable: bodies 4.33 R; galaxies max(8 D, 150 kpc); structures 0.787 R capped at 800 Mpc; Milky Way 150 kpc; Sgr A* 30.4 Schwarzschild radii.
- Takeovers: tours and exhibits capture and restore the scene (`withSceneSnapshotSaga`); clips do not. `mergeSettingsSnapshot` replaces whole clusters.

### Discrepancies found on the way

- `docs/backlog/2026-07-24-filaments-flow-scale-bands.md` names `SCALE_FADE_BANDS` rows that moved into Layer bands, and `src/layers/filaments/`, now `cosmicWebFilaments`. Its claim stands.
- `scaleBar.ts:35` says the legend targets 150 px; `runFrame.ts:53` uses 120.
- `solarSystemLabelMaxDistance.ts` docblock says `labelsNearPass` ANDs the gate; the cut lives in `captionFadeRules.ts:43-44`.
- `produceMilkyWayLabel.ts:22` uses a 30 kpc diameter; the disc uses 35 kpc.
- `docs/BACKLOG.md:41` names a palette `RUN_ACTION` that no longer exists (`actionsForPaletteAction`).
- `docs/tour/script.md` `distance_mpc` values disagree with the beat code.

---

## The regime model (proposal)

### What a regime is

A **regime** is a named rung on the scale ladder: a window of the **range** the scale bar already measures (`altitudeMpc`: camera to the pivot surface when the pivot is a body, else to the pivot). It names where the person is on the Powers-of-Ten axis. It is not a gate: nothing draws or hides because of a regime. Under R1, what is relevant comes from the band values; the regime only names, groups and offers.

Why range and not the bands' own quantity (distance from the origin): at home the camera is 27,600 km from Earth and 1 AU from the Sun. Range says "planet"; origin distance says "solar system". The person is looking at a planet. Range is also the number the scale bar prints, so the ladder and the legend cannot disagree.

Why not a new quantity: both numbers already exist per frame. The regime adds one lookup and one dedup dispatch beside `engineScaleChanged`.

### Contracts

```ts
// src/@types/regime/RegimeId.d.ts
export type RegimeId =
  | 'surface' | 'planet' | 'solarSystem' | 'stars'
  | 'galaxy' | 'localGroup' | 'cosmicWeb' | 'horizon';

// src/@types/regime/Regime.d.ts
export type Regime = {
  readonly id: RegimeId;
  /** Sentence case, as printed on the ladder. */
  readonly label: string;
  /** Range window, Mpc, [enter, leave). Rows are contiguous and ascending; a test asserts it. */
  readonly rangeMpc: readonly [number, number];
  /** Where "go to this rung" flies. A destination the rung is known for. */
  readonly landmark: PaletteAction;
};

// src/data/regimes/regimes.ts — the one new data file. Ordered ascending.
export const REGIMES: readonly Regime[];

// src/state/engine: beside engineScaleChanged, deduped on id.
engineRegimeChanged({ id: RegimeId })
selectRegime(state): RegimeId
```

Hysteresis lives in the engine-side resolver, in log space: a rung is entered when the range crosses its edge and left only when the range moves a fixed fraction of a decade back past it (proposal: 0.15 decades, so an edge at 2 kpc releases at ≈ 1.4 kpc going in and ≈ 2.8 kpc going out). The panel never reflows while the pointer is inside it; the pending regime applies on pointer leave.

### Proposed rungs

Edges sit on constants the engine already keys on where one exists; the other two are judgment calls, marked.

| id | label | range window | edge anchored to | what is in view (from the ladder) |
|---|---|---|---|---|
| surface | Surface | < 1,000 km | readout m → km | terrain tiles, cloud deck (3–478 km altitude), Earth scenes, rover sites, craft at mesh scale |
| planet | Planet | 1,000 km – 0.05 AU | judgment: above every body framing (Jupiter 303,000 km), below the Sun's 0.02 AU and the first light-minute shell | bodies, rings, atmospheres, moons' orbits, body labels, 1 ls light-time shell |
| solarSystem | Solar system | 0.05 AU – 1,000 AU | `solarSystemSky` goneAt; 1.5× is the sky-bake release | planets as glints (backdrop dissolves 60–300 AU), orbit trails, mission trails, Voyager cruise, light-minute to light-day shells; at Sgr A*: the lens (100–500 AU) and S-star trails |
| stars | Stars | 1,000 AU – 2 kpc | `SURVEY_DEEP_ZOOM.in[0]`; the solar-neighbourhood extent is 2.3 kpc | seeded stars, constellations (out 1–10 kpc), Local Bubble (in 0.4–1 kpc), the galactic structures (open clusters, nebulae, globulars; rings by apparent size, out only at 35–230 kpc), light-year shells, star captions; the Milky Way disc starts at 200 pc |
| galaxy | Galaxy | 2 kpc – 230 kpc | `FOREGROUND_MAX_DISTANCE_MPC` (the NEAR0 hard gate) | Milky Way disc, Milky Way places (globulars, open clusters, nebulae, Galactic Centre), Zone of Avoidance fading in (35–175 kpc), Gaia fading out (8–25 kpc), "You are here" fading in |
| localGroup | Local group | 230 kpc – 3 Mpc | judgment: between the famous-galaxy framings (150–400 kpc) and Virgo's 4.7 Mpc; "You are here" is gone at 2 Mpc, the Milky Way cloud at ≈ 2.3–3.4 Mpc | famous galaxies at framing, galaxy-group rings, Zone of Avoidance at full, the Milky Way as a cloud, 1–10 Mly shells |
| cosmicWeb | Cosmic web | 3 Mpc – 300 Mpc | judgment: Laniakea 63, Coma 24, Boötes 39, the cosmicWeb exhibit 251 all sit inside; the horizon shell starts at 715 | survey points, cluster / supercluster / void rings, density, filaments, flow (R2), 10 Mly–1 Gly shells |
| horizon | Horizon | > 300 Mpc | readout Mpc → Gpc at 1,000; horizon shell 715 → 5,720 | milliquas, DESI, the horizon shell, the observable-universe exhibit |

### Who registers what: nothing registers

The brief asked how Layers, guides and destinations "register within" a regime. The answer that keeps one source of truth is that they do not. Each kind already carries the number the regime is read off:

| kind | regime is read from | needs anything new? |
|---|---|---|
| Layer show entry, label entry | its band value at the current camera (R1); the static map below is the same reading taken at each rung's representative range | bands on the six Layers that have none (below) |
| toggle, slider, select in a Layer section | the entry its cluster switches | no |
| Labels & guides row | the label entry (inherits `of`) | no |
| exhibit | `pose.distance` or `fitRadiusMpc` → rung; a hold-driven exhibit has neither | `regime?: RegimeId` on `Exhibit`, only for hold kinds (today: Voyager) |
| tour | its opening beat's pose → rung | no |
| featured card | `focus` → framing distance → rung; `exhibit` → the exhibit's rung; `tour` → the tour's rung | no; the seven tabs become derivable (Q6) |
| Display, Camera, Tier | none: device and input, not scale | no |

Band gaps that R1 turns into work (ground preparation candidates):

| Layer | today | band to declare |
|---|---|---|
| flow | **done** (this branch): `SURVEY_DEEP_ZOOM` on the entry | outer edge still to decide |
| cosmicWebFilaments | **done** (this branch): `SURVEY_DEEP_ZOOM` on the entry | outer edge still to decide |
| starCatalog | `sStarTrails` **done** (this branch). `starCatalog` keeps its two pass gates: the entry carries `bodies`, and scene-body admission runs once per frame with no view, so it cannot read a band (`appVisibility.test.ts` pins it) | admission needs a view-aware reading before the star catalog can declare its band; the panel's star rows read the gate until then |
| body (orbit trails) | **done** (this branch): `FOREGROUND_RECEDE` on `orbitTrails`; the group's value now carries the band | |
| missions (trails, craft labels) | **done** (this branch) for the trails; the 9.2 kpc caption cut stays | |
| blackHoles | hard gate; lens 100–500 AU from the GC; no show entry at all | a show entry needs a switch (`settings.blackHoles.items[id].enabled`) that does not exist; whether the Sgr A* marker becomes toggleable is a design question, so its two gates stay |
| lightTime | per-sphere ratio windows in a derived liveness | entry-level "any shell live", or a band per shell |
| earthScenes | no `visibility` member | a show entry with a surface-scale band |
| galaxyCatalog `famousGalaxy` | exempt from `deepZoom` on purpose | keep exempt for the draw; the panel row needs its own reading (Q8) |

Declaring the foreground gate as bands is the same un-braid #912 did for toggles: core then skips those passes from one value, and the 18 hand-written checks go. No new contract member: `visibility.bands` already is the contract (`in`, `out`, `from`, `items`), and `from: 'galactic-centre'` covers the Sgr A* bodies. An origin band is also tighter than the gate where the two differ. It is a prep PR candidate for `refactor-ground`, not part of the panel.

---

## The map: every control and destination by regime

Legend: ● the band is full somewhere inside the rung · ◐ the band only fades inside the rung, never full · ○ out of range · **?** no band today, reads as "everywhere" under R1 until the band above lands. Read with the camera near the origin, except rows marked GC (Galactic Centre anchor). A static reading of a live value: at runtime the panel reads the band itself.

### Layer sections and their rows

| control (section › row) | switches | Surface | Planet | Solar sys | Stars | Galaxy | Local group | Cosmic web | Horizon |
|---|---|---|---|---|---|---|---|---|---|
| Galaxies › 2MRS, SDSS, GLADE, Milliquas, DESI ×3 | `survey` items | ○ | ○ | ○ | ○ | ◐ | ● | ● | ● |
| Galaxies › Famous | `survey:famousGalaxy` | ? | ? | ? | ? | ● | ● | ● | ◐ |
| Galaxies › Advanced (6 sliders, select) | follow `survey` | ○ | ○ | ○ | ○ | ◐ | ● | ● | ● |
| Stars › Famous, Gaia, Sun, S-Star | `starCatalog` items | ● | ● | ● | ● | ● (gone by 25 kpc) | ? | ? | ? |
| Stars › S-Star (GC) | `starCatalog:sStar` | ○ | ● GC | ● GC | ◐ GC | ○ | ? | ? | ? |
| Stars › Advanced (2 sliders) | follow `starCatalog` | ● | ● | ● | ● | ● (gone by 25 kpc) | ? | ? | ? |
| Cosmic web density › MCPM, Polyphorm, Workbench | `cosmicWebDensity` items | ○ | ○ | ○ | ○ | ◐ | ● | ● | ● |
| Cosmic web filaments › master, Intensity | `cosmicWebFilaments` | ? | ? | ? | ? | ? | ? | ● | ◐ |
| Flow › master, Intensity | `flow` | ? | ? | ? | ? | ? | ? | ● | ◐ |
| Structures › Galaxy clusters, Superclusters, Voids, Galaxy groups | `structureRing` cosmic items | ○ | ○ | ○ | ○ | ◐ | ● | ● | ◐ |
| Structures › Open clusters, Globulars, Nebulae, Galactic Centre | `structureRing` Milky Way items | ● | ● | ● | ● | ● (to 35 kpc) | ○ | ○ | ○ |

### Labels & guides rows

| row | entry | Surface | Planet | Solar sys | Stars | Galaxy | Local group | Cosmic web | Horizon |
|---|---|---|---|---|---|---|---|---|---|
| Famous Galaxies | `label:famousGalaxy` | ? | ? | ? | ? | ● | ● | ● | ◐ |
| Galaxy clusters, Superclusters, Voids, Galaxy groups | `label:structure` cosmic | ○ | ○ | ○ | ○ | ◐ | ● | ● | ◐ |
| Open clusters, Globulars, Nebulae, Galactic Centre | `label:structure` MW | ● | ● | ● | ● | ◐ | ○ | ○ | ○ |
| Milky Way ("You are here") | `label:milkyWay` | ○ | ○ | ○ | ○ | ◐ | ● | ○ | ○ |
| Famous Stars, Sun | `label:starCatalog` | ● | ● | ● | ● | ◐ | ○ | ○ | ○ |
| Planets, Earth | `label:body` | ○ | ● | ● | ◐ | ○ | ○ | ○ | ○ |
| Galactic Centre (Sgr A*) | `label:blackHole` | ○ | ● GC | ● GC | ● GC | ◐ | ○ | ○ | ○ |
| Spacecraft | `label:missions` | ● | ● | ● | ◐ | ○ | ○ | ○ | ○ |
| S-star trails | `sStarTrails` | ○ | ● GC | ● GC | ○ | ○ | ? | ? | ? |
| Mission trails | `missionTrails` | ◐ | ● | ● | ◐ | ○ | ? | ? | ? |
| Zone of Avoidance | `zoneOfAvoidance` | ○ | ○ | ○ | ○ | ● (from 175 kpc) | ● | ◐ | ○ |
| Local Bubble | `localBubble` | ○ | ○ | ○ | ● (from 1 kpc) | ● (to 4 kpc) | ○ | ○ | ○ |
| Light-time spheres | `lightTime` | ○ | ● | ● | ● | ● | ● | ● | ● |
| Constellations | `constellations` | ● | ● | ● | ● | ◐ | ○ | ○ | ○ |
| Orbit trails | `orbitTrails` | ○ | ◐ | ● | ◐ | ○ | ? | ? | ? |

### Core sections

| section | regime | proposal |
|---|---|---|
| Display › Orientation | all | stays; it is a frame choice, not a scale one |
| Display › Tone curve, Exposure, Bloom, HDR, Field of view | all | stays, collapsed by default; renames per the copy rules |
| Display › Earth (3 shader sliders) | Surface, Planet with Earth focused | move to the debug slot (Q7) |
| Camera controls | all | stays, collapsed |
| Tier chip | all | stays in the header: it is a data budget |

### Exhibits and tours

| destination | arrival range | rung | note |
|---|---|---|---|
| Solar System (exhibit) | 42 AU | Solar system | |
| The Voyager missions (exhibit) | hold-driven, ≈ 220 AU | Solar system | needs the `regime` override |
| Cosmic Flows (exhibit) | 140 kpc | Galaxy | its subject is Cosmic-web scale; the pose frames the Milky Way with the flow around it (Q5) |
| Zone of Avoidance (exhibit) | 1.2 Mpc | Local group | |
| Cosmic Web (exhibit) | 251 Mpc | Cosmic web | |
| Observable Universe (exhibit) | ≈ 29 Gpc | Horizon | |
| The Long Way Out (tour) | opens at 100 Mpc, settles at 150 kpc | Galaxy | passes every rung from Galaxy out |
| Named Cosmic Web (tour) | 150 kpc | Galaxy | |

### Featured cards by rung (derived from framing)

| rung | cards |
|---|---|
| Surface | Hubble (20 m), Voyager 1 and 2 (7 m), the four rovers (~10 m), the 18 Earth places (1.5–12 km) |
| Planet | all 15 Solar System tab bodies (1,000–303,000 km), Sun (0.02 AU), the 11 star cards (0.003–15 AU) |
| Solar system | Sgr A* (2.6 AU), the Solar System and Voyager exhibits |
| Stars | none today. The data has the Milky Way places (open clusters, nebulae, globulars, the Galactic Centre cluster), and no card, exhibit or tour targets any of them |
| Galaxy | Milky Way (60 kpc), Cosmic Flows exhibit, both tours |
| Local group | all 15 Galaxies tab cards (150–400 kpc), Local Group (0.74 Mpc), M81 Group (0.83), Zone of Avoidance exhibit |
| Cosmic web | Virgo (4.7), Coma (24), Boötes (39), Laniakea (63), Cosmic Web exhibit (251) |
| Horizon | Observable Universe exhibit |

Two readings of this table matter for the design. A focus on a small body lands at Surface scale: at 20 m from Hubble the relevant toggles really are none of the galaxy ones, and the regime is honest about it. And the Stars rung has no destination at all, which the ladder makes visible for the first time; a landmark is needed before the rung can be offered (Q4).

---

## What the model enables (sketch, not the spec)

The ladder itself is the element. The scale bar today is a 120 px legend; the ladder is the same measurement drawn as a vertical log ruler with eight named rungs, the current one lit and labelled with the live range. It is navigation as much as readout: a rung is a button that flies to its landmark, so "explore deeper in" and "further out" are the rungs above and below, and dragging along it zooms. Under it, three groups, each derived:

1. **In view** — the toggles whose entries are in range, on and off alike. Nothing else. A collapsed "Everything" row is the escape hatch and lists the rest greyed with the range they appear at.
2. **Explore** — exhibits, tours and cards at this rung, then the neighbouring rungs' landmarks.
3. **Adjust** — the sliders of the in-view Layers, collapsed. Display and Camera below, collapsed.

The phone's Layers sheet and the palette's featured tabs would both read from the same derivation (Q6). Layout, states and copy belong to the spec and the `ui-ux.md` design brief.

---

## Open questions

The first twelve were put in chat before the sweep; Q1 and Q4 of that set are answered by R1. Numbered afresh here.

## Q1: Whose job is this?

**The question:** Explorer discovering what exists, or presenter who needs stable controls?

**Considerations:** A context-aware panel helps the first and hurts the second unless the hysteresis, the pointer-hold rule and the "Everything" escape hatch are in from the start. The answer sets how aggressive the filtering may be.

**Decision:** open.

## Q2: What happens to a control that leaves range?

**The question:** Vanish, grey out with the range it returns at, or move down?

**Considerations:** `ui-ux.md` Interaction 1 and 4 (state on screen, every action has a way back). Vanishing fails both. The sketch above greys and groups under "Everything".

**Decision:** open; proposal is grey + range note.

## Q3: Range or origin distance as the rung axis?

**The question:** The bands measure distance from the origin or a region anchor; the scale bar measures range to the pivot. Which does the regime read?

**Considerations:** Range matches what the person sees and what the legend prints (home reads "Planet"). Origin distance matches the bands but calls home "Solar system". The two coincide away from a focus.

**Decision:** open; proposal is range.

## Q4: The rung edges, and the empty Stars rung

**The question:** Accept the eight rungs and the two judgment edges (0.05 AU, 3 Mpc)? And what is the Stars rung's landmark, given no card or exhibit lands there?

**Considerations:** Candidates for Stars: a Sun focus pulled back to 1 pc; a Local Bubble exhibit (the Layer exists, off by default); a constellations exhibit (backlog `constellation-interactivity`); a focus on one of the galactic structures already in the structure Layer (the Pleiades, the Orion Nebula, Omega Centauri), none of which has a card today. The Milky Way card's capture at 60 kpc is Galaxy, not Stars.

The Stars rung is also the widest, 5.6 decades from 1,000 AU to 2 kpc, against about 2 for Galaxy and Cosmic web. The Local Bubble (full 1–4 kpc), the disc's onset (200 pc) and the Gaia crowd all sit in its upper decade. A split at about 100 pc into "Nearest stars" and "Neighbourhood" would give the Local Bubble a rung of its own as that rung's guide and landmark; nine rungs instead of eight.

**Decision:** open.

## Q5: Cosmic Flows lands at the Galaxy rung

**The question:** The exhibit's pose is 140 kpc from the Milky Way, so by range it is a Galaxy-rung destination, yet it shows the Cosmicflows field at tens of Mpc.

**Considerations:** Either the pose is right and the exhibit is offered at Galaxy (it starts there), or the exhibit's regime is overridden to Cosmic web, or the pose moves out. The override exists for hold-driven exhibits anyway.

**Decision:** open.

## Q6: Which surface dies?

**The question:** The palette's seven featured tabs are the rungs by another name; the phone's Layers sheet is the panel. Does the panel's Explore group replace the featured grid, or derive the tabs from the rungs and keep both?

**Considerations:** `ui-ux.md` Interaction 7, one tool per job. Keeping both with one derivation is defensible if the palette is "search and browse everything" and the panel is "here". Keeping both hand-curated is not.

**Decision:** open.

## Q7: What leaves the panel entirely?

**The question:** The calibration knobs (Galaxies › Advanced, Earth shaders, HDR knee/headroom, OpenSpace friction) are relevant by range but not by person. Move them to the debug slot before the context work, so the panel the regime filters is already the user's panel?

**Considerations:** Deletion beats addition; the DebugPanel is reachable in production today, so nothing is lost. The `settings-panel-polish` backlog item asked the same question.

**Decision:** open; proposal is yes, as the first prep commit.

## Q8: Famous galaxies in the panel

**The question:** `survey:famousGalaxy` is exempt from the deep-zoom band so the landmarks stay drawn at star scales. Under R1 its toggle then reads as relevant at Earth's surface. Give the panel row its own band (the entry keeps drawing as today), or accept it?

**Decision:** open.

## Q9: The foreground gate as bands

**The question:** Make the six band-less Layers declare bands (table above), and let core skip the NEAR0 passes from the handed value instead of 18 `cam.distance` checks?

**Considerations:** It is a prep refactor in `refactor-ground`'s sense: behaviour-neutral, deletes code, and the panel cannot be honest without it. It is also the largest piece of ground.

**Decision:** open; sequence and separate-PR question for the checkpoint.

## Q10: Success measure

**The question:** What number says the cleanup worked?

**Considerations:** Controls visible at the Earth home view and at the Virgo view, before and after. From the map: at home today 77; under R1 with the bands landed, roughly Stars (4 + 2), Milky Way structures (4), constellations, orbit trails, mission trails, body and star labels, light-time, Display and Camera: about 25.

**Decision:** open.

---

## Backlog items this touches

- `docs/backlog/2026-07-22-settings-panel-polish.md` — folded in or superseded.
- `docs/backlog/2026-07-24-filaments-flow-scale-bands.md` — prerequisite (R2); its text is stale (see Discrepancies).
- `docs/BACKLOG.md` "Settings row order is source-code order" — the regime map gives the order.
- `docs/backlog/2026-10-11-exhibits-into-layers.md` — an exhibit's rung derives from data it already carries either way.
- `docs/backlog/2026-07-24-scale-gated-asset-demand.md` — the same "in range" reading on the fetch side.
- `docs/backlog/2026-10-19-band-debug-panel.md` — the "Everything" row with range notes is most of this.
- `docs/backlog/2026-10-10-view-insets-lens-shift.md` — the ladder is one more panel to register.
- `docs/BACKLOG.md` "Cosmic-zoom plan review" — the ladder is the Powers-of-Ten walkthrough's spine.
