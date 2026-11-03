# Remote show deck — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`, under the lean protocol in
> [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`specs/2026-11-03-remote-show-deck-design.md`](../specs/2026-11-03-remote-show-deck-design.md) (approved
2026-11-03).

**Goal:** the phone remote's lower half becomes a show deck. A now card shows the running tour, exhibit or clip with
its controls, and a tile library opens bottom sheets. The dome's status names what runs and what is focused, every
remote message carries a protocol version, and the remote has a red-light palette.

**Architecture:** two prep commits come first: the remote's icons as one glyph table, and one link state owned by
the hook. Then the wire contracts change (`v` on every message, `DomeStatus.takeover`, `DomeStatus.focus.name`).
Then the phone's deck is built from three tables: glyphs, sheets and show kinds. The dome's receiver saga does not
change.

**Tech stack:** React 19, CSS modules on `src/styles/tokens.css`, Vitest + Testing Library (jsdom), RTK selectors.

**Packaging:** one PR (owner, 2026-11-03), preps first. Branch `feat/remote-show-deck`.

**Read before any task:** `CLAUDE.md`, `docs/superpowers/conventions/ui-ux.md`, `testing.md`, and the
`create-component` skill (`.claude/skills/create-component/SKILL.md`) for every `src/components/**` change.
`tests/remote/remoteImportGraph.test.ts` must stay green: nothing reachable from `src/remoteMain.tsx` imports
`src/services/gpu/` or `src/services/engine/`.

**Mockups** (session scratchpad, may be cleaned): `/private/tmp/claude-501/-Users-rulkens-Development-js-skymap/b00637c1-fa34-4743-ac67-8aeabc56f052/scratchpad/remote-redesign/c-show-deck/`
(`index.png` tour running, `library.png` a sheet open, `red.png` red light). The glyph paths and the red values
the implementation needs are copied into the appendices below, so no task depends on the scratchpad.

## File structure

**Created**

| Path | Holds |
| --- | --- |
| `src/@types/remote/RemoteGlyph.d.ts` | the glyph-name union |
| `src/components/RemotePage/RemoteIcon/RemoteIcon.tsx` | the one 24-unit, 1.75-stroke wrapper |
| `src/components/RemotePage/RemoteIcon/remoteGlyphs.tsx` | `REMOTE_GLYPHS: Record<RemoteGlyph, ReactNode>` |
| `src/@types/remote/DomeLinkState.d.ts` | the phone's link state union |
| `src/data/remote/remoteProtocolVersion.ts` | `REMOTE_PROTOCOL_VERSION` |
| `src/components/RemotePage/VersionNotice/VersionNotice.tsx` (+ `.module.css`) | the two "needs a reload" notices |
| `src/@types/remote/RemoteTakeover.d.ts` | what runs, as the remote shows it |
| `src/services/engine/helpers/targetName.ts` | `TARGET_NAME` |
| `src/@types/remote/RemoteSheetId.d.ts` | the sheet-id union |
| `src/@types/remote/RemoteShowKind.d.ts` | one `REMOTE_SHOW_KINDS` row's type |
| `src/data/remote/remoteSheets.ts` | `REMOTE_SHEETS`, the tiles in order |
| `src/data/remote/remoteShowKinds.ts` | `REMOTE_SHOW_KINDS` |
| `src/components/RemotePage/RemoteSheet/RemoteSheet.tsx` (+ css) | the bottom sheet |
| `src/components/RemotePage/LibraryTiles/LibraryTiles.tsx` (+ css) | the tile grid |
| `src/components/RemotePage/NowCard/NowCard.tsx` (+ css) | the running item and its controls |
| `src/components/RemotePage/TimeRow/TimeRow.tsx` (+ css) | the clock's state and Pause time / Play time |
| `src/components/RemotePage/ShowList/ShowList.tsx` (+ css) | the Tours, Exhibits and Clips sheets |
| `src/components/RemotePage/useRedLight.ts` | the red-light preference |
| `tests/styles/remoteRedLightParity.test.ts` | red-light token parity |

**Modified**

`src/@types/remote/{DomeStatus,DomeMessage,RemoteMessage,RemoteSession}.d.ts`,
`src/utils/remote/{parseDomeMessage,parseRemoteMessage}.ts`, `src/state/remote/{selectDomeStatus,remoteReceiverSaga}.ts`,
`src/state/selection/selectors.ts`, `src/components/RemotePage/{RemotePage.tsx,RemotePage.module.css,remoteControls.module.css,useRemoteLink.ts}`,
`src/components/RemotePage/{AxisHoldButtons,SchemeSwitch,LinkStatus,LostNotice,SearchSection,TimeSection,ToggleSection,SetupSection}/*`,
`src/styles/remote.css`, and the tests under `tests/{components/RemotePage,state/remote,utils/remote}/`.

**Deleted**

The seven icon files (Task 1); `src/components/RemotePage/{TourSection,ExhibitSection}/`,
`src/utils/remote/focusNameFrom.ts` and `tests/utils/remote/focusNameFrom.test.ts` (Task 10).

## Dispatch groups

| Dispatch | Tasks | Model | Why together |
| --- | --- | --- | --- |
| A | 1, 2 | Sonnet | both preps, behaviour-preserving, the same few RemotePage files |
| B | 3, 4 | Opus (`review: yes`) | the wire contracts: types, both parsers, the status selector, the hook's parse path |
| C | 5, 6, 7 | Sonnet | the deck's skeleton: tables, sheet and tiles, now card and time row |
| D | 8, 9, 10 | Sonnet | the sheet bodies, red light, then the deletions they free |
| Controller | 11, 12 | n/a | visual check with the owner; the follow-up note |

