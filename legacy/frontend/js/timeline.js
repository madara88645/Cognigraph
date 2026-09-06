/**
 * Read-only label for timeline scrubber: frame index / total duration · t ms
 * @param {{ simMs: number; durationMs: number }} playback
 */
export function formatTimelineFrames(playback) {
  const t = Math.max(0, Math.min(playback.durationMs, Math.floor(playback.simMs)));
  const tot = Math.max(1, playback.durationMs);
  return `${t} / ${tot} · ${t} ms`;
}
