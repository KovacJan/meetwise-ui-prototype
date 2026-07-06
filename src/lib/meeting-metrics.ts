/** Format meeting duration for KPIs and charts (locale-aware). */
export function formatDurationMinutes(
  totalMinutes: number,
  locale: string,
): string {
  const loc = locale === "de" ? "de-DE" : "en-GB";
  if (totalMinutes <= 0) return locale === "de" ? "0 Min." : "0 min";
  if (totalMinutes < 60) {
    return locale === "de"
      ? `${totalMinutes} Min.`
      : `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return locale === "de" ? `${hours} Std.` : `${hours} h`;
  }
  return locale === "de"
    ? `${hours} Std. ${mins} Min.`
    : `${hours} h ${mins} min`;
}

export function formatDurationHoursShort(
  totalMinutes: number,
  locale: string,
): string {
  if (totalMinutes <= 0) return "0";
  const hours = totalMinutes / 60;
  if (hours < 10) {
    return new Intl.NumberFormat(locale === "de" ? "de-DE" : "en-GB", {
      maximumFractionDigits: 1,
    }).format(hours);
  }
  return String(Math.round(hours));
}
