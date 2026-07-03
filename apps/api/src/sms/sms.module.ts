import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsoleSmsSender, type SmsSender } from '@print-karo/auth';
import { SMS_SENDER } from '../auth/auth.tokens';
import { Msg91SmsSender } from './msg91.sms-sender';
import { TwilioSmsSender } from './twilio.sms-sender';

/**
 * Provides the application's SmsSender (phone-OTP delivery), selected by
 * SMS_PROVIDER. The console sender is dev/test only — env validation refuses
 * to boot production with it, so OTPs can never silently go nowhere.
 */
@Global()
@Module({
  providers: [
    {
      provide: SMS_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SmsSender => {
        const logger = new Logger('SmsModule');
        const provider = config.get<string>('SMS_PROVIDER', 'console');

        switch (provider) {
          case 'msg91':
            return new Msg91SmsSender({
              // Presence is enforced by env.schema.ts at boot.
              authKey: config.getOrThrow<string>('MSG91_AUTH_KEY'),
              templateId: config.getOrThrow<string>('MSG91_TEMPLATE_ID'),
            });
          case 'twilio':
            return new TwilioSmsSender({
              accountSid: config.getOrThrow<string>('TWILIO_ACCOUNT_SID'),
              authToken: config.getOrThrow<string>('TWILIO_AUTH_TOKEN'),
              // Exactly one of these is present (enforced by env.schema.ts).
              messagingServiceSid: config.get<string>('TWILIO_MESSAGING_SERVICE_SID'),
              fromNumber: config.get<string>('TWILIO_FROM_NUMBER'),
            });
          default:
            logger.warn('SMS_PROVIDER=console — OTP codes are logged to stdout (dev only).');
            return new ConsoleSmsSender();
        }
      },
    },
  ],
  exports: [SMS_SENDER],
})
export class SmsModule {}
