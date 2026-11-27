/**
 * Toast — a one-line notice at the bottom centre of the page, with an optional
 * button. A manual popover: the top layer draws it over both sidebars and the
 * load dialog with no z-index, and neither a click elsewhere nor Escape closes
 * it. It shows on mount and stays until unmounted. Showing a popover does not
 * move focus, and `role="alert"` announces it once.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ToastAction } from '../../../../@types/ui/ToastAction';
import Button from '../../../../../../packages/shared/src/components/common/Button/Button';
import styles from './Toast.module.css';

type ToastProps = {
  readonly message: string;
  readonly action?: ToastAction;
};

function Toast({ message, action }: ToastProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.showPopover();
  }, []);

  return (
    <div ref={ref} popover="manual" role="alert" className={styles.root}>
      {message}
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export default Toast;
