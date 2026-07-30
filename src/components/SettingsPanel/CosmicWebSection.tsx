// src/components/SettingsPanel/CosmicWebSection.tsx
/**
 * CosmicWebSection — presentational component for the Cosmic web thematic
 * group inside the SettingsPanel.
 *
 * Owns the Cosmic web thematic group UI: the master toggle, the Style picker
 * (Smooth / Filaments / Both), the filament-intensity slider, and the per-cube
 * `VolumeFieldRow` list. Isolating this into its own component ensures a slider
 * drag re-renders ONLY this section rather than the entire HUD. The section
 * owns the master derivation and Style picker logic (`deriveCosmicWebStyle` +
 * `onCosmicWebMasterToggle` + `onSetCosmicWebStyle`) — all of which are
 * section-local.
 *
 * ### Style picker semantics
 *
 * The picker (Smooth / Filaments / Both) batches mutations to the two
 * underlying master toggles:
 *
 *   - Smooth     → volumes ON,  filaments OFF
 *   - Filaments  → volumes OFF, filaments ON
 *   - Both       → volumes ON,  filaments ON
 *
 * The label is derived from (volumesEnabled, filamentsEnabled) at render time;
 * the picker is a UI shortcut, not a separate state slot.  When neither master
 * is on the picker is hidden — there is nothing to style.
 *
 * ### Filament intensity slider gate
 *
 * The slider is shown only when `filamentsEnabled` is true — it would have no
 * visible effect otherwise, and hiding a knob whose target is OFF is less
 * confusing than showing a slider that does nothing.
 *
 * ### Props-driven, no internal state
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and transient CollapsibleSection open/closed state. Tests supply plain props
 * with no Provider.
 *
 * Why `memo`: when `CosmicWebSectionContainer`'s parent re-renders for an
 * unrelated reason, `memo` bails on the prop-compare step so the section does
 * not re-render. The `useCallback`-wrapped handlers the container passes in
 * have stable identity (dispatch is invariant), making the bail effective.
 */

import { memo } from 'react';
import type { ScalarFieldPaletteId } from '../../@types/data/volume/ScalarFieldPaletteId';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldRowData } from '../../@types/settings/VolumeFieldRowData';
import { VolumeFieldRow } from './VolumeFieldRow';
import CollapsibleSection from './CollapsibleSection';
import Slider from '../common/Slider/Slider';
import styles from './SettingsPanel.module.css';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * High-level Style picker options for the Cosmic web group. Derived from
 * (volumes master, filaments master) at render time — the picker is a UI
 * shortcut, not a separate state slot.
 */
type CosmicWebStyle = 'smooth' | 'filaments' | 'both';

// ── Props ──────────────────────────────────────────────────────────────────────

