import type { RelayFrame } from '../../@types/remote/RelayFrame';

/**
 * The one rule for "this text is the relay's own frame": a JSON object with a top-level `relay` key.
 * The relay drops remote text it matches and the dome trusts what it matches, so the two must never differ.
 */
export function parseRelayFrame(text: string): RelayFrame | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null && 'relay' in parsed
      ? (parsed as RelayFrame)
      : null;
  } catch {
    return null;
  }
}
