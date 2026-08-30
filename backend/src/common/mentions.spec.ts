import {
  MENTION_REFUSAL,
  mentionsEveryone,
  parseMentions,
  plainText,
  refuseMention,
  whoToNotify,
} from './mentions';

/**
 * Mentioning somebody.
 *
 * A mention is decided when it is written, not when it is read: the composer
 * offers the people actually in the room and choosing one stores their id.
 * What these tests hold is the four failures that decision exists to prevent,
 * each of which shows up in a real school within a week of shipping the
 * naive version.
 */

const ALINE = '11111111-1111-1111-1111-111111111111';
const JEAN = '22222222-2222-2222-2222-222222222222';
const ROSE = '33333333-3333-3333-3333-333333333333';

const at = (id: string, name: string) => `@[${name}](${id})`;

describe('reading a message for who it names', () => {
  it('finds the person behind the name', () => {
    expect(
      parseMentions(`${at(ALINE, 'Aline Uwase')} can you check this`),
    ).toEqual([{ userId: ALINE, display: 'Aline Uwase' }]);
  });

  it('finds several', () => {
    const text = `${at(ALINE, 'Aline')} and ${at(JEAN, 'Jean Bosco')} please`;
    expect(parseMentions(text).map((m) => m.userId)).toEqual([ALINE, JEAN]);
  });

  /**
   * The first of the four. "email me @ 5pm" is not a mention of anybody, and
   * a system that decides mentions by looking for @word says it is.
   */
  it('is not fooled by an at sign in a sentence', () => {
    for (const text of [
      'email me @ 5pm',
      'send it to aline@markova.edu',
      'meet @the gate',
      '@Aline can you check this',
    ]) {
      expect(parseMentions(text)).toEqual([]);
    }
  });

  /**
   * The second and third. Two teachers called Aline make a name ambiguous,
   * and somebody who marries breaks every mention written before. The id is
   * what is stored, so neither happens.
   */
  it('carries the person, not the name they had that day', () => {
    const then = parseMentions(at(ALINE, 'Aline Uwase'));
    const now = parseMentions(at(ALINE, 'Aline Nkurunziza'));
    expect(then[0].userId).toBe(now[0].userId);
  });

  it('names one person once, however often they appear', () => {
    const text = `${at(ALINE, 'Aline')} ${at(ALINE, 'Aline')} please`;
    expect(parseMentions(text)).toHaveLength(1);
  });

  it('reads an id written in either case', () => {
    expect(parseMentions(at(ALINE.toUpperCase(), 'Aline'))[0].userId).toBe(
      ALINE,
    );
  });

  /* The pattern is global. `matchAll` clones it, but a shared global regex is
     a standing trap - `.test` on one advances `lastIndex` and makes every
     other call answer false. Asking twice is what proves it does not. */
  it('gives the same answer every time it is asked', () => {
    const text = `${at(ALINE, 'Aline Uwase')} hello`;
    expect(parseMentions(text)).toEqual(parseMentions(text));
    expect(plainText(text)).toBe(plainText(text));
    expect(mentionsEveryone('@everyone hi')).toBe(
      mentionsEveryone('@everyone hi'),
    );
  });

  it('ignores markup that is not a real id', () => {
    expect(parseMentions('@[Aline](not-a-uuid) hello')).toEqual([]);
  });
});

describe('addressing the whole room', () => {
  it('finds it', () => {
    expect(mentionsEveryone('@everyone please bring your books')).toBe(true);
    expect(mentionsEveryone('reminder for @everyone')).toBe(true);
  });

  // A word that merely starts with it is not it.
  it('is not fooled by a longer word', () => {
    expect(mentionsEveryone('@everyonehere')).toBe(false);
    expect(mentionsEveryone('tell everyone please')).toBe(false);
  });
});

/**
 * What the message reads like where there is nothing to render it: the line
 * under a conversation in the inbox, a push notification, an export. None of
 * those should show a uuid.
 */
describe('the message as a person reads it', () => {
  it('shows the name and hides the id', () => {
    expect(plainText(`${at(ALINE, 'Aline Uwase')} can you check this`)).toBe(
      '@Aline Uwase can you check this',
    );
  });

  it('leaves a message with no mentions alone', () => {
    expect(plainText('bring your books tomorrow')).toBe(
      'bring your books tomorrow',
    );
  });
});

