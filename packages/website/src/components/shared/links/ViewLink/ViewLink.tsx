/* ViewLink — the one control that opens a particular view in the app; tests/packages/website/appLinks.test.ts keeps it the only one. */
import ObjLink from '../ObjLink/ObjLink.tsx';
import type { ObjLinkProps } from '../ObjLink/ObjLink.tsx';

type ViewLinkProps = Omit<ObjLinkProps, 'size' | 'icon'>;

function ViewLink({ children, ...rest }: ViewLinkProps) {
  return (
    <ObjLink size="small" icon="view" {...rest}>
      {children ?? 'Open this view'}
    </ObjLink>
  );
}

export default ViewLink;
