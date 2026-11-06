/**
 * SunPanel — the fitted/manual seg toggle for the shading field (manual is a
 * bench-only comparison, never saved — design §2 R6), plus the
 * lighting-preview lightbox card that relights both textures.
 */
import type { RenderLight } from '../../@types/RenderLight';
import type { SunMode } from '../../@types/SunMode';
import { SliderRow } from './SliderRow';

export type SunPanelProps = {
  sunMode: SunMode;
  onSunMode: (mode: SunMode) => void;
  manualAzDeg: number;
  manualStrength: number;
  onManualAzDeg: (v: number) => void;
  onManualStrength: (v: number) => void;
  lightOn: boolean;
  onLightOn: (v: boolean) => void;
  light: RenderLight;
  onLight: (light: RenderLight) => void;
};

export function SunPanel(props: SunPanelProps) {
  const { light, onLight } = props;
  return (
    <div className="sun-panel">
      <div className="seg" role="group" aria-label="Sun field">
        <button aria-pressed={props.sunMode === 'fitted'} onClick={() => props.onSunMode('fitted')}>
          Fitted
        </button>
        <button aria-pressed={props.sunMode === 'manual'} onClick={() => props.onSunMode('manual')}>
          Manual
        </button>
      </div>
      {props.sunMode === 'manual' ? (
        <div className="manual-sun">
          <SliderRow
            label="Azimuth"
            value={props.manualAzDeg}
            min={0}
            max={360}
            step={1}
            onChange={props.onManualAzDeg}
          />
          <SliderRow
            label="Strength"
            value={props.manualStrength}
            min={0}
            max={2}
            step={0.01}
            onChange={props.onManualStrength}
          />
        </div>
      ) : null}
      <div className="lightbox" aria-label="Shading preview">
        <div className="head">
          <span className="label">Lighting preview</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={props.lightOn}
              onChange={(e) => props.onLightOn(e.target.checked)}
            />
            Light the render
          </label>
        </div>
        {props.lightOn ? (
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
