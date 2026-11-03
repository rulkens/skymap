import { HERO_MEDIA } from '../../../../../../../tools/site/heroMediaPlan';
import { FLIGHT_STOPS } from '../../../../data/flightStops.ts';
import { flightTimeline } from '../../../../utils/flightTimeline.ts';

export const TIMELINE = flightTimeline(
  FLIGHT_STOPS.map((stop) => stop.atSec),
  HERO_MEDIA.outSec - HERO_MEDIA.inSec,
);
