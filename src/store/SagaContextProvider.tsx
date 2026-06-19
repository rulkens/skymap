/**
 * SagaContextProvider — delivers `setSagaContext` to `useEngine` via React
 * context, mirroring exactly how the redux `<Provider>` delivers `store`.
 *
 * Why React context rather than a prop?
 *
 * `setSagaContext` is returned alongside `store` from `createAppStore`, making
 * them siblings from the same factory call. `store` reaches the engine through
 * `<Provider store={store}>` → `useAppStore()` — React's standard store-injection
 * pattern. `setSagaContext` is NOT part of the Redux store API, so `useStore()`
 * cannot surface it. A sibling context here is the exact parallel: `main.tsx`
 * wraps `<SagaContextProvider value={setSagaContext}>` just inside `<Provider>`,
 * and `useEngine` calls `useSetSagaContext()` alongside `useAppStore()`. Neither
 * value is threaded as a prop through `App` — both arrive through their
 * respective context layers.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { SetSagaContext } from './types';

const SagaContextCtx = createContext<SetSagaContext | null>(null);

/**
 * Wrap the app (or a subtree) to make `setSagaContext` available via
 * `useSetSagaContext`. In production, `main.tsx` renders this once around
 * `<App />` with the `setSagaContext` returned from `createAppStore`.
 */
export function SagaContextProvider({
  value,
  children,
}: {
  value: SetSagaContext;
  children: ReactNode;
}): ReactNode {
  return <SagaContextCtx.Provider value={value}>{children}</SagaContextCtx.Provider>;
}

/**
 * Returns the `SetSagaContext` function injected by `<SagaContextProvider>`.
 * Throws if called outside a provider — a missing provider is a wiring bug,
 * not a graceful-degradation case (it means `useEngine` has no way to hand
 * the engine a registration path into the saga middleware).
 */
export function useSetSagaContext(): SetSagaContext {
  const ctx = useContext(SagaContextCtx);
  if (ctx === null) {
    throw new Error(
      'useSetSagaContext: no <SagaContextProvider> found in the tree. ' +
        'Wrap the app root with <SagaContextProvider value={setSagaContext}>.',
    );
  }
  return ctx;
}
