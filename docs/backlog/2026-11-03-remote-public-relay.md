# A public relay for the phone remote

**Why.** The remote's relay exists only inside Vite's dev and preview servers, so a dome that wants a
phone remote has to clone the repo, install Node and git, and keep a terminal open
(`packages/website/src/content/docs/guide/dome-setup.mdx`, "Run Skymap for a phone remote"). The
published site has no relay, so `skymap.rulkens.com/?dome&remote` pairs nothing. Found while writing that
docs page, 2026-11-03.

**Current state.**

- `tools/utils/vite/remoteRelayPlugin.ts:32-33` wires the relay into `configureServer` and
  `configurePreviewServer` only; `tools/utils/vite/attachRemoteRelay.ts` is the room-per-path broadcaster.
- `src/services/remote/createLocalTransport.ts:24` opens `/__remote/<room>` on the page's own host, and
  both sides hard-code it: the dome at `src/main.tsx:105`, the phone at
  `src/components/RemotePage/useRemoteLink.ts:37`.
- Windows dome computers have never been checked to run `npm run dev -- --host`; the docs page gives
  macOS and Linux terminal commands only. With a public relay the dome needs a browser, not a dev
  server, so this check matters only for the local path that stays.

**Design.** Already ruled in the dome-remote spec
([`specs/completed/2026-10-11-dome-remote-design.md`](../superpowers/specs/completed/2026-10-11-dome-remote-design.md),
Rulings "Transport, public site" and "Room code", Pairing, Build order step 3): a Durable Object relay in
the existing Worker behind the same `RemoteTransport` contract, a 128-bit room token carried only in the QR,
the Worker route, and join rate limits. Open: how each page picks its transport (local relay vs public),
and what the docs page keeps of the clone-and-run steps once it lands.
