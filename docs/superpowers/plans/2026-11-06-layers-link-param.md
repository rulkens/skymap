# `layers=` link parameter

**Goal.** A shared link carries layer and caption switches, so the website's "Open this view" links come back for
every shot that switches a layer on or off.

**Design (approved in chat 2026-11-06, no spec — small change).**

- A hash row `layers`, **read-only** like `pose`: it writes nothing to the address bar, the arrival's replace drops
  it, and an absent `layers` leaves every switch alone (`readAbsent: []`), on arrival and on Back. `deepLink: false`.
- Value: comma-separated tokens applied **left to right**. `name` switches on, `-name` switches off. A name is a
  tour-cue visibility address: a bare show key (`flow`, `survey`), a scoped item (`survey:desiWedge`), a caption
  (`label:structure`) or a scoped caption (`label:blackHole:sgr-a-star`). Writes go through
  `setVisibilityActionsFor`, so a bare per-item name writes the section switch where the cluster has one, else every
  item. Link switches snap (`overMs: 0`), as a link's orientation does.
- An unknown name or item is dropped with a `console.warn`; the rest still apply. The site build reports it.
- The `l`-key / DebugPanel share URL (`shareUrlFor`) adds `layers=` with every switch that differs from
  `INITIAL_SETTINGS`: a section/whole-entry difference as the bare name, an item difference as `name:item`, no
  collapsing, registry order. A default view adds nothing.
- Website: one function turns a shot's settings into tokens; the shot runner opens that address and drops its own
  switch branches, so the published link is exactly the address the picture was shot from. `UNLINKABLE_LAYERS`,
  `requireShotLink` and the "no link" path go. hide\* settings ride as `-` tokens; exposure, fov, ambient, passes and
  every UI setting stay runner-only.

## Ground preparation

From `refactor-ground` (2026-11-06; greenfield cross-check run, spelling divergence ruled for tour-cue names). Two
prep commits, sequenced first, same PR:

1. `applyLinkClockAndFrameSaga` → `applyLinkSettingsSaga`: it already lands everything a link says besides the view;
   layers join it, and the old name would lie.
2. One `shotHash(shot)`: today three readers take `shot.link` raw (`tools/site/utils/siteShotUrl.ts:20`,
   `packages/website/src/utils/shotLink.ts`, `tools/site/utils/pressCredits.ts:31`); once tokens ride the address
   they must agree, so they route through one function first.

Everything else is growth: a table row, an optional `LinkIntent` field, three `utils/url/` files, one `params.set` in
`shareUrlFor`, one check in `appViewProblem`, one docs row.

Rulings: no perf gate (no per-frame work); one plan, serial dispatches.

---

### Task 1 (prep): rename the link-settings saga

**Files:** `src/state/navigation/applyLinkClockAndFrameSaga.ts` → `src/state/navigation/applyLinkSettingsSaga.ts`,
`src/state/navigation/navigateSaga.ts`, `src/state/arrival/arrivalSaga.ts`, any test mirror.

- [x] `npm run move-files -- src/state/navigation/applyLinkClockAndFrameSaga.ts src/state/navigation/applyLinkSettingsSaga.ts`
      (`--dry` first), then `npm run refactor -- rename` the function `applyLinkClockAndFrameSaga` →
      `applyLinkSettingsSaga` (see `.claude/skills/refactor/SKILL.md` for the exact CLI). No hand-edited imports.
- [x] Header: "lands what a link says besides the view" — today `t` and `orientation`. Grep for the old name
      (comments in `navigateSaga.ts`, `arrivalSaga.ts`, `watchHashSaga.ts`) and fix the prose.
- [x] No new test (a rename). Commit.

### Task 2 (prep): one function for a shot's app address

**Files:** `packages/website/src/utils/shotHash.ts` (new), `packages/website/src/utils/shotLink.ts`,
`tools/site/utils/siteShotUrl.ts`, `tools/site/utils/pressCredits.ts`, `tests/packages/website/shotLinks.test.ts`.

**Signature:** `shotHash(shot: Pick<SiteShot, 'link' | 'settings'>): string` — the hash body (no `#`) the app opens
for this shot. In this task it returns `shot.link` unchanged.

