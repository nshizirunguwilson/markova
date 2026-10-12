import {
  heldToInApp,
  keptOutOfApp,
  mayPublish,
  peopleWithPhotos,
  photoOnCard,
  withoutPhotos,
} from './photo-consent';

/** What each answer about a student's photo means (B6). */
describe('photo answers', () => {
  it('counts publicity as No until somebody says Yes', () => {
    expect(mayPublish('YES')).toBe(true);
    expect(mayPublish('NOT_ASKED')).toBe(false);
    expect(mayPublish('NO')).toBe(false);
  });

  it('keeps the photo on the card unless the family said No', () => {
    expect(photoOnCard('YES')).toBe(true);
    expect(photoOnCard('NOT_ASKED')).toBe(true);
    expect(photoOnCard('NO')).toBe(false);
  });

  it('holds students and parents to the app answer, never the staff', () => {
    expect(heldToInApp('STUDENT')).toBe(true);
    expect(heldToInApp('PARENT')).toBe(true);
    for (const r of [
      'ADMIN',
      'HEAD_TEACHER',
      'TEACHER',
      'LIBRARIAN',
      'PATRON',
      'MATRON',
      'NURSE',
      'BURSAR',
    ]) {
      expect(heldToInApp(r)).toBe(false);
    }
    expect(heldToInApp(undefined)).toBe(false);
  });
});

describe('taking photos out of a reply', () => {
  const reply = () => ({
    id: 'c1',
    participants: [
      { user: { id: 'u1', firstName: 'Keza', photoUrl: '/a.jpg' } },
      { user: { id: 'u2', firstName: 'Eric', photoUrl: '/b.jpg' } },
      { user: { id: 'u3', firstName: 'Nobody', photoUrl: null } },
    ],
    lastMessage: {
      sender: { id: 'u1', photoUrl: '/a.jpg' },
      createdAt: new Date(),
    },
  });

  it('finds everybody in it who has a photo, however deep', () => {
    expect([...peopleWithPhotos(reply())].sort()).toEqual(['u1', 'u2']);
  });

  it('takes out only the photos of those hidden, everywhere they appear', () => {
    const out = withoutPhotos(reply(), new Set(['u1']));
    expect(out.participants[0].user.photoUrl).toBeNull();
    expect(out.lastMessage.sender.photoUrl).toBeNull();
    expect(out.participants[1].user.photoUrl).toBe('/b.jpg');
    expect(out.lastMessage.createdAt).toBeInstanceOf(Date);
  });

  it('leaves a reply alone when nobody is hidden', () => {
    const r = reply();
    expect(withoutPhotos(r, new Set())).toBe(r);
  });

  it('copes with a loop in the reply', () => {
    const a: Record<string, unknown> = { id: 'u1', photoUrl: '/a.jpg' };
    a.self = a;
    expect(peopleWithPhotos(a).has('u1')).toBe(true);
    withoutPhotos(a, new Set(['u1']));
    expect(a.photoUrl).toBeNull();
  });

  it('asks the database only about people, and only the ones said No', async () => {
    const db = {
      student: { findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }]) },
    };
    expect(await keptOutOfApp(db, ['u1', 'u1', 'u2'])).toEqual(new Set(['u1']));
    expect(db.student.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['u1', 'u2'] }, photoInApp: 'NO' },
      select: { userId: true },
    });
    db.student.findMany.mockClear();
    expect((await keptOutOfApp(db, [])).size).toBe(0);
    expect(db.student.findMany).not.toHaveBeenCalled();
  });
});
