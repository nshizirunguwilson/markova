import { createAvatar } from "@dicebear/core";
import { notionistsNeutral } from "@dicebear/collection";

/**
 * A drawn face for somebody who has not uploaded a photograph.
 *
 * Generated here, in the browser, from the person's own id — never fetched
 * from Dicebear's hosted API. Calling out would mean an external request per
 * avatar: it would break behind port forwarding, need a hole in the content
 * policy, send the school's names to somebody else's server, and go down when
 * they do. The package draws the same SVG locally for nothing.
 *
 * Seeded by id rather than by name, so the face is stable when somebody is
 * renamed, and two children called Aline Uwase do not share one.
 *
 * `notionistsNeutral` rather than the full `notionists`: the same illustrated
 * people at about 3KB instead of 20KB, which is the difference between a
 * class list of thirty and a megabyte of inline SVG.
 */

/**
 * Generating one costs a few milliseconds, and a list of thirty rows
 * re-renders on every keystroke of a search. Kept by seed so each face is
 * drawn once for as long as the page is open.
 */
const drawn = new Map<string, string>();

/** How many faces to keep before forgetting the oldest. */
const LIMIT = 500;

export function generatedAvatar(seed: string | null | undefined): string | null {
  if (!seed) return null;

  const known = drawn.get(seed);
  if (known) return known;

  const uri = createAvatar(notionistsNeutral, {
    seed,
    // Transparent: the avatar sits on the surface it is placed on, so it
    // works in a list, on a card and against a brand-coloured header.
    backgroundColor: [],
  }).toDataUri();

  // A teacher paging through fourteen hundred students would otherwise hold
  // every face they had scrolled past.
  if (drawn.size >= LIMIT) {
    const oldest = drawn.keys().next().value;
    if (oldest) drawn.delete(oldest);
  }
  drawn.set(seed, uri);

  return uri;
}

/** Only for tests, which must not inherit faces from each other. */
export function clearGeneratedAvatars(): void {
  drawn.clear();
}
