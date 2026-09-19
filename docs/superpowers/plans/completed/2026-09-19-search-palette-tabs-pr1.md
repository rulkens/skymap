# Search palette tabs — PR1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the palette's empty state (15 famous galaxies) with a tabbed, image-led browse grid over every scale, with keyboard grid navigation and a blurb + alias tooltip.

**Architecture:** A prep commit makes the palette emit one output type, `PaletteAction`, for rows and cards alike (P1). The tabs are hand-edited data (`src/data/palette/featuredTabs.ts`); the grid renders `PaletteCard[]` and knows nothing about galaxies. The active tab lives in the ui slice, so it survives closing the palette.

**Tech stack:** React 19, RTK (ui slice), CSS modules, Vitest + Testing Library (jsdom).

**Spec:** [`docs/superpowers/specs/2026-09-19-search-palette-tabs-design.md`](../specs/2026-09-19-search-palette-tabs-design.md) §3.5 (P1), §4.1, §5, §8. PR2 (capture) and PR3 (views, tours, takeover) are separate plans.

**Execution:** two grouped dispatches in this worktree (Sonnet implementers), CI as the gate, one whole-branch review at the end.
- **Dispatch A:** Tasks 1–3 (prep, types, data).
- **Dispatch B:** Tasks 4–6 (grid, tabs, keyboard).
- **No perf gate:** nothing here touches the renderer or the frame loop.

## Global constraints

- `type` aliases, never `interface`. One type per file under `src/@types/palette/` (`.d.ts`, like `src/@types/ui/UiState.d.ts`). One function per file under `utils/`.
- Components follow `.claude/skills/create-component/SKILL.md` (read it before touching any `src/components/**` file): `function Name()` + `export default Name`, own `.module.css`, top-level `.root`, tokens from `src/styles/global.css`.
- Comments: why, not what; module header ≤ 5 lines; comment lines ≤ half the code lines (`docs/superpowers/conventions/comments.md`).
- File moves and renames go through `npm run move-files -- <from> <to>` (`--dry` first), never `git mv`; grep for the old name afterwards.
- No commit trailers of any kind. Stage files by name, never `git add -A`. Run `npm run format` on touched files only.
- User-visible copy: no marketing tone. Blurbs are the user's to write; seed them as `'TODO'`.

---

### Task 1: P1, `focusIdForRow` → `actionForRow` (prep, behaviour unchanged)

**Files:**
- Move: `src/components/CommandPalette/utils/focusIdForRow.ts` → `utils/actionForRow.ts`, and its test `tests/components/CommandPalette/utils/focusIdForRow.test.ts` → `actionForRow.test.ts` (move-files drags the test along)
- Create: `src/@types/palette/PaletteAction.d.ts`
- Modify: `src/components/CommandPalette/usePaletteSearch.ts`, `CommandPalette.tsx`, `src/components/containers/CommandPaletteContainer.tsx`, `tests/components/CommandPalette/CommandPalette.test.ts`

**Contract:**

```ts
// src/@types/palette/PaletteAction.d.ts — PR3 adds the view and tour variants
export type PaletteAction = { kind: 'focus'; focusId: string };

// utils/actionForRow.ts
export function actionForRow(row: ScoredRow): PaletteAction;

// CommandPalette + usePaletteSearch
onSelect: (action: PaletteAction) => void;
```

- [x] `npm run move-files -- --dry src/components/CommandPalette/utils/focusIdForRow.ts src/components/CommandPalette/utils/actionForRow.ts`, then run it for real. Rename the function to `actionForRow` (`npm run refactor` rename, see `.claude/skills/refactor/SKILL.md`), and grep `src/` and `tests/` for `focusIdForRow` until nothing is left.
- [x] Keep the per-kind table (`actionForRow.ts`, today `focusIdForRow.ts:36-54`). It still yields the focus id string, and the exported function wraps it as `{ kind: 'focus', focusId }`. Update the module header to match.
- [x] Thread `PaletteAction` through `usePaletteSearch` (`dispatchSelection` calls `onSelect(actionForRow(m))`) and `CommandPalette`'s `onSelect` prop.
- [x] The container dispatches through one table keyed by `action.kind`, so PR3 adds rows here rather than branches: `focus` → `requestSelect(focusId)` then `requestFocus(focusId)`, the same pair `CommandPaletteContainer.tsx:35-38` fires today.
- [x] Tests: update the existing assertions in `actionForRow.test.ts` and `CommandPalette.test.ts` to expect `{ kind: 'focus', focusId: … }`. **No new test:** the spec's "table-coverage test" (§8) can't fail. The `Record<ScoredRow['kind'], …>` table already makes a missing kind a compile error.
- [x] `npm test -- CommandPalette` passes. Commit as `prep(palette): selection emits a PaletteAction (actionForRow)`.

