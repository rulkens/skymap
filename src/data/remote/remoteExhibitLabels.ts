/**
 * Exhibit labels for the remote's buttons. A hand-kept copy because `APP_EXHIBITS` drags the
 * store and renderer into the remote's bundle; typed over `ExhibitId`, so a new exhibit that is
 * missing here fails to compile.
 */
import type { ExhibitId } from '../../@types/exhibits/ExhibitId';

export const REMOTE_EXHIBIT_LABELS: Record<ExhibitId, string> = {
  solarSystem: 'Solar System',
  zoneOfAvoidance: 'Zone of Avoidance',
  cosmicFlows: 'Cosmic Flows',
  cosmicWeb: 'Cosmic Web',
  observableUniverse: 'Observable Universe',
  'voyager-missions': 'The Voyager missions',
};