---

### Task 1: Prep 1, the remote's icons become one component and a glyph table

**Files:**
- Create: `src/@types/remote/RemoteGlyph.d.ts`, `src/components/RemotePage/RemoteIcon/RemoteIcon.tsx`, `src/components/RemotePage/RemoteIcon/remoteGlyphs.tsx`
- Modify: `src/components/RemotePage/RemotePage.tsx:22,72`, `src/components/RemotePage/AxisHoldButtons/AxisHoldButtons.tsx:12-15,25-28`, `src/components/RemotePage/SchemeSwitch/SchemeSwitch.tsx:9-10,20-21`
- Delete: `src/components/RemotePage/HomeIcon.tsx`, `AxisHoldButtons/{Orbit,Look,Roll,Zoom}Icon.tsx`, `SchemeSwitch/{Skymap,OpenSpace}Icon.tsx`

**Contract:**

```ts
// src/@types/remote/RemoteGlyph.d.ts — Task 1 has exactly these seven; Task 5 adds the rest
export type RemoteGlyph = 'home' | 'skymap' | 'openspace' | 'orbit' | 'look' | 'roll' | 'zoom';

// RemoteIcon.tsx: renders <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
// <g fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{glyph}</g></svg>
function RemoteIcon({ glyph }: { glyph: RemoteGlyph }): ReactNode;

// remoteGlyphs.tsx: the inner paths, copied from the seven deleted files (Appendix A rows 1-7)
export const REMOTE_GLYPHS: Record<RemoteGlyph, ReactNode>;
```

The `AxisHoldButtons` and `SchemeSwitch` tables change `icon: <OrbitIcon />` to `glyph: 'orbit'` and render
`<RemoteIcon glyph={…} />`. A larger icon is sized by its parent's CSS (`svg { width; height }`), never by a prop.

