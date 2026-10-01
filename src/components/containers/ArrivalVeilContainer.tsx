/**
 * ArrivalVeilContainer — store boundary for the arrival veil. Only a boot
 * that carried a deep link gets one: a plain boot shows the splash, and its
 * arrival home still runs, unveiled, for `ready`. The URL is read once at
 * mount because the hash drops a takeover key as soon as the link arrives.
 */

import { memo, useState } from 'react';
import type { ReactNode } from 'react';
import ArrivalVeil from '../ArrivalVeil/ArrivalVeil';
import { useAppSelector } from '../../store/hooks';
import { selectArrivalPending } from '../../state/arrival/selectors';
import { selectLoadProgress } from '../../state/engine/selectors';
import { readUrlAtMount } from '../../state/ui/splashStorage';
import { hasDeepLink } from '../../utils/url/hasDeepLink';

function ArrivalVeilContainer(): ReactNode {
  const [deepLinked] = useState(() => hasDeepLink(readUrlAtMount()));
  const pending = useAppSelector(selectArrivalPending);
  const progress = useAppSelector(selectLoadProgress);

  if (!deepLinked) return null;
  return <ArrivalVeil visible={pending} progress={progress} />;
}

export default memo(ArrivalVeilContainer);
