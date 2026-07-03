import { Logger } from '@nestjs/common';
import { maskPhoneNumber, type SmsOtpMessage, type SmsSender } from '@print-karo/auth';

export interface TwilioVerifyConfig {
  accountSid: string;
  authToken: string;
  /** Verify Service SID (starts with "VA"). */
  verifyServiceSid: string;
}

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Twilio Verify v2 with a custom code. Better Auth owns the OTP lifecycle
 * (generation, expiry, attempt limits), so we pass the code via `CustomCode`
 * and Twilio only handles delivery.
 *
 * NOTE: the Custom Verification Code feature must be enabled on the Verify
 * service by Twilio support; without it the API returns error 60238.
 */
export class TwilioVerifySmsSender implements SmsSender {
  readonly name = 'twilio-verify';
  private readonly logger = new Logger(TwilioVerifySmsSender.name);

  constructor(private readonly config: TwilioVerifyConfig) {}

  async sendOtp(message: SmsOtpMessage): Promise<void> {
    const url = `https://verify.twilio.com/v2/Services/${this.config.verifyServiceSid}/Verifications`;
    const body = new URLSearchParams({
      To: message.phoneNumber,
      Channel: 'sms',
    });
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
        if (detail?.code === 60238) {
          this.logger.error(
            'Twilio Verify rejected CustomCode — the Custom Verification Code feature is not enabled on this Verify service. Ask Twilio support to enable it.',
          );
        } else {
          this.logger.error(
            `Twilio Verify send failed for ${maskPhoneNumber(message.phoneNumber)}: HTTP ${res.status} [${detail?.code ?? '?'}] ${detail?.message ?? ''}`,
          );
        }
        throw new Error('Could not send the verification SMS. Please try again.');
      }
      this.logger.log(`OTP delivered via Twilio Verify to ${maskPhoneNumber(message.phoneNumber)}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error(
          `Twilio Verify send timed out for ${maskPhoneNumber(message.phoneNumber)}`,
        );
        throw new Error('SMS provider timed out. Please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
