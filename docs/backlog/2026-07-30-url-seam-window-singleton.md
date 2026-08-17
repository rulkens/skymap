# The URL seam is a module-level `window` singleton

Surfaced during the 2026-07-30 entanglement-radar pass over the `url-hash-saga-port`
branch.

## The braid

The app's address bar and the test process's address bar are the same object. Three
functions reach `window.location` / `window.history` directly at module scope, with no
port to substitute:

- `src/services/url/readHashBody.ts:37` — `window.location.hash`
- `src/services/url/writeHashBody.ts:63` — `window.history.pushState`
- `src/services/url/createHashChangeChannel.ts:54` — `window.addEventListener('hashchange')`

Nothing above `services/url/` touches `window`, which is the good half of the design: the
sagas reach the URL through `call` and a test file can `vi.mock` the whole folder. What is
missing is a per-store instance. Every store in a vitest file shares one address bar,
because there is only ever one.

## What it currently costs

All four of these are in the branch's own diff, so they are the price of the seam as it
stands, not a hypothetical:

1. **A global `afterEach` whose ordering needs a paragraph** —
   `tests/setup/reactTestEnv.ts:53-58` resets `window.location.hash` after each test. It is
   `afterEach` rather than `beforeEach` specifically so it cannot clobber a test that seeds
   its own hash at its start; the comment explaining that is longer than the code.
2. **Three `typeof window` guards, each with a "load-bearing, not SSR insurance" defence** —
   `readHashBody.ts:15-33`, `writeHashBody.ts:55-57`, `createHashChangeChannel.ts:38-46`.
   They exist because `createAppStore` forks the read saga, and most of the suite boots a
   store under the default `node` environment where `window` is absent. Each guard reads as
   deletable dead code until the defence is read.
3. **A test file that exists only to pin those guards** —
   `tests/services/url/hashSeamWithoutWindow.test.ts`. Its own docblock says as much:
   deleting a guard would otherwise fail a few hundred unrelated tests with
   `ReferenceError: window is not defined` rather than one line naming the cause.
4. **The mitigation only works on a clean exit.** A test that throws mid-way skips its
   `afterEach` body's later statements in some failure shapes, and a test that seeds a hash
   and then fails leaves it on `window.location` for the next test in the file. The next
   store to boot performs a real arrival read against that hash and silently inherits state
   it never asked for.

## Proposed shape

Make the URL a registered capability rather than an ambient one. Two spellings, both of
which dissolve all four symptoms:

- **In `SagaContext`** — `url: { read(): string; write(body: string): void; channel(): EventChannel<string> }`,
  registered by the engine alongside `reconcile` and friends. A store with an inert port
  never reads or writes an address bar, so the arrival read stops being a thing that happens
  to every test store.
- **An injected `UrlPort`** threaded into `watchHashSaga` at fork time. Equivalent, but it
  needs a second injection channel next to the one that already exists.

Either way the `typeof window` guards move into ONE browser implementation of the port
(where "no DOM" is a legitimate construction-time branch rather than a per-function
defence), the pin-the-guards test collapses to a test of that implementation, and
`reactTestEnv.ts`'s hash reset goes away because a test store's port is not the browser's.

## Composes with the `setSagaContext` totality change

The same branch tightened `setSagaContext` to require the whole `SagaContext`
(`src/store/types.ts`, `SetSagaContext`), so `sagaContextRegistered` cannot announce
capabilities that were not supplied. A `url` member added to `SagaContext` inherits that
enforcement for free: no store can release the hash bridge without having said what address
bar it is talking to. Doing it as an injected `UrlPort` instead forgoes that, which is the
main argument for the `SagaContext` spelling.

## Caveats

- `writeHashBody`'s compare-and-skip reads the LIVE URL rather than caching the last write
  (`writeHashBody.ts:24-35`), and `hashHistoryIntegrity.test.ts` depends on that: it spies
  `pushState` with call-through so the address bar really moves. A port implementation must
  keep read and write pointed at the same store, or that test's push-counting goes green
  against a bug.
- `hasDeepLink` reads `window.location` through a different path (the `ui` slice's boot
  read, see the `uiSlice` module-load item), so a port that covers only the saga side leaves
  a second ambient reader. Decide whether that is in scope before speccing.

Size: medium.
