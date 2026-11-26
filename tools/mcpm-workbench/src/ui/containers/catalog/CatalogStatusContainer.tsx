/** CatalogStatusContainer — store boundary for `catalog.statusMessage`; nothing while there is none. */
import { memo, type ReactNode } from 'react';
import { useAppSelector } from '../../../store/hooks';
import CatalogStatus from '../../catalog/CatalogStatus/CatalogStatus';

function CatalogStatusContainer(): ReactNode {
  const message = useAppSelector((s) => s.catalog.statusMessage);
  return message ? <CatalogStatus message={message} /> : null;
}

export default memo(CatalogStatusContainer);
