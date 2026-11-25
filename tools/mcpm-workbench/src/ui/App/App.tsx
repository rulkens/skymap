/**
 * App — the MCPM Workbench shell. Creates the store once and mounts the
 * redux `<Provider>` here (not `hooks.ts`) — the store's construction site,
 * exactly the role `src/main.tsx` plays for the main app's `<Provider>`.
 * Stacks the HUD + controls over the WebGPU Viewport.
 */
import { useMemo, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createWorkbenchStore } from '../../store/createWorkbenchStore';
import { defaultAppState } from '../../state/defaultAppState';
import CatalogStatus from '../CatalogStatus/CatalogStatus';
import Viewport from '../Viewport/Viewport';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import HistogramDock from '../HistogramDock/HistogramDock';
import Hud from '../Hud/Hud';

function App(): ReactNode {
  const { store, registerSagaContext } = useMemo(() => createWorkbenchStore(defaultAppState), []);

  return (
    <Provider store={store}>
      <Viewport store={store} registerSagaContext={registerSagaContext} />
      <Hud />
      <HistogramDock />
      <ControlsPanel />
      <CatalogStatus />
    </Provider>
  );
}

export default App;
