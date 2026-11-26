/**
 * LoadCatalogDialogContainer — store boundary for the load dialog: the Auto fit
 * percent the worker fits to, Load's `userCatalogLoaded`, and the sim paused while
 * the dialog is open.
 */
import { memo, useCallback, type ReactNode } from 'react';
import type { UserCatalogLoad } from '../../../../@types/catalog/UserCatalogLoad';
import { userCatalogLoaded } from '../../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import LoadCatalogDialog, {
  type LoadCatalogDialogProps,
} from '../../catalog/LoadCatalogDialog/LoadCatalogDialog';
import { usePauseSimWhileOpen } from './usePauseSimWhileOpen';

export type LoadCatalogDialogContainerProps = Pick<LoadCatalogDialogProps, 'open' | 'onOpenChange'>;

function LoadCatalogDialogContainer({
  open,
  onOpenChange,
}: LoadCatalogDialogContainerProps): ReactNode {
  const dispatch = useAppDispatch();
  const autoFitPercent = useAppSelector((s) => s.grid.autoFitPercent);
  const onLoad = useCallback(
    (load: UserCatalogLoad) => dispatch(userCatalogLoaded(load)),
    [dispatch],
  );
  usePauseSimWhileOpen(open);
  return (
    <LoadCatalogDialog
      open={open}
      onOpenChange={onOpenChange}
      autoFitPercent={autoFitPercent}
      onLoad={onLoad}
    />
  );
}

export default memo(LoadCatalogDialogContainer);
