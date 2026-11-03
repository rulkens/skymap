# Remote show deck — design

The phone remote's lower half becomes a "show deck": a card for what is running, with the show's controls on it,
and a tile library whose tiles open bottom sheets. The top part (status line, drag pad, Home row with the scheme
and axis buttons) stays as shipped, apart from its icons.

## Intent

- **Person and job:** as a dome operator, phone in one hand in the dark, I need to steer, start and step through
  the show, and see at a glance what is running, so the audience sees a smooth show and never my lit-up face.
- **Place:** `src/components/RemotePage/`, below the Home row; the dome's status in `src/state/remote/`.
- **Success:** at 390×844 the pad, the running show and its controls fit on one screen with no scroll; any
  library sheet leaves at least the upper half of the pad live; the header names whatever the dome has focused.
- **Source material:** the 2026-11-03 critique and mockups (direction (c), `c-show-deck/index.html`,
  `library.html`, `red.html`, the icon set in `build.mjs`).

## Rulings

| Question | Ruling |
| --- | --- |
| Direction | (c) show deck (owner, 2026-11-03) |
| Top part | Stays as shipped; at most the new icons (owner) |
| Duplicate entries ("Cosmic Flows" exhibit and clip, "Galactic Centre" twice in Labels) | Backlogged, out of scope (owner) |
| Focus carries a name | **Proposed**, revising the dome-remote spec's 2026-10-16 ruling, whose premise no longer holds: the dome names any focus from the focus row through core code, with no Layer contract change (see "The dome side") |
| Status shape | **Proposed:** `takeover` replaces `tour` and `focus.name` replaces `focus.id`, a one-reload skew break, over an additive shape (see "Compatibility") |
| Version field | None, as the dome-remote spec ruled |
| Red-light palette | **Open:** in scope if the owner agrees it is one token swap (see "Red light") |
| PR packaging | **Open:** asked at the checkpoint |

## Ground preparation

Ground check run 2026-11-03: of 11 touchpoints, one is a special case the current structure forces, and one prep
commit creates its joint. One contract changes: `DomeStatus`. `RemoteMessage`, `RemoteMenu`, the Layer contract,
`ReconcileEffects` and `SagaContext` do not change.

**Prep 1 — the remote's icons become one component and a glyph table.** Seven icon files repeat the same
24-unit, 1.75-stroke wrapper (`RemotePage/HomeIcon.tsx:7-15`, `AxisHoldButtons/{Orbit,Look,Roll,Zoom}Icon.tsx`,
`SchemeSwitch/{Skymap,OpenSpace}Icon.tsx`). The deck adds about eighteen glyphs, which would be eighteen more copies.
After the prep, a glyph is a row:

```ts
export type RemoteGlyph = 'home' | 'skymap' | 'openspace' | 'orbit' | 'look' | 'roll' | 'zoom'; // the deck adds rows
// RemoteIcon/RemoteIcon.tsx — the one 24-unit, 1.75-stroke, round-cap wrapper; size comes from the parent's CSS
function RemoteIcon({ glyph }: { glyph: RemoteGlyph }): ReactNode;
// RemoteIcon/remoteGlyphs.tsx
export const REMOTE_GLYPHS: Record<RemoteGlyph, ReactNode>; // the paths inside the wrapper
```

`AxisHoldButtons` and `SchemeSwitch` already hold their buttons in tables; their `icon: <OrbitIcon />` cells
become `glyph: 'orbit'`. Behaviour and pixels are unchanged. The seven files are deleted.

**Touchpoints that land as growth:** the `takeover` field (`DomeStatus.d.ts:7`), its validator
(`parseDomeMessage.ts:30-35,54`), the focus name (`selectDomeStatus.ts:27`, a `TARGET_NAME` table beside
`targetIdentityKey.ts:9`, a focus selector beside `selectors.ts:107-119`), the deck and the sheets (`RemotePage.tsx:85-94`),
the red-light token block (`remote.css`), and the per-kind table that replaces three inline start commands
(`TourSection.tsx:59`, `ExhibitSection.tsx:23,33`) and the inline name lookup (`TourSection.tsx:23`).
`selectDomeStatus.ts:28-36` branches once on `takeover?.kind === 'tour'`; it becomes a per-kind table in the
feature commit, because the field it builds is what changes. A behaviour-preserving prep there would build the
old field.

## Scope

- The now card: the running tour, exhibit or clip; beat ticks and Previous / Pause / Next for a tour; one Stop for
  any kind; the time row with Pause time.
