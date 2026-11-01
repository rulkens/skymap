import { useEffect } from 'react';

import reviewPage from './ReviewPage/ReviewPage.module.css';

/** Puts review mode's state on the page's own elements: the classes that style marks, and room for the bar above `main`. */
export function usePageChrome(
  article: Element,
  active: boolean,
  hiding: boolean,
  marksShown: boolean,
): void {
  useEffect(() => {
    const html = document.documentElement;
    const main = article.closest('main');
    const on = [
      [html, reviewPage.on, active],
      [html, reviewPage.hiding, active && hiding],
      [html, reviewPage.showing, active && marksShown],
      [main, reviewPage.pushed, active],
    ] as const;
    for (const [el, name, set] of on) if (set && name) el?.classList.add(name);
    return () => {
      for (const [el, name] of on) if (name) el?.classList.remove(name);
    };
  }, [article, active, hiding, marksShown]);
}
