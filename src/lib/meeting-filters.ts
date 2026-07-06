export function isWeekendMeetingStart(startIso: string): boolean {
  const d = new Date(startIso);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

