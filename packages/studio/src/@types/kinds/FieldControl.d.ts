/** An inspector field's control and stored unit; `FIELD_CONTROLS` maps each to its widget. */
export type FieldControl =
  | 'seconds'
  | 'mpc'
  | 'degrees'
  | 'degreesPerSec'
  | 'percent'
  | 'number'
  | 'ease'
  | 'toggle'
  | 'readout'
  /** Visibility addresses: whole layers, or with items for show and hide. */
  | 'layers'
  | 'layerItems'
  /** A Set step's whole settings action: which setting and its value. */
  | 'settingsAction'
  /** An object picked by name: its focus id, or (`subjectPosition`) its position at the preview instant. */
  | 'subject'
  | 'subjectPosition';
