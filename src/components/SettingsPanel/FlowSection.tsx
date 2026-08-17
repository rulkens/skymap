// src/components/SettingsPanel/FlowSection.tsx
/**
 * FlowSection — presentational component for the CF4++ flow-field overlay
 * section inside the SettingsPanel.
 *
 * Owns the Flow thematic group UI: a master enable toggle on the section header
 * and `FlowRow` in the body. Isolating this into its own component ensures a
 * flow setting change re-renders ONLY this section rather than the entire HUD.
 * The section is intentionally minimal — all look controls (mode switch +
 * intensity slider) live inside `FlowRow`.
 *
 * ### Props-driven, no internal state
 *
 * Imports nothing from `store/` or `state/`: this is a pure function of props
 * and the transient CollapsibleSection open/closed state. Tests supply plain
 * props with no Provider.
 *
 * Why `memo`: when `FlowSectionContainer`'s parent re-renders for an unrelated
 * reason, `memo` bails on the prop-compare step so the section does not
 * re-render. The `useCallback`-wrapped handler the container passes in has
 * stable identity (dispatch is invariant), making the bail effective.
 */

import { memo } from 'react';
import type { FlowSettings } from '../../@types/settings/FlowSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import CollapsibleSection from './CollapsibleSection';
import FlowRow from './FlowRow';

// ── Props ──────────────────────────────────────────────────────────────────────

export type FlowSectionProps = {
  /** Current flow state: master enable + all look/motion knobs. */
  flow: FlowSettings;
  /** Called when the header master toggle flips the layer's enable gate. */
  onEnabledChange: (enabled: boolean) => void;
  /** Called whenever a FlowRow look/motion knob changes. */
  onFlowChange: (patch: Partial<FlowFieldDefaults>) => void;
};

// ── FlowSection ────────────────────────────────────────────────────────────────

/**
 * Renders the Flow thematic group: a master enable on the section header and
 * `FlowRow` (mode switch + intensity slider) in the body.
 */
function FlowSection({ flow, onEnabledChange, onFlowChange }: FlowSectionProps) {
  return (
    <CollapsibleSection
      title="Flow"
      headerToggle={flow.enabled}
      onHeaderToggleChange={onEnabledChange}
    >
      <FlowRow flow={flow} onChange={onFlowChange} />
    </CollapsibleSection>
  );
}

export default memo(FlowSection);
