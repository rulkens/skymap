/** AntiqueTuningSectionContainer — store boundary for the DebugPanel antique-look board. */

import { memo, useCallback } from 'react';
import type { ReactNode } from 'react';
import AntiqueTuningSection from '../DebugPanel/AntiqueTuningSection/AntiqueTuningSection';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectAntiqueEnabled, selectAntiqueTuning } from '../../state/settings/selectors';
import { resetAntiqueTuning, setAntiqueTuning } from '../../state/settings/core/antiqueSlice';
import type { AntiqueTuning } from '../../@types/settings/AntiqueTuning';

function AntiqueTuningSectionContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const enabled = useAppSelector(selectAntiqueEnabled);
  const tuning = useAppSelector(selectAntiqueTuning);
  const onChange = useCallback(
    (patch: Partial<AntiqueTuning>) => dispatch(setAntiqueTuning(patch)),
    [dispatch],
  );
  const onReset = useCallback(() => dispatch(resetAntiqueTuning()), [dispatch]);
  return (
    <AntiqueTuningSection enabled={enabled} tuning={tuning} onChange={onChange} onReset={onReset} />
  );
}

export default memo(AntiqueTuningSectionContainer);
