import type { LinkView } from '../../@types/url/LinkView';

/**
 * Two rows' views as one: a takeover beats focus and pose, and a focus plus
 * a pose is a focus that arrives at that pose. Each key has one row, so two
 * focuses or two poses never meet.
 */
export function combineLinkViews(a: LinkView, b: LinkView): LinkView {
  for (const v of [a, b]) {
    if (v.kind === 'exhibit' || v.kind === 'tour' || v.kind === 'clip') return v;
  }
  if (a.kind === 'home') return b;
  if (b.kind === 'home') return a;
  const focus = a.kind === 'focus' ? a : b.kind === 'focus' ? b : null;
  const posed = a.kind === 'pose' ? a : b.kind === 'pose' ? b : null;
  return focus !== null && posed !== null ? { ...focus, pose: posed.pose } : b;
}