- The tile library and its seven sheets: Search, Tours, Exhibits, Clips, Time, Labels, Setup.
- One icon set for the whole remote, the top part's icons included (prep 1).
- `DomeStatus.takeover` and `DomeStatus.focus.name`.
- The red-light palette, if ruled in.

## Out of scope

- The duplicate entries: "Cosmic Flows" as both exhibit and clip, "Galactic Centre" twice in the label toggles
  (owner ruling: backlogged on another branch). The deck keeps them apart by kind (separate sheets, the kind on the
  card); the running marker matches on kind and id, since exhibit and clip share the id `cosmicFlows`.
- New commands or toggles (backlog "More controls on the phone remote"); jump to beat.
- A version field or a "dome updated" state (see "Compatibility").
- Keeping the phone's screen awake (Wake Lock) during a show.
- The app's own HUD icons, which use another grid (adjacent finding).

## Shape

### The contract: `DomeStatus`

```ts
// src/@types/remote/RemoteTakeover.d.ts (new)
/** What runs on the dome, as the remote shows it; mirrors `TakeoverSource` without the exhibit's `entry`. */
export type RemoteTakeover =
  | { kind: 'tour'; id: TourId; beatIndex: number; beatCount: number; paused: boolean }
  | { kind: 'exhibit'; id: ExhibitId }
  | { kind: 'clip'; id: ClipId };

// src/@types/remote/DomeStatus.d.ts
 export type DomeStatus = {
-  focus: { id: string } | null;
-  tour: { id: TourId; beatIndex: number; beatCount: number; paused: boolean } | null;
+  focus: { name: string } | null;
+  takeover: RemoteTakeover | null;
   time: { ... };       // unchanged
   controls: { ... };   // unchanged
   toggles: readonly { ... }[]; // unchanged
 };
```

- **The kind and id only; the label stays in the menu.** The phone looks a running item's label up in
  `RemoteMenu` by kind and id, so one label is never on the wire twice. Before the menu arrives, or for an id the
  menu lacks (a `dev` clip), the card shows the kind's noun ("Clip").
- **`focus.id` goes.** The phone read it only to look a name up in its own search results (`focusNameFrom.ts`),
  which is deleted. `DomeStatus` is "what the remote renders"; an unread id would contradict that.
- `RemoteMessage` and `RemoteMenu` do not change: every control the deck has sends a command that exists today
  (`tourPrev`, `tourTogglePause`, `tourAdvance`, `exitTakeover`, `timePause`, `timeResume`, `goTo`, `clipStart`).

### Compatibility

Both pages ship from one build and are served by the same Vite server (the only relay today,
`tools/utils/vite/remoteRelayPlugin.ts`), and no status is persisted. A skew needs a phone tab that outlives the
dome's build, or the reverse: a `vite preview` restarted after a build, or a dev server restarted while the phone's
tab was asleep.

- **Old phone, new dome.** The old validator requires `tour` (`parseDomeMessage.ts:54`), so it drops every status
  and shows "Dome not there" with its "check the code" notice. A reload cures it.
- **New phone, old dome.** The new validator requires `takeover`; same result, same cure.
- **Why break, not add.** The additive shape (`takeover: { kind, id }` beside `tour`) keeps old phones working but
  states "a tour runs" twice, and the phone must pick which to read for as long as both exist. The window it
  protects is one reload long, on a venue mid-upgrade. With the public relay (backlogged), skew across deploys
  becomes ordinary; the misleading "Dome not there" is an adjacent finding for that work.

### The dome side

```ts
// src/services/engine/helpers/targetName.ts (new), the sibling of TARGET_IDENTITY_KEY
export const TARGET_NAME: Record<FocusableTargetType, (t: FocusableTarget) => string>;

// src/state/selection/selectors.ts, the focus slot's sibling of selectHoveredFocusable / selectSelectedFocusable
export const selectFocusedFocusable: (state: RootState) => FocusableTarget | null;

// src/state/remote/selectDomeStatus.ts
const REMOTE_TAKEOVER: {
  [K in TakeoverSource['kind']]: (source: Extract<TakeoverSource, { kind: K }>, state: RootState) => RemoteTakeover;
};
```

- **Any focus has a name.** `buildFocusable` (`services/engine/helpers/buildFocusable.ts:50-94`, pure, already read
  by `state/`) builds the target every info card renders, and each arm carries its name: `displayName` (galaxy,
  star, Milky Way, zone of avoidance), `name` (structure) or `label` (body, craft, Earth scene, black hole,
  satellite). `TARGET_NAME` reads that field per kind. A new focusable kind fails to compile until it has a row,
  as it already does for `TARGET_IDENTITY_KEY`. Galaxies get the card's name ladder (famous name, Milliquas,
  `PGC n`, IAU name).
