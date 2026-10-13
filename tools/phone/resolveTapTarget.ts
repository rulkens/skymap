import type { CdpClient } from './@types/CdpClient';
import type { Point } from './@types/Point';
import type { TapTarget } from './@types/TapTarget';
import { quadCentre } from './quadCentre';

/**
 * A tap target as a viewport point plus a label for the log. A selector goes
 * through the DOM domain only (`Runtime.evaluate` hangs on the phone); the
 * box model is already in viewport CSS pixels, what touch events take.
 */
export async function resolveTapTarget(
  client: CdpClient,
  sessionId: string,
  target: TapTarget,
): Promise<{ point: Point; label: string }> {
  if (target.kind === 'point') return { point: target.point, label: 'point' };
  const { selector } = target;
  const { root } = await client.call<{ root: { nodeId: number } }>(
    'DOM.getDocument',
    { depth: 0 },
    sessionId,
  );
  const { nodeId } = await client.call<{ nodeId: number }>(
    'DOM.querySelector',
    { nodeId: root.nodeId, selector },
    sessionId,
  );
  if (nodeId === 0) throw new Error(`selector '${selector}' matches nothing`);
  await client.call('DOM.scrollIntoViewIfNeeded', { nodeId }, sessionId).catch(() => undefined);
  const box = await client
    .call<{ model: { content: number[] } }>('DOM.getBoxModel', { nodeId }, sessionId)
    .catch(() => {
      throw new Error(`selector '${selector}' matched an element with no box (display:none?)`);
    });
  const { node } = await client.call<{ node: { nodeName: string; attributes?: string[] } }>(
    'DOM.describeNode',
    { nodeId },
    sessionId,
  );
  const attrs = node.attributes ?? [];
  const name = attrs[attrs.indexOf('aria-label') + 1] ?? attrs[attrs.indexOf('id') + 1];
  const tag = node.nodeName.toLowerCase();
  const hasName = attrs.includes('aria-label') || attrs.includes('id');
  return { point: quadCentre(box.model.content), label: hasName ? `${tag} "${name}"` : tag };
}
