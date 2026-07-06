export async function loadMessages(
  locale: string,
): Promise<Record<string, unknown>> {
  const core = (await import(`../messages/${locale}.json`)).default as Record<
    string,
    unknown
  >;
  let upgrade: Record<string, unknown> = {};
  try {
    upgrade = (await import(`../messages/upgrade.${locale}.json`)).default;
  } catch {
    // Optional namespace – ignore if missing
  }
  return {
    ...core,
    ...(Object.keys(upgrade).length > 0 ? {upgrade} : {}),
  };
}
