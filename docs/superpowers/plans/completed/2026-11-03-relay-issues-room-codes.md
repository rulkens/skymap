# Relay issues room codes — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean
> protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The remote relay, not the dome page, issues the room code and pushes it to a hosting dome. This is
the prep PR for the desktop kiosk + dome app.

**Architecture:** The relay leaves the Vite plugin folder. A dome connects as **host** at `/__remote/host`
and receives `{ relay: 'room', code, origin, onSky }` frames: once on joining and again on every rotation.
Remotes join `/__remote/<code>` as today. The host's code comes from an injected `codeFor`; the Vite plugin
returns `last ?? random`, so the web app behaves as today. `newRoom`, `pairingOrigins` and the
`/__remote/origins` endpoint are deleted.

**Tech Stack:** Node `http` + `ws`, redux-saga (`typed-redux-saga`), Vitest (node environment).

**Spec:** `docs/superpowers/specs/completed/2026-09-19-desktop-offline-app-design.md` §3.1, §3.4, §7. Rulings are in
`docs/grill-sessions/desktop-dome-remote-2026-11-03.md` (Q4, Q10, Q11).

## Global Constraints

- No user-visible change in the web app. Dev codes stay random for each dome page load, and the pairing
  card shows as today.
- `MAX_SOCKETS_PER_ROOM` (4, host included), `MAX_MESSAGE_BYTES` (16384), the heartbeat, and dropping
  binary messages all stay unchanged.
- Close codes: `4001` room rotated, `4002` host replaced, and `1008` refused (unchanged).
- The `/remote.html#` route is spelled only in `src/utils/remote/pairingUrl.ts`.
- The dome protocol (`DomeMessage`, `RemoteMessage`) is untouched. `feat/remote-show-deck` is versioning
  it and edits `remoteReceiverSaga.ts`, so whichever branch lands second rebases.
- Moves go through `npm run move-files`, never `git mv`.

## Review Focus

1. **A remote forges a room frame.** A remote sends `{"relay":"room","code":"X","origin":"https://evil"}`.
   Its text reaches the host on the same socket, so the dome would show the attacker's QR. The relay drops
   any remote text whose JSON has a top-level `relay` key (pinned in Task 2).
2. **Two hosts fight over one code.** The newer host replaces the older, which is closed with `4002` and
   must not reconnect. Otherwise two tabs ping-pong forever (pinned in Tasks 2 and 3).
3. **A tablet reconnects while the dome reloads.** No host means no issued code, so the join is refused
   with `1008`. The remote keeps retrying (it stops only on `4001`) and joins once the host is back
   (pinned in Task 2).
4. **A network blip in dev.** The host reconnects with `?last=<code>` and keeps its code, so a phone
   paired before the blip stays valid (pinned in Tasks 2 and 3).
5. **A rotation reaches remotes as a rotation.** The old room's remotes get `4001` and stop retrying,
   and the host gets a fresh room frame on the same socket without being closed (pinned in Task 2).

---

### Task 1: The relay leaves the Vite folder

**Files:**

- Move: `tools/utils/vite/attachRemoteRelay.ts` → `tools/utils/remote/attachRemoteRelay.ts`
- Move: `tools/utils/vite/listRemoteOrigins.ts` → `tools/utils/remote/listRemoteOrigins.ts`
- Modify (by the tool): `tools/utils/vite/remoteRelayPlugin.ts`, `tests/tools/utils/vite/remoteRelayPlugin.test.ts`

- [ ] **Step 1: Dry run, then move**

```bash
npm run move-files -- tools/utils/vite/attachRemoteRelay.ts tools/utils/remote/attachRemoteRelay.ts --dry
npm run move-files -- tools/utils/vite/attachRemoteRelay.ts tools/utils/remote/attachRemoteRelay.ts
npm run move-files -- tools/utils/vite/listRemoteOrigins.ts tools/utils/remote/listRemoteOrigins.ts
```

- [ ] **Step 2: Verify:** `grep -rn "utils/vite/attachRemoteRelay\|utils/vite/listRemoteOrigins" src tools tests vite.config.ts`
  prints nothing, and `npm run typecheck:fast` and `npx vitest run tests/tools/utils/vite` pass.
- [ ] **Step 3: Commit** `Remote relay leaves the Vite plugin folder`.

### Task 2: The relay issues codes to hosts

review: yes (the security of the desktop pairing rests on these rules)

**Files:**

