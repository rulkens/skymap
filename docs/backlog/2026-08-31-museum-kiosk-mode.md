# Museum kiosk mode

**Surfaced:** 2026-08-31, from a business-model exploration (institutional
licensing — planetariums / science museums / exhibitions — was judged the
route with the clearest paying-customer category for an MIT-licensed outreach
project). **Readiness:** needs-design.

**Validation caveat, first.** No museum or planetarium has asked for this.
Institutional sales cycles are long, procurement is heavy for a solo
developer, and OpenSpace is free and grant-funded. What keeps the item alive
despite that: a kiosk mode is a much smaller build than a dome product, is
independently useful (exhibitions, conference booths, demos), and is the
cheapest way to have something concrete to show an institution. Phase 1 below
is sized as "demoable to one real contact", not "product".

## What a kiosk needs

Attract loop (tour plays unattended, restarts forever), locked-down UI,
optional touch-to-explore with idle reset, fully offline operation, and
surviving weeks unattended on museum hardware.

## Verified current state

Playback half exists; reliability and offline halves do not.

**Already in place:**

- **Chrome-free mode** — `?cinema` (`src/components/App/App.tsx:111`)
  renders canvas + tour overlay only; all other chrome absent from the DOM,
  splash pinned hidden (`src/state/ui/buildInitialUiState.ts`). Chrome that
  isn't rendered can't be tampered with.
- **Unattended playback** — the recorder harness already runs the grand tour
  headlessly to completion: `whenStablyReady(store)`
  (`src/state/lifecycle/whenStablyReady.ts`) is the boot-readiness predicate,
  and `window.__skymapRecorder.startTour()`
  (`src/state/recorder/installRecorderHook.ts:96`) resolves on tour end —
  the restart hook an attract loop needs. Tour sagas are single-flight
  (`takeLatest`) and restore scene state in a `finally`
  (`src/state/tour/guidedTourSaga.ts`), so loop-restart is low-risk.
- **Local data serving** — catalog/tile loading funnels through `dataUrl()`
  (`src/services/loading/fetchWithProgress.ts:29`) → `VITE_DATA_BASE_URL`,
  already empty in dev. Ship `dist/` + a built `public/data/` (~280 MB
  catalogs per docs/DEPLOY.md, plus tiles/textures) and that part is offline.
- **Bulk settings restore** — `mergeSettingsSnapshot`
  (`src/state/settings/`) is the mechanism an idle-reset would reuse.
- **Prior decision** — splash grill session
  (`docs/grill-sessions/2026-05-20-splash-screen.md` Q9) named tour-loop
  "right for installations, weird for normal visitors" and consciously
  deferred it. This item picks up that parked branch, not fights it.

**Missing (effort concentrates in the first two):**

1. **Robustness: none.** No `device.lost` handler, no `uncapturederror`, no
   watchdog, no auto-reload — `src/services/gpu/device.ts` requests the
   device once at startup and throws; its docblock notes driver crashes are
   unhandled. Pragmatic shape: supervised auto-reload (a kiosk can just
   reload; reload + autostart makes recovery a non-event) plus an external
   heartbeat (page pings, wrapper restarts the browser) covering driver
   crashes, OOM, and tab death in one mechanism.
2. **Offline galaxy thumbnails.** Per-galaxy thumbnails stream live from
   SDSS SkyServer with a DSS fallback
   (`src/utils/network/fetchGalaxyBitmap.ts:108`) — an unbounded per-object
   runtime dependency on third-party services; only the famous galaxies'
   WebPs are committed locally. Options: pre-bake a thumbnail pack for a
   magnitude cut, or accept procedural-disk-only for non-famous galaxies in
   kiosk mode. Also: Google Fonts loads from `index.html:33` (self-host),
   and InfoCard outbound links (NED/Wikipedia) must be suppressed so
   visitors can't navigate away.
3. **Idle detection + input gating: nothing, and no single choke point.**
   Input lives in three places — `attachEngineInputs`
   (`src/services/engine/interaction/inputBindings.ts`), `orbitControls`
   (deliberately attached separately), and the hotkeys table
   (`src/state/input/keyboardShortcuts.ts`). Keyboard is a per-row guard;
   pointer/orbit needs a flag threaded through two attach points or a
   capture-phase overlay. Idle → resume-attract is a small saga once that
   exists.
4. **Autostart + loop: small.** A boot saga behind a `?kiosk` gate: wait
   `whenStablyReady`, dispatch `startTour('grandTour')`, re-dispatch on
   `tourEnded`. Note `?tour` today is only a debug gate rendering the start
   pill (`TopBarContainer.tsx:27`); nothing auto-starts. New gate should go
   through the `URL_GATES` consolidation
   (`backlog/2026-07-29-url-gates-registry.md`) rather than a sixth helper.

## Design questions

- Watch-only attract loop vs touch-to-explore with idle reset? The latter is
  far more compelling on a floor but pulls in gap 3 fully. Grill-session
  framing suggests watch-only first.
- Reuse `?cinema` verbatim or a third render branch (canvas + tour overlay +
  beat rail, no interactive chrome)? Cinema strips the beat rail; a visitor
  probably wants tour progress visible.
- Thumbnail pack magnitude cut vs procedural-only.

## Phasing

1. `?kiosk` autostart + loop + auto-reload-on-crash + heartbeat →
   demoable at a booth or to a museum contact (the validation step).
2. Offline hardening: thumbnail pack, self-hosted font, link suppression.
3. Touch-to-explore with idle reset.

Out of scope entirely: dome / multi-projector projection — a different
product. Note there is **no SpaceMouse support in `src/`** (tools-only);
don't cite it in any pitch.
