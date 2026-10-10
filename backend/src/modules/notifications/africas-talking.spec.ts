import { AfricasTalkingSms, toInternational } from './africas-talking';

/**
 * The gateway, with the network replaced.
 *
 * What matters is where a message goes (the sandbox must never reach a real
 * phone), what it carries, and that anything short of an accepted message
 * throws, because a throw is the only thing that makes the queue try again.
 */
describe('AfricasTalkingSms', () => {
  const fetchMock = jest.fn();
  const realFetch = global.fetch;

  const reply = (statusCode: number, status = 'Success') => ({
    ok: true,
    status: 201,
    json: () =>
      Promise.resolve({
        SMSMessageData: {
          Message: 'Sent to 1/1',
          Recipients: [{ number: '+250788100000', status, statusCode }],
        },
      }),
  });

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  const sentTo = () => fetchMock.mock.calls[0][0] as string;
  const sentBody = () => fetchMock.mock.calls[0][1].body as URLSearchParams;

  it('sends to the sandbox for the sandbox account', async () => {
    fetchMock.mockResolvedValue(reply(101));
    const sms = new AfricasTalkingSms('sandbox', 'key');
    expect(sms.sandbox).toBe(true);
    await sms.send('+250788100000', 'Hello');
    expect(sentTo()).toBe(
      'https://api.sandbox.africastalking.com/version1/messaging',
    );
  });

  it('sends to the live gateway for any other account', async () => {
    fetchMock.mockResolvedValue(reply(101));
    const sms = new AfricasTalkingSms('markova', 'key');
    expect(sms.sandbox).toBe(false);
    await sms.send('+250788100000', 'Hello');
    expect(sentTo()).toBe('https://api.africastalking.com/version1/messaging');
  });

  it('carries the key, the number and the message', async () => {
    fetchMock.mockResolvedValue(reply(100));
    await new AfricasTalkingSms('sandbox', 'secret-key').send(
      '0788100000',
      'Your code is 123456',
    );
    expect(fetchMock.mock.calls[0][1].headers.apiKey).toBe('secret-key');
    expect(sentBody().get('username')).toBe('sandbox');
    expect(sentBody().get('to')).toBe('+250788100000');
    expect(sentBody().get('message')).toBe('Your code is 123456');
  });

  it('leaves the sender out unless one is registered', async () => {
    fetchMock.mockResolvedValue(reply(101));
    await new AfricasTalkingSms('sandbox', 'key').send('+250788100000', 'Hi');
    expect(sentBody().has('from')).toBe(false);
  });

  it('uses the sender the school registered', async () => {
    fetchMock.mockResolvedValue(reply(101));
    await new AfricasTalkingSms('sandbox', 'key', 'MARKOVA').send(
      '+250788100000',
      'Hi',
    );
    expect(sentBody().get('from')).toBe('MARKOVA');
  });

  it('accepts a queued message', async () => {
    fetchMock.mockResolvedValue(reply(102));
    await expect(
      new AfricasTalkingSms('sandbox', 'key').send('+250788100000', 'Hi'),
    ).resolves.toBeUndefined();
  });

  it('throws when the number is refused', async () => {
    fetchMock.mockResolvedValue(reply(403, 'InvalidPhoneNumber'));
    await expect(
      new AfricasTalkingSms('sandbox', 'key').send('+250788100000', 'Hi'),
    ).rejects.toThrow('InvalidPhoneNumber');
  });

  it('throws when the account has no credit', async () => {
    fetchMock.mockResolvedValue(reply(405, 'InsufficientBalance'));
    await expect(
      new AfricasTalkingSms('markova', 'key').send('+250788100000', 'Hi'),
    ).rejects.toThrow('InsufficientBalance');
  });

  it('throws when the gateway answers with an error status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('The supplied authentication is invalid'),
    });
    await expect(
      new AfricasTalkingSms('sandbox', 'bad').send('+250788100000', 'Hi'),
    ).rejects.toThrow('401');
  });

  it('throws when the reply names no recipient', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({ SMSMessageData: { Message: 'InvalidSenderId' } }),
    });
    await expect(
      new AfricasTalkingSms('sandbox', 'key').send('+250788100000', 'Hi'),
    ).rejects.toThrow('InvalidSenderId');
  });

  it('throws when the network is down', async () => {
    fetchMock.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    await expect(
      new AfricasTalkingSms('sandbox', 'key').send('+250788100000', 'Hi'),
    ).rejects.toThrow('ENOTFOUND');
  });
});

describe('toInternational', () => {
  it.each([
    ['+250788100000', '+250788100000'],
    ['0788100000', '+250788100000'],
    ['250788100000', '+250788100000'],
    ['+250 788 100 000', '+250788100000'],
    ['0788-100-000', '+250788100000'],
  ])('writes %s as %s', (input, expected) => {
    expect(toInternational(input)).toBe(expected);
  });
});
