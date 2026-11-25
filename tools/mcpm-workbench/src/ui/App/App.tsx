/**
 * App — the MCPM Workbench shell. Creates the store once and mounts the
 * redux `<Provider>` here (not `hooks.ts`) — the store's construction site,
 * exactly the role `src/main.tsx` plays for the main app's `<Provider>`.
 * The two sidebars sit over the WebGPU Viewport: data left, controls right.
 */
import { useMemo, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createWorkbenchStore } from '../../store/createWorkbenchStore';
import { defaultAppState } from '../../state/defaultAppState';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import DataPanel from '../DataPanel/DataPanel';
import Viewport from '../Viewport/Viewport';
import styles from './App.module.css';

function App(): ReactNode {
  const { store, registerSagaContext } = useMemo(() => createWorkbenchStore(defaultAppState), []);

  return (
    <Provider store={store}>
      <div className={styles.root}>
        <Viewport store={store} registerSagaContext={registerSagaContext} />
        <div className={styles.sidebars}>
          <DataPanel />
          <ControlsPanel />
        </div>
      </div>
    </Provider>
  );
}

export default App;
