/**
 * Who watches over a chat, and how the chat reads because of it.
 *
 * Every chat between a member of staff and a student also holds somebody
 * who watches over it: a safeguarding lead, or the principal where the school
 * has named none. They are in the room but not part of the conversation, so a
 * direct chat between a teacher and a student is still named after the two
 * of them, and is still a direct chat.
 */

export interface RoomUser {
  id?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  [key: string]: unknown;
}

export interface RoomMember {
  watching?: boolean | null;
  user?: RoomUser | null;
}

export interface Room {
  participants?: RoomMember[] | null;
}

const fullName = (u?: RoomUser | null) =>
  `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim();

/** "A", "A and B", "A, B and C". */
export function listOfNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The people watching over a chat. */
export function watchersOf(room: Room): RoomUser[] {
  return (room.participants ?? [])
    .filter((p) => p?.watching && p.user)
    .map((p) => p.user as RoomUser);
}

/** Whether the reader is one of the people watching over it. */
export function isWatching(room: Room, meId?: string | null): boolean {
  return watchersOf(room).some((u) => u.id && u.id === meId);
}

/** The people talking in it, other than the reader. */
export function talkersOf(room: Room, meId?: string | null): RoomUser[] {
  return (room.participants ?? [])
    .filter((p) => !p?.watching && p?.user && p.user.id !== meId)
    .map((p) => p.user as RoomUser);
}

/**
 * The line a chat shows at its top when somebody watches over it, or null
 * when nobody does.
 *
 * Said plainly to everybody in it, the student included. A watcher nobody
 * knows about would be the very thing this is meant to prevent.
 */
export function watchNotice(room: Room, meId?: string | null): string | null {
  const watchers = watchersOf(room);
  if (watchers.length === 0) return null;
  if (isWatching(room, meId)) {
    return "You watch over this chat as a safeguarding lead. Everyone in it can see that you are here.";
  }
  const names = listOfNames(watchers.map(fullName).filter(Boolean));
  const verb = watchers.length === 1 ? "is" : "are";
  return `${names} ${verb} watching over this chat. Every chat between staff and a student is, so that no child is ever alone with an adult.`;
}
