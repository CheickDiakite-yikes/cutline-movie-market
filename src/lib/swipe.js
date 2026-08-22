export function classifySwipe(deltaX, deltaY, threshold = 72) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(threshold) || threshold <= 0) {
    return "none";
  }
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) {
    return "none";
  }
  return deltaX > 0 ? "save" : "pass";
}
