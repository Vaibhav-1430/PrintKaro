import { Logger } from '@nestjs/common';
import { maskPhoneNumber, type SmsOtpMessage, type SmsSender } from '@print-karo/auth';

export interface Msg91Config {
  /** MSG91 dashboard → API → Auth Key. */
  authKey: string;
  /** DLT-approved OTP template id (must contain the ##OTP## variable). */
  templateId: string;
}

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * MSG91 "Send OTP" API. We generate the code (Better Auth owns OTP lifecycle:
 * expiry, attempt limits, storage) and pass it as the `otp` parameter so MSG91
 * only handles delivery through the DLT-approved template.
 */
export class Msg91SmsSender implements SmsSender {
  readonly name = 'msg91';
  private readonly logger = new Logger(Msg91SmsSender.name);

  constructor(private readonly config: Msg91Config) {}

  async sendOtp(message: SmsOtpMessage): Promise<void> {
    // MSG91 wants the number as bare digits including country code (no +).
    const mobile = message.phoneNumber.replace(/\D/g, '');
    const url = new URL(MSG91_OTP_URL);
    url.searchParams.set('template_id', this.config.templateId);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', message.code);
    url.searchParams.set(
      'otp_expiry',
      String(Math.max(1, Math.round(message.expiresInSeconds / 60))),
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { authkey: this.config.authKey, accept: 'application/json' },
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => null)) as {
        type?: string;
        message?: string;
      } | null;

      if (!res.ok || body?.type !== 'success') {
        this.logger.error(
          `MSG91 send failed for ${maskPhoneNumber(message.phoneNumber)}: HTTP ${res.status} ${body?.message ?? ''}`,
        );
        throw new Error('Could not send the verification SMS. Please try again.');
      }
      this.logger.log(`OTP delivered via MSG91 to ${maskPhoneNumber(message.phoneNumber)}`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger.error(`MSG91 send timed out for ${maskPhoneNumber(message.phoneNumber)}`);
        throw new Error('SMS provider timed out. Please try again.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
