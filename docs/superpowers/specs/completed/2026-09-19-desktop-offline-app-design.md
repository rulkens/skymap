# Desktop offline app — design

**Status:** agreed in brainstorming 2026-09-19; parked 2026-09-20; **revised 2026-11-03** to add
domes and the phone remote (grill session:
[`desktop-dome-remote-2026-11-03.md`](../../../grill-sessions/desktop-dome-remote-2026-11-03.md),
Q-numbers below refer to it). Picks up the "offline install build" half of the
[Museum kiosk mode](../../../backlog/2026-08-31-museum-kiosk-mode.md) backlog item.

## 1. Purpose

A native desktop build of skymap for two installs:

- **Kiosk:** a museum or exhibition machine with a flat screen.
- **Dome:** the projector server of a planetarium. The app draws the fisheye disc on the output
  the dome system takes, and the operator drives it from a phone or tablet over the venue LAN.

It is an Electron app (bundled Chromium, so WebGPU behaves as in Chrome). It downloads every
runtime asset from R2 once, then runs with no network, and both installs pair a remote. Later syncs
update the local copy incrementally.

## 2. Scope

**In:**

- the `packages/desktop/` Electron workspace;
- one-time and incremental data sync from an inventory that `sync-r2` publishes, with an update
  policy;
- a local HTTPS server (with a CA generated per install) that serves the built app, the synced data
  and the remote relay;
- a stable pairing code per install that can be rotated live;
- a control window (setup, sync, pairing, Quit);
- sky-window placement across displays;
- a test-grid overlay;
- crash-reload supervision and a navigation lock;
- mac dmg and win nsis builds, unsigned.

