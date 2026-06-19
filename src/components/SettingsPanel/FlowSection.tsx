// src/components/SettingsPanel/FlowSection.tsx
/**
 * FlowSection — presentational component for the CF4++ flow-field overlay
 * section inside the SettingsPanel.
 *
 * Extracted from the Flow block in `SettingsPanel.tsx` (~line 744–763) so a
 * flow setting change re-renders ONLY this section rather than the entire HUD.
 * The section is intentionally minimal: a master enable toggle on the header
 * and `FlowRow` in the body. All look controls (mode switch + intensity slider)
 * live inside `FlowRow`.
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
import { CollapsibleSection } from './CollapsibleSection';
import FlowRow from './FlowRow';

// ── Props ──────────────────────────────────────────────────────────────────────

export type FlowSectionProps = {
  /** Current flow state: master enable + all look/motion knobs. */
  flow: FlowSettings;
  /** Called whenever the master toggle or any FlowRow knob changes. */
  onFlowChange: (patch: Partial<FlowSettings>) => void;
};

// ── FlowSection ────────────────────────────────────────────────────────────────

/**
 * Renders the Flow thematic group: a master enable on the section header and
 * `FlowRow` (mode switch + intensity slider) in the body.
 */
function FlowSection({ flow, onFlowChange }: FlowSectionProps) {
  return (
    <CollapsibleSection
      title="Flow"
      headerToggle={flow.enabled}
      onHeaderToggleChange={(enabled) => onFlowChange({ enabled })}
    >
      <FlowRow flow={flow} onChange={onFlowChange} />
    </CollapsibleSection>
  );
}

export default memo(FlowSection);
