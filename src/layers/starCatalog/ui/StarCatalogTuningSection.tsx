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

/** Pool sizes the picker offers, in records; null is the tier's own. */
const POOL_RECORD_CHOICES = [2_097_152, 4_194_304, 8_388_608, 12_582_912, 16_777_216] as const;

export type StarCatalogTuningSectionProps = {
  values: { [K in StarCatalogTuningKey]: number };
  onChange: (key: StarCatalogTuningKey, value: number) => void;
  /** The override in force, in records; null = tier default. */
  poolRecords: number | null;
  /** The records the tier gives when there is no override. */
  tierPoolRecords: number;
  onPoolRecordsChange: (records: number | null) => void;
  /** Why the last resize failed (a pool past its cap), else null. */
  poolRecordsError: string | null;
};

export function StarCatalogTuningSection({
  values,
  onChange,
  poolRecords,
  tierPoolRecords,
  onPoolRecordsChange,
  poolRecordsError,
}: StarCatalogTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Star catalog tuning"
      fields={STAR_CATALOG_TUNING_FIELDS}
      values={values}
      onSliderChange={onChange}
    >
      <label title="Octree chunk pool size. A size past the pool cap is refused and the previous pool keeps drawing.">
        Pool records{' '}
        <select
          value={poolRecords ?? ''}
          onChange={(e) =>
            onPoolRecordsChange(e.target.value === '' ? null : Number(e.target.value))
          }
        >
          <option value="">Tier default ({tierPoolRecords.toLocaleString()})</option>
          {POOL_RECORD_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n.toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      {poolRecordsError !== null && (
        <div role="alert" className={loadStateColorClass('error')}>
          Pool records not applied: {poolRecordsError}. The previous pool is still drawing.
        </div>
      )}
    </DebugTuningSection>
  );
}
