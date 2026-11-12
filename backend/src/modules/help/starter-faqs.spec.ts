import { Role } from '@prisma/client';
import { STARTER_FAQS, starterFaqRows } from './starter-faqs';

/**
 * Help was three questions shown to all ten roles. The starter set a school
 * begins with has to give every role something written for them.
 */
describe('the questions a school starts with', () => {
  const shownTo = (role: Role) =>
    STARTER_FAQS.filter(
      (faq) => faq.audience.length === 0 || faq.audience.includes(role),
    );

  it.each(Object.values(Role))('has something written for %s', (role) => {
    const own = STARTER_FAQS.filter((faq) => faq.audience.includes(role));
    expect(own.length).toBeGreaterThan(0);
  });

  it.each(Object.values(Role))(
    'does not show %s the same list as everybody else',
    (role) => {
      const mine = shownTo(role).map((faq) => faq.title);
      for (const other of Object.values(Role)) {
        if (other === role) continue;
        // The patron and matron do the same work on two sides of the school.
        const twins: Role[] = [Role.PATRON, Role.MATRON];
        if (twins.includes(role) && twins.includes(other)) continue;
        expect(shownTo(other).map((faq) => faq.title)).not.toEqual(mine);
      }
    },
  );

  // The finding, word for word.
  it("keeps a child's marks to the parents", () => {
    const faq = STARTER_FAQS.find((f) => /my child's marks/i.test(f.title))!;
    expect(faq.audience).toEqual([Role.PARENT]);
    for (const role of [Role.NURSE, Role.BURSAR, Role.TEACHER]) {
      expect(shownTo(role).map((f) => f.title)).not.toContain(faq.title);
    }
  });

  it('asks no question twice', () => {
    const titles = STARTER_FAQS.map((faq) => faq.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('numbers them in the order they are written', () => {
    const rows = starterFaqRows();
    expect(rows.map((row) => row.displayOrder)).toEqual(
      rows.map((_, i) => i + 1),
    );
  });
});
