/**
 * Navigator — lon/lat/span inputs, the preset views, and the
 * original/adjusted comparison mode.
 */
import { VIEW_PRESETS, type ViewState } from '../viewPresets';

export type ViewMode = 'wipe' | 'side-by-side' | 'flip';
const VIEW_MODES: readonly ViewMode[] = ['wipe', 'side-by-side', 'flip'];

export type NavigatorProps = {
  view: ViewState;
  onView: (view: ViewState) => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
};

export function Navigator(props: NavigatorProps) {
  const { view, onView } = props;
  return (
    <section className="bench-navigator">
      <div className="bench-presets">
        {VIEW_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onView({ lon: p.lon, lat: p.lat, spanDeg: p.spanDeg })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <label>
        lon
        <input
          type="number"
          step="0.1"
          value={view.lon}
          onChange={(e) => onView({ ...view, lon: Number(e.target.value) })}
        />
      </label>
      <label>
        lat
        <input
          type="number"
          step="0.1"
          value={view.lat}
          onChange={(e) => onView({ ...view, lat: Number(e.target.value) })}
        />
      </label>
      <label>
        span (deg)
        <input
          type="number"
          step="0.1"
          min="0.05"
          value={view.spanDeg}
          onChange={(e) => onView({ ...view, spanDeg: Number(e.target.value) })}
        />
      </label>
      <div className="bench-view-mode" role="radiogroup" aria-label="comparison mode">
        {VIEW_MODES.map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name="view-mode"
              checked={props.viewMode === mode}
              onChange={() => props.onViewMode(mode)}
            />
            {mode}
          </label>
        ))}
      </div>
    </section>
  );
}
