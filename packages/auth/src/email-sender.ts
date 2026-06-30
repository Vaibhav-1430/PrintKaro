/**
 * Pluggable email delivery. Better Auth calls these for verification and
 * password-reset mails. The API injects a concrete sender; in dev the default
 * console sender logs the link so the flow works with zero external accounts.
 */
export interface AuthEmailMessage {
  to: string;
  subject: string;
  text: string;
  url: string;
  kind: 'verify-email' | 'reset-password';
}

export interface EmailSender {
  send(message: AuthEmailMessage): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async send(message: AuthEmailMessage): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(
      `\n[email:${message.kind}] -> ${message.to}\n  subject: ${message.subject}\n  link: ${message.url}\n`,
    );
  }
}