- **`focus` is built from the focus row** (`selectFocusRow`, `selectors.ts:85`), the row the focus card renders.
- **The exhibit's `entry` stays home.** `REMOTE_TAKEOVER.exhibit` returns `{ kind, id }`; the tour row adds the
  beat, count and paused state from the tour selectors.

### The phone side

```ts
// src/@types/remote/RemoteSheetId.d.ts
export type RemoteSheetId = 'search' | 'tours' | 'exhibits' | 'clips' | 'time' | 'labels' | 'setup';

// src/data/remote/remoteSheets.ts — the tiles, in order
export const REMOTE_SHEETS: readonly { id: RemoteSheetId; label: string; glyph: RemoteGlyph }[];

// src/data/remote/remoteShowKinds.ts — one row per takeover kind, typed per kind
export const REMOTE_SHOW_KINDS: {
  [K in RemoteTakeover['kind']]: {
    list: keyof RemoteMenu;  // 'tours' | 'exhibits' | 'clips'
    noun: string;            // 'Tour', 'Exhibit', 'Clip'
    glyph: RemoteGlyph;
    start: (id: Extract<RemoteTakeover, { kind: K }>['id']) => RemoteCommand;
  };
};
```

- **Components.** `NowCard` (the running item and its controls), `TimeRow` (the clock's state and Pause time /
  Play time, placed on the card and at the top of the Time sheet), `ShowList` (the Tours, Exhibits and
  Clips sheets: one component, a kind prop, rows from `REMOTE_SHOW_KINDS`), `RemoteSheet` (the bottom sheet), and
  the tiles. The Search, Time, Labels and Setup sheets are today's `SearchSection`, `TimeSection`, `ToggleSection`
  and `SetupSection`, restyled. `RemotePage` picks a sheet's body from a `Record<RemoteSheetId, …>`, never a chain.
- **Deleted.** `TourSection` and `ExhibitSection` (`NowCard` and `ShowList` replace them), the "Exit exhibit or
  clip" button (Stop on the card replaces it), `focusNameFrom.ts` and its test.
- **One control per job on screen.** The open Time sheet covers the card, so `TimeRow` sits in both and only one is
  ever visible; the rest of the Time sheet is direction, rate, date and Go live. Stop lives on the card only.

### Red light

A local preference on the phone, never on the wire. Every colour the remote's CSS reads is a token (13 of them
today; a search finds no raw colour under `src/components/RemotePage/` or in `src/styles/remote.css`), so the
palette is one block:

```css
/* src/styles/remote.css */
:root[data-light='red'] { --color-fg: …; --color-accent: …; --surface-panel: …; /* every colour token the remote reads */ }
```

A `useRedLight()` hook reads and writes one localStorage key (`skymap.remote.redLight`, try/catch, default off) and
sets `data-light` on `<html>`. A switch in the Setup sheet flips it. No component reads the preference.

The app's colour tokens are independent literals, not derived from a base hue, so the block lists each token the
remote reads. A parity test keeps the two lists equal (see "Testing"); a remote component that reads a colour the
block lacks fails CI instead of showing blue in red light.

## Interaction

**The deck, top to bottom:** header, pad, Home row (unchanged), the now card, the tiles (Search two columns wide,
then Tours, Exhibits; Clips, Time, Labels, Setup).

**Now card states:**

| State | Eyebrow | Title | Controls |
| --- | --- | --- | --- |
| Tour running | "Tour, beat 6 of 14" | tour label | ticks; Previous, Pause, Next; Stop tour |
| Tour paused | "Tour, beat 6 of 14, paused" | tour label | ticks; Previous, Resume, Next; Stop tour |
| Exhibit | "Exhibit" | exhibit label | Stop exhibit |
| Clip | "Clip" | clip label | Stop clip |
| Nothing | "Nothing running" | none | the line "Start a tour, exhibit or clip below" |

The time row ("Live, 1 s/s"; "2026-11-03, paused") and its Pause time / Play time button show in every state.
The eyebrow and the time text are `role="status"`. Ticks are `aria-hidden`; the eyebrow carries the beat. The
title wraps to two lines at most.

**Sheets.**

- A tile opens its sheet; the sheet rises over the card and tiles. Its top never rises above the pad's vertical
  midpoint, so the upper half of the pad stays live; the content scrolls inside the sheet.
