/**
 * DeviceLostToastContainer — store boundary for the lost-GPU toast: shows it once
 * `view.deviceLost` is set. It reads the store, so it renders inside App's
 * `<Provider>`, not in App itself.
 */
import { memo, type ReactNode } from 'react';
import { useAppSelector } from '../../../store/hooks';
import DeviceLostToast from '../../sim/DeviceLostToast/DeviceLostToast';

function DeviceLostToastContainer(): ReactNode {
  const lost = useAppSelector((s) => s.view.deviceLost);
  return lost ? <DeviceLostToast /> : null;
}

export default memo(DeviceLostToastContainer);
