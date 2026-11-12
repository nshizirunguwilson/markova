import { takesJobs } from './who-works';

describe('takesJobs', () => {
  it('does the background work in a one process setup', () => {
    expect(takesJobs({})).toBe(true);
    expect(takesJobs({ NODE_ENV: 'development' })).toBe(true);
    expect(takesJobs({ NODE_ENV: 'production' })).toBe(true);
  });

  it('leaves it to the workers when told it is an API instance', () => {
    expect(takesJobs({ WORKER: '0', NODE_ENV: 'production' })).toBe(false);
  });

  it('always works when it is a worker', () => {
    expect(takesJobs({ WORKER: '1', NODE_ENV: 'production' })).toBe(true);
    expect(takesJobs({ WORKER: '1', NODE_ENV: 'test' })).toBe(true);
  });

  it('stays off under test unless asked', () => {
    expect(takesJobs({ NODE_ENV: 'test' })).toBe(false);
  });
});
