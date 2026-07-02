/** DI token for the configured Better Auth instance. */
export const AUTH_INSTANCE = Symbol('AUTH_INSTANCE');

/** DI token for the email sender implementation. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/** DI token for the SMS (phone OTP) sender implementation. */
export const SMS_SENDER = Symbol('SMS_SENDER');
