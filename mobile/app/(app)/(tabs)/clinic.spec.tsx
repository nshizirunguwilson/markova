import { fireEvent, waitFor } from '@testing-library/react-native';
import { toast } from 'sonner-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, givenApiFails, http, resetApi } from '@/test/api-mock';
import {
  nurse,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import Clinic from './clinic';

/**
 * The sick bay, in a matron's hand.
 *
 * This is the screen the phone was made for. A matron walking a child to the
 * clinic at two in the morning is not going to open a laptop, and the
 * exercise book that stands in for this today is downstairs in the office.
 *
 * The list opens on who is lying in there right now, because that is the only
 * question anybody asks first.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const notify = toast as jest.Mocked<typeof toast>;

const visit = (over: Record<string, unknown> = {}) => ({
  id: 'visit-1',
  complaint: 'Headache since assembly',
  findings: null,
  treatment: null,
  severity: 'MINOR',
  outcome: 'RESTING_IN_SICK_BAY',
  temperature: null,
  referredTo: null,
  visitedAt: '2026-08-24T09:15:00.000Z',
  dischargedAt: null,
  parentNotifiedAt: null,
  student: {
    id: 'student-1',
    studentIdNumber: 'STD-2025-0417',
    bloodType: null,
    allergies: null,
    user: { firstName: 'Aline', lastName: 'Uwase', photoUrl: null },
  },
  seenBy: { firstName: 'Nadine', lastName: 'Ingabire', role: 'NURSE' },
  medications: [],
  ...over,
});

const sickBay = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/clinic/summary': {
      days: 30,
      visits: 0,
      inSickBay: 0,
      referred: 0,
      dosesGiven: 0,
      repeatVisitors: [],
    },
    '/clinic/visits': { data: [], meta: { total: 0 } },
    '/clinic/medication': { given: true },
    ...over,
  });

const open = async () => {
  signedInAs(nurse);
  return renderScreen(<Clinic />);
};

const openVisit = async (screen: Awaited<ReturnType<typeof renderScreen>>) => {
  await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
  await fireEvent.press(screen.getByText('Aline Uwase'));
  await waitFor(() => expect(screen.getByText('Said')).toBeTruthy());
};

beforeEach(() => {
  resetHarness();
  resetApi();
  jest.clearAllMocks();
  sickBay();
});

/**
 * Who is lying in there right now is the only question anybody asks first.
 */
describe('who is in the sick bay', () => {
  it('opens on the people still resting there', async () => {
    sickBay({ '/clinic/visits': { data: [visit()], meta: { total: 1 } } });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Resting here now')).toBeTruthy());
    expect(screen.getByText('Aline Uwase')).toBeTruthy();
  });

  it('asks only for the people still in there', async () => {
    await open();

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/clinic/visits', {
        params: { inSickBay: 'true', limit: 50 },
      }),
    );
  });

  it('says what they came in with and when', async () => {
    sickBay({ '/clinic/visits': { data: [visit()], meta: { total: 1 } } });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Headache since assembly/)).toBeTruthy(),
    );
  });

  /**
   * An allergy on the list, not only on the detail screen. Somebody scanning
   * the ward has to see it without opening anything.
   */
  it('shows an allergy on the list itself', async () => {
    sickBay({
      '/clinic/visits': {
        data: [visit({ student: { ...visit().student, allergies: 'Penicillin' } })],
        meta: { total: 1 },
      },
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Allergic to Penicillin/)).toBeTruthy(),
    );
  });

  it.each([
    ['RETURNED_TO_CLASS', 'Back to class'],
    ['RESTING_IN_SICK_BAY', 'Resting here'],
    ['REFERRED_OUT', 'Referred out'],
    ['SENT_HOME', 'Collected'],
  ])('says a %s outcome as "%s"', async (outcome, label) => {
    sickBay({
      '/clinic/visits': { data: [visit({ outcome })], meta: { total: 1 } },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  });

  it.each([
    ['MINOR', defaultTheme.fg.secondary],
    ['MODERATE', defaultTheme.status.caution.text],
    ['SERIOUS', defaultTheme.status.critical.text],
  ])('colours a %s visit by how bad it is', async (severity, colour) => {
    sickBay({
      '/clinic/visits': { data: [visit({ severity })], meta: { total: 1 } },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('Resting here')).toBeTruthy());
    expect(styleOf(screen.getByText('Resting here')).color).toBe(colour);
  });

  it('counts the month at the top', async () => {
    sickBay({
      '/clinic/summary': {
        inSickBay: 2,
        visits: 41,
        dosesGiven: 17,
        repeatVisitors: [],
      },
    });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('41')).toBeTruthy());
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
  });

  it('draws before the month’s figures have arrived', async () => {
    sickBay({ '/clinic/summary': () => new Promise(() => {}) });

    const screen = await open();

    // The stat label and the tab both say it.
    await waitFor(() =>
      expect(screen.getAllByText('In the sick bay')).toHaveLength(2),
    );
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.queryByText('Keeps coming back')).toBeNull();
  });

  it('warns when somebody is still lying in there', async () => {
    sickBay({
      '/clinic/summary': { inSickBay: 1, visits: 0, dosesGiven: 0, repeatVisitors: [] },
    });

    const screen = await open();

    await waitFor(() =>
      expect(styleOf(screen.getByText('1')).color).toBe(
        defaultTheme.status.caution.text,
      ),
    );
  });

  // Three visits in a month is a pattern, not a run of bad luck.
  it('names anybody who keeps coming back', async () => {
    sickBay({
      '/clinic/summary': {
        inSickBay: 0,
        visits: 0,
        dosesGiven: 0,
        repeatVisitors: [
          { id: 'student-2', user: { firstName: 'Eric', lastName: 'Habimana' }, visits: 4 },
        ],
      },
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Keeps coming back')).toBeTruthy(),
    );
    expect(screen.getByText('4 visits in the last month')).toBeTruthy();
  });

  it('says a quiet night is a good night', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Nobody is in the sick bay')).toBeTruthy(),
    );
    expect(screen.getByText('A quiet night is a good night.')).toBeTruthy();
  });

  it('shows a placeholder while the ward loads', async () => {
    sickBay({ '/clinic/visits': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says so, and offers another go, when the read fails', async () => {
    givenApiFails('/clinic/visits');

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('That did not load')).toBeTruthy(),
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('the book of everything recorded', () => {
  it('switches to the whole record', async () => {
    sickBay({ '/clinic/visits': { data: [visit()], meta: { total: 1 } } });
    const screen = await open();
    await waitFor(() => expect(screen.getByText('The book')).toBeTruthy());

    await fireEvent.press(screen.getByText('The book'));

    await waitFor(() =>
      expect(http.get).toHaveBeenCalledWith('/clinic/visits', {
        params: { limit: 30 },
      }),
    );
    await waitFor(() => expect(screen.getByText('Recent visits')).toBeTruthy());
  });

  it('says visits from any device show up in it', async () => {
    const screen = await open();
    await waitFor(() => expect(screen.getByText('The book')).toBeTruthy());

    await fireEvent.press(screen.getByText('The book'));

    await waitFor(() =>
      expect(screen.getByText('Nothing in the book yet')).toBeTruthy(),
    );
    expect(
      screen.getByText('Visits recorded on any device show up here.'),
    ).toBeTruthy();
  });

  // The pattern is about who is in the ward now, not about the archive.
  it('leaves the repeat visitors out of the book view', async () => {
    sickBay({
      '/clinic/summary': {
        inSickBay: 0,
        visits: 0,
        dosesGiven: 0,
        repeatVisitors: [
          { id: 'student-2', user: { firstName: 'Eric', lastName: 'Habimana' }, visits: 4 },
        ],
      },
    });
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Keeps coming back')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('The book'));

    await waitFor(() =>
      expect(screen.queryByText('Keeps coming back')).toBeNull(),
    );
  });
});

/**
 * One visit. The allergy is at the top and unmissable; everything below it is
 * the two things left undone at the end of a shift.
 */
describe('one visit', () => {
  beforeEach(() =>
    sickBay({ '/clinic/visits': { data: [visit()], meta: { total: 1 } } }),
  );

  it('says what the child said, and who saw them', async () => {
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Headache since assembly')).toBeTruthy();
    expect(screen.getByText('Nadine Ingabire')).toBeTruthy();
  });

  it('puts an allergy at the top where it cannot be missed', async () => {
    sickBay({
      '/clinic/visits': {
        data: [visit({ student: { ...visit().student, allergies: 'Penicillin' } })],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Allergic to')).toBeTruthy();
    expect(screen.getByText('Penicillin')).toBeTruthy();
  });

  it('says a blood type was never recorded rather than showing a blank', async () => {
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Not recorded')).toBeTruthy();
  });

  it('shows the findings and treatment when there are any', async () => {
    sickBay({
      '/clinic/visits': {
        data: [
          visit({
            findings: 'Slight fever',
            treatment: 'Rest and water',
            temperature: 38.2,
          }),
        ],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Slight fever')).toBeTruthy();
    expect(screen.getByText('Rest and water')).toBeTruthy();
    expect(screen.getByText('38.2 °C')).toBeTruthy();
  });

  it('leaves out what was never written down', async () => {
    const screen = await open();

    await openVisit(screen);

    expect(screen.queryByText('Found')).toBeNull();
    expect(screen.queryByText('Temperature')).toBeNull();
  });

  it('goes back to the ward', async () => {
    const screen = await open();
    await openVisit(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to the sick bay' }),
    );

    await waitFor(() =>
      expect(screen.getByText('Resting here now')).toBeTruthy(),
    );
  });
});

describe('giving a dose', () => {
  beforeEach(() =>
    sickBay({ '/clinic/visits': { data: [visit()], meta: { total: 1 } } }),
  );

  it('records it against the visit and the child', async () => {
    const screen = await open();
    await openVisit(screen);

    await fireEvent.changeText(screen.getByLabelText('Medicine'), 'Paracetamol');
    await fireEvent.changeText(screen.getByLabelText('Dose'), '500mg');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Record the dose' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/clinic/medication', {
        studentId: 'student-1',
        visitId: 'visit-1',
        medicine: 'Paracetamol',
        dose: '500mg',
      }),
    );
    expect(notify.success).toHaveBeenCalledWith('Dose recorded');
  });

  it('clears the form so the next dose can be typed', async () => {
    const screen = await open();
    await openVisit(screen);
    await fireEvent.changeText(screen.getByLabelText('Medicine'), 'Paracetamol');
    await fireEvent.changeText(screen.getByLabelText('Dose'), '500mg');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Record the dose' }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText('Medicine').props.value).toBe(''),
    );
  });

  it.each([
    ['no medicine', '', '500mg'],
    ['no dose', 'Paracetamol', ''],
    ['only spaces', '   ', '   '],
  ])('will not record with %s', async (_label, medicine, dose) => {
    const screen = await open();
    await openVisit(screen);

    await fireEvent.changeText(screen.getByLabelText('Medicine'), medicine);
    await fireEvent.changeText(screen.getByLabelText('Dose'), dose);

    expect(
      screen.getByRole('button', { name: 'Record the dose' }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  /**
   * The API refuses an unsafe repeat and says how long ago the last one was,
   * which is the whole reason this is worth showing whole.
   */
  it('passes on exactly what the school refused', async () => {
    givenApiFails('/clinic/medication', {
      response: { data: { message: 'Paracetamol was given 40 minutes ago' } },
    });
    const screen = await open();
    await openVisit(screen);
    await fireEvent.changeText(screen.getByLabelText('Medicine'), 'Paracetamol');
    await fireEvent.changeText(screen.getByLabelText('Dose'), '500mg');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Record the dose' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        'Paracetamol was given 40 minutes ago',
      ),
    );
  });

  it('has something to say when the school said nothing', async () => {
    givenApiFails('/clinic/medication', new Error('offline'));
    const screen = await open();
    await openVisit(screen);
    await fireEvent.changeText(screen.getByLabelText('Medicine'), 'Paracetamol');
    await fireEvent.changeText(screen.getByLabelText('Dose'), '500mg');

    await fireEvent.press(
      screen.getByRole('button', { name: 'Record the dose' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not record the dose'),
    );
  });

  it('says the rule out loud before anybody hits it', async () => {
    const screen = await open();

    await openVisit(screen);

    expect(
      screen.getByText(/same medicine twice within four hours is refused/),
    ).toBeTruthy();
  });

  it('says nothing has been given yet when nothing has', async () => {
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Nothing given yet.')).toBeTruthy();
  });

  it('says nothing has been given for a visit with no list at all', async () => {
    sickBay({
      '/clinic/visits': {
        data: [visit({ medications: undefined })],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Nothing given yet.')).toBeTruthy();
  });

  it('lists the doses already given', async () => {
    sickBay({
      '/clinic/visits': {
        data: [
          visit({
            medications: [
              {
                id: 'dose-1',
                medicine: 'Paracetamol',
                dose: '500mg',
                givenAt: '2026-08-24T09:30:00.000Z',
              },
            ],
          }),
        ],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText(/Paracetamol.*500mg/)).toBeTruthy();
  });
});

/**
 * The two things left undone at the end of a shift: telling the family, and
 * sending the child back.
 */
describe('before the shift ends', () => {
  beforeEach(() =>
    sickBay({
      '/clinic/visits': { data: [visit()], meta: { total: 1 } },
      '/clinic/visits/visit-1/parent-notified': { noted: true },
      '/clinic/visits/visit-1/discharge': { discharged: true },
    }),
  );

  it('records that the family was told', async () => {
    const screen = await open();
    await openVisit(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'The family has been told' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith(
        '/clinic/visits/visit-1/parent-notified',
      ),
    );
    expect(notify.success).toHaveBeenCalledWith('Noted');
  });

  it('says so instead once they have been', async () => {
    sickBay({
      '/clinic/visits': {
        data: [visit({ parentNotifiedAt: '2026-08-24T10:00:00.000Z' })],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(screen.getByText('Family told')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'The family has been told' }),
    ).toBeNull();
  });

  it('says so when the school would not record it', async () => {
    givenApiFails('/clinic/visits/visit-1/parent-notified', new Error('x'));
    const screen = await open();
    await openVisit(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'The family has been told' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not record that'),
    );
  });

  it('sends a resting child back to class and returns to the ward', async () => {
    const screen = await open();
    await openVisit(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send back to class' }),
    );

    await waitFor(() =>
      expect(http.post).toHaveBeenCalledWith('/clinic/visits/visit-1/discharge'),
    );
    expect(notify.success).toHaveBeenCalledWith('Sent back');
    await waitFor(() =>
      expect(screen.getByText('Resting here now')).toBeTruthy(),
    );
  });

  it('says so when the discharge would not record', async () => {
    givenApiFails('/clinic/visits/visit-1/discharge', new Error('x'));
    const screen = await open();
    await openVisit(screen);

    await fireEvent.press(
      screen.getByRole('button', { name: 'Send back to class' }),
    );

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith('Could not discharge'),
    );
  });

  it('offers no discharge for somebody who already went back', async () => {
    sickBay({
      '/clinic/visits': {
        data: [visit({ outcome: 'RETURNED_TO_CLASS' })],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(
      screen.queryByRole('button', { name: 'Send back to class' }),
    ).toBeNull();
  });

  it('offers no discharge for somebody already discharged', async () => {
    sickBay({
      '/clinic/visits': {
        data: [visit({ dischargedAt: '2026-08-24T11:00:00.000Z' })],
        meta: { total: 1 },
      },
    });
    const screen = await open();

    await openVisit(screen);

    expect(
      screen.queryByRole('button', { name: 'Send back to class' }),
    ).toBeNull();
  });
});
