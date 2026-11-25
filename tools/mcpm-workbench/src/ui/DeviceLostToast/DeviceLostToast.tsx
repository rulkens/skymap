/**
 * DeviceLostToast — the lost-GPU notice. A lost device does not come back in
 * this page, so the toast stays up and offers the one fix. It reads the store,
 * so it must render inside App's `<Provider>`, not in App itself.
 */
import type { ReactNode } from 'react';
import { useAppSelector } from '../../store/hooks';
import Toast from '../Toast/Toast';

function DeviceLostToast(): ReactNode {
  const lost = useAppSelector((s) => s.view.deviceLost);
  if (!lost) return null;
  return (
    <Toast
      message="GPU device lost"
      action={{ label: 'Reload', onClick: () => window.location.reload() }}
    />
  );
}

export default DeviceLostToast;
