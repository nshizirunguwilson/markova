// Display name for a class: "Senior 2 A" at O-Level, "Level 4 SWD A" when the
// section belongs to a trade.
export function classDisplayName(section: {
  name: string;
  classLevel?: { name: string } | null;
  trade?: { code: string } | null;
}): string {
  return [section.classLevel?.name, section.trade?.code, section.name]
    .filter(Boolean)
    .join(' ');
}
