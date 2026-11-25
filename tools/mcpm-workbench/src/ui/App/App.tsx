/**
 * App — the MCPM Workbench shell. Creates the store once and mounts the
 * redux `<Provider>` here (not `hooks.ts`) — the store's construction site,
 * exactly the role `src/main.tsx` plays for the main app's `<Provider>`.
 * Stacks the HUD + controls over the WebGPU Viewport. Dev-only drag-drop:
 * dropping the fork's packed `.bin` + its `_metadata.txt` loads them as the
 * user catalog via `userCatalogLoaded` — `watchCatalogSaga` derives weights
 * and bounds for it the same as for a network fetch.
 */
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createWorkbenchStore } from '../../store/createWorkbenchStore';
import { defaultAppState } from '../../state/defaultAppState';
import { loadPackedCatalog } from '../../field/loadPackedCatalog';
import { userCatalogLoaded } from '../../state/catalog/catalogSlice';
import CatalogStatus from '../CatalogStatus/CatalogStatus';
import Viewport from '../Viewport/Viewport';
import ControlsPanel from '../ControlsPanel/ControlsPanel';
import HistogramDock from '../HistogramDock/HistogramDock';
import Hud from '../Hud/Hud';
import { readDroppedPackedCatalog } from './utils/readDroppedPackedCatalog';
import { statusStyle } from './utils/statusStyle';

function App(): ReactNode {
  const { store, registerSagaContext } = useMemo(() => createWorkbenchStore(defaultAppState), []);
  const [packedStatus, setPackedStatus] = useState<string | null>(null);

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (!import.meta.env.DEV) return;
    void readDroppedPackedCatalog(Array.from(e.dataTransfer.files)).then((dropped) => {
      if (!dropped) return;
      try {
        const { points, declaredCount, declaredMeanWeight } = loadPackedCatalog(
          dropped.bin,
          dropped.metadataText,
        );
        store.dispatch(
          userCatalogLoaded({
            points,
            fileName: dropped.sourceName,
            settings: { format: { kind: 'cartesianMpc' }, weight: { kind: 'linear', scale: 1 } },
          }),
        );
        setPackedStatus(
          `packed catalog "${dropped.sourceName}": ${points.count.toLocaleString()} pts ` +
            `(declared ${declaredCount.toLocaleString()}), declared mean weight ${declaredMeanWeight}`,
        );
      } catch (err) {
        setPackedStatus(`packed catalog load failed: ${(err as Error).message}`);
      }
    });
  };

  return (
    <Provider store={store}>
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <Viewport store={store} registerSagaContext={registerSagaContext} />
        <Hud />
        <HistogramDock />
        <ControlsPanel />
        <CatalogStatus />
        {import.meta.env.DEV && packedStatus && <div style={statusStyle}>{packedStatus}</div>}
      </div>
    </Provider>
  );
}

export default App;
