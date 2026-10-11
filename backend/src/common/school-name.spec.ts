import { withSchool } from '../prisma/request-context';
import { currentSchoolName } from './school-name';

describe('the name a message is signed with', () => {
  const prisma = {
    school: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(where.id === 'kh' ? { name: 'Kigali Hill' } : null),
      ),
    },
  };

  it("is the school's, inside a school", async () => {
    await expect(
      withSchool('kh', () => currentSchoolName(prisma as never)),
    ).resolves.toBe('Kigali Hill');
  });

  it('is Markova outside any school', async () => {
    await expect(currentSchoolName(prisma as never)).resolves.toBe('Markova');
  });

  it('falls back when the school cannot be read', async () => {
    await expect(
      withSchool('gone', () => currentSchoolName(prisma as never, 'Fallback')),
    ).resolves.toBe('Fallback');
  });
});