**Prerequisite (done):** self-hosted Cormorant Garamond (#768).

**Out:**

- the attract loop, idle reset and galaxy thumbnail pack (kiosk mode, its own backlog item);
- the remote's own UI (the show-deck redesign, `feat/remote-show-deck`, owns it);
- dome tilt and orientation settings. Dome mode keeps its fixed front and zenith. _(My call.)_
- WebGPU `device.lost` recovery;
- signing, notarization and auto-update of the app binary;
- a CI release job;
- Linux;
- a certificate the venue supplies itself (Q2);
- dome inputs other than one OS display that the disc fills (Q13): a fixed render size such as
  4096², and Spout or NDI video sharing. They become follow-ups once a venue asks.
- a cloud relay. The Durable Object relay stays a backlog item, but it must speak the relay
  protocol in §7.

## 3. Ground preparation

### 3.1 Ideal shape

> The pre-build sketch, kept as history. The shipped layout is in
> [`docs/DESKTOP.md`](../../../DESKTOP.md) (Layout), and the types live in the files it names.

```ts
// tools/deploy/@types/R2SyncGroup.ts — one field, set on every row of buildGroups()
readonly offline: boolean; // true: runtime asset the desktop app mirrors

// tools/deploy/r2/OfflineInventory.ts
export type OfflineInventory = {
  groups: { label: string; files: { key: string; size: number; sha256: string }[] }[];
};

// src/@types/remote/RemoteTransport.d.ts — the dome hosts; the server issues the code
export type RemoteTransport = {
  host: () => DomeLink; // dome side: newRoom + pairingOrigins are gone
  open: (room: RoomCode) => RemoteLink; // remote side, unchanged
};
// src/@types/remote/DomeLink.d.ts
export type DomeLink = RemoteLink & { onRoom: (listener: (room: RelayRoom) => void) => Unsubscribe };
// src/@types/remote/RelayRoom.d.ts — the server knows the LAN origin; the route stays client-side
export type RelayRoom = { code: RoomCode; origin: string; onSky: boolean }; // onSky: show the card
// src/utils/remote/pairingUrl.ts — the one place '/remote.html#' is spelled
pairingUrl(origin: string, code: RoomCode): string

// tools/utils/remote/attachRemoteRelay.ts (moved out of tools/utils/vite/)
attachRemoteRelay(server: Server, options: RelayOptions): RelayHandle
// tools/@types/remote/RelayOptions.ts, RelayHandle.ts — one rule set; only the code source varies
type RelayOptions = {
  codeFor: (last: RoomCode | null) => RoomCode; // desktop: the stored code; Vite: last ?? random
  lanOrigin: () => string; // Vite: first of listRemoteOrigins(...); desktop: the picked network
  pairingOnSky: boolean; // Vite: true; desktop: false (the control window shows the QR)
  mayHost: (request: IncomingMessage) => boolean; // desktop: loopback only; Vite: always
  heartbeatMs?: number;
};
type RelayHandle = {
  rotate: (from: RoomCode, to: RoomCode) => void; // closes from's remotes with 4001, re-sends the room
  onRoom: (listener: (room: RelayRoom) => void) => Unsubscribe; // the control window's feed
};

packages/desktop/
  src/main/main.ts                 lifecycle: server, sync-or-boot, windows
  src/main/startAppServer.ts       HTTPS: dist/ | <dataRoot> | /ca.crt, relay attached
  src/main/ensureLanCertificate.ts per-install CA + server cert for current LAN names
  src/main/placeWindows.ts         pure: setup × displays → { sky, control }
  src/main/superviseWindow.ts      crash reload, unresponsive reload, navigation lock
  src/main/showTestGrid.ts         WebContentsView inside the sky window
  src/sync/planSync.ts             pure: inventory × synced × onDisk → downloads
  src/sync/runSync.ts              executor; writes the local inventory.json last
  src/sync/pruneOrphans.ts         idempotent: delete keys not in the local inventory
  src/control/                     control window page + preload bridge
  assets/dome-grid.png
package.json          "desktop" script (workspaces already lists packages/*)
.env.desktop          VITE_DATA_BASE_URL= (empty), no VITE_COUNTERSCALE_URL
.gitignore            carve-out for .env.desktop beside .env.production
```

### 3.2 Greenfield cross-checks

**Sync (2026-09-19).** A fresh derivation proposed a content-addressed local store and an
immutable inventory behind a `latest.json` pointer. It was ruled against: its only extra guarantee
is no mixed set of unhashed images after a partial sync, which is cosmetic and heals itself on the
next sync. One `no-cache` inventory uploaded last gives the same visibility guarantee.

**Relay (2026-11-03, Q10).** My sketch kept the relay as a protocol-free pipe: the dome fetched
the code from a loopback-only `GET /__remote/room` and learned about a rotation from a close code.
The greenfield shape had the dome connect as **host** and the relay **push** `{ code, remoteUrl }`
on the first pairing and on every rotation. **Taken:** one path for pairing and rotation, and
`newRoom`, `pairingOrigins` and `/__remote/origins` are deleted.

**Design-time entanglement pass (2026-11-03).** It made five changes:

- **Relay rules:** the greenfield's `perHost | fixed` policy steered four rules at once. The relay
  now has one rule set, and only `codeFor` varies.
- **Room frames:** they carry `origin`, not a built URL, so the `/remote.html#` route lives in one
  client util.
- **Pairing feed:** the control window subscribes to `RelayHandle.onRoom` instead of pulling.
- **Pruning:** it split off from the sync run (`pruneOrphans` at every sky load, with a local
  `inventory.json` written last as the completeness marker).
- **Window placement:** it is one pure function, the test grid lives inside the sky window, and
  windows trust the per-install CA, not a pinned leaf certificate that changes on every reissue.
  _(My calls.)_

### 3.3 Joint verdicts

- **Sync:** growth. A field on every `R2SyncGroup` row, a Vite mode, one script line.
- **Relay:** two bolt-ons today.
  - It lives in the Vite plugin folder (`tools/utils/vite/attachRemoteRelay.ts:17`), so the desktop
    would import Vite-plugin code at runtime.
  - The dome makes up its own code (`remoteReceiverSaga.ts:56`, `transport.newRoom()`), so a
    server-owned code would need a second way in.
- Everything else is new code under `packages/desktop/`.
- No adjacent findings.

### 3.4 Packaging

**Prep PR, first:** the relay issues room codes.

- Move the relay out of `tools/utils/vite/` with `move-files`.
- Add host and join roles, `codeFor` (Vite: `last ?? random`), `pairingOnSky`, `rotate` and `onRoom`.
- Make `RemoteTransport.host()`, `DomeLink.onRoom` and `pairingUrl`.
- The receiver saga pairs from `onRoom`.
- Delete `newRoom`, `pairingOrigins` and the origins endpoint.

There is no behaviour change in the web app: dev codes stay random per dome. This touches
`remoteReceiverSaga.ts`, which the show-deck branch also edits, so whichever lands second rebases.

**Feature PR:** everything else.

## 4. Inventory (deploy side)

`buildGroups()` rows gain `offline`.

- **`true`:** `public/data`, hi-res famous images, planet textures, every surface-tiles group,
  every surface-tile-manifest group, every octree-chunk group, and the data manifest. The desktop
  must render what the web app renders. _(Octree chunks: my call.)_
- **`false`:** `Extra files` (contributor caches and `robots.txt`) and `Mesh sources` (`.blend`
  backups).

After the upload loop, `syncR2.ts` builds `OfflineInventory` from the offline groups **in table
order**, with every file of every group (not just the changed ones). Each entry records:

- `key`: the bucket key;
- `size` and `sha256`: of the local raw bytes. The client decodes wire gzip, so neither may be
  taken from the stored object.

It is written to a temp path, never into `public/data/`, whose tracked set the manifest drift guard
polices. It is uploaded as `data/offline-inventory.json`, `NO_CACHE`, purged, **after**
`manifest.json`.

**Guard:** the inventory is built from local files, and a collector whose bake never ran on this
machine contributes `[]`. Every desktop would then prune files that still sit on R2. So `sync-r2`
refuses to publish the inventory when any offline group is empty, and names the group. _(My
call. The owner deploys from the main checkout, which has every bake, so the guard only catches
mistakes.)_

**Invariant the desktop app inherits:** a pointer file (data manifest, tile manifest) is uploaded
after every file it names, and anything a pointer names is immutable at its key (content hash or
versioned prefix). This is already the web deploy's rule (docs/DEPLOY.md). An asset family that
breaks it breaks the kiosk's partial-sync guarantee too.

## 5. Local mirror and sync (app side)

**Layout:** `<userData>/data/` mirrors the bucket's `data/` tree key for key, plus two files:

- `synced.json`: `key → sha256` of the files verified complete;
- `inventory.json`: the inventory of the last **fully successful** sync, written last. It is the
  completeness marker, by the same pointer-last rule as the deploy.

**A complete local set** means `inventory.json` exists and every key in it is in `synced.json` and
on disk.

**Plan (`planSync`, pure):**

- **Inputs:** the inventory, `synced.json`, and the set of keys present on disk.
- **Downloads:** per group, in inventory order, every file whose key is absent from `synced`,
  whose sha differs, or which is missing on disk.

**Execute (`runSync`):**

- Fetch the inventory (5 s timeout).
- Run the groups in order, with about 8 concurrent downloads within a group. Each one streams to
  `<file>.part`, is checked against its sha256, then renamed into place.
- Rewrite `synced.json` after each group.
- When every group succeeds, write the fetched inventory to `inventory.json` last.
- A sha mismatch aborts the run (a newer deploy landed mid-sync), and the next run re-plans.
- `runSync` **never deletes**.

**Prune (`pruneOrphans`, idempotent):**

- Every sky load first deletes the keys on disk that are not in the local `inventory.json`
  (excluding `synced.json`, `inventory.json` and `.part` downloads), then loads the sky.
- A sync that runs while the sky is up therefore can't delete a file the running sky still fetches
  lazily (tiles, hi-res images) from the old manifest.
- With no flag and no deferral rule, a partial sync never prunes, because its inventory was never
  written.

**Why partial is safe:** new hashed files and new tile prefixes stay unreachable until their
pointer, which sits in a later group, and old files survive until the next sky load after a
complete sync. Unhashed images (`famous-hires`, `textures`) are overwritten in place, so a crash
can leave a mixed but individually valid image set until the next completed sync.

**Update policy (Q9).** It decides only _when_ a sync starts, and is set in the control window:

```ts
dataUpdates: { kind: 'atLaunch' } | { kind: 'daily'; at: string /* 'HH:MM' local */ } | { kind: 'manual' };
```

- **`atLaunch` (default):** sync, then load the sky.
- **`daily`:** sync at that time, then restart the sky window. The time is chosen to fall outside
  shows.
- **`manual`:** nothing automatic.

**Update now** is always in the control window. It ends at "New data ready · Restart sky".

| Situation                                  | Behaviour                                                |
| ------------------------------------------ | -------------------------------------------------------- |
| No network, complete local set             | Boot                                                     |
| No network, no complete local set          | Control window: needs internet once; retry               |
| Sync fails mid-run (network, 5xx, sha)     | Boot the previous set; retry at the next scheduled point |
| Sync fails, no complete local set          | Control window error with retry                          |
| Insufficient disk (inventory size − local) | Needed vs free in the status; window raised only without a complete set |

## 6. Shell

- **Build:** root `vite build --mode desktop` → `dist/` with an empty data base URL and no
  analytics. `dataUrl()` resolves `/data/<hashed>` exactly as it does in dev.
- **Server (Q1, Q2):** `startAppServer` is one Node HTTPS server, the same in both modes.
  - **Routes:** `/data/*` goes to the data root, `/ca.crt` serves the install's CA, everything else
    is served from `dist/`, and `/__remote/*` upgrades go to the relay. A resolved path outside its
    root is a 404.
  - **Binding:** it binds `0.0.0.0` on a fixed port. Both modes pair a remote (Q3), so both are on
    the LAN.
  - **Why one server:** the sky window loads `https://localhost:<port>/`. The relay keeps rooms per
    server, so the sky window and the phones must reach the same one.
- **Certificate (Q2):** `ensureCa` (once per launch) and `ensureLeaf`.
  - **CA:** made on first run in `<userData>/certs/`.
  - **Server certificate:** covers `localhost`, the machine's `.local` name and every current LAN
    IPv4 address, and is reissued when that list changes.
  - **The app's own windows** accept a chain that ends in the install's CA
    (`session.setCertificateVerifyProc`). That is the same root tablets trust, so a reissue never
    touches the check.
  - **Tablets** download `/ca.crt` once to stop the warning, or tap through it.
  - **Dependency:** one, for X.509 generation (`selfsigned` or similar; Node can't mint
    certificates itself).
- **Window placement (Q6, Q7):** `placeWindows(setup, displays) → { sky, control }` is pure, and
  it re-runs on `screen` `display-added` and `display-removed`.
  - **Sky:** the stored display id, else a unique display with the stored size, else the primary
    display. A projector switched on later takes the sky back.
  - **Control:** a display the sky does not use when there is one. Otherwise `null`: the control
    window floats above the sky (`screen-saver` level) and a fixed global shortcut shows or hides it.
- **Sky window:** frameless, black, full screen on `sky`. It loads `/?dome&remote` in dome mode
  and `/?remote` in kiosk mode.
- **Control window (Q5, Q6):** an ordinary window. It comes up by itself when it needs a person:
  first run, no complete local set, or the stored display missing. A sync error raises it only when
  there is no complete local set; with data on disk the error shows in the Sync panel and the sky
  keeps running (a raised window would cover the sky on one screen mid-show).
- **Tablet setup (owner ruling 2026-11-06):** the pairing QR opens a plain-HTTP setup page on port
  47824 that walks the tablet through installing the CA, checks trust live, then opens the remote;
  replaces typing `/ca.crt` by hand and clicking past a warning.
- **Settings and the sky window (owner rulings 2026-11-06):** the setup, the room code and how the
  sky window was left live in `<userData>/settings.json` through electron-store, replacing
  `setup.json` and `remote-room.json`; a launch puts the sky back full screen or as a window at its
  last bounds, where earlier it always started full screen.
- **Test grid (Q8):** `showTestGrid` adds a `WebContentsView` inside the sky window, so its bounds
  move with the window.
  - **Dome mode:** it shows `assets/dome-grid.png` at `object-fit: contain`. The image is an
    equidistant 180° grid: horizon ring, 30° and 60° rings, zenith cross, and FRONT, LEFT, RIGHT
    and BACK, with front at the bottom of the disc. Contain on a square image gives the
    renderer's own disc, centred and as wide as the shorter side.
  - **Kiosk mode:** a frame at the screen edge, a 10% grid, a circle and a centre cross, with
    "Skymap · display \<n\>" and the pixel size: a cut edge shows overscan, an oval a stretch.
- **Supervision:** `render-process-gone` (not `clean-exit`) and `child-process-gone` of type `GPU`
  reload after 2 s. `unresponsive` for 30 s also reloads.
- **Navigation lock:** `will-navigate` blocks every target outside `https://localhost:<port>`,
  and `setWindowOpenHandler` denies everything. InfoCard outbound links become dead clicks.
- **Autostart:** a toggle in the control window (`app.setLoginItemSettings`). _(My call.)_
- **Quit:** from the control window's Quit, or the menu's Quit (Cmd+Q), which exists only while
  the control window has focus. A system quit (the Dock, a logout, shutdown) also goes through; a
  window's own close (Alt+F4, Cmd+W) never does.
- **Dev:** `npm run desktop` launches with `SKYMAP_DATA_DIR` pointing at the main checkout's
  `public/data` and skips the sync. `--windowed` gives a normal sky window with DevTools.
- **Package:** electron-builder, mac dmg and win nsis, unsigned. Whether the win target
  cross-builds on macOS is `needs-verification` in the plan's first task. The fallback is building
  on a Windows machine, not a CI job.

## 7. Remote pairing

**Roles.**

- **Dome:** connects as host to `/__remote/host`. In dev it adds `?last=<code>`, so a reconnect
  keeps its code.
- **Remotes:** join as they do today, at `/__remote/<code>`, with the code read from the
  `remote.html#<code>` hash.
- **Message flow:** remote messages reach the host. Host messages reach the room's remotes.
  `MAX_SOCKETS_PER_ROOM` and the size cap are unchanged.

**Room frames.** The relay sends the host
`{ "relay": "room", "code": "<code>", "origin": "<lanOrigin>" }` on joining and on every rotation.

- The local transport consumes every frame that has a `relay` key and fires `onRoom` for it.
- App text never reaches `onRoom`, and relay frames never reach `onText`.
- `pairingUrl(origin, code)` is the only client code that spells `/remote.html#`.
- Parsing the app's own messages still happens above the transport.

**One rule set** for both hosts:

- one room per live host;
- a newer host for a code replaces the older one, so reloading the sky window is safe;
- joins are admitted only to issued codes and refused with `1008` otherwise;
- `rotate` works for every room.

Only these differ between the hosts:

- **`codeFor`:**
  - **Vite:** `last ?? random`.
  - **Desktop:** the code in `<userData>/remote-room.json`, created on first run.
- **`mayHost`:**
  - **Vite:** always.
  - **Desktop:** loopback, and `Origin` equal to `APP_ORIGIN`, because anyone who can host reads
    the code and loopback alone would admit any local browser tab.

**Rotation (Q4).** **Rotate code** in the control window does three things:

1. writes a new code;
2. calls `handle.rotate(old, new)`, which closes the old room's remotes with close code `4001`;
3. pushes a new room frame to the host and to `handle.onRoom` listeners (the control window).

The receiver saga pairs again in place: on each `onRoom` it ends the remotes' input sources and
puts `remotePairingStarted({ code, pairingUrl: pairingUrl(origin, code) })`. The dome is never
reloaded. Kicked tablets show the remote's existing lost notice until someone scans the new QR.
The remote's transport stops retrying on `4001`.

**Pairing QR (Q11).** In desktop builds the QR shows **only in the control window**, because a
code that stays the same for weeks must not sit on a public screen.

- **Control window:** draws the URL large enough to scan, with `qrcode-generator` (already a root
  dependency).
- **Room frame:** carries `onSky` (`pairingOnSky` in `RelayOptions`). With `false`, the receiver
  saga pairs without showing the sky's pairing card.
- **Vite** sends `true`, so dev behaves as today.

**Pairing address (Q12).**

- **Picker:** the control window offers the machine's non-internal IPv4 interfaces, and the choice
  is stored as `network`. `lanOrigin` is `https://<that address>:<port>`. With no choice it uses
  the first one.
- **Address changes:** the server certificate covers every current address, so a change only
  reissues it.
- **Stable bookmarks:** they need a DHCP reservation for that interface, and the pairing panel
  says so.
- **`.local` is not used,** because Android resolves it unreliably.

## 8. Control window

`packages/desktop/src/control/` is one page with a CommonJS preload (`.cts` → `.cjs`, because it
runs sandboxed) that exposes the bridge through `contextBridge` only. The contract is not copied
here; its one home is the code:

- the bridge: `packages/desktop/src/@types/ControlBridge.d.ts` (main pushes one `ControlState`,
  `ControlState.d.ts`, and the page reads it once);
- the setup it stores: `packages/desktop/src/@types/InstallSetup.d.ts` (`<userData>/setup.json`);
- the channel names: `packages/desktop/src/data/controlChannels.ts`.

It has four panels:

- **Sync:** progress, errors, Update now, Restart sky.
- **Setup:** mode, display, test grid, autostart, data updates.
- **Pairing:** QR, the code, Rotate code, the network picker with its DHCP-reservation hint, and a
  pointer to `/ca.crt`.
- **Quit.**

## 9. Testing

- **`planSync`:** skip-when-synced, sha mismatch, missing-on-disk, and group order kept.
- **`runSync`:** never deletes, and writes `inventory.json` only after every group succeeds. The
  integration case runs against a local HTTP fixture that fails mid-group: the previous set stays
  intact, there is no new `inventory.json`, and a second run resumes.
- **`pruneOrphans`:** deletes only keys outside the local inventory, keeps `synced.json` and
  `inventory.json`, and is idempotent.
- **Server path resolution:** traversal refused, and data, dist and `/ca.crt` routed correctly.
- **`placeWindows`:**
  - match by id;
  - match by size when the id changed;
  - two displays of the same size fall back to the primary;
  - control gets a free display, or `null` on one screen.
- **Relay:**
  - a host receives a room frame on joining;
  - a join to an unissued code is refused;
  - a non-loopback host is refused when `mayHost` says so;
  - `rotate` closes the old room's remotes with `4001` and re-sends the room;
  - `codeFor` gets `last`;
  - a newer host replaces an older one.
- **Transport:** relay frames reach `onRoom` and never `onText`.
- **Inventory builder (`tools/`):** offline filter, table order, raw-byte sha and size, and the
  empty-group refusal.
- **CI:** one step runs the desktop workspace's tests.
- **Manual, on mac and Windows:**
  - first sync;
  - boot with networking off;
  - crash recovery via `process.crash()`;
  - WebGPU on D3D12;
  - a tablet pairs over HTTPS after trusting `/ca.crt`;
  - rotation kicks the tablet and redraws the QR;
  - a projector switched on after boot takes the sky;
  - the dome grid lands front-down.

## 10. Experience

Added at the owner's request after §1–§9 were built. The design brief is
`.superpowers/sdd/2026-09-19-desktop-offline-app/first-run-brief.md` (a local workspace file, not
tracked); its headings are named below. The shipped state is described in
[`docs/DESKTOP.md`](../../../DESKTOP.md).

- **First-run flow** (brief: the opening sections and "Steps"). The control window opens on first
  launch, when `setup.json` does not exist, with a five-step stepper (Welcome, Where it shows,
  Which screen, Connect a tablet, Every day) over a download strip, so the first download is setup
  time. It can be reopened with "Run setup again". There is no "Paired" confirmation: the relay
  cannot report remotes.
- **Help and About** ("Adjacent: menu structure, About, Help"). An in-app Help view (connecting a
  tablet, moving the sky, the shortcut, updates, troubleshooting) and an About window with the
  version, the data's date, the licence and the site address as text.
- **Menus** (same section). Skymap, Edit, View, Window and Help menus, present only while the
  control window has focus on macOS and on the control window alone on Windows; the sky never
  shows one.
- **Immersive chrome** ("Chrome, menus, windows"). A borderless black sky with no white flash, a
  curtain that fades over every load, a cursor hidden after 3 s, a dark control window with the
  traffic lights in the page's own band on macOS, and `prefers-reduced-motion` honoured.
- **Branding** ("Branding"). The website's wordmark, star field and the app's tokens; the
  control page, About, icons and installers read as one family with the site.
- **Icons and installers** ("Icons and installer"). One script (`npm run brand`) renders the icon
  set, the dmg background and the installer bitmaps from the brand page. The dmg has a designed
  window. The Windows installer is assisted and per machine, with Start-menu and desktop
  shortcuts, a firewall rule for private and domain networks, and an uninstaller that removes the
  rule and offers, unticked, to delete the downloaded data. The mac build is arm64 only.
