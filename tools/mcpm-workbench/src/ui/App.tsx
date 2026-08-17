/**
 * App — the MCPM Workbench shell.
 *
 * T1 is bare: just the Viewport canvas. Later tasks add controls/HUD
 * overlays alongside it, the way tools/flow-workbench's App stacks
 * ControlsPanel/Hud/LabelsOverlay over its own Viewport.
 */
import type { ReactNode } from 'react';
import Viewport from './Viewport';

function App(): ReactNode {
  return <Viewport />;
}

export default App;
