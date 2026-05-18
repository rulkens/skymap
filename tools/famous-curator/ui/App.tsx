/**
 * Curator App — composes GalaxyList + SourceBar + CropCanvas +
 * ParamSliders + PreviewPane + MetadataForm and wires the
 * action callbacks to the reducer + API client.
 *
 * Layout: simple two-column flex.  Plan D styles this.
 *
 * Process-flow wiring:
 *   - Selecting a galaxy resets the workspace.
 *   - Selecting an already-curated galaxy also fetches its recipe.json and
 *     re-fetches the source image, so sliders + crop box reconstruct the
 *     prior session automatically (resumable flow).
 *   - Fetch → setSource (resets crop + clears previews).
 *   - Crop / StarNet changes mark dirty → Process gets an orange dot.
 *   - Process → /api/process → previews + markProcessed.
 *   - Alpha changes → /api/process/alpha-only (only after processedOnce).
 *   - Export → /api/export, then markCuratedById to update the list.
 */
import { useEffect, useReducer, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { useApi } from './apiContext';
import { reducer, initialState, canExport } from './state';
import { GalaxyList } from './components/GalaxyList';
import { SourceBar } from './components/SourceBar';
import { CropCanvas } from './components/CropCanvas';
import { ParamSliders } from './components/ParamSliders';
import { PreviewPane } from './components/PreviewPane';
import { MetadataForm } from './components/MetadataForm';
import { WikipediaImagePicker } from './components/WikipediaImagePicker';
import { resolveWikipediaMedia } from './wikipediaMedia';

/**
 * useColumnWidth — sidebar width state with localStorage persistence.
 * The width is clamped to [min, max] on read and on every set, so even a
 * tampered localStorage value can't push the layout to a broken state.
 */
function useColumnWidth(key: string, initial: number, min: number, max: number) {
  const [w, setW] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(key));
      if (Number.isFinite(stored) && stored >= min && stored <= max) return stored;
    } catch { /* localStorage may be unavailable (private mode) — fall through */ }
    return initial;
  });
  useEffect(() => {
    try { localStorage.setItem(key, String(w)); } catch { /* ignore */ }
  }, [key, w]);
  const clampedSet = (next: number | ((prev: number) => number)) => {
    setW((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      return Math.max(min, Math.min(max, raw));
    });
  };
  return [w, clampedSet] as const;
}

/**
 * Splitter — a vertical drag handle between grid columns.  Uses pointer
 * capture so the cursor doesn't escape the handle when dragging fast.
 * `onDrag(dx)` is called with the per-event delta in CSS pixels; the
 * parent decides which column width to apply it to (and whether to invert
 * the sign for right-side handles).
 */
