/** The dock's height as a clamped share of the viewport, remembered per viewer (a failed read or write just forgets). */
import { useEffect, useState } from 'react';

import { clampDockFraction } from '../utils/clampDockFraction';
import { DEFAULT_DOCK_FRACTION, DOCK_HEIGHT_ROW } from './useDockHeight.constants';
import { readPersisted } from '../../../../../src/utils/storage/readPersisted';

export function useDockHeight(): readonly [number, (fraction: number) => void] {
  const [fraction, setFraction] = useState(() =>
    clampDockFraction(readPersisted(DOCK_HEIGHT_ROW) ?? DEFAULT_DOCK_FRACTION),
  );
  useEffect(() => {
    try {
      window.localStorage.setItem(DOCK_HEIGHT_ROW.key, DOCK_HEIGHT_ROW.serialize(fraction));
    } catch {
      // Private mode or a full quota: the height is simply not remembered.
    }
  }, [fraction]);
  return [fraction, (next) => setFraction(clampDockFraction(next))];
}
