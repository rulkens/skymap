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
| Gesture wire shape | The pointer recognizer's events, with positions as fractions of the surface |
| Toggle scope | The Labels & Guides rows only |
| Prep packaging | Its own PR, before the feature |


## Ground preparation

Ground check run 2026-10-11: 3 of 10 touchpoints were special cases. Three prep commits, shipped as their own PR
before the feature. The spec below is written against the code as it stands after them.

1. **The gesture sink gets a name and a seat in the saga context.** Today the only door into the camera is an inline
   closure at `src/services/engine/phases/wireInput.ts:191` (store edges on gesture start, queue, wake). It becomes
   one function, registered as `SagaContext.pushGesture`. Seven test stubs gain a no-op.
2. **Palette search and its go-to runner leave the component folder.** `rankPaletteMatches`, `actionForRow`,
   `paletteRowModel` and the `RUN_ACTION` table move out of `src/components/` to `src/utils/palette/` (types to
   `src/@types/palette/`, the name list to `src/data/palette/`) (via `npm run move-files`), and the
   runner changes from `(dispatch, action) => void` to `(action) => UnknownAction[]`. Nothing under `state/` imports
   from `components/` today, and that stays true.
3. **Toggle rows are built by a selector.** The Labels & Guides row list, assembled today inside
   `LabelsAndGuidesSectionContainer.tsx:142` with setters closed over `dispatch`, becomes one pure function of state
   returning `ToggleRow[]`. The container maps those to `SectionRow`.

```ts
// SagaContext, after prep 1
pushGesture: (event: InputGestureEvent) => void;

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
  layerRows: readonly LayerSettingsRow[],
): readonly ToggleRow[];
```

The other seven touchpoints are plain additions. LAN binding needs no config change: Vite's own `--host` flag does it.

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
export type RemoteMessage =
  | { kind: 'hello' } // asks for a status now
  | { kind: 'command'; command: RemoteCommand }
  | { kind: 'gesture'; event: RemoteGestureEvent }
  | { kind: 'search'; requestId: string; query: string };

export type DomeMessage =
  | { kind: 'status'; status: DomeStatus }
  | { kind: 'searchResults'; requestId: string; matches: readonly RemoteSearchMatch[] };

export type DomeStatus = {
  focus: { id: string; name: string } | null;
  tour: { id: TourId; beatIndex: number; beatCount: number; paused: boolean } | null;
  time: { simDays: number; rateIndex: number; direction: 1 | -1; paused: boolean; mode: 'live' | 'manual' };
  toggles: readonly { id: string; label: string; enabled: boolean }[];
};

export type RemoteSearchMatch = { name: string; kind: string; action: PaletteAction };
```

- **Status is a full snapshot**, sent on change (at most four a second) and every two seconds as a heartbeat. A late
  or reconnecting remote heals on the next one. The remote treats five seconds without a status as "dome not there".
- **Search results carry the `PaletteAction`** the remote sends back in a `goTo` command, so the remote never
  encodes a focus id.
- **No version field.** Remote and dome ship from one build, and unknown kinds already drop.

### Commands

One registry. A key's presence is the allow-list, `parse` is the validation, and `toActions` is where the dome's own
clock is stamped, so no wire payload carries `nowMs`.

```ts
export type RemoteCommandPayloads = {
  goTo: PaletteAction; // focus, exhibit, tour, fly-to
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
  parse: (raw: unknown) => P | null; // null drops the message
  toActions: (payload: P, env: RemoteCommandEnv) => UnknownAction[];
};

export const REMOTE_COMMANDS: { [K in keyof RemoteCommandPayloads]: RemoteCommandSpec<RemoteCommandPayloads[K]> };
```

- `goTo` reuses `actionsForPaletteAction`. Its parser checks ids against the tour, exhibit and clip registries and
  bounds every number; a focus id is a length-capped string, resolved by the existing focus saga.
- `toggleSet` looks its id up in `env.toggleRows` and drops an unknown one.
- Tour pause stays a toggle because `togglePause` is the only action that exists; the remote shows the dome's
  reported state, so a lost message corrects itself on the next status.

### Gestures

The remote runs the existing recognizer (`attachOrbitControls`) on its trackpad element and forwards what it emits,
with pixels replaced by fractions. The dome scales them to its own canvas and calls `pushGesture`.

```ts
export type RemoteGestureEvent =
  | { kind: 'gestureStart' }
  | { kind: 'gestureEnd' }
  | { kind: 'dragAnchor'; x: number; y: number } // fractions of surface width and height
  | { kind: 'dragMove'; mode: DragMode; x: number; y: number }
  | { kind: 'pinchAnchor'; dist: number } // fraction of the surface's short side
  | { kind: 'pinchMove'; dist: number }
  | { kind: 'wheel'; deltaY: number; duringGesture: boolean; x: number; y: number };

