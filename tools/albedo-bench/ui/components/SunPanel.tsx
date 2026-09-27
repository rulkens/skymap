/**
 * SunPanel — the fitted/manual seg toggle for the shading field (manual is a
 * bench-only comparison, never saved — design §2 R6), plus the
 * lighting-preview lightbox card that relights both textures.
 */
import type { RenderLight } from '../api';

export type SunMode = 'fitted' | 'manual';

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
          <div className="ctl">
            <label>Azimuth</label>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={props.manualAzDeg}
              onChange={(e) => props.onManualAzDeg(Number(e.target.value))}
            />
            <output>{props.manualAzDeg.toFixed(0)}°</output>
          </div>
          <div className="ctl">
            <label>Strength</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.01"
              value={props.manualStrength}
              onChange={(e) => props.onManualStrength(Number(e.target.value))}
            />
            <output>{props.manualStrength.toFixed(2)}</output>
          </div>
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
            <div className="ctl">
              <label>Sun azimuth</label>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={light.azDeg}
                onChange={(e) => onLight({ ...light, azDeg: Number(e.target.value) })}
              />
              <output>{light.azDeg.toFixed(0)}°</output>
            </div>
            <div className="ctl">
              <label>Sun elevation</label>
              <input
                type="range"
                min="0"
                max="90"
                step="1"
                value={light.elDeg}
                onChange={(e) => onLight({ ...light, elDeg: Number(e.target.value) })}
              />
              <output>{light.elDeg.toFixed(0)}°</output>
            </div>
            <div className="ctl">
              <label>Roughness</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={light.roughness}
                onChange={(e) => onLight({ ...light, roughness: Number(e.target.value) })}
              />
              <output>{light.roughness.toFixed(2)}</output>
            </div>
            <div className="ctl">
              <label>Ambient</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={light.ambient}
                onChange={(e) => onLight({ ...light, ambient: Number(e.target.value) })}
              />
              <output>{light.ambient.toFixed(2)}</output>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
