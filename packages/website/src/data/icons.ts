import type { IconName } from '../@types/IconName';

/**
 * One path per icon, drawn for this site on a 24 by 24 grid for a 1.5 stroke
 * with round caps and no fill (components/Icon.astro). Each is shown at 20px,
 * so separate strokes keep about 3 units between their centre lines.
 */
export const ICONS: Record<IconName, string> = {
  // A classroom globe: the sphere, its tilted mount and a foot.
  classroom: 'M6 10.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0-11 0M14.8 2.7A8.5 8.5 0 0 1 8.2 18.3M11.5 19v2.5M7.5 21.5h8',
  // A planetarium dome on its floor, with the arc a star is projected along.
  dome: 'M2.5 17a9.5 9.5 0 0 1 19 0M1.5 17h21M6.5 17a6 6 0 0 1 8.5-5.45',
  // A redshift survey wedge: us at the point, one shell of distance, the edge of the survey beyond.
  science: 'M12 20.5L4.5 6.4M12 20.5l7.5-14.1M6.85 10.8A11 11 0 0 1 17.15 10.8M3.2 4A19 19 0 0 1 20.8 4',
  // An open book.
  docs: 'M12 7v13M12 7C9.8 5.4 6.6 4.8 3 5.2v13c3.6-.4 6.8.2 9 1.8M12 7c2.2-1.6 5.4-2.2 9-1.8v13c-3.6-.4-6.8.2-9 1.8',
  // A flight path leaving a body.
  launch: 'M3 17.5a3 3 0 1 0 6 0a3 3 0 1 0-6 0M9.5 14C11 9.5 15 6.5 21 5M17 3.6l4 1.4-2.3 3.6',
  // A picture and the credit line under it.
  credits:
    'M4.5 3.5h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1zM3.5 13L8 8.5l4 4 3-3 5.5 5.5M11 20h9.5',
  // A reference mark, as in the text of a paper.
  cite: 'M8 5H5v14h3M16 5h3v14h-3M10.75 9.5l1.75-1.25v7.5',
  // The person who makes it.
  about: 'M8.25 7.75a3.75 3.75 0 1 0 7.5 0a3.75 3.75 0 1 0-7.5 0M4.5 20.5c.3-4.2 3.3-6.5 7.5-6.5s7.2 2.3 7.5 6.5',
  // A closed eye: the site does not watch.
  privacy: 'M3 7.5c2.4 4 5.4 6 9 6s6.6-2 9-6M12 13.5V17M7 12.2l-1.8 2.8M17 12.2l1.8 2.8',
  // A branch of the source tree.
  code: 'M5 5.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M5 18.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 8.5a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 7.5v9M17 10.5c0 3-2.5 4.2-5.5 4.5-2 .2-3.6.6-4.5 1.5',
  // Catalogues laid one over another: what the map is made of.
  sources: 'M12 3.5l8.5 4.25L12 12 3.5 7.75zM3.5 12l8.5 4.25L20.5 12M3.5 16.25l8.5 4.25 8.5-4.25',
  // A pair of compasses, the tool that both measures and draws.
  method: 'M12 2.5v2M10.5 6a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M11.4 7.4L6.5 20.5M12.6 7.4l4.9 13.1M8.4 15.5a9 9 0 0 0 7.2 0',
  // A measured curve and the straight line we draw in its place.
  simplified: 'M3 9c2-5 4-5 6 0s4 5 6 0s4-5 6 0M3 18.5h18',
};
