/**
 * StellarStreamsTuningSectionContainer — the two looks' DebugPanel knobs and their store
 * boundary in one file; the on/off switch lives in "Labels & guides".
 */

import { memo, type ReactElement } from 'react';
import DebugSection from '../../../../components/DebugPanel/DebugSection';
import DebugSlider from '../../../../components/DebugPanel/DebugSlider';
import debugStyles from '../../../../components/DebugPanel/debugSection.module.css';
import { useAppDispatch, useAppSelector } from '../../../../store/hooks';
import { selectStellarStreams } from '../../state/stellarStreams/selectors';
import { resetStellarStreamsLooks, setStellarStreamsLook } from '../../state/stellarStreams/slice';
import { STELLAR_STREAMS_LOOK_RANGES } from '../data/stellarStreamsLookRanges.constants';

const GROUPS = [
  { look: 'streak', title: 'Streaks' },
  { look: 'haze', title: 'Haze' },
] as const;

function StellarStreamsTuningSectionContainer(): ReactElement {
  const dispatch = useAppDispatch();
  const streams = useAppSelector(selectStellarStreams);

  return (
    <DebugSection title="Stellar streams tuning">
      {GROUPS.map(({ look, title }) => (
        <div key={look} role="group" aria-label={title}>
          <strong>{title}</strong>
          {STELLAR_STREAMS_LOOK_RANGES.map((field) => (
            <DebugSlider
              key={field.key}
              label={field.label}
              value={streams[look][field.key]}
              min={field.min}
              max={field.max}
              step={field.step}
              readout={field.format(streams[look][field.key])}
              title={field.title}
              onChange={(value) =>
                dispatch(setStellarStreamsLook({ look, patch: { [field.key]: value } }))
              }
            />
          ))}
        </div>
      ))}
      <div className={debugStyles.buttonRow}>
        <button
          type="button"
          className={debugStyles.button}
          onClick={() => dispatch(resetStellarStreamsLooks())}
        >
          Reset looks
        </button>
      </div>
    </DebugSection>
  );
}

export default memo(StellarStreamsTuningSectionContainer);