- Modify: `tools/utils/remote/attachRemoteRelay.ts`, `tools/utils/vite/remoteRelayPlugin.ts`
- Create: `tools/@types/remote/RelayOptions.d.ts`, `tools/@types/remote/RelayHandle.d.ts`,
  `src/@types/remote/RelayRoom.d.ts`, `src/@types/remote/RelayFrame.d.ts`,
  `src/data/remote/roomRotatedCloseCode.ts`, `src/data/remote/hostReplacedCloseCode.ts`
- Test: `tests/tools/utils/remote/attachRemoteRelay.test.ts`. The relay cases move here from
  `tests/tools/utils/vite/remoteRelayPlugin.test.ts`, whose `listRemoteOrigins` cases stay put.

**Interfaces (produces):**

```ts
// src/@types/remote/RelayRoom.d.ts
export type RelayRoom = { code: RoomCode; origin: string; onSky: boolean };
// src/@types/remote/RelayFrame.d.ts — the only text the relay itself sends
export type RelayFrame = { relay: 'room' } & RelayRoom;
// tools/@types/remote/RelayOptions.d.ts
export type RelayOptions = {
  codeFor: (last: RoomCode | null) => RoomCode;
  lanOrigin: () => string;
  mayHost: (request: IncomingMessage) => boolean;
  pairingOnSky: boolean;
  heartbeatMs?: number;
};
// tools/@types/remote/RelayHandle.d.ts
export type RelayHandle = {
  rotate: (from: RoomCode, to: RoomCode) => void;
  onRoom: (listener: (room: RelayRoom) => void) => Unsubscribe;
};
// tools/utils/remote/attachRemoteRelay.ts
export function attachRemoteRelay(server: Server, options: RelayOptions): RelayHandle;
// src/data/remote/roomRotatedCloseCode.ts, hostReplacedCloseCode.ts
export const ROOM_ROTATED_CLOSE_CODE = 4001;
export const HOST_REPLACED_CLOSE_CODE = 4002;
```

**Rules:**

- **Hosting:** `/__remote/host[?last=<code>]` hosts when `mayHost(request)` allows it, and is refused
  with `1008` otherwise.
- **Codes and rooms:** the code is `codeFor(last)`. One live host per code: a newer host closes the older
  one with `4002`. Only a code held by a live host admits joins, and any other join is refused with `1008`.
  The room's socket cap counts the host.
- **Routing:** remote text goes to the host only, and host text goes to the room's remotes.
- **Forged frames:** remote text whose JSON parses to an object with a top-level `relay` key is dropped.
- **Room frames:** sent to the host on joining and after `rotate`, and fired to `onRoom` listeners.
- **Rotation:** `rotate(from, to)` closes every remote of `from` with `4001`, re-keys the host's room to
  `to`, and sends the host a new frame. The host stays connected.
- **When the host leaves:** its remotes are closed with `1008`, so their retries wait for a new host.

- [ ] **Step 1: Write the failing tests** in `attachRemoteRelay.test.ts` (`startRelay(options?)` defaults
  to `codeFor: (last) => last ?? 'ROOM0000'`, `mayHost: () => true`, `pairingOnSky: true`,
  `lanOrigin: () => 'https://10.0.0.2:5173'`):
  - `a host receives a room frame on joining`: the first message equals
    `{ relay: 'room', code: 'ROOM0000', origin: 'https://10.0.0.2:5173', onSky: true }`.
  - `a host reconnecting with last keeps its code`: `codeFor` receives `'ABCD2345'` from `?last=ABCD2345`.
  - `remote text reaches the host and host text reaches every remote`, and remotes do not hear each other.
  - `a join to a code no host holds is refused with 1008`.
  - `a remote retrying after its host left joins once a host holds the code again`.
  - `a remote's text with a relay key never reaches the host`.
  - `a newer host replaces the older one with 4002`.
  - `a host is refused with 1008 when mayHost says no`.
  - `rotate closes the old room's remotes with 4001 and sends the host a new room frame`, and the host
    socket stays open.
  - `onRoom listeners hear the first room and every rotation`.
  - The existing cases, carried over and rephrased for host plus remotes: `an oversized message is
    dropped`, `a fifth socket is refused`, and `a socket that stops answering pings is dropped and frees
    its slot`.
- [ ] **Step 2:** `npx vitest run tests/tools/utils/remote` fails.
- [ ] **Step 3: Implement** `attachRemoteRelay` per the rules above. The Vite plugin passes these
  options: `codeFor: (last) => last ?? newLocalRoomCode()`, `lanOrigin: () => origins()[0]`,
  `mayHost: () => true`, `pairingOnSky: true`. It deletes the `/__remote/origins` middleware and keeps
  the `Remote:` line in `printUrls`.
