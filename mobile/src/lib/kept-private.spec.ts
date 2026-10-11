import { keptPrivate } from './kept-private';

describe('reading kept private out of a refusal', () => {
  it('gives the sentence the API sent', () => {
    expect(
      keptPrivate({ response: { data: { reason: 'KEPT_PRIVATE', message: 'Keza has chosen to keep their results private.' } } }),
    ).toBe('Keza has chosen to keep their results private.');
  });
  it('says something sensible without one', () => {
    expect(keptPrivate({ response: { data: { reason: 'KEPT_PRIVATE' } } })).toMatch(/chosen to keep/);
  });
  it('is nothing for any other refusal', () => {
    expect(keptPrivate({ response: { status: 403, data: {} } })).toBeNull();
    expect(keptPrivate(null)).toBeNull();
  });
});
