/** UserCatalogRowContainer — store boundary for the loaded file's Data row; nothing until a file is loaded. */
import { memo, useCallback, type ReactNode } from 'react';
import { setUserCatalogOn } from '../../../state/catalog/catalogSlice';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import UserCatalogRow from '../../catalog/UserCatalogRow/UserCatalogRow';

function UserCatalogRowContainer(): ReactNode {
  const dispatch = useAppDispatch();
  const userCatalog = useAppSelector((s) => s.catalog.userCatalog);
  const on = useAppSelector((s) => s.catalog.userCatalogOn);
  const onChange = useCallback((v: boolean) => dispatch(setUserCatalogOn(v)), [dispatch]);
  if (!userCatalog) return null;
  return (
    <UserCatalogRow
      fileName={userCatalog.fileName}
      rowCount={userCatalog.points.count}
      weightStats={userCatalog.weightStats}
      on={on}
      onChange={onChange}
    />
  );
}

export default memo(UserCatalogRowContainer);