- [ ] **Step 4:** `npx vitest run tests/tools` passes, and so does `npm run typecheck:fast`.
- [ ] **Step 5: Commit** `Remote relay issues room codes to a hosting dome`.

### Task 3: The dome hosts and pairs from room frames

review: yes (saga)

**Files:**

- Modify: `src/@types/remote/RemoteTransport.d.ts`, `src/services/remote/createLocalTransport.ts`,
  `src/state/remote/remoteReceiverSaga.ts`, `src/@types/remote/RoomCode.d.ts` (its doc names `newRoom`),
  `tests/helpers/remote/createMemoryTransport.ts`, `tests/components/RemotePage/RemotePage.test.tsx`,
  `tests/state/remote/remoteReceiverSaga.test.ts`
- Create: `src/@types/remote/DomeLink.d.ts`, `src/utils/remote/pairingUrl.ts`,
  `tests/utils/remote/pairingUrl.test.ts`, `tests/services/remote/createLocalTransport.test.ts`

**Interfaces:**

- **Consumes:** `RelayRoom`, `RelayFrame`, the two close-code constants, and `attachRemoteRelay` (as a
  live fixture in the transport test). All come from Task 2.
- **Produces:**

```ts
// src/@types/remote/RemoteTransport.d.ts
export type RemoteTransport = {
  host: () => DomeLink;
  open: (room: RoomCode) => RemoteLink;
};
// src/@types/remote/DomeLink.d.ts
export type DomeLink = RemoteLink & {
  onRoom: (listener: (room: RelayRoom) => void) => Unsubscribe;
};
// src/utils/remote/pairingUrl.ts
export function pairingUrl(origin: string, code: RoomCode): string; // `${origin}/remote.html#${code}`
```

**Behaviour:**

- **`host()`:** opens `wss|ws://<location.host>/__remote/host`. After the first frame it adds
  `?last=<code>` on reconnect. Frames whose JSON has a `relay` key go to `onRoom` and never to `onText`.
  It reconnects after 1 s as today, but stops on `4002`.
- **`open()`:** stops retrying on `4001`.
- **The saga:** replaces `newRoom` and `pairingOrigins` with `transport.host()` plus an `onRoom` event
  channel. On every room it ends every remote's input source and puts
  `remotePairingStarted({ code, pairingUrl: room.onSky ? pairingUrl(room.origin, room.code) : null })`.
  The overlay already hides when `pairingUrl` is `null`. Everything after pairing is unchanged.

- [ ] **Step 1: Write the failing tests**
  - `pairingUrl.test.ts`: `pairingUrl('https://10.0.0.2:5173', 'ABCD2345')` →
    `'https://10.0.0.2:5173/remote.html#ABCD2345'`.
  - `createLocalTransport.test.ts`: a live relay from `attachRemoteRelay`, with `location` stubbed to
    its host. Cases:
    - `host fires onRoom with the room frame and never passes it to onText`;
    - `host reconnects with last after the socket drops`;
    - `host stops reconnecting after 4002`;
    - `open stops reconnecting after 4001`.
  - `remoteReceiverSaga.test.ts`. `createMemoryTransport` gains `room(room: RelayRoom)` to emit a frame,
    and `opened()` becomes `hosted(): boolean`. Cases:
    - `pairs on the first room frame`: the state is `waiting`, with `pairingUrl`
      `'https://10.0.0.2:5173/remote.html#ROOM0000'`;
    - `a room frame with onSky false pairs without a pairing url`;
    - `a second room frame re-pairs and ends every remote's open input`. A held press is released: the
      store sees `inputGestureEnded` for that remote.
- [ ] **Step 2:** `npx vitest run tests/utils/remote/pairingUrl.test.ts tests/services/remote tests/state/remote`
  fails.
- [ ] **Step 3: Implement** the contract and behaviour above. Delete `newRoom` and `pairingOrigins`
  everywhere, including the `RemotePage.test.tsx` fake.
- [ ] **Step 4:** `npm test` and `npm run typecheck` pass.
- [ ] **Step 5: Manual check.** On `npm run dev -- --host`, open `/?remote`, scan the QR, and drive the
  sky from a phone. A dev-server restart re-pairs the phone after its retries.
- [ ] **Step 6: Commit** `Dome pairs from the relay's room frames; newRoom and pairingOrigins go`.
