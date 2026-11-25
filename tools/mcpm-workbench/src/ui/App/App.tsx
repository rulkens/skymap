/**
 * App — the MCPM Workbench shell. Creates the store once and mounts the
 * redux `<Provider>` here (not `hooks.ts`) — the store's construction site,
 * exactly the role `src/main.tsx` plays for the main app's `<Provider>`.
 * The two sidebars sit over the WebGPU Viewport: data left, controls right.
 * Their toggles sit outside the pair, whose column scrolls and would clip them in
 * the narrow layout; the canvas fills the window either way, so hiding one resizes
 * nothing. The controls' footer sits beside that column, so nothing scrolls under it.
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createWorkbenchStore } from '../../store/createWorkbenchStore';
import { defaultAppState } from '../../state/defaultAppState';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import DataPanel from '../DataPanel/DataPanel';
import DeviceLostToast from '../DeviceLostToast/DeviceLostToast';
import FileActions from '../FileActions/FileActions';
import SidebarToggle from '../SidebarToggle/SidebarToggle';
import Viewport from '../Viewport/Viewport';
import styles from './App.module.css';

function App(): ReactNode {
  const { store, registerSagaContext } = useMemo(() => createWorkbenchStore(defaultAppState), []);
  const dataId = useId();
  const controlsId = useId();
  const [dataOpen, setDataOpen] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(true);
  const columnOpen = dataOpen || controlsOpen;

  return (
    <Provider store={store}>
      <div className={styles.root}>
        <Viewport store={store} registerSagaContext={registerSagaContext} />
        <SidebarToggle
          side="start"
          expanded={dataOpen}
          controls={dataId}
          label="data panel"
          onToggle={() => setDataOpen((v) => !v)}
        />
        <SidebarToggle
          side="end"
          expanded={controlsOpen}
          controls={controlsId}
          label="controls"
          onToggle={() => setControlsOpen((v) => !v)}
        />
        <SidebarToggle
          side="column"
          expanded={columnOpen}
          controls={`${dataId} ${controlsId}`}
          label="panels"
          onToggle={() => {
            setDataOpen(!columnOpen);
            setControlsOpen(!columnOpen);
          }}
        />
        <div className={styles.sidebars}>
          <div className={styles.column}>
            <DataPanel id={dataId} collapsed={!dataOpen} />
            <ControlsPanel id={controlsId} collapsed={!controlsOpen} />
          </div>
          <FileActions collapsed={!controlsOpen} />
        </div>
        <DeviceLostToast />
      </div>
    </Provider>
  );
}

export default App;