/**
 * Refusing rather than quietly dropping.
 *
 * A mention silently turned into plain text is the failure this whole design
 * exists to prevent: the sender believes somebody was told, and nobody was.
 */
describe('when a mention cannot be sent', () => {
  const room = {
    conversationType: 'GROUP' as const,
    participantIds: [ALINE, JEAN],
    senderIsAdmin: false,
  };

  it('allows one in a group', () => {
    expect(refuseMention(at(ALINE, 'Aline'), room)).toBeNull();
  });

  it('allows one in a broadcast', () => {
    expect(
      refuseMention(at(ALINE, 'Aline'), {
        ...room,
        conversationType: 'BROADCAST',
      }),
    ).toBeNull();
  });

  /**
   * In a conversation between two people there is exactly one person a
   * message could be addressed to, so a mention carries no information and
   * adds a notification for something already being read.
   */
  it('refuses one in a direct message', () => {
    expect(
      refuseMention(at(ALINE, 'Aline'), {
        ...room,
        conversationType: 'ONE_ON_ONE',
      }),
    ).toBe('NOT_A_GROUP');
  });

  /**
   * The fourth failure. Mentioning somebody who is not in the room would
   * notify them about a conversation they cannot open, and tell them a
   * private group exists.
   */
  it('refuses one naming somebody who is not in the room', () => {
    expect(refuseMention(at(ROSE, 'Rose'), room)).toBe('NOT_A_PARTICIPANT');
  });

  /* The most useful thing a class teacher types all term, and the classic way
     to make a system people mute. So it is a permission, not a capability. */
  it('refuses everyone from somebody who does not run the conversation', () => {
    expect(refuseMention('@everyone bring your books', room)).toBe(
      'EVERYONE_NEEDS_ADMIN',
    );
  });

  it('allows it from somebody who does', () => {
    expect(
      refuseMention('@everyone bring your books', {
        ...room,
        senderIsAdmin: true,
      }),
    ).toBeNull();
  });

  // Most messages mention nobody, and none of this should apply to them.
  it('says nothing about a message with no mentions in it', () => {
    expect(refuseMention('bring your books', room)).toBeNull();
    expect(
      refuseMention('bring your books', {
        ...room,
        conversationType: 'ONE_ON_ONE',
      }),
    ).toBeNull();
  });

  it('says which choice to change, for every refusal', () => {
    for (const [reason, text] of Object.entries(MENTION_REFUSAL)) {
      expect(text.length).toBeGreaterThan(30);
      expect(text).not.toContain(reason);
    }
  });
});

/**
 * Who is told. The sender is never notified of their own message, which is
 * the case everybody hits within a minute of shipping a mention feature.
 */
describe('who a message notifies', () => {
  const room = { participantIds: [ALINE, JEAN, ROSE], senderId: ALINE };

  it('tells the person named', () => {
    expect(whoToNotify(at(JEAN, 'Jean'), room)).toEqual([JEAN]);
  });

  it('never tells the sender about their own message', () => {
    expect(whoToNotify(`${at(ALINE, 'me')} ${at(JEAN, 'Jean')}`, room)).toEqual(
      [JEAN],
    );
  });

  it('tells the room when the room is addressed', () => {
    expect(whoToNotify('@everyone please read', room).sort()).toEqual(
      [JEAN, ROSE].sort(),
    );
  });

  it('tells nobody when nobody is named', () => {
    expect(whoToNotify('bring your books', room)).toEqual([]);
  });

  // Somebody who has left the group is not notified about it.
  it('drops a name that is no longer in the room', () => {
    expect(
      whoToNotify(at(ROSE, 'Rose'), {
        participantIds: [ALINE, JEAN],
        senderId: ALINE,
      }),
    ).toEqual([]);
  });

  it('tells one person once, however often they are named', () => {
    expect(
      whoToNotify(`${at(JEAN, 'Jean')} ${at(JEAN, 'Jean')}`, room),
    ).toEqual([JEAN]);
  });
});
