import { fireEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { givenApi, resetApi } from '@/test/api-mock';
import { routerState, screenTitle } from '@/test/router-mock';
import {
  parent,
  renderScreen,
  resetHarness,
  signedInAs,
  styleOf,
} from '@/test/harness';

import ChildReport from './reports';

/**
 * The report card.
 *
 * The PDF is rendered on the server through headless Chrome, so this screen
 * does not try to reproduce it: reimplementing an A4 document on a phone
 * gives you a worse version of a thing that already exists and prints
 * correctly. What it does instead is show the parts a parent wants without
 * opening a document, then hand over the real thing.
 */

jest.mock('@/lib/api', () => require('@/test/api-mock').apiMock);

const report = (over: Record<string, unknown> = {}) =>
  givenApi({
    '/academic/years': [{ id: 'year-1', isCurrent: true }],
    '/academic/terms': [{ id: 'term-1', name: 'Term 2', isCurrent: true }],
    '/marks/term-results/student/student-1': {
      result: {
        isPublished: true,
        letterGrade: 'B',
        average: 72.4,
        aggregate: 18,
        aggregateMax: 36,
        rank: 4,
        verification: { code: 'MK-2026-7F3A' },
        ...over,
      },
    },
  });

const open = async () => {
  signedInAs(parent);
  routerState.params = { studentId: 'student-1', name: 'Aline Uwase' };
  return renderScreen(<ChildReport />);
};

beforeEach(() => {
  resetHarness();
  resetApi();
  report();
});

describe('before the school has signed it off', () => {
  it('shows nothing and says why', async () => {
    givenApi({
      '/marks/term-results/student/student-1': { result: { isPublished: false } },
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getByText('Not published yet')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Report cards appear here once the school has checked the results and signed them off.',
      ),
    ).toBeTruthy();
    expect(screenTitle()).toBe('Report card');
  });
});

describe('the parts a parent wants without opening a document', () => {
  it('names the child and the term, and says it is published', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('Aline Uwase')).toBeTruthy());
    expect(screen.getByText('Term 2')).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
  });

  it('shows the grade, the average, the aggregate and the position', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('B')).toBeTruthy());
    expect(screen.getByText('72%')).toBeTruthy();
    expect(screen.getByText('18 of 36')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('shows a dash rather than a blank where a figure is missing', async () => {
    report({
      letterGrade: undefined,
      average: undefined,
      aggregate: undefined,
      rank: undefined,
    });

    const screen = await open();

    await waitFor(() =>
      expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(4),
    );
  });

  it('still names the screen when it does not know whose it is', async () => {
    signedInAs(parent);
    routerState.params = { studentId: 'student-1' };

    const screen = await renderScreen(<ChildReport />);

    await waitFor(() => expect(screen.getByText('Report card')).toBeTruthy());
  });
});

/**
 * The verification code is the number somebody reads out when a school or an
 * employer asks whether a printed card is genuine.
 */
describe('proving a printed copy is genuine', () => {
  it('shows the code in mono, and lets it be copied', async () => {
    const screen = await open();

    await waitFor(() => expect(screen.getByText('MK-2026-7F3A')).toBeTruthy());
    expect(styleOf(screen.getByText('MK-2026-7F3A')).fontFamily).toContain(
      'JetBrains',
    );
    expect(screen.getByText('MK-2026-7F3A').props.selectable).toBe(true);
  });

  it('says what the code is for, and that no account is needed', async () => {
    const screen = await open();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Anyone can check a printed copy against the code above, with no account and no app.',
        ),
      ).toBeTruthy(),
    );
  });

  it('says nothing about verification where there is no code', async () => {
    report({ verification: undefined });

    const screen = await open();

    await waitFor(() => expect(screen.getByText('B')).toBeTruthy());
    expect(screen.queryByText('Verification code')).toBeNull();
    expect(screen.queryByText(/Anyone can check/)).toBeNull();
  });
});

// The real document is a server-rendered PDF, and this hands it over rather
// than trying to redraw it.
describe('the document itself', () => {
  it('opens the real report card in a browser', async () => {
    const screen = await open();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Open the full report card' }),
      ).toBeTruthy(),
    );

    await fireEvent.press(
      screen.getByRole('button', { name: 'Open the full report card' }),
    );

    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
      'http://localhost:3000/api/reports/term/student-1/pdf',
    );
  });
});