### Task 2: Palette types and the two card helpers

**Files:**
- Create:
  - `src/@types/palette/PaletteTabId.d.ts`, `PaletteCard.d.ts`, `PaletteTab.d.ts`
  - `src/components/CommandPalette/utils/cardImageSrc.ts`
  - `src/components/CommandPalette/utils/cardAliases.ts`
- Test: `tests/components/CommandPalette/utils/cardAliases.test.ts`

**Contract:**

```ts
// PR3 adds 'tours'. It's left out here because a union member with no tab row is speculative.
export type PaletteTabId = 'highlights' | 'solarSystem' | 'missions' | 'milkyWay' | 'galaxies' | 'deepSpace';

export type PaletteCard = {
  id: string;            // unique; for a focus card, its focus id. It names the default image.
  label: string;         // card face + tooltip title
  blurb: string;         // tooltip body, authored by the user
  image?: string;        // override only; the default is /images/featured/<id>.webp
  action: PaletteAction;
};

export type PaletteTab = { id: PaletteTabId; label: string; cards: readonly PaletteCard[] };

export function cardImageSrc(card: PaletteCard): string;
// card.image when set, else `/images/featured/${card.id}.webp`

export function cardAliases(card: PaletteCard, famous: readonly FamousGalaxyMetaEntry[]): readonly string[];
```

**`cardAliases` behaviour:**
- For a `focus` card whose `focusId` equals a famous entry's `id`, return that entry's `names` with `card.label` removed.
- Every other card gets `[]`.

- [x] Tests in `cardAliases.test.ts`:
  - `a famous focus card lists the entry's other names`: card `m31` labelled `Andromeda Galaxy`, names `['M31','NGC 224','Andromeda Galaxy']` → `['M31','NGC 224']`.
  - `a non-famous focus card has no aliases`: `body-earth` → `[]`.
- [x] Implement both helpers. **No test for `cardImageSrc`:** it's a one-line `??`, and a broken path shows up as text tiles on every card at the first look. This departs from spec §8; say so in the commit body.
- [x] Commit.

### Task 3: `featuredTabs.ts`, the curated tab data

**Files:** Create `src/data/palette/featuredTabs.ts`

**Contract:** `export const FEATURED_TABS: readonly PaletteTab[]`. The user edits it by hand, so give it a module header that says so: order on screen = order in the file; image by convention (point at `cardImageSrc`); nothing generates or rewrites this file.

**Rules:**
- Every card: `action: { kind: 'focus', focusId: <id> }`, `id` = the focus id, `blurb: 'TODO'`.
- Only Galaxies cards set `image`, to `/images/famous/<famousId>.webp`.
- The whale and the petunias are in no tab.

**Tabs, in this order.** The ids are the draft; the user owns the final lists.

