/*
 * AppLink — the site's one anchor into the app, bare for its caller to dress (OpenApp's button, ViewLink's
 * ring, a picture). `view` is the deep link after the `#`, `query` a flag before it; with neither it opens
 * the app as it starts. It always opens a new tab, so the page that sent the reader stays where it was
 * (owner, 2026-11-02). tests/packages/website/appLinks.test.ts keeps every app address going through it.
 */
import type { ComponentPropsWithoutRef } from 'react';

import { appLink } from '../../../../data/appLink.ts';

export type AppLinkProps = Omit<ComponentPropsWithoutRef<'a'>, 'href' | 'target' | 'rel'> & {
  view?: string;
  query?: string;
};

function AppLink({ view, query, ...rest }: AppLinkProps) {
  return <a href={appLink(view, query)} target="_blank" rel="noopener" {...rest} />;
}

export default AppLink;
