import { useMemo, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createSceneStore } from '../../store/createSceneStore';
import EmptyState from '../EmptyState/EmptyState';
import GroupPicker from '../GroupPicker/GroupPicker';
import LayerList from '../LayerList/LayerList';
import Viewport from '../Viewport/Viewport';
import styles from './App.module.css';

/**
 * Creates the store once and mounts the redux `<Provider>` here — the
 * store's construction site, mirroring mcpm-workbench's `App.tsx`. The panel
 * overlays the viewport (absolute, top-left) rather than sharing a flex row
 * with it: `Viewport.module.css` sizes the canvas at 100vw/100vh and is
 * owned by the renderer task, not this one.
 */
function App(): ReactNode {
  const { store, registerSagaContext } = useMemo(() => createSceneStore(), []);

  return (
    <Provider store={store}>
      <div className={styles.root}>
        <Viewport store={store} registerSagaContext={registerSagaContext} />
        <div className={styles.panel}>
          <GroupPicker />
          <LayerList />
          <EmptyState />
        </div>
      </div>
    </Provider>
  );
}

export default App;
