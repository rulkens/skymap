import type { FramedCameraPose } from '../camera/FramedCameraPose';

/**
 * LinkView — what a link opens on. Precedence is a parse rule
 * (`linkIntentFrom`), never a runtime branch: a takeover beats focus and pose,
 * and a focus carrying a pose is one view, not two. The pose is framed, not a
 * bare `CameraPose`, because a `#pose=` can name a body or surface arm.
 */
export type LinkView =
  | { readonly kind: 'home' }
  | { readonly kind: 'focus'; readonly id: string; readonly pose?: FramedCameraPose }
  | { readonly kind: 'pose'; readonly pose: FramedCameraPose }
  | { readonly kind: 'exhibit' | 'tour' | 'clip'; readonly id: string };
