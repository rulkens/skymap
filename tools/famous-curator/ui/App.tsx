/**
 * Curator App — composes GalaxyList + SourceBar + CropCanvas +
 * ParamSliders + PreviewPane + MetadataForm and wires the
 * action callbacks to the reducer + API client.
 *
 * Layout: simple two-column flex.  Plan D styles this.
 *
 * Process-flow wiring:
 *   - Selecting a galaxy resets the workspace.
 *   - Fetch → setSource (resets crop + clears previews).
 *   - Crop / StarNet changes mark dirty → Process gets an orange dot.
 *   - Process → /api/process → previews + markProcessed.
 *   - Alpha changes → /api/process/alpha-only (only after processedOnce).
 *   - Export → /api/export, then markCuratedById to update the list.
 */
import { useEffect, useReducer } from 'react';
import { useApi } from './apiContext';
import { reducer, initialState, canExport } from './state';
import { GalaxyList } from './components/GalaxyList';
import { SourceBar } from './components/SourceBar';
import { CropCanvas } from './components/CropCanvas';
import { ParamSliders } from './components/ParamSliders';
import { PreviewPane } from './components/PreviewPane';
import { MetadataForm } from './components/MetadataForm';

function AppInner() {
  const api = useApi();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    api.getGalaxies().then((r) => {
      if (!cancelled) dispatch({ type: 'setGalaxies', galaxies: r.galaxies });
    }).catch((err) => {
      // Surface to the user via a toast in Plan D; log for now.
      console.error('getGalaxies failed', err);
    });
    return () => { cancelled = true; };
  }, [api]);

  // Auto-trigger alpha-only re-render when alpha dirty + we've processed
  // at least once.  Debounce to avoid flooding the server on slider drag.
  useEffect(() => {
    if (!state.dirty.alpha || !state.processedOnce || !state.tmpId) return;
    const tmpId = state.tmpId;
    const alpha = state.alpha;
    const handle = setTimeout(() => {
      api.postAlphaOnly({ tmpId, alpha })
        .then((r) => dispatch({ type: 'setPreviews', alpha: r.alphaPreviewUrl }))
        .catch((err) => console.error('alpha-only failed', err));
    }, 150);
    return () => clearTimeout(handle);
  }, [api, state.alpha, state.dirty.alpha, state.processedOnce, state.tmpId]);

  async function onFetch(url: string): Promise<void> {
    try {
      const r = await api.postFetchUrl(url);
      dispatch({ type: 'setSource', tmpId: r.tmpId, width: r.width, height: r.height, previewUrl: r.previewUrl });
    } catch (err) {
      console.error('fetch failed', err);
    }
  }
  async function onFileDrop(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await api.postFetchBytes(bytes, file.type || 'application/octet-stream');
      dispatch({ type: 'setSource', tmpId: r.tmpId, width: r.width, height: r.height, previewUrl: r.previewUrl });
    } catch (err) {
      console.error('file drop failed', err);
    }
  }
  async function onProcess(): Promise<void> {
    if (!state.tmpId || !state.crop) return;
    try {
      const r = await api.postProcess({
        tmpId: state.tmpId,
        crop: state.crop,
        starnet: state.starnet,
        alpha: state.alpha,
      });
      dispatch({ type: 'setPreviews', starless: r.starlessPreviewUrl, alpha: r.alphaPreviewUrl });
      dispatch({ type: 'markProcessed' });
    } catch (err) {
      console.error('process failed', err);
    }
  }
  async function onExport(): Promise<void> {
    if (!state.activeId || !state.tmpId || !state.crop) return;
    try {
      await api.postExport({
        id: state.activeId,
        tmpId: state.tmpId,
        crop: state.crop,
        starnet: state.starnet,
        alpha: state.alpha,
        metadata: state.metadata,
      });
      dispatch({ type: 'markCuratedById', id: state.activeId });
    } catch (err) {
      console.error('export failed', err);
    }
  }

  return (
    <div className="curator-app">
      <aside>
        <GalaxyList
          galaxies={state.galaxies}
          activeId={state.activeId}
          onSelect={(id) => dispatch({ type: 'selectGalaxy', id })}
        />
      </aside>
      <main>
        <SourceBar disabled={state.activeId === undefined} onFetch={onFetch} />
        <CropCanvas
          source={state.source}
          crop={state.crop}
          onCropChange={(c) => dispatch({ type: 'setCrop', crop: c })}
          onFileDrop={onFileDrop}
        />
        <MetadataForm
          metadata={state.metadata}
          onChange={(m) => dispatch({ type: 'setMetadata', metadata: m })}
        />
      </main>
      <aside>
        <ParamSliders
          starnet={state.starnet}
          alpha={state.alpha}
          dirty={state.dirty}
          processedOnce={state.processedOnce}
          canExport={canExport(state)}
          onStarnet={(p) => dispatch({ type: 'setStarnet', starnet: p })}
          onAlpha={(p) => dispatch({ type: 'setAlpha', alpha: p })}
          onProcess={onProcess}
          onExport={onExport}
        />
        <PreviewPane previews={state.previews} />
      </aside>
    </div>
  );
}

export function App() {
  // When used outside an ApiProvider (e.g. ReactDOM.render directly),
  // fall back to the default API.  When tests wrap us in ApiProvider,
  // useApi() picks up the override.
  return <AppInner />;
}
