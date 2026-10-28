/* DocLink — a Markdown link on a docs page. A path that starts at the site's root (`/docs/guide/time/`) is written without the base and gets it here. */
import type { ComponentPropsWithoutRef } from 'react';

import { sitePath } from '../../utils/sitePath.ts';

type DocLinkProps = ComponentPropsWithoutRef<'a'>;

function DocLink({ href, ...rest }: DocLinkProps) {
  const to = typeof href === 'string' && href.startsWith('/') ? sitePath(href) : href;
  return <a href={to} {...rest} />;
}

export default DocLink;
