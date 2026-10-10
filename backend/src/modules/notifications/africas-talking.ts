/**
 * Africa's Talking, the SMS gateway.
 *
 * Chosen over Twilio because it is local: Rwandan numbers on MTN and Airtel,
 * billed in the region, at a fraction of what an international gateway costs
 * a school sending a notice to every parent.
 *
 * The username decides where messages go. `sandbox` is Africa's Talking's
 * free test account: nothing reaches a real phone, and each message appears
 * in their simulator at https://simulator.africastalking.com instead, under
 * the number it was sent to. Any other username is a live account and real
 * SMS, which costs money. Moving from one to the other is a change of
 * environment variables, not of code.
 *
 * Plain fetch rather than their SDK: one POST is all this needs, and the SDK
 * pulls in a dependency tree for it.
 */

const LIVE = 'https://api.africastalking.com/version1/messaging';
const SANDBOX = 'https://api.sandbox.africastalking.com/version1/messaging';

/** 100 Processed, 101 Sent, 102 Queued. Anything else was not accepted. */
const ACCEPTED = new Set([100, 101, 102]);

type Recipient = { number: string; status: string; statusCode: number };
type Reply = {
  SMSMessageData?: { Message?: string; Recipients?: Recipient[] };
};

export class AfricasTalkingSms {
  readonly sandbox: boolean;
  private readonly endpoint: string;

  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly senderId?: string,
  ) {
    this.sandbox = username === 'sandbox';
    this.endpoint = this.sandbox ? SANDBOX : LIVE;
  }

  /**
   * Sends one message, and throws if it was not accepted.
   *
   * Throwing is the point. The delivery queue retries a job only when it
   * fails, so a gateway error swallowed here would be a code that never
   * arrived and was never tried again.
   */
  async send(phone: string, message: string): Promise<void> {
    const body = new URLSearchParams({
      username: this.username,
      to: toInternational(phone),
      message,
    });
    // A sender ID has to be registered with Africa's Talking before it can be
    // used, and an unregistered one is rejected. Without one, messages go out
    // under their shared short code, which always works.
    if (this.senderId) body.set('from', this.senderId);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        apiKey: this.apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Africa's Talking answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
    }

    const reply = (await response.json()) as Reply;
    const recipient = reply.SMSMessageData?.Recipients?.[0];
    if (!recipient || !ACCEPTED.has(recipient.statusCode)) {
      throw new Error(
        `Africa's Talking did not accept the message: ${
          recipient?.status ??
          reply.SMSMessageData?.Message ??
          'no recipient in reply'
        }`,
      );
    }
  }
}

/**
 * The gateway wants +250..., and people are registered every way a Rwandan
 * number can be written: 0788..., 250788..., +250 788 ...
 */
export function toInternational(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('250')) return `+${digits}`;
  if (digits.startsWith('0')) return `+250${digits.slice(1)}`;
  return `+${digits}`;
}
