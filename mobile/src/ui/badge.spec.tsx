import { defaultTheme } from '@/design/theme';
import { renderScreen, resetHarness, styleOf } from '@/test/harness';

import { Badge, humanise, statusTone } from './badge';

/**
 * The app is full of enum-shaped state: attendance, loans, appeals, incidents.
 * All of it lands here so one meaning always gets one colour, and OVERDUE
 * looks the same in the librarian's list as on the admin dashboard.
 */

beforeEach(resetHarness);

describe('a status pill', () => {
  it('is grey unless it means something', async () => {
    const screen = await renderScreen(<Badge label="Draft" />);

    expect(styleOf(screen.getByText('Draft').parent!).backgroundColor).toBe(
      defaultTheme.bg.fill,
    );
  });

  it.each([
    ['positive', defaultTheme.status.positive],
    ['caution', defaultTheme.status.caution],
    ['critical', defaultTheme.status.critical],
    ['info', defaultTheme.status.info],
  ])('is tinted %s when it means that', async (tone, expected) => {
    const screen = await renderScreen(
      <Badge label="Status" tone={tone as 'positive'} />,
    );

    expect(styleOf(screen.getByText('Status').parent!).backgroundColor).toBe(
      expected.tint,
    );
    expect(styleOf(screen.getByText('Status')).color).toBe(expected.text);
  });

  it('wears the school colour when it is about the school', async () => {
    const screen = await renderScreen(<Badge label="Term 2" tone="brand" />);

    expect(styleOf(screen.getByText('Term 2').parent!).backgroundColor).toBe(
      defaultTheme.brand.tint,
    );
  });

  // Tinted rather than solid: a solid pill competes with the row title beside
  // it, and the title is the thing being scanned.
  it('is quieter than the row title it sits beside', async () => {
    const screen = await renderScreen(<Badge label="Overdue" tone="critical" />);

    expect(styleOf(screen.getByText('Overdue').parent!).backgroundColor).not.toBe(
      defaultTheme.status.critical.solid,
    );
  });

  it('lines up a figure that changes in place', async () => {
    const screen = await renderScreen(<Badge label="12" numeric />);

    expect(styleOf(screen.getByText('12')).fontVariant).toEqual([
      'tabular-nums',
    ]);
  });
});

/**
 * The shared vocabulary. Every screen looks a status up here rather than
 * choosing a colour, which is what keeps them agreeing with each other.
 */
describe('what each status means', () => {
  it.each([
    ['PRESENT', 'positive'],
    ['LATE', 'caution'],
    ['ABSENT', 'critical'],
  ])('reads %s in the register as %s', (status, tone) => {
    expect(statusTone[status]).toBe(tone);
  });

  it.each([
    ['ACTIVE', 'info'],
    ['RETURNED', 'positive'],
    ['OVERDUE', 'critical'],
    ['LOST', 'critical'],
    ['DAMAGED', 'caution'],
  ])('reads %s on a loan as %s', (status, tone) => {
    expect(statusTone[status]).toBe(tone);
  });

  it.each([
    ['PENDING', 'caution'],
    ['APPROVED', 'positive'],
    ['REJECTED', 'critical'],
    ['OPEN', 'caution'],
    ['RESOLVED', 'positive'],
  ])('reads %s on an appeal or a ticket as %s', (status, tone) => {
    expect(statusTone[status]).toBe(tone);
  });

  // The escalation has to read as an escalation. A detention that looks the
  // same as a verbal warning tells a parent nothing.
  it.each([
    ['VERBAL_WARNING', 'caution'],
    ['WRITTEN_WARNING', 'caution'],
    ['DETENTION', 'critical'],
    ['SUSPENSION', 'critical'],
    ['EXPULSION', 'critical'],
  ])('reads %s in the discipline log as %s', (status, tone) => {
    expect(statusTone[status]).toBe(tone);
  });

  it('does not colour a student who simply left', () => {
    expect(statusTone.INACTIVE).toBe('neutral');
    expect(statusTone.TRANSFERRED).toBe('neutral');
    expect(statusTone.GRADUATED).toBe('info');
  });

  it('has nothing to say about a status it has never seen', () => {
    expect(statusTone.SOMETHING_NEW).toBeUndefined();
  });
});

describe('turning a database value into English', () => {
  it.each([
    ['PRESENT', 'Present'],
    ['VERBAL_WARNING', 'Verbal warning'],
    ['NOT_RETURNED_YET', 'Not returned yet'],
    ['OK', 'Ok'],
    ['A', 'A'],
  ])('reads %s as "%s"', (value, expected) => {
    expect(humanise(value)).toBe(expected);
  });

  it('leaves an empty value empty rather than throwing', () => {
    expect(humanise('')).toBe('');
  });
});
