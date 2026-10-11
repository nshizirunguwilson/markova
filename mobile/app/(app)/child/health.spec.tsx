import { waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, givenApiFails, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import {
  parent,
  pressableCount,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import ChildHealth from './health';

/**
 * A parent's view of the sick bay.
 *
 * Read only on purpose: the record is the school's clinical note, and a
 * parent editing it would make it worthless the day somebody has to account
 * for what happened. What a parent gets instead is the thing they never had,
 * which is knowing at all.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const visit = (over: Record<string, unknown> = {}) => ({
  id: 'visit-1',
  complaint: 'Headache since assembly',
  treatment: 'Rested and given water',
  referredTo: null,
  severity: 'MINOR',
  outcome: 'RETURNED_TO_CLASS',
  visitedAt: '2026-08-18T09:15:00.000Z',
  seenBy: { firstName: 'Nadine', lastName: 'Ingabire', role: 'NURSE' },
  ...over,
});

const health = (over: Record<string, unknown> = {}, visits: unknown[] = []) =>
  givenApi({
    '/clinic/student/student-1': {
      student: {
        bloodType: 'O+',
        allergies: 'Penicillin',
        healthRecord: {
          chronicConditions: 'Asthma',
          regularMedication: 'Inhaler as needed',
          emergencyContactName: 'Jean Habimana',
          emergencyRelationship: 'father',
          emergencyContactPhone: '+250788100000',
        },
        ...over,
      },
    },
    '/clinic/student/student-1/visits': { data: visits },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildHealth />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  health();
});

/**
 * An allergy is the one line somebody has to read first, so it is set apart
 * rather than sitting in a list of facts.
 */
describe('what the school holds on record', () => {
  it('puts the allergy above everything else, marked out', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Allergic to')).toBeTruthy());
    expect(screen.getByText('Penicillin')).toBeTruthy();
    expect(
      styleOf(screen.getByText('Allergic to').parent!).borderLeftColor,
    ).toBe(defaultTheme.status.critical.solid);
  });

  it('says so plainly where there is no allergy', async () => {
    health({ allergies: null, healthRecord: {} });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nothing on record')).toBeTruthy(),
    );
  });

  it('falls back to the allergy note on the health record', async () => {
    health({ allergies: null, healthRecord: { allergyNotes: 'Peanuts' } });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Peanuts')).toBeTruthy());
  });

  it('shows the blood type and the long-term conditions', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('O+')).toBeTruthy());
    expect(screen.getByText('Asthma')).toBeTruthy();
    expect(screen.getByText('Inhaler as needed')).toBeTruthy();
  });

  it('says nothing is recorded rather than leaving a blank', async () => {
    health({ bloodType: null, healthRecord: {} });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Not recorded')).toBeTruthy());
    expect(screen.getAllByText('None recorded')).toHaveLength(2);
  });

  /**
   * Who the school rings first is the fact that matters at two in the
   * morning, and it names a relationship rather than only a number.
   */
  it('names who the school rings first, and on what number', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Jean Habimana (father)')).toBeTruthy(),
    );
    expect(screen.getByText('+250788100000')).toBeTruthy();
  });

  it('names them without a relationship where none is recorded', async () => {
    health({
      healthRecord: { emergencyContactName: 'Jean Habimana' },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Jean Habimana')).toBeTruthy());
  });

  it('says it rings you when nobody else is named', async () => {
    health({ healthRecord: {} });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('You')).toBeTruthy());
  });

  it('sets the number in mono, since it is read out digit by digit', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(styleOf(screen.getByText('+250788100000')).fontFamily).toContain(
        'JetBrains',
      ),
    );
  });
});

describe('the visits themselves', () => {
  it('names the child in the header', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('On record')).toBeTruthy());
    expect(screenTitle()).toBe('Aline Uwase, health');
  });

  it('says what they came in with, when, and who saw them', async () => {
    health({}, [visit()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Headache since assembly')).toBeTruthy(),
    );
    expect(screen.getByText(/Rested and given water/)).toBeTruthy();
    expect(screen.getByText(/Seen by Nadine Ingabire/)).toBeTruthy();
  });

  it('says where a child was sent when they were sent on', async () => {
    health({}, [
      visit({ referredTo: 'Kacyiru Health Centre', outcome: 'REFERRED_OUT' }),
    ]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Sent to Kacyiru Health Centre/)).toBeTruthy(),
    );
    expect(screen.getByText('Sent to a health centre')).toBeTruthy();
  });

  it.each([
    ['RETURNED_TO_CLASS', 'Went back to class'],
    ['RESTING_IN_SICK_BAY', 'Rested in the sick bay'],
    ['SENT_HOME', 'Collected from school'],
  ])('says a %s outcome as "%s"', async (outcome, label) => {
    health({}, [visit({ outcome })]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  });

  it.each([
    ['MINOR', defaultTheme.fg.secondary],
    ['MODERATE', defaultTheme.status.caution.text],
    ['SERIOUS', defaultTheme.status.critical.text],
  ])('colours a %s visit by how bad it was', async (severity, colour) => {
    health({}, [visit({ severity })]);

    const screen = await open();

    await waitFor(() =>
      expect(styleOf(screen.getByText('Went back to class')).color).toBe(colour),
    );
  });

  it('says so when a child has never been', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Never been')).toBeTruthy());
    expect(
      screen.getByText('Your child has not been to the sick bay.'),
    ).toBeTruthy();
  });

  // Read only: the record is the school's clinical note, so there is nothing
  // here a parent can press.
  it('offers a parent nothing to change', async () => {
    health({}, [visit()]);

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Headache since assembly')).toBeTruthy(),
    );
    expect(pressableCount(screen)).toBe(0);
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/clinic/student/student-1': () => new Promise(() => {}) });

    const screen = await open();

    await waitFor(() => expect(screen.getByLabelText('Loading')).toBeTruthy());
  });
});

/** An adult child keeping this from their parents (A8): said calmly, not empty. */
describe('a record an adult child keeps private', () => {
  it('says so in the school\'s own sentence', async () => {
    givenApiFails(
      '/clinic/student/student-1',
      Object.assign(new Error('Forbidden'), {
        response: {
          status: 403,
          data: {
            reason: 'KEPT_PRIVATE',
            message: 'Aline has chosen to keep their health visits private.',
          },
        },
      }),
    );
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Aline has chosen to keep their health visits private.')).toBeTruthy(),
    );
    expect(screen.getByText(/From 18, a student decides/)).toBeTruthy();
  });
});
