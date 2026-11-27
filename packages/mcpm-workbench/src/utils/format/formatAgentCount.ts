/** formatAgentCount — an agent count in millions, as the agent-count slider shows it. */
export function formatAgentCount(count: number): string {
  return `${(count / 1_000_000).toFixed(1)}M`;
}