- [x] `shotLink` returns `shotHash(...)` where it returned `link`; `siteShotUrl` builds `#${shotHash(shot)}` (the
      `tourStep` bare-address rule stays for now); `pressCredits` passes `shotHash(shot)` to `appLink`.
- [x] `shotLinks.test.ts` "only the gate reads a shot's link": the gate becomes `utils/shotHash.ts`.
- [x] Behaviour unchanged, no new test. Commit.

### Task 3: the layer-switch codec — `review: yes`

**Files:** `src/@types/url/LayerSwitch.d.ts`, `src/@types/url/LayerSwitchParse.d.ts`,
`src/utils/url/parseLayerSwitches.ts`, `src/utils/url/encodeLayerSwitches.ts`,
`src/utils/url/layerSwitchesFrom.ts` (all new), tests mirrored under `tests/utils/url/`.

**Contract:**

```ts
export type LayerSwitch = {
  readonly address: VisibilityAddress | ScopedVisibilityAddress;
  readonly on: boolean;
};
export type LayerSwitchParse = {
  readonly switches: readonly LayerSwitch[];
  /** Tokens naming no composed entry, or an item the entry does not list, as written. */
  readonly unknown: readonly string[];
};

parseLayerSwitches(value: string): LayerSwitchParse;
encodeLayerSwitches(switches: readonly LayerSwitch[]): string; // '' for none
layerSwitchesFrom(settings: EngineSettingsState, baseline: EngineSettingsState): readonly LayerSwitch[];
```

- Parse: split on `,`, skip empty tokens silently, a leading `-` means off. A token is valid when its bare part is
  `visibilityAddressOf` some `APP_VISIBILITY_REGISTRY` entry (`src/utils/visibility/visibilityAddressOf.ts`) and, if
  scoped, its item is in that entry's `items`. The address grammar is the one `setVisibilityActionsFor` splits
  (`src/utils/visibility/setVisibilityActionsFor.ts:25-30`); don't fork a second reading of it.
- Diff: walk `APP_VISIBILITY_REGISTRY` in order; per entry, compare its **raw** stored switches (show → `enabled`,
  label → `labelEnabled`): the cluster-level one when the entry has no items or (show entry) its cluster has a
  section switch (`hasSectionSwitch`), then each listed item's own field. Raw, not `visibilitySwitchOf` — that ANDs
  the section in, which would turn one section difference into N item differences. A difference emits
  `{ address, on: current }` (bare for cluster level, `name:item` for an item).

Tests (`tests/utils/url/`):

- [ ] `parseLayerSwitches reads on, off, scoped and caption tokens in order` —
      `'flow,-starCatalog,survey:desiWedge,-label:structure'` → four switches, that order, `unknown: []`.
- [ ] `parseLayerSwitches drops unknown names and unknown items, keeping the rest` —
      `'flow,nope,survey:nope,,-label:nope'` → one switch (`flow`), `unknown: ['nope', 'survey:nope', '-label:nope']`.
- [ ] `layerSwitchesFrom is empty for the boot settings` — `(INITIAL_SETTINGS, INITIAL_SETTINGS)` → `[]`.
- [ ] `layer switches round-trip through the link` — build a state from `INITIAL_SETTINGS` with the settings reducer
      and `setVisibility` writes covering: a whole-entry switch on (`cosmicWebFilaments`), a section switch off
      (`starCatalog`), an item on (`survey:desiWedge`), a caption off (`label:structure`). Encode its diff, parse it,
      apply each switch via `setVisibilityActionsFor` + `settingsReducer` onto `INITIAL_SETTINGS`; the result's
      `layerSwitchesFrom` equals the original's, and is non-empty.
- [ ] Commit.

### Task 4: the `layers` row and its apply — `review: yes`

**Files:** `src/@types/url/LinkIntent.d.ts`, `src/state/url/hashParamSources.ts`,
`src/state/navigation/applyLinkSettingsSaga.ts`, `tests/state/url/hashParamSources.test.ts`,
`tests/state/url/hashHistoryIntegrity.test.ts` (or `watchHashReadSaga.test.ts`, whichever already boots a hash
through the arrival).

