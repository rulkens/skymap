/**
 * Albedo Bench App — loads the committed recipe, then debounces (150 ms) an
 * `original` /api/render call keyed on `box` alone, an `adjusted` one keyed
 * on the recipe too (any slider refits it), and a field refit keyed on
 * `sunFit` alone (a grade slider never refits). The server calls stay
 * effects: their cleanup is what cancels a stale debounce or response.
 */
import { useEffect } from 'react';
import { api } from './api';
import { Navigator } from './components/Navigator';
import { CompareView, HINT } from './components/CompareView';
import { SunPanel } from './components/SunPanel';
import { RecipeSliders } from './components/RecipeSliders';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { setShowArrows } from './store/navigationSlice';
import { recipeLoaded, recipeLoadFailed } from './store/recipeSlice';
import {
  adjustedRendered,
  fieldCleared,
  fieldFitted,
  originalRendered,
  renderFailed,
} from './store/renderSlice';
import { selectBox } from './store/selectBox';
import { selectManualG } from './store/selectManualG';

const PX = 512;
const DEBOUNCE_MS = 150;

function revokeUrl(url: string | undefined): void {
  if (url !== undefined) URL.revokeObjectURL(url);
}

export function App() {
  const dispatch = useAppDispatch();
  const recipe = useAppSelector((s) => s.recipe.recipe);
  const loadError = useAppSelector((s) => s.recipe.loadError);
  const box = useAppSelector(selectBox);
  const viewMode = useAppSelector((s) => s.navigation.viewMode);
  const showArrows = useAppSelector((s) => s.navigation.showArrows);
  const { sunMode, lightOn, light } = useAppSelector((s) => s.sun);
  const manualG = useAppSelector(selectManualG);
  const { originalUrl, adjustedUrl, renderError } = useAppSelector((s) => s.render);
  const sunFit = recipe?.sunFit;

  useEffect(() => {
    let cancelled = false;
    api
      .getRecipe()
      .then((r) => {
        if (!cancelled) dispatch(recipeLoaded(r));
      })
      .catch((err) => {
        if (!cancelled) dispatch(recipeLoadFailed(String(err)));
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .renderPng({ box, px: PX, variant: 'original' })
        .then((blob) => {
          if (!cancelled) dispatch(originalRendered({ url: URL.createObjectURL(blob), box }));
        })
        .catch((err) => {
          if (!cancelled) dispatch(renderFailed(String(err)));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [box, dispatch]);

  useEffect(() => {
    if (recipe === undefined) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .renderPng({
          box,
          px: PX,
          recipe,
          variant: 'adjusted',
          light: lightOn ? light : undefined,
          manualG: sunMode === 'manual' ? manualG : undefined,
        })
        .then((blob) => {
          if (!cancelled) dispatch(adjustedRendered({ url: URL.createObjectURL(blob), box }));
        })
        .catch((err) => {
          if (!cancelled) dispatch(renderFailed(String(err)));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [recipe, box, sunMode, manualG, lightOn, light, dispatch]);

  // Keyed on `sunFit`, not `recipe`: a grade edit keeps `sunFit`'s identity
  // (recipeSlice), so it never refits. Overlay off skips the fit outright —
  // the fast way to pan/zoom without paying for one.
  useEffect(() => {
    if (sunFit === undefined || !showArrows) {
      dispatch(fieldCleared());
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      api
        .getField(box, sunFit)
        .then((r) => {
          if (!cancelled) dispatch(fieldFitted(r));
        })
        .catch((err) => {
          if (!cancelled) dispatch(renderFailed(String(err)));
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [box, sunFit, showArrows, dispatch]);

  // A replaced image's object URL is freed once the new one is on screen.
  useEffect(() => () => revokeUrl(originalUrl), [originalUrl]);
  useEffect(() => () => revokeUrl(adjustedUrl), [adjustedUrl]);

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
          <div className="view-panel">
            <span className="label">View</span>
            <div className="toolbar">
              <Navigator />
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showArrows}
                  onChange={(e) => dispatch(setShowArrows(e.target.checked))}
                />
                Arrows
              </label>
            </div>
          </div>
          <SunPanel />
          <div className="well">
            <CompareView />
          </div>
          <p className="hint">{HINT[viewMode]}</p>
        </section>
        <aside className="panel" aria-label="Adjustments">
          <div className="body">
            <RecipeSliders />
          </div>
        </aside>
      </div>
    </div>
  );
}
