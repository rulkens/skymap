/**
 * SagaContextProvider — carries `createAppStore`'s `setSagaContext` sibling to
 * `useEngine` through a dedicated React context.
 *
 * This is the MIRROR of how the redux `<Provider>` carries the store to
 * `useAppSelector` / `useAppStore`: the store factory hands back two values
 * (`{ store, setSagaContext }`), and each rides its own context down to the
 * engine seam. The store goes through react-redux's `<Provider>`; the
 * saga-context setter goes through this one.
 *
 * Why its own context rather than attaching the setter to the store object:
 * the saga-runner-registration capability is un-braided from the state
 * container. The store is the thing components read settings from; the setter
 * is a one-time engine→saga wiring channel. Folding it onto the store would
 * complect "where state lives" with "how the engine registers a saga runner" —
 * two concerns that vary independently. And rather than prop-drilling it
 * through `<App>`, riding a context keeps `<App>` prop-less: `useEngine`
 * obtains the setter here symmetrically with how it obtains the store via
 * `useAppStore`.
 *
 * The `null` default plus the throwing consumer hook makes a missing provider
 * a loud failure at first use rather than a silent no-op (the engine would
 * never register its `runTierTransition` runner, and tier transitions would
 * quietly do nothing).
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { SetSagaContext } from './types';

const SagaContextSetterContext = createContext<SetSagaContext | null>(null);

export function SagaContextProvider({
  value,
  children,
}: {
  value: SetSagaContext;
  children: ReactNode;
}): React.ReactElement {
  return (
    <SagaContextSetterContext.Provider value={value}>{children}</SagaContextSetterContext.Provider>
  );
}

export function useSetSagaContext(): SetSagaContext {
  const setter = useContext(SagaContextSetterContext);
  if (setter === null) {
    throw new Error('useSetSagaContext must be used within a <SagaContextProvider>');
  }
  return setter;
}
