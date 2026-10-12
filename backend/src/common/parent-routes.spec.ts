import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Every route a parent can reach says what kind of record it shows.
 *
 * From 18 a student decides what their parents see (A8, and
 * common/parent-sharing.ts). That holds only if every page a parent can open
 * asks. This reads every controller, finds each route open to a parent, and
 * fails for one that is not listed below, or whose handler does not do what
 * its line says.
 *
 * Adding a route a parent can reach? Add it here with its kind, and call
 * verifyStudentAccess with that kind; or say why it is never hidden.
 */
type Line =
  { kind: 'results' | 'conduct' | 'health'; proof: string } | { never: string };

const results = { kind: 'results', proof: "'results'" } as const;
const conduct = { kind: 'conduct', proof: "'conduct'" } as const;
const ownAccount = {
  never: 'The parent’s own account, messages or notices, not a child’s record.',
} as const;
const money = {
  never: 'Fees and pocket money: between whoever pays and the school.',
} as const;
const school = {
  never: 'The school’s timetable, exams, help pages: about no one child.',
} as const;

const PARENT_ROUTES: Record<string, Line> = {
  'GET /attendance/student-summary': conduct,
  'GET /marks/term-results/student/:studentId': results,
  'GET /marks/year-results/student/:studentId': results,
  'GET /marks/report-card/:studentId': results,
  'GET /academic/timetable': school,
  'GET /academic/exams': school,
  'GET /homework/student/:studentId': results,
  'GET /users/:id': { kind: 'health', proof: 'withoutKept' },
  'POST /users/:id/photo': ownAccount,
  'DELETE /users/:id/photo': ownAccount,
  'POST /users/:id/signature': ownAccount,
  'DELETE /users/:id/signature': ownAccount,
  'POST /activities/:id/consent': {
    never: 'The parent agreeing to a trip: asked of them, not shown to them.',
  },
  'GET /finance/account/:studentId': money,
  'GET /finance/history/:studentId': money,
  'GET /clinic/student/:studentId/medication': {
    kind: 'health',
    proof: 'assertMaySee',
  },
  'GET /clinic/student/:studentId/visits': {
    kind: 'health',
    proof: 'assertMaySee',
  },
  'GET /clinic/student/:studentId': { kind: 'health', proof: 'assertMaySee' },
  'GET /pocket-money/student/:studentId': money,
  'GET /pocket-money/student/:studentId/statement': money,
  'PUT /pocket-money/limits': money,
  'GET /discipline/incidents/:id': conduct,
  'GET /discipline/student/:studentId': conduct,
  'POST /discipline/appeals': { kind: 'conduct', proof: 'createAppeal' },
  'POST /discipline/acknowledge': {
    kind: 'conduct',
    proof: 'acknowledgeIncident',
  },
  'GET /discipline/standing/:studentId': conduct,
  'POST /messaging/conversations': ownAccount,
  'GET /messaging/conversations': ownAccount,
  'GET /messaging/conversations/:id/messages': ownAccount,
  'POST /messaging/messages': ownAccount,
  'POST /messaging/read': ownAccount,
  'GET /messaging/unread': ownAccount,
  'GET /messaging/contacts': ownAccount,
  'GET /messaging/conversations/:id/participants': ownAccount,
  'DELETE /messaging/conversations/:id/participants/:userId': ownAccount,
  'POST /messaging/attachments': ownAccount,
  'GET /notifications': ownAccount,
  'GET /notifications/unread': ownAccount,
  'PUT /notifications/:id/read': ownAccount,
  'PUT /notifications/read-all': ownAccount,
  'POST /notifications/push-token': ownAccount,
  'GET /help/faqs': school,
  'POST /help/tickets': ownAccount,
  'GET /help/tickets/mine': ownAccount,
  'GET /analytics/student/:studentId/profile': results,
  'GET /analytics/student/:studentId': results,
  'GET /analytics/parent/child/:studentId/trends': results,
  'GET /reports/term/:studentId': { kind: 'results', proof: 'assertMayRead' },
  // The family's own child's support plan, held to 'health' in the service.
  'GET /students/:id/support-plan': { kind: 'health', proof: 'forStudent' },
  // The family's own answers about the photo, which from 18 the student gives
  // instead (PhotoConsentService refuses the parent then).
  'GET /students/:id/photo-consent': {
    never: 'The family’s own answers, not a record about the child.',
  },
  'PUT /students/:id/photo-consent': {
    never: 'The family’s own answers, not a record about the child.',
  },
  'GET /reports/term/:studentId/html': {
    kind: 'results',
    proof: 'assertMayRead',
  },
  'GET /reports/term/:studentId/pdf': {
    kind: 'results',
    proof: 'assertMayRead',
  },
  'POST /reports/render': results,
  'GET /reports/render/:id': {
    never:
      'Asks after a render queued through POST /reports/render, which checked.',
  },
  'GET /reports/render/:id/download': {
    never:
      'Collects a render queued through POST /reports/render, which checked.',
  },
  'GET /reports/year/:studentId': {
    kind: 'results',
    proof: 'assertMayReadYear',
  },
  'GET /reports/year/:studentId/html': {
    kind: 'results',
    proof: 'assertMayReadYear',
  },
  'GET /reports/year/:studentId/pdf': {
    kind: 'results',
    proof: 'assertMayReadYear',
  },
};

