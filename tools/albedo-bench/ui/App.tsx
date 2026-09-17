/**
 * Albedo Bench App — loads the committed recipe, then debounces (150 ms)
 * a pair of /api/render calls (`original`, `adjusted`) on every box or
 * pixel-step change, and a /api/field refit ONLY when the view box or
 * `sunFit` changes (task 8's request-handling rule) — a grade slider never
 * refits. Save POSTs the recipe; Load (on mount) restores every slider.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import { defaultApi, type FieldArrow, type RenderLight } from './api';
import { boxFromView, type ViewState } from './viewPresets';
import { Navigator, type ViewMode } from './components/Navigator';
import { CompareView } from './components/CompareView';
import { SunPanel, type SunMode } from './components/SunPanel';
import { RecipeSliders } from './components/RecipeSliders';

const PX = 512;
const DEBOUNCE_MS = 150;
const DEFAULT_LIGHT: RenderLight = { azDeg: 315, elDeg: 45, roughness: 0.9, ambient: 0.08 };

function manualGFrom(azDeg: number, strength: number): readonly [number, number] {
  const az = (azDeg * Math.PI) / 180;
  return [strength * Math.sin(az), strength * Math.cos(az)];
}

export function App() {
  const [recipe, setRecipe] = useState<AlbedoRecipe>();
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

  const box = useMemo(() => boxFromView(view), [view.lon, view.lat, view.spanDeg]);
  const manualG = useMemo(
    () => manualGFrom(manualAzDeg, manualStrength),
    [manualAzDeg, manualStrength],
  );

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

  // Render both variants. `apply` carries `sunFit` too (the wire shape) —
  // extra keys past `Omit<AlbedoRecipe, 'version'>` are harmless, and the
  // server destructures what it needs.
  useEffect(() => {
    if (recipe === undefined) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      Promise.all([
        defaultApi.renderPng({ box, px: PX, apply: recipe, variant: 'original' }),
        defaultApi.renderPng({
          box,
          px: PX,
          apply: recipe,
          variant: 'adjusted',
          light: lightOn ? light : undefined,
          manualG: sunMode === 'manual' ? manualG : undefined,
        }),
      ])
        .then(([origBlob, adjBlob]) => {
          if (cancelled) return;
          setOriginalUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(origBlob);
          });
          setAdjustedUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(adjBlob);
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

  // Field refit — box or sunFit only, per task 8's request-handling rule.
  // `recipe.sunFit` keeps its object identity across an unrelated slider
  // edit (RecipeSliders spreads `recipe` without touching `sunFit`), so
  // this effect only fires when it's actually replaced.
  useEffect(() => {
    if (recipe === undefined) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      defaultApi
        .getField(box, recipe.sunFit)
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
  }, [box, recipe?.sunFit]);

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
    return <div className="bench-app bench-error-page">Failed to load recipe: {loadError}</div>;
  }
  if (recipe === undefined) {
    return <div className="bench-app bench-loading">Loading recipe…</div>;
  }

  return (
    <div className="bench-app">
      <header>
        <h1>Albedo Bench</h1>
        {renderError !== undefined ? <div className="bench-error">{renderError}</div> : null}
      </header>
      <div className="bench-layout">
        <aside>
          <Navigator view={view} onView={setView} viewMode={viewMode} onViewMode={setViewMode} />
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
        </aside>
        <main>
          <CompareView
            originalUrl={originalUrl}
            adjustedUrl={adjustedUrl}
            viewMode={viewMode}
            arrows={sunMode === 'fitted' ? arrows : []}
            box={box}
          />
        </main>
        <aside>
          <RecipeSliders
            recipe={recipe}
            onRecipe={setRecipe}
            onSave={() => void onSave()}
            saveStatus={saveStatus}
          />
        </aside>
      </div>
    </div>
  );
}
