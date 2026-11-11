import { NotFoundException } from '@nestjs/common';

/**
 * Refuse an id that names nothing, rather than answer an empty list.
 *
 * A route asked for one student's clinic visits, fee history or results
 * answered 200 with nothing when the id matched no student, so a mistyped id
 * looked exactly like "this student has no records". The two have to look
 * different: one is somebody's history, the other is a mistake.
 *
 * Read inside the school (the wall between schools applies), so an id from
 * another school is as unknown as one that was never issued.
 */
export async function mustExist(
  table: { findFirst(args: object): Promise<unknown> },
  id: string,
  what: string,
): Promise<void> {
  const row = await table.findFirst({ where: { id }, select: { id: true } });
  if (!row) throw new NotFoundException(`${what} not found`);
}
