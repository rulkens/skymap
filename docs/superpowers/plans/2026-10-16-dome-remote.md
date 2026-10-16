# Dome remote (local) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a local network, a phone or laptop opens `remote.html`, pairs with a dome page at `/?dome&remote` in
one step, and drives camera, focus, tours, exhibits, clips, time and label toggles while the dome shows only the sky.

**Architecture:** A WebSocket relay inside the Vite server moves text between the dome and its remotes in a room. The
remote page reads its trackpad with the canvas's own device channel and sends `DeviceEvent`s plus named commands;
the dome's receiver saga parses them, runs each remote's device events through `inputSourceSaga` as its own input
source, maps commands to existing actions through one registry, answers searches, and publishes a status snapshot.
Nothing reaches into the engine.

**Tech Stack:** TypeScript, React, Redux Toolkit, redux-saga (`typed-redux-saga`, `eventChannel`), Vite plugin API,
`ws`, `qrcode-generator`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-11-dome-remote-design.md` (input path:
`docs/superpowers/specs/completed/2026-10-15-input-architecture-design.md`).

## Global Constraints

- Nothing outside `src/services/engine/` calls into the engine; the receiver only dispatches actions.
- No wire payload carries a time stamp the dome uses: rows needing one read `env.nowMs` (or `goLiveNowAction()`).
- The remote page's import graph contains nothing under `src/services/gpu/` or `src/services/engine/`, and it never
  touches `navigator.gpu`, so it loads over plain `http://` on a LAN address.
- Each side parses only its inbound union; anything unknown, malformed or oversized drops silently.
- Relay limits: messages over 16 KB dropped (dome-side status and search answers must fit), at most four sockets per room, an empty room forgotten.
- Room codes: local relay 8 characters of Crockford base32 (40 bits) from `crypto.getRandomValues`, fresh per dome
  page load. The QR encodes `<origin>/remote.html#<room>`.
- Heartbeat: the remote sends `hello` every 1000 ms; the dome closes a remote's source after 3000 ms without any
  message from it; the remote shows "dome not there" after 3000 ms without a status. Status on change is throttled
  to at most four a second.
- Search: query capped at 64 characters, at most ten matches.
- iOS: never call `setPointerCapture`. The trackpad element carries `touch-action: none` (the landmine at
  `src/styles/global.css:34-49`).