export type CosmicWebSectionProps = {
  /** Whether the scalar-volume master is on. */
  volumesEnabled: boolean;
  /** Called when the master toggle or Style picker flips the volumes master. */
  onVolumesEnabledChange: (enabled: boolean) => void;
  /** Whether the DisPerSE filament-skeleton overlay is on. */
  filamentsEnabled: boolean;
  /** Called when the master toggle or Style picker flips the filaments master. */
  onFilamentsChange: (enabled: boolean) => void;
  /** Filament-overlay intensity scale, [0, 1]. Shown in Advanced when filaments are on. */
  filamentIntensity: number;
  /** Called when the user drags the filament-intensity slider. */
  onFilamentIntensityChange: (value: number) => void;
  /**
   * Per-cube display rows — one entry per registered volume field, already
   * projected and filtered (debug-* fields excluded). Drives the VolumeFieldRow
   * list inside Advanced.
   */
  volumeFields: ReadonlyArray<VolumeFieldRowData>;
  onVolumeFieldEnabledChange: (id: VolumeFieldId, enabled: boolean) => void;
  onVolumeFieldIntensityChange: (id: VolumeFieldId, intensity: number) => void;
  onVolumeFieldContrastChange: (id: VolumeFieldId, contrast: number) => void;
  onVolumeFieldDensityScaleChange: (id: VolumeFieldId, value: number) => void;
  onVolumeFieldTrimChange: (id: VolumeFieldId, trim: number) => void;
  onVolumeFieldExposureChange: (id: VolumeFieldId, exposure: number) => void;
  onVolumeFieldPaletteChange: (id: VolumeFieldId, paletteId: ScalarFieldPaletteId) => void;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Derive the current Cosmic web style from the two underlying master toggles.
 * Returns `null` when neither is on — caller hides the picker (the group's own
 * master is OFF, so there is nothing to style).
 */
function deriveCosmicWebStyle(volumesOn: boolean, filamentsOn: boolean): CosmicWebStyle | null {
  if (volumesOn && filamentsOn) return 'both';
  if (volumesOn) return 'smooth';
  if (filamentsOn) return 'filaments';
  return null;
}

// ── CosmicWebSection ───────────────────────────────────────────────────────────

/**
 * Renders the full Cosmic web thematic group: a master toggle on the section
 * header (volumes OR filaments), a Style picker (Smooth / Filaments / Both)
 * when the master is on, and an Advanced sub-section with the filament-
 * intensity slider and per-cube VolumeFieldRow controls.
 */
function CosmicWebSection({
  volumesEnabled,
  onVolumesEnabledChange,
  filamentsEnabled,
  onFilamentsChange,
  filamentIntensity,
  onFilamentIntensityChange,
  volumeFields,
  onVolumeFieldEnabledChange,
  onVolumeFieldIntensityChange,
  onVolumeFieldContrastChange,
  onVolumeFieldDensityScaleChange,
  onVolumeFieldTrimChange,
  onVolumeFieldExposureChange,
  onVolumeFieldPaletteChange,
}: CosmicWebSectionProps) {
  // ── Master + Style picker derivation ────────────────────────────────────────
  // Master = volumes OR filaments — at least one of the two being on means the
  // group is showing. Per audit Q9(β) the master + style picker replace the old
  // independent Volumes / Filaments toggles.
  const masterOn = volumesEnabled || filamentsEnabled;
  const currentStyle = deriveCosmicWebStyle(volumesEnabled, filamentsEnabled);

  /**
   * Master toggle handler. When turning OFF, batch-disable both underlying
   * masters. When turning ON, default to "Smooth" — volumes on, filaments off.
   * The audit's pick for the default first-impression style (less visually
   * noisy than Filaments). Per-cube enable bits inside Advanced persist across
   * master flips by design.
   */
  const onMasterToggle = (enabled: boolean) => {
    if (!enabled) {
      onVolumesEnabledChange(false);
      onFilamentsChange(false);
      return;
    }
    // Restore to Smooth: volumes on, filaments off.
    onVolumesEnabledChange(true);
    onFilamentsChange(false);
  };

  /**
   * Style picker handler — batches the two master mutations per the mapping in
   * the module header. Per-cube and per-filament sub-toggles in Advanced are
   * intentionally NOT touched; the picker is a high-level shortcut, not a
   * "reset cube state" button.
   */
  const onSetStyle = (style: CosmicWebStyle) => {
    switch (style) {
      case 'smooth':
        onVolumesEnabledChange(true);
        onFilamentsChange(false);
        break;
      case 'filaments':
        onVolumesEnabledChange(false);
        onFilamentsChange(true);
        break;
      case 'both':
        onVolumesEnabledChange(true);
        onFilamentsChange(true);
        break;
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <CollapsibleSection
      title="Cosmic web"
      headerToggle={masterOn}
      onHeaderToggleChange={onMasterToggle}
    >
      {/*
        Style picker — only meaningful when the group's master is on.
        Three-button segmented control; aria-pressed semantics rather than
        radio so screen readers announce a toggled state per option.
      */}
      {currentStyle !== null && (
        <div className={styles.stylePicker} role="group" aria-label="Cosmic web style">
          {(['smooth', 'filaments', 'both'] as const).map((style) => {
            const pressed = currentStyle === style;
            const label =
              style === 'smooth' ? 'Smooth' : style === 'filaments' ? 'Filaments' : 'Both';
            return (
              <button
                key={style}
                type="button"
                aria-pressed={pressed}
                className={pressed ? styles.stylePickerButtonActive : styles.stylePickerButton}
                onClick={() => {
                  // No re-fire guard — picking the active style is a no-op
                  // (the underlying masters wouldn't change), and a click is
                  // cheap relative to a tier-switcher re-fetch.
                  onSetStyle(style);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <CollapsibleSection title="Advanced">
        {/*
          Filament intensity — sits at the top of Advanced because it pairs
          with the Style picker's "Filaments" / "Both" choices. Only shown
          when the filament overlay is on (slider would have no visible
          effect otherwise).
        */}
        {filamentsEnabled && (
          <div className={styles.panelRow}>
            <Slider
              label="Filament intensity"
              value={filamentIntensity}
              min={0}
              max={1}
              step={0.05}
              onChange={onFilamentIntensityChange}
              format={(v) => v.toFixed(2)}
            />
          </div>
        )}

        {/*
          Per-cube knobs — one VolumeFieldRow per registered field.
          Empty-state hint when no cubes are registered yet.
        */}
        {volumeFields.length === 0 ? (
          <div className={styles.panelMode}>No volume fields registered.</div>
        ) : (
          volumeFields.map((field) => (
            <VolumeFieldRow
              key={field.id}
              id={field.id}
              label={field.label}
              enabled={field.enabled}
              intensity={field.intensity}
              contrast={field.contrast}
              densityScale={field.densityScale}
              trim={field.trim}
              exposure={field.exposure}
              paletteId={field.paletteId}
              onEnabledChange={onVolumeFieldEnabledChange}
              onIntensityChange={onVolumeFieldIntensityChange}
              onContrastChange={onVolumeFieldContrastChange}
              onTrimChange={onVolumeFieldTrimChange}
              onExposureChange={onVolumeFieldExposureChange}
              onDensityScaleChange={onVolumeFieldDensityScaleChange}
              onPaletteChange={onVolumeFieldPaletteChange}
            />
          ))
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
}

export default memo(CosmicWebSection);
