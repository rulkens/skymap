# Dome remote — design

A second device (phone, tablet or laptop) drives skymap while it runs on a dome with no interface on screen.

## Intent

- **Who:** a presenter running a live show under a dome.
- **Outcome:** open the dome page, pair a device in one step, and drive camera, objects, tours, exhibits, clips,
  time and label toggles from it. The dome shows only the sky.
- **Constraints:** setup must be trivial; it must work on an offline local network and from the public site; the
  offline case may depend on nothing in the cloud.
- **Success:** on a local network, `npm run dev -- --host`, open `/?dome&remote` on the dome machine, scan the code
  with a phone, and every control below works within one frame or two of the tap.

## Rulings

| Question | Ruling |
| --- | --- |
| Venue network | Both: offline local machine, and public site with internet |
| Controller shape | Light remote page first, no 3D. The full app as a controller comes later on the same link |
| Transport, local | A WebSocket relay inside the Vite server that already serves the app |
| Transport, public site | A Durable Object relay in the existing Worker, as a second feature PR |
| Pairing | QR on the dome, plus the remote's address printed in the terminal |
| Room code | A long token on the public relay (QR only); a short typed code on the local relay |
| Command wire shape | Named commands, each building existing actions (revised from "raw actions" after the ground check) |
| Gesture wire shape | Device events in unit space; the dome runs them through the input architecture's source pump (revised 2026-10-16) |
| Trackpad tap | Same as the canvas: a tap selects at the matching dome point, a double-tap focuses the selection |
| Liveness | The remote's `hello` is a one-second heartbeat; three seconds of silence closes that remote's source |
| Toggle scope | The Labels & Guides rows only |
| Prep packaging | Its own PR, before the feature (shipped as #888) |


## Ground preparation

Ground check run 2026-10-11: 3 of 10 touchpoints were special cases. Preps 2 and 3 shipped as their own PR (#888);
prep 1 became the input architecture (#913). The spec below is written against main after both.

1. **Remote input enters through the input architecture** ([spec](completed/2026-10-15-input-architecture-design.md)).
   A gesture sink in the saga context was built first, rejected as a bolt-on and reverted.
2. **Palette search and its go-to runner leave the component folder.** `rankPaletteMatches`, `actionForRow`,
   `paletteRowModel` and the `RUN_ACTION` table move out of `src/components/` to `src/utils/palette/` (types to
   `src/@types/palette/`, the name list to `src/data/palette/`) (via `npm run move-files`), and the
   runner changes from `(dispatch, action) => void` to `(action) => UnknownAction[]`. Nothing under `state/` imports
   from `components/` today, and that stays true.
3. **Toggle rows are built by a selector.** The Labels & Guides row list, assembled today inside
   `LabelsAndGuidesSectionContainer.tsx:142` with setters closed over `dispatch`, becomes one pure function of state
   returning `ToggleRow[]`. The container maps those to `SectionRow`.

```ts
// after prep 2
export function actionsForPaletteAction(action: PaletteAction): UnknownAction[];

// after prep 3
export type ToggleRow = {
  readonly id: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly set: (enabled: boolean) => UnknownAction;
};
// in src/compositions/: it reads five Layers' label selectors, and state/ imports no Layer
export function selectToggleRows(
  state: RootState,
  layerRows: readonly LayerToggleRow[],
): readonly ToggleRow[];
```

The other seven touchpoints are plain additions. LAN binding needs no config change: Vite's own `--host` flag does it.

Re-check 2026-10-16, after #913: one rename, riding the feature PR as its first commit (ruled 2026-10-16). `createCanvasDeviceChannel(canvas)` reads
nothing canvas-specific, so it becomes `createDeviceChannel(element: HTMLElement)` (via `npm run move-files`) and the
remote page runs it on its trackpad.

## Shape

### The link

A transport moves text within a room and knows nothing else. Parsing and validation live once, above every transport.

```ts
export type RoomCode = string; // format chosen by the transport, see "Pairing"
export type RemoteLinkStatus = 'connecting' | 'open' | 'closed';

export type RemoteLink = {
  send: (text: string) => void; // best effort, no acknowledgement
  onText: (listener: (text: string) => void) => Unsubscribe;
  onStatus: (listener: (status: RemoteLinkStatus) => void) => Unsubscribe;
  close: () => void;
};

export type RemoteTransport = {
  /** A fresh room for this dome session, in the transport's own format. */
  newRoom: () => RoomCode;
  open: (room: RoomCode) => RemoteLink;
  /** Origins a remote can reach this dome on; the pairing QR encodes the first. */
  pairingOrigins: () => Promise<readonly string[]>;
};
```

`pairingOrigins` exists because the dome page runs on `localhost` and cannot learn the machine's LAN address by
itself: the local transport asks the relay, and the public-site transport returns `location.origin`.

### Messages

Two disjoint unions. Each side parses only its inbound union, so its own echoes and anything unknown are dropped.

```ts
export type RemoteId = string; // random per remote page load, so two remotes in one room are two input sources

export type RemoteMessage = { from: RemoteId } & (
  | { kind: 'hello' } // the heartbeat, once a second; asks for a status now
  | { kind: 'command'; command: RemoteCommand }
  | { kind: 'device'; event: DeviceEvent }
  | { kind: 'search'; requestId: string; query: string }
);

export type DomeMessage =
  | { kind: 'status'; status: DomeStatus }
  | { kind: 'menu'; menu: RemoteMenu }
  | { kind: 'searchResults'; requestId: string; matches: readonly RemoteSearchMatch[] };

export type RemoteMenuItem<Id extends string> = { id: Id; label: string };
export type RemoteMenu = {
  tours: readonly RemoteMenuItem<TourId>[];
  exhibits: readonly RemoteMenuItem<ExhibitId>[];
  clips: readonly RemoteMenuItem<ClipId>[];
};

export type DomeStatus = {
  focus: { id: string } | null; // the durable focus id; the remote names it if it can (see below)
  tour: { id: TourId; beatIndex: number; beatCount: number; paused: boolean } | null;
  time: { simDays: number; rateIndex: number; direction: 1 | -1; paused: boolean; mode: 'live' | 'manual' };
  toggles: readonly { id: string; label: string; enabled: boolean }[];
};

export type RemoteSearchMatch = { name: string; kind: string; action: PaletteAction };
```

- **Status is a full snapshot**, sent on change (at most four a second) and in answer to every `hello`. The remote
  drives the heartbeat, so the dome keeps no timer of its own. A late or reconnecting remote heals on its next
  `hello`; the remote treats three seconds without a status as "dome not there".
- **The menu** (ruled 2026-10-16) is the remote's tour, exhibit and clip lists, built by the dome from `tourRegistry`,
  `APP_EXHIBITS` and `clipRegistry` and sent with the status in answer to every `hello`, so a reloaded or
  reconnected remote has it within a second. Tours and clips marked `dev` stay off it; `Clip` gains the optional
  `dev` flag `Tour` already has, set on the grand tour's beat clips and `flyPathDemo`.
- **Search results carry the `PaletteAction`** the remote sends back in a `goTo` command, so the remote never
  encodes a focus id. The dome ranks with `rankPaletteMatches` over the same four selectors the palette container
  reads, and maps each `ScoredRow` to `actionForRow` plus `paletteRowLabel(row): { name; kind }`, a new pure
  function that `ROW_VIEW` also reads for its primary text, so the two lists never name a row differently.
- **Focus carries no name** (ruled 2026-10-16). Names live in each kind's info card today, and a name table would
  widen the Layer contract. The remote names a focus from its latest search results (the only list it holds that
  carries focus ids) and shows "Focused" otherwise.
- **No version field.** Remote and dome ship from one build, and unknown kinds already drop.

### Commands

One registry. A key's presence is the allow-list, `parse` is the validation, and `toActions` is where the dome's own
clock is stamped, so no wire payload carries `nowMs`.

```ts
export type RemoteCommandPayloads = {
  goTo: PaletteAction; // focus, exhibit, tour, flyTo
  home: null;
  tourAdvance: null;
  tourPrev: null;
  tourTogglePause: null;
  clipStart: { clipId: ClipId };
  exitTakeover: null;
  timePause: null;
  timeResume: null;
  timeSetRate: { rateIndex: number };
  timeSetDirection: { direction: 1 | -1 };
  timeSetDate: { simDays: number };
  timeGoLive: null;
  toggleSet: { id: string; enabled: boolean };
};

export type RemoteCommand = {
  [K in keyof RemoteCommandPayloads]: { name: K; payload: RemoteCommandPayloads[K] };
}[keyof RemoteCommandPayloads];

export type RemoteCommandEnv = { nowMs: number; toggleRows: readonly ToggleRow[] };

export type RemoteCommandSpec<P> = {
  parse: (raw: unknown) => P | undefined; // undefined drops it (null is a real payload)
  toActions: (payload: P, env: RemoteCommandEnv) => UnknownAction[];
};

export const REMOTE_COMMANDS: { [K in keyof RemoteCommandPayloads]: RemoteCommandSpec<RemoteCommandPayloads[K]> };
```

- `goTo` reuses `actionsForPaletteAction`. Its parser checks ids against `tourRegistry`, `APP_EXHIBITS` and
  `clipRegistry`, and bounds `flyTo`'s `lonDeg`, `latDeg` and `altKm`; a focus id is a length-capped string, resolved
  by the existing focus saga. `APP_EXHIBITS` is a composition value, so `REMOTE_COMMANDS` lives in `src/compositions/`
  beside `selectToggleRows`.
- **The dome's clock, never the wire's.** Rows that need a time stamp read `env.nowMs`; `timeGoLive` builds
  `goLiveNowAction()`, which is what the time bar's Now button dispatches and reads the dome's clocks itself.
  `timeSetDate` is `setSimDays`: the clock keeps its rate and its paused state.
- `toggleSet` looks its id up in `env.toggleRows` and drops an unknown one.
- Tour pause stays a toggle because `togglePause` is the only action that exists; the remote shows the dome's
  reported state, so a lost message corrects itself on the next status.

### Gestures

The trackpad is an input source like the canvas: no new gesture code on either side.

- **The remote** runs `createDeviceChannel(trackpad)` and sends each `DeviceEvent` as it comes. They are already in
  unit space, the wheel already a zoom ratio, `t` the remote's own clock; recognition needs only differences
  within one source, so the two clocks never meet.
- **The dome** runs `inputSourceSaga('remote:' + from, channel)` per remote, the same pump the canvas uses: the
  dome's recognizer, the dome's active control scheme, the dome's tap and double-tap timing. A remote's surface
  aspect reaches the camera through its source record, so a portrait phone moves the sky isotropically.
- **Validation:** `parseDeviceEvent(raw: unknown): DeviceEvent | null` (`src/utils/remote/`) accepts the
  `DeviceEvent` kinds only, every number finite, `at` within −10..11 (a drag followed off the trackpad lands outside 0..1), sizes positive and bounded, pointer ids small
  integers. Anything else drops the message.
- **Lifetime of a remote's source:** forked on that remote's first device event; its channel closes when the remote
  is silent for three seconds or the link closes, and `inputSourceSaga`'s `finally` ends any open gesture and
  detaches the source. A dropped connection cannot leave the camera in a drag, and a finger resting still on the
  trackpad stays a live drag because the heartbeat keeps arriving.
- **Size on return:** the pump waits for a `resize` before it attaches. The receiver keeps each remote's last
  `resize` and puts it first into the next channel it opens for that remote, so a remote that went quiet resumes
  without resending its size.
- **Hover follows too:** a laptop mouse over the trackpad hovers the matching dome point, as on the canvas.
- **Two remotes** are two sources; the latest to start a held gesture takes the camera over (input architecture, Q6).

### The dome side

- **Gate:** `?remote`, read once at boot. Without it nothing below exists on the page.
- **Receiver saga:** forked through `runSaga`, not added to `mainSaga`. It opens the link, reads it through an event
  channel, parses each text into a `RemoteMessage`, and routes: commands through `REMOTE_COMMANDS`, device events
  into that remote's source channel (see "Gestures"), searches through `rankPaletteMatches` (ten matches at most,
  query capped at 64 characters), `hello` into an immediate status. Every message from a remote counts as a sign of
  life for its source.
- **Status:** `selectDomeStatus(state, nowMs)`, published by the same saga on change and on `hello`.
- **A `remote` slice:** `{ phase: 'off' | 'waiting' | 'paired'; code: RoomCode | null; pairingUrl: string | null }`.
  It is a per-device report, like `arrival`.
- **Pairing overlay:** shown while `phase` is `waiting`: the QR, the code, and the address. On the first `hello` the
  phase becomes `paired`, the overlay goes, and `ui.uiHidden` is set. Tab still brings the interface back.

### The remote page

- **Entry:** `remote.html` with its own small React root, added to the Vite build inputs. It constructs no engine
  and never touches `navigator.gpu`, so it loads over plain `http://` on a LAN address.
- **Opening it:** `remote.html#<code>` joins that room. Without a code it shows one field to type the code in.
  Once joined it sends `hello` every second for as long as the page is open.
- **Sections:** a trackpad; search and home; tours (list, and previous / pause / next while one runs); exhibits and
  clips; time (pause, rate, direction, date, live); the label toggles.
- **Lists** of tours, exhibits and clips arrive in the dome's `menu` (see "Messages"); the page imports no
  registry, since each one carries its full program and drags engine code and React into the bundle. The page follows
  `docs/superpowers/conventions/ui-ux.md` and imports the app's `tokens.css`.

### The local relay

A Vite plugin under `tools/utils/vite/`, active on the dev and preview servers.

- **`/__remote/<code>`** upgrades to a WebSocket and rebroadcasts each message to the room's other sockets.
- **`GET /__remote/origins`** returns the server's network addresses.
- **Limits:** messages over 16 KB are dropped (a full status and a ten-match search answer from the dome must fit), a room holds at most four sockets, and an empty room is forgotten.
- **Startup line:** it prints the remote's address beside Vite's own, for a device that cannot scan.
- **Dependency:** `ws` and `@types/ws`, as explicit dev dependencies.
- **Build:** `vite.config.ts` gains `build.rollupOptions.input` for `index.html` and `remote.html`;
  `inlineEntryCssPlugin` is checked against a second entry.
- **QR:** `qrcode-generator` (no dependencies of its own) draws the pairing code; nothing in the repo encodes QR today.

### Pairing

- **Each transport chooses its room format.** The room is created fresh on every dome page load from
  `crypto.getRandomValues`, and the QR always encodes `<origin>/remote.html#<room>`.
- **Public relay: a 128-bit token** (22 base64url characters), carried only in the QR. Nobody types it, and it is
  not guessable, which matters on a relay the whole internet can reach.
- **Local relay: an 8-character code** (Crockford base32, 40 bits), shown as text beside the QR so a laptop can type
  it. A longer token buys nothing here: on a plain `ws://` link anyone on the network can read the room from the
  traffic anyway.
- **What protects the local link** is the venue's network, and the command registry bounds what a stranger can do to
  moving the camera and flipping labels.

## Out of scope

- The full app as a controller, and a 3D preview on the remote.
- The Durable Object relay (second feature PR; same contract, new `RemoteTransport`).
- Signed messages, and HTTPS on the LAN.
- An offline bundle: an offline venue runs the dev server, since `npm run build` strips the catalogs.
- Jump-to-beat, scrubbing inside a beat, and labels on the dome.
- The Display, Earth and Structures settings sections.

## Verification

- **Command registry:** every row rejects a malformed payload and an unknown id; an unknown command name is dropped;
  no row takes a time stamp from the wire.
- **`parseDeviceEvent`:** every `DeviceEvent` kind round-trips through JSON; an unknown kind, a non-finite number, an
  `at` far outside the surface and a zero or huge size are each dropped.
- **Receiver saga (real store):** a command message dispatches exactly its row's actions; a remote's device events
  reach the `input` slice under `remote:<id>`; three seconds of silence, and separately a closed link, end an open
  gesture and detach the source; a remote that returns attaches again with its last size; two remotes are two
  sources; a search answers with the same `requestId`; a `hello` is answered with a status.
- **Relay:** two sockets in one room hear each other and not themselves; a second room hears nothing; an oversized
  message and a fifth socket are refused.
- **Remote bundle:** the `remote.html` entry's import graph contains nothing under `src/services/gpu/` or
  `src/services/engine/`.
- **By eye:** dome at `/?dome&remote` and the remote in a second window; then a phone on the LAN. One check per
  control group, with the dome's own camera behaviour under remote drags judged in the fisheye view.

## Build order

1. **Prep PRs:** #888 (palette, toggle rows) and #913 (input architecture). Both merged.
2. **Feature PR, local:** the `createDeviceChannel` rename, link contract and messages, `parseDeviceEvent`, command
   registry, receiver saga and status, relay plugin, remote page, pairing overlay.
3. **Feature PR, public site:** the Durable Object relay and its transport, the Worker route, join rate limits.
