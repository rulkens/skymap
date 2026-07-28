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
import { reducer, initialState, canCommit } from './state';
import { seedDeprojectCrop, fitCropToSource, rescaleCrop } from './cropMath';
import { rescaleDisk } from './diskOverlay';
import { willDeproject } from '../../famous/deprojectDisk';
import { DEFAULT_DISK_MARGIN } from '../../../src/data/galaxyCatalog/famousCalibration';
import type { RecipeDisk } from '../plugin/recipe';
import { GalaxyList } from './components/GalaxyList';
import { SourceBar } from './components/SourceBar';
import { CropCanvas } from './components/CropCanvas';
import { ParamSliders } from './components/ParamSliders';
import { PreviewPane } from './components/PreviewPane';
import { MetadataForm } from './components/MetadataForm';
import { WikipediaImagePicker } from './components/WikipediaImagePicker';
import { DiskControls } from './components/DiskControls';
import { resolveWikipediaMedia } from './wikipediaMedia';
import type { CommitPhase } from './components/ParamSliders';

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
    } catch {
      /* localStorage may be unavailable (private mode) — fall through */
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, String(w));
    } catch {
      /* ignore */
    }
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
  const [fetchBusy, setFetchBusy] = useState(false);
  const [commitPhase, setCommitPhase] = useState<CommitPhase>('idle');
  // Resizable sidebars — widths persisted to localStorage so the layout
  // survives a page reload.  Min/max are conservative: too-narrow asides
  // hide controls; too-wide steals room from the crop canvas.
  const [leftW, setLeftW] = useColumnWidth('curator.leftW', 220, 160, 480);
  const [rightW, setRightW] = useColumnWidth('curator.rightW', 260, 200, 480);

  useEffect(() => {
    let cancelled = false;
    api
      .getGalaxies()
      .then((r) => {
        if (!cancelled) dispatch({ type: 'setGalaxies', galaxies: r.galaxies });
      })
      .catch((err) => {
        // Surface to the user via a toast in Plan D; log for now.
        console.error('getGalaxies failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Auto-trigger alpha-only re-render when alpha dirty + we've processed
  // at least once.  Debounce to avoid flooding the server on slider drag.
  useEffect(() => {
    if (!state.dirty.alpha || !state.processedOnce || !state.tmpId) return;
    const tmpId = state.tmpId;
    const alpha = state.alpha;
    const handle = setTimeout(() => {
      api
        .postAlphaOnly({ tmpId, alpha })
        .then((r) => dispatch({ type: 'setPreviews', alpha: r.alphaPreviewUrl }))
        .catch((err) => console.error('alpha-only failed', err));
    }, 150);
    return () => clearTimeout(handle);
  }, [api, state.alpha, state.dirty.alpha, state.processedOnce, state.tmpId]);

  async function onFetch(url: string): Promise<void> {
    setFetchBusy(true);
    try {
      // Resolver fallthrough: Wikipedia → /api/resolve (NOIRLab et al.) → raw URL.
      // Order is deliberate.  Wikipedia covers the broadest catalogue and is
      // the most common paste, so we try it first and keep the existing
      // silent-fallback-on-failure behaviour.  /api/resolve is the next
      // discrete source (currently NOIRLab gallery pages, extensible
      // server-side without UI changes).  Raw /api/fetch is the
      // always-available last resort when no resolver recognises the host.
      const wiki = await resolveWikipediaMedia(url).catch(() => null);
      const resolved = wiki ?? (await api.resolveMedia(url));
      const fetchUrl = resolved?.directUrl ?? url;
      const r = await api.postFetchUrl(fetchUrl);
      dispatch({
        type: 'setSource',
        tmpId: r.tmpId,
        width: r.width,
        height: r.height,
        previewUrl: r.previewUrl,
      });
      // Keep the human-friendly URL the user typed (Wikipedia article
      // page, not the raw upload URL) as the attribution source; it links
      // back to the credits page that lists the author + license.
      dispatch({
        type: 'setMetadata',
        metadata: {
          ...state.metadata,
          sourceUrl: url,
          author: resolved?.author || state.metadata.author,
          license: resolved?.license || state.metadata.license,
        },
      });
    } catch (err) {
      console.error('fetch failed', err);
    } finally {
      setFetchBusy(false);
    }
  }
  async function onFileDrop(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await api.postFetchBytes(bytes, file.type || 'application/octet-stream');
      dispatch({
        type: 'setSource',
        tmpId: r.tmpId,
        width: r.width,
        height: r.height,
        previewUrl: r.previewUrl,
      });
    } catch (err) {
      console.error('file drop failed', err);
    }
  }

  /**
   * resumeGalaxy — the resumable-flow half of galaxy selection.
   *
   * Split out from the `onSelect` handler so the handler itself can stay
   * synchronous (dispatch the selection, then fire-and-forget the resume):
   *   1. Load recipe.json → reconstruct sliders + crop + metadata
   *   2. Point PreviewPane at the existing exported WebPs on disk
   *      (served by Vite from `public/images/famous-curated/<id>/`)
   *      so the maintainer immediately sees what was previously
   *      shipped, even before the source re-fetch completes.
   *   3. Re-fetch the source via the same Wikipedia-aware resolver
   *      that onFetch uses — recipes from the wiki-helper era
   *      store the article URL, not the direct image URL.
   * The source bytes aren't cached across sessions per spec, so
   * step 3 is unavoidable if the maintainer wants to re-Process.
   */
  async function resumeGalaxy(id: string): Promise<void> {
    const entry = state.galaxies.find((g) => g.id === id);
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
      // Disk geometry is re-hydrated AFTER the re-fetch below, because it
      // shares the crop's source-pixel frame and must be rescaled by the
      // same fetched/authored ratio.
      // Same resolver fallthrough as onFetch — recipes from older
      // curator sessions may store a Wikipedia article URL or a
      // NOIRLab gallery page; either way we want the direct image
      // URL to re-fetch the source bytes.
      const wiki = await resolveWikipediaMedia(r.recipe.metadata.sourceUrl).catch(() => null);
      const resolved = wiki ?? (await api.resolveMedia(r.recipe.metadata.sourceUrl));
      const fetchUrl = resolved?.directUrl ?? r.recipe.metadata.sourceUrl;
      const fetched = await api.postFetchUrl(fetchUrl);
      dispatch({
        type: 'setSource',
        tmpId: fetched.tmpId,
        width: fetched.width,
        height: fetched.height,
        previewUrl: fetched.previewUrl,
      });
      // setSource reset crop + previews; re-apply the recipe crop
      // and point previews at the prior export's on-disk files.
      // The ?v=<processedAt> query is a cache-buster: when the
      // maintainer re-exports, the file bytes change but the URL
      // would otherwise be identical, causing the browser to
      // serve the stale image from its disk cache.
      //
      // The recipe's crop + disk are in the ORIGINAL source's pixels and
      // the re-fetch can return a different resolution.  When the recipe
      // records the dimensions it was authored against (recipe.source),
      // we rescale BOTH by the exact fetched/authored ratio so they stay
      // co-registered with each other and the image.  Older recipes
      // predate that field, so the crop falls back to the best-effort
      // reframe and the disk is left as-is (no scale is knowable).
      const authored = r.recipe.source;
      const scale = authored && authored.width > 0 ? fetched.width / authored.width : undefined;
      dispatch({
        type: 'setCrop',
        crop:
          scale !== undefined
            ? rescaleCrop(r.recipe.crop, scale)
            : fitCropToSource(r.recipe.crop, {
                width: fetched.width,
                height: fetched.height,
              }),
      });
      // Re-hydrate disk geometry when the prior session drew one.
      // setDisk sets dirty.disk=true, so the resumed session will
      // re-Process on next Commit — acceptable, since setCrop above also
      // dirties crop, making a re-Process on Commit unavoidable anyway.
      if (r.recipe.disk) {
        dispatch({
          type: 'setDisk',
          disk: scale !== undefined ? rescaleDisk(r.recipe.disk, scale) : r.recipe.disk,
        });
      }
      const cacheBust = encodeURIComponent(r.recipe.processedAt);
      dispatch({
        type: 'setPreviews',
        starless: `/api/curated/${id}/starless.webp?v=${cacheBust}`,
        alpha: `/api/curated/${id}/full.webp?v=${cacheBust}`,
      });
    } catch (err) {
      console.error('resume failed', err);
    }
  }
  // Derived for the active galaxy — used in both the JSX tree (DiskControls,
  // CropCanvas) and onCommit (postProcess body).  A single derivation keeps
  // both consumers consistent without threading a prop.
  const activeGalaxy = state.galaxies.find((g) => g.id === state.activeId);
  const catalogAxisRatio = activeGalaxy?.axisRatio;

  // Effective b/a for the active disk: user override > catalog > round (1).
  // The same resolution chain DiskOverlay, DiskControls, and the export route
  // use, so the crop framing tracks the value the pipeline will deproject by.
  const effectiveAxisRatio = state.disk?.axisRatio ?? catalogAxisRatio ?? 1;

  // Aspect lock for the deproject crop, passed to CropCanvas (and forwarded
  // to DiskOverlay).  It is defined ONLY when the disk's deproject toggle is on
  // AND the resolved b/a is in the (0,1) tilt range that willDeproject gates —
  // otherwise the crop stays square / as-shot.  willDeproject is the single
  // deproject gate; do not re-implement the 0<b/a<1 test here.
  const deprojectAspect =
    state.disk?.deproject && willDeproject(effectiveAxisRatio) ? effectiveAxisRatio : undefined;

  /**
   * onDiskChange — owns the deproject-crop coupling.
   *
   * This is the one place that knows the disk geometry AND the crop, so it is
   * where "deproject turned on/off/retuned" gets translated into a crop action.
   * The coupling is non-obvious: the crop's shape (square vs. b/a-locked) and
   * its rotation (0 vs. disk PA) are DERIVED from the disk, not edited directly
   * by the user when deproject is on.  We compare the incoming disk against the
   * current one through the SAME willDeproject gate the render path uses, then
   * dispatch setDisk plus exactly one of three crop actions:
   *
   *   - transition ON (or a retune while on): seed a fresh deproject crop from
   *     the disk geometry, so the framing tracks centre/PA/axisRatio/margin.
   *   - transition OFF: restore the stashed as-shot square.
   *   - neither deproject before nor after: leave the crop untouched.
   *
   * Reseeding on EVERY deprojected onDiskChange (even a pure centre nudge) is
   * deliberate and simplest — seedDeprojectCrop re-frames on the disk, so a
   * redundant reseed is a no-op-shaped re-centre, not a correctness risk.  The
   * seeded crop's rotationDeg is always the disk PA; the App never lets the
   * user rotate a deproject crop (CropCanvas hides the rotate knob).
   */
  function onDiskChange(nextDisk: RecipeDisk): void {
    const prevDisk = state.disk;
    const wasDeproj =
      prevDisk?.deproject === true && willDeproject(prevDisk.axisRatio ?? catalogAxisRatio ?? 1);
    const nextEffectiveAxisRatio = nextDisk.axisRatio ?? catalogAxisRatio ?? 1;
    const nowDeproj = nextDisk.deproject === true && willDeproject(nextEffectiveAxisRatio);

    dispatch({ type: 'setDisk', disk: nextDisk });

    if (nowDeproj && state.source !== undefined) {
      // ON or retune-while-on: (re)seed the deproject crop from the new disk.
      // Guard on source: seedDeprojectCrop needs the image bounds, and there is
      // no crop to derive before a source is loaded.
      dispatch({
        type: 'setDeprojectCrop',
        crop: seedDeprojectCrop(
          nextDisk.centerPx,
          nextDisk.radiusPx,
          nextDisk.paDeg,
          nextEffectiveAxisRatio,
          nextDisk.margin ?? DEFAULT_DISK_MARGIN,
          { width: state.source.width, height: state.source.height },
        ),
      });
    } else if (wasDeproj && !nowDeproj) {
      // OFF: restore the as-shot square stashed when deproject first turned on.
      dispatch({ type: 'restoreSquareCrop' });
    }
    // else: not deprojected before or after — the crop is the user's square,
    // edited through CropCanvas directly; nothing to derive here.
  }

  /**
   * Unified commit: re-process if needed, export, then rebuild famous.bin.
   *
   * Skips the slow /api/process step when nothing crop- or starnet-relevant
   * has changed since the last successful process — the cached starless.png
   * still applies, and /api/export re-derives the alpha pass from it.
   * Alpha-only changes are picked up by the export step's alpha re-derive
   * (the standalone /api/process/alpha-only call is for the live preview;
   * it doesn't write to disk).
   */
  async function onCommit(): Promise<void> {
    if (!state.activeId || !state.tmpId || !state.crop) return;
    // disk dirty joins crop and starnet as a re-process trigger: toggling
    // deproject changes the geometry StarNet ingests, so the cached
    // starless.png is stale.  The reducer already sets dirty.disk on
    // setDisk / clearDisk.
    const needsProcess =
      state.dirty.crop || state.dirty.starnet || state.dirty.disk || !state.processedOnce;
    try {
      if (needsProcess) {
        setCommitPhase('processing');
        const r = await api.postProcess({
          tmpId: state.tmpId,
          crop: state.crop,
          starnet: state.starnet,
          alpha: state.alpha,
          disk: state.disk,
          catalogAxisRatio,
        });
        dispatch({ type: 'setPreviews', starless: r.starlessPreviewUrl, alpha: r.alphaPreviewUrl });
        dispatch({ type: 'markProcessed' });
      }
      setCommitPhase('exporting');
      // disk + catalogAxisRatio are threaded to the export route so it can
      // persist disk geometry in recipe.json and derive calibration (Plan 2).
      // ExportParams inherits ProcessParams which already declares both fields.
      await api.postExport({
        id: state.activeId,
        tmpId: state.tmpId,
        crop: state.crop,
        starnet: state.starnet,
        alpha: state.alpha,
        disk: state.disk,
        catalogAxisRatio,
        metadata: state.metadata,
      });
      dispatch({
        type: 'markCuratedById',
        id: state.activeId,
        hasDisk: state.disk !== undefined,
        diskDeproject: state.disk?.deproject,
      });
      setCommitPhase('building');
      // Best-effort rebuild — surface failures to the console but don't
      // tear down the workspace state (the export already landed on disk).
      const build = await api.postBuildFamous();
      if (!build.ok) {
        console.error('build-famous failed', build);
      }
    } catch (err) {
      console.error('commit failed', err);
    } finally {
      setCommitPhase('idle');
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
          onSelect={(id) => {
            dispatch({ type: 'selectGalaxy', id });
            void resumeGalaxy(id);
          }}
        />
      </aside>
      <Splitter ariaLabel="Resize left panel" onDrag={(dx) => setLeftW((w) => w + dx)} />
      <main>
        <SourceBar
          // key=activeId remounts the SourceBar when the user picks a
          // different galaxy, which clears its local URL-input state.
          // Without this, a half-typed URL from galaxy A would still
          // sit in the input after switching to galaxy B.
          key={state.activeId ?? '__none__'}
          disabled={state.activeId === undefined}
          busy={fetchBusy}
          onFetch={(url) => void onFetch(url)}
        />
        <CropCanvas
          source={state.source}
          crop={state.crop}
          onCropChange={(c) => dispatch({ type: 'setCrop', crop: c })}
          onFileDrop={(file) => void onFileDrop(file)}
          disk={state.disk}
          catalogAxisRatio={catalogAxisRatio}
          onDiskChange={onDiskChange}
          deprojectAspect={deprojectAspect}
          margin={state.disk?.margin}
          downloadOriginalUrl={state.tmpId ? `/api/preview/${state.tmpId}/source.png` : undefined}
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
            onPick={(url) => void onFetch(url)}
          />
        </div>
      </main>
      <Splitter ariaLabel="Resize right panel" onDrag={(dx) => setRightW((w) => w - dx)} />
      <aside>
        {/* DiskControls renders only when a disk ellipse has been drawn;
            placing it above ParamSliders groups disk geometry with the
            other pipeline controls. */}
        <DiskControls
          disk={state.disk}
          catalogAxisRatio={catalogAxisRatio}
          onDiskChange={onDiskChange}
        />
        <ParamSliders
          starnet={state.starnet}
          alpha={state.alpha}
          dirty={state.dirty}
          canCommit={canCommit(state)}
          commitPhase={commitPhase}
          onStarnet={(p) => dispatch({ type: 'setStarnet', starnet: p })}
          onAlpha={(p) => dispatch({ type: 'setAlpha', alpha: p })}
          onCommit={() => void onCommit()}
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
