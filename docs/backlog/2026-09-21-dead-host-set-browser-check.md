# `DeadHostSet` needs a browser check — a 404 must not retire SDSS

`manual` · surfaced 2026-09-21 while shipping [#778](https://github.com/rulkens/skymap/pull/778)

## The problem

`DeadHostSet` (#778) retires a thumbnail host after `DEAD_HOST_STREAK = 3`
consecutive **dead connections**, so one outage can't cost 30 s per galaxy
against only `MAX_CONCURRENT_FETCHES = 4` queue slots. The whole design rests on
one distinction:

- `src/utils/network/fetchGalaxyBitmap.ts:155,157` — a non-2xx or non-image
  response reports `hostAnswered: true`. **A 404 is the host answering.**
- `src/utils/network/fetchGalaxyBitmap.ts:160` — only a throw reports
  `hostAnswered: false`.

A 404 from SDSS is the ordinary path, not a failure: about two-thirds of the sky
is outside the SDSS footprint, which is the entire reason the DSS fallback
exists. If a 404 ever counted toward the streak, **SDSS would retire after three
galaxies outside its footprint** and every northern galaxy for the rest of the
session would silently drop to a monochrome DSS plate.

That is the failure mode worth a human check: it degrades silently. Nothing
errors, nothing hangs — the thumbnails just get worse, and only somebody who
knows what SDSS colour cutouts look like would notice.

## Current state

Covered by unit tests only — 5 cases in `tests/utils/network/createDeadHostSet.test.ts`,
6 in `tests/utils/network/fetchGalaxyBitmap.test.ts`, both mutation-verified.
No end-to-end coverage.

It could not be checked headlessly: thumbnail fetches for catalog galaxies need
`px >= APPARENT_SIZE_THRESHOLD_PX` (24) and `public/data/galaxy-catalog/v9/`
ships only GLADE/SDSS/2MRS/DESI/milliquas — all cosmological, no local-volume
bin. Boot pose, `local-group`, forced 8/3/1 Mpc, `setTier('large')` and
`#focus=pgc-27077` all produced zero thumbnail requests. Reaching the band needs
the camera parked at a specific catalog galaxy's position.

## The check

DevTools → Network, filtered to `skyserver.sdss.org`.

1. **A 404 must not retire SDSS.** Fly to galaxies in the **southern** sky, where
   SDSS has no coverage. SDSS should keep being requested — dozens of times,
   404ing each time — with DSS thumbnails landing behind it. If SDSS requests
   stop after three, the streak is counting 404s and the distinction above is
   broken.
2. **A dead host must retire.** Right-click an `alasky.cds.unistra.fr` request →
   **Block request domain**, reload, fly south again. Expect a burst of up to 4
   (the queue slots), then none for the rest of the session. The first ones take
   the full 30 s `FETCH_DEADLINE_MS` to settle, so the streak only reaches 3
   after ~30 s — that delay is expected; the point is silence afterwards.
   Reloading resets it (state lives in `texturedDiskSubsystem`, not persisted).

Note `alasky.cds.unistra.fr` was down on 2026-09-20 and recovered by 2026-09-21,
so the outage has to be simulated with the domain block.

## If it needs automating later

The trick that made the render-loop half of #778 testable: **famous-galaxy rows
bypass the 24 px threshold** (`texturedDiskSubsystem.ts:151`), so their
thumbnails fetch at boot from any camera position. That reaches the atlas queue
and the frame vote — but not `DeadHostSet`, which the famous legs deliberately
skip (they hit our own origin, so they pass `deadHosts: undefined`). Covering
this properly needs a real catalog galaxy in the band.
