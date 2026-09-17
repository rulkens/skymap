/**
 * Albedo Bench App — loads the committed recipe, then debounces (150 ms) an
 * `original` /api/render call keyed on `box` alone, an `adjusted` one keyed
 * on the recipe too (any slider refits it), and a field refit keyed on
 * `sunFit` alone (a grade slider never refits). Save POSTs the recipe; Load
 * (on mount) restores every slider.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import { defaultApi, type FieldArrow, type RenderLight } from './api';
import { boxFromView, type ViewState } from './viewPresets';
import { Navigator, type ViewMode } from './components/Navigator';
import { CompareView, hintFor } from './components/CompareView';
import { SunPanel, type SunMode } from './components/SunPanel';
import { RecipeSliders } from './components/RecipeSliders';

const PX = 512;
const DEBOUNCE_MS = 150;
const DEFAULT_LIGHT: RenderLight = { azDeg: 315, elDeg: 45, roughness: 0.9, ambient: 0.08 };

// Manual `g` points down-sun (away from it), so negating turns the slider
// into the same "sun azimuth" the lighting-preview slider already means.
function manualGFrom(azDeg: number, strength: number): readonly [number, number] {
  const az = (azDeg * Math.PI) / 180;
  return [-strength * Math.sin(az), -strength * Math.cos(az)];
}

export function App() {
  const [recipe, setRecipe] = useState<AlbedoRecipe>();
  const recipeRef = useRef(recipe);
  recipeRef.current = recipe;
  const [loadError, setLoadError] = useState<string>();
  const [view, setView] = useState<ViewState>({ lon: 137.4, lat: -4.6, spanDeg: 2 });
  const [viewMode, setViewMode] = useState<ViewMode>('wipe');
  const [sunMode, setSunMode] = useState<SunMode>('fitted');
  const [manualAzDeg, setManualAzDeg] = useState(0);
  const [manualStrength, setManualStrength] = useState(1);
  const [lightOn, setLightOn] = useState(false);
  const [light, setLight] = useState<RenderLight>(DEFAULT_LIGHT);
  const [originalUrl, setOriginalUrl] = useState<string>();
  const [adjustedUrl, setAdjustedUrl] = useState<string>();
  const [arrows, setArrows] = useState<readonly FieldArrow[]>([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [renderError, setRenderError] = useState<string>();

  const box = useMemo(() => boxFromView(view), [view]);
  const manualG = useMemo(
    () => manualGFrom(manualAzDeg, manualStrength),
    [manualAzDeg, manualStrength],
  );
  const recipeLoaded = recipe !== undefined;
  const sunFit = recipe?.sunFit;

  useEffect(() => {
    let cancelled = false;
    defaultApi
      .getRecipe()
      .then((r) => {
        if (!cancelled) setRecipe(r);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // `original` never depends on the recipe, only on the box — read the
  // latest recipe through a ref so a grade-slider edit can't retrigger this.
  useEffect(() => {
    if (!recipeLoaded) return;
    const currentRecipe = recipeRef.current;
    if (currentRecipe === undefined) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      defaultApi
        .renderPng({ box, px: PX, recipe: currentRecipe, variant: 'original' })
        .then((blob) => {
          if (cancelled) return;
          setOriginalUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        })
        .catch((err) => {
          if (!cancelled) setRenderError(String(err));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [box, recipeLoaded]);

  useEffect(() => {
    if (recipe === undefined) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      defaultApi
        .renderPng({
          box,
          px: PX,
          recipe,
          variant: 'adjusted',
          light: lightOn ? light : undefined,
          manualG: sunMode === 'manual' ? manualG : undefined,
        })
        .then((blob) => {
          if (cancelled) return;
          setAdjustedUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
          setRenderError(undefined);
        })
        .catch((err) => {
          if (!cancelled) setRenderError(String(err));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [recipe, box, sunMode, manualG, lightOn, light]);

  // Field refit — box or sunFit only. `sunFit` (not `recipe`) is the
  // dependency so an unrelated slider edit, which replaces `recipe`'s object
  // identity without touching `sunFit`, never refits.
  useEffect(() => {
    if (sunFit === undefined) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      defaultApi
        .getField(box, sunFit)
        .then((r) => {
          if (!cancelled) setArrows(r.arrows);
        })
        .catch((err) => {
          if (!cancelled) setRenderError(String(err));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [box, sunFit]);

  async function onSave(): Promise<void> {
    if (recipe === undefined) return;
    setSaveStatus('Saving…');
    try {
      const saved = await defaultApi.saveRecipe(recipe);
      setRecipe(saved);
      setSaveStatus('Saved.');
    } catch (err) {
      setSaveStatus(`Save failed: ${String(err)}`);
    }
  }

  if (loadError !== undefined) {
    return <div className="wrap">Failed to load recipe: {loadError}</div>;
  }
  if (recipe === undefined) {
    return <div className="wrap">Loading recipe…</div>;
  }

  return (
    <div className="wrap">
      <header>
        <h1>Albedo Bench</h1>
        {renderError !== undefined ? <div className="bench-error">{renderError}</div> : null}
      </header>
      <div className="bench">
        <section className="viewer" aria-label="Comparison">
          <div className="toolbar">
            <Navigator view={view} onView={setView} viewMode={viewMode} onViewMode={setViewMode} />
          </div>
          <SunPanel
            sunMode={sunMode}
            onSunMode={setSunMode}
            manualAzDeg={manualAzDeg}
            manualStrength={manualStrength}
            onManualAzDeg={setManualAzDeg}
            onManualStrength={setManualStrength}
            lightOn={lightOn}
            onLightOn={setLightOn}
            light={light}
            onLight={setLight}
          />
          <div className="well">
            <CompareView
              originalUrl={originalUrl}
              adjustedUrl={adjustedUrl}
              viewMode={viewMode}
              arrows={sunMode === 'fitted' ? arrows : []}
              box={box}
            />
          </div>
          <p className="hint">{hintFor(viewMode)}</p>
        </section>
        <aside className="panel" aria-label="Adjustments">
          <div className="body">
            <RecipeSliders
              recipe={recipe}
              onRecipe={setRecipe}
              onSave={() => void onSave()}
              saveStatus={saveStatus}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