function Splitter(props: { onDrag: (dx: number) => void; ariaLabel: string }) {
  const startX = useRef<number | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = e.clientX;
    if (dx !== 0) props.onDrag(dx);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (startX.current !== null) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      startX.current = null;
    }
  };
  return (
    <div
      className="curator-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

function AppInner() {
  const api = useApi();
  const [state, dispatch] = useReducer(reducer, initialState);
  // In-flight flags for the three blocking server round-trips.  Local
  // useState (not reducer state) — these are pure UI feedback and don't
  // need to participate in action-based transitions.
  const [busy, setBusy] = useState({ fetch: false, process: false, export: false });
  // Resizable sidebars — widths persisted to localStorage so the layout
  // survives a page reload.  Min/max are conservative: too-narrow asides
  // hide controls; too-wide steals room from the crop canvas.
  const [leftW, setLeftW] = useColumnWidth('curator.leftW', 220, 160, 480);
  const [rightW, setRightW] = useColumnWidth('curator.rightW', 260, 200, 480);

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
    setBusy((b) => ({ ...b, fetch: true }));
    try {
      // If the pasted URL is a Wikipedia / Wikimedia Commons URL (typically
      // a mediaviewer link like `…/wiki/NGC_6744#/media/File:foo.jpg`),
      // resolve it to the direct file URL first AND pull the author +
      // license out of the Commons extmetadata so the maintainer doesn't
      // have to retype that data manually.  On any failure we silently
      // fall back to using the URL verbatim.
      const wiki = await resolveWikipediaMedia(url).catch(() => null);
      const fetchUrl = wiki?.directUrl ?? url;
      const r = await api.postFetchUrl(fetchUrl);
      dispatch({ type: 'setSource', tmpId: r.tmpId, width: r.width, height: r.height, previewUrl: r.previewUrl });
      // Keep the human-friendly URL the user typed (Wikipedia article
      // page, not the raw upload URL) as the attribution source; it links
      // back to the credits page that lists the author + license.
      dispatch({
        type: 'setMetadata',
        metadata: {
          ...state.metadata,
          sourceUrl: url,
          author: wiki?.author || state.metadata.author,
          license: wiki?.license || state.metadata.license,
        },
      });
    } catch (err) {
      console.error('fetch failed', err);
    } finally {
      setBusy((b) => ({ ...b, fetch: false }));
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
    setBusy((b) => ({ ...b, process: true }));
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
    } finally {
      setBusy((b) => ({ ...b, process: false }));
    }
  }
  async function onExport(): Promise<void> {
    if (!state.activeId || !state.tmpId || !state.crop) return;
    setBusy((b) => ({ ...b, export: true }));
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
    } finally {
      setBusy((b) => ({ ...b, export: false }));
    }
  }

  return (
    <div
      className="curator-app"
      style={{
        // 5 grid columns: left aside · splitter · main · splitter · right aside.
        // Splitter widths are fixed at 5px; everything else flexes around them.
        gridTemplateColumns: `${leftW}px 5px 1fr 5px ${rightW}px`,
      }}
    >
      <aside>
        <GalaxyList
          galaxies={state.galaxies}
          activeId={state.activeId}
          onSelect={async (id) => {
            dispatch({ type: 'selectGalaxy', id });
            const entry = state.galaxies.find((g) => g.id === id);
            // Resumable flow for already-curated galaxies:
            //   1. Load recipe.json → reconstruct sliders + crop + metadata
            //   2. Point PreviewPane at the existing exported WebPs on disk
            //      (served by Vite from `public/images/famous-curated/<id>/`)
            //      so the maintainer immediately sees what was previously
            //      shipped, even before the source re-fetch completes.
            //   3. Re-fetch the source via the same Wikipedia-aware resolver
            //      that onFetch uses — recipes from the wiki-helper era
            //      store the article URL, not the direct image URL.
            // The source bytes aren't cached across sessions per spec, so
            // step 3 is unavoidable if the maintainer wants to re-Process.
            if (!entry?.curated) return;
            try {
              const r = await api.getRecipe(id);
              // Apply recipe-derived state first.  These are intentionally
              // dispatched BEFORE setSource because setSource resets crop +
              // previews to defaults — we'd lose the recipe values if the
              // order were reversed.  setSource is the last dispatch below.
              dispatch({ type: 'setStarnet', starnet: r.recipe.starnet });
              dispatch({ type: 'setAlpha', alpha: r.recipe.alpha });
              dispatch({ type: 'setMetadata', metadata: r.recipe.metadata });
              const wiki = await resolveWikipediaMedia(r.recipe.metadata.sourceUrl).catch(() => null);
              const fetchUrl = wiki?.directUrl ?? r.recipe.metadata.sourceUrl;
              const fetched = await api.postFetchUrl(fetchUrl);
              dispatch({ type: 'setSource', tmpId: fetched.tmpId, width: fetched.width, height: fetched.height, previewUrl: fetched.previewUrl });
              // setSource reset crop + previews; re-apply the recipe crop
              // and point previews at the prior export's on-disk files.
              // The ?v=<processedAt> query is a cache-buster: when the
              // maintainer re-exports, the file bytes change but the URL
              // would otherwise be identical, causing the browser to
              // serve the stale image from its disk cache.
              dispatch({ type: 'setCrop', crop: r.recipe.crop });
              const cacheBust = encodeURIComponent(r.recipe.processedAt);
              dispatch({
                type: 'setPreviews',
                starless: `/api/curated/${id}/starless.webp?v=${cacheBust}`,
                alpha: `/api/curated/${id}/full.webp?v=${cacheBust}`,
              });
            } catch (err) {
              console.error('resume failed', err);
            }
          }}
        />
      </aside>
      <Splitter
        ariaLabel="Resize left panel"
        onDrag={(dx) => setLeftW((w) => w + dx)}
      />
      <main>
        <SourceBar
          // key=activeId remounts the SourceBar when the user picks a
          // different galaxy, which clears its local URL-input state.
          // Without this, a half-typed URL from galaxy A would still
          // sit in the input after switching to galaxy B.
          key={state.activeId ?? '__none__'}
          disabled={state.activeId === undefined}
          busy={busy.fetch}
          onFetch={onFetch}
        />
        <CropCanvas
          source={state.source}
          crop={state.crop}
          onCropChange={(c) => dispatch({ type: 'setCrop', crop: c })}
          onFileDrop={onFileDrop}
        />
        <div className="curator-meta-row">
          <MetadataForm
            metadata={state.metadata}
            onChange={(m) => dispatch({ type: 'setMetadata', metadata: m })}
          />
          <WikipediaImagePicker
            // Re-keying on activeId clears the picker's loading/error
            // state cleanly when the user switches galaxies — otherwise
            // a stale "Loading…" message could linger if the previous
            // fetch was still pending at switch time.
            key={state.activeId ?? '__none__'}
            names={state.galaxies.find((g) => g.id === state.activeId)?.names ?? []}
            onPick={(url) => onFetch(url)}
          />
        </div>
      </main>
      <Splitter
        ariaLabel="Resize right panel"
        onDrag={(dx) => setRightW((w) => w - dx)}
      />
      <aside>
        <ParamSliders
          starnet={state.starnet}
          alpha={state.alpha}
          dirty={state.dirty}
          processedOnce={state.processedOnce}
          canExport={canExport(state)}
          processBusy={busy.process}
          exportBusy={busy.export}
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
