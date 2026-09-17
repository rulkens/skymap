/**
 * Navigator — the toolbar's view-mode and preset segmented groups, plus the
 * lon/lat/span coordinate fields; rendered inline in the viewer's toolbar
 * row (App owns the wrapping `.toolbar` div).
 */
import { VIEW_PRESETS, type ViewState } from '../viewPresets';

export type ViewMode = 'wipe' | 'side-by-side' | 'flip';
const VIEW_MODES: readonly ViewMode[] = ['wipe', 'side-by-side', 'flip'];
const VIEW_MODE_LABEL: Record<ViewMode, string> = {
  wipe: 'Wipe',
  'side-by-side': 'Side by side',
  flip: 'Flip',
};

export type NavigatorProps = {
  view: ViewState;
  onView: (view: ViewState) => void;
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
};

export function Navigator(props: NavigatorProps) {
  const { view, onView } = props;
  const isPreset = (p: ViewState) =>
    p.lon === view.lon && p.lat === view.lat && p.spanDeg === view.spanDeg;
  return (
    <>
      <div className="seg" role="group" aria-label="View">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            aria-pressed={props.viewMode === mode}
            onClick={() => props.onViewMode(mode)}
          >
            {VIEW_MODE_LABEL[mode]}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="Preset">
        {VIEW_PRESETS.map((p) => (
          <button
            key={p.label}
            aria-pressed={isPreset(p)}
            onClick={() => onView({ lon: p.lon, lat: p.lat, spanDeg: p.spanDeg })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="coords">
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
          span
          <input
            type="number"
            step="0.1"
            min="0.05"
            value={view.spanDeg}
            onChange={(e) => onView({ ...view, spanDeg: Number(e.target.value) })}
          />
        </label>
      </div>
    </>
  );
}
