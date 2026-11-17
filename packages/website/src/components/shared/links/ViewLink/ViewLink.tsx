/*
 * ViewLink — the ring that opens a particular view in the app: an AppLink in ObjLink's look (objLinkClass),
 * under the view mark that no other ring wears; tests/packages/website/appLinks.test.ts keeps it the only one.
 */
import AppLink from '../AppLink/AppLink.tsx';
import type { AppLinkProps } from '../AppLink/AppLink.tsx';
import Icon from '../Icon/Icon.tsx';
import { objLinkClass } from '../ObjLink/objLinkClass.ts';

type ViewLinkProps = AppLinkProps & { view: string; hang?: boolean };

function ViewLink({ view, query, hang, className, children, ...rest }: ViewLinkProps) {
  return (
    <AppLink
      view={view}
      query={query}
      className={objLinkClass({ size: 'small', hang, className })}
      {...rest}
    >
      <Icon name="view" />
      {children ?? 'Open this view'}
    </AppLink>
  );
}

export default ViewLink;
