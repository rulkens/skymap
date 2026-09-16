/**
 * RunSagaProvider — carries `createAppStore`'s `runSaga` sibling to `useEngine`
 * through its own React context, the same seam `SagaContextProvider` uses for
 * `setSagaContext` (see that file's header for why each capability rides its
 * own context rather than folding onto the store object). `createLayers`
 * calls the hook's value once per composed Layer's declared `sagas`.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { RunSaga } from './types';

const RunSagaContext = createContext<RunSaga | null>(null);

export function RunSagaProvider({
  value,
  children,
}: {
  value: RunSaga;
  children: ReactNode;
}): React.ReactElement {
  return <RunSagaContext.Provider value={value}>{children}</RunSagaContext.Provider>;
}

export function useRunSaga(): RunSaga {
  const runSaga = useContext(RunSagaContext);
  if (runSaga === null) {
    throw new Error('useRunSaga must be used within a <RunSagaProvider>');
  }
  return runSaga;
}
