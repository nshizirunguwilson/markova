import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every place that writes to a family about a student asks first.
 *
 * A family whose child passed away must never get another text, and a
 * suspended child's family must not be told each morning that their child
 * was absent. That holds only if every sender asks `familyMayHear`. This
 * finds every source file that both looks up a student's parents and sends
 * something, and fails for one that does neither the asking nor appears
 * below with the reason it does not need to.
 *
 * Adding a new kind of message to families? Call familyMayHear before it
 * goes. This test will remind you.
 */
const ROOT = join(__dirname, '..');

/** Files that look up parents and send, but never about a student's life. */
const WITHOUT_ASKING: Record<string, string> = {
  'modules/auth/auth.service.ts':
    'Sign in codes and password resets, sent to the person signing in.',
  'modules/messaging/messaging.service.ts':
    'Announcements to parents reach only the parents of students on the roll ' +
    '(resolveAudience filters status ACTIVE), and a chat notice is to people ' +
    'in the conversation.',
  'modules/journey/journey.service.ts':
    'Writes to the class teacher and the principal about a family, never to it.',
};

const SENDS =
  /notification\.create|notifications\.send|delivery\.(sms|email)|sendBulk/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__test__' ? [] : sources(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('messages to families', () => {
  const senders = sources(ROOT)
    .map((path) => ({
      file: relative(ROOT, path),
      text: readFileSync(path, 'utf8'),
    }))
    .filter((f) => f.text.includes('parentStudent') && SENDS.test(f.text));

  it('finds the places that write to families', () => {
    // Attendance, discipline and merits at least; an empty list means the
    // search broke, not that the app stopped writing to families.
    expect(senders.map((s) => s.file)).toEqual(
      expect.arrayContaining([
        'modules/attendance/attendance.service.ts',
        'modules/discipline/discipline.service.ts',
        'modules/discipline/merits.service.ts',
      ]),
    );
  });

  it('asks whether the family may hear, everywhere it writes to one', () => {
    const unasked = senders
      .filter((s) => !s.text.includes('familyMayHear('))
      .map((s) => s.file)
      .filter((file) => !(file in WITHOUT_ASKING));
    expect(unasked).toEqual([]);
  });

  it('keeps no excuse for a file that no longer needs one', () => {
    const files = senders.map((s) => s.file);
    const stale = Object.keys(WITHOUT_ASKING).filter(
      (file) => !files.includes(file),
    );
    expect(stale).toEqual([]);
  });
});
