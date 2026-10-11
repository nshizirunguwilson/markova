/**
 * Who watches over a chat, and how the chat reads because of it.
 *
 * Every chat between a member of staff and a student also holds somebody
 * watching over it: a safeguarding lead, or the principal where the school
 * has named none. They are in the room but not in the conversation, so a
 * chat is named after the people talking. Kept the same as the web's
 * web/src/lib/watching.ts.
 */
export interface RoomUser {
  id?: string;
  firstName?: string;
  lastName?: string;
}

export interface RoomMember {
  userId?: string;
  watching?: boolean;
  user?: RoomUser;
}

const fullName = (u?: RoomUser) => `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim();

/** "A", "A and B", "A, B and C". */
export function listOfNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The people talking in a chat, other than the reader. */
export function talkersOf<T extends RoomMember>(members: T[] | undefined, me?: string): T[] {
  return (members ?? []).filter((p) => !p.watching && p.userId !== me);
}

/** The line a chat shows at its top when somebody watches over it, or null. */
export function watchNotice(members: RoomMember[] | undefined, me?: string): string | null {
  const watchers = (members ?? []).filter((p) => p.watching);
  if (watchers.length === 0) return null;
  if (watchers.some((p) => p.userId === me)) {
    return 'You watch over this chat as a safeguarding lead. Everyone in it can see that you are here.';
  }
  const names = listOfNames(watchers.map((p) => fullName(p.user)).filter(Boolean));
  const verb = watchers.length === 1 ? 'is' : 'are';
  return `${names} ${verb} watching over this chat. Every chat between staff and a student is, so that no child is ever alone with an adult.`;
}
