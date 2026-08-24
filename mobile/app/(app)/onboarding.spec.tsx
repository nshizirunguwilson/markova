import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, resetApi } from '@/test/api-mock';
import { router, screenTitle } from '@/test/router-mock';
import {
  admin,
  meterFill,
  renderScreen,
  resetHarness,
  signedInAs,
} from '@/test/harness';
import { defaultTheme } from '@/design/theme';

import Onboarding from './onboarding';

/**
 * Setting a school up for the first time.
 *
 * The old version was an 814 line wizard that walked somebody through eight
 * forms in a fixed order and lost their place if they left. This is a
 * checklist instead, and the difference matters: setup happens over days, by
 * more than one person, in whatever order the information arrives.
 *
 * Nothing here stores progress. Each step is checked by asking whether the
 * thing exists, because a wizard that tracks its own progress separately from
 * reality is a wizard that lies.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const nothingDone = () =>
  givenApi({
    '/school-config/onboarding': { currentStep: 'school', completed: false },
    '/school-config': {},
    '/academic/years': [],
    '/academic/class-levels': [],
    '/academic/subjects': [],
    '/academic/assessment-types': [],
    '/academic/assignments': [],
    '/users': { data: [], total: 0 },
  });

const everythingDone = () =>
  givenApi({
    '/school-config/onboarding': { currentStep: 'done', completed: true },
    '/school-config': {
      school_name: 'Groupe Scolaire Kigali',
      logo_url: 'https://school.rw/logo.png',
    },
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/class-levels': [{ id: 'level-1' }, { id: 'level-2' }],
    '/academic/subjects': [{ id: 'subject-1' }],
    '/academic/assessment-types': [{ id: 'cat-1' }],
    '/academic/assignments': [{ id: 'a1' }],
    '/users': { data: [{ id: 'user-1' }], total: 28 },
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Onboarding />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  nothingDone();
});

describe('the checklist', () => {
  it('lists everything a term needs, in no particular order', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('The checklist')).toBeTruthy());
    for (const step of [
      'Add the logo and stamp',
      'Open an academic year',
      'Create the class levels',
      'Add the subjects',
      'Set the assessment types',
      'Add the teachers',
      'Say who teaches what',
      'Enrol the students',
    ]) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    // The first undone step is also the headline, so it appears twice.
    expect(screen.getAllByText('Name the school')).toHaveLength(2);
  });

  it('leads with whatever is next rather than a step number', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getAllByText('Name the school')).toHaveLength(2),
    );
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screenTitle()).toBe('Setting up');
  });

  it('says setup takes days and more than one person', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Setup happens over days and usually more than one person does it. Do these in any order.',
        ),
      ).toBeTruthy(),
    );
  });

  it('counts how far along it is', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('0 of 9 done')).toBeTruthy(),
    );
  });

  it('opens the screen each step actually needs', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(screen.getByText('Open an academic year')).toBeTruthy(),
    );

    await fireEvent.press(screen.getByText('Open an academic year'));

    expect(router.push).toHaveBeenCalledWith('/(app)/academics/years');
  });

  it('shows a placeholder while it looks', async () => {
    givenApi({ '/school-config': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

/**
 * A school that added subjects on the web sees that ticked here without
 * having told anybody, because each line asks whether the thing exists.
 */
describe('what counts as done', () => {
  it('ticks everything once a school is actually set up', async () => {
    everythingDone();

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByLabelText('9 of 9 done')).toBeTruthy(),
    );
    expect(meterFill(screen).backgroundColor).toBe(
      defaultTheme.status.positive.solid,
    );
  });

  it('says so when there is nothing left to do', async () => {
    everythingDone();

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('The school is set up')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Everything a term needs is in place. Teachers can enter marks and parents can be linked to their children.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Next')).toBeNull();
  });

  it('says what each step already holds rather than only that it is done', async () => {
    everythingDone();

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Groupe Scolaire Kigali')).toBeTruthy(),
    );
    expect(screen.getByText('2 levels')).toBeTruthy();
    expect(screen.getByText('1 subjects')).toBeTruthy();
    expect(screen.getByText('28 on staff')).toBeTruthy();
  });

  /**
   * The assignments read has to ask for the whole school. Scoped to one
   * teacher it never fires, and the step would sit unticked forever.
   */
  it('ticks the teaching loads from the whole school’s assignments', async () => {
    everythingDone();

    const screen = await open();

    await waitFor(() => expect(screen.getByText('1 assignments')).toBeTruthy());
  });

  it('says what a step is for while it is still undone', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Its name, motto and colour')).toBeTruthy(),
    );
    expect(screen.getByText('CAT 1, CAT 2, exam')).toBeTruthy();
    expect(
      screen.getByText('One at a time, or import a spreadsheet'),
    ).toBeTruthy();
  });
});

// A wizard that tracks its own progress separately from reality is a wizard
// that lies, and this one says so out loud.
describe('why nothing is stored as progress', () => {
  it('says each line is checked against what exists', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText(/Nothing here is stored as progress/)).toBeTruthy(),
    );
  });

  it('mentions the school being marked set up, once it has been', async () => {
    everythingDone();

    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(/This school has been marked as set up\./),
      ).toBeTruthy(),
    );
  });
});