- [x] Write the three new files; the seven paths come byte-for-byte from the files being deleted.
- [x] Repoint the three importers; delete the seven files.
- [x] No new test: pixel-identical, and the existing `RemotePage` tests render every icon.
- [x] `npm run typecheck:fast`; `npx vitest run tests/components/RemotePage tests/remote`.
- [x] Verify pixel-identity: shoot the remote before and after (Task 11's command, default state), and diff the two
      PNGs with `diffScreenshots` (`tools/site/utils/diffScreenshots.ts:17`, called from a scratchpad script); `changed === 0`.
- [x] Commit: "Remote icons: one RemoteIcon and a glyph table, so a new glyph is a row."

### Task 2: Prep 2, the hook owns the link state

**Files:**
- Create: `src/@types/remote/DomeLinkState.d.ts`
- Modify: `src/@types/remote/RemoteSession.d.ts:10-11`, `src/components/RemotePage/useRemoteLink.ts:28,57-58`, `src/components/RemotePage/RemotePage.tsx:32,58,59,61,86`, `src/components/RemotePage/LinkStatus/LinkStatus.tsx:7-9`

**Contract:**

```ts
// src/@types/remote/DomeLinkState.d.ts (moved out of LinkStatus's props)
export type DomeLinkState = 'looking' | 'connected' | 'lost';

// RemoteSession
-  domeThere: boolean;
+  link: DomeLinkState;
```

`useRemoteLink` reports `'lost'` after three silent seconds, otherwise `'connected'` once a status has arrived and
`'looking'` before. `LinkStatus` takes `state: DomeLinkState`. `RemotePage` reads `link` at the four sites
(header text, focus name only when `connected`, `LostNotice` when `lost`, sections `inert` unless `connected`).

- [x] Change the type, the hook and the four sites; no behaviour change.
- [x] No new test: the existing `RemotePage` test "three seconds without a status shows dome not there, with a
      way back to the code" covers it.
- [x] `npm run typecheck:fast`; `npx vitest run tests/components/RemotePage`.
- [x] Commit: "Remote link: the hook reports one link state instead of a domeThere flag the page combined with the status."

### Task 3: The protocol version on every remote message

`review: yes` (wire contract and parsers).

**Files:**
- Create: `src/data/remote/remoteProtocolVersion.ts`, `src/components/RemotePage/VersionNotice/VersionNotice.tsx`, `VersionNotice.module.css`
- Modify: `src/@types/remote/DomeMessage.d.ts`, `src/@types/remote/RemoteMessage.d.ts`, `src/@types/remote/DomeLinkState.d.ts`, `src/utils/remote/parseDomeMessage.ts:76-96`, `src/utils/remote/parseRemoteMessage.ts:19-50`, `src/state/remote/remoteReceiverSaga.ts:71` (the `send` sites gain `v`), `src/components/RemotePage/useRemoteLink.ts:44,51,53-65,76-99`, `src/components/RemotePage/LinkStatus/LinkStatus.tsx` (+ css), `src/components/RemotePage/RemotePage.tsx`
- Test: `tests/utils/remote/parseDomeMessage.test.ts`, `tests/utils/remote/parseRemoteMessage.test.ts`, `tests/components/RemotePage/RemotePage.test.tsx`, `tests/state/remote/remoteReceiverSaga.test.ts` (fixtures only)

**Contract:**

```ts
// src/data/remote/remoteProtocolVersion.ts
/** Bump on any change to a message's shape, the commands' payloads included. A message without `v` is version 1. */
export const REMOTE_PROTOCOL_VERSION = 2;

export type DomeMessage = { v: number } & ( /* the three arms, unchanged */ );
export type RemoteMessage = { v: number; from: RemoteId } & ( /* the four arms, unchanged */ );

/** Null when the text is no dome message (garbage, or another phone's message in the room). For a dome kind:
 *  the sender's `v` (1 when missing), and the validated message only when `v` is this page's version. */
export function parseDomeMessage(text: string): { v: number; message: DomeMessage | null } | null;

export type DomeLinkState = 'looking' | 'connected' | 'lost' | 'domeOlder' | 'domeNewer';
```

Rules (spec, "The protocol version"):
- **Phone:** the kind is checked before the version. A status, menu or search result whose `v` is lower sets
  `domeOlder`, higher sets `domeNewer`, equal and valid sets `connected` and is used. Any dome-kind message re-arms
  the silence timer. Every message the page sends is a typed `RemoteMessage`, including the heartbeat and the
  resent `resize` (`useRemoteLink.ts:44,51`, untyped today).
- **Dome:** `parseRemoteMessage` accepts `hello` at any `v`, so the saga pairs and answers it as today. It drops a
  `command`, `device` or `search` whose `v` is missing or differs. The saga's logic does not change; only its
  outgoing messages gain `v`.
- **Notices** (`VersionNotice`, `role="alert"`, in `LostNotice`'s place; the deck stays `inert`):

| State | `LinkStatus` text | Notice | Action |
| --- | --- | --- | --- |
| `domeOlder` | "Dome needs a reload" | "The dome runs an older Skymap than this remote. Reload the dome's page, then scan its new code." | none |
| `domeNewer` | "Remote needs a reload" | "This remote runs an older Skymap than the dome. Reload this page." | button "Reload page" → `location.reload()` |

  The `LinkStatus` mark changes shape for both, as it does for `lost` (Interaction 12, colour is never the only
  signal).

Tests first (TDD):
- [x] `parseDomeMessage`: `it('returns the version and no message for a status of another version')`: a status at
      `v: 1`, at `v: 3` and with no `v` returns `{ v: 1 | 3 | 1, message: null }`.
- [x] `parseDomeMessage`: `it("returns null for another phone's message, whatever its version")`: a `hello` and a
      `command` at `v: 1` and `v: 2` return `null`. (Regression guard: in a shared room these would otherwise read
      as a mismatch.)
- [x] `parseRemoteMessage`: `it('drops a command, device event or search of another version')`: `v` missing and
      `v: 3` return `null` for each kind.
- [x] `parseRemoteMessage`: `it('accepts a hello at any version')`: `v` missing, `1` and `3` each return a hello.
- [x] `RemotePage`: `it('a dome of another version names the page to reload, not dome not there')`: a status at
      `v: 1` shows "Dome needs a reload" and the dome-reload notice and no "Change code"; a status at `v: 3` shows
      "Remote needs a reload" with a "Reload page" button; a matching status after that shows "Connected".
- [x] `RemotePage`: `it('every message the page sends carries the protocol version')`: after a heartbeat, a resize
      resend on link open, a command and a search, every entry in `sent` has `v === REMOTE_PROTOCOL_VERSION`.
- [x] Fixtures: every hand-built message in the four test files gains `v: REMOTE_PROTOCOL_VERSION` (import the
      constant, never a literal `2`); without it the saga tests' commands are dropped.
- [x] Implement until green. `npm run typecheck:fast`; `npx vitest run tests/utils/remote tests/components/RemotePage tests/state/remote tests/remote`.
- [x] Commit: "Remote protocol: every message carries a version; a phone facing another version says which page to reload."

### Task 4: The status names what runs and what is focused

`review: yes` (Redux selectors and the wire contract).

**Files:**
- Create: `src/@types/remote/RemoteTakeover.d.ts`, `src/services/engine/helpers/targetName.ts`
- Modify: `src/@types/remote/DomeStatus.d.ts`, `src/state/selection/selectors.ts:96-119`, `src/state/remote/selectDomeStatus.ts`, `src/utils/remote/parseDomeMessage.ts:30-35,51-59`, `src/components/RemotePage/RemotePage.tsx:9,53,88`
- Test: `tests/state/remote/selectDomeStatus.test.ts`, `tests/utils/remote/parseDomeMessage.test.ts`, `tests/components/RemotePage/RemotePage.test.tsx`

**Contract:**

```ts
// src/@types/remote/RemoteTakeover.d.ts
/** What runs on the dome, as the remote shows it; mirrors `TakeoverSource` without the exhibit's `entry`. */
export type RemoteTakeover =
  | { kind: 'tour'; id: TourId; beatIndex: number; beatCount: number; paused: boolean }
  | { kind: 'exhibit'; id: ExhibitId }
  | { kind: 'clip'; id: ClipId };

// DomeStatus
-  focus: { id: string } | null;
-  tour: { id: TourId; beatIndex: number; beatCount: number; paused: boolean } | null;
+  focus: { name: string } | null;
+  takeover: RemoteTakeover | null;

// src/services/engine/helpers/targetName.ts — sibling of TARGET_IDENTITY_KEY (targetIdentityKey.ts:9), same row shape
export const TARGET_NAME: Record<FocusableTargetType, (t: FocusableTarget) => string>;
// rows read: displayName (galaxyCatalog, milkyWay, zoneOfAvoidance, starCatalog), name (structure),
// label (body, craft, earthScene, blackHole, satellite)

// selectors.ts — beside selectHoveredFocusable / selectSelectedFocusable, same doc shape
export const selectFocusedFocusable: (state: RootState) => FocusableTarget | null; // createSelector([selectFocusRow, selectFamousStarsMeta], buildFocusable)

// selectDomeStatus.ts — a table, not a ternary (simplicity.md #7)
const REMOTE_TAKEOVER: {
  [K in TakeoverSource['kind']]: (source: Extract<TakeoverSource, { kind: K }>, state: RootState) => RemoteTakeover;
};
```

`focus` is `{ name: TARGET_NAME[t.type](t) }` from `selectFocusedFocusable`, or `null`. On the phone, the header
reads `status.focus?.name`; `RemotePage` stops importing `focusNameFrom` (the file goes in Task 10), and
`TourSection` gets `status.takeover` narrowed to its tour arm until Task 8 replaces it.

Tests first:
- [x] `selectDomeStatus`: replace "reports no tour when none runs" and "reports the running tour's beat and count"
      with:
  - `it('reports a running exhibit by kind and id, without its entry')`: `takeoverStarted({ kind: 'exhibit', id: 'cosmicFlows', entry: 'fly' })` gives exactly `{ kind: 'exhibit', id: 'cosmicFlows' }`;
  - `it('reports a running clip by kind and id')`;
  - `it("reports a running tour's beat, count and paused state")`: the old test's assertions under `takeover`;
  - `it('reports nothing running as null')`.
- [x] `selectDomeStatus`: replace "reports a focused body's id, Earth included" with
      `it("names a focused body, Earth included")` → `{ name: 'Earth' }`, and add
      `it("names a focused galaxy as its card does")`: a famous galaxy's focus row reports the card's display name
      (`famousDisplayName`'s common name), not its catalogue designation.
- [x] `parseDomeMessage`: `it('accepts a status with each takeover kind')`; `it('drops an unknown takeover kind and a tour without beatCount')`;
      the "accepts a full status" fixture moves to the new shape.
- [x] `RemotePage`: `it('the header names the focus the dome reports')`: a status with `focus: { name: 'Andromeda' }`
      shows "Andromeda"; `focus: null` shows "Nothing focused". The fixture `status` moves to `takeover`.
- [x] No test for `TARGET_NAME` rows on their own: the compiler forces a row per kind, and the two selector tests
      cover the two field families most likely to be picked wrong.
- [x] Implement until green; `npm run typecheck:fast`; `npx vitest run tests/state/remote tests/utils/remote tests/components/RemotePage tests/state/selection`.
- [x] Commit: "Dome status: what runs as a takeover union and the focus by name, replacing the tour field and the focus id."

### Task 5: The deck's tables and the new glyphs

**Files:**
- Create: `src/@types/remote/RemoteSheetId.d.ts`, `src/@types/remote/RemoteShowKind.d.ts`, `src/data/remote/remoteSheets.ts`, `src/data/remote/remoteShowKinds.ts`
- Modify: `src/@types/remote/RemoteGlyph.d.ts`, `src/components/RemotePage/RemoteIcon/remoteGlyphs.tsx`

**Contract:**

```ts
export type RemoteGlyph = /* Task 1's seven */ | 'search' | 'tour' | 'exhibit' | 'clip' | 'stop' | 'time'
  | 'labels' | 'setup' | 'phone' | 'play' | 'pause' | 'prev' | 'next' | 'backward' | 'forward' | 'slower'
  | 'faster' | 'live' | 'calendar' | 'close' | 'redLight';

export type RemoteSheetId = 'search' | 'tours' | 'exhibits' | 'clips' | 'time' | 'labels' | 'setup';

// src/@types/remote/RemoteShowKind.d.ts
export type RemoteShowKind<K extends RemoteTakeover['kind']> = {
  readonly list: keyof RemoteMenu; // 'tours' | 'exhibits' | 'clips'
  readonly noun: string;           // 'Tour' | 'Exhibit' | 'Clip'
  readonly glyph: RemoteGlyph;
  readonly start: (id: Extract<RemoteTakeover, { kind: K }>['id']) => RemoteCommand;
};

// src/data/remote/remoteShowKinds.ts
export const REMOTE_SHOW_KINDS: { readonly [K in RemoteTakeover['kind']]: RemoteShowKind<K> };
// tour → goTo { kind: 'tour', tourId }; exhibit → goTo { kind: 'exhibit', exhibitId }; clip → clipStart { clipId }

// src/data/remote/remoteSheets.ts — the tiles in order; Search spans two columns
export const REMOTE_SHEETS: readonly { readonly id: RemoteSheetId; readonly label: string; readonly glyph: RemoteGlyph }[];
// Search, Tours, Exhibits, Clips, Time, Labels, Setup
```

- [x] Add the glyph rows from Appendix A (rows 8 onward). `stop` is the mockup's `exit`; `redLight` is its `moon`.
- [x] Write the four files.
- [x] No test: tables the compiler checks, and the tile order is a static literal the diff shows (`testing.md`,
      no registry restatements).
- [x] `npm run typecheck:fast`.
- [x] Commit: "Remote deck: glyph rows, the sheet table and the per-kind show table."

### Task 6: The bottom sheet and the tile library

**Files:**
- Create: `src/components/RemotePage/RemoteSheet/RemoteSheet.tsx` (+ css), `src/components/RemotePage/LibraryTiles/LibraryTiles.tsx` (+ css)
- Modify: `src/components/RemotePage/RemotePage.tsx`, `RemotePage.module.css`
- Test: `tests/components/RemotePage/RemotePage.test.tsx`

**Contract:**

```ts
type RemoteSheetProps = {
  readonly id: RemoteSheetId;           // heading text and glyph come from REMOTE_SHEETS
  readonly onClose: () => void;
  readonly initialFocus?: 'heading' | 'field'; // 'field' only for Search: focus its input
  readonly children: ReactNode;
};
type LibraryTilesProps = { readonly onOpen: (id: RemoteSheetId, tile: HTMLButtonElement) => void };
```

`RemotePage` holds `openSheet: RemoteSheetId | null` and the opening tile, and picks the body from a
`Record<RemoteSheetId, (session) => ReactNode>`, never an `if` chain. At this task the bodies are today's sections:
Search, Time, Labels (`ToggleSection` without its `<details>` fold), Setup, and the Tours/Exhibits/Clips lists
rendered from `TourSection` / `ExhibitSection` until Task 8.

Behaviour (spec, "Sheets"):
- The sheet rises over the card and tiles; its top never rises above the pad's vertical midpoint
  (`max-height: calc(100dvh - <header> - var(--pad-height, 40vh) / 2)` or equivalent); its content scrolls inside it.
- While a sheet is open, everything below the Home row except the sheet is `inert`. The header, pad and Home row
  stay live. Touching the pad never closes the sheet.
- `role="dialog"`, `aria-modal="false"`, `aria-labelledby` its `h2`. No focus trap, no dim.
- Opening focuses the heading (`tabIndex={-1}`), or the search field for Search. Close (44 px, top right, "Close"
  with the `close` glyph) and Escape close it, and focus returns to the opening tile.
- In 200 ms easing out, out in 150 ms easing in, on `transform` only. Under `prefers-reduced-motion: reduce` there
  is no movement.
- At 64 rem and wider the deck is the right column and the sheet opens inside it (`RemotePage.module.css:58-80`).
- Tiles are 52 px tall with the glyph above the label; Search is two columns wide, glyph and label in a row.

Tests first:
- [x] `it('a tile opens its sheet with focus inside, and Escape closes it with focus back on the tile')`.
- [x] `it('the search tile opens with the search field focused')`.
- [x] Rewrite "the menu lists the tours, exhibits and clips…" and "toggling a row sends toggleSet" to open their
      sheet first; their assertions are unchanged.
- [x] Implement; `npm run typecheck:fast`; `npx vitest run tests/components/RemotePage tests/remote`.
- [x] Shoot 390×844 with the Exhibits sheet open (Task 11's script) and look at it beside `library.png`.
- [x] Commit: "Remote deck: the tile library and its bottom sheets, the pad's upper half left live."

### Task 7: The now card and the time row

**Files:**
- Create: `src/components/RemotePage/NowCard/NowCard.tsx` (+ css), `src/components/RemotePage/TimeRow/TimeRow.tsx` (+ css)
- Modify: `src/components/RemotePage/RemotePage.tsx`, `src/components/RemotePage/TimeSection/TimeSection.tsx:30-45`
- Test: `tests/components/RemotePage/RemotePage.test.tsx`

**Contract:**

```ts
type NowCardProps = {
  readonly takeover: RemoteTakeover | null;
  readonly menu: RemoteMenu | null;   // the label lookup, via REMOTE_SHOW_KINDS[kind].list, matched on id
  readonly time: DomeStatus['time'];
  readonly onCommand: (command: RemoteCommand) => void;
};
type TimeRowProps = { readonly time: DomeStatus['time']; readonly onCommand: (command: RemoteCommand) => void };
```

States (spec, "Now card states"):

| State | Eyebrow (`role="status"`) | Title | Controls |
| --- | --- | --- | --- |
| Tour running | "Tour, beat 6 of 14" | tour label | ticks (`aria-hidden`); Previous, Pause, Next; Stop tour |
| Tour paused | "Tour, beat 6 of 14, paused" | tour label | ticks; Previous, Resume, Next; Stop tour |
| Exhibit / Clip | "Exhibit" / "Clip" | its label | Stop exhibit / Stop clip |
| Nothing | "Nothing running" | none | the line "Start a tour, exhibit or clip below" |

- A label missing from the menu (no menu yet, or a `dev` clip) shows the kind's noun as the title.
- Previous / Pause / Next: `tourPrev`, `tourTogglePause`, `tourAdvance`, 56 px tall via a remote-local `--show-target`
  on the page root, 24 px glyphs, Pause/Resume the card's one primary. Stop sends `exitTakeover`.
- The title is in `--font-family-display` and wraps to two lines at most.
- `TimeRow` holds today's status text (`TimeSection.tsx:30-35`, moved, `role="status"`, `tabular-nums`) and a
  "Pause time" / "Play time" button (`timePause` / `timeResume`). It sits on the card in every state and at the top
  of the Time sheet. The Time sheet loses its own Pause/Play button.
- Glare: text at rest `--color-fg-base`; only the title, the primary and a running row reach `--color-fg`.

Tests first:
- [x] Rewrite "a status renders the running tour and its controls" as
      `it('a running tour shows its label and beat, and Pause sends tourTogglePause')`.
- [x] `it('Stop on a running exhibit sends exitTakeover')`.
- [x] `it('Pause time sends timePause, and Play time timeResume when paused')`.
- [x] Implement; `npm run typecheck:fast`; `npx vitest run tests/components/RemotePage`.
- [x] Shoot 390×844 with a tour running and look at it beside `index.png`.
- [x] Commit: "Remote deck: the now card names what runs and carries its controls, with the clock's row."

### Task 8: The sheet bodies

**Files:**
- Create: `src/components/RemotePage/ShowList/ShowList.tsx` (+ css)
- Modify: `src/components/RemotePage/RemotePage.tsx`, `SearchSection/*`, `TimeSection/*`, `ToggleSection/*`, `SetupSection/*`, `remoteControls.module.css`
- Test: `tests/components/RemotePage/RemotePage.test.tsx`

**Contract:**

```ts
type ShowListProps<K extends RemoteTakeover['kind']> = {
  readonly kind: K;
  readonly menu: RemoteMenu | null;
  readonly takeover: RemoteTakeover | null; // a row is running iff takeover.kind === kind && takeover.id === row.id
  readonly onCommand: (command: RemoteCommand) => void;
};
```

- **ShowList:** one 48 px row per menu item: the kind's glyph, the label (wrapping), and a `play` glyph at the end.
  The running row gets `aria-current="true"` and `.on`'s doubled border. A tap sends `REMOTE_SHOW_KINDS[kind].start(id)`
  and leaves the sheet open. With no menu yet it shows "Waiting for the dome's lists". The Tours, Exhibits and
  Clips bodies in the sheet table become `ShowList`, so `TourSection` and `ExhibitSection` are no longer rendered,
  and nothing renders the "Exit exhibit or clip" button any more.
- **Time sheet:** `TimeRow` at the top, then direction as a two-way switch (Backward / Forward, showing the current
  state, sending `timeSetDirection`), the rate between Slower and Faster with its label shown, the date field, and
  Go live.
- **Labels sheet:** one row per toggle, `<input type="checkbox" role="switch">` styled as the mockup's switch, the
  "n of m on" count in the sheet heading.
- **Setup sheet:** "Add a phone" (as today). Task 9 adds the red-light switch here.
- **Search sheet:** today's field and results, restyled as list rows.

Tests first:
- [x] `it('the running exhibit is marked in Exhibits and not in Clips, though they share its id')`: the menu has
      exhibit `cosmicFlows` and clip `cosmicFlows`, with `takeover: { kind: 'exhibit', id: 'cosmicFlows' }`. Open
      Exhibits: one row with `aria-current`. Open Clips: none. (Regression: exhibit and clip share the id.)
- [x] `it('a show row sends its kind's start command')`: an exhibit row sends `goTo` exhibit, a clip row
      `clipStart`, a tour row `goTo` tour. This replaces the menu test rewritten in Task 6.
- [x] Toggle switches are driven with `fireEvent.click`, never `fireEvent.change` (`testing.md`).
- [x] Implement; `npm run typecheck:fast`; `npx vitest run tests/components/RemotePage tests/remote`.
- [x] Commit: "Remote deck: Tours, Exhibits and Clips as one list per kind, with Time, Labels, Search and Setup restyled as sheets."

### Task 9: The red-light palette

**Files:**
- Create: `src/components/RemotePage/useRedLight.ts`, `tests/styles/remoteRedLightParity.test.ts`
- Modify: `src/styles/remote.css`, `src/components/RemotePage/SetupSection/SetupSection.tsx`, `src/components/RemotePage/RemotePage.tsx`
- Test: `tests/components/RemotePage/RemotePage.test.tsx`

**Contract:**

```ts
/** The phone's red-light preference: read once from localStorage, written on change, mirrored as `data-light` on <html>. */
export function useRedLight(): readonly [on: boolean, set: (on: boolean) => void];
// key 'skymap.remote.redLight', values '1' | '0'; every storage access in try/catch; default off
```

```css
/* src/styles/remote.css */
:root[data-light='red'] { /* every colour token read under src/components/RemotePage/, values per Appendix B */ }
```

- The Setup sheet gains a "Red light" switch (`role="switch"`, the `redLight` glyph). No component reads the
  preference; the token block does all of the work.
- `--color-bg` stays `#000`, and so does `theme-color` in `remote.html`.

Tests first:
- [x] `tests/styles/remoteRedLightParity.test.ts`: `it('red light redefines every colour token the remote reads')`.
      Collect every `var(--color-*|--surface-*|--border-*)` name read in `src/components/RemotePage/**/*.css` and
      `src/styles/remote.css`, minus `--color-bg`. Each must be declared inside the `:root[data-light='red']` block.
      This guards a silent bug (blue in red light) that no other check sees.
- [x] `RemotePage`: `it('the red-light switch turns the palette red, and a reloaded page keeps it')`: click the
      switch; `document.documentElement.dataset.light === 'red'`; unmount, render again, and it is still `'red'`.
- [x] Implement; `npm run typecheck:fast`; `npx vitest run tests/styles tests/components/RemotePage`.
- [x] Shoot 390×844 with red light on and look at it beside `red.png`.
- [x] Commit: "Remote red light: one token block and a Setup switch, kept on the phone."

### Task 10: Deletions

**Files:**
- Delete: `src/components/RemotePage/TourSection/`, `src/components/RemotePage/ExhibitSection/`, `src/utils/remote/focusNameFrom.ts`, `tests/utils/remote/focusNameFrom.test.ts`
- Modify: `src/components/RemotePage/remoteControls.module.css` (rules no file composes any more), `RemotePage.module.css` (`.sections` and its media rules if unused)

- [x] Confirm zero importers first: `npm run refactor -- refs src/utils/remote/focusNameFrom.ts#focusNameFrom`, and
      the same `<file>#<symbol>` form for `TourSection` and `ExhibitSection`. Then `git rm` the files by path.
- [x] Remove the CSS rules nothing composes any more (grep each class name across `src/components/RemotePage`).
- [x] No test: deletions (`plan-style.md`). `npm run typecheck:fast`; `npx vitest run tests/components/RemotePage tests/utils/remote tests/remote`.
- [x] Commit: "Remote: delete the tour and exhibit sections and the search-based focus name the deck replaced."

### Task 11: Visual check with the owner (controller)

**Shooting.** The dev server runs in this worktree (`npm run dev`); use its port.
- **Deck states the dome's link can set:** use `npm run site:shots -- --url http://localhost:<port> --try '<hash>' --query dome --settings '{"remote":true}' --size 390x844 --name <state>`, with these hashes:
  - nothing running: `focus=body-earth`;
  - tour: `tour=grandTour`;
  - exhibit: `exhibit=cosmicFlows`;
  - clip: `clip=flyout`.

  This runs `tools/site/utils/shootPairedRemote.ts`. Do not set `searchFor`: since Task 6 the search field lives
  in a closed sheet (see Task 12).
- **States a link cannot set:** each sheet open, red light, the two version notices, and the tour paused. Use a
  scratchpad Playwright script, not committed, that pairs as `shootPairedRemote` does: read
  `__skymap.getState().remote.code` on the dome page, then open `remote.html#<code>` at 390×844 in the same
  context. It then drives the phone (tap a tile, set `localStorage['skymap.remote.redLight'] = '1'` before load).
  For the version notices, stub one dome message at another `v` through `page.evaluate` on a WebSocket to the same
  room.
- **Laptop width:** repeat the tour state and one open sheet at 1728×1000.

**Look and measure.**
- [ ] Compare each shot with the mockup for that state (`index.png`, `library.png`, `red.png`). For states with no
      mockup, check against the spec's tables.
- [ ] At 390×844: the pad, the card and the tiles fit with no scroll, and an open sheet leaves the pad's upper half
      visible.
- [ ] Measure the touch targets in the browser (`getBoundingClientRect`): transport ≥ 56 px, tiles ≥ 52, rows ≥ 48,
      everything else ≥ 44.
- [ ] Check with reduced motion on (`page.emulateMedia({ reducedMotion: 'reduce' })`): the sheet appears without
      sliding.
- [ ] Do the `ui-ux.md` "Before you commit" pass: keyboard only at 1728 (Tab, Escape, focus back on the tile, the
      ring visible), and the copy read once.

**Owner review.**
- [ ] Before/after pairs for the owner, one dash check per section, never a whole page. Today's remote is
      `current.png` in the mockup folder, or a shot of `main`.
  - the top part (icons only);
  - the now card with a tour;
  - the now card with an exhibit;
  - nothing running;
  - each sheet, by itself;
  - red light;
  - each version notice.
- [ ] Record the verdicts in the ledger. Fix what the owner rules, one commit per fix.

### Task 12: Follow-up for the branch that lands second (controller, no edits here)

The site's remote docs and shots live on `site/16-pass-3` and are not on main. Add this note to the PR description,
so whichever branch lands second does it:
- [ ] **"Fly from the phone"** (dome-setup page, `site/16-pass-3`): its `AnnotatedShot` marks each part of the old
      remote. Retake the `guide-remote` shot, move the numbered marks onto the deck's parts, and rewrite the
      descriptions (now card, tiles, sheets, red light, the version notices).
- [ ] **`shootPairedRemote`** (`tools/site/utils/shootPairedRemote.ts`, on main and reworked on `site/16-pass-3`):
      its `searchFor` step types into a search field that now sits in a closed sheet, so it times out. The header
      now names the focus without a search, so the step and the `features-remote` row's `searchFor: 'Earth'`
      (`packages/website/src/data/siteShots.ts:403`) go, along with the `SiteShotSettings.searchFor` doc line
      about the remote (`packages/website/src/@types/SiteShotSettings.d.ts:52`).
- [ ] **Backlog:** delete the UI & UX line "The remote's header reads 'Focused'", which exists only on
      `site/16-pass-3`.
- [ ] `docsUrlParams.ts:127` (`remote` row) still holds, so it needs no change.

## Definition of Done

**Deliverables**
- `RemoteIcon` and `REMOTE_GLYPHS`, with no per-file icon left under `src/components/RemotePage/`.
- `DomeLinkState` on `RemoteSession.link`, with `domeOlder` and `domeNewer`.
- `REMOTE_PROTOCOL_VERSION` (2) on every `DomeMessage` and `RemoteMessage`.
- `RemoteTakeover` on `DomeStatus.takeover`; `DomeStatus.focus` is `{ name }`.
- `TARGET_NAME` and `selectFocusedFocusable`.
- `REMOTE_SHEETS` and `REMOTE_SHOW_KINDS`.
- `NowCard`, `TimeRow`, `ShowList`, `RemoteSheet`, `LibraryTiles`, `VersionNotice`.
- The `[data-light='red']` block and `useRedLight`, with the parity test green.
- `TourSection`, `ExhibitSection` and `focusNameFrom` gone.

**Observable behaviours** (by hand, phone paired to a dev dome):
- A tour runs: the card shows its name and beat ticks; Pause, Resume, Previous, Next and Stop tour work.
- An exhibit, then a clip: the card names each with its kind, and Stop ends it.
- Nothing running: the card says so, and the time row still works.
- The header names a focused galaxy, a planet and a structure without any search.
- Every tile opens its sheet with the pad's upper half live and still steering. Close and Escape both work, and
  focus returns to the tile.
- The running exhibit is marked in Exhibits only, even with "Cosmic Flows" in both lists.
- Red light turns every surface red, and a reload keeps it.
- A phone left open across a protocol bump shows "Remote needs a reload", or "Dome needs a reload" when the dome is
  the older side.
- At 1728 wide, the deck and its sheets stay in the right column.

**Deferral boundary** (spec, "Out of scope"): no fix for the duplicate entries, no new commands, no jump to beat,
no build hash, no Wake Lock, no change to the app's own HUD icons. Task 12's site edits belong to the branch that
lands second.

## Appendix A — glyph data

These are the paths inside `RemoteIcon`'s wrapper (24-unit viewBox, stroke 1.75, round caps and joins), from the
mockup's `build.mjs`.
- `P(d)` is `<path d={d} />`, and `C(cx, cy, r)` is `<circle cx cy r />`.
- `F(…)` wraps its contents in `<g fill="currentColor">`.

| # | Glyph | Inner elements |
| --- | --- | --- |
| 1 | home | `P('M4 11.5 12 4l8 7.5M6 10v9.5h12V10M10 19.5v-5h4v5')` |
| 2 | skymap | `P('M12 3c.8 5.2 3.8 8.2 9 9-5.2.8-8.2 3.8-9 9-.8-5.2-3.8-8.2-9-9 5.2-.8 8.2-3.8 9-9z')` |
| 3 | openspace | `C(12,12,5)` + `P('M20.2 8.6c1.2 1.4 1.3 2.5.6 3.2-1.6 1.6-6.3.9-10.4-1.6M3.8 15.4c-1.2-1.4-1.3-2.5-.6-3.2 1-1 3.2-1.2 5.6-.6')` |
| 4 | orbit | `P('M19 12a7 7 0 1 1-2.1-5M19 4v3.5h-3.5')` + `C(12,12,1.5)` |
| 5 | look | `P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z')` + `C(12,12,2.75)` |
| 6 | roll | `P('M5 12h14M20 8.5A8.5 8.5 0 0 0 5.5 6M4 15.5A8.5 8.5 0 0 0 18.5 18M5.5 2.5V6H9M18.5 21.5V18H15')` |
| 7 | zoom | `C(10.5,10.5,6.5)` + `P('M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6')` |
| 8 | search | `C(10.5,10.5,6.5)` + `P('M15.5 15.5 20.5 20.5')` |
| 9 | tour | `C(5.5,18,2)` + `C(18.5,6,2)` + `P('M7.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8.5')` |
| 10 | exhibit | `P('M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z')` + `P('M12 8.5c.35 2.1 1.4 3.15 3.5 3.5-2.1.35-3.15 1.4-3.5 3.5-.35-2.1-1.4-3.15-3.5-3.5 2.1-.35 3.15-1.4 3.5-3.5z')` |
| 11 | clip | `P('M3.5 8.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2zM15.5 10.5l5-3v9l-5-3z')` |
| 12 | stop | `P('M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 8l-4 4 4 4M6 12h9')` |
| 13 | time | `C(12,12,8.5)` + `P('M12 7.5V12l3 2')` |
| 14 | labels | `P('M3.5 12.5v-7a2 2 0 0 1 2-2h7l8 8a1.6 1.6 0 0 1 0 2.3l-6.7 6.7a1.6 1.6 0 0 1-2.3 0z')` + `C(8,8,1.4)` |
| 15 | phone | `P('M14.5 13v5.5a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H10M8.5 17.5h2M18 3.5v7M14.5 7h7')` |
| 16 | setup | `P('M4 7h8M16 7h4M4 17h4M12 17h8')` + `C(14,7,2)` + `C(10,17,2)` |
| 17 | play | `F(P('M8 5.5v13l10.5-6.5z'))` |
| 18 | pause | `F(<rect x="6.5" y="5" width="3.5" height="14" rx="1"/><rect x="14" y="5" width="3.5" height="14" rx="1"/>)` |
| 19 | prev | `P('M6.5 5.5v13')` + `F(P('M18.5 5.8v12.4L9.5 12z'))` |
| 20 | next | `P('M17.5 5.5v13')` + `F(P('M5.5 5.8v12.4L14.5 12z'))` |
| 21 | backward | `P('M19 12H5M11 6l-6 6 6 6')` |
| 22 | forward | `P('M5 12h14M13 6l6 6-6 6')` |
| 23 | slower | `P('M6 12h12')` |
| 24 | faster | `P('M12 6v12M6 12h12')` |
| 25 | live | `F(C(12,12,2.25))` + `P('M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2')` |
| 26 | calendar | `P('M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8.5 3v4M15.5 3v4')` |
| 27 | close | `P('M6.5 6.5l11 11M17.5 6.5l-11 11')` |
| 28 | redLight | `P('M19.5 14.5A8 8 0 1 1 9.5 4.5a6.5 6.5 0 0 0 10 10z')` |

Rows 1–7 must equal the paths in the files Task 1 deletes; if they differ, the deleted files win.

## Appendix B — red-light values

These come from the mockup's `.red` block (`c-show-deck/index.html:24-31`). The parity test decides the full list.
A token the mockup lacks (for example `--border-hover`) takes a value in the same family: hue 5–10°, alpha matching
its blue original.

| Token | Value |
| --- | --- |
| `--color-fg` | `#ff8a78` |
| `--color-fg-base` | `#f07a68` |
| `--color-fg-muted` | `rgba(240, 110, 90, 0.85)` |
| `--color-fg-tertiary` | `rgba(240, 110, 90, 0.68)` |
| `--color-fg-dim` | `rgba(220, 90, 70, 0.5)` |
| `--color-accent` | `#ff6a52` |
| `--surface-panel` | `rgba(28, 4, 2, 0.8)` |
| `--surface-card-strong` | `rgba(28, 4, 2, 0.85)` |
| `--surface-control` | `rgba(90, 16, 10, 0.45)` |
| `--surface-control-active` | `rgba(130, 24, 14, 0.6)` |
| `--border-card` | `rgba(255, 90, 70, 0.2)` |
| `--border-control` | `rgba(255, 90, 70, 0.28)` |
| `--border-divider` | `rgba(255, 90, 70, 0.13)` |
| `--border-section` | `rgba(255, 90, 70, 0.11)` |
