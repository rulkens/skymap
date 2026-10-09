/**
 * VOYAGER_MILESTONES — the Voyager events no ephemeris contains: boundary crossings and
 * milestones, as cited literals (UTC). Flybys are measured instead, from Horizons.
 * Uncertain ones are marked UNSURE: sources differ by a day or the crossing spans several.
 */
import type { VoyagerMilestone } from './@types/VoyagerMilestone';

export const VOYAGER_MILESTONES: readonly VoyagerMilestone[] = [
  {
    // NASA/JPL: image taken 04:48 UTC; the cameras went off 34 minutes later.
    craftId: 'voyager1',
    id: 'voyager1-pale-blue-dot',
    kind: 'milestone',
    iso: '1990-02-14T04:48:00.000Z',
    label: 'Pale Blue Dot',
  },
  {
    // NASA: Voyager 1 passes Pioneer 10 at 69.4 AU. UNSURE: distance and day.
    craftId: 'voyager1',
    id: 'voyager1-pioneer10',
    kind: 'milestone',
    iso: '1998-02-17T00:00:00.000Z',
    label: 'Passes Pioneer 10',
  },
  {
    // NASA, announced 2005-05-24. UNSURE: some sources say 2004-12-15.
    craftId: 'voyager1',
    id: 'voyager1-termination-shock',
    kind: 'boundary',
    iso: '2004-12-16T00:00:00.000Z',
    label: 'Termination shock',
  },
  {
    // NASA, 2007-12-10 release; several crossings over days. UNSURE: the day.
    craftId: 'voyager2',
    id: 'voyager2-termination-shock',
    kind: 'boundary',
    iso: '2007-08-30T00:00:00.000Z',
    label: 'Termination shock',
  },
  {
    // NASA/JPL 2013-09-12; Gurnett et al. 2013, "on or about" this day.
    craftId: 'voyager1',
    id: 'voyager1-heliopause',
    kind: 'boundary',
    iso: '2012-08-25T00:00:00.000Z',
    label: 'Heliopause crossing',
  },
  {
    // NASA/JPL 2018-12-10; Nature Astronomy 2019.
    craftId: 'voyager2',
    id: 'voyager2-heliopause',
    kind: 'boundary',
    iso: '2018-11-05T00:00:00.000Z',
    label: 'Heliopause crossing',
  },
];
