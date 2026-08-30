import 'reflect-metadata';
import { MarksController } from './marks.controller';
import { AttendanceController } from '../attendance/attendance.controller';
import { ReportsController } from '../reports/reports.controller';

/**
 * Who runs the academic side.
 *
 * Report cards, marks and attendance belong to the Director of Studies, not
 * to the principal. That is a real division in a Rwandan school: the DOS runs
 * academic delivery, and the principal runs the institution.
 *
 * It is worth a test of its own because it is the kind of rule that erodes
 * one endpoint at a time. Somebody adds a route, copies the decorator from
 * the one above it, and the principal quietly has the mark book back. This
 * reads the guards themselves, so a new route that hands it back fails here
 * rather than in a demo.
 *
 * One consequence, recorded because it was a deliberate choice rather than an
 * oversight: there is no longer a fallback when the DOS is away. Nobody else
 * can issue a report card or close a register. A school that needs that for a
 * fortnight has to appoint an acting DOS, which is what a school does anyway.
 */

/** The roles a route admits, read off the decorator rather than the source. */
function rolesOf(controller: object, method: string): string[] {
  const handler = (controller as Record<string, unknown>)[method];
  return (Reflect.getMetadata('roles', handler as object) as string[]) ?? [];
}

/** Every route on a controller, with the roles it admits. */
function everyRoute(controller: { prototype: object }) {
  const proto = controller.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => name !== 'constructor')
    .map((name) => ({ name, roles: rolesOf(proto, name) }))
    .filter((r) => r.roles.length > 0);
}

describe('the academic side belongs to the Director of Studies', () => {
  it.each([
    ['the mark book', MarksController],
    ['the register', AttendanceController],
  ])('gives the principal no route on %s', (_what, controller) => {
    const admin = everyRoute(controller as never).filter((r) =>
      r.roles.includes('ADMIN'),
    );
    expect(admin.map((r) => r.name)).toEqual([]);
  });

  /*
    The reports controller is mixed. ID cards, transfer letters and the data
    exports are the principal's - none of them is a report card - so this
    names the routes that moved rather than sweeping the whole controller.
  */
  it('gives the principal no route on a report card', () => {
    const academic = everyRoute(ReportsController as never).filter((r) =>
      /term|year|comment/i.test(r.name),
    );
    expect(academic.length).toBeGreaterThan(4);
    for (const route of academic) {
      expect(route.roles).not.toContain('ADMIN');
    }
  });

  it('leaves the principal the ID cards and the exports', () => {
    const theirs = everyRoute(ReportsController as never).filter((r) =>
      /idCard|export|document/i.test(r.name),
    );
    expect(theirs.length).toBeGreaterThan(4);
    for (const route of theirs) {
      expect(route.roles).toContain('ADMIN');
    }
  });

  /* The point of moving it: every one of these is now a route the DOS can
     reach, not merely one the principal cannot. */
  it.each([
    ['the mark book', MarksController],
    ['the register', AttendanceController],
  ])('gives the head teacher every route on %s', (_what, controller) => {
    const routes = everyRoute(controller as never);
    expect(routes.length).toBeGreaterThan(5);
    for (const route of routes) {
      /* Except the ones that are somebody else's entirely: a student reading
         their own attendance summary is not the DOS's route. */
      if (route.roles.every((r) => ['STUDENT', 'PARENT'].includes(r))) continue;
      expect(route.roles).toContain('HEAD_TEACHER');
    }
  });

  // A subject teacher still enters their own marks and takes their own class.
  it.each([
    ['the mark book', MarksController],
    ['the register', AttendanceController],
  ])('leaves the classroom routes with teachers on %s', (_what, controller) => {
    const forTeachers = everyRoute(controller as never).filter((r) =>
      r.roles.includes('TEACHER'),
    );
    expect(forTeachers.length).toBeGreaterThan(3);
  });
});
