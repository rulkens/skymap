/** The widest span "the subject fills the view" is judged against: the default 60° lens's
 *  short side, as px over px-per-radian. An image wider than that (the dome's 180°, a wide
 *  lens) still drops a caption once its subject is this large. */
export const FILL_SPAN_RAD = 2 * Math.tan(Math.PI / 6);
