import { Logger } from '@nestjs/common';
import { maskPhoneNumber, type SmsOtpMessage, type SmsSender } from '@print-karo/auth';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /**
   * Sender identity. Provide EITHER a Messaging Service SID (starts with "MG",
   * recommended — handles number pooling and, in India, DLT sender IDs) OR a
   * purchased Twilio phone number in E.164 as `fromNumber`.
   */
  messagingServiceSid?: string;
  fromNumber?: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Twilio Programmable Messaging (`/Messages`). Better Auth owns the OTP
 * lifecycle — generation, expiry, attempt limits, verification — so Twilio is
 * used purely as a delivery pipe: we render the message copy and POST it.
 *
 * This deliberately does NOT use Twilio Verify. Verify is a self-contained OTP
 * product that generates and checks its own codes; pairing it with Better Auth
 * would require the special "Custom Verification Code" account feature and a
 * second verification call, and returns 60204 ("Custom code not allowed") /
 * 60238 when that feature is off. Programmable Messaging has no such coupling.
 */
export class TwilioSmsSender implements SmsSender {
  readonly name = 'twilio';
  private readonly logger = new Logger(TwilioSmsSender.name);

  constructor(private readonly config: TwilioConfig) {
    if (!config.messagingServiceSid && !config.fromNumber) {
      throw new Error(
        'Twilio SMS sender needs either TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.',
      );
    }
  }

  async sendOtp(message: SmsOtpMessage): Promise<void> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const minutes = Math.max(1, Math.round(message.expiresInSeconds / 60));

    const body = new URLSearchParams({
      To: message.phoneNumber,
      Body: `${message.code} is your Print Karo verification code. It expires in ${minutes} minute${
        minutes === 1 ? '' : 's'
      }. Do not share it with anyone.`,
    });
    if (this.config.messagingServiceSid) {
      body.set('MessagingServiceSid', this.config.messagingServiceSid);
    } else if (this.config.fromNumber) {
      body.set('From', this.config.fromNumber);
    }

    const basic = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
      'base64',
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as {
          code?: number;
          message?: string;
        } | null;
        this.logger.error(
          `Twilio SMS send failed for ${maskPhoneNumber(message.phoneNumber)}: HTTP ${res.status} [${detail?.code ?? '?'}] ${detail?.message ?? ''}`,
        );
        throw new Error('Could not send the verification SMS. Please try again.');
      }
      this.logger.log(`OTP delivered via Twilio SMS to ${maskPhoneNumber(message.phoneNumber)}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error(`Twilio SMS send timed out for ${maskPhoneNumber(message.phoneNumber)}`);
        throw new Error('SMS provider timed out. Please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
