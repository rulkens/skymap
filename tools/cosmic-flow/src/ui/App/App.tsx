/**
 * App — the cosmic-flow shell.
 *
 * Creates the single Store once, provides it to the React tree, and stacks the
 * overlays over the WebGPU Viewport: the flow canvas underneath, then the label
 * overlay, the HUD, and the controls panel on top. The Viewport also receives
 * the store directly (the engine lives outside React and reads it each frame).
 */
import { useMemo, type ReactNode } from 'react';
import { createStore } from '../../state/createStore';
import { defaultAppState } from '../../state/defaultAppState';
import { StoreContext } from '../storeContext';
import Viewport from '../Viewport/Viewport';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import LabelsOverlay from '../LabelsOverlay/LabelsOverlay';
import Hud from '../Hud/Hud';

function App(): ReactNode {
  const store = useMemo(() => createStore(defaultAppState), []);
  return (
    <StoreContext.Provider value={store}>
      <Viewport store={store} />
      <LabelsOverlay />
      <Hud />
      <ControlsPanel />
    </StoreContext.Provider>
  );
}

export default App;
