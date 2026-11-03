/*
 * useGalleryMarks — the row of buttons that choose a gallery's view (markers, tabs, thumbnails), as props to
 * spread: a group named "Views" whose box holds the gallery still (marksRef), and per view a button titled
 * with its shot, the current one pressed and the only one in the tab order. The arrow keys, Home and End move
 * the choice and the focus with it, going round at the ends. A button without words of its own also needs an
 * `aria-label`.
 */
import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

import type { GalleryState } from '../../../../@types/GalleryState';
import { siteShot } from '../../../../data/siteShot.ts';
import { galleryKeyTarget } from '../../../../utils/galleryKeyTarget.ts';
import { wrapIndex } from '../../../../utils/wrapIndex.ts';

export function useGalleryMarks({ views, at, choose, marksRef }: GalleryState) {
  const marks = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent) => {
    const to = galleryKeyTarget(event.key, at, views.length - 1);
    if (to === at) return;
    event.preventDefault();
    choose(to);
    marks.current[wrapIndex(to, views.length)]?.focus();
  };

  return {
    group: { ref: marksRef, role: 'group', 'aria-label': 'Views' } as const,
    mark: (i: number) => ({
      ref: (el: HTMLButtonElement | null) => {
        marks.current[i] = el;
      },
      type: 'button' as const,
      title: siteShot(views[i]!.id).title,
      'aria-pressed': i === at,
      tabIndex: i === at ? 0 : -1,
      onClick: () => choose(i),
      onKeyDown,
    }),
  };
}
