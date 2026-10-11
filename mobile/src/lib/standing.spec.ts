import { pauseWords } from './standing';

describe('time out of school, in words', () => {
  it('says until when', () => {
    expect(pauseWords({ kind: 'SUSPENDED', endsOn: '2026-10-15T00:00:00.000Z' })).toBe(
      'Suspended until 15 October',
    );
  });

  it('says just away when the end is not known', () => {
    expect(pauseWords({ kind: 'AWAY', endsOn: null })).toBe('Away');
  });
});
