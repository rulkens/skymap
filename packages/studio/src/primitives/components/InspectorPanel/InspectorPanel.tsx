import type { ReactNode } from 'react';
import s from './InspectorPanel.module.css';

type Props = { readonly label: string; readonly children: ReactNode };

/** Owns the `label | control | reset` columns; rows join them through subgrid. */
function InspectorPanel({ label, children }: Props) {
  return (
    <aside className={s.root} aria-label={label}>
      {children}
    </aside>
  );
}

export default InspectorPanel;
