import { PhotoAnswer, Role } from '@prisma/client';

/**
 * A student's photo, and what the family agreed to (B6 in
 * docs/STUDENT-LIFE-DESIGN.md).
 *
 * Three uses, three answers:
 * - **forId**: the ID card, the gate check and the report card. The school's
 *   own job; until a family answers, it goes on.
 * - **inApp**: classmates and other parents seeing it beside the name in
 *   chat. Until a family answers, it goes on. A No shows them initials; the
 *   staff still see the photo, since knowing a child's face is their work.
 * - **publicity**: the website, posters, social media. Markova publishes
 *   nothing itself; the school gets the list. Until a family answers, it
 *   counts as No.
 */
export const PHOTO_USE_LABEL = {
  forId: 'On the ID card and report card',
  inApp: 'In the app, for classmates and other parents',
  publicity: "In the school's publicity",
} as const;

export const ANSWER_LABEL: Record<PhotoAnswer, string> = {
  YES: 'Yes',
  NO: 'No',
  NOT_ASKED: 'Not asked yet',
};

/** Who sees every student's photo whatever the family said about the app. */
const STAFF = new Set<string>([
  Role.ADMIN,
  Role.HEAD_TEACHER,
  Role.TEACHER,
  Role.LIBRARIAN,
  Role.PATRON,
  Role.MATRON,
  Role.NURSE,
  Role.BURSAR,
]);

/** Whether a viewer is held to the "in the app" answer at all. */
export const heldToInApp = (role?: string | null) => !!role && !STAFF.has(role);

/** Publicity counts as No until somebody says Yes. */
export const mayPublish = (answer: PhotoAnswer) => answer === 'YES';

/** The card and the gate use the photo unless the family said No. */
export const photoOnCard = (answer: PhotoAnswer) => answer !== 'NO';

type Reader = {
  student: {
    findMany: (args: {
      where: { userId: { in: string[] }; photoInApp: PhotoAnswer };
      select: { userId: true };
    }) => PromiseLike<{ userId: string }[]>;
  };
};

/**
 * Of these user ids, the students whose family said No to the app. Everyone
 * else (staff, parents, students whose family said Yes or was not asked yet)
 * is left alone.
 */
export async function keptOutOfApp(
  db: Reader,
  userIds: Iterable<string>,
): Promise<Set<string>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  const rows = await db.student.findMany({
    where: { userId: { in: ids }, photoInApp: 'NO' },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Every `{ id, photoUrl }` in a reply that carries a photo: the shape every
 * person in the API takes (a chat participant's user, a message's sender, a
 * search result).
 */
export function peopleWithPhotos(value: unknown, found = new Set<string>()) {
  walk(value, (node) => {
    if (typeof node.id === 'string' && node.photoUrl) found.add(node.id);
  });
  return found;
}

/** The same reply with those people's photos taken out. Changes it in place. */
export function withoutPhotos<T>(value: T, hidden: Set<string>): T {
  if (hidden.size === 0) return value;
  walk(value, (node) => {
    if (typeof node.id === 'string' && hidden.has(node.id) && node.photoUrl) {
      node.photoUrl = null;
    }
  });
  return value;
}

function walk(
  value: unknown,
  visit: (node: Record<string, unknown>) => void,
  seen = new Set<object>(),
) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  if (value instanceof Date || Buffer.isBuffer(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, seen);
    return;
  }
  const node = value as Record<string, unknown>;
  visit(node);
  for (const key of Object.keys(node)) walk(node[key], visit, seen);
}
