/**
 * apiContext — React Context wrapper for the Api object.
 *
 * Lets the App root inject the production `defaultApi`, while
 * component tests render with `<ApiProvider value={fakeApi}>` and
 * assert against the spy calls.  All UI components consume the API
 * via `useApi()` rather than importing `defaultApi` directly — that
 * keeps the test surface clean.
 */
import { createContext, useContext, type ReactNode, type JSX } from 'react';
import { defaultApi, type Api } from './api';

const ApiContext = createContext<Api>(defaultApi);

export function ApiProvider(props: { value?: Api; children: ReactNode }): JSX.Element {
  return (
    <ApiContext.Provider value={props.value ?? defaultApi}>{props.children}</ApiContext.Provider>
  );
}

export function useApi(): Api {
  return useContext(ApiContext);
}
