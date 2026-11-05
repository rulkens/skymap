# Grill Session: Dome and remote in the desktop app — 2026-11-03

Source: the owner asked for "an electron stand-alone app for kiosks and domes". The parked
[desktop offline app spec](../superpowers/specs/2026-09-19-desktop-offline-app-design.md) covered
kiosks only. This session folds the dome in: the app runs on the projector server, and the operator
drives it from a phone or tablet.

---

## Q0: Resume route and kiosk scope

**The question:** Should we resume the parked plan unchanged, add dome support to the spec first, or
brainstorm again from scratch? And does museum kiosk mode (attract loop, idle reset) come along?

**Considerations:**

- **Fold dome into the spec, then resume:** keeps the approved sync and packaging design, and adds
  only what a dome needs.
- **Resume as is:** the fastest route, but the result has no dome.
- **Start again:** throws away rulings that still stand.
- **Kiosk mode alongside:** one bigger effort, but larger PRs and more unknowns at once.

**Decision:** Fold the dome into the spec and resume. Kiosk mode stays a separate backlog item.

## Q1: How the app serves itself

**The question:** The parked spec loads the app over a privileged `app://` protocol. The remote
transport connects to `location.host` at `/__remote/<room>`, and a phone cannot open an `app://`
URL. How should the app serve its files?

**Considerations:**

- **Option A (local HTTP server, both modes):** one Node server in the main process serves `dist/`,
  the synced data and the relay. `localhost` is a secure context, so WebGPU still works. Task 3
  (`app://`) is rewritten.
- **Option B (`app://` plus a side server for the dome):** two ways of serving files, plus a relay
  origin the transport would have to be told about.
- **Option C (HTTP for dome, `app://` for kiosk):** two code paths that differ by mode.

**Decision:** A, in both modes. Owner note: HTTPS must work too, including for the remote.

## Q2: Where the HTTPS certificate comes from

**The question:** How does the app get a certificate on a venue LAN with no internet? There is one
constraint: `attachRemoteRelay` keeps a rooms map per server, so the dome window and the phones have
to reach the same server. An http listener plus an https listener would split them.

**Considerations:**

- **Option A (CA generated per install, plus `/ca.crt`):** works offline and needs no setup at the
  venue. A tablet trusts the CA once, or taps through the warning. The Electron window pins its own
  certificate.
- **Option B (A plus a venue-supplied certificate):** the venue's IT may want this, but it is a
  setting nobody has asked for.
- **Option C (public certificate via DNS-01):** needs internet at the venue, so it fails offline.

**Decision:** A.

## Q3: The install and setup journey

**The question:** How does an install know it is a dome, which display to fill, and where setup
lives? Launch flags were proposed first. The owner asked to think through the journey instead.

**Journey (owner: "ok for now"):** install, then the first sync online, then setup (mode, display,
test image), then autostart, then pair a tablet once and bookmark it, then show day with no scan,
then setup again later when something changes.

**Considerations for where setup lives:**