| Tab `id` / `label` | Cards: focus id → label |
|---|---|
| `highlights` / Highlights | `body-perseverance` Perseverance · `body-hubble` Hubble · `body-earth` Earth · `body-saturn` Saturn · `body-sun` Sun · `body-voyager1` Voyager 1 · `body-sgr-a-star` Sgr A* · `milkyWay`* Milky Way · `m31` Andromeda Galaxy · `group-local-group` Local Group · `cluster-virgo-m87` Virgo Cluster |
| `solarSystem` / Solar System | `body-` + sun, mercury, venus, earth, mars, jupiter, saturn, uranus, neptune, moon, phobos, deimos, io, europa, ganymede, callisto, mimas, enceladus, tethys, dione, rhea, titan, iapetus, pluto, charon (labels title-cased; Moon for `moon`) |
| `missions` / Missions | `body-` + hubble, voyager1, voyager2, curiosity, perseverance, spirit, opportunity |
| `milkyWay` / Milky Way | `milkyWay`* Milky Way · `body-sgr-a-star` Sgr A* · `body-s2` S2 · `body-` + sirius, betelgeuse, vega, polaris, alpha-centauri, proxima-centauri, rigel, antares |
| `galaxies` / Galaxies | today's 15 `FEATURED_IDS` in the same order (`resolveFeaturedEntries.ts:26-42`); label = the proper name `pickProperName` gives for each today |
| `deepSpace` / Deep Space | `group-local-group` Local Group · `group-m81-group` M81 Group · `cluster-virgo-m87` Virgo Cluster · `supercluster-laniakea-sc` Laniakea · `supercluster-coma-sc` Coma Supercluster · `void-bootes-void` Boötes Void |

\* The Milky Way's focus id is `MILKY_WAY_FOCUS_ID` (`src/services/url/milkyWayFocusId.ts`). Import it; don't retype the literal.
All the star ids and `s2` are verified present (`famousStars.generated.ts`, `sceneSStars.ts`).

- [x] Write the file, with the ids checked against `SCENE_BODIES` / `famousStars.generated.ts` and the grep of structure ids in `src/`.
- [x] **No test:** the content is curation, not logic (spec Q8), and TS checks the shape.
- [x] Commit. This ends Dispatch A.

### Task 4: The grid renders cards: tooltip, fallback tile, empty state

**Files:**
- Create: `src/components/CommandPalette/FeaturedCard.tsx` + `.module.css`
- Modify:
  - `FeaturedGrid.tsx` + `.module.css`
  - `FeaturedCardTip.tsx` + `.module.css`
  - `CommandPalette.tsx`
  - `utils/rankPaletteMatches.ts`
  - `tests/components/CommandPalette/CommandPalette.test.ts`
  - `tests/components/CommandPalette/utils/rankPaletteMatches.test.ts`
- Delete: `utils/resolveFeaturedEntries.ts` and `tests/.../utils/resolveFeaturedEntries.test.ts`

**Contract:**

```ts
// FeaturedGrid
type FeaturedGridProps = {
  cards: readonly PaletteCard[];
  famous: readonly FamousGalaxyMetaEntry[];   // for cardAliases only
  activeIdx: number;                          // keyboard highlight (Task 6); -1 = none
  gridRef: RefObject<HTMLUListElement | null>;
  onSelect: (action: PaletteAction) => void;
};
// FeaturedCard: one card; owns its own image-failed state
type FeaturedCardProps = { card: PaletteCard; aliases: readonly string[]; active: boolean; onSelect: (action: PaletteAction) => void };
// FeaturedCardTip
type FeaturedCardTipProps = { aliases?: readonly string[]; blurb: string };
```

**Card:**
- Today's markup (`FeaturedGrid.tsx:25-58`) moves into `FeaturedCard`: an `InfoTip` (`interactive`, `placement="bottom"`, `title={card.label}`) around a button with the image and the name.
- The button's `aria-label` is `card.label`, and `aria-current` is set when `active`.
- The image is `cardImageSrc(card)`. On `onError` the card switches to the **text tile**:
  - 1px dashed `var(--border-default)` border;
  - background `radial-gradient(circle at 50% 40%, rgba(60, 90, 140, 0.35), var(--surface-card-strong) 70%)`;
  - the label centred in `600 15px/1.05 var(--font-family-display)`.
- The active card gets the same outline as `:focus-visible` in `FeaturedGrid.module.css`.

