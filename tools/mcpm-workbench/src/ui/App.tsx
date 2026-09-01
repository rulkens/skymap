/**
 * App — the MCPM Workbench shell. Creates the single Store once, provides
 * it to the tree, and stacks the HUD + controls over the WebGPU Viewport —
 * mirroring tools/flow-workbench's App.
 *
 * Dev-only drag-drop (spec §9): dropping the fork's packed `.bin` + its
 * `_metadata.txt` together parses them via `loadPackedCatalog`, derives
 * weights through the same `deriveAgentWeights` transform the network path
 * uses, and installs the result via `setPackedCatalog` — the identical
 * completed-load transition `Viewport`'s own boot path calls, so a rebuild
 * consumer reads `catalog.packedOverride` the same way it reads a fetch.
 */
import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createStore } from '../state/createStore';
import { defaultAppState } from '../state/defaultAppState';
import { deriveAgentWeights } from '../field/deriveAgentWeights';
import { loadPackedCatalog } from '../field/loadPackedCatalog';
import { setCatalogLoadStatus, setPackedCatalog } from '../state/slices/catalogSlice';
import { useStore } from '../state/useStore';
import { StoreContext } from './storeContext';
import Viewport from './Viewport';
import ControlsPanel from './ControlsPanel';
import HistogramDock from './HistogramDock';
import Hud from './Hud';

const statusStyle: CSSProperties = {
  position: 'fixed',
  left: 12,
  bottom: 12,
  padding: '6px 10px',
  font: '12px monospace',
  color: '#e8e8e8',
  background: 'rgba(0, 0, 0, 0.7)',
  borderRadius: 4,
  pointerEvents: 'none',
};

// Stacked above the (dev-only) packed-drop status line rather than sharing its
// slot: catalog.statusMessage (e.g. "no catalog points") can be live in prod,
// so the two must never silently overlap if both happen to be set at once.
const catalogStatusStyle: CSSProperties = { ...statusStyle, bottom: 44 };

async function readDroppedPackedCatalog(
  files: readonly File[],
): Promise<{ bin: ArrayBuffer; metadataText: string; sourceName: string } | null> {
  const binFile = files.find((f) => f.name.endsWith('.bin'));
  const metaFile = files.find((f) => f.name.endsWith('.txt'));
  if (!binFile || !metaFile) return null;
  const [bin, metadataText] = await Promise.all([binFile.arrayBuffer(), metaFile.text()]);
  return { bin, metadataText, sourceName: binFile.name };
}

function App(): ReactNode {
  const store = useMemo(() => createStore(defaultAppState), []);
  const [packedStatus, setPackedStatus] = useState<string | null>(null);
  const catalogStatusMessage = useStore(store, (s) => s.catalog.statusMessage);

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (!import.meta.env.DEV) return;
    void readDroppedPackedCatalog(Array.from(e.dataTransfer.files)).then((dropped) => {
      if (!dropped) return;
      store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'loading') }));
      try {
        const { points, declaredCount, declaredMeanWeight } = loadPackedCatalog(
          dropped.bin,
          dropped.metadataText,
        );
        // Same transform the network path runs in Viewport's buildFromPoints —
        // no forked maths (brief's contract).
        const weights = deriveAgentWeights(
          points.log10StellarMass,
          store.getSnapshot().catalog.weightMode,
        );
        store.setState((st) => ({
          ...st,
          catalog: setPackedCatalog(st.catalog, points, weights.nanCount, dropped.sourceName),
        }));
        setPackedStatus(
          `packed catalog "${dropped.sourceName}": ${points.count.toLocaleString()} pts ` +
            `(declared ${declaredCount.toLocaleString()}), declared mean weight ${declaredMeanWeight}`,
        );
      } catch (err) {
        store.setState((st) => ({ ...st, catalog: setCatalogLoadStatus(st.catalog, 'error') }));
        setPackedStatus(`packed catalog load failed: ${(err as Error).message}`);
      }
    });
  };

  return (
    <StoreContext.Provider value={store}>
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <Viewport store={store} />
        <Hud />
        <HistogramDock />
        <ControlsPanel />
        {catalogStatusMessage && <div style={catalogStatusStyle}>{catalogStatusMessage}</div>}
        {import.meta.env.DEV && packedStatus && <div style={statusStyle}>{packedStatus}</div>}
      </div>
    </StoreContext.Provider>
  );
}

export default App;
