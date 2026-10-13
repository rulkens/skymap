/**
 * StarCatalogTuningSection — DebugPanel board for the octree-cut star
 * renderer's engine-tuning knobs. Dev-only; the SettingsPanel keeps only the
 * visitor-facing star size and brightness.
 */

import type { ReactElement } from 'react';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import { STAR_CATALOG_TUNING_FIELDS } from './starCatalogTuningFields';
import type { StarCatalogTuningKey } from '../@types/StarCatalogTuningKey';

export type StarCatalogTuningSectionProps = {
  values: { [K in StarCatalogTuningKey]: number };
  onChange: (key: StarCatalogTuningKey, value: number) => void;
};

export function StarCatalogTuningSection({
  values,
  onChange,
}: StarCatalogTuningSectionProps): ReactElement {
  return (
    <DebugTuningSection
      title="Star catalog tuning"
      fields={STAR_CATALOG_TUNING_FIELDS}
      values={values}
      onSliderChange={onChange}
    />
  );
}
