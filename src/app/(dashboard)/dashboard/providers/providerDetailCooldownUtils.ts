export function getCooldownRemainingLabel(until: string | number | Date, nowMs = Date.now()) {
  const untilMs = new Date(until).getTime();
  if (!Number.isFinite(untilMs)) return "";

  const diff = untilMs - nowMs;
  if (diff <= 0) return "";

  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;

  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

export function formatCooldownUnlockTime(
  until: string | number | Date,
  locale?: string | string[]
) {
  const date = new Date(until);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  const sameLocalDay = date.toLocaleDateString(locale) === now.toLocaleDateString(locale);
  if (sameLocalDay) {
    return date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return date.toLocaleString(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
