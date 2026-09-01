/**
 * App — the MCPM Workbench shell. Creates the store once and mounts the
 * redux `<Provider>` here (not `hooks.ts`) — the store's construction site,
 * exactly the role `src/main.tsx` plays for the main app's `<Provider>`.
 * Stacks the HUD + controls over the WebGPU Viewport. Dev-only drag-drop:
 * dropping the fork's packed `.bin` + its `_metadata.txt` installs them via
 * `setPackedCatalog` — `watchCatalogSaga`'s `takeLatest` re-resolves from
 * `catalog.packedOverride` the same as a network fetch, so nothing here
 * forks the weight/bounds maths.
 */
import { useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { createWorkbenchStore } from '../../store/createWorkbenchStore';
import { defaultAppState } from '../../state/defaultAppState';
import { loadPackedCatalog } from '../../field/loadPackedCatalog';
import { setCatalogLoadStatus, setPackedCatalog } from '../../state/catalog/catalogSlice';
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
      store.dispatch(setCatalogLoadStatus('loading'));
      try {
        const { points, declaredCount, declaredMeanWeight } = loadPackedCatalog(
          dropped.bin,
          dropped.metadataText,
        );
        // `watchCatalogSaga`'s takeLatest also fires on this action and re-derives
        // weights (same `deriveAgentWeights` transform the network path runs) via
        // `catalogLoaded` — no need to duplicate that here just to discard it.
        store.dispatch(setPackedCatalog({ points, sourceName: dropped.sourceName }));
        setPackedStatus(
          `packed catalog "${dropped.sourceName}": ${points.count.toLocaleString()} pts ` +
            `(declared ${declaredCount.toLocaleString()}), declared mean weight ${declaredMeanWeight}`,
        );
      } catch (err) {
        store.dispatch(setCatalogLoadStatus('error'));
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
