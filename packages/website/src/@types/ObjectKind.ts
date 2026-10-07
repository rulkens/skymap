/** What a row of the object catalogue is. A kind is decided by the app registry the row was read from, never typed per row. */
export type ObjectKind =
  | 'sun'
  | 'planet'
  | 'moon'
  | 'spacecraft'
  | 'model'
  | 'place'
  | 'star'
  | 'sStar'
  | 'milkyWay'
  | 'blackHole'
  | 'galaxy'
  | 'group'
  | 'cluster'
  | 'supercluster'
  | 'void'
  | 'exhibit'
  | 'tour';
