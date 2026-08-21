// src/components/SettingsPanel/DisplaySection.tsx
/**
 * DisplaySection — presentational component for the Display settings section
 * inside the SettingsPanel.
 *
 * Owns the Display thematic group UI: the orientation and tone-mapping curve
 * dropdowns, the exposure slider, the field-of-view slider, and two nested
 * CollapsibleSections — "Bloom"
 * and "HDR" (both use the same master-enable header-toggle idiom `FlowSection`
 * uses; HDR's toggle is additionally `disabled` when `hdrCapable` is false, so
 * a user on an SDR display sees why it can't be flipped rather than a toggle
 * that silently does nothing). Further subgroups (e.g. the Earth
 * atmosphere-exposure disclosure) are passed in as `children` and rendered
 * below, so Display need not drill their props. Isolating this into its own
 * component ensures a change here re-renders ONLY this section rather than
 * the entire HUD.
 *
 * ### Props-driven, no internal state
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and the transient CollapsibleSection open/closed state. Tests supply plain
 * props with no Provider.
 *
 * Why `memo`: when `DisplaySectionContainer`'s parent re-renders for an
 * unrelated reason, `memo` bails on the prop-compare step so the section does
 * not re-render. The `useCallback`-wrapped handler the container passes in has
 * stable identity (dispatch is invariant), making the bail effective.
 *
 * The `parseInt(value, 10) as ToneMapCurveT` parse in the `onChange` handler
 * is necessary because `<select>` value attributes are always strings — the
 * numeric curve codes stored in the const object and required by the GPU
 * contract must be explicitly reconstructed from the string the browser returns.
 */

import { memo } from 'react';
import type { ReactNode } from 'react';
import type { ToneMapCurve as ToneMapCurveT } from '../../@types/data/ToneMapCurve';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import { ALL_TONE_MAP_CURVES, toneMapCurveLabel } from '../../data/toneMapCurve';
import { orientationFrameLabel } from '../../data/orientation/orientationFrameLabel';
import { ORIENTATION_FRAMES } from '../../data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../data/defaults';
import { STAR_EMISSIVE } from '../../data/starRenderConstants';
import { exposureToEv } from '../../utils/tonemap/exposureToEv';
import { evToExposure } from '../../utils/tonemap/evToExposure';
import CollapsibleSection from './CollapsibleSection';
import Slider from '../common/Slider/Slider';
import styles from './SettingsPanel.module.css';

// ── Module-level constants ─────────────────────────────────────────────────────

/**
 * The id SET is the registry's own keys (a new frame can't silently vanish
 * from this dropdown); this only pins display order, default frame first.
 */
const ORIENTATION_FRAME_IDS: readonly OrientationFrameId[] = [
  DEFAULT_ORIENTATION,
  ...(Object.keys(ORIENTATION_FRAMES) as OrientationFrameId[]).filter(
    (id) => id !== DEFAULT_ORIENTATION,
  ),
];

/**
 * Explicit `+` on gains above unity, the photographic convention — without it
 * "1.6 EV" and "-1.6 EV" read as the same kind of number at a glance, when they
 * are a 3× brightening and a 3× darkening.
 */
function formatEv(ev: number): string {
  return `${ev > 0 ? '+' : ''}${ev.toFixed(1)} EV`;
}

// ── Props ──────────────────────────────────────────────────────────────────────

export type DisplaySectionProps = {
  /** Currently selected orientation frame (which plane is levelled as "up"). */
  orientation: OrientationFrameId;
  /** Called with the newly selected frame when the orientation dropdown changes. */
  onOrientationChange: (frame: OrientationFrameId) => void;
  /** Currently selected tone-mapping curve. */
  toneMapCurve: ToneMapCurveT;
  /** Called with the newly selected curve when the dropdown changes. */
  onToneMapCurveChange: (curve: ToneMapCurveT) => void;
  /** Linear multiplier applied to the HDR buffer before the tone curve. */
  exposure: number;
  /** Called with the new exposure as the slider drags. */
  onExposureChange: (next: number) => void;
  /** Vertical camera field of view, in degrees. */
  fovDeg: number;
  /** Called with the new FOV as the slider drags. */
  onFovDegChange: (next: number) => void;
  /** Whether extended-range HDR output is turned on. */
  hdrEnabled: boolean;
  /** Called with the toggled flag when the HDR header toggle is clicked. */
  onHdrEnabledChange: (next: boolean) => void;
  /** Whether the active display currently reports more than SDR range. */
  hdrCapable: boolean;
  /** Post-exposure brightness above which energy spills into display headroom. */
  hdrKnee: number;
  /** Called with the new knee as the slider drags. */
  onHdrKneeChange: (next: number) => void;
  /** Multiplier on the over-knee energy spilled into display headroom. */
  hdrHeadroom: number;
  /** Called with the new headroom as the slider drags. */
  onHdrHeadroomChange: (next: number) => void;
  /** Whether the screen-space bloom pass is active. */
  bloomEnabled: boolean;
  /** Called with the toggled flag when the bloom checkbox is clicked. */
  onBloomEnabledChange: (next: boolean) => void;
  /** Scale on the blurred mip pyramid composited back over the HDR frame. */
  bloomStrength: number;
  /** Called with the new strength as the slider drags. */
  onBloomStrengthChange: (next: number) => void;
  /** HDR luminance above which a pixel contributes to the bloom pyramid. */
  bloomThreshold: number;
  /** Called with the new threshold as the slider drags. */
  onBloomThresholdChange: (next: number) => void;
  /** Nested subgroups rendered below the tone-curve dropdown (e.g. Earth). */
  children?: ReactNode;
};

