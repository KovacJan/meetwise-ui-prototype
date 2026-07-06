export function minutesToGraphDuration(minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  return `PT${m}M`;
}