**Tooltip:** `FeaturedCardTip` shows "Also known as M31 · NGC 224" (keep today's `aliasesLabel` styling) when `aliases` is non-empty, then the blurb. Delete the type code and description CSS it no longer uses.

**Grid:** unchanged look (5 columns, gap `var(--space-3)`), plus `max-height` with `overflow-y: auto`, so a 26-card tab scrolls inside the panel (pick the height so three rows fit, as today). The `ul`'s `aria-label` becomes the tab label, via a new `label: string` prop.

**Empty state (spec Q1):** an empty query shows the tabs + grid only; typing shows `ResultsList` only. `rankPaletteMatches`'s empty-query branch (`rankPaletteMatches.ts:73-76`, famous-all + Milky Way) then has no reader. Delete it (empty query → `[]`) along with its test cases.

- [x] Update `CommandPalette.test.ts`. The `NGC1300` "not in FEATURED_IDS" fixture comment goes stale; drop it and pass fixture tabs instead. Add:
  - `clicking a card selects its action`: one fixture tab with a focus card → `onSelect({ kind: 'focus', focusId })`.
  - `a card whose image fails shows its label as a text tile`: fire `error` on the `img`, and the label is still visible with no `img` left.
- [x] Implement. Delete `resolveFeaturedEntries` + its test, then grep for `resolveFeaturedEntries` and `FEATURED_IDS` until nothing is left.
- [x] Commit.

### Task 5: Tab strip and tab state (review: yes, ui slice)

**Files:**
- Create: `src/components/CommandPalette/PaletteTabs.tsx` + `.module.css`
- Modify:
  - `src/@types/ui/UiState.d.ts`, `src/state/ui/uiSlice.ts`, `src/state/ui/buildInitialUiState.ts`, `src/state/ui/selectors.ts`
  - `src/components/containers/CommandPaletteContainer.tsx`, `CommandPalette.tsx`
- Test: `tests/state/ui/uiSlice.test.ts`, `tests/components/CommandPalette/CommandPalette.test.ts`

**Contract:**

```ts
// UiState gains
paletteTab: PaletteTabId;                                   // initial 'highlights'; not persisted
// uiSlice
setPaletteTab: (state, action: PayloadAction<PaletteTabId>) => void;
// selectors.ts
export const selectPaletteTab = (state: RootState): PaletteTabId => …;

// CommandPalette gains
tabs: readonly PaletteTab[];        // the container passes FEATURED_TABS
tab: PaletteTabId;
onTabChange: (id: PaletteTabId) => void;

// PaletteTabs
type PaletteTabsProps = { tabs: readonly PaletteTab[]; active: PaletteTabId; onChange: (id: PaletteTabId) => void };
```

**Behaviour:**
- `CommandPalette` shows only tabs that have cards. PR1 has no empty tab, but PR3's Tours tab will rely on this.
- If `tab` isn't among the shown tabs, it falls back to the first one.

**Tab strip** (canvas Main artboard):
- A `role="tablist"` between the input and the grid: one row, `overflow-x: auto`, `border-bottom: 1px solid var(--border-default)`, gap 16px, padding `0 14px`.
- Each tab is a `role="tab"` button with `aria-selected`: `600 16px/1 var(--font-family-display)`, padding `11px 0 8px`.
  - Inactive: `var(--color-fg-dim)`, transparent 1px bottom border.
  - Active: `var(--color-fg)` with a 1px bottom border in `var(--color-accent-gradient-mid)`.
- The grid below gets `role="tabpanel"`.

- [x] Test in `uiSlice.test.ts`: `paletteTab survives closing and reopening the palette`. `setPaletteTab('missions')`, then `setPaletteOpen(false)`, then `setPaletteOpen(true)`: the tab is still `'missions'`, and a fresh store starts on `'highlights'`.
- [x] Test in `CommandPalette.test.ts`: `clicking a tab asks for it` → `onTabChange('<id>')`.
- [x] Implement. The container reads `selectPaletteTab` and dispatches `setPaletteTab`.
- [x] Commit.

### Task 6: Keyboard: grid arrows, Enter, ⌥←/→ between tabs

**Files:**
- Create: `src/components/CommandPalette/utils/gridIndexStep.ts`, `utils/measureGridColumns.ts`
- Modify: `usePaletteSearch.ts`, `CommandPalette.tsx`
- Test: `tests/components/CommandPalette/utils/gridIndexStep.test.ts`, `CommandPalette.test.ts`

**Contract:**

```ts
export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';
export function gridIndexStep(index: number, key: GridKey, columns: number, count: number): number;
export function measureGridColumns(grid: HTMLElement): number;
// the track count of getComputedStyle(grid).gridTemplateColumns; 1 when it can't be read (jsdom)

// usePaletteSearch input gains
cards: readonly PaletteCard[];            // the shown tab's cards
onTabStep: (delta: 1 | -1) => void;       // CommandPalette maps it to the next/previous shown tab, wrapping
// and it returns
gridRef: RefObject<HTMLUListElement | null>;
activeCard: number;
```

**`gridIndexStep` rules:**
- ←/→ move by 1 and wrap over the whole list (reuse `wrapIndex`).
- ↓ moves by `columns`:
  - past the last row, it wraps to the same column in the first row;
  - into a partial last row with no card in that column, it lands on the last card.
- ↑ moves by `columns`: from the first row, it wraps to the same column in the last row that has one.
- `count === 0` → `-1`.

**The key handler, with an empty query:**
- Arrows call `gridIndexStep` with `measureGridColumns(gridRef.current)` measured at key time. The column count stays in CSS only.
- Enter selects `cards[activeCard].action` (then closes, like a row).
- ⌥← / ⌥→ call `onTabStep(-1 | 1)`. Check `altKey` before the plain-arrow branch, and `preventDefault`, since macOS ⌥-arrow otherwise moves the caret.
- `activeCard` resets to 0 when `cards` changes (tab switch).
- With a non-empty query, today's results-list handling runs unchanged.
- One empty-query test picks the navigator, the same one that picks the view.

- [x] Tests in `gridIndexStep.test.ts` (5 columns, 12 cards = rows of 5, 5, 2):
  - `right from the last card wraps to the first`: 11 → 0.
  - `down from row 1 column 4 lands on the last card of a partial row`: 8 → 11.
  - `down from the last row wraps to the same column on top`: 10 → 0; 11 → 1.
  - `up from the top row lands in the last row that has that column`: 1 → 11; 3 → 8.
  - `an empty grid has no active card`: count 0 → −1.
- [x] Tests in `CommandPalette.test.ts`:
  - `ArrowRight then Enter selects the second card`.
  - `Alt+ArrowRight asks for the next tab and wraps from the last`.
- [x] Implement. Then commit. This ends Dispatch B.

---

## Definition of Done

**Deliverables:**
- `PaletteAction`, `PaletteTabId`, `PaletteCard`, `PaletteTab` under `src/@types/palette/`.
- `actionForRow`, `cardAliases`, `cardImageSrc`, `gridIndexStep`, `measureGridColumns` under `CommandPalette/utils/`.
- `src/data/palette/featuredTabs.ts`.
- `PaletteTabs` and `FeaturedCard` components.
- `ui.paletteTab` + `setPaletteTab` + `selectPaletteTab`.
- `focusIdForRow`, `resolveFeaturedEntries` and `FEATURED_IDS` gone.

**Smoke pass (the user, in the dev server):**
- Cmd+K opens on Highlights. Six tabs show in the serif strip, and the active one is underlined.
- Each tab shows its cards. Solar System (26) scrolls inside the panel.
- Clicking a card pins the InfoCard and flies to it: a body, a spacecraft, a star, a structure, the Milky Way, a galaxy.
- Galaxies cards show their atlas thumbnails; every other card shows the dashed text tile (no captures until PR2).
- Hovering a galaxy card shows "Also known as …" then the blurb. Other cards show only the blurb.
- Arrows move the highlight around the grid, including the partial last row. Enter flies to it. ⌥←/→ switch tabs and wrap.
- Close and reopen: the same tab is shown. Reload: Highlights.
- Typing replaces the grid with search results, and search ranks as before.
- At phone width, the tab strip scrolls sideways.

**Before merge:** the user replaces every `blurb: 'TODO'` and settles the tab lists.

**Deferred (not this PR):**
- Captured thumbnails (PR2).
- The Tours tab, view cards, view and tour search rows, and the takeover (PR3).
- The `--font-family-body` token (its own PR).
- A `#view=` deep link, and a coverage test for the curated lists.