export function toRemoteGesture(event: InputGestureEvent, surface: Size): RemoteGestureEvent;
export function fromRemoteGesture(event: RemoteGestureEvent, canvas: Size): InputGestureEvent;
```

A gesture left open ends when its link closes or goes quiet for two seconds: the dome pushes the `gestureEnd` itself,
so a dropped connection cannot leave the camera in a drag.

### The dome side

- **Gate:** `?remote`, read once at boot. Without it nothing below exists on the page.
- **Receiver saga:** forked through `runSaga`, not added to `mainSaga`. It opens the link, reads it through an event
  channel, parses each text into a `RemoteMessage`, and routes: commands through `REMOTE_COMMANDS`, gestures through
  `fromRemoteGesture` into `pushGesture`, searches through `rankPaletteMatches` (ten matches at most, query capped at
  64 characters), `hello` into an immediate status.
- **Status:** `selectDomeStatus(state, nowMs)`, published by the same saga.
- **A `remote` slice:** `{ phase: 'off' | 'waiting' | 'paired'; code: RoomCode | null; pairingUrl: string | null }`.
  It is a per-device report, like `arrival`.
- **Pairing overlay:** shown while `phase` is `waiting`: the QR, the code, and the address. On the first `hello` the
  phase becomes `paired`, the overlay goes, and `ui.uiHidden` is set. Tab still brings the interface back.

### The remote page

- **Entry:** `remote.html` with its own small React root, added to the Vite build inputs. It constructs no engine
  and never touches `navigator.gpu`, so it loads over plain `http://` on a LAN address.
- **Opening it:** `remote.html#<code>` joins that room. Without a code it shows one field to type the code in.
- **Sections:** a trackpad; search and home; tours (list, and previous / pause / next while one runs); exhibits and
  clips; time (pause, rate, direction, date, live); the label toggles.
- **Lists** of tours, exhibits and clips come from the same registries the app uses. The page follows
  `docs/superpowers/conventions/ui-ux.md` and imports the app's `tokens.css`.

### The local relay

A Vite plugin under `tools/utils/vite/`, active on the dev and preview servers.

- **`/__remote/<code>`** upgrades to a WebSocket and rebroadcasts each message to the room's other sockets.
- **`GET /__remote/origins`** returns the server's network addresses.
- **Limits:** messages over 2 KB are dropped, a room holds at most four sockets, and an empty room is forgotten.
- **Startup line:** it prints the remote's address beside Vite's own, for a device that cannot scan.
- **Dependency:** `ws`, as an explicit dev dependency.

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
  time rows stamp the `nowMs` they are handed, never one from the wire.
- **Gestures:** `fromRemoteGesture(toRemoteGesture(e, a), a)` returns `e`, and a different canvas size scales as
  expected.
- **Receiver saga:** a command message dispatches exactly its row's actions; a gesture reaches `pushGesture`; an open
  gesture is ended when the link closes; a search answers with the same `requestId`.
- **Relay:** two sockets in one room hear each other and not themselves; a second room hears nothing; an oversized
  message and a fifth socket are refused.
- **Remote bundle:** the `remote.html` entry's import graph contains nothing under `src/services/gpu/` or
  `src/services/engine/`.
- **By eye:** dome at `/?dome&remote` and the remote in a second window; then a phone on the LAN. One check per
  control group, with the dome's own camera behaviour under remote drags judged in the fisheye view.

## Build order

1. **Prep PR:** the three ground-preparation commits.
2. **Feature PR, local:** link contract and messages, command registry, gesture conversion, receiver saga and status,
   relay plugin, remote page, pairing overlay.
3. **Feature PR, public site:** the Durable Object relay and its transport, the Worker route, join rate limits.
