/**
 * App — the MCPM Workbench shell. Creates the single Store once, provides
 * it to the tree, and stacks the HUD + controls over the WebGPU Viewport —
 * mirroring tools/flow-workbench's App.
 */
import { useMemo, type ReactNode } from 'react';
import { createStore } from '../state/createStore';
import { defaultAppState } from '../state/defaultAppState';
import { StoreContext } from './storeContext';
import Viewport from './Viewport';
import ControlsPanel from './ControlsPanel';
import Hud from './Hud';

function App(): ReactNode {
  const store = useMemo(() => createStore(defaultAppState), []);
  return (
    <StoreContext.Provider value={store}>
      <Viewport store={store} />
      <Hud />
      <ControlsPanel />
    </StoreContext.Provider>
  );
}

export default App;