- `LinkIntent` gains `readonly layers?: readonly LayerSwitch[]`.
- Row `layers`, appended at the end of `HASH_PARAM_SOURCES`: `deepLink: false`, `writesOn: []`,
  `write: () => null`, `readAbsent: () => []`. `read` parses; each unknown token is one `console.warn` (the `pose`
  row's form, `hashParamSources.ts` `poseSource`); returns `{ layers }` only when there is at least one switch.
  Docblock in the table's voice: why read-only (a writing row's `writesOn` would need every Layer's own setter, a
  `settings/*` prefix is a slider-rate stream, and Back would undo checkbox clicks), why absent means "leave alone".
- `applyLinkSettingsSaga`: after `t` and `orientation`, for each switch in order put
  `setVisibilityActionsFor(settings, address, on, 0)` with `settings` selected once (the section-switch question is
  structural, so one read serves the list). Arrival and `navigateSaga` both call it; applying twice is idempotent.

Tests:

- [ ] `hashParamSources`: `layers read contributes its switches and nothing for an all-unknown value`.
- [ ] Integration: `a cold link's layers land before the reveal and leave the address` — boot
      `#focus=body-saturn&layers=cosmicWebFilaments,-starCatalog`: filaments on, star catalogue section off, and the
      settled address is `#focus=body-saturn` written by replace (no push).
- [ ] Integration: `a hash change without layers leaves the switches alone` — then navigate to `#focus=body-mars`:
      filaments still on, stars still off.
- [ ] Commit.

### Task 5: the share URL writes `layers`

**Files:** `src/state/url/shareUrlFor.ts`, `tests/state/url/shareUrlFor.test.ts`.

- [ ] `shareUrlFor` sets `layers` from `encodeLayerSwitches(layerSwitchesFrom(state.settings, INITIAL_SETTINGS))`
      when non-empty; header gains one clause.
- [ ] Test `share URL carries the switches that differ from boot, and none on a default view` — default state → no
      `layers` param; with filaments on and the star catalogue off → `layers=-starCatalog,cosmicWebFilaments`
      (registry order: `starCatalog` precedes `cosmicWebFilaments` in `APP_VISIBILITY_REGISTRY`).
- [ ] Commit.

### Task 6: the site checks and documents `layers`

**Files:** `tools/site/utils/appViewProblem.ts`, `tests/tools/site/resolveSiteLink.test.ts` (or a new
`tests/tools/site/utils/appViewProblem.test.ts` if the cases fit better there), `packages/website/src/data/docsUrlParams.ts`,
`packages/website/src/content/docs/reference/url-parameters.mdx`, `packages/website/src/data/docsReferenceFacts.ts`
(`:175`, `:207`).

Read `docs/superpowers/conventions/ui-ux.md` (copy rules) before writing site prose.

- [ ] `appViewProblem` returns `the app reads no layer "<token>"` for the first unknown token of a `layers` value
      (one call to `parseLayerSwitches`). Test: `appViewProblem names an unknown layer and passes a known list`.
- [ ] `DOCS_URL_PARAMS` gains the `layers` row (value, example `layers=cosmicWebFilaments,-starCatalog`, does,
      unknown, `skipsWelcome: false`) at the position matching the table. `docsReference.test.ts` already fails
      until it exists.
- [ ] `url-parameters.mdx` gains a `## Layers` section: the token forms (name, `-name`, `name:item`,
      `label:name`), left-to-right order with the `-survey,survey:famousGalaxy` example, and the names listed from
      `APP_VISIBILITY_REGISTRY` through a new export in `docsUrlParams.ts` (never typed by hand). One `<Example>`.
- [ ] Facts: `:175` — the app never writes `pose` or `layers` into its address; `:207` — `layers` alone, like
      `orientation`, shows the welcome screen.
- [ ] Commit.

### Task 7: website shots carry their switches on the link

**Files:** `packages/website/src/utils/shotLayerSwitches.ts` (new), `packages/website/src/utils/shotHash.ts`,
`packages/website/src/utils/shotLink.ts`, `packages/website/src/utils/requireShotLink.ts` (delete),
`packages/website/src/data/unlinkableLayers.ts` (delete), `tools/site/utils/siteShotActions.ts`,
`tools/site/utils/siteShotUrl.ts`, `packages/website/src/@types/SiteShotSettings.d.ts` (header and per-key docs),
the call sites from commit `c60f59508` (`git show --stat c60f59508`), `tests/packages/website/shotLinks.test.ts`.

