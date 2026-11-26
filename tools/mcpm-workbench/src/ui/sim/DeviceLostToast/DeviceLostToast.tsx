/**
 * DeviceLostToast — the lost-GPU notice. A lost device does not come back in
 * this page, so the toast stays up and offers the one fix. DeviceLostToastContainer
 * mounts it once the device is lost.
 */
import type { ReactNode } from 'react';
import Toast from '../../panel/Toast/Toast';

function DeviceLostToast(): ReactNode {
  return (
    <Toast
      message="GPU device lost"
      action={{ label: 'Reload', onClick: () => window.location.reload() }}
    />
  );
}

export default DeviceLostToast;