// ── DisplaySection ─────────────────────────────────────────────────────────────

/**
 * Renders the Display thematic group: a single tone-curve dropdown in a
 * power-user disclosure (default closed — explorer never sees tone-curve
 * jargon; tweaker opens one disclosure to find it).
 */
function DisplaySection({
  orientation,
  onOrientationChange,
  toneMapCurve,
  onToneMapCurveChange,
  exposure,
  onExposureChange,
  fovDeg,
  onFovDegChange,
  hdrEnabled,
  onHdrEnabledChange,
  hdrCapable,
  hdrKnee,
  onHdrKneeChange,
  hdrHeadroom,
  onHdrHeadroomChange,
  bloomEnabled,
  onBloomEnabledChange,
  bloomStrength,
  onBloomStrengthChange,
  bloomThreshold,
  onBloomThresholdChange,
  children,
}: DisplaySectionProps) {
  return (
    <CollapsibleSection title="Display">
      <div className={styles.panelRow}>
        <label htmlFor="orientation-frame">Orientation</label>
        <select
          id="orientation-frame"
          className={styles.modeSelect}
          value={orientation}
          onChange={(e) => onOrientationChange(e.target.value as OrientationFrameId)}
        >
          {ORIENTATION_FRAME_IDS.map((id) => (
            <option key={id} value={id}>
              {orientationFrameLabel(id)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.panelRow}>
        <label htmlFor="tonemap-curve">Tone curve</label>
        <select
          id="tonemap-curve"
          className={styles.modeSelect}
          value={toneMapCurve}
          onChange={(e) => onToneMapCurveChange(parseInt(e.target.value, 10) as ToneMapCurveT)}
        >
          {ALL_TONE_MAP_CURVES.map((c) => (
            <option key={c} value={c}>
              {toneMapCurveLabel(c)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.panelRow}>
        {/* Shown in stops, stored as the linear gain the tone-map wants: equal
            steps in linear exposure are wildly unequal perceptually, so the
            slider would crawl at the dim end and jump at the bright one. */}
        <Slider
          label="Exposure"
          value={exposureToEv(exposure)}
          min={-4}
          max={4}
          step={0.25}
          onChange={(ev) => onExposureChange(evToExposure(ev))}
          format={formatEv}
        />
      </div>

      <div className={styles.panelRow}>
        <Slider
          label="Field of view"
          value={fovDeg}
          min={30}
          max={100}
          step={1}
          onChange={onFovDegChange}
          format={(v) => `${Math.round(v)}°`}
        />
      </div>

      <CollapsibleSection
        title="Bloom"
        headerToggle={bloomEnabled}
        onHeaderToggleChange={onBloomEnabledChange}
      >
        <div className={styles.panelRow}>
          <Slider
            label="Strength"
            value={bloomStrength}
            min={0}
            max={2}
            step={0.05}
            onChange={onBloomStrengthChange}
            format={(v) => v.toFixed(2)}
          />
        </div>
        <div className={styles.panelRow}>
          {/* Ceiling is the resolved-star emissive: above it the threshold would
              exclude the Sun's own disc and kill its bloom. See the ordering
              invariant in data/starRenderConstants.ts. */}
          <Slider
            label="Threshold"
            value={bloomThreshold}
            min={0}
            max={STAR_EMISSIVE}
            step={0.1}
            onChange={onBloomThresholdChange}
            format={(v) => v.toFixed(1)}
          />
        </div>
      </CollapsibleSection>

      {/* Master toggle drives settings.hdr.enabled, which the swap-chain saga
          watches to reconfigure the surface at runtime. Disabled + hinted
          when hdrCapable is false so an SDR display never shows a switch
          that would silently do nothing if flipped. */}
      <CollapsibleSection
        title="HDR"
        headerToggle={hdrEnabled}
        onHeaderToggleChange={onHdrEnabledChange}
        disabled={!hdrCapable}
        disabledHint="Needs a display with HDR range"
      >
        <div className={styles.panelRow}>
          {/* The default sits at the Reinhard whitepoint, where the curve
              saturates — below it the spill lifts midtones the curve still had
              range for, above it highlights clip flat before the spill starts. */}
          <Slider
            label="Knee"
            value={hdrKnee}
            min={0}
            max={12}
            step={0.1}
            onChange={onHdrKneeChange}
            format={(v) => v.toFixed(1)}
          />
        </div>
        <div className={styles.panelRow}>
          <Slider
            label="Headroom"
            value={hdrHeadroom}
            min={0}
            max={2}
            step={0.05}
            onChange={onHdrHeadroomChange}
            format={(v) => v.toFixed(2)}
          />
        </div>
      </CollapsibleSection>

      {children}
    </CollapsibleSection>
  );
}

export default memo(DisplaySection);
