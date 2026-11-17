/** The phone's link to the dome: `lost` after three silent seconds, `looking` until the dome first answers;
 *  `domeOlder` / `domeNewer` while the dome answers at another protocol version. */
export type DomeLinkState = 'looking' | 'connected' | 'lost' | 'domeOlder' | 'domeNewer';
