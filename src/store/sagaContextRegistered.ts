/**
 * sagaContextRegistered — the reducer-less SIGNAL that `setSagaContext` has run,
 * so a saga which must dispatch before any action arrives can wait for the
 * engine capabilities it will hand its dispatches to.
 *
 * `sagaMiddleware.setContext` is write-only: there is no `takeContext`, and
 * `getContext` inside a saga returns `undefined` rather than blocking. Every
 * other feature watcher is fine with that, because each one is woken by an
 * action and by then the context exists. `watchHashReadSaga` is the exception —
 * it is the only saga that DISPATCHES on its own initiative, at store
 * construction, from a URL. Its dispatches land in watchers whose `getContext`
 * bag is still empty, and the resulting throw propagates to the root saga and
 * cancels every watcher in it: no wake, no tier transitions, no selection
 * resolution, no keyboard, for the rest of the session.
 *
 * The signal says "the capabilities are registered", and `setSagaContext` takes a
 * WHOLE `SagaContext` so it cannot say that falsely. With a `Partial` setter the
 * two came apart: registering one key still fired this action, and the arrival
 * read then reached a capability nobody had supplied — the failure described
 * above, produced by the very mechanism meant to prevent it. Totality is the
 * cheap fix because production registers everything in one call anyway.
 *
 * Making the registration observable as an ACTION rather than exposing a promise
 * or a callback from the factory keeps the wait inside the language the sagas
 * already speak: `yield* take(sagaContextRegistered)` needs no new seam, no
 * ordering argument at the call site, and composes with cancellation for free.
 *
 * Nothing reduces it — it carries no payload and describes no state, only that a
 * moment has passed. It lives beside `createAppStore` rather than in a
 * `state/<domain>/` folder because the store factory is what dispatches it and
 * `SagaContext` (in `./types`) is what it is about; no slice owns the fact.
 */

import { createAction } from '@reduxjs/toolkit';

export const sagaContextRegistered = createAction('store/sagaContextRegistered');