- **A control window on the booth monitor:** the QR can be scanned there (a fisheye-warped QR could
  not be, #916), and the dome window stays a pure disc.
- **Setup on the tablet remote:** adds setup screens to the remote, whose UI the show-deck
  redesign owns.
- **An overlay on the dome:** the audience would see it.
- **Launch flags with no setup UI:** nothing to build, but it can't be discovered and has no test
  image.

**Decision:** a control window on the booth monitor.

**Raised in chat:** the pairing code must be stable per install, so tablet bookmarks survive
reboots, and it must be rotatable. Today the only lock on the relay is a 40-bit code drawn fresh at
every boot. Kiosks pair a staff remote too (owner: "both modes pair"), so both modes bind the LAN.

## Q4: Where the code lives, and what rotating does

**The question:** How does the dome page get the stored code, and is rotation done with a reload or
live?

**Considerations:**

- **Server owns the code, and rotating reloads the dome:** one async signature change, but every
  rotation means a few seconds of boot.
- **Server owns the code, and rotation happens live:** the relay kicks the old room, and the dome
  pairs again in place.
- **Code passed in the dome URL:** the code leaks into links copied in dome mode.

**Decision:** server-owned, rotated live with no reload.

## Q5: What the control window is built from

**The question:** Is the control window part of the desktop package or the web app?

**Considerations:**

- **The parked sync page grows into it, inside `packages/desktop`:** one desktop UI, and no
  Electron-only code in `src/`.
- **A React entry in the root app:** shares components, but Electron-only screens ship in the web
  build.
- **Separate sync and control pages:** two windows with overlapping status jobs.

**Decision:** the first option. The owner already pictured it as part of the Electron app's own UI,
in its own package.

## Q6: The control window when there is only one screen

**Considerations:**

- **Its own display if there is one, otherwise a shortcut:** it also comes up by itself when a
  person is needed (first run, sync error, no data). Quit lives there.
- **Reachable from the tablet remote:** encroaches on the show-deck UI.
- **Only right after launch:** a missed moment means a reboot.

**Decision:** its own display if there is one, otherwise a shortcut.

## Q7: The chosen display is missing or renumbered at boot

**Considerations:**

- **Match by id, then by size, otherwise wait with hot-plug:** survives Windows renumbering, and
  projectors switched on after boot pick up the sky.
- **Fall back to the primary display:** on a dome server the primary is the booth monitor.
- **Match by id only:** every renumbering means redoing setup.

**Decision:** match by id, then by size, **then fall back to the primary** (owner amendment). A
display that arrives later takes the sky back. On the primary display, the shortcut still brings the
control window up over the sky.

## Q8: The test image

**Considerations:**

- **A static grid in an overlay window:** no renderer change. `object-fit: contain` on a square
  image gives the same disc as the renderer.
- **The web app draws it (`?dome&test`):** exact by construction, but it is renderer code and one
  more URL gate.
- **No test image:** orientation mistakes are hard to read off stars.

**Decision:** a static grid in an overlay window. In kiosk mode it shows "display N" instead.

## Q9: How a long-running install gets new data

**The question:** The parked spec syncs only at launch, and a dome server can run for weeks. There
is also a landmine: pruning mid-session deletes files the running sky still fetches lazily.

**Considerations:** a button with the prune deferred, launch only, or an automatic nightly check.

**Decision (owner):** a setting in the control window, with three choices: at launch (the default),
daily at a set time (which restarts the sky itself), or manual. "Update now" is always there. A
mid-session sync never prunes; the prune happens at the next sky load.

## Q10: How the code reaches the dome (ground-check checkpoint)

**The question:** The refactor-ground sketch had the dome fetch the code from a loopback-only
`GET /__remote/room` and learn about a rotation from close code 4001. The greenfield cross-check
derived a different shape: the dome connects as host, and the relay pushes `{ code, remoteUrl }`
on the first pairing and on every rotation.

**Considerations:**

- **A (loopback GET plus close code):** the relay stays a protocol-free text pipe, and few sites
  change. But pairing and rotation take two paths, and there are two HTTP endpoints.
- **B (the relay pushes the room):** one path for the first pairing and for rotation, and
  `newRoom`, `pairingOrigins` and `/__remote/origins` are deleted. On the other hand, the relay
  learns host and join roles, the transport has to filter relay frames out of the app text, and
  the backlogged Durable Object relay has to speak it too.

**Decision:** B. Shape signed off. Prep goes in its own PR, first.

## Q11: The pairing QR on the sky window (from the builder check)

**The question:** Today the sky window shows the pairing QR until a remote says hello. With a code
that stays the same for weeks, a kiosk's public screen would show it to every visitor.

**Considerations:**

- **The control window only:** the booth already has the QR. It needs one signal to the sky page,
  and a room-frame field does that without a new URL gate.
- **On the sky too, as today:** a standing invite to anyone in front of the screen.
- **On the sky until the first pairing:** still visible after every reboot until the tablet
  reconnects.

**Decision:** the control window only. The room frame carries `onSky`, which is `false` on the
desktop and `true` in Vite.

## Q12: Which address the QR carries

**The question:** The first LAN IPv4 depends on interface order. Projector servers often have
several network cards, and DHCP can move the address, which breaks tablet bookmarks.

**Considerations:** a network picker in the control window, the first LAN IPv4, or the `.local`
name (which Android resolves unreliably).

**Decision:** a network picker, stored as `network`. The pairing panel suggests a DHCP
reservation.

## Q13: What the dome system takes

**Considerations:** one OS display that the disc fills (today's dome mode), a fixed square size
such as 4096², or Spout/NDI video sharing.

**Decision:** one OS display. The other two are follow-ups for when a venue asks.

## Calls made without a question (marked in the spec)

- Sync never deletes: `pruneOrphans` runs at every sky load, and a local `inventory.json` marks a
  completed sync (from the entanglement pass).
- The relay has one rule set, and only `codeFor` and `mayHost` vary. Room frames carry `origin`,
  and the client builds the URL.
- `placeWindows` is one pure function. The test grid is a view inside the sky window. Windows trust
  the install's CA, not a pinned leaf certificate.
- Octree chunk groups are synced for offline use. `sync-r2` refuses to publish the inventory when
  an offline group is empty locally.

- Autostart is a toggle in the control window (`app.setLoginItemSettings`).
- Dome tilt and orientation are out of scope; dome mode keeps its fixed front and zenith.
- On the desktop, the newest host connection replaces an older one, so a reload of the sky window
  is safe.
