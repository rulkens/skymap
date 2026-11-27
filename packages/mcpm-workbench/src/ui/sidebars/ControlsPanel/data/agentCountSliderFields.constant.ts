import type { SliderRowField } from '../../../../../@types/ui/SliderRowField';
import { formatAgentCount } from '../../../../utils/format/formatAgentCount';

export const AGENT_COUNT_SLIDER_FIELDS: readonly SliderRowField<'agentCount'>[] = [
  {
    key: 'agentCount',
    label: 'agent count',
    min: 1_000_000,
    max: 10_000_000,
    step: 100_000,
    format: formatAgentCount,
    displayed: { fromValue: (v) => v / 1_000_000, toValue: (m) => m * 1_000_000 },
    title: 'Structural: changing it rebuilds the harness and reseeds the swarm.',
  },
];
