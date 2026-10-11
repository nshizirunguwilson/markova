import { listOfNames, talkersOf, watchNotice } from './watching';

const teacher = { userId: 't', user: { firstName: 'Aline', lastName: 'Uwase' } };
const student = { userId: 's', user: { firstName: 'Keza', lastName: 'Habimana' } };
const matron = { userId: 'm', watching: true, user: { firstName: 'Beatrice', lastName: 'Mukamana' } };

describe('a chat somebody watches over', () => {
  it('lists names like a sentence', () => {
    expect(listOfNames([])).toBe('');
    expect(listOfNames(['A', 'B', 'C'])).toBe('A, B and C');
  });

  it('leaves the watcher and the reader out of who is talking', () => {
    expect(talkersOf([teacher, student, matron], 't')).toEqual([student]);
    expect(talkersOf(undefined, 't')).toEqual([]);
  });

  it('names the one watching to the people talking', () => {
    expect(watchNotice([teacher, student, matron], 't')).toMatch(/^Beatrice Mukamana is watching over this chat/);
  });

  it('tells the one watching that everyone can see them', () => {
    expect(watchNotice([teacher, student, matron], 'm')).toMatch(/^You watch over this chat/);
  });

  it('says nothing in a chat nobody watches', () => {
    expect(watchNotice([teacher, student], 't')).toBeNull();
  });
});
