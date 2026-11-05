# Search palette tabs and views — design

**Status:** draft for review, 2026-09-19. Branch `worktree-search-tabs`.
**Decisions:** [`docs/grill-sessions/search-palette-tabs-2026-09-18.md`](../../grill-sessions/search-palette-tabs-2026-09-18.md), Q1–Q20. Q19 reverses Q18: views are their own feature.
**Visual design:** [design canvas](https://claude.ai/code/artifact/71771eee-45d3-41f5-957a-01bd03d931fc), v14. The values that matter are copied into §4 so this spec does not depend on the canvas.

## 1. Purpose

With an empty query, the Cmd+K palette shows only 15 famous galaxies, so visitors never find the planets, moons, spacecraft, rovers, Sgr A* and the S-stars, large-scale structure, or tours. This feature turns the empty state into a tabbed, image-led browse surface that covers every scale. It also adds **views**: authored vantage points on things that are not selectable objects (the cosmic web, cosmic flows, the observable universe, the whole solar system), each with its own caption and notes. Search behaviour stays as it is today, apart from views and tours becoming findable by name.

## 2. Scope: three PRs, each useful on its own (Q16)

| PR | Contents | Ships |
|---|---|---|
| **PR1** | Prep P1 (`actionForRow`, §3.5), then the tab strip, `featuredTabs.ts`, focus cards, blurb + alias tooltip, text-only fallback tile, remembered tab, keyboard grid navigation | All tabs except Tours; Highlights without its view cards |
| **PR2** | `npm run capture-featured`: headless thumbnail capture, images committed to `public/images/featured/` | Real thumbnails for every focus card |
| **PR3** | Prep P2–P3 (§3.5), then `View` registry + `ViewOverlay`, `view`/`tour` card actions, Tours tab, Highlights view cards, view/tour search rows, copy-camera helper, capture of view cards | The full design |

Out of scope: a `#view=<id>` deep link (Q6), constellations (no focus target yet), the body-font rollout (its own PR, §4.3), and a coverage test for the curated lists (Q8).

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// PR1: data (types one per file under src/@types/palette/)
type PaletteTabId = 'highlights' | 'solarSystem' | 'missions' | 'milkyWay' | 'galaxies' | 'deepSpace' | 'tours';
type PaletteAction =
  | { kind: 'focus'; focusId: string }   // PR1
  | { kind: 'view'; viewId: ViewId }     // PR3
  | { kind: 'tour'; tourId: TourId };    // PR3
type PaletteCard = { id: string; label: string; blurb: string; image?: string; action: PaletteAction };
// image: an OVERRIDE only. The default is /images/featured/<id>.webp by convention; Galaxies cards set /images/famous/<famousId>.webp
type PaletteTab = { id: PaletteTabId; label: string; cards: readonly PaletteCard[] };
// src/data/palette/featuredTabs.ts: export const FEATURED_TABS: readonly PaletteTab[]
// ui slice: paletteTab: PaletteTabId   (initial 'highlights', not persisted)

// PR3: views
type CameraPose = { target: Vec3; yaw: number; pitch: number; distance: number };  // the `l`-key log's units
// CameraPose is the shared four fields lifted out of @types/perf/PerfPose; PerfPose = CameraPose & { rate?; clearFocus? }
type View = {
  id: ViewId; label: string; kicker: string; title: string; lede: string;
  pose: CameraPose; settings: SettingsPatch;
  notes: ViewNotes;                      // sections, optional ramp, facts, sources
  toggle?: ViewToggle;                   // { label, on: SettingsPatch, off: SettingsPatch }
};
// src/data/views/viewRegistry.ts: Record<ViewId, View>   (mirrors tourRegistry)
// src/state/takeover/: takeover.active: { kind: 'tour'; id: TourId } | { kind: 'view'; id: ViewId } | null
//   runTakeoverSaga(source, body): the ONE bracket (snapshot → started → body → restore → ended), under one takeLatest
// src/state/views/viewBody.ts (apply settings, fly, wait) · src/components/ViewOverlay/ViewOverlay.tsx
```

File list: PR1 changes `focusIdForRow` → `actionForRow` and `CommandPaletteContainer` (prep P1), touches `CommandPalette/{CommandPalette,FeaturedGrid,FeaturedCardTip,usePaletteSearch}.tsx`, adds `PaletteTabs.tsx` and `utils/{cardAliases,gridIndexStep,cardImageSrc}.ts`, and deletes `utils/resolveFeaturedEntries.ts`. PR3 adds the view files above, the takeover slice and bracket, and touches `App.tsx`.

### 3.2 Greenfield cross-check

A subagent that saw only the requirements, not the code, derived the shapes independently. It agreed on: a closed `PaletteAction` union as the palette's only output; views as their own registry and overlay rather than one-beat tours; a shared takeover primitive under tours and views; a derived "UI hidden" selector; an explicit `image` path on cards (narrowed by the §3.8 radar to an override on top of a convention path); view and tour search rows built from their registries rather than from cards. Where it differed from the code as it stands:

| Greenfield | Chosen | Why |
|---|---|---|
| Record each setting as it changes (first write wins per key) | Keep the whole-scene snapshot (`captureScene` / `restoreSceneSaga`) | The snapshot is taken before any change, so it already covers the in-view toggle. Per-key recording adds a concept with no payoff. |
| Flat search rows `{label, action}` | Keep the tagged `ScoredRow` union with lookup tables by kind | Only the output changes (focus id → `PaletteAction`); rewriting the ranker's row model buys nothing. |
| `cameraPoseRequested({pose, transition: 'fly' \| 'cut'})` | The cut is the existing `commitCameraPose`; the fly is a pose-addressed clip (§7.3) | Both halves exist. A new command would be a third path. |

### 3.3 Joint verdicts

| Touchpoint | Verdict | Blocker |
|---|---|---|
| Card → focus selection | Growth | none: `CommandPaletteContainer.tsx` `onSelect(focusId)` already fires `requestSelect` + `requestFocus` for any focus id |
| Tab data | Growth: replaces `FEATURED_IDS` | none |
| Tab state | Growth: a ui-slice field | none |
| Palette selection output | **Bolt-on** without prep | `CommandPalette/utils/focusIdForRow.ts` returns a focus id string. PR1's cards carry a `PaletteAction`, and PR3's view and tour rows have no focus id |
| View snapshot/restore and mutual exclusion | **Bolt-on** without prep | `src/state/tour/guidedTourSaga.ts` owns the snapshot → run → restore bracket inline, and `captureScene.ts`/`restoreSceneSaga.ts` live in the tour folder. A view would copy the bracket, and each saga would have to end the other |
| "Hide the UI" | **Bolt-on** without prep | `App.tsx:130` `uiHidden \|\| splashVisible \|\| tourActive`: a view would add the 4th hand-kept term |
| Capture pose | Growth | `commitCameraPose` (used by the perf hook's `setPose`) already cuts to a pose |

### 3.4 Priced decisions

- **Views as their own feature vs one-beat tours** (Q19). A one-beat tour ends by itself when its dwell clip runs out (`guidedTourSaga.ts:118`). It carries prev/next/pause nav, and `BeatCaption` has no room for sections, facts, sources or a toggle. Making tours act as views would need three branches on "is this a view". Chosen: its own feature.
- **One takeover slot vs separate flags** (Q19). One slot costs moving `tour.active` into `takeover.active`: 2 writes in `tourSlice`. `selectTourActive` is re-derived, so its 9 reader files don't change. In return, a tour and a view can't run at once, and "UI hidden" and Esc have one term each. Chosen: one slot.

### 3.5 Prep refactors (each its own commit, before the feature commits of its PR)

**PR1:**

- **P1. `focusIdForRow` → `actionForRow`.**
  - It returns `PaletteAction`; in PR1 the union has only `{kind: 'focus'}`, and every existing row kind maps to it.
  - `CommandPalette`'s `onSelect` takes a `PaletteAction`.
  - The container dispatches through one table keyed by `action.kind` (`focus` → `requestSelect` + `requestFocus`).
  - Behaviour unchanged. It lands in PR1 because PR1 introduces `PaletteAction` (radar finding 3), so the palette never has two selection types.

**PR3:**

- **P2. Move the scene snapshot helpers.** Move `captureScene`, `captureSettings`, `SceneSnapshot` and `restoreSceneSaga` from `src/state/tour/` to `src/state/scene/` with `npm run move-files`, then grep for the old paths. Behaviour unchanged.
- **P3. Takeover slice and bracket.** Add `src/state/takeover/` with `takeover.active`, the actions `takeoverStarted(source)` / `takeoverEnded()` / `exitTakeover()`, and `runTakeoverSaga(source, body)`.
  - **The one bracket:** `runTakeoverSaga` takes the snapshot, dispatches `takeoverStarted`, runs `body`, and in `finally` restores the snapshot, then dispatches `takeoverEnded` (skipped when the run was cancelled by a newer takeover, as `guidedTourSaga` does today).
  - **Mutual exclusion:** a single `takeLatest` over start requests (`startTour`, `openView`) runs the matching body under `runTakeoverSaga`. Starting any takeover cancels the one running, whose `finally` restores. Neither feature knows about the other.
  - **Tours move onto it:** `guidedTourSaga` is split into the bracket (moved into `runTakeoverSaga`) and a `tourBodySaga(tour, range)` (the beat loop plus its `exitTour` race, which becomes `exitTakeover`).
  - **Selectors:** `selectTourActive` becomes `takeover.active?.kind === 'tour'`, and `tour.active` is deleted. Add `selectTakeoverActive`; `App.tsx` hides the UI on `uiHidden || splashVisible || takeoverActive`.
  - **Behaviour unchanged:** the existing tour tests stay green, apart from those that read `tour.active` directly or dispatch `exitTour`.

### 3.6 Packaging

- P1 rides PR1 as its first commit.
- P2 and P3 ride PR3 as its first commits.
- PR2 needs no prep.

### 3.7 Adjacent findings (backlog, not in this feature)

- The Esc shortcut fires a hard-coded action list (`keyboardShortcuts.ts:54`: `clearSelection`, `exitTour`, `stopClip`). PR3 swaps `exitTour` for `exitTakeover`, which keeps the list the same length. Consolidating the list is its own backlog item.

### 3.8 Design-time entanglement radar (2026-09-19, all five applied)

1. **Each takeover orchestrated its own setup and teardown, and each knew about the other.** Fixed by `runTakeoverSaga` plus one `takeLatest` (P3, §7.2).
2. **The capture tool would have rewritten `image` in the hand-edited `featuredTabs.ts`.** Now the image is found by a convention path, `image` is only an override, and the tool writes only webp files (§5.1, §6).
3. **PR1 would have had two selection types** (card `PaletteAction` vs row focus id). Fixed by moving `actionForRow` (P1) into PR1.
4. **The grid's column count lived in TS and CSS.** Now the keyboard measures the rendered grid (§5.5).
5. **`CameraPose` duplicated `PerfPose`.** Now there is one `CameraPose` type, and `PerfPose` extends it.

## 4. Visual design

Canvas pages: **Current** (palette, `Main` artboard), **Cosmic Web view** (`V6` artboard), **Body type**.

### 4.1 Palette (Main artboard: contact sheet + serif tabs)

- **Panel:** unchanged from today.
- **Tab strip:** between the input and the grid. One row, scrolls sideways when it overflows (mobile, Q16), `border-bottom: 1px solid var(--border-default)`, tab gap 16px, padding `0 14px`.
- **Tab:** `600 16px/1 var(--font-family-display)`, padding `11px 0 8px`.
  - Inactive: `var(--color-fg-dim)`, with a transparent bottom border.
  - Active: `var(--color-fg)` with a 1px bottom border in `var(--color-accent-gradient-mid)`.
  - Each tab is a real `role="tab"` button in a `role="tablist"`.
- **Grid and card:** today's `FeaturedGrid` card, unchanged: square, name over a bottom gradient, 5 columns, gap `var(--space-3)`. **No scale chips.** A tab with more than 15 cards scrolls inside the panel, since Solar System has 26.
- **Text-only fallback tile** (Q8), for a card whose image fails to load (the `<img>` `onError`), for example a card that hasn't been captured yet:
  - 1px dashed `var(--border-default)` border.
  - Background: radial gradient from `rgba(60, 90, 140, 0.35)` at 50% 40% to `var(--surface-card-strong)` at 70%.
  - The label centred in `600 15px/1.05 var(--font-family-display)`.
- **Tooltip:** today's `InfoTip`, with the title set to the card label. The body is the alias line (when present), then the blurb. See §5.3.

### 4.2 View overlay (V6 artboard: notes on the scene, no card)

- **Screen treatment:** full screen, UI hidden (takeover). Two scrims:
  - a bottom-left vignette behind the caption;
  - a right-side vignette behind the notes.
- **Caption,** bottom-left (`left: 44px; bottom: 74px; max-width: 520px`, gap 14px, text-shadow `0 2px 16px rgba(0,0,0,0.85)`):
  - kicker "View", in the tour caption's kicker style;
  - title: Cormorant 48px;
  - lede: `italic 500 22px/1.3` Cormorant, `var(--color-fg)`.
- **Notes,** top-right (`top: 40px; right: 44px; width: 360px`), a column with gap 16px:
  - **Section:** header in Cormorant `600 24px/1.1` white, then body text 12px below it. Body text is Sora Thin (§4.3), `var(--color-fg-base)`, `text-wrap: pretty`.
  - **Key:** a 5px ramp bar (radius 3px), end labels in `10px` mono `var(--color-fg-tertiary)`, then the toggle row.
    - Toggle row: label in 11px mono, a state word in tertiary, and a 30×16px switch.
    - Switch track: `rgba(168, 208, 255, 0.45)` when on, `var(--surface-control)` when off.
  - **Rule:** a 1px line fading from `rgba(160, 200, 255, 0.28)` to transparent.
  - **Facts grid:** 2 columns, gap `12px 16px`. Each fact is a 9px mono uppercase label (`letter-spacing: 0.1em`, tertiary) over a Cormorant `600 18px` value.
  - **Rule** again.
  - **Sources:** header in Cormorant 24px. Each row is a 64px role column plus a two-line link: title in 11px mono `var(--color-accent)` with an arrow, citation in 10px tertiary.
- **Exit pill,** bottom centre: "Exit view · Esc".

### 4.3 Type

Three voices:
- **Headers:** Cormorant.
- **Body text:** **Sora Thin (100)** at 13.5px/1.6, colour `var(--color-fg-base)` (Q-design, decided 2026-09-19).
- **Data** (labels, figures, citations, key hints): mono.

The view overlay uses Sora for its section bodies, which means loading Sora (weight 100) next to Cormorant in `index.html`. Adding a `--font-family-body` token and switching InfoCard and tour captions to it is a **separate PR**. PR3 loads the font and uses it only in `ViewOverlay`. Watch: at 100 weight, check legibility over the bright filaments in the real app, and raise the size before raising the weight.

## 5. PR1: tabs and focus cards

### 5.1 `featuredTabs.ts`

`src/data/palette/featuredTabs.ts` is one typed array, and the user edits it by hand (Q7, Q11). Order in the file is the order on screen. Every card has an authored `label` and `blurb`. The user writes the blurbs; the implementation seeds `TODO` placeholders that the user fills in before merge. A card's image is `/images/featured/<cardId>.webp` by convention (`cardImageSrc`). `image` is an override, and only Galaxies cards set it, to `/images/famous/<famousId>.webp`. Until PR2 captures a card, its convention path 404s and the text tile shows. Nothing ever writes to this file except its author.

Draft membership (the user owns the final lists):

| Tab | Cards (focus ids) |
|---|---|
| Highlights | `body-perseverance`, `body-hubble`, `body-earth`, `body-saturn`, `body-sun`, *(PR3: view `solarSystem`)*, `body-voyager1`, `body-sgr-a-star`, `milkyWay`, `m31`, `group-local-group`, `cluster-virgo-m87`, *(PR3: views `cosmicFlows`, `cosmicWeb`, `observableUniverse`)* |
| Solar System | the Sun, 8 planets, Moon, Phobos, Deimos, Io, Europa, Ganymede, Callisto, Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus, Pluto, Charon |
| Missions | Hubble, Voyager 1, Voyager 2, Curiosity, Perseverance, Spirit, Opportunity |
| Milky Way | Milky Way, Sgr A*, the S-stars, named stars from `famousStars` |
| Galaxies | today's 15 `FEATURED_IDS`, in the same order |
| Deep Space | Local Group, Virgo Cluster, Coma, Laniakea, Shapley, other named superclusters |
| Tours | *(PR3)* `grandTour`, `webShowcase` |

Hidden in PR1: the Tours tab (no cards until PR3) and the PR3 view cards. The whale and the petunias are in no tab (Q3); they stay findable by search.

### 5.2 Components

- **`CommandPalette`:** shows `PaletteTabs` + `FeaturedGrid` when the query is empty. Typing shows `ResultsList` (Q1).
- **`PaletteTabs`:** the tab strip. Reads and writes `ui.paletteTab` through the container, not inside the component. The container passes `tab` and `onTabChange`.
- **`FeaturedGrid`:** renders `PaletteCard[]` for the active tab. It no longer knows about `FamousGalaxyMetaEntry`. A click calls `onSelect(card.action)`, the same `PaletteAction` output the results list uses after P1.
- **Deleted:** `resolveFeaturedEntries.ts` and its test.

### 5.3 Tooltip: blurb plus alias line (Q20)

`FeaturedCardTip` becomes `{ aliases?: readonly string[]; blurb: string }`. The alias line reads "Also known as M31 · NGC 224". It appears when `cardAliases(card, famousEntries)` returns names: for a focus card whose id is a famous id, the famous entry's `names` minus the card label. Nothing else resolves in PR1. The type code and long description leave the tooltip; they stay on the InfoCard.

### 5.4 Tab memory (Q12)

The ui slice gains `paletteTab: PaletteTabId`, initially `'highlights'`, with `setPaletteTab`. It is not persisted, so a reload opens on Highlights.

### 5.5 Keyboard (Q13)

With an empty query, focus stays in the input:
- ←/→/↑/↓ move a highlighted card around the grid. The column count is **measured** from the rendered grid when a key is pressed (the track count of its computed `grid-template-columns`), so the CSS stays its only home, breakpoints included. `gridIndexStep(index, key, columns, count)` is the pure part.
- Enter activates the highlighted card.
- ⌥← and ⌥→ switch tabs, wrapping at the ends.
- Typing any character switches to search, as today.
- The highlight resets to the first card on a tab change.

The results-list navigation is unchanged. `usePaletteSearch` picks which navigator handles the arrow keys from the same empty-query test that picks the view.

## 6. PR2: capture pipeline (Q2, Q9)

`npm run capture-featured [--force <cardId>…]` drives the running dev server headlessly (Playwright, the `perf`/`record` harness pattern) at `?perf&cinema`.

**Per card:**
1. Pin the time with `#t=` if the card sets one.
2. Focus with `#focus=<id>`, or apply the view's pose and settings.
3. Declutter: labels off, orbit trails off, structure rings off, and the selection ring off.
4. Wait until loading settles.
5. Re-apply the pose **after** the focus fly-in settles.
6. Verify the pose through `camera/logCameraState`.
7. Save `public/images/featured/<cardId>.webp`, the convention path the grid reads.

The tool writes image files only, never source. By default it captures only cards whose webp doesn't exist yet, and it skips cards with an `image` override (Galaxies).

A card may carry an optional capture override: `capture?: { pose?: CameraPose; t?: string; keepFocus?: boolean }`. It lives on the card because it is presentation data (Q11). `keepFocus` keeps the focus dim on galaxies and structures. The poses the user framed are recorded in the grill transcript ("Capture spike findings") and go into these overrides.

**Landmines** (from the spike):
- A focus fly-in overwrites an earlier `setPose`.
- The selection ring shows while the focus is kept, so the capture needs a ring-off switch. That is the one engine change in PR2: a debug setting.
- `setPose` has no site-frame arm. Rover site poses need a seam or the default site framing (Perseverance is lit at `2026-09-18T06:00:00Z`).

## 7. PR3: views, tours, takeover

### 7.1 View registry

`src/data/views/viewRegistry.ts`, a `Record<ViewId, View>`. `ViewId` is a closed union: `'solarSystem' | 'cosmicFlows' | 'cosmicWeb' | 'observableUniverse'`. The user writes all view copy. The Cosmic Web entry's draft content (sections, facts, sources from `docs/DATA.md`) is on the V6 artboard and in the transcript's Design pass. Poses:
- `cosmicWeb`: the user-framed pose in the transcript, galaxies off.
- `cosmicFlows`: flow on, galaxies and Milky Way off.
- The other two are framed by the user with the copy-camera helper (§7.5).

### 7.2 View body

`openView(viewId)` is a takeover start request. The takeover `takeLatest` (P3) runs `viewBody(view)` under `runTakeoverSaga({kind: 'view', id})`. The bracket owns everything that isn't view-specific: cancelling a running tour or view (whose `finally` restores first), the snapshot, `takeoverStarted`, the restore, and `takeoverEnded`. `viewBody` does three things:

1. Applies `view.settings` (`mergeSnapshot`).
2. Plays the pose clip (§7.3).
3. Waits for `exitTakeover`.

Also:
- **The toggle** applies its `on`/`off` patches through the same settings path. The bracket's snapshot restores it on exit.
- **Camera input:** orbiting while in a view is allowed and doesn't end it. Only Exit or Esc (`exitTakeover`) does.

### 7.3 Pose clip

The fly-in is a clip addressed by a pose rather than a `FocusId` (`flyToClip` is focus-only). `cosmicFlows` is already a fixed-pose clip, so the builder is a sibling of `flyToClip` over the same effect helpers. The capture script skips the clip and uses `commitCameraPose` directly.

### 7.4 Card actions and search rows

- **Card actions:** `view` and `tour` cards dispatch through the container's action table: `openView` / `startTour`.
- **Search** (Q14, Q15 as simplified by Q19): new `ScoredRow` kinds `view` and `tour`, scored on `label` like famous rows. Only registry views and tours get rows, so focus cards never duplicate object rows. `ROW_VIEW` and `actionForRow` each gain one row per kind.

### 7.5 Copy-camera helper (Q11)

A debug-panel button, "Copy view pose". It writes a paste-ready `pose: { … }` snippet for the current camera to the clipboard, in `CameraPose` units.

## 8. Testing (test what can break)

- **`gridIndexStep`:** arrow moves at row/column edges, wrapping, and a partial last row.
- **Tab state:** `paletteTab` survives closing and reopening the palette, and resets on a fresh store.
- **`cardAliases`:** a famous id gives its names minus the label; a non-famous id gives none.
- **PR1 `actionForRow`:** covers every `ScoredRow` kind (a table-coverage test). PR3 extends it with `view` and `tour`.
- **`cardImageSrc`:** returns the override when set, otherwise the convention path.
- **PR3 `runTakeoverSaga`:**
  - Tours and views exclude each other: starting either cancels the running one, and its settings are restored before the new snapshot is taken.
  - A view restores its settings and toggle changes on exit.
  - A superseded run does not dispatch `takeoverEnded`.
  - `selectTourActive` is unchanged for tours.
- **No tests** for `featuredTabs.ts` content (Q8), CSS, or the capture script (it is its own verification: pose logged and diffed).
- **The user checks visually** in the dev server. PR1 at least: tabs, grid, tooltip, fallback tile, keyboard.

## 9. Sequence

1. **PR1:**
   1. P1 `actionForRow`.
   2. Types and `cardImageSrc`.
   3. `featuredTabs.ts` with placeholder blurbs.
   4. `FeaturedGrid` / `FeaturedCardTip`.
   5. `PaletteTabs` + ui slice.
   6. Keyboard.
   7. The user writes the blurbs.
   8. Merge.
2. **PR2:**
   1. Ring-off switch.
   2. Capture script.
   3. Capture run.
   4. Images committed.
3. **PR3:**
   1. P2 move the scene helpers.
   2. P3 takeover slice + `runTakeoverSaga`, with tours moved onto it.
   3. `CameraPose` lifted out of `PerfPose`.
   4. `View` types + registry.
   5. `viewBody` + pose clip.
   6. `ViewOverlay` + Sora.
   7. Actions + Tours tab + Highlights view cards.
   8. Search rows.
   9. Copy-camera helper.
   10. Capture the view cards.
