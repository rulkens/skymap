/**
 * SunPanel — the fitted/manual seg toggle for the shading field (manual is a
 * bench-only comparison, never saved — design §2 R6), plus the
 * lighting-preview lightbox card that relights both textures.
 */
import type { RenderLight } from '../../@types/RenderLight';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  setLight,
  setLightOn,
  setManualAzDeg,
  setManualStrength,
  setSunMode,
} from '../store/sunSlice';
import { SliderRow } from './SliderRow';

export function SunPanel() {
  const dispatch = useAppDispatch();
  const { sunMode, manualAzDeg, manualStrength, lightOn, light } = useAppSelector((s) => s.sun);
  const onLight = (next: RenderLight) => dispatch(setLight(next));
  return (
    <div className="sun-panel">
      <div className="seg" role="group" aria-label="Sun field">
        <button aria-pressed={sunMode === 'fitted'} onClick={() => dispatch(setSunMode('fitted'))}>
          Fitted
        </button>
        <button aria-pressed={sunMode === 'manual'} onClick={() => dispatch(setSunMode('manual'))}>
          Manual
        </button>
      </div>
      {sunMode === 'manual' ? (
        <div className="manual-sun">
          <SliderRow
            label="Azimuth"
            value={manualAzDeg}
            min={0}
            max={360}
            step={1}
            onChange={(v) => dispatch(setManualAzDeg(v))}
          />
          <SliderRow
            label="Strength"
            value={manualStrength}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => dispatch(setManualStrength(v))}
          />
        </div>
      ) : null}
      <div className="lightbox" aria-label="Shading preview">
        <div className="head">
          <span className="label">Lighting preview</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={lightOn}
              onChange={(e) => dispatch(setLightOn(e.target.checked))}
            />
            Light the render
          </label>
        </div>
        {lightOn ? (
          <div className="grid">
            <SliderRow
              label="Sun azimuth"
              value={light.azDeg}
              min={0}
              max={360}
              step={1}
              onChange={(v) => onLight({ ...light, azDeg: v })}
            />
            <SliderRow
              label="Sun elevation"
              value={light.elDeg}
              min={0}
              max={90}
              step={1}
              onChange={(v) => onLight({ ...light, elDeg: v })}
            />
            <SliderRow
              label="Roughness"
              value={light.roughness}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onLight({ ...light, roughness: v })}
            />
            <SliderRow
              label="Ambient"
              value={light.ambient}
              min={0}
              max={1}
              step={0.01}
              onChange={(v) => onLight({ ...light, ambient: v })}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
