import { useMemo, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createSceneStore } from '../../store/createSceneStore';
import styles from './App.module.css';

/** Creates the store once and mounts the redux `<Provider>` here — the
 *  store's construction site, mirroring mcpm-workbench's `App.tsx`. */
function App(): ReactNode {
  const { store } = useMemo(() => createSceneStore(), []);

  return (
    <Provider store={store}>
      <div className={styles.root}>Scene Workbench</div>
    </Provider>
  );
}

export default App;
