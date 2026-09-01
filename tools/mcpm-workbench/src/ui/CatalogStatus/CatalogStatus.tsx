/**
 * CatalogStatus — `catalog.statusMessage` read via `useAppSelector`, so it has
 * to live INSIDE `<Provider store={store}>` (App.tsx), not in App itself: a
 * hook call in the component that renders its own Provider runs before that
 * Provider has mounted, so `useAppSelector` there throws "could not find
 * react-redux context value" the instant the message goes non-null.
 */
import type { ReactNode } from 'react';
import { useAppSelector } from '../../store/hooks';
import { catalogStatusStyle } from '../App/utils/catalogStatusStyle';

function CatalogStatus(): ReactNode {
  const message = useAppSelector((s) => s.catalog.statusMessage);
  if (!message) return null;
  return <div style={catalogStatusStyle}>{message}</div>;
}

export default CatalogStatus;
