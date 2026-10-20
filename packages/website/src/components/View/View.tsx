/*
 * View — `<View to="focus=body-saturn">Saturn</View>` on a docs page: the
 * control that opens a view in the app, from what follows the `#` (and
 * `query`, a flag before it, as in `query="dome"`). A page's text needs no
 * import for it. Alone in the text it takes a line of its own; several in a
 * row go inside `<Links>`.
 */
import type { ReactNode } from 'react';

import { appLink } from '../../data/appLink.ts';
import ViewLink from '../ViewLink/ViewLink.tsx';

type ViewProps = { to: string; query?: string; children?: ReactNode };

function View({ to, query, children }: ViewProps) {
  return <ViewLink href={appLink(to, query)}>{children}</ViewLink>;
}

export default View;
