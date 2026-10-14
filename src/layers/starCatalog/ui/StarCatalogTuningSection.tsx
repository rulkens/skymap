/**
 * StarCatalogTuningSection — DebugPanel board for the octree-cut star
 * renderer's engine-tuning knobs and its octree chunk-pool size. Dev-only; the
 * SettingsPanel keeps only the visitor-facing star size and brightness.
 */

import type { ReactElement } from 'react';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import { STAR_CATALOG_TUNING_FIELDS } from './starCatalogTuningFields';
import { loadStateColorClass } from '../../../components/DebugPanel/loadStateColorClass';
import type { StarCatalogTuningKey } from '../@types/StarCatalogTuningKey';

/** Pool sizes the picker offers; null is the tier's own. */
const CHUNK_SLOT_CHOICES = [64, 128, 256, 384, 512] as const;

export type StarCatalogTuningSectionProps = {
  values: { [K in StarCatalogTuningKey]: number };
  onChange: (key: StarCatalogTuningKey, value: number) => void;
  /** The override in force, null = tier default. */
  chunkSlots: number | null;
  /** The slot count the tier gives when there is no override. */
  tierSlots: number;
  onChunkSlotsChange: (slots: number | null) => void;
  /** Why the last resize failed (a pool past its cap), else null. */
  slotError: string | null;
};

export function StarCatalogTuningSection({
  values,
  onChange,
  chunkSlots,
  tierSlots,
  onChunkSlotsChange,
  slotError,
}: StarCatalogTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Star catalog tuning"
      fields={STAR_CATALOG_TUNING_FIELDS}
      values={values}
      onSliderChange={onChange}
    >
      <label title="Octree chunk pool size. A size past the pool cap is refused and the previous pool keeps drawing.">
        Chunk slots{' '}
        <select
          value={chunkSlots ?? ''}
          onChange={(e) =>
            onChunkSlotsChange(e.target.value === '' ? null : Number(e.target.value))
          }
        >
          <option value="">Tier default ({tierSlots})</option>
          {CHUNK_SLOT_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {slotError !== null && (
        <div role="alert" className={loadStateColorClass('error')}>
          Chunk slots not applied: {slotError}. The previous pool is still drawing.
        </div>
      )}
    </DebugTuningSection>
  );
}
