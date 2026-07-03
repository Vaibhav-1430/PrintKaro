/**
 * Pluggable SMS delivery for phone-OTP authentication. Better Auth calls this
 * whenever it needs to deliver a one-time code. The API injects a concrete
 * provider (MSG91, Twilio Verify); in dev the default console sender logs the
 * code so the flow works with zero external accounts.
 */
export interface SmsOtpMessage {
  /** Destination in E.164 format, e.g. +919876543210. */
  phoneNumber: string;
  /** The one-time code to deliver. Never log this in real providers. */
  code: string;
  /** How long the code stays valid, for message copy. */
  expiresInSeconds: number;
}

export interface SmsSender {
  /** Provider identifier for logs/diagnostics ("console", "msg91", "twilio"). */
  readonly name: string;
  /** Deliver the OTP. Throw on failure — Better Auth surfaces the error to the client. */
  sendOtp(message: SmsOtpMessage): Promise<void>;
}

export class ConsoleSmsSender implements SmsSender {
  readonly name = 'console';

  async sendOtp(message: SmsOtpMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `\n[sms:otp] -> ${message.phoneNumber}\n  code: ${message.code} (valid ${Math.round(
        message.expiresInSeconds / 60,
      )}m)\n`,
    );
  }
}

/** Mask a phone number for logs/audit metadata: +919876543210 → +91******3210. */
export function maskPhoneNumber(phoneNumber: string): string {
  return phoneNumber.replace(/^(\+\d{2})\d+(\d{4})$/, '$1******$2');
}
