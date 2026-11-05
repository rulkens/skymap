/** The arm kind IS the camera regime; a new arm is a new key here plus a row in CAMERA_ARMS — spec §2.1. */
export type CameraArmKind = 'absolute' | 'body' | 'site' | 'sky';
