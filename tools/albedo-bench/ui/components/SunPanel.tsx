/**
 * SunPanel — the fitted/manual toggle for the shading field (manual is a
 * bench-only comparison, never saved — design §2 R6), plus the
 * lighting-preview relight controls.
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
    <section className="bench-sun-panel">
      <fieldset>
        <legend>Sun field</legend>
        <label>
          <input
            type="radio"
            name="sun-mode"
            checked={props.sunMode === 'fitted'}
            onChange={() => props.onSunMode('fitted')}
          />
          fitted
        </label>
        <label>
          <input
            type="radio"
            name="sun-mode"
            checked={props.sunMode === 'manual'}
            onChange={() => props.onSunMode('manual')}
          />
          manual
        </label>
        {props.sunMode === 'manual' ? (
          <>
            <label>
              azimuth (deg) <span>{props.manualAzDeg.toFixed(0)}</span>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={props.manualAzDeg}
                onChange={(e) => props.onManualAzDeg(Number(e.target.value))}
              />
            </label>
            <label>
              strength <span>{props.manualStrength.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="2"
                step="0.01"
                value={props.manualStrength}
                onChange={(e) => props.onManualStrength(Number(e.target.value))}
              />
            </label>
          </>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>
          <label>
            <input
              type="checkbox"
              checked={props.lightOn}
              onChange={(e) => props.onLightOn(e.target.checked)}
            />
            lighting preview
          </label>
        </legend>
        {props.lightOn ? (
          <>
            <label>
              azimuth (deg) <span>{light.azDeg.toFixed(0)}</span>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={light.azDeg}
                onChange={(e) => onLight({ ...light, azDeg: Number(e.target.value) })}
              />
            </label>
            <label>
              elevation (deg) <span>{light.elDeg.toFixed(0)}</span>
              <input
                type="range"
                min="0"
                max="90"
                step="1"
                value={light.elDeg}
                onChange={(e) => onLight({ ...light, elDeg: Number(e.target.value) })}
              />
            </label>
            <label>
              roughness <span>{light.roughness.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={light.roughness}
                onChange={(e) => onLight({ ...light, roughness: Number(e.target.value) })}
              />
            </label>
            <label>
              ambient <span>{light.ambient.toFixed(2)}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={light.ambient}
                onChange={(e) => onLight({ ...light, ambient: Number(e.target.value) })}
              />
            </label>
          </>
        ) : null}
      </fieldset>
    </section>
  );
}
