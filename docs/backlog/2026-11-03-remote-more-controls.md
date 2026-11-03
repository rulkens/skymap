# More controls on the phone remote

**Why.** A presenter running a show from the phone still has to walk to the dome's computer for common
settings. Found while writing the "Setting up a dome" docs page, 2026-11-03.

**Current state.** The remote's command set is `RemoteCommandPayloads`
(`src/@types/remote/RemoteCommandPayloads.d.ts`): go-to, home, pairing, tour, clip, exhibit exit, time,
control scheme and `toggleSet`. `toggleSet` covers the Labels & Guides rows only
(`src/state/settings/selectToggleRows.ts`, shown by
`src/components/RemotePage/ToggleSection/ToggleSection.tsx`). There is no command for:

- data size (tier) or exposure;
- the layer switches outside Labels & Guides;
- captions;
- full screen;
- showing or hiding the dome's interface: pairing hides it
  (`src/state/remote/remoteReceiverSaga.ts:133`), and only Tab on the dome's keyboard brings it back.

**Rulings to revisit.** The dome-remote spec limited toggles to Labels & Guides and left the Display,
Earth and Structures settings sections out
([`specs/completed/2026-10-11-dome-remote-design.md`](../superpowers/specs/completed/2026-10-11-dome-remote-design.md),
Rulings "Toggle scope", Out of scope). Each new row is one `REMOTE_COMMANDS` entry
(`src/state/remote/remoteCommands.ts`) plus a status field; full screen may not be reachable at all, as
the browser grants it only on a user gesture on the dome's own page.
