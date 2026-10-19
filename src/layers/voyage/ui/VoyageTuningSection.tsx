/**
 * VoyageTuningSection — the voyage Intent driven by hand: a trip (or off), the launch instant as
 * Earth-years before now, the headlight exponent and the two effect toggles, with the ship's
 * clock and γ read back. Bespoke controls follow the slider rows, as `BlackHoleLensingTuningSection`.
 */

import type { ReactElement } from 'react';
import type { ShipState } from '../../../@types/relativity/ShipState';
import type { VoyageDestinationId } from '../@types/VoyageDestinationId';
import type { VoyageSettings } from '../@types/VoyageSettings';
import type { VoyageSliderKey } from '../@types/VoyageSliderKey';
import DebugTuningSection from '../../../components/DebugPanel/DebugTuningSection';
import sliderStyles from '../../../components/DebugPanel/DebugSlider.module.css';
import { VOYAGE_DESTINATIONS } from '../../../data/voyage/voyageDestinations';
import { tripOf } from '../../../utils/relativity/tripOf';
import { voyageTripLy } from '../../../utils/voyage/voyageTripLy';
import { EARTH_YR_LOG10_MIN, voyageSliderFields } from './voyageSliderFields';

export type VoyageTuningSectionProps = {
  readonly voyage: VoyageSettings;
  /** Earth-years from launch to now; null with no trip launched. */
  readonly earthYr: number | null;
  readonly ship: ShipState | null;
  readonly onDestination: (id: VoyageDestinationId | null) => void;
  readonly onEarthYr: (years: number) => void;
  readonly onHeadlight: (k: number) => void;
  readonly onContraction: (on: boolean) => void;
  readonly onDoppler: (on: boolean) => void;
};

const OFF = 'off';

export function VoyageTuningSection(props: VoyageTuningSectionProps): ReactElement {
  const { voyage, earthYr, ship } = props;
  const destination = voyage.destination === null ? null : VOYAGE_DESTINATIONS[voyage.destination];
  const fields = voyageSliderFields(
    destination === null ? null : tripOf(voyageTripLy(destination)).tEarthTotalYr,
  );
  const values: Record<VoyageSliderKey, number> = {
    headlight: voyage.headlight,
    earthYrLog10:
      earthYr !== null && earthYr > 0
        ? Math.max(EARTH_YR_LOG10_MIN, Math.log10(earthYr))
        : EARTH_YR_LOG10_MIN,
  };
  return (
    <DebugTuningSection
      title="Voyage boost"
      fields={fields}
      values={values}
      onSliderChange={(key, v) =>
        key === 'headlight' ? props.onHeadlight(v) : props.onEarthYr(10 ** v)
      }
    >
      <div className={sliderStyles.root} title="The trip whose ship frame the scene is drawn in.">
        <span className={sliderStyles.label}>destination</span>
        <span className={sliderStyles.readout} />
        <select
          aria-label="destination"
          value={voyage.destination ?? OFF}
          onChange={(e) =>
            props.onDestination(
              e.target.value === OFF ? null : (e.target.value as VoyageDestinationId),
            )
          }
        >
          <option value={OFF}>off (rest frame)</option>
          {Object.values(VOYAGE_DESTINATIONS).map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <label className={sliderStyles.root}>
        <input
          type="checkbox"
          checked={voyage.contraction}
          onChange={(e) => props.onContraction(e.target.checked)}
        />
        contraction
      </label>
      <label className={sliderStyles.root}>
        <input
          type="checkbox"
          checked={voyage.doppler}
          onChange={(e) => props.onDoppler(e.target.checked)}
        />
        Doppler
      </label>
      {ship !== null && (
        <div className={sliderStyles.root}>
          ship τ {ship.tauYr.toPrecision(3)} yr · γ {ship.gamma.toPrecision(3)} · {ship.phase}
        </div>
      )}
    </DebugTuningSection>
  );
}
