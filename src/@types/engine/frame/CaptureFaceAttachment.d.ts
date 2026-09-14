/**
 * CaptureFaceAttachment — where one capture face's passes write. `depthView`
 * is the capture row's own depth, null for a row that draws no body; the
 * executor attaches it only on the face's body-slab steps.
 */

export type CaptureFaceAttachment = {
  readonly view: GPUTextureView;
  readonly clearValue: GPUColor;
  readonly depthView: GPUTextureView | null;
};
