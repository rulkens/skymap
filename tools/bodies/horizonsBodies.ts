/**
 * HORIZONS_BODIES — the rows `fetchHorizons` pulls. Planets are the points the Kepler rows
 * describe: Mercury and Venus themselves, the Earth–Moon barycentre (3), then the Mars–Neptune
 * system barycentres. A moon is queried against its parent's centre at a step ≤ P/16 that
 * divides a day (whole-minute, grid-aligned fetch pieces). Which rows are fitted, and how, lives
 * in `FITTED_BODIES`.
 */
import type { HorizonsBody } from './@types/HorizonsBody';

const SPAN_1900_2100: HorizonsBody['span'] = ['1900-01-01', '2100-01-01'];

const fitted = (id: string, target: string, centre: string, stepMinutes: number): HorizonsBody => ({
  id,
  target,
  centre,
  span: SPAN_1900_2100,
  stepMinutes,
  vectors: 'position',
});

export const HORIZONS_BODIES: readonly HorizonsBody[] = [
  fitted('mercury', '199', '500@10', 1440),
  fitted('venus', '299', '500@10', 1440),
  fitted('earth', '3', '500@10', 1440),
  fitted('mars', '4', '500@10', 1440),
  fitted('jupiter', '5', '500@10', 1440),
  fitted('saturn', '6', '500@10', 1440),
  fitted('uranus', '7', '500@10', 1440),
  fitted('neptune', '8', '500@10', 1440),
  fitted('io', '501', '500@599', 144),
  fitted('europa', '502', '500@599', 288),
  fitted('ganymede', '503', '500@599', 480),
  fitted('callisto', '504', '500@599', 1440),
  fitted('mimas', '601', '500@699', 80),
  fitted('enceladus', '602', '500@699', 120),
  fitted('tethys', '603', '500@699', 160),
  fitted('dione', '604', '500@699', 240),
  fitted('rhea', '605', '500@699', 360),
  fitted('titan', '606', '500@699', 720),
  fitted('iapetus', '608', '500@699', 1440),
  fitted('triton', '801', '500@899', 480),
  fitted('proteus', '808', '500@899', 96),
  fitted('miranda', '705', '500@799', 120),
  fitted('ariel', '701', '500@799', 180),
  fitted('umbriel', '702', '500@799', 360),
  fitted('titania', '703', '500@799', 720),
  fitted('oberon', '704', '500@799', 720),
  // Voyagers: daily Sun-centred state vectors from the first Horizons sample. Their dense
  // encounter windows come from `fetchVoyagerWindows`; the fit never sees them.
  {
    id: 'voyager1',
    target: '-31',
    centre: '500@10',
    span: ['1977-09-06', '2099-12-31'],
    stepMinutes: 1440,
    vectors: 'state',
  },
  {
    id: 'voyager2',
    target: '-32',
    centre: '500@10',
    span: ['1977-08-21', '2099-12-31'],
    stepMinutes: 1440,
    vectors: 'state',
  },
];
