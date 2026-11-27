/** Every key the studio handles; `runStudioKey` and the `?` overlay both read the table by it. */
export type StudioKeyId =
  | 'previous'
  | 'next'
  | 'fold'
  | 'unfold'
  | 'undo'
  | 'redo'
  | 'start'
  | 'end'
  | 'play'
  | 'loop'
  | 'follow'
  | 'zoomIn'
  | 'zoomOut'
  | 'escape'
  | 'help';
