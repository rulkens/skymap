/**
 * SettingsPanel — bottom-left overlay for real-time rendering controls.
 *
 * ### What it does
 *
 * Renders four controls that let the user tune the galaxy renderer without
 * reloading the page:
 *
 *   1. Point size slider  — adjusts the billboard pixel radius (1 – 8 px).
 *   2. Brightness slider  — global star intensity multiplier (0.2 – 3.0).
 *   3. Auto-rotate toggle — enables slow camera yaw (~3°/sec).
 *   4. Reset camera button — snaps the camera back to the initial framing.
 *
 * ### Why it lives here
 *
 * This file sits alongside the other purely-presentational components
 * (InfoCard, ScaleBar, StatusBar). Like them, it has no knowledge of WebGPU,
 * the engine, or async data loading — it only receives typed props and emits
 * events up to App.tsx.
 *
 * ### Props-driven flow (no internal state)
 *
 * App.tsx owns all four pieces of state (pointSize, brightness, autoRotate,
 * and the "reset" trigger). The panel renders the current values and fires
 * callback props when the user changes a control:
 *
 *   User drags slider → onChange prop fires → App.tsx calls handle.setPointSize
 *   → engine updates closure variable → next frame uses new value.
 *
 * This one-way data flow keeps the panel a pure function of its inputs, which
 * makes it easy to test and reason about.
 */

import type { ReactNode } from 'react';

// ── Props ──────────────────────────────────────────────────────────────────────

/**
 * Props for SettingsPanel.
 *
 * All callbacks are required — App.tsx always wires them to the engine handle.
 */
type Props = {
  /** Current point size in pixels. */
  pointSize: number;
  /** Current global brightness multiplier. */
  brightness: number;
  /** Whether the camera is currently auto-rotating. */
  autoRotate: boolean;
  /** Called when the user changes the point-size slider. */
  onPointSizeChange: (v: number) => void;
  /** Called when the user changes the brightness slider. */
  onBrightnessChange: (v: number) => void;
  /** Called when the user toggles auto-rotate. */
  onAutoRotateChange: (v: boolean) => void;
  /** Called when the user clicks "Reset camera". */
  onResetCamera: () => void;
};

// ── SettingsPanel ──────────────────────────────────────────────────────────────

/**
 * Glassmorphic settings panel fixed to the bottom-left corner.
 *
 * The panel is always present in the DOM (unlike InfoCard, which is absent
 * when nothing is hovered). Its CSS lives in `index.html` under `#settings-panel`.
 *
 * @example
 * // In App.tsx:
 * <SettingsPanel
 *   pointSize={pointSize}
 *   brightness={brightness}
 *   autoRotate={autoRotate}
 *   onPointSizeChange={(v) => handleRef.current?.setPointSize(v)}
 *   onBrightnessChange={(v) => handleRef.current?.setBrightness(v)}
 *   onAutoRotateChange={(v) => handleRef.current?.setAutoRotate(v)}
 *   onResetCamera={() => handleRef.current?.resetCamera()}
 * />
 */
export function SettingsPanel({
  pointSize,
  brightness,
  autoRotate,
  onPointSizeChange,
  onBrightnessChange,
  onAutoRotateChange,
  onResetCamera,
}: Props): ReactNode {
  return (
    <div id="settings-panel" aria-label="Renderer settings">
      {/* ── Title ────────────────────────────────────────────────────────── */}
      <div className="panel-title">Settings</div>

      {/* ── Point size ───────────────────────────────────────────────────── */}
      {/*
        Layout: label + current value on one line, slider on the line below.
        This "stacked" arrangement gives the slider its full panel width so it
        stays easy to drag, while the label and value stay readable together.
      */}
      <div className="panel-row">
        <label htmlFor="slider-point-size">Point size</label>
        <span className="panel-value">{pointSize.toFixed(1)} px</span>
      </div>
      <div className="panel-row">
        <input
          id="slider-point-size"
          type="range"
          min={1.0}
          max={8.0}
          step={0.1}
          value={pointSize}
          onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
        />
      </div>

      {/* ── Brightness ───────────────────────────────────────────────────── */}
      <div className="panel-row">
        <label htmlFor="slider-brightness">Brightness</label>
        <span className="panel-value">{brightness.toFixed(2)}×</span>
      </div>
      <div className="panel-row">
        <input
          id="slider-brightness"
          type="range"
          min={0.2}
          max={3.0}
          step={0.05}
          value={brightness}
          onChange={(e) => onBrightnessChange(parseFloat(e.target.value))}
        />
      </div>

      {/* ── Auto-rotate ──────────────────────────────────────────────────── */}
      {/*
        Checkbox + label on a single row. The label wraps the text only (not
        the input) so the flex layout keeps them spaced to the panel width.
      */}
      <div className="panel-row">
        <label htmlFor="toggle-auto-rotate">Auto-rotate</label>
        <input
          id="toggle-auto-rotate"
          type="checkbox"
          checked={autoRotate}
          // `e.target.checked` is a boolean — pass it directly to the callback.
          onChange={(e) => onAutoRotateChange(e.target.checked)}
        />
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="panel-divider" role="separator" />

      {/* ── Reset camera ─────────────────────────────────────────────────── */}
      <button type="button" onClick={onResetCamera}>
        Reset camera
      </button>
    </div>
  );
}