**Signature:** `shotLayerSwitches(settings: SiteShotSettings): readonly LayerSwitch[]`, in the order
`siteShotActions` dispatches today (hides first, then switch-ons):

| Setting | Switches |
| --- | --- |
| `hideOrbitTrails` | `-orbitTrails` |
| `hideStructures` | `-structureRing` |
| `hideStructureLabels` | `-label:structure` |
| `hideGalaxyField` | `-survey`, `survey:famousGalaxy` |
| `hideStars` | `-starCatalog` |
| `hideCosmicWeb` | `-cosmicWebDensity` |
| `hideZoneOfAvoidance` | `-zoneOfAvoidance` |
| `filaments` | `cosmicWebFilaments` |
| `constellations` | `constellations` |
| `missionTrails` | `missionTrails` |
| `flow` | `flow` |
| `desiWedge` | `survey:desiWedge` |
| `hideLabels` | `-label:famousGalaxy`, `-label:starCatalog`, `-label:structure`, `-label:milkyWay`, `-label:blackHole:sgr-a-star`; plus `-label:body`, `-label:missions` unless `keepBodyLabels` |

Check each `hideLabels` caption name against the label entries in `src/layers/*/visibility.ts` and against what
`tools/utils/capture/labelDeclutterActions.ts` switches today; a mismatch is a deviation to report, not to paper over.

- [ ] `shotHash` appends `layers=<encodeLayerSwitches(...)>` when there are switches (compose with
      `parseHashParams` / `composeHashParams`; the link may be empty). `siteShotUrl`'s `tourStep` case opens the
      `layers` part alone (the tour itself still starts from the runner).
- [ ] `siteShotActions` drops every branch the table covers; `hideLabels` keeps only the
      `CAPTURE_HIDDEN_PASSES` pass disables (`tools/utils/capture/hiddenPasses.ts`). `labelDeclutterActions` itself is
      untouched (other capture tools use it).
- [ ] `shotLink` always returns a string; delete `requireShotLink` and `unlinkableLayers.ts`; every caller from
      `c60f59508` drops its `undefined` handling, restoring the link it hid.
- [ ] `shotLinks.test.ts`: replace the first test with `the runner switches no layer or caption itself: every
      switch rides the link` — no `siteShotActions(shot)` action for any `SITE_SHOTS` row is a `setVisibility` or a
      `set…Enabled` / `set…Visible` with an on/off payload (keep the existing `switchesOn`-style matcher, widened to
      off). Keep the gate test.
- [ ] Commit.

### Task 8 (controller): verify the pictures and the links

- [ ] Dev server + linked data; reshoot `science-desi` (desiWedge + hides), `features-time-voyager`
      (`missionTrails` + `keepBodyLabels`) and `stories-web` (tourStep), and compare each with the committed picture; dash check per
      pair.
- [ ] Open three restored links in the app (one filaments, one desiWedge, one constellations); dash check each.

## Definition of Done

**Deliverables:** the `layers` row in `HASH_PARAM_SOURCES`; `LinkIntent.layers`; `parseLayerSwitches`,
`encodeLayerSwitches`, `layerSwitchesFrom`; `shareUrlFor` writing `layers`; `applyLinkSettingsSaga`;
`shotHash`, `shotLayerSwitches`; the URL parameters page's `layers` row and section; `UNLINKABLE_LAYERS`,
`requireShotLink` gone.

**Observable behaviours:**

- `#layers=cosmicWebFilaments,-starCatalog` on a cold load: filaments on, stars off, `layers` gone from the address.
- `#layers=-survey,survey:famousGalaxy,survey:desiWedge`: only the photographs and the wedge of the galaxy catalogues.
- Back to an entry without `layers` keeps the switches.
- `l` with filaments on logs a share URL containing `layers=cosmicWebFilaments`; on a default view, no `layers`.
- `#layers=nope,flow`: flow on, one console warning; the site build fails on a link carrying `nope`.
- Every site page that lost "Open this view" in pass 3 has it again, and each opens what its picture shows, bar
  exposure, field of view, ambient light and disabled passes.

**Deferred:** writing `layers` into the address bar; a `layer.*` all-items form; aliases for renamed names; exposure
or other non-switch settings on a link.
