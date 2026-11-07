# "Paired" confirmation in the desktop first-run setup

**Surfaced:** 2026-11-04 (the first-run flow shipped without it). **Readiness:** awaiting-decision
(it grows a contract).

The Connect a tablet step cannot tell the person that a tablet joined, so they have to look at the
tablet. The relay knows its remotes, but `RelayHandle` (`tools/@types/remote/RelayHandle.d.ts`)
exposes only `rotate` and `onRoom`, and `attachDesktopRelay` returns it unchanged.

**What it needs.**

- A signal on `RelayHandle` for remotes joining and leaving (a count or an event), emitted by
  `tools/utils/remote/attachRemoteRelay.ts` and tested there.
- A `ControlBridge` member to carry it to the page (`packages/desktop/src/@types/ControlBridge.d.ts`,
  `control/preload.cts`, the handler in `runLifecycle.ts`), and a state in `TabletStep`.

**Consent.** `RelayHandle` is a shared contract and does not grow without a yes from the owner. Ask
before starting.
