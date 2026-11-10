import type { ReactNode } from 'react';
import s from './InspectorSection.module.css';

type Props = { readonly title: string; readonly aside?: ReactNode };

function InspectorSection({ title, aside }: Props) {
  return (
    <p className={s.root}>
      <span>{title}</span>
      {aside && <span className={s.aside}>{aside}</span>}
    </p>
  );
}

export default InspectorSection;
