type GraphAttendee = {
  emailAddress?: {address?: string; name?: string};
};

export function parseAttendeeEmails(attendees: unknown | null): string[] {
  if (!Array.isArray(attendees)) return [];
  const emails = new Set<string>();
  for (const item of attendees as GraphAttendee[]) {
    const email = item.emailAddress?.address?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return [...emails];
}

export function buildAttendeesPayload(emails: string[]) {
  return emails.map((email) => ({
    emailAddress: {address: email},
    type: "required",
  }));
}
