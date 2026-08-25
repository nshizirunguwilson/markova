// Display name for a class: "Senior 2 A" at O-Level, "Level 4 SWD A" when the
// section belongs to a trade.
//
// A student admitted mid-term is on the roll before they are placed, so the
// section itself can be missing. That is a blank, not a crash: an ID card
// issued to an unplaced student used to take the whole request down.
export function classDisplayName(
  section?: {
    name: string;
    classLevel?: { name: string } | null;
    trade?: { code: string } | null;
  } | null,
): string {
  if (!section) return '';
  return [section.classLevel?.name, section.trade?.code, section.name]
    .filter(Boolean)
    .join(' ');
}
