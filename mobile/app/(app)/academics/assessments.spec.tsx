import { waitFor } from '@testing-library/react-native';

import { defaultTheme } from '@/design/theme';
import { givenApi, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import {
  admin,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import Assessments from './assessments';

/**
 * Assessment types.
 *
 * A very short list that carries more weight than its length suggests. These
 * names are matched character for character against the weight table in the
 * grading code, so renaming "CAT 1" to "Cat 1" quietly drops it out of every
 * term calculation in the school.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const kinds = (types: unknown[]) =>
  givenApi({ '/academic/assessment-types': types });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Assessments />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  kinds([]);
});

describe('what is in use', () => {
  it('lists them and counts them', async () => {
    kinds([
      { id: 'cat-1', name: 'CAT 1' },
      { id: 'cat-2', name: 'CAT 2' },
      { id: 'exam', name: 'End of Term' },
    ]);

    const screen = await open();

    await waitFor(() => expect(screen.getByText('3 in use')).toBeTruthy());
    expect(screen.getByText('CAT 1')).toBeTruthy();
    expect(screen.getByText('End of Term')).toBeTruthy();
    expect(screenTitle()).toBe('Assessment types');
  });

  /**
   * Term results cannot be calculated at all without these, which is a worse
   * problem than an empty screen suggests.
   */
  it('says what breaks when there are none', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('None set up')).toBeTruthy());
    expect(
      screen.getByText('Term results cannot be calculated until these exist.'),
    ).toBeTruthy();
  });

  it('shows a placeholder while it reads', async () => {
    givenApi({ '/academic/assessment-types': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});

describe('how they are weighted', () => {
  it('states the weights the grading code actually uses', async () => {
    const screen = await open();

    expect(screen.getAllByText('CAT 20, CAT 20, exam 60')).toHaveLength(2);
    expect(
      screen.getByText('CAT 15, CAT 15, practical 30, exam 40'),
    ).toBeTruthy();
  });
});

/**
 * Exactly the kind of thing somebody tidies up on a Friday without knowing,
 * so the warning is stated in the strongest tone the design system has.
 */
describe('the warning about renaming one', () => {
  it('says a change of capitals is enough to break the calculation', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'These names are matched exactly against the grading rules. Renaming one, even changing its capitals, drops it out of every term calculation in the school.',
      ),
    ).toBeTruthy();
  });

  it('says it in the tone reserved for something going wrong', async () => {
    const screen = await open();

    expect(
      styleOf(screen.getByText(/matched exactly against the grading rules/))
        .color,
    ).toBe(defaultTheme.status.critical.text);
  });
});
