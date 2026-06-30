import { Global, Module } from '@nestjs/common';
import { ConsoleEmailSender, type EmailSender } from '@print-karo/auth';
import { EMAIL_SENDER } from '../auth/auth.tokens';

/**
 * Provides the application's EmailSender. Defaults to the console sender (dev);
 * swap the factory for Resend/SES in production via env without touching callers.
 */
@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (): EmailSender => new ConsoleEmailSender(),
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
