export function toUtcSundayWeekStart(isoDate: string) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }

  const day = date.getUTCDay();
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - day);
  return weekStart.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekStart: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${weekStart}T00:00:00.000Z`));
}
