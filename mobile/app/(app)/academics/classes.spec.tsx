import { fireEvent, waitFor } from '@testing-library/react-native';

import { givenApi, resetApi } from '@/test/api-mock';
import { screenTitle } from '@/test/router-mock';
import { admin, renderScreen, resetHarness, signedInAs } from '@/test/harness';

import Classes from './classes';

/**
 * Levels, sections and trades.
 *
 * Grouped by level rather than listed flat, because the school is organised
 * that way in everybody's head: Senior 3 has an A and a B, Level 4 has one
 * section per trade. A flat list of forty section names sorted alphabetically
 * would be technically complete and impossible to read.
 *
 * O-Level and A-Level are separated because they behave differently: A-Level
 * sections carry a trade and O-Level ones do not, and mixing them makes the
 * empty trade column look like missing data.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const school = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/class-levels': [
      { id: 'level-3', name: 'Senior 3', order: 3, stage: 'O_LEVEL' },
      { id: 'level-1', name: 'Senior 1', order: 1, stage: 'O_LEVEL' },
      { id: 'level-4', name: 'Level 4', order: 4, stage: 'A_LEVEL' },
    ],
    '/academic/sections': [
      { id: 'section-a', name: 'Senior 3 A', classLevelId: 'level-3' },
      { id: 'section-b', name: 'Senior 3 B', classLevelId: 'level-3' },
      {
        id: 'section-c',
        name: 'Level 4 Carpentry',
        classLevelId: 'level-4',
        trade: { id: 'trade-1', code: 'CAR', name: 'Carpentry' },
      },
    ],
    '/academic/trades': [
      { id: 'trade-1', code: 'CAR', name: 'Carpentry', sector: 'Construction' },
    ],
    ...over,
  });

const open = async () => {
  signedInAs(admin);
  return renderScreen(<Classes />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  school();
});

describe('the O-Level side', () => {
  it('opens there, grouped by level', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3')).toBeTruthy());
    expect(screen.getByText('Senior 3 A')).toBeTruthy();
    expect(screen.getByText('Senior 3 B')).toBeTruthy();
    expect(screenTitle()).toBe('Classes');
  });

  /**
   * The school reads its own levels in order, so Senior 1 comes before Senior
   * 3 whatever order the API returned them in.
   */
  it('puts the levels in the order a school reads them', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 1')).toBeTruthy());
    expect(
      screen
        .getAllByText(/^Senior \d$/)
        .map((el) => el.props.children),
    ).toEqual(['Senior 1', 'Senior 3']);
  });

  it('says so for a level with no sections yet', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('No sections yet')).toBeTruthy());
  });

  // A trade column that is empty for every O-Level row looks like missing
  // data, which is why the two stages are separated at all.
  it('shows no trades at all on this side', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Senior 3 A')).toBeTruthy());
    expect(screen.queryByText('Trades')).toBeNull();
  });
});

describe('the A-Level and TVET side', () => {
  it('shows the levels that belong to it', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('A-Level, TVET'));

    await waitFor(() => expect(screen.getByText('Level 4')).toBeTruthy());
    expect(screen.getByText('Level 4 Carpentry')).toBeTruthy();
    expect(screen.queryByText('Senior 3')).toBeNull();
  });

  it('names the trade a section belongs to', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('A-Level, TVET'));

    await waitFor(() => expect(screen.getAllByText('CAR')).toHaveLength(2));
    expect(screen.getAllByText('Carpentry').length).toBeGreaterThan(0);
  });

  it('lists the trades a school offers, and their sectors', async () => {
    const screen = await open();

    await fireEvent.press(screen.getByText('A-Level, TVET'));

    await waitFor(() => expect(screen.getByText('Trades')).toBeTruthy());
    expect(screen.getByText('Construction')).toBeTruthy();
  });

  it('says nothing about trades for a school that offers none', async () => {
    school({ '/academic/trades': [] });
    const screen = await open();

    await fireEvent.press(screen.getByText('A-Level, TVET'));

    await waitFor(() => expect(screen.getByText('Level 4')).toBeTruthy());
    expect(screen.queryByText('Trades')).toBeNull();
  });

  it('says so when a school runs no A-Level at all', async () => {
    school({
      '/academic/class-levels': [
        { id: 'level-1', name: 'Senior 1', order: 1, stage: 'O_LEVEL' },
      ],
    });
    const screen = await open();

    await fireEvent.press(screen.getByText('A-Level, TVET'));

    await waitFor(() =>
      expect(screen.getByText('Nothing at this stage')).toBeTruthy(),
    );
  });
});

describe('while it reads', () => {
  it('shows a placeholder', async () => {
    givenApi({ '/academic/class-levels': () => new Promise(() => {}) });

    const screen = await open();

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('says where the structure is actually created', async () => {
    const screen = await open();

    expect(
      screen.getByText(
        'Adding levels, sections and trades stays on the web dashboard.',
      ),
    ).toBeTruthy();
  });
});
