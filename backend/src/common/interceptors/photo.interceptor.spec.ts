import { lastValueFrom, of } from 'rxjs';
import { PhotoInterceptor } from './photo.interceptor';

/**
 * A family's No to the app keeps their child's photo from classmates and
 * other parents (B6), in every reply, and never from the staff.
 */
describe('PhotoInterceptor', () => {
  const body = () => ({
    participants: [
      { user: { id: 'kept', photoUrl: '/kept.jpg' } },
      { user: { id: 'open', photoUrl: '/open.jpg' } },
      { user: { id: 'me', photoUrl: '/me.jpg' } },
    ],
  });

  const run = async (
    user: Record<string, unknown> | undefined,
    { kept = ['kept'], children = [] as string[] } = {},
  ) => {
    const prisma = {
      student: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.userId.in
                .filter((id: string) => kept.includes(id))
                .map((userId: string) => ({ userId })),
            ),
          ),
      },
      parentStudent: {
        findMany: jest
          .fn()
          .mockResolvedValue(children.map((userId) => ({ student: { userId } }))),
      },
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as never;
    const out = await lastValueFrom(
      new PhotoInterceptor(prisma as never).intercept(context, {
        handle: () => of(body()),
      }) as never,
    );
    return { out: out as ReturnType<typeof body>, prisma };
  };
  const photos = (b: ReturnType<typeof body>) =>
    b.participants.map((p) => p.user.photoUrl);

  it('takes the photo out for a classmate', async () => {
    const { out } = await run({ id: 'me', role: 'STUDENT', schoolId: 's' });
    expect(photos(out)).toEqual([null, '/open.jpg', '/me.jpg']);
  });

  it('takes it out for another parent', async () => {
    const { out } = await run({ id: 'p', role: 'PARENT', schoolId: 's' });
    expect(photos(out)[0]).toBeNull();
  });

  it("leaves a parent their own child's photo", async () => {
    const { out } = await run(
      { id: 'p', role: 'PARENT', schoolId: 's' },
      { children: ['kept'] },
    );
    expect(photos(out)[0]).toBe('/kept.jpg');
  });

  it('leaves a student their own photo, even with a No', async () => {
    const { out } = await run(
      { id: 'me', role: 'STUDENT', schoolId: 's' },
      { kept: ['me'] },
    );
    expect(photos(out)[2]).toBe('/me.jpg');
  });

  it.each(['TEACHER', 'ADMIN', 'NURSE'])(
    'leaves every photo for a %s, without asking',
    async (role) => {
      const { out, prisma } = await run({ id: 't', role, schoolId: 's' });
      expect(photos(out)).toEqual(['/kept.jpg', '/open.jpg', '/me.jpg']);
      expect(prisma.student.findMany).not.toHaveBeenCalled();
    },
  );

  it('leaves a reply alone for nobody signed in', async () => {
    const { out } = await run(undefined);
    expect(photos(out)[0]).toBe('/kept.jpg');
  });
});
