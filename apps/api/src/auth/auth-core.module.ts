import { Global, Module } from '@nestjs/common';
import { authProvider } from './auth.provider';
import { AUTH_INSTANCE } from './auth.tokens';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';

/**
 * Provides the singleton Better Auth instance (AUTH_INSTANCE) app-wide.
 * Global so SessionService (RBAC) and the auth controllers can inject it
 * without circular module imports.
 */
@Global()
@Module({
  imports: [EmailModule, SmsModule],
  providers: [authProvider],
  exports: [AUTH_INSTANCE],
})
export class AuthCoreModule {}
