/* DocLink — a Markdown link on a docs page. A path that starts at the site's root (`/docs/guide/time/`) is written without the base and gets it here. */
import type { ComponentPropsWithoutRef } from 'react';

import { siteHref } from '../../../utils/siteHref.ts';

type DocLinkProps = ComponentPropsWithoutRef<'a'>;

function DocLink({ href, ...rest }: DocLinkProps) {
  return <a href={typeof href === 'string' ? siteHref(href) : href} {...rest} />;
}

export default DocLink;
