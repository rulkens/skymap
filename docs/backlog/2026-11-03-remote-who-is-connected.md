# The dome doesn't know which phones are steering it

**Why.** Three gaps found while writing the "Setting up a dome" docs page (2026-11-03) share one
missing piece: neither the dome nor the relay keeps a roster of remotes that anything shows or acts on.

- **The dome shows nothing when a phone joins or drops.** The first `hello` hides the pairing card
  and the interface (`src/state/remote/remoteReceiverSaga.ts:125-126`); after that a new phone, or one
  that goes silent and is detached (`closeAfterSilence`, same file), changes nothing on screen.
- **No lock to one phone.** Every remote's commands are run whatever its `from` id, so any phone that
  has the room code steers. During a show, a visitor who photographs the QR can fly the dome.
- **A refused phone isn't told why.** A room holds four sockets (`MAX_SOCKETS_PER_ROOM`,
  `tools/utils/vite/attachRemoteRelay.ts:13`), so with the dome and three phones a fourth is closed with
  1008 at once (line 39). Its transport reopens every second
  (`src/services/remote/createLocalTransport.ts:33`), so the page reads "Looking for the dome", then
  "Dome not there" after three seconds (`src/components/RemotePage/useRemoteLink.ts:42`), and
  `LostNotice` sends the visitor to check a room code that is correct.

**Open.** Where the roster lives (the dome's `remote` slice already has `phase`); what the dome shows and
for how long (it shows only the sky during a show); whether a lock is a dome-side setting or a pairing
step; and how the relay's close reason reaches the phone, so a full room reads as full.
