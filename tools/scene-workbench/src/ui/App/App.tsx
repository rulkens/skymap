import { useMemo, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createSceneStore } from '../../store/createSceneStore';
import Viewport from '../Viewport/Viewport';
import styles from './App.module.css';

/** Creates the store once and mounts the redux `<Provider>` here — the
 *  store's construction site, mirroring mcpm-workbench's `App.tsx`. */
function App(): ReactNode {
  const { store, registerSagaContext } = useMemo(() => createSceneStore(), []);

  return (
    <Provider store={store}>
      <div className={styles.root}>
        <Viewport store={store} registerSagaContext={registerSagaContext} />
      </div>
    </Provider>
  );
}

export default App;
