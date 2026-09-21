/** Which `ViewRig` the frame renders through — `state.viewRig`. `dome`'s
 *  program lands in a later dome-fisheye task; today it is a placeholder key
 *  the `dome-cube` render-target row's `allocateWhen` compares against. */
export type ViewRigKey = 'mono' | 'dome';
