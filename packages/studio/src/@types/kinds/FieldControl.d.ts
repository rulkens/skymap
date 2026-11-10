/** An inspector field's control and stored unit; `FIELD_CONTROLS` maps each to its widget. */
export type FieldControl =
  | 'seconds'
  /** Seconds the engine divides by (a bob's period, an align-in), so never 0. */
  | 'positiveSeconds'
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
  | 'subjectPosition'
  /** A Focus step's object: its focus id or (`focusRef`) selection ref, or none to clear the focus. */
  | 'focusSubject'
  | 'focusRef'
  /** A Fly's curve and its pass-by, each one object edited as several rows. */
  | 'spline'
  | 'passBy'
  /** A Fly's waypoints as chips that select them. */
  | 'waypoints';