- The pad never closes a sheet: steering while choosing is the point. The card and tiles under the sheet are
  `inert`.
- One sheet at a time. It closes from its Close button (44 px, top right) or Escape.
- Not modal: `role="dialog"` with `aria-modal="false"` and `aria-labelledby` its heading; no focus trap, no dim.
- **Focus order.** Opening moves focus to the sheet's heading; the Search sheet focuses its field instead.
  Closing returns focus to the tile that opened it. Tab order is header, pad buttons, Home row, then the sheet.
- A list row starts its item and leaves the sheet open, so the operator sees the row marked as running and the
  card under it updates on close. The running row has `aria-current` and the doubled border `.on` already uses,
  matched on kind and id.
- Laptop width (64 rem and up, today's two columns): the deck takes the right column and its sheet opens inside
  that column, so the pad is never covered.

**Touch targets.** Previous / Pause / Next 56 px tall (a remote-local `--show-target` on the page root); tiles
52 px; list rows 48 px; everything else at least `--touch-target` (44 px). Pause is the one primary on the card.

**Motion.** A sheet slides up in 200 ms, easing out, and leaves in 150 ms, easing in, on `transform` only. Under
`prefers-reduced-motion: reduce` it appears and leaves with no movement. Nothing else moves.

**Dark-dome glare.** Text at rest is `--color-fg-base`, not `--color-fg`; only the card's title, its primary
button and a running row reach full strength. Surfaces stay at today's panel tokens on the black ground; the sheet
is `--color-bg`. No new light surface, no glow.

**States the page already has stay as they are:** no room code (the join field), looking for the dome, dome not
there (the notice, the deck `inert` and dimmed), no menu yet (list sheets say "Waiting for the dome's lists").

**Copy.** Buttons verb first: "Stop tour", "Pause time", "Play time", "Close". Tiles name their sheet. Time
direction is a two-way switch labelled "Backward" / "Forward" showing the current state.

## Testing

Per `testing.md`: only what can fail on a bug nothing else catches.

- **`selectDomeStatus` (real store):** a running exhibit reports `{ kind: 'exhibit', id }` and no `entry`; a running
  clip reports its kind and id; a running tour reports its beat, count and paused state; a focused Earth reports
  `name: 'Earth'`; a focused famous galaxy reports the card's display name, not its catalogue designation. Replaces "reports no tour when none runs" and
  "reports the running tour's beat and count".
- **`parseDomeMessage`:** accepts a status with each takeover kind; drops an unknown takeover kind and a tour
  takeover missing `beatCount`.
- **`RemotePage` (interaction):**
  - a running tour shows its label and beat, and Pause sends `tourTogglePause`;
  - Stop on a running exhibit sends `exitTakeover`;
  - a tile opens its sheet with focus inside, and Escape closes it with focus back on the tile;
  - with the `cosmicFlows` exhibit running, the Exhibits sheet marks it and the Clips sheet marks nothing (regression:
    exhibit and clip share the id);
  - the header shows `status.focus.name`;
  - the red-light switch sets `data-light` and a remounted page reads it back.
- **Red-light parity** (if red light is in): every colour token (`--color-*`, `--surface-*`, `--border-*`) read
  under `src/components/RemotePage/` is redefined in the `[data-light='red']` block. Blue leaking into red light is
  silent to every other check.
- **No tests** for the icon table, tile order, the sheet table or the CSS: the compiler covers the tables, and the
  shots cover the look.
- **Deleted:** `focusNameFrom.test.ts`; the `RemotePage` tests for removed markup are rewritten, not kept beside.
- **By eye:** `npm run shot` of the remote paired to a dev dome at 400×850 and 1728×1000 for each now-card state,
  each sheet, and red light; one dash check per section.

## Build order

1. **Prep:** the icon component and glyph table (prep 1), its own commit; packaging per the checkpoint ruling.
2. **Contract:** `RemoteTakeover`, `DomeStatus`, `TARGET_NAME`, `selectFocusedFocusable`, `selectDomeStatus`,
   `parseDomeMessage`.
3. **Phone:** the glyph rows, `REMOTE_SHOW_KINDS`, `REMOTE_SHEETS`, `NowCard`, `ShowList`, `RemoteSheet`, the
   restyled sheet bodies, `RemotePage`; delete `TourSection`, `ExhibitSection`, `focusNameFrom`.
4. **Red light**, if ruled in, its own commit.
5. **Backlog:** the UI & UX line "The remote's header reads 'Focused'" exists only on `site/16-pass-3` today;
   whichever of the two branches lands second deletes it.
