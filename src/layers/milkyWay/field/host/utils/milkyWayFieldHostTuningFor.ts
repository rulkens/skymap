import type { FieldHostTuning } from '../@types/FieldHostTuning';
import { describeGalaxy } from '../../../../../services/engine/galaxyGenerator/shared/describeGalaxy';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../data/milkyWay/milkyWayGalaxyParams';
import { normalizeGenerationSeed } from '../../../../../utils/galaxy/normalizeGenerationSeed';
import { DEFAULT_GALAXY_FIELD_TUNING } from '../../mixture/utils/galaxyFieldMixture';
import { withoutDustCloud } from '../../dust/utils/withoutDustCloud';
import { FIELD_CALIBRATION } from '../../data/fieldCalibration';

/**
 * The app's field tuning, one value per dust setting, both built once so the
 * host's identity keys see an unchanged frame as unchanged. The geometry is
 * v1's, so the cloud's model matrix places the field too. `render` is the
 * calibration row as it stands.
 */
export function milkyWayFieldHostTuningFor(): (dust: boolean) => FieldHostTuning {
  const shared = {
    geometry: describeGalaxy(MILKY_WAY_GALAXY_PARAMS),
    seed: normalizeGenerationSeed(MILKY_WAY_GALAXY_PARAMS.shared.seed),
    extras: Object.freeze([]),
    render: FIELD_CALIBRATION.render,
  };
  const withDust: FieldHostTuning = { ...shared, field: DEFAULT_GALAXY_FIELD_TUNING };
  const withoutDust: FieldHostTuning = {
    ...shared,
    field: withoutDustCloud(DEFAULT_GALAXY_FIELD_TUNING),
  };
  return (dust) => (dust ? withDust : withoutDust);
}