- Moves and renames go through `npm run move-files -- <from> <to>`, never `git mv`.
- One symbol per file in `utils/`, `@types/`, `data/`; types never inline (a component's own `Props` excepted).
- UI work (Tasks 6, 7) reads `docs/superpowers/conventions/ui-ux.md` first and imports `src/styles/tokens.css`.
- Briefs say `npx prettier --write <files>`, never `npm run format`.
- Perf ruling (plan time): no per-frame cost. The receiver runs off-frame; the status selector runs at most four
  times a second plus once per `hello`, and `selectFocusedFocusable` is memoised. No perf gate.

## Review Focus

1. **A phone drag that the browser steals.** Without `touch-action: none` on the trackpad, mobile browsers pan or
   zoom the page and fire `pointercancel` after the first move, so the dome's sky moves one step and freezes. Pinned
   in Task 7 (a stylesheet assertion, since jsdom has no layout).
2. **The remote page reloads mid-drag.** It comes back with a new `RemoteId`; its first held gesture must take the
   camera over at once (input architecture Q6), and the old source must still end and detach after 3 s of silence
   without ending the new gesture. Pinned in Task 4.
3. **Garbage on the link.** Non-JSON text, JSON that is not an object, a known `kind` with a wrong field, a command
   name outside the registry: each drops, nothing throws inside the receiver loop. Pinned in Tasks 1 and 4.
4. **A burst of state changes.** A tour beat or a time scrub can change state dozens of times a second; the dome
   must send at most four statuses a second from changes (plus one per `hello`), never one per action. Pinned in
   Task 4.
5. **Device events before a size.** A remote whose first device event is a `move` (it joined mid-touch) must not
   attach a source with no aspect; the pump waits for a `resize`, and a returning remote is seeded with its last
   one. Pinned in Task 4.

---

### Task 1: Device channel rename, wire types and the two message parsers

**review: yes** (parsers)

**Files:**
- Move: `src/services/input/createCanvasDeviceChannel.ts` → `src/services/input/createDeviceChannel.ts` via
  `npm run move-files -- src/services/input/createCanvasDeviceChannel.ts src/services/input/createDeviceChannel.ts`,
  then rename the function and widen its parameter to `element: HTMLElement`; update the call in
  `src/hooks/useEngine.ts:95` and the header comment. Grep for the old name afterwards (docs and website facts
  included).
- Create: `src/@types/remote/RoomCode.d.ts`, `RemoteId.d.ts`, `RemoteLinkStatus.d.ts`, `RemoteLink.d.ts`,
  `RemoteTransport.d.ts`, `RemoteMessage.d.ts`, `DomeMessage.d.ts`, `DomeStatus.d.ts`, `RemoteSearchMatch.d.ts`,
  `RemoteCommandPayloads.d.ts`, `RemoteCommand.d.ts`
- Create: `src/utils/remote/parseDeviceEvent.ts`, `src/utils/remote/parseRemoteMessage.ts`,
  `src/utils/remote/parseDomeMessage.ts`
- Test: `tests/utils/remote/parseDeviceEvent.test.ts`, `tests/utils/remote/parseRemoteMessage.test.ts`,
  `tests/utils/remote/parseDomeMessage.test.ts`

**Interfaces — produces (exact):**

```ts
export type RoomCode = string;
export type RemoteId = string;
export type RemoteLinkStatus = 'connecting' | 'open' | 'closed';
export type RemoteLink = {
  send: (text: string) => void; // best effort, no acknowledgement
  onText: (listener: (text: string) => void) => Unsubscribe;
  onStatus: (listener: (status: RemoteLinkStatus) => void) => Unsubscribe;
  close: () => void;
};
export type RemoteTransport = {
  newRoom: () => RoomCode;
  open: (room: RoomCode) => RemoteLink;
  pairingOrigins: () => Promise<readonly string[]>;
};
export type RemoteMessage = { from: RemoteId } & (
  | { kind: 'hello' }
  | { kind: 'command'; command: RemoteCommand }
  | { kind: 'device'; event: DeviceEvent }
  | { kind: 'search'; requestId: string; query: string }
);
export type DomeMessage =
  | { kind: 'status'; status: DomeStatus }
  | { kind: 'searchResults'; requestId: string; matches: readonly RemoteSearchMatch[] };
export type DomeStatus = {
  focus: { id: string } | null;
  tour: { id: TourId; beatIndex: number; beatCount: number; paused: boolean } | null;
  time: { simDays: number; rateIndex: number; direction: 1 | -1; paused: boolean; mode: 'live' | 'manual' };
  toggles: readonly { id: string; label: string; enabled: boolean }[];
};
export type RemoteSearchMatch = { name: string; kind: string; action: PaletteAction };
export type RemoteCommandPayloads = {
  goTo: PaletteAction; home: null; tourAdvance: null; tourPrev: null; tourTogglePause: null;
  clipStart: { clipId: ClipId }; exitTakeover: null; timePause: null; timeResume: null;
  timeSetRate: { rateIndex: number }; timeSetDirection: { direction: 1 | -1 }; timeSetDate: { simDays: number };
  timeGoLive: null; toggleSet: { id: string; enabled: boolean };
};
export type RemoteCommand = {
  [K in keyof RemoteCommandPayloads]: { name: K; payload: RemoteCommandPayloads[K] };
}[keyof RemoteCommandPayloads];

export function parseDeviceEvent(raw: unknown): DeviceEvent | null;
/** The command arm is validated by the caller's `parseCommand` (the registry's, Task 2), so `utils/` never
 *  imports a composition value and the returned command is honestly typed. */
export function parseRemoteMessage(
  text: string,
  parseCommand: (raw: unknown) => RemoteCommand | null,
): RemoteMessage | null;
export function parseDomeMessage(text: string): DomeMessage | null;
```

`Unsubscribe` is `() => void`; reuse an existing alias if `src/@types/` has one, else declare it in `src/@types/remote/`.

**Rules:**
- `parseDeviceEvent`: the five `DeviceEvent` arms only (`down|move|up|cancel`, `wheel`, `leave`, `resize`); `t`
  finite; `pointer` an integer in 0..2³¹; `pointerType` one of three; `button` 0, 1 or 2; `at.x`, `at.y` finite in
  −10..11 (a drag followed off the trackpad lands outside 0..1); `mods` four booleans; `ratio` finite and positive; `widthPx`, `heightPx` finite in 1..16384. Returns a fresh
  object with only the known fields.
- `parseRemoteMessage`: `JSON.parse` in a try; an object with a string `from` of 1..64 chars and a known `kind`;
  `device` runs `parseDeviceEvent`; `search` needs a string `requestId` of 1..64 chars and a string `query`, cut to 64
  characters; `command` runs `parseCommand(raw.command)` and drops the message on `null`.
- `parseDomeMessage`: shape checks on `status` and `searchResults` sufficient for the remote page to render without
  crashing (every field it reads has the right primitive type); unknown kinds drop.

- [ ] Run the move, rename and widen; `npm run typecheck:fast`. No new test for the rename.
- [ ] Tests `parseDeviceEvent`: `every DeviceEvent arm round-trips through JSON` (one fixture per arm, asserting
      `parseDeviceEvent(JSON.parse(JSON.stringify(e)))` equals `e`); `drops an unknown kind`; `drops a non-finite
      number` (NaN serialises to null, so feed objects directly); `drops an at far outside the surface`, `keeps the up of a drag that ended off the trackpad`; `drops a zero or huge
      size`; `drops extra fields from the result`.
- [ ] Tests `parseRemoteMessage`: `drops non-JSON text`; `drops JSON that is not an object`; `drops a message with no
      from`; `drops an unknown kind`; `cuts a search query to 64 characters`; `a command the parseCommand stub
      rejects drops the message`; `a device message with a bad event drops`.
- [ ] Tests `parseDomeMessage`: `accepts a full status`; `drops a status with a missing time field`; `accepts search
      results`; `drops an unknown kind`.
- [ ] Implement; tests pass; `npx prettier --write` the touched files; commit.

---

### Task 2: The command registry

**review: yes** (actions and their payload bounds)

**Files:**
- Create: `src/@types/remote/RemoteCommandEnv.d.ts`, `src/@types/remote/RemoteCommandSpec.d.ts`
- Create: `src/compositions/remoteCommands.ts` (it reads `APP_EXHIBITS`, a composition value, as
  `selectToggleRows` does)
- Create: `src/compositions/parseRemoteCommand.ts`, `src/compositions/runRemoteCommand.ts`
- Test: `tests/compositions/remoteCommands.test.ts`

**Interfaces:**
- Consumes: `RemoteCommandPayloads` (Task 1); `ToggleRow` (`src/@types/settings/ToggleRow.d.ts`);
  `actionsForPaletteAction` (`src/utils/palette/actionsForPaletteAction.ts`).
- Produces (exact):

```ts
export type RemoteCommandEnv = { nowMs: number; toggleRows: readonly ToggleRow[] };
export type RemoteCommandSpec<P> = {
  parse: (raw: unknown) => P | undefined; // undefined drops it (null is a real payload)
  toActions: (payload: P, env: RemoteCommandEnv) => UnknownAction[];
};
export const REMOTE_COMMANDS: { [K in keyof RemoteCommandPayloads]: RemoteCommandSpec<RemoteCommandPayloads[K]> };
/** `{ name, payload }` with a registry name and a payload its row's `parse` accepts; null otherwise.
 *  Passed to `parseRemoteMessage` as its `parseCommand`. */
export function parseRemoteCommand(raw: unknown): RemoteCommand | null;
/** The parsed command's row builds its actions. */
export function runRemoteCommand(command: RemoteCommand, env: RemoteCommandEnv): UnknownAction[];
```

**Rows (action creators verified on main 2026-10-16):**

| Name | Parse | Actions |
| --- | --- | --- |
| `goTo` | `PaletteAction`: `focus` (`focusId` string 1..256), `exhibit` (id in `APP_EXHIBITS`), `tour` (id in `tourRegistry`), `flyTo` (`lonDeg` −180..180, `latDeg` −90..90, `altKm` finite, 0..1e6) | `actionsForPaletteAction(action)` |
| `home` | `null` | `goHome()` (`src/state/selection/goHome.ts`) |
| `tourAdvance` / `tourPrev` / `tourTogglePause` | `null` | `advanceTour()` / `prevBeat()` / `togglePause()` (`src/state/tour/tourActions.ts`) |
| `clipStart` | `clipId` in `clipRegistry` | `startClip(clipId)` (`src/state/camera/clipActions.ts`) |
| `exitTakeover` | `null` | `exitTakeover()` (`src/state/takeover/takeoverActions.ts`) |
| `timePause` / `timeResume` | `null` | `pause({ nowMs })` / `resume({ nowMs })` |
| `timeSetRate` | integer in `0 .. RATE_LADDER.length − 1` (`src/data/time/rateLadder.ts`) | `setRate({ rateIndex, nowMs })` |
| `timeSetDirection` | `1` or `−1` | `setDirection({ direction, nowMs })` |
| `timeSetDate` | finite `simDays` within ±1e7 | `setSimDays({ simDays, nowMs })` (keeps rate and pause) |
| `timeGoLive` | `null` | `goLiveNowAction()` (`src/state/time/goLiveNowAction.ts`; the time bar's Now button) |
| `toggleSet` | `id` string, `enabled` boolean | `row.set(enabled)` for the `env.toggleRows` row with that id; `[]` if none |

`null`-payload rows accept `null` or `undefined` and nothing else.

- [ ] Tests, one `describe` per row, each with `builds its actions` and `rejects a malformed payload` (and `rejects an
      unknown id` for `goTo`'s exhibit and tour arms, `clipStart` and `toggleSet`). Plus: `an unknown command name
      parses to null`; `a non-object command parses to null`; `time rows stamp env.nowMs, and a nowMs field in the payload is ignored`; `timeGoLive builds a
      goLive action`.
- [ ] Implement; tests pass; prettier; commit.

---

### Task 3: Search answers and the status snapshot

**Files:**
- Create: `src/utils/palette/paletteRowLabel.ts`; modify `src/components/CommandPalette/paletteRows.tsx` so every
  `ROW_VIEW` entry takes its primary text from `paletteRowLabel(row).name` (behaviour unchanged).
- Create: `src/@types/palette/PaletteRowLabel.d.ts`, `src/@types/remote/RemoteSearchInputs.d.ts`
- Create: `src/utils/remote/remoteSearchMatches.ts`
- Create: `src/utils/selection/focusIdOf.ts`; modify `src/state/url/hashParamSources.ts:145-163` to call it
- Create: `src/compositions/selectDomeStatus.ts`
- Test: `tests/utils/palette/paletteRowLabel.test.ts`, `tests/utils/remote/remoteSearchMatches.test.ts`,
  `tests/compositions/selectDomeStatus.test.ts`

**Interfaces — produces (exact):**

```ts
export type PaletteRowLabel = { readonly name: string; readonly kind: string };
export function paletteRowLabel(row: ScoredRow): PaletteRowLabel;

export type RemoteSearchInputs = {   // its own file, src/@types/remote/RemoteSearchInputs.d.ts
  entries: readonly FamousGalaxyMetaEntry[];
  aliasIndex: readonly AliasIndexEntry[];
  structures: readonly StructureSearchEntry[];
  layerRows: readonly LayerSearchEntry[];
};
/** At most ten; an empty or whitespace query gives []. */
export function remoteSearchMatches(inputs: RemoteSearchInputs, query: string): RemoteSearchMatch[];

export function selectDomeStatus(state: RootState, toggleRows: readonly ToggleRow[], nowMs: number): DomeStatus;
```

- `remoteSearchMatches` = `rankPaletteMatches` (`src/utils/palette/rankPaletteMatches.ts:62`) → first ten →
  `{ ...paletteRowLabel(row), action: actionForRow(row) }`. The receiver reads the four inputs with the same
  selectors as `CommandPaletteContainer.tsx:25-28`.
- `selectDomeStatus`:
  - `focus` is the id the URL's `focus` param would carry (`URL_HASH_FOR[focused.type](focused)` over
    `selectFocusedFocusable`, as at `src/state/url/hashParamSources.ts:145-163`, but WITHOUT the Earth-is-home
    omission), or `null`. Extract that ladder into `src/utils/selection/focusIdOf.ts` and call it from both places
    rather than copying it.
  - `tour` from `selectTakeoverSource` (`kind === 'tour'`), `selectTourBeatIndex`, `selectTourTotal`,
    `selectTourPaused`; `null` when no tour runs.
  - `time` from `selectTimeState` with `simDays = deriveSimDays(time, nowMs)`.
  - `toggles` is `toggleRows` without `set`.

- [ ] Tests: `paletteRowLabel names every ScoredRow kind` (one fixture per kind, names matching what the palette
      shows today); `remoteSearchMatches caps at ten`; `an empty or whitespace query gives no matches`; `each match
      carries actionForRow's action`; `selectDomeStatus reports no tour when none runs`; `reports the running tour's
      beat and count`; `reports a focused body's id, Earth included`; `derives simDays at the nowMs it is handed`.
- [ ] Implement; tests pass; prettier; commit.

---

### Task 4: The `remote` slice and the receiver saga

**review: yes** (Redux state and sagas)

**Files:**
- Create: `src/@types/remote/RemoteState.d.ts`, `src/state/remote/remoteSlice.ts`, `src/state/remote/selectors.ts`
- Modify: `src/store/constants.ts` (add `remoteRoute`, beside `arrivalRoute` at :46), `src/store/rootReducer.ts`
- Create: `src/state/remote/remoteReceiverSaga.ts`
- Create: `src/data/remote/remoteTimings.ts` (`HELLO_INTERVAL_MS` 1000, `REMOTE_SILENCE_MS` 3000,
  `STATUS_MIN_INTERVAL_MS` 250; one symbol per file — split into three files)
- Create: `tests/helpers/remote/createMemoryTransport.ts` (an in-memory `RemoteTransport`: the test sends text "from
  a remote" and reads what the dome sent)
- Test: `tests/state/remote/remoteReceiverSaga.test.ts` (real store, `createAppStore` as the input-architecture
  integration tests do)

**Interfaces — produces (exact):**

```ts
export type RemoteState = {
  readonly phase: 'off' | 'waiting' | 'paired';
  readonly code: RoomCode | null;
  readonly pairingUrl: string | null;
};
// actions
remotePairingStarted({ code, pairingUrl }); // phase → 'waiting'
remotePaired();                             // phase → 'paired'
export const selectRemote: (state: RootState) => RemoteState;

export function* remoteReceiverSaga(transport: RemoteTransport, layerRows: readonly LayerSettingsRow[]): SagaIterator;
```

**Behaviour:**
- Start: `newRoom()`, `pairingOrigins()`, put `remotePairingStarted({ code, pairingUrl: origins[0] + '/remote.html#' +
  code })`, `open(code)`, read `onText` through an `eventChannel` (expanding buffer).
- Each text → `parseRemoteMessage`; `null` drops. Every parsed message refreshes its remote's last-seen time.
- `hello`: put `remotePaired()` and `setUiHidden(true)` (`src/state/ui/uiSlice.ts:53`) on the first one only; send a
  status now.
- Messages are parsed with `parseRemoteMessage(text, parseRemoteCommand)`.
- `command`: `runRemoteCommand(command, { nowMs: performance.now(), toggleRows })`, put each action in order.
- `device`: route to that remote's source. With no live source for `from`, open a channel
  (a plain `channel(buffers.expanding())`), put the remote's last `resize` into it first if one is remembered, and fork
  `inputSourceSaga('remote:' + from, channel)`. Remember every `resize` per remote.
- Silence: a remote with no message for `REMOTE_SILENCE_MS` has its channel closed (END), so the pump's `finally`
  ends any open gesture and detaches. A link `closed` status closes every remote's channel.
- `search`: `remoteSearchMatches` over the four selectors; send `searchResults` with the same `requestId`.
- Status: on any store change, send at most one status per `STATUS_MIN_INTERVAL_MS` (trailing send, so the last
  change always goes out), plus one per `hello`. `toggleRows = selectToggleRows(state, layerRows)`.
- `finally`: close every remote channel, close the link.

- [ ] Tests (real store, memory transport, fake timers where time matters): `a command message dispatches exactly its
      row's actions`; `an unknown command dispatches nothing`; `garbage text is dropped and the loop keeps running`
      (a valid message after it still works); `a remote's device events reach the input slice under remote:<id>`;
      `device events before any resize attach nothing`; `three seconds of silence end an open gesture and detach the
      source`; `a closed link ends an open gesture and detaches`; `a returning remote attaches again with its last
      size`; `two remotes are two sources, and the second one's press takes the camera over`; `a reloaded remote
      (new id) takes over while the old id is still within its silence window`; `a search answers with the same
      requestId`; `a hello is answered with a status`; `the first hello pairs and hides the UI`; `fifty state changes
      in one second send at most four statuses`.
- [ ] Implement; tests pass; prettier; commit.

---

### Task 5: The local relay and the local transport

**Files:**
- Create: `tools/utils/vite/remoteRelayPlugin.ts` (+ its types under `tools/@types/vite/` if any are named)
- Modify: `vite.config.ts` (add the plugin; add `build.rollupOptions.input` for `index.html` and `remote.html`;
  check `inlineEntryCssPlugin` with two entries and fix it if it assumes one)
- Modify: `package.json` / `package-lock.json` (`npm i -D ws @types/ws`)
- Create: `src/utils/remote/newLocalRoomCode.ts`, `src/services/remote/createLocalTransport.ts`
- Test: `tests/tools/utils/vite/remoteRelayPlugin.test.ts`, `tests/utils/remote/newLocalRoomCode.test.ts`

**Interfaces — produces:**

```ts
export function remoteRelayPlugin(): Plugin; // Vite; dev and preview servers
export function newLocalRoomCode(random?: (bytes: Uint8Array) => Uint8Array): RoomCode; // 8 Crockford base32 chars
export function createLocalTransport(): RemoteTransport;
```

**Behaviour:**
- Relay: `/__remote/<code>` upgrades to a WebSocket (`ws`, `noServer: true`, on the HTTP server's `upgrade` event,
  leaving Vite's own HMR upgrade alone) and rebroadcasts each text message to the room's OTHER sockets; messages over
  16384 bytes dropped; a fifth socket in a room refused (closed with a policy code); an empty room deleted.
  `GET /__remote/origins` returns JSON `string[]` of `http://<lan-ip>:<port>` for each non-internal IPv4 interface,
  then `http://localhost:<port>`. On server start it prints `➜  Remote:  <first origin>/remote.html` under Vite's
  own lines.
- `createLocalTransport`: `newRoom` = `newLocalRoomCode()`; `open(room)` = `WebSocket` to `/__remote/<room>` on
  `location.host` (`ws:` / `wss:` from `location.protocol`), reconnecting after a close with a one-second delay until
  `close()`; `pairingOrigins` fetches `/__remote/origins`, falling back to `[location.origin]`.

- [ ] Tests, relay on a real `http.Server` on port 0 with `ws` clients: `two sockets in one room hear each other and
      not themselves`; `a second room hears nothing`; `an oversized message is dropped`; `a fifth socket is
      refused`; `origins lists localhost last`. Room code: `is eight Crockford base32 characters`; `uses the random
      source it is handed` (fixed bytes → fixed code).
- [ ] No test for `createLocalTransport` (thin `WebSocket` wrapper; the by-eye pass covers it).
- [ ] Implement; tests pass; `npm run build` succeeds with both entries; prettier; commit.

---

### Task 6: The dome side — boot gate and pairing overlay

**Files:**
- Modify: `src/main.tsx` (after `createAppStore` at :94: if `hasUrlGate('remote')`, `runSaga(() =>
  remoteReceiverSaga(createLocalTransport(), layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides')))`)
- Create: `src/components/PairingOverlay/PairingOverlay.tsx`, `PairingOverlay.module.css`
- Create: `src/components/containers/PairingOverlayContainer.tsx`
- Modify: `src/components/App/App.tsx` (mount the container beside `ArrivalVeilContainer`, :128)
- Modify: `package.json` / `package-lock.json` (`npm i qrcode-generator`)
- Test: `tests/components/PairingOverlay/PairingOverlay.test.tsx`

**Behaviour:** shown only while `phase === 'waiting'`: the QR of `pairingUrl`, the room code as text, and the
address as text (for a device that cannot scan). Gone once paired. Tab still brings the interface back (existing).

- [ ] Read `docs/superpowers/conventions/ui-ux.md` first; copy and layout follow it.
- [ ] Tests: `shows the code and the address while waiting`; `renders nothing once paired`.
- [ ] Implement; tests pass; prettier; commit.

---

### Task 7: The remote page

**Files:**
- Create: `remote.html` (root), `src/remoteMain.tsx` (its own React root, no store, no engine)
- Create: `src/components/RemotePage/RemotePage.tsx`, `RemotePage.module.css`, and one component per section under
  `src/components/RemotePage/` (`JoinField`, `Trackpad`, `SearchSection`, `TourSection`, `ExhibitSection`,
  `TimeSection`, `ToggleSection`), each `<Name>/<Name>.tsx` + module CSS
- Create: `src/components/RemotePage/useRemoteLink.ts` (the link, the heartbeat, the latest status, "dome not there")
- Create: `src/utils/remote/focusNameFrom.ts`
- Test: `tests/components/RemotePage/RemotePage.test.tsx`, `tests/components/RemotePage/Trackpad.test.ts`,
  `tests/utils/remote/focusNameFrom.test.ts`, `tests/remote/remoteImportGraph.test.ts`

**Interfaces:**

```ts
/** The focus id's display name from what the remote already holds; null when it cannot tell. */
export function focusNameFrom(
  id: string,
  known: { searchMatches: readonly RemoteSearchMatch[] },
): string | null;
```

**Behaviour:**
- `remote.html#<code>` joins that room; without a code, one field to type it (uppercased, Crockford-normalised).
- Once joined: `hello` every `HELLO_INTERVAL_MS`; a `RemoteId` from `crypto.randomUUID()` per page load.
- Trackpad: `createDeviceChannel(trackpadElement)`, each event sent as `{ from, kind: 'device', event }`. CSS:
  `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none`.
- Sections send `command` messages: search + home (`goTo`, `home`), tours (`goTo` tour; previous / pause / next while
  one runs), exhibits and clips (`goTo` exhibit, `clipStart`, `exitTakeover`), time (pause, rate, direction, date,
  live), toggles (`toggleSet`). Lists come from `tourRegistry`, `APP_EXHIBITS` and `clipRegistry`.
- Status drives what is shown (running tour, paused state, toggle states); three seconds without one shows "dome not
  there". Focus shows `focusNameFrom(...) ?? 'Focused'`.

- [ ] Read `docs/superpowers/conventions/ui-ux.md` first.
- [ ] Tests: `the trackpad stylesheet sets touch-action none` (read the CSS module source); `a status renders the
      running tour and its controls`; `three seconds without a status shows dome not there`; `toggling a row sends
      toggleSet`; `focusNameFrom finds a name among search matches, else null`; `the remote entry's import graph
      reaches nothing under src/services/gpu or src/services/engine` (ts-morph from `src/remoteMain.tsx`, via
      `tests/helpers/conventions/parseOnlyProject`).
- [ ] Implement; tests pass; prettier; commit.

---

## Execution grouping

Four dispatches: **A** = Tasks 1–3 (pure wire, registry, search and status); **B** = Task 4 (saga, real-store
tests); **C** = Tasks 5–6 (relay, transport, boot, overlay); **D** = Task 7 (remote page). Mid-branch reviews for the
`review: yes` tasks (1, 2, 4), then one final review.

## Definition of Done

- [ ] **Deliverables:** `remote.html` + `src/remoteMain.tsx`; `remoteRelayPlugin` in `vite.config.ts`;
      `createDeviceChannel`; `parseDeviceEvent`, `parseRemoteMessage`, `parseDomeMessage`; `REMOTE_COMMANDS`,
      `parseRemoteCommand`, `runRemoteCommand`; `remoteSearchMatches`, `paletteRowLabel`, `selectDomeStatus`, `focusIdOf`; the `remote`
      slice and `remoteReceiverSaga`; the pairing overlay; `ws`, `@types/ws`, `qrcode-generator` in `package.json`.
- [ ] **By eye, side by side with main where a main behaviour exists**, dome at `/?dome&remote` and the remote in a
      second window, then a phone on the LAN (`npm run dev -- --host`): pairing overlay shows QR, code and address
      and vanishes on join with the UI hidden; trackpad orbit, two-finger pinch, tap select, double-tap focus; laptop
      right-drag pan and wheel; search → go to; home; a tour start, previous / pause / next; an exhibit and a clip,
      then exit; time pause, rate, direction, date, live; each label toggle; closing the remote mid-drag stops the
      sky within three seconds; reloading the remote resumes control. Camera behaviour under remote drags judged in
      the fisheye view.
- [ ] **Out of scope:** the Durable Object relay and public-site transport (the next PR); the full app as a
      controller; a 3D preview; signed messages and LAN HTTPS; an offline bundle; jump-to-beat and in-beat scrubbing;
      the Display, Earth and Structures settings sections.