const MODULES = join(__dirname, '..', 'modules');

/** Every route open to a parent, with the text of its handler. */
function parentRoutes(): { key: string; handler: string; file: string }[] {
  const found: { key: string; handler: string; file: string }[] = [];
  for (const dir of readdirSync(MODULES)) {
    if (!statSync(join(MODULES, dir)).isDirectory()) continue;
    for (const name of readdirSync(join(MODULES, dir))) {
      if (!name.endsWith('.controller.ts')) continue;
      const source = readFileSync(join(MODULES, dir, name), 'utf8');
      const base = source.match(/@Controller\('?([^')]*)'?\)/)?.[1] ?? '';
      const decorators =
        /@(Get|Post|Put|Patch|Delete)\(([^)]*)\)([\s\S]*?)\n {2}(?:async )?\w+\(/g;
      let m: RegExpExecArray | null;
      while ((m = decorators.exec(source))) {
        const [, method, rawPath, between] = m;
        if (!/'PARENT'|ANY_ROLE/.test(between)) continue;
        const path = rawPath.replace(/['"`]/g, '').trim();
        const key = `${method.toUpperCase()} /${[base, path].filter(Boolean).join('/')}`;
        // The handler: up to the next route decorator, or the end.
        const rest = source.slice(m.index + m[0].length);
        const next = rest.search(/\n {2}@(Get|Post|Put|Patch|Delete)\(/);
        found.push({
          key,
          handler: next === -1 ? rest : rest.slice(0, next),
          file: `${dir}/${name}`,
        });
      }
    }
  }
  return found;
}

describe('the routes a parent can reach', () => {
  const routes = parentRoutes();

  it('are found', () => {
    // An empty list would mean the search broke, not that parents left.
    expect(routes.length).toBeGreaterThan(40);
  });

  it('are each listed with the kind of record they show, or why none', () => {
    const unlisted = routes
      .map((r) => r.key)
      .filter((k) => !(k in PARENT_ROUTES));
    expect(unlisted).toEqual([]);
  });

  it('each ask about the kind they are listed with', () => {
    const unasked = routes
      .filter((r) => {
        const line = PARENT_ROUTES[r.key];
        return line && 'kind' in line && !r.handler.includes(line.proof);
      })
      .map(
        (r) =>
          `${r.key} (${r.file}) does not contain ${(PARENT_ROUTES[r.key] as { proof: string }).proof}`,
      );
    expect(unasked).toEqual([]);
  });

  it('list no route that is gone', () => {
    const keys = routes.map((r) => r.key);
    expect(Object.keys(PARENT_ROUTES).filter((k) => !keys.includes(k))).toEqual(
      [],
    );
  });
});
